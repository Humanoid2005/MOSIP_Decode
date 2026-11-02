import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../../services/errors.js";
import { OfferService } from "../../../services/run-service/OfferService.js";
import { testRun } from "../../fixtures.js";
// OfferService: authorization code offers for Inji Mobile and re-encoding of
// pasted offers so they survive its query parsing (gap W2).

const offers = new OfferService({} as never);
const run = testRun({
  wallet: "INJI_MOBILE",
  configuration: {
    id: "FarmerCredential",
    name: "Farmer",
    format: "ldp_vc",
    proofTypes: [],
  },
});

// Mirrors inji-vci-client 0.7: split the query on "=" and decode the value.
function parseLikeInjiMobile(uri: string) {
  const [scheme, query] = uri.split("://?");
  const [key, value] = query!.split("=");
  assert.equal(scheme, "openid-credential-offer");
  assert.equal(key, "credential_offer");
  return JSON.parse(decodeURIComponent(value!));
}

test("names only the issuer and credential, so the wallet uses authorization code", () => {
  const { uri, offer } = offers.authorizationCodeOffer(run);
  assert.deepEqual(offer, {
    credential_issuer: "https://issuer.test/v1/certify/issuance",
    credential_configuration_ids: ["FarmerCredential"],
  });
  assert.equal("grants" in offer, false);
  assert.deepEqual(parseLikeInjiMobile(uri), offer);
});

test("survives Inji Mobile's naive query parsing for awkward values", () => {
  const awkward = testRun({
    environment: {
      ...run.environment,
      issuerUrl: "https://issuer.test/a=b&c d",
    },
    configuration: { ...run.configuration, id: "Farmer=Credential&x" },
  });
  const { uri, offer } = offers.authorizationCodeOffer(awkward);
  // Only the separator after credential_offer may remain unencoded.
  assert.equal(uri.split("=").length, 2);
  assert.deepEqual(parseLikeInjiMobile(uri), offer);
});

test("refuses to offer from a non-HTTPS issuer", () => {
  const insecure = testRun({
    environment: { ...run.environment, issuerUrl: "http://issuer.test" },
  });
  assert.throws(
    () => offers.authorizationCodeOffer(insecure),
    (error) => error instanceof AppError && error.status === 409,
  );
});

test("re-encodes pasted offers the same way", async () => {
  const pasted = JSON.stringify({
    credential_issuer: run.environment.issuerUrl,
    credential_configuration_ids: ["FarmerCredential"],
    grants: {
      "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
        "pre-authorized_code": "a=b",
        tx_code: { description: "Enter the code" },
      },
    },
  });
  const { uri } = await offers.resolve(pasted, run);
  assert.deepEqual(parseLikeInjiMobile(uri), JSON.parse(pasted));
});
