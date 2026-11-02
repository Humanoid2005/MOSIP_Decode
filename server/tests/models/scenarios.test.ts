import assert from "node:assert/strict";
import { test } from "node:test";
import {
  interoperabilityOutcome,
  qrHandoff,
  scenarioOutcome,
  scenarioUnavailable,
} from "../../models/scenarios.js";
import type { TestRun } from "../../models/dtos.js";
import type { VerificationCheck } from "../../models/verification.js";
import { check, testRun } from "../fixtures.js";

const bindings = [
  "state",
  "definition",
  "nonce",
  "audience",
  "issued-format",
  "descriptor-id",
  "descriptor-path",
  "requested-format",
  "requested-proof",
  "requested-claims",
  "result-correlation",
  "sd-holder-signature",
  "sd-hash",
  "binding-time",
];

function completed(
  overrides: Partial<TestRun>,
  checks: VerificationCheck[],
  upstreamAccepted: boolean,
): TestRun {
  return testRun({
    phase: "COMPLETED",
    verdict: upstreamAccepted ? "VALID" : "INVALID",
    credentialObserved: true,
    credentialMatched: true,
    holderConfirmed: true,
    verification: { version: 1, upstreamAccepted, checks },
    ...overrides,
  });
}

function checks(overrides: Record<string, VerificationCheck["status"]> = {}) {
  return [
    ...["issuer-signature", "expiry", "holder-proof"].map((id) =>
      check(id, overrides[id] ?? "PASS"),
    ),
    check(
      "credential-status",
      overrides["credential-status"] ?? "NOT_APPLICABLE",
    ),
    ...bindings.map((id) => check(id, overrides[id] ?? "PASS")),
  ];
}

test("normal flow passes only with complete matching evidence", () => {
  assert.equal(interoperabilityOutcome(completed({}, checks(), true)), "PASS");
  assert.equal(
    interoperabilityOutcome(
      completed({ credentialMatched: false }, checks(), true),
    ),
    "INCONCLUSIVE",
  );
  assert.equal(
    interoperabilityOutcome(completed({}, checks({ nonce: "FAIL" }), true)),
    "FAIL",
  );
  assert.equal(
    interoperabilityOutcome(
      completed({}, checks({ "sd-hash": "NOT_CHECKED" }), true),
    ),
    "INCONCLUSIVE",
  );
});

test("unfinished and cancelled runs are never scored", () => {
  assert.equal(scenarioOutcome(testRun({ phase: "VERIFYING" })), "PENDING");
  assert.equal(scenarioOutcome(testRun({ phase: "CANCELLED" })), "CANCELLED");
});

test("upstream acceptance of a negative scenario is a failure", () => {
  const run = completed(
    { scenario: "BAD_SIGNATURE", scenarioEvidence: { applied: true } },
    checks(),
    true,
  );
  assert.equal(scenarioOutcome(run), "FAIL");
});

test("a scenario whose mutation was never applied is inconclusive", () => {
  const run = completed(
    { scenario: "BAD_SIGNATURE", scenarioEvidence: { applied: false } },
    checks({ "holder-proof": "FAIL" }),
    false,
  );
  assert.equal(scenarioOutcome(run), "INCONCLUSIVE");
});

test("bad presentation signature passes on the expected holder-proof error", () => {
  const evidence = { applied: true, target: "PRESENTATION_SIGNATURE" as const };
  const failing = checks({ "holder-proof": "FAIL" }).map((item) =>
    item.id === "holder-proof"
      ? { ...item, detail: "ERR_SIGNATURE_VERIFICATION_FAILED" }
      : item,
  );
  assert.equal(
    scenarioOutcome(
      completed(
        { scenario: "BAD_SIGNATURE", scenarioEvidence: evidence },
        failing,
        false,
      ),
    ),
    "PASS",
  );
  assert.equal(
    scenarioOutcome(
      completed(
        { scenario: "BAD_SIGNATURE", scenarioEvidence: evidence },
        checks({ "holder-proof": "FAIL", state: "FAIL" }),
        false,
      ),
    ),
    "INCONCLUSIVE",
  );
});

test("expired credential passes only on an expiry failure with valid signatures", () => {
  const run = (overrides: Record<string, VerificationCheck["status"]>) =>
    completed(
      {
        scenario: "EXPIRED_CREDENTIAL",
        scenarioEvidence: { applied: true },
        verdict: "EXPIRED",
      },
      checks(overrides),
      false,
    );
  assert.equal(scenarioOutcome(run({ expiry: "FAIL" })), "PASS");
  assert.equal(
    scenarioOutcome(run({ expiry: "FAIL", "issuer-signature": "FAIL" })),
    "INCONCLUSIVE",
  );
});

test("wallet matching rejection passes constraint scenarios", () => {
  const run = testRun({
    scenario: "WRONG_TYPE",
    wallet: "INJI_MIMOTO",
    phase: "FAILED",
    verdict: "ERROR",
    credentialObserved: true,
    holderConfirmed: true,
    scenarioEvidence: {
      applied: true,
      stage: "WALLET_MATCHING",
      errorCode: "NO_MATCHING_CREDENTIAL",
      matchingMismatchConfirmed: true,
    },
  });
  assert.equal(scenarioOutcome(run), "PASS");
});

test("scenario availability follows wallet and fixture support", () => {
  assert.equal(
    scenarioUnavailable("WRONG_NONCE", "MOCK_WALLET", "vc+sd-jwt"),
    undefined,
  );
  assert.ok(scenarioUnavailable("WRONG_NONCE", "INJI_MIMOTO", "ldp_vc"));
  assert.equal(
    scenarioUnavailable("BAD_SIGNATURE", "INJI_WEB", "ldp_vc"),
    undefined,
  );
  assert.equal(
    scenarioUnavailable("MODIFIED_CLAIM", "INJI_MOBILE", "ldp_vc"),
    undefined,
  );
  assert.ok(scenarioUnavailable("BAD_SIGNATURE", "INJI_MOBILE", "vc+sd-jwt"));
  assert.ok(
    scenarioUnavailable("EXPIRED_CREDENTIAL", "INJI_MIMOTO", "ldp_vc", false),
  );
  assert.equal(
    scenarioUnavailable("UNSUPPORTED_DID", "INJI_MIMOTO", "ldp_vc", true, true),
    undefined,
  );
});

test("QR policy measures UTF-8 bytes", () => {
  assert.deepEqual(qrHandoff("a".repeat(1999)), { bytes: 1999, fitsQr: true });
  assert.equal(qrHandoff("é".repeat(1000)).fitsQr, false);
});
