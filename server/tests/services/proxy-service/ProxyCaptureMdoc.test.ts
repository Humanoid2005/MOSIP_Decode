import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryRunDao } from "../../../models/InMemoryRunDao.js";
import { ProxyCaptureService } from "../../../services/proxy-service/ProxyCaptureService.js";
import type { RunService } from "../../../services/run-service/RunService.js";
import { TelemetryService } from "../../../services/telemetry/TelemetryService.js";
import { issueMdoc } from "../../credentials.js";
import { testRun } from "../../fixtures.js";

function capture(credential: unknown) {
  const dao = new InMemoryRunDao();
  dao.save(
    testRun({
      wallet: "INJI_MOBILE",
      configuration: {
        id: "FarmerCredentialMdoc",
        name: "Farmer Credential (mDoc)",
        format: "mso_mdoc",
        proofTypes: ["ES256"],
      },
    }),
  );
  new ProxyCaptureService(
    dao,
    {} as RunService,
    new TelemetryService(dao),
  ).capture("run-1", "/credential", {
    source: "PROXY",
    title: "certify: /credential",
    method: "POST",
    endpoint: "https://issuer.test/v1/certify/issuance/credential",
    status: 200,
    durationMs: 1,
    request: {},
    response: { credential },
  });
  return dao.get("run-1");
}

test("an issued mDoc is observed, kept for the verifier and decoded for inspection", () => {
  const credential = issueMdoc();
  const run = capture(credential);
  assert.equal(run.credentialObserved, true);
  assert.equal(run.issuedMdoc, credential);
  assert.deepEqual(run.issuedCredentialFacts, {
    format: "mso_mdoc",
    types: ["io.mosip.farmer.1.FarmerCredential"],
    proof: "ES256",
  });
  assert.equal(run.credentialFingerprints.length, 1);
  const decoded = run.events.at(-1)!;
  assert.equal(decoded.source, "PLAYGROUND");
  assert.match(decoded.title, /mDoc decoded/);
  assert.equal(
    (decoded.response as Record<string, unknown>).docType,
    "io.mosip.farmer.1.FarmerCredential",
  );
});

test("a response that is not an mDoc is not observed for an mDoc run", () => {
  const run = capture("eyJhbGciOiJFUzI1NiJ9.e30.c2ln~");
  assert.equal(run.credentialObserved, false);
  assert.equal(run.issuedMdoc, undefined);
  assert.equal(run.events.length, 1);
});
