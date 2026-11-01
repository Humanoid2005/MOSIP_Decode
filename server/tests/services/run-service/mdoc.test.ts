import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeCbor,
  decodeMdoc,
  isMdoc,
} from "../../../services/run-service/mdoc.js";
import { matchesCredentialFormat } from "../../../services/run-service/credentialFingerprint.js";
import { createHolderKey } from "../../../services/mock-wallet/jws.js";
import {
  encodeCbor,
  issueMdoc,
  issueSdJwt,
  type Cbor,
} from "../../credentials.js";

test("CBOR maps, arrays, negative integers and tags decode", () => {
  const value = decodeCbor(
    encodeCbor(
      new Map<Cbor, Cbor>([
        [1, -7],
        ["list", [true, null, { tag: 24, value: Buffer.from([1, 2]) }]],
      ]),
    ),
  ) as Map<unknown, unknown>;
  assert.equal(value.get(1), -7);
  assert.deepEqual(value.get("list"), [
    true,
    null,
    { tag: 24, value: Buffer.from([1, 2]) },
  ]);
  assert.equal(decodeCbor(Buffer.from([0xf9, 0x3c, 0x00])), 1);
});

test("truncated or trailing CBOR is rejected", () => {
  assert.throws(() => decodeCbor(Buffer.from([0x62, 0x61])), /Truncated/);
  assert.throws(() => decodeCbor(Buffer.from([0x01, 0x02])), /Trailing/);
});

test("an issued mDoc decodes to its doc type, elements and MSO", () => {
  const mdoc = decodeMdoc(issueMdoc());
  assert.equal(mdoc.docType, "io.mosip.farmer.1.FarmerCredential");
  assert.equal(mdoc.algorithm, "ES256");
  assert.deepEqual(mdoc.nameSpaces, {
    "io.mosip.farmer.1": { fullName: "Demo Farmer", issuing_country: "IN" },
  });
  assert.equal(
    (mdoc.mso as Record<string, unknown>).docType,
    "io.mosip.farmer.1.FarmerCredential",
  );
  assert.equal(mdoc.certificate, undefined);
});

test("a tagged COSE_Sign1 issuerAuth, as Certify sends it, decodes", () => {
  const mdoc = decodeMdoc(
    issueMdoc(undefined, "io.mosip.farmer.1.FarmerCredential", true),
  );
  assert.equal(mdoc.algorithm, "ES256");
  assert.equal(mdoc.nameSpaces["io.mosip.farmer.1"]?.issuing_country, "IN");
});

test("only an mDoc matches the mso_mdoc format", () => {
  const mdoc = issueMdoc();
  const sdJwt = issueSdJwt(createHolderKey());
  assert.equal(isMdoc(mdoc), true);
  assert.equal(matchesCredentialFormat(mdoc, "mso_mdoc"), true);
  assert.equal(matchesCredentialFormat(sdJwt, "mso_mdoc"), false);
  assert.equal(matchesCredentialFormat({ "@context": [] }, "mso_mdoc"), false);
  assert.equal(matchesCredentialFormat(mdoc, "vc+sd-jwt"), false);
  assert.equal(matchesCredentialFormat(mdoc, "ldp_vc"), false);
  assert.equal(isMdoc("not+base64url"), false);
});
