import assert from "node:assert/strict";
import { createHash, createPublicKey, verify } from "node:crypto";
import { test } from "node:test";
import { AppError } from "../../../services/errors.js";
import {
  createHolderKey,
  decodeJwt,
  signEs256,
} from "../../../services/mock-wallet/jws.js";
import { presentSdJwt } from "../../../services/mock-wallet/sdJwtPresentation.js";
import { issueSdJwt } from "../../credentials.js";
// The mock wallet's SD-JWT presentation with a Key Binding JWT, and its JWS
// helpers.

test("binds every disclosure to the audience and nonce with a valid KB-JWT", () => {
  const holder = createHolderKey();
  const credential = issueSdJwt(holder);
  const presentation = presentSdJwt(credential, holder, "did:web:v", "n-1");
  const boundary = presentation.lastIndexOf("~");
  const presented = presentation.slice(0, boundary + 1);
  const kbJwt = presentation.slice(boundary + 1);
  assert.equal(presented, credential);
  const { header, payload } = decodeJwt(kbJwt);
  assert.equal(header.typ, "kb+jwt");
  assert.equal(header.alg, "ES256");
  assert.equal(payload.aud, "did:web:v");
  assert.equal(payload.nonce, "n-1");
  assert.equal(
    payload.sd_hash,
    createHash("sha256").update(presented).digest("base64url"),
  );
  const [encodedHeader, encodedPayload, signature] = kbJwt.split(".");
  assert.ok(
    verify(
      "sha256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      {
        key: createPublicKey({ key: holder.publicJwk, format: "jwk" }),
        dsaEncoding: "ieee-p1363",
      },
      Buffer.from(signature!, "base64url"),
    ),
  );
});

test("rejects disclosure digests other than sha-256", () => {
  const holder = createHolderKey();
  const issuerJwt = signEs256({}, { _sd_alg: "sha-512" }, createHolderKey());
  assert.throws(
    () => presentSdJwt(`${issuerJwt}~`, holder, "aud", "nonce"),
    (error) => error instanceof AppError && error.status === 422,
  );
});

test("signEs256 always pins the ES256 algorithm", () => {
  const token = signEs256({ alg: "none" }, {}, createHolderKey());
  assert.equal(decodeJwt(token).header.alg, "ES256");
});

test("decodeJwt reports undecodable values as upstream errors", () => {
  assert.throws(
    () => decodeJwt("not-a-jwt"),
    (error) => error instanceof AppError && error.status === 502,
  );
});
