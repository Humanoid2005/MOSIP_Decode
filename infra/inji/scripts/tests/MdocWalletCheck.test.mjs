import assert from "node:assert/strict";
import { createHash, createPrivateKey, randomBytes, sign, X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { walletMdocChecks } from "../mobile/MdocWalletCheck.mjs";

// Test-only issuer (C=IN), unrelated to the stack's keys.
const fixture = (name) => readFile(new URL(`fixtures/${name}`, import.meta.url));
const key = createPrivateKey(await fixture("mdoc-test.key"));
const certificate = new X509Certificate(await fixture("mdoc-test.crt")).raw;

const head = (major, length) =>
  length < 24 ? Buffer.from([(major << 5) | length])
    : length < 256 ? Buffer.from([(major << 5) | 24, length])
      : Buffer.from([(major << 5) | 25, length >> 8, length & 255]);
function encode(value) {
  if (typeof value === "number") return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === "string") return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value)]);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (Array.isArray(value)) return Buffer.concat([head(4, value.length), ...value.map(encode)]);
  if (value instanceof Map) return Buffer.concat([head(5, value.size), ...[...value].flatMap(([k, v]) => [encode(k), encode(v)])]);
  return Buffer.concat([head(6, value.tag), encode(value.value)]);
}

// Shaped like Certify 0.14's mso_mdoc output (tagged: true): x5chain as one certificate in the unprotected header.
function mdoc({ country = "IN", chain = certificate, until = "2030-01-01T00:00:00Z", tamper = false, tagged = false } = {}) {
  const docType = "io.mosip.farmer.1.FarmerCredential";
  const items = [["fullName", "Demo Farmer"], ["issuing_country", country]].map(([id, value], index) => ({
    tag: 24,
    value: encode(new Map([["digestID", index], ["random", randomBytes(24)], ["elementIdentifier", id], ["elementValue", value]])),
  }));
  const digests = new Map(items.map((item, index) => [index, createHash("sha256").update(encode(item)).digest()]));
  const mso = new Map([
    ["version", "1.0"], ["digestAlgorithm", "SHA-256"], ["docType", docType],
    ["valueDigests", new Map([["io.mosip.farmer.1", digests]])],
    ["validityInfo", new Map([["validFrom", "2026-01-01T00:00:00Z"], ["validUntil", until]])],
  ]);
  const protectedHeader = encode(new Map([[1, -7]]));
  const payload = encode({ tag: 24, value: encode(mso) });
  const toBeSigned = encode(["Signature1", protectedHeader, Buffer.alloc(0), payload]);
  const signature = sign("sha256", toBeSigned, { key, dsaEncoding: "ieee-p1363" });
  if (tamper) items[0] = { tag: 24, value: encode(new Map([["digestID", 0], ["random", randomBytes(24)], ["elementIdentifier", "fullName"], ["elementValue", "Someone Else"]])) };
  const issuerSigned = new Map([
    ["nameSpaces", new Map([["io.mosip.farmer.1", items]])],
    ["issuerAuth", tagged
      ? { tag: 18, value: [protectedHeader, new Map([[33, chain]]), payload, signature] }
      : [protectedHeader, new Map([[33, chain]]), payload, signature]],
  ]);
  return encode(new Map([["docType", docType], ["issuerSigned", issuerSigned]])).toString("base64url");
}
const now = Date.parse("2026-11-01T00:00:00Z");

test("a well-formed mDoc passes the wallet's storage checks", () => {
  const result = walletMdocChecks(mdoc(), now);
  assert.equal(result.docType, "io.mosip.farmer.1.FarmerCredential");
  assert.match(result.certificate, /C=IN/);
});

test("a tagged COSE_Sign1, as Certify sends it, passes too", () => {
  assert.ok(walletMdocChecks(mdoc({ tagged: true }), now));
});

test("the wallet rejects a country mismatch, a changed element and an expired MSO", () => {
  assert.throws(() => walletMdocChecks(mdoc({ country: "KE" }), now), /issuing_country/);
  assert.throws(() => walletMdocChecks(mdoc({ tamper: true }), now), /value digest/);
  assert.throws(() => walletMdocChecks(mdoc({ until: "2026-06-01T00:00:00Z" }), now), /validUntil/);
});

test("like vc-verifier, the wallet reads element [1] of an x5chain array", () => {
  assert.throws(() => walletMdocChecks(mdoc({ chain: [certificate] }), now), /certificate chain is empty/);
  assert.ok(walletMdocChecks(mdoc({ chain: [Buffer.alloc(0), certificate] }), now));
});
