import { execFileSync } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import {
  Configuration,
  generatedDirectory,
  mobileStateFile,
  readMobileState,
  root,
} from "../../Configuration.mjs";
import { AssetRenderer } from "../../AssetRenderer.mjs";
import { DatabaseRenderer } from "../../DatabaseRenderer.mjs";
import {
  RealmRenderer,
  mobileClientId,
  mobileRedirectUri,
} from "../RealmRenderer.mjs";
import { identitySql, tunnelOrigin } from "./MobileIdentity.mjs";
import { MobileDoctor } from "./MobileDoctor.mjs";

// Everything that reads the public origin from rendered configuration or origin.env.
const originServices = [
  "keycloak",
  "certify",
  "mimoto-service",
  "verify-service",
  "datashare-service",
  "inji-web",
  "playground-server",
];
const credentialScopes = [
  "mock_identity_vc_ldp",
  "mock_identity_vc_sd_jwt",
  "mock_identity_vc_expired",
  "mock_identity_vc_unsupported_did",
];
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

export class MobileMode {
  constructor(log = console.log) {
    this.log = log;
  }

  async start(requestedOrigin) {
    const previous = await Configuration.load();
    let origin = requestedOrigin;
    if (!origin) {
      // Keep a live tunnel so issued cards stay valid. A dropped quick tunnel never
      // gets its name back, so it is recreated for a new name and fresh logs.
      const current = await readMobileState();
      if (current?.tunnel && (await this.reachable(current.origin))) origin = current.origin;
      else {
        this.log("Starting the Cloudflare quick tunnel…");
        this.compose("up", "-d", "--force-recreate", "tunnel");
        origin = await this.waitForTunnel();
      }
    }
    this.log(`Waiting for ${origin} to resolve…`);
    await this.waitForReachable(origin);
    await writeFile(
      mobileStateFile,
      JSON.stringify({ origin, tunnel: !requestedOrigin }, null, 2) + "\n",
    );
    await this.switchIdentity(previous);
    return { origin, checks: await this.doctor() };
  }

  async stop() {
    const previous = await Configuration.load();
    await rm(mobileStateFile, { force: true });
    await this.switchIdentity(previous);
    this.compose("rm", "-sf", "tunnel");
  }

  async status() {
    const state = await readMobileState();
    if (!state) return null;
    const reachable = await this.reachable(state.origin);
    return { ...state, reachable, checks: reachable ? await this.doctor() : [] };
  }

  doctor() {
    return Configuration.load().then((config) => new MobileDoctor(config).run());
  }

  async switchIdentity(previous) {
    const next = await Configuration.load();
    this.log(`Moving the stack identity from ${previous.origin} to ${next.origin}…`);
    await new AssetRenderer(next).render(generatedDirectory);
    await new DatabaseRenderer(next).render(generatedDirectory);
    await new RealmRenderer(next).render(generatedDirectory);
    this.composeWithInput(
      identitySql(previous.origin, next.origin),
      "exec", "-T", "database", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "inji_certify",
    );
    this.updateRealm(previous, next);
    this.log("Restarting services that publish the origin (a few minutes)…");
    this.compose("up", "-d", "--force-recreate", "--wait", "--wait-timeout", "900", ...originServices);
  }

  // Realm imports only run once, so existing clients and scopes are updated in place.
  updateRealm(previous, next) {
    const admin = (...args) =>
      this.compose("exec", "-T", "keycloak", "/opt/keycloak/bin/kcadm.sh", ...args);
    this.compose(
      "exec", "-T", "keycloak", "sh", "-c",
      '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user admin --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"',
    );
    const realm = (...args) => JSON.parse(admin("get", ...args, "-r", "inji"));
    const rebase = (uri) =>
      uri === previous.origin || uri.startsWith(previous.origin + "/")
        ? next.origin + uri.slice(previous.origin.length)
        : uri;
    for (const client of realm("clients", "--fields", "id,clientId,redirectUris")) {
      const redirectUris = (client.redirectUris ?? []).map(rebase);
      if (JSON.stringify(redirectUris) !== JSON.stringify(client.redirectUris ?? []))
        admin("update", `clients/${client.id}`, "-r", "inji", "-s", `redirectUris=${JSON.stringify(redirectUris)}`);
    }
    const audience = next.values.AUTHORIZATION_CREDENTIAL_AUDIENCE;
    const scopes = realm("client-scopes");
    for (const scope of scopes.filter((item) => credentialScopes.includes(item.name)))
      for (const mapper of scope.protocolMappers ?? [])
        if (mapper.protocolMapper === "oidc-audience-mapper" && mapper.config["included.custom.audience"] !== audience)
          this.composeWithInput(
            JSON.stringify({ ...mapper, config: { ...mapper.config, "included.custom.audience": audience } }),
            "exec", "-T", "keycloak", "/opt/keycloak/bin/kcadm.sh", "update",
            `client-scopes/${scope.id}/protocol-mappers/models/${mapper.id}`, "-r", "inji", "-f", "-",
          );
    if (!realm("clients", "-q", `clientId=${mobileClientId}`).length) {
      this.log(`Registering the ${mobileClientId} client used by Inji Mobile…`);
      admin(
        "create", "clients", "-r", "inji",
        "-s", `clientId=${mobileClientId}`, "-s", "enabled=true", "-s", "protocol=openid-connect",
        "-s", "publicClient=true", "-s", "standardFlowEnabled=true", "-s", "directAccessGrantsEnabled=false",
        "-s", `redirectUris=${JSON.stringify([mobileRedirectUri])}`,
        "-s", 'attributes={"pkce.code.challenge.method":"S256"}',
        "-s", `protocolMappers=${JSON.stringify([{ name: "credential-client", protocol: "openid-connect", protocolMapper: "oidc-hardcoded-claim-mapper", config: { "claim.name": "client_id", "claim.value": mobileClientId, "jsonType.label": "String", "access.token.claim": "true", "id.token.claim": "false" } }])}`,
      );
    }
    // Certify rejects tokens without sub, which only the realm's basic scope adds.
    const [client] = realm("clients", "-q", `clientId=${mobileClientId}`);
    for (const scope of scopes) {
      const kind = ["profile", "email", "basic"].includes(scope.name)
        ? "default-client-scopes"
        : credentialScopes.includes(scope.name)
          ? "optional-client-scopes"
          : undefined;
      if (kind) admin("update", `clients/${client.id}/${kind}/${scope.id}`, "-r", "inji");
    }
  }

  async waitForTunnel() {
    for (let attempt = 0; attempt < 60; attempt++) {
      const logs = this.compose("logs", "--no-color", "tunnel");
      const origin = tunnelOrigin(logs);
      if (origin && /Registered tunnel connection/.test(logs)) return origin;
      await pause(2000);
    }
    throw new Error("The tunnel did not report a public URL. Check: docker compose logs tunnel");
  }

  // New quick-tunnel names can take a few seconds to appear in public DNS.
  async waitForReachable(origin) {
    await pause(5000);
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await this.reachable(origin)) return;
      await pause(3000);
    }
    throw new Error(`${origin} is not reachable from this computer.`);
  }

  async reachable(origin) {
    const response = await fetch(origin + "/config/farmer.json", {
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    return Boolean(response?.ok);
  }

  compose(...args) {
    return this.composeWithInput(undefined, ...args);
  }

  composeWithInput(input, ...args) {
    return execFileSync(
      "docker",
      ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.local.yml", "--profile", "mobile", ...args],
      { cwd: root, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 },
    );
  }
}
