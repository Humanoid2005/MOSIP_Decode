import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScenarioId } from "../../../models/scenarios.js";
import { scenarioOutcome } from "../../../models/scenarios.js";
import type { VerificationCheck } from "../../../models/verification.js";
import { InMemoryRunDao } from "../../../models/InMemoryRunDao.js";
import {
  createHolderKey,
  decodeJwt,
} from "../../../services/mock-wallet/jws.js";
import { presentSdJwt } from "../../../services/mock-wallet/sdJwtPresentation.js";
import { credentialFingerprint } from "../../../services/run-service/credentialFingerprint.js";
import { presentationChecks } from "../../../services/run-service/PresentationChecks.js";
import { ScenarioService } from "../../../services/scenario-service/ScenarioService.js";
import { TelemetryService } from "../../../services/telemetry/TelemetryService.js";
import { issueSdJwt } from "../../credentials.js";
import { check, testRun, verifierDid } from "../../fixtures.js";

// Mirrors migration 005: the local SD-JWT definition has no format or fields.
const definition = {
  id: "00000000-0000-4000-8000-000000000002",
  input_descriptors: [{ id: "farmer-sd-jwt", constraints: {} }],
};

// Runs the real request mutation, mock-wallet presentation and independent
// checks, then completes the run with the supplied Inji Verify outcome.
function verifiedRun(
  scenario: ScenarioId,
  verifier: {
    accepted: boolean;
    holderProof?: VerificationCheck["status"];
    issuerSignature?: VerificationCheck["status"];
    expiry?: VerificationCheck["status"];
    credentialStatus?: VerificationCheck["status"];
  },
  options: {
    presentedNonce?: string;
    tamperState?: boolean;
    jsonEncoded?: boolean;
  } = {},
) {
  const dao = new InMemoryRunDao();
  const holder = createHolderKey();
  const credential = issueSdJwt(holder);
  const issuer = decodeJwt(credential.split("~")[0]!);
  dao.save(
    testRun({
      scenario,
      phase: "HELD",
      requestId: "req-1",
      issuedCredentialFacts: {
        format: "vc+sd-jwt",
        types: [String(issuer.payload.vct)],
        proof: String(issuer.header.alg),
      },
    }),
  );
  const scenarios = new ScenarioService(
    dao,
    new TelemetryService(dao),
    {} as never,
  );
  const requested = scenarios.definition(dao.get("run-1"), definition);
  scenarios.expect("run-1", "nonce-1", requested);
  const nonce =
    options.presentedNonce ??
    (scenario === "WRONG_NONCE" ? "wrong" : "nonce-1");
  const descriptor = (requested.input_descriptors as { id: string }[])[0]!;
  const presented = presentSdJwt(credential, holder, verifierDid, nonce);
  const { checks, fingerprints } = presentationChecks(dao.get("run-1"), {
    vp_token: options.jsonEncoded ? JSON.stringify(presented) : presented,
    state: options.tamperState ? "req-other" : "req-1",
    presentation_submission: JSON.stringify({
      id: "submission",
      definition_id: requested.id,
      descriptor_map: [{ id: descriptor.id, format: "vc+sd-jwt", path: "$" }],
    }),
  });
  const run = dao.get("run-1");
  if (scenario === "WRONG_NONCE")
    run.scenarioEvidence = { ...run.scenarioEvidence, applied: true };
  return {
    ...run,
    phase: "COMPLETED" as const,
    verdict: verifier.accepted ? ("VALID" as const) : ("INVALID" as const),
    credentialObserved: true,
    credentialMatched: true,
    holderConfirmed: true,
    credentialFingerprints: [credentialFingerprint(credential)],
    submittedFingerprints: fingerprints,
    verification: {
      version: 1 as const,
      upstreamAccepted: verifier.accepted,
      checks: [
        {
          ...check("issuer-signature", verifier.issuerSignature ?? "PASS"),
          source: "INJI_VERIFY" as const,
        },
        {
          ...check("expiry", verifier.expiry ?? "PASS"),
          source: "INJI_VERIFY" as const,
        },
        {
          ...check("holder-proof", verifier.holderProof ?? "PASS"),
          source: "INJI_VERIFY" as const,
        },
        {
          ...check(
            "credential-status",
            verifier.credentialStatus ?? "NOT_APPLICABLE",
          ),
          source: "INJI_VERIFY" as const,
        },
        ...checks,
        check("result-correlation"),
      ],
    },
  };
}

