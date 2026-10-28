import assert from "node:assert/strict";
import { test } from "node:test";
import {
  identitySql,
  tunnelOrigin,
} from "../local/mobile/MobileIdentity.mjs";

test("moves exact origin and did:web prefixes only", () => {
  const sql = identitySql(
    "https://inji.127.0.0.1.sslip.io",
    "https://abc-def.trycloudflare.com",
  );
  assert.match(sql, /replace\(did_url, 'https:\/\/inji\.127\.0\.0\.1\.sslip\.io', 'https:\/\/abc-def\.trycloudflare\.com'\)/);
  assert.match(sql, /'did:web:inji\.127\.0\.0\.1\.sslip\.io', 'did:web:abc-def\.trycloudflare\.com'/);
  assert.doesNotMatch(sql, /replace\([^,]+, 'inji\.127/);
  assert.match(sql, /^BEGIN;[\s\S]*COMMIT;\n$/);
});

test("percent-encodes ports in did:web hosts", () => {
  const sql = identitySql("https://inji.test:8443", "https://phone.example");
  assert.match(sql, /'did:web:inji\.test%3A8443', 'did:web:phone\.example'/);
  assert.match(sql, /'https:\/\/inji\.test:8443', 'https:\/\/phone\.example'/);
});

test("keeps templates on one base64 line", () => {
  assert.match(identitySql("https://a.test", "https://b.test"), /E'\\n', ''\)/);
});

test("reads the latest quick-tunnel URL from cloudflared logs", () => {
  const logs = [
    "INF | https://old-name-one.trycloudflare.com |",
    "INF Registered tunnel connection connIndex=0",
    "INF see https://developers.cloudflare.com/tunnel",
    "INF | https://new-name-two.trycloudflare.com |",
  ].join("\n");
  assert.equal(tunnelOrigin(logs), "https://new-name-two.trycloudflare.com");
  assert.equal(tunnelOrigin("no tunnel yet"), undefined);
});
