import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";
import type { HolderKey } from "../models/WalletSession.js";
import {
  base64url,
  createHolderKey,
  signEs256,
} from "../services/mock-wallet/jws.js";
import { verifierDid } from "./fixtures.js";

export function issueSdJwt(
  holder: HolderKey,
  claims: Record<string, unknown> = {
    fullName: "Demo Farmer",
    farmerID: "DEMO-1",
  },
): string {
  const disclosures = Object.entries(claims).map(([name, value]) =>
    base64url(JSON.stringify([base64url(randomBytes(16)), name, value])),
  );
  const payload = {
    iss: "https://issuer.test/v1/certify/issuance",
    vct: "FarmerCredential",
    _sd_alg: "sha-256",
    _sd: disclosures.map((item) =>
      createHash("sha256").update(item).digest("base64url"),
    ),
    cnf: { jwk: holder.publicJwk },
  };
  const issuer = createHolderKey();
  return `${signEs256({ typ: "vc+sd-jwt" }, payload, issuer)}~${disclosures.join("~")}~`;
}

function base58(bytes: Buffer): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = BigInt(`0x${bytes.toString("hex")}`);
  let encoded = "";
  while (number > 0n) {
    encoded = alphabet[Number(number % 58n)] + encoded;
    number /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return encoded;
}

export function verifierIdentity() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  const kid = `${verifierDid}#key-0`;
  const document = {
    id: verifierDid,
    verificationMethod: [
      {
        id: kid,
        type: "Ed25519VerificationKey2020",
        controller: verifierDid,
        publicKeyMultibase: `z${base58(Buffer.concat([Buffer.from([0xed, 0x01]), raw]))}`,
      },
    ],
    authentication: [kid],
  };
  const signRequest = (
    payload: Record<string, unknown>,
    header: Record<string, unknown> = {},
  ) => {
    const input = `${base64url(JSON.stringify({ alg: "EdDSA", typ: "oauth-authz-req+jwt", kid, ...header }))}.${base64url(JSON.stringify(payload))}`;
    return `${input}.${base64url(sign(null, Buffer.from(input), privateKey))}`;
  };
  return { document, signRequest };
}
