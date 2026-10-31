import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../../services/errors.js";
import {
  verifierPublicBase,
  verifyRequest,
} from "../../../services/mock-wallet/verifyRequest.js";
import { verifierIdentity } from "../../credentials.js";
import { testRun, verifierDid } from "../../fixtures.js";

const definition = {
  id: "farmer-sd-jwt",
  input_descriptors: [{ id: "farmer", format: { "vc+sd-jwt": {} } }],
};
const run = testRun({
  phase: "VERIFYING",
  requestId: "req-1",
  presentationExpectation: { nonce: "nonce-1", definition },
});
const payload = () => ({
  iss: verifierDid,
  client_id: verifierDid,
  state: "req-1",
  nonce: "nonce-1",
  response_type: "vp_token",
  response_mode: "direct_post",
  response_uri: "https://verifier.test/v1/verify/vp-submission/direct-post",
  iat: Math.floor(Date.now() / 1000),
  presentation_definition: definition,
});
const rejected = (error: unknown) =>
  error instanceof AppError && error.status === 502;

test("derives the verifier API base from its did:web identifier", () => {
  assert.equal(verifierPublicBase(run), "https://verifier.test/v1/verify");
});

test("accepts a correctly signed request bound to this run", () => {
  const { document, signRequest } = verifierIdentity();
  assert.equal(
    verifyRequest(signRequest(payload()), document, run).state,
    "req-1",
  );
});

test("rejects a request signed by another key", () => {
  const { signRequest } = verifierIdentity();
  const { document } = verifierIdentity();
  assert.throws(
    () => verifyRequest(signRequest(payload()), document, run),
    rejected,
  );
});

test("rejects unsigned or algorithm-substituted requests", () => {
  const { document, signRequest } = verifierIdentity();
  const [header, body] = signRequest(payload()).split(".");
  assert.throws(
    () => verifyRequest(`${header}.${body}.`, document, run),
    rejected,
  );
  assert.throws(
    () => verifyRequest(signRequest(payload(), { alg: "none" }), document, run),
    rejected,
  );
  assert.throws(
    () => verifyRequest(signRequest(payload(), { crit: ["x"] }), document, run),
    rejected,
  );
});

for (const [field, value] of [
  ["client_id", "did:web:attacker.test"],
  ["state", "req-other"],
  ["nonce", "nonce-other"],
  ["response_uri", "https://attacker.test/vp-submission/direct-post"],
  ["iat", Math.floor(Date.now() / 1000) + 3600],
  ["exp", Math.floor(Date.now() / 1000) - 1],
  ["presentation_definition", { ...definition, id: "other" }],
] as const)
  test(`rejects a request with a mismatched ${field}`, () => {
    const { document, signRequest } = verifierIdentity();
    assert.throws(
      () =>
        verifyRequest(
          signRequest({ ...payload(), [field]: value }),
          document,
          run,
        ),
      rejected,
    );
  });
