import assert from "node:assert/strict";
import { test } from "node:test";
import { Configuration } from "../Configuration.mjs";
import { MobileDoctor } from "../local/mobile/MobileDoctor.mjs";

const origin = "https://abc.trycloudflare.com";
const config = new Configuration({
  INJI_PUBLIC_ORIGIN: origin,
  AUTHORIZATION_ISSUER_URL: origin + "/auth/realms/inji",
});

// A public stack that answers like mobile mode should; overrides break one path.
function stack(overrides = {}) {
  const routes = {
    "/.well-known/openid-credential-issuer": {
      credential_issuer: origin,
      authorization_servers: [origin + "/auth/realms/inji"],
      credential_configurations_supported: { FarmerCredential: {} },
    },
    "/auth/realms/inji/.well-known/oauth-authorization-server": {
      issuer: origin + "/auth/realms/inji",
      grant_types_supported: ["authorization_code"],
      token_endpoint: origin + "/auth/realms/inji/protocol/openid-connect/token",
    },
    "/auth/realms/inji/protocol/openid-connect/auth": '<form id="kc-form-login">',
    "/.well-known/did.json": { id: "did:web:abc.trycloudflare.com" },
    "/v1/verify/did.json": { id: "did:web:abc.trycloudflare.com:v1:verify" },
    "/config/farmer.json": { "@context": {} },
    "/v1/mimoto/verifiers": {
      response: { verifiers: [{ client_id: "did:web:abc.trycloudflare.com:v1:verify" }] },
    },
    ...overrides,
  };
  return async (url) => {
    const body = routes[new URL(url).pathname];
    if (body === undefined) return new Response("not found", { status: 404 });
    return typeof body === "string"
      ? new Response(body, { status: 200 })
      : Response.json(body);
  };
}

const signed = ["did:web:abc.trycloudflare.com", "did:playground:unresolvable-issuer"];
const failures = async (request, dids = signed) =>
  (await new MobileDoctor(config, request, async () => dids).run()).filter(
    (check) => !check.ok,
  );

test("passes a correctly published stack", async () => {
  assert.deepEqual(await failures(stack()), []);
});

test("flags metadata that sends Inji Mobile to the wrong authorization server", async () => {
  const [failure] = await failures(
    stack({
      "/.well-known/openid-credential-issuer": {
        credential_issuer: origin,
        authorization_servers: [origin + "/auth/realms/inji", origin + "/v1/certify"],
      },
    }),
  );
  assert.equal(failure.name, "Issuer metadata");
});

test("flags an authorization server whose issuer differs from the URL used", async () => {
  const [failure] = await failures(
    stack({
      "/auth/realms/inji/.well-known/oauth-authorization-server": {
        issuer: "https://inji.127.0.0.1.sslip.io/auth/realms/inji",
      },
    }),
  );
  assert.equal(failure.name, "Authorization server discovery");
  assert.match(failure.detail, /sslip/);
});

test("flags a stale DID left on the old origin", async () => {
  const [failure] = await failures(
    stack({ "/.well-known/did.json": { id: "did:web:inji.127.0.0.1.sslip.io" } }),
  );
  assert.equal(failure.name, "Issuer DID document");
});

test("flags credentials Certify still signs with the old DID", async () => {
  const [failure] = await failures(stack(), [
    "did:web:abc.trycloudflare.com",
    "did:web:inji.127.0.0.1.sslip.io",
  ]);
  assert.equal(failure.name, "Certify signing DID");
  assert.match(failure.detail, /inji\.127\.0\.0\.1\.sslip\.io/);
});

test("flags local-only paths that leak through the tunnel", async () => {
  const [failure] = await failures(
    stack({ "/auth/admin/master/console/": "<html>admin</html>" }),
  );
  assert.equal(failure.name, "Local-only paths closed");
  assert.match(failure.detail, /\/auth\/admin\/master\/console\/ → 200/);
});

test("flags a missing Inji Mobile client", async () => {
  const [failure] = await failures(
    stack({
      "/auth/realms/inji/protocol/openid-connect/auth": "Client not found",
    }),
  );
  assert.equal(failure.name, "Inji Mobile client");
});
