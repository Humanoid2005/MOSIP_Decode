import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boundedPayload,
  parsePayload,
  safeEndpoint,
  sanitize,
} from "../../../services/telemetry/sanitize.js";

test("redacts secret fields at any depth and in any case", () => {
  const result = sanitize({
    Authorization: "Bearer abc",
    nested: [{ access_token: "t", refreshToken: "r", walletPin: "1234" }],
    form: { code: "c", code_verifier: "v", assertion: "a", state: "kept" },
  });
  assert.deepEqual(result, {
    Authorization: "[redacted]",
    nested: [
      {
        access_token: "[redacted]",
        refreshToken: "[redacted]",
        walletPin: "[redacted]",
      },
    ],
    form: {
      code: "[redacted]",
      code_verifier: "[redacted]",
      assertion: "[redacted]",
      state: "kept",
    },
  });
});

test("stops at the depth limit instead of recursing forever", () => {
  let value: unknown = "leaf";
  for (let i = 0; i < 40; i++) value = { child: value };
  assert.match(JSON.stringify(sanitize(value)), /\[depth limit\]/);
});

test("replaces payloads over 32 KB with a truncated preview", () => {
  const result = boundedPayload({ blob: "x".repeat(40000) }) as Record<
    string,
    unknown
  >;
  assert.equal(result.truncated, true);
  assert.equal(String(result.preview).length, 32768);
  assert.deepEqual(boundedPayload({ small: 1 }), { small: 1 });
});

test("parses form, JSON and plain-text bodies", () => {
  assert.deepEqual(
    parsePayload(
      Buffer.from("grant_type=authorization_code&code=abc"),
      "application/x-www-form-urlencoded",
    ),
    { grant_type: "authorization_code", code: "abc" },
  );
  assert.deepEqual(parsePayload(Buffer.from('{"a":1}')), { a: 1 });
  assert.equal(parsePayload(Buffer.from("not json")), "not json");
  assert.equal(parsePayload(Buffer.alloc(0)), null);
});

test("drops query strings and credentials from recorded endpoints", () => {
  assert.equal(
    safeEndpoint("https://user:pw@issuer.test/credential?code=secret#x"),
    "https://issuer.test/credential",
  );
});
