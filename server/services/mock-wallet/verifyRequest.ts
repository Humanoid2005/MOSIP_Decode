import { createPublicKey, verify } from "node:crypto";
import type { TestRun } from "../../models/dtos.js";
import { AppError, object } from "../errors.js";
import { credentialFingerprint } from "../run-service/credentialFingerprint.js";
import { decodeJwt } from "./jws.js";
// Authentication of Inji Verify's signed request object, which the mock wallet
// performs before it shares any credential.

// Decodes base58btc, the encoding behind a "z" multibase key. Leading "1"
// characters stand for leading zero bytes.
function base58(value: string): Buffer {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error("Invalid multibase key");
    number = number * 58n + BigInt(digit);
  }
  const hex = number.toString(16);
  return Buffer.concat([
    Buffer.alloc(value.match(/^1*/)?.[0].length ?? 0),
    Buffer.from(hex.length % 2 ? `0${hex}` : hex, "hex"),
  ]);
}

// Derives the verifier's public API base from its did:web client ID
// (did:web:host:path becomes https://host/path). The mock wallet accepts
// request and response URIs only under this base instead of trusting URLs
// handed to it.
export function verifierPublicBase(run: TestRun): string {
  const did = run.environment.verifierClientId;
  if (!did.startsWith("did:web:"))
    throw new AppError(
      422,
      "The mock wallet currently authenticates did:web verifier requests only.",
    );
  const parts = did.slice(8).split(":").map(decodeURIComponent);
  return `https://${parts[0]}${parts
    .slice(1)
    .map((part) => `/${part}`)
    .join("")}`;
}

// Verifies the request object (an EdDSA "oauth-authz-req+jwt" with no
// critical extensions) against an authentication key in the configured
// verifier's DID document, then checks that it is bound to this run: issuer
// and client ID, state, the nonce and presentation definition the workbench
// recorded, a direct_post response URI under the verifier's base, and an iat
// within the run's lifetime (60 seconds of skew) with any exp still in the
// future. Any failure throws the same 502.
export function verifyRequest(token: string, document: unknown, run: TestRun) {
  try {
    const { header, payload } = decodeJwt(token);
    const doc = object(document);
    if (
      doc.id !== run.environment.verifierClientId ||
      header.alg !== "EdDSA" ||
      header.typ !== "oauth-authz-req+jwt" ||
      header.crit
    )
      throw new Error();
    const methods = Array.isArray(doc.verificationMethod)
      ? doc.verificationMethod.map(object)
      : [];
    const method = methods.find(
      (item) => item.id === header.kid && item.controller === doc.id,
    );
    if (
      !method ||
      !Array.isArray(doc.authentication) ||
      !doc.authentication.includes(header.kid) ||
      typeof method.publicKeyMultibase !== "string" ||
      !method.publicKeyMultibase.startsWith("z")
    )
      throw new Error();
    // An Ed25519 multikey: the 0xed01 multicodec prefix and a 32-byte key.
    const key = base58(method.publicKeyMultibase.slice(1));
    if (key.length !== 34 || key[0] !== 0xed || key[1] !== 0x01)
      throw new Error();
    const parts = token.split(".");
    if (
      parts.length !== 3 ||
      !verify(
        null,
        Buffer.from(`${parts[0]}.${parts[1]}`),
        createPublicKey({
          key: {
            kty: "OKP",
            crv: "Ed25519",
            x: key.subarray(2).toString("base64url"),
          },
          format: "jwk",
        }),
        Buffer.from(parts[2]!, "base64url"),
      )
    )
      throw new Error();
    const expected = run.presentationExpectation;
    const now = Math.floor(Date.now() / 1000);
    if (
      !expected ||
      payload.iss !== doc.id ||
      payload.client_id !== doc.id ||
      payload.state !== run.requestId ||
      payload.nonce !== expected.nonce ||
      payload.response_type !== "vp_token" ||
      payload.response_mode !== "direct_post" ||
      payload.response_uri !==
        `${verifierPublicBase(run)}/vp-submission/direct-post` ||
      typeof payload.iat !== "number" ||
      payload.iat > now + 60 ||
      payload.iat < Math.floor(Date.parse(run.createdAt) / 1000) - 60 ||
      (payload.exp !== undefined &&
        (typeof payload.exp !== "number" || payload.exp <= now)) ||
      credentialFingerprint(payload.presentation_definition) !==
        credentialFingerprint(expected.definition)
    )
      throw new Error();
    return payload;
  } catch {
    throw new AppError(
      502,
      "The signed verifier request failed signature, identity, endpoint, or run binding validation. No credential was shared.",
    );
  }
}
