import assert from "node:assert/strict";
import { test } from "node:test";
import type { IssuerAdapter } from "../../../models/contracts.js";
import { InMemoryRunDao } from "../../../models/InMemoryRunDao.js";
import { EnvironmentService } from "../../../services/EnvironmentService.js";
import { OfferService } from "../../../services/run-service/OfferService.js";
import { RunService } from "../../../services/run-service/RunService.js";
import { TelemetryService } from "../../../services/telemetry/TelemetryService.js";
import { testRun } from "../../fixtures.js";

function service(issuerUrl = "https://issuer.test/v1/certify/issuance") {
  const dao = new InMemoryRunDao();
  const environment = {
    ...testRun().environment,
    issuerUrl,
    webWalletUrl: "https://wallet.test",
  };
  const issuer: IssuerAdapter = {
    discover: async () => ({
      metadata: {},
      configurations: [
        {
          id: "FarmerCredential",
          name: "Farmer",
          format: "ldp_vc",
          proofTypes: [],
        },
      ],
    }),
  };
  return new RunService(
    dao,
    new EnvironmentService(environment),
    issuer,
    new TelemetryService(dao),
    new OfferService({} as never),
  );
}

test("an Inji Mobile run shows an authorization-code offer for the selected credential", async () => {
  const run = await service().start({
    wallet: "INJI_MOBILE",
    configurationId: "FarmerCredential",
  });
  assert.equal(run.phase, "ISSUING");
  assert.match(
    run.offerUri ?? "",
    /^openid-credential-offer:\/\/\?credential_offer=/,
  );
  const offer = JSON.parse(decodeURIComponent(run.offerUri!.split("=")[1]!));
  assert.deepEqual(offer.credential_configuration_ids, ["FarmerCredential"]);
  const event = run.events.find((item) => item.source === "PLAYGROUND");
  assert.match(event?.title ?? "", /Inji Mobile/);
});

test("an Inji Mobile run against a non-HTTPS issuer fails with the reason", async () => {
  const run = await service("http://issuer.test").start({
    wallet: "INJI_MOBILE",
    configurationId: "FarmerCredential",
  });
  assert.equal(run.phase, "FAILED");
  assert.match(run.error ?? "", /HTTPS issuer/);
});

test("other external wallets still start without a generated offer", async () => {
  const run = await service().start({
    wallet: "INJI_WEB",
    configurationId: "FarmerCredential",
  });
  assert.equal(run.offerUri, undefined);
  assert.equal(run.phase, "ISSUING");
});
