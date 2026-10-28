import { mobileClientId, mobileRedirectUri } from "../RealmRenderer.mjs";

// Replays, over the public origin, the lookups Inji Mobile 0.22 makes before
// and during issuance and presentation, and confirms local-only paths are closed.
export class MobileDoctor {
  constructor(configuration, request = fetch) {
    this.config = configuration;
    this.request = (url, init = {}) =>
      request(url, { redirect: "manual", signal: AbortSignal.timeout(15000), ...init });
  }

  async run() {
    const results = [];
    for (const [name, check] of this.checks()) {
      try {
        results.push({ name, ok: true, detail: await check() });
      } catch (error) {
        results.push({ name, ok: false, detail: error.message });
      }
    }
    return results;
  }

  checks() {
    const { origin, issuerDid, verifierDid, values } = this.config;
    const authorizationServer = values.AUTHORIZATION_ISSUER_URL;
    return [
      ["Issuer metadata", async () => {
        const metadata = await this.json(origin + "/.well-known/openid-credential-issuer");
        expect(metadata.credential_issuer === origin, `credential_issuer is ${metadata.credential_issuer}`);
        expect(
          metadata.authorization_servers?.length === 1 &&
            metadata.authorization_servers[0] === authorizationServer,
          "Inji Mobile uses the single advertised authorization server",
        );
        return Object.keys(metadata.credential_configurations_supported ?? {}).join(", ");
      }],
      ["Authorization server discovery", async () => {
        // Inji Mobile appends the well-known suffix and requires an exact issuer match.
        const metadata = await this.json(authorizationServer + "/.well-known/oauth-authorization-server")
          .catch(() => this.json(authorizationServer + "/.well-known/openid-configuration"));
        expect(metadata.issuer === authorizationServer, `issuer is ${metadata.issuer}`);
        expect(
          !metadata.grant_types_supported || metadata.grant_types_supported.includes("authorization_code"),
          "authorization_code grant is not advertised",
        );
        return metadata.token_endpoint;
      }],
      ["Inji Mobile client", async () => {
        const url = new URL(authorizationServer + "/protocol/openid-connect/auth");
        for (const [key, value] of Object.entries({
          client_id: mobileClientId,
          redirect_uri: mobileRedirectUri,
          response_type: "code",
          scope: "mock_identity_vc_ldp",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
        }))
          url.searchParams.set(key, value);
        const response = await this.request(url);
        const page = await response.text();
        expect(response.ok && /kc-form-login|username/i.test(page), `login page not offered (HTTP ${response.status})`);
        return `${mobileClientId} → ${mobileRedirectUri}`;
      }],
      ["Issuer DID document", async () => {
        const document = await this.json(origin + "/.well-known/did.json");
        expect(document.id === issuerDid, `id is ${document.id}`);
        return issuerDid;
      }],
      ["Verifier DID document", async () => {
        const document = await this.json(origin + "/v1/verify/did.json");
        expect(document.id === verifierDid, `id is ${document.id}`);
        return verifierDid;
      }],
      ["Credential JSON-LD context", async () => {
        const context = await this.json(origin + "/config/farmer.json");
        expect(context["@context"], "missing @context");
        return "reachable";
      }],
      ["Wallet backend", async () => {
        const verifiers = await this.json(origin + "/v1/mimoto/verifiers");
        const listed = JSON.stringify(verifiers).includes(verifierDid);
        expect(listed, "verifier DID is not in Mimoto's trusted verifiers");
        return "trusted verifiers include this verifier";
      }],
      ["Local-only paths closed", async () => {
        const open = [];
        for (const [path, method] of [
          ["/auth/admin/master/console/", "GET"],
          ["/auth/realms/master/", "GET"],
          ["/api/v1/runs", "GET"],
          ["/playground/", "GET"],
          ["/bridge/certify/credential", "POST"],
          ["/v1/certify/pre-authorized-data", "POST"],
          ["/v1/verify/vp-request", "POST"],
          ["/v1/verify/vp-result/x", "GET"],
          ["/v1/mimoto/playground/session", "GET"],
        ]) {
          const response = await this.request(origin + path, { method });
          await response.body?.cancel();
          if (response.status !== 404) open.push(`${method} ${path} → ${response.status}`);
        }
        expect(!open.length, open.join("; "));
        return "admin, API, workbench and offer creation are not public";
      }],
    ];
  }

  async json(url) {
    const response = await this.request(url, { headers: { accept: "application/json" } });
    expect(response.ok, `${new URL(url).pathname} returned HTTP ${response.status}`);
    return response.json();
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}
