import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { test } from "node:test";
import { Configuration } from "../Configuration.mjs";
import { AssetRenderer } from "../AssetRenderer.mjs";
import { RealmRenderer } from "../local/RealmRenderer.mjs";

const base = "https://inji.127.0.0.1.sslip.io";
const local = new Configuration({
  INJI_LOCAL_DEVELOPMENT: "true",
  INJI_PUBLIC_ORIGIN: base,
  AUTHORIZATION_ORIGIN: base,
  AUTHORIZATION_ISSUER_URL: base + "/auth/realms/inji",
  AUTHORIZATION_JWKS_URL: base + "/auth/realms/inji/protocol/openid-connect/certs",
  AUTHORIZATION_TOKEN_URL: base + "/auth/realms/inji/protocol/openid-connect/token",
  AUTHORIZATION_CREDENTIAL_AUDIENCE: base + "/v1/certify/issuance/credential",
  WALLET_CLIENT_ID: "inji-wallet",
  WALLET_CLIENT_ALIAS: "inji-wallet",
  WALLET_REDIRECT_URI: base + "/redirect",
  GOOGLE_OAUTH_CLIENT_SECRET: "secret",
  LOCAL_FARMER_PASSWORD: "secret",
});

async function render(configuration) {
  const output = await mkdtemp(join(tmpdir(), "inji-render-"));
  await new AssetRenderer(configuration).render(output);
  const read = async (file) => parseEnv(await readFile(join(output, file), "utf8"));
  return {
    origin: await read("origin.env"),
    playground: await read("playground.docker.env"),
    trusted: JSON.parse(await readFile(join(output, "config/mimoto-trusted-verifiers.json"), "utf8")),
    verify: await readFile(join(output, "config/verify.properties"), "utf8"),
  };
}

test("origin.env carries the public origin into Compose", async () => {
  const { origin } = await render(local.withOrigin("https://abc.trycloudflare.com"));
  assert.deepEqual(origin, {
    KC_HOSTNAME: "https://abc.trycloudflare.com/auth",
    INJI_VP_SUBMISSION_BASE_URL: "https://abc.trycloudflare.com/v1/verify",
    INJI_VERIFY_REDIRECT_URI: "https://abc.trycloudflare.com",
    MIMOTO_URL: "https://abc.trycloudflare.com/v1/mimoto",
  });
});

test("mobile mode keeps browser wallets off and moves verifier trust", async () => {
  const normal = await render(local);
  assert.equal(normal.playground.INJI_WEB_URL, base);
  assert.equal(normal.playground.INJI_EMBEDDED_WALLET_URL, base + "/playground");
  const mobile = await render(local.withOrigin("https://abc.trycloudflare.com"));
  assert.equal(mobile.playground.INJI_WEB_URL, "");
  assert.equal(mobile.playground.INJI_EMBEDDED_WALLET_URL, "");
  assert.equal(mobile.playground.INJI_ISSUER_URL, "https://abc.trycloudflare.com");
  assert.equal(mobile.playground.CLIENT_ORIGIN, "http://localhost:5173");
  assert.equal(mobile.trusted.verifiers[0].client_id, "did:web:abc.trycloudflare.com:v1:verify");
  assert.match(mobile.verify, /inji\.did\.verify\.uri=did:web:abc\.trycloudflare\.com:v1:verify/);
});

test("new realms register Inji Mobile's public PKCE client", async () => {
  const output = await mkdtemp(join(tmpdir(), "inji-realm-"));
  await mkdir(join(output, "database"));
  await new RealmRenderer(local).render(output);
  const realm = JSON.parse(await readFile(join(output, "keycloak/inji-realm.json"), "utf8"));
  const client = realm.clients.find((item) => item.clientId === "wallet");
  assert.equal(client.publicClient, true);
  assert.deepEqual(client.redirectUris, ["io.mosip.residentapp.inji://oauthredirect"]);
  assert.equal(client.attributes["pkce.code.challenge.method"], "S256");
  assert.ok(client.optionalClientScopes.includes("mock_identity_vc_ldp"));
});
