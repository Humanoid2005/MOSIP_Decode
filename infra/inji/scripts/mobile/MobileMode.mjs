import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Configuration,
  generatedDirectory,
  mobileStateFile,
  readMobileState,
  root,
  validateOrigin,
} from "../Configuration.mjs";
import { AssetRenderer } from "../AssetRenderer.mjs";
import { DatabaseRenderer } from "../DatabaseRenderer.mjs";
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
// Scopes whose audience follows the origin and that Inji Mobile may request.
const credentialScopes = [
  "mock_identity_vc_ldp",
  "mock_identity_vc_sd_jwt",
  "mock_identity_vc_expired",
  "mock_identity_vc_unsupported_did",
  "mock_identity_vc_mdoc",
];
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
// The origin last written to Certify's database and the realm. Switching always
// starts from it, so rerunning start or stop after a failure finishes the move.
const appliedFile = resolve(generatedDirectory, "mobile-applied.json");

// Moves the running stack between its .env origin and a phone-reachable public
// origin for Inji Mobile; see "Inji Mobile mode" in infra/inji/README.md.
export class MobileMode {
  constructor(log = console.log) {
    this.log = log;
  }

  // Publishes the stack on requestedOrigin, or on a Cloudflare quick tunnel
  // when none is given, records it in mobile.json, moves the stack's identity
  // there and returns the readiness checks.
  async start(requestedOrigin) {
    if (requestedOrigin) validateOrigin("--origin", requestedOrigin);
    this.requireStack();
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
    await this.switchIdentity();
    return { origin, checks: await this.doctor() };
  }

  // Removing mobile.json makes Configuration.load() return the .env origin
  // again. The tunnel goes last, once no service publishes its URL.
  async stop() {
    this.requireStack();
    await rm(mobileStateFile, { force: true });
    await this.switchIdentity();
    this.compose("rm", "-sf", "tunnel");
  }

  // An applied origin that differs from the configured one means a start or
  // stop did not finish. Otherwise reports whether the mobile origin answers
  // and, if it does, the readiness checks.
  async status() {
    const state = await readMobileState();
    const config = await Configuration.load();
    const applied = await this.appliedOrigin(config);
    if (applied !== config.origin) return { on: Boolean(state), unfinished: applied };
    if (!state) return { on: false };
    const reachable = await this.reachable(state.origin);
    return { on: true, ...state, reachable, checks: reachable ? await this.doctor() : [] };
  }

  // Runs MobileDoctor against the configuration as it is now.
  async doctor() {
    const config = await Configuration.load();
    return new MobileDoctor(config, fetch, () => this.signingDids()).run();
  }

  // Falls back to the .env origin when no move has been recorded.
  appliedOrigin(config) {
    return readFile(appliedFile, "utf8").then(
      (text) => JSON.parse(text).origin,
      () => config.baseOrigin,
    );
  }

  // Moves everything that carries the public origin to the one
  // Configuration.load() now returns: rendered files, Certify's stored DIDs and
  // template, then the realm. The applied origin is recorded only after both
  // updates succeed, and the services are recreated last so they start with
  // the new configuration.
  async switchIdentity() {
    const next = await Configuration.load();
    const from = await this.appliedOrigin(next);
    this.log(`Moving the stack identity from ${from} to ${next.origin}…`);
    await new AssetRenderer(next).render(generatedDirectory);
    await new DatabaseRenderer(next).render(generatedDirectory);
    await new RealmRenderer(next).render(generatedDirectory);
    this.composeWithInput(
      identitySql(from, next.origin),
      "exec", "-T", "database", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "inji_certify",
    );
    this.updateRealm(from, next);
    if (next.origin === next.baseOrigin) await rm(appliedFile, { force: true });
    else await writeFile(appliedFile, JSON.stringify({ origin: next.origin }) + "\n");
    this.log("Restarting services that publish the origin (a few minutes)…");
    this.compose("up", "-d", "--force-recreate", "--wait", "--wait-timeout", "900", ...originServices);
  }

  // kcadm and psql need both services up; failing here leaves nothing half moved.
  requireStack() {
    const services = this.compose("ps", "--format", "json", "database", "keycloak")
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => JSON.parse(line));
    const healthy = (name) =>
      services.some((item) => item.Service === name && item.Health === "healthy");
    if (!healthy("database") || !healthy("keycloak"))
      throw new Error(
        "Start the stack and wait until it is healthy first: npm start",
      );
  }

  // The DIDs Certify signs with, read from its credential configurations.
  signingDids() {
    return this.compose(
      "exec", "-T", "database", "psql", "-U", "postgres", "-d", "inji_certify", "-At",
      "-c", "select did_url from certify.credential_config",
    ).split("\n").filter(Boolean);
  }

  // Realm imports only run once, so existing clients and scopes are updated in place.
  updateRealm(fromOrigin, next) {
    const admin = (...args) =>
      this.compose("exec", "-T", "keycloak", "/opt/keycloak/bin/kcadm.sh", ...args);
    this.compose(
      "exec", "-T", "keycloak", "sh", "-c",
      '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user admin --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"',
    );
    const realm = (...args) => JSON.parse(admin("get", ...args, "-r", "inji"));
    const rebase = (uri) =>
      uri === fromOrigin || uri.startsWith(fromOrigin + "/")
        ? next.origin + uri.slice(fromOrigin.length)
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

  // Polls the tunnel's log for about two minutes until it shows the URL and a
  // registered connection. A failed QUIC dial means UDP is blocked, so the
  // error suggests the http2 transport.
  async waitForTunnel() {
    let logs = "";
    for (let attempt = 0; attempt < 60; attempt++) {
      logs = this.compose("logs", "--no-color", "tunnel");
      const origin = tunnelOrigin(logs);
      if (origin && /Registered tunnel connection/.test(logs)) return origin;
      await pause(2000);
    }
    throw new Error(
      /failed to dial to edge with quic/.test(logs)
        ? "The tunnel could not reach Cloudflare over QUIC (UDP), which this network appears to block. Retry over TCP: TUNNEL_TRANSPORT_PROTOCOL=http2 node infra/inji/scripts/mobile.mjs start"
        : "The tunnel did not report a public URL. Check: docker compose logs tunnel",
    );
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

  // Fetches a static file that the public listener serves itself, so the
  // result does not depend on the Java services.
  async reachable(origin) {
    const response = await fetch(origin + "/config/farmer.json", {
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    return Boolean(response?.ok);
  }

  compose(...args) {
    return this.composeWithInput(undefined, ...args);
  }

  // Names both Compose files and the mobile profile explicitly, so the tunnel
  // service is available whatever COMPOSE_FILE says. input goes to stdin; the
  // large buffer holds full service logs.
  composeWithInput(input, ...args) {
    return execFileSync(
      "docker",
      ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.local.yml", "--profile", "mobile", ...args],
      { cwd: root, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 },
    );
  }
}
