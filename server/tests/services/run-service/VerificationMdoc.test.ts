import assert from "node:assert/strict";
import { test } from "node:test";
import type { VerifierAdapter } from "../../../models/contracts.js";
import { InMemoryRunDao } from "../../../models/InMemoryRunDao.js";
import { interoperabilityOutcome } from "../../../models/scenarios.js";
import { UpstreamError } from "../../../services/errors.js";
import { VerificationService } from "../../../services/run-service/VerificationService.js";
import { ScenarioService } from "../../../services/scenario-service/ScenarioService.js";
import { TelemetryService } from "../../../services/telemetry/TelemetryService.js";
import { check, testRun } from "../../fixtures.js";

function service(verifier: Partial<VerifierAdapter>, issuedMdoc?: string) {
  const dao = new InMemoryRunDao();
  dao.save(
    testRun({
      wallet: "INJI_MOBILE",
      phase: "HELD",
      holderConfirmed: true,
      credentialObserved: Boolean(issuedMdoc),
      configuration: {
        id: "FarmerCredentialMdoc",
        name: "Farmer Credential (mDoc)",
        format: "mso_mdoc",
        proofTypes: ["ES256"],
      },
      ...(issuedMdoc ? { issuedMdoc } : {}),
    }),
  );
  const telemetry = new TelemetryService(dao);
  return {
    dao,
    verification: new VerificationService(
      dao,
      verifier as VerifierAdapter,
      telemetry,
      new ScenarioService(dao, telemetry, {} as never),
    ),
  };
}

test("an mDoc run checks the held credential directly instead of requesting a presentation", async () => {
  const sent: string[] = [];
  const { verification } = service(
    {
      create: async () => {
        throw new Error("No presentation request is expected for mDoc.");
      },
      checkCredential: async (_run, credential) => {
        sent.push(credential);
        return {
          verdict: "INVALID",
          payload: { allChecksSuccessful: false },
          verification: {
            version: 1,
            upstreamAccepted: false,
            checks: [check("issuer-signature", "FAIL")],
          },
        };
      },
    },
    "mdoc",
  );
  const run = await verification.begin("run-1");
  assert.deepEqual(sent, ["mdoc"]);
  assert.equal(run.phase, "COMPLETED");
  assert.equal(run.verdict, "INVALID");
  assert.equal(run.scenarioEvidence.stage, "VERIFICATION");
  assert.equal(interoperabilityOutcome(run), "FAIL");
});

test("an mDoc the bridge did not observe cannot be sent to the verifier", async () => {
  const { verification } = service({});
  const run = await verification.begin("run-1");
  assert.equal(run.phase, "FAILED");
  assert.equal(run.scenarioEvidence.errorCode, "CREDENTIAL_NOT_OBSERVED");
});

test("a verifier HTTP rejection of the mDoc fails the run with its reason", async () => {
  const { verification } = service(
    {
      checkCredential: async () => {
        throw new UpstreamError(400, "Credential check failed with HTTP 400.");
      },
    },
    "mdoc",
  );
  const run = await verification.begin("run-1");
  assert.equal(run.phase, "FAILED");
  assert.equal(run.scenarioEvidence.stage, "VERIFICATION");
  assert.equal(run.scenarioEvidence.errorCode, "VERIFIER_REJECTED");
});

test("a verifier outage during the mDoc check leaves the run retryable", async () => {
  const { dao, verification } = service(
    {
      checkCredential: async () => {
        throw new UpstreamError(503, "Credential check failed with HTTP 503.");
      },
    },
    "mdoc",
  );
  await assert.rejects(verification.begin("run-1"), UpstreamError);
  const run = dao.get("run-1");
  assert.equal(run.phase, "HELD");
  assert.match(run.error ?? "", /HTTP 503/);
});
