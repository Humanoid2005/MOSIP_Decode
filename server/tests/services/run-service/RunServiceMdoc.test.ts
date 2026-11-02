import assert from "node:assert/strict";
import { test } from "node:test";
import type { IssuerAdapter } from "../../../models/contracts.js";
import { InMemoryRunDao } from "../../../models/InMemoryRunDao.js";
import { EnvironmentService } from "../../../services/EnvironmentService.js";
import { OfferService } from "../../../services/run-service/OfferService.js";
import { RunService } from "../../../services/run-service/RunService.js";
import { TelemetryService } from "../../../services/telemetry/TelemetryService.js";
import { testRun } from "../../fixtures.js";
// RunService.start() for mDoc: offered to Inji Mobile, refused for Inji Web
// and the mock wallet.

// A RunService whose issuer advertises only the mDoc configuration.
function service() {
  const dao = new InMemoryRunDao();
  const issuer: IssuerAdapter = {
    discover: async () => ({
      metadata: {},
      configurations: [
        {
          id: "FarmerCredentialMdoc",
          name: "Farmer Credential (mDoc)",
          format: "mso_mdoc",
          proofTypes: ["ES256"],
        },
      ],
    }),
  };
  return new RunService(
    dao,
    new EnvironmentService({
      ...testRun().environment,
      webWalletUrl: "https://wallet.test",
    }),
    issuer,
    new TelemetryService(dao),
    new OfferService({} as never),
  );
}

test("an mDoc run offers the credential to Inji Mobile", async () => {
  const run = await service().start({
    wallet: "INJI_MOBILE",
    configurationId: "FarmerCredentialMdoc",
  });
  assert.equal(run.phase, "ISSUING");
  const offer = JSON.parse(decodeURIComponent(run.offerUri!.split("=")[1]!));
  assert.deepEqual(offer.credential_configuration_ids, [
    "FarmerCredentialMdoc",
  ]);
});

test("an mDoc run cannot start with Inji Web or the mock wallet", async () => {
  await assert.rejects(
    service().start({
      wallet: "INJI_WEB",
      configurationId: "FarmerCredentialMdoc",
    }),
    /no mso_mdoc format handler/,
  );
  await assert.rejects(
    service().start({
      wallet: "MOCK_WALLET",
      configurationId: "FarmerCredentialMdoc",
    }),
    /SD-JWT credentials only/,
  );
});
