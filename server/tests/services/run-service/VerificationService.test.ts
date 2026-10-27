import assert from "node:assert/strict";
import { test } from "node:test";
import type { VerifierAdapter } from "../../../models/contracts.js";
import { InMemoryRunDao } from "../../../models/InMemoryRunDao.js";
import { AppError } from "../../../services/errors.js";
import { VerificationService } from "../../../services/run-service/VerificationService.js";
import { ScenarioService } from "../../../services/scenario-service/ScenarioService.js";
import { TelemetryService } from "../../../services/telemetry/TelemetryService.js";
import { testRun } from "../../fixtures.js";

function service(
  verifier: Partial<VerifierAdapter>,
  phase: "HELD" | "VERIFYING",
) {
  const dao = new InMemoryRunDao();
  dao.save(
    testRun({
      phase,
      holderConfirmed: true,
      requestId: "req-1",
      transactionId: "run-1",
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

test("a verifier rejection of the request fails the run", async () => {
  const { dao, verification } = service(
    {
      create: async () => {
        throw new AppError(422, "Unknown definition.");
      },
    },
    "HELD",
  );
  const run = await verification.begin("run-1");
  assert.equal(run.phase, "FAILED");
  assert.equal(run.scenarioEvidence.errorCode, "REQUEST_FAILED");
  assert.equal(dao.get("run-1").error, "Unknown definition.");
});

test("an internal error while requesting leaves the run retryable", async () => {
  const { dao, verification } = service(
    {
      create: async () => {
        throw new TypeError("bug");
      },
    },
    "HELD",
  );
  await assert.rejects(verification.begin("run-1"), TypeError);
  assert.equal(dao.get("run-1").phase, "HELD");
});

test("an internal error while collecting results is retried, not a verdict", async () => {
  const { dao, verification } = service(
    {
      status: async () => "VP_SUBMITTED",
      result: async () => {
        throw new TypeError("bug");
      },
    },
    "VERIFYING",
  );
  await assert.rejects(verification.refresh("run-1"), TypeError);
  const run = dao.get("run-1");
  assert.equal(run.phase, "VERIFYING");
  assert.match(run.error ?? "", /Retrying/);
});

test("an invalid verifier response fails the run with its reason", async () => {
  const { verification } = service(
    {
      status: async () => "VP_SUBMITTED",
      result: async () => {
        throw new AppError(
          502,
          "Verifier result belongs to a different transaction.",
        );
      },
    },
    "VERIFYING",
  );
  const run = await verification.refresh("run-1");
  assert.equal(run.phase, "FAILED");
  assert.equal(run.scenarioEvidence.errorCode, "VERIFIER_RESPONSE_ERROR");
});

test("an expired request is reported as a request failure", async () => {
  const { verification } = service(
    { status: async () => "EXPIRED" },
    "VERIFYING",
  );
  const run = await verification.refresh("run-1");
  assert.equal(run.phase, "FAILED");
  assert.equal(run.scenarioEvidence.errorCode, "REQUEST_EXPIRED");
});
