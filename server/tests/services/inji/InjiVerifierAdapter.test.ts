import assert from "node:assert/strict";
import { test } from "node:test";
import { InjiVerifierAdapter } from "../../../services/inji/InjiVerifierAdapter.js";
import type { ObservedHttpClient } from "../../../services/telemetry/ObservedHttpClient.js";
import { testRun } from "../../fixtures.js";
// InjiVerifierAdapter.checkCredential(): the direct /v2/vc-verification call
// used for mDoc (gap V4) and how its response is read.

// An adapter over a stub HTTP client that records each call and returns the
// given response.
function adapter(response: unknown, calls: unknown[][] = []) {
  const http = {
    json: async (...args: unknown[]) => {
      calls.push(args);
      return response;
    },
  } as unknown as ObservedHttpClient;
  return new InjiVerifierAdapter(http, {} as never);
}

test("the direct credential check posts the mDoc to Verify's v2 endpoint", async () => {
  const calls: unknown[][] = [];
  await adapter({ allChecksSuccessful: false }, calls).checkCredential(
    testRun(),
    "mdoc",
  );
  assert.equal(
    calls[0]![0],
    "https://verifier.test/v1/verify/v2/vc-verification",
  );
  // The fourth argument of http.json() is the request body.
  assert.deepEqual(calls[0]![3], {
    verifiableCredential: "mdoc",
    includeClaims: false,
    skipStatusChecks: false,
  });
});

test("a failed signature check is an invalid verdict with Verify's error", async () => {
  const result = await adapter({
    allChecksSuccessful: false,
    schemaAndSignatureCheck: {
      valid: false,
      error: { errorCode: "ERR_GENERIC", errorMessage: "Unknown format" },
    },
    expiryCheck: null,
    statusCheck: [],
  }).checkCredential(testRun(), "mdoc");
  assert.equal(result.verdict, "INVALID");
  assert.equal(result.verification.upstreamAccepted, false);
  const signature = result.verification.checks.find(
    (check) => check.id === "issuer-signature",
  );
  assert.equal(signature?.status, "FAIL");
  assert.equal(signature?.detail, "ERR_GENERIC: Unknown format");
  assert.equal(
    result.verification.checks.find((check) => check.id === "expiry")?.status,
    "NOT_CHECKED",
  );
  assert.equal(
    result.verification.checks.find(
      (check) => check.id === "openid4vp-presentation",
    )?.status,
    "NOT_CHECKED",
  );
});

test("a response without an overall result is not interpreted", async () => {
  await assert.rejects(
    adapter({}).checkCredential(testRun(), "mdoc"),
    /no overall credential check result/,
  );
});
