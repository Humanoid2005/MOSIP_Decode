import assert from "node:assert/strict";
import { test } from "node:test";
import { Configuration, validateOrigin } from "../Configuration.mjs";

const local = new Configuration({
  INJI_PUBLIC_ORIGIN: "https://inji.127.0.0.1.sslip.io",
  AUTHORIZATION_ISSUER_URL: "https://inji.127.0.0.1.sslip.io/auth/realms/inji",
  AUTHORIZATION_CREDENTIAL_AUDIENCE:
    "https://inji.127.0.0.1.sslip.io/v1/certify/issuance/credential",
  WALLET_REDIRECT_URI: "https://inji.127.0.0.1.sslip.io/redirect",
  EXTERNAL_URL: "https://inji.127.0.0.1.sslip.io.example.org/x",
  POSTGRES_PASSWORD: "secret",
});

test("rebases every value derived from the .env origin", () => {
  const mobile = local.withOrigin("https://abc.trycloudflare.com");
  assert.equal(mobile.origin, "https://abc.trycloudflare.com");
  assert.equal(mobile.values.AUTHORIZATION_ISSUER_URL, "https://abc.trycloudflare.com/auth/realms/inji");
  assert.equal(mobile.values.WALLET_REDIRECT_URI, "https://abc.trycloudflare.com/redirect");
  assert.equal(mobile.values.EXTERNAL_URL, local.values.EXTERNAL_URL);
  assert.equal(mobile.values.POSTGRES_PASSWORD, "secret");
  assert.equal(mobile.issuerDid, "did:web:abc.trycloudflare.com");
  assert.equal(mobile.verifierDid, "did:web:abc.trycloudflare.com:v1:verify");
  assert.equal(mobile.mobile, true);
  assert.equal(local.mobile, false);
});

test("switching back restores the .env identity", () => {
  const restored = local
    .withOrigin("https://abc.trycloudflare.com")
    .withOrigin("https://inji.127.0.0.1.sslip.io");
  assert.deepEqual(restored.values, local.values);
  assert.equal(restored.mobile, false);
});

test("accepts only HTTPS origins without path, query or trailing slash", () => {
  assert.equal(validateOrigin("x", "https://a.test"), "https://a.test");
  for (const origin of ["http://a.test", "https://a.test/", "https://a.test/p", "https://a.test?q=1", "https://u:p@a.test"])
    assert.throws(() => validateOrigin("x", origin), /HTTPS origin/);
});
