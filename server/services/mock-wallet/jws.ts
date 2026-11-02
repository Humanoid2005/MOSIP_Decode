import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import type { HolderKey } from "../../models/WalletSession.js";
import { AppError } from "../errors.js";
// Minimal JOSE helpers for the mock wallet: a per-session P-256 holder key,
// ES256 signing and JWT decoding.
export const base64url = (value: Buffer | string) =>
  Buffer.from(value).toString("base64url");
export const sha256 = (value: string) =>
  createHash("sha256").update(value, "ascii").digest();
// 256 random bits as 43 base64url characters, used for the OAuth state and
// the PKCE code verifier.
export const randomToken = () => base64url(randomBytes(32));
// Generates the holder key for one wallet session. The public JWK goes in the
// OpenID4VCI proof header, so the issuer binds the credential to this key.
export function createHolderKey(): HolderKey {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const { kty, crv, x, y } = publicKey.export({ format: "jwk" });
  return {
    privateKey,
    publicJwk: { kty: kty!, crv: crv!, x: x!, y: y! },
  };
}
// Signs a compact JWS with the holder key. alg is always ES256, overriding any
// value in the header, and the signature uses the raw r||s encoding JOSE
// requires rather than DER.
export function signEs256(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  holder: HolderKey,
): string {
  const input = `${base64url(JSON.stringify({ ...header, alg: "ES256" }))}.${base64url(JSON.stringify(payload))}`;
  const signature = sign("sha256", Buffer.from(input), {
    key: holder.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${input}.${base64url(signature)}`;
}
// Decodes a JWT's header and payload without checking its signature. These
// values come from upstream services, so an undecodable one is a 502.
export function decodeJwt(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
} {
  const [header, payload] = token.split(".");
  try {
    return {
      header: JSON.parse(Buffer.from(header ?? "", "base64url").toString()),
      payload: JSON.parse(Buffer.from(payload ?? "", "base64url").toString()),
    };
  } catch {
    throw new AppError(502, "Received a value that is not a decodable JWT.");
  }
}