test("wrong nonce passes when the verifier rejects the holder binding", () => {
  assert.equal(
    scenarioOutcome(
      verifiedRun("WRONG_NONCE", { accepted: false, holderProof: "FAIL" }),
    ),
    "PASS",
  );
  assert.equal(
    scenarioOutcome(verifiedRun("WRONG_NONCE", { accepted: false })),
    "PASS",
  );
});

test("wrong nonce is inconclusive when the verifier could not check the holder proof", () => {
  assert.equal(
    scenarioOutcome(
      verifiedRun("WRONG_NONCE", { accepted: false, holderProof: "NOT_CHECKED" }),
    ),
    "INCONCLUSIVE",
  );
});

test("wrong nonce accepted by the verifier is a failure", () => {
  assert.equal(
    scenarioOutcome(verifiedRun("WRONG_NONCE", { accepted: true })),
    "FAIL",
  );
});

test("wrong nonce is inconclusive if the wrong nonce never reached the verifier", () => {
  assert.equal(
    scenarioOutcome(
      verifiedRun(
        "WRONG_NONCE",
        { accepted: false },
        { presentedNonce: "nonce-1" },
      ),
    ),
    "INCONCLUSIVE",
  );
});

for (const scenario of [
  "WRONG_TYPE",
  "FORMAT_MISMATCH",
  "PROOF_MISMATCH",
] as const) {
  test(`${scenario} passes when the verifier rejects the mismatched credential`, () => {
    assert.equal(
      scenarioOutcome(verifiedRun(scenario, { accepted: false })),
      "PASS",
    );
  });
  test(`${scenario} accepted by the verifier is a failure`, () => {
    assert.equal(
      scenarioOutcome(verifiedRun(scenario, { accepted: true })),
      "FAIL",
    );
  });
  test(`${scenario} is inconclusive when another binding or proof fails`, () => {
    assert.equal(
      scenarioOutcome(
        verifiedRun(scenario, { accepted: false }, { tamperState: true }),
      ),
      "INCONCLUSIVE",
    );
    assert.equal(
      scenarioOutcome(
        verifiedRun(scenario, { accepted: false, holderProof: "FAIL" }),
      ),
      "INCONCLUSIVE",
    );
    assert.equal(
      scenarioOutcome(
        verifiedRun(scenario, { accepted: false, issuerSignature: "FAIL" }),
      ),
      "INCONCLUSIVE",
    );
  });
  test(`${scenario} is inconclusive when the verifier left credential checks undone`, () => {
    for (const verifier of [
      { credentialStatus: "NOT_CHECKED" },
      { expiry: "NOT_CHECKED" },
      { holderProof: "NOT_CHECKED" },
    ] as const)
      assert.equal(
        scenarioOutcome(verifiedRun(scenario, { accepted: false, ...verifier })),
        "INCONCLUSIVE",
      );
  });
}

test("a mismatch scenario needs confirmation that the issued credential differs", () => {
  const run = verifiedRun("WRONG_TYPE", { accepted: false });
  run.scenarioEvidence = {
    ...run.scenarioEvidence,
    matchingMismatchConfirmed: false,
  };
  assert.equal(scenarioOutcome(run), "INCONCLUSIVE");
});

test("the normal flow still passes with a real presentation", () => {
  assert.equal(
    scenarioOutcome(verifiedRun("NONE", { accepted: true })),
    "PASS",
  );
});

test("a JSON-encoded SD-JWT vp_token, as Inji Mobile sends it, passes and matches", () => {
  const run = verifiedRun("NONE", { accepted: true }, { jsonEncoded: true });
  assert.equal(scenarioOutcome(run), "PASS");
  assert.deepEqual(run.submittedFingerprints, run.credentialFingerprints);
});
