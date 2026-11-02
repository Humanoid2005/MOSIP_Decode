import assert from "node:assert/strict";
import { test } from "node:test";
import {
  credentialFingerprint,
  matchesCredentialFormat,
} from "../../../services/run-service/credentialFingerprint.js";
// credentialFingerprint() and matchesCredentialFormat() for JSON-LD and
// SD-JWT credentials.

const credential = {
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  type: ["VerifiableCredential", "FarmerCredential"],
  credentialSubject: { fullName: "Demo", id: "did:example:1" },
  proof: { type: "Ed25519Signature2020", proofValue: "z123" },
};

test("JSON-LD fingerprints ignore key order and string encoding", () => {
  const reordered = {
    proof: { proofValue: "z123", type: "Ed25519Signature2020" },
    credentialSubject: { id: "did:example:1", fullName: "Demo" },
    type: ["VerifiableCredential", "FarmerCredential"],
    "@context": ["https://www.w3.org/2018/credentials/v1"],
  };
  assert.equal(
    credentialFingerprint(credential),
    credentialFingerprint(reordered),
  );
  assert.equal(
    credentialFingerprint(credential),
    credentialFingerprint(JSON.stringify(credential)),
  );
});

test("JSON-LD fingerprints change when a claim changes", () => {
  const modified = structuredClone(credential);
  modified.credentialSubject.fullName = "Changed";
  assert.notEqual(
    credentialFingerprint(credential),
    credentialFingerprint(modified),
  );
});

test("SD-JWT fingerprints use only the issuer-signed JWT", () => {
  assert.equal(
    credentialFingerprint("header.payload.sig~disclosureA~disclosureB~"),
    credentialFingerprint("header.payload.sig~disclosureA~kb.jwt.sig"),
  );
});

test("recognises the selected credential format", () => {
  assert.equal(matchesCredentialFormat(credential, "ldp_vc"), true);
  assert.equal(matchesCredentialFormat(credential, "vc+sd-jwt"), false);
  const header = Buffer.from(JSON.stringify({ typ: "vc+sd-jwt" })).toString(
    "base64url",
  );
  assert.equal(
    matchesCredentialFormat(`${header}.e30.sig~`, "vc+sd-jwt"),
    true,
  );
  assert.equal(
    matchesCredentialFormat(`${header}.e30.sig~`, "dc+sd-jwt"),
    false,
  );
});
