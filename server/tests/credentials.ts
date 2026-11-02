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
// Synthetic credentials, verifier identities and a small CBOR encoder for
// tests.

// Issues an SD-JWT with one disclosure per claim, bound to the holder through
// cnf.jwk and signed by a throwaway issuer key. Like an issuer's response, it
// ends in "~" with no Key Binding JWT.
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

// Base58 (Bitcoin alphabet) for the multibase key in the verifier's DID
// document.
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

// A new Ed25519 verifier key with its did:web document, and a signer for
// OpenID4VP request objects under that key. Each call makes a different key,
// so two identities can model a request signed by the wrong key.
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

// Values encodeCbor() accepts; { tag, value } is a tagged item.
export type Cbor =
  | number
  | string
  | boolean
  | null
  | Buffer
  | Cbor[]
  | Map<Cbor, Cbor>
  | { tag: number; value: Cbor };
// Major type and length header; lengths up to 32 bits.
function cborHead(major: number, length: number): Buffer {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 256) return Buffer.from([(major << 5) | 24, length]);
  const head = Buffer.alloc(5);
  head[0] = (major << 5) | 26;
  head.writeUInt32BE(length, 1);
  return head;
}
// Minimal definite-length CBOR encoder, enough to build mDoc fixtures.
export function encodeCbor(value: Cbor): Buffer {
  if (typeof value === "number")
    return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
  if (typeof value === "string") {
    const bytes = Buffer.from(value);
    return Buffer.concat([cborHead(3, bytes.length), bytes]);
  }
  if (typeof value === "boolean") return Buffer.from([value ? 0xf5 : 0xf4]);
  if (value === null) return Buffer.from([0xf6]);
  if (Buffer.isBuffer(value))
    return Buffer.concat([cborHead(2, value.length), value]);
  if (Array.isArray(value))
    return Buffer.concat([cborHead(4, value.length), ...value.map(encodeCbor)]);
  if (value instanceof Map)
    return Buffer.concat([
      cborHead(5, value.size),
      ...[...value].flatMap(([key, item]) => [
        encodeCbor(key),
        encodeCbor(item),
      ]),
    ]);
  return Buffer.concat([cborHead(6, value.tag), encodeCbor(value.value)]);
}

// Encodes an mDoc as base64url CBOR with one namespace of issuer-signed
// items. tagged wraps issuerAuth in the COSE_Sign1 tag (18).
// Shaped like Certify 0.14's mso_mdoc response; the signature is not genuine.
export function issueMdoc(
  claims: Record<string, string> = {
    fullName: "Demo Farmer",
    issuing_country: "IN",
  },
  docType = "io.mosip.farmer.1.FarmerCredential",
  tagged = false,
): string {
  const items = Object.entries(claims).map(([id, value], index) => ({
    tag: 24,
    value: encodeCbor(
      new Map<Cbor, Cbor>([
        ["digestID", index],
        ["random", randomBytes(24)],
        ["elementIdentifier", id],
        ["elementValue", value],
      ]),
    ),
  }));
  const mso = new Map<Cbor, Cbor>([
    ["version", "1.0"],
    ["digestAlgorithm", "SHA-256"],
    ["docType", docType],
    [
      "validityInfo",
      new Map<Cbor, Cbor>([
        ["validFrom", "2026-01-01T00:00:00Z"],
        ["validUntil", "2028-01-01T00:00:00Z"],
      ]),
    ],
  ]);
  const issuerAuth: Cbor = [
    encodeCbor(new Map<Cbor, Cbor>([[1, -7]])),
    new Map<Cbor, Cbor>(),
    encodeCbor({ tag: 24, value: encodeCbor(mso) }),
    randomBytes(64),
  ];
  return encodeCbor(
    new Map<Cbor, Cbor>([
      ["docType", docType],
      [
        "issuerSigned",
        new Map<Cbor, Cbor>([
          ["nameSpaces", new Map<Cbor, Cbor>([["io.mosip.farmer.1", items]])],
          ["issuerAuth", tagged ? { tag: 18, value: issuerAuth } : issuerAuth],
        ]),
      ],
    ]),
  ).toString("base64url");
}
