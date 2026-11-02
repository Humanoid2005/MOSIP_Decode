import assert from "node:assert/strict";
import { test } from "node:test";
import { phoneReachability } from "../../models/mobile.js";
// phoneReachability(): which issuer origins a phone running Inji Mobile can
// reach and trust.

test("public HTTPS origins are reachable from a phone", () => {
  for (const origin of [
    "https://abc-def.trycloudflare.com",
    "https://inji.example.org",
    "https://8.8.8.8.sslip.io",
  ])
    assert.deepEqual(phoneReachability(origin), { reachable: true }, origin);
});

test("loopback, private and local names are not", () => {
  for (const origin of [
    "https://inji.127.0.0.1.sslip.io",
    "https://inji.192-168-1-14.sslip.io",
    "https://10.0.0.5.nip.io",
    "https://172.20.1.2",
    "https://localhost",
    "https://inji.local",
    "https://wallet.internal",
  ]) {
    const result = phoneReachability(origin);
    assert.equal(result.reachable, false, origin);
    assert.match(result.reason ?? "", /only resolves on this computer/);
  }
});

test("plain HTTP and missing origins are rejected with a reason", () => {
  assert.match(
    phoneReachability("http://abc.trycloudflare.com").reason ?? "",
    /HTTPS/,
  );
  assert.equal(phoneReachability("").reachable, false);
});
