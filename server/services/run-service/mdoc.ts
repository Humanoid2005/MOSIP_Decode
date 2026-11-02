import { X509Certificate } from "node:crypto";

// A minimal CBOR (RFC 8949) reader for inspecting issued ISO/IEC 18013-5
// mDocs. It decodes; it does not verify signatures or digests.
interface Tagged {
  tag: number;
  value: unknown;
}
type CborMap = Map<unknown, unknown>;

// Reads CBOR data items from a buffer. Byte strings stay Buffers, maps keep
// their non-string keys (COSE headers use integer labels) and tags are
// returned as {tag, value}.
class CborReader {
  private offset = 0;
  constructor(private readonly bytes: Buffer) {}

  // Decodes the next data item by major type: 0 and 1 integers, 2 byte
  // string, 3 text, 4 array, 5 map, 6 tag (the default branch), 7 simple
  // values and floats.
  read(): unknown {
    const initial = this.byte();
    const major = initial >> 5;
    const info = initial & 31;
    if (major === 7) return this.simple(info);
    const argument = this.argument(info);
    switch (major) {
      case 0:
        return argument;
      case 1:
        return -1 - argument;
      case 2:
        return this.take(argument);
      case 3:
        return this.take(argument).toString("utf8");
      case 4:
        return Array.from({ length: argument }, () => this.read());
      case 5: {
        const map: CborMap = new Map();
        for (let index = 0; index < argument; index++)
          map.set(this.read(), this.read());
        return map;
      }
      default:
        return { tag: argument, value: this.read() } satisfies Tagged;
    }
  }

  done(): boolean {
    return this.offset === this.bytes.length;
  }

  // Reads the length or value encoded after the initial byte. Indefinite
  // lengths are not supported, and 64-bit values beyond the safe integer range
  // are rejected rather than rounded.
  private argument(info: number): number {
    if (info < 24) return info;
    if (info === 24) return this.byte();
    if (info === 25) return this.take(2).readUInt16BE();
    if (info === 26) return this.take(4).readUInt32BE();
    if (info === 27) {
      const value = this.take(8).readBigUInt64BE();
      if (value > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error("CBOR integer exceeds the safe range.");
      return Number(value);
    }
    throw new Error("Indefinite-length CBOR is not supported.");
  }

  // Major type 7. Half-precision floats are expanded by hand because Buffer
  // has no reader for them.
  private simple(info: number): unknown {
    if (info === 20) return false;
    if (info === 21) return true;
    if (info === 22) return null;
    if (info === 23) return undefined;
    if (info === 25) {
      const half = this.take(2).readUInt16BE();
      const exponent = (half >> 10) & 31;
      const fraction = half & 1023;
      const sign = half & 32768 ? -1 : 1;
      return exponent === 0
        ? sign * 2 ** -14 * (fraction / 1024)
        : exponent === 31
          ? fraction
            ? NaN
            : sign * Infinity
          : sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
    }
    if (info === 26) return this.take(4).readFloatBE();
    if (info === 27) return this.take(8).readDoubleBE();
    throw new Error("Unsupported CBOR simple value.");
  }

  private byte(): number {
    return this.take(1)[0]!;
  }

  // Throws on truncated input, where subarray would return a short slice.
  private take(length: number): Buffer {
    if (this.offset + length > this.bytes.length)
      throw new Error("Truncated CBOR data.");
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }
}

// Decodes exactly one CBOR item and rejects trailing bytes.
export function decodeCbor(bytes: Buffer): unknown {
  const reader = new CborReader(bytes);
  const value = reader.read();
  if (!reader.done()) throw new Error("Trailing bytes after CBOR item.");
  return value;
}

function isTagged(value: unknown): value is Tagged {
  return (
    !!value &&
    typeof value === "object" &&
    !(value instanceof Map) &&
    !Buffer.isBuffer(value) &&
    "tag" in value
  );
}
function map(value: unknown, name: string): CborMap {
  if (!(value instanceof Map)) throw new Error(`${name} is not a CBOR map.`);
  return value;
}
// Encoded CBOR data item (#6.24(bstr)), as used for IssuerSignedItem and the
// MSO. A COSE payload may carry the tagged item inside a plain byte string.
function embedded(value: unknown): unknown {
  const bytes = isTagged(value) && value.tag === 24 ? value.value : value;
  if (!Buffer.isBuffer(bytes)) throw new Error("Expected embedded CBOR bytes.");
  const decoded = decodeCbor(bytes);
  return isTagged(decoded) && decoded.tag === 24 ? embedded(decoded) : decoded;
}

// JSON view for the inspector: maps become objects, byte strings are labelled.
function view(value: unknown): unknown {
  if (Buffer.isBuffer(value))
    return `<${value.length} bytes> ${value.toString("base64url")}`;
  if (value instanceof Map)
    return Object.fromEntries(
      [...value].map(([key, item]) => [String(key), view(item)]),
    );
  if (Array.isArray(value)) return value.map(view);
  if (isTagged(value)) return { [`tag(${value.tag})`]: view(value.value) };
  return value;
}

// Names for COSE algorithm identifiers in the issuerAuth protected header. An
// unlisted identifier is shown as its number.
const coseAlgorithms: Record<number, string> = {
  [-7]: "ES256",
  [-35]: "ES384",
  [-36]: "ES512",
  [-8]: "EdDSA",
};

// Inspection view of an issued mDoc: issuer-signed elements by namespace, the
// decoded Mobile Security Object, the issuerAuth signature algorithm and, when
// present, the leaf certificate from its x5chain. Nothing here is verified.
export interface MdocSummary {
  docType: string;
  algorithm: string;
  nameSpaces: Record<string, Record<string, unknown>>;
  mso: unknown;
  certificate?: { subject: string; issuer: string; validTo: string };
}

// Parses the base64url-encoded CBOR document ({docType, issuerSigned}) that
// Certify returns for mso_mdoc.
export function decodeMdoc(credential: string): MdocSummary {
  if (!/^[A-Za-z0-9_-]+$/.test(credential))
    throw new Error("An mDoc credential is base64url-encoded CBOR.");
  const document = map(
    decodeCbor(Buffer.from(credential, "base64url")),
    "Document",
  );
  const docType = document.get("docType");
  if (typeof docType !== "string") throw new Error("Missing docType.");
  const issuerSigned = map(document.get("issuerSigned"), "issuerSigned");
  const nameSpaces: MdocSummary["nameSpaces"] = {};
  for (const [namespace, items] of map(
    issuerSigned.get("nameSpaces"),
    "nameSpaces",
  )) {
    if (!Array.isArray(items)) throw new Error("Namespace is not an array.");
    nameSpaces[String(namespace)] = Object.fromEntries(
      items.map((item) => {
        const element = map(embedded(item), "IssuerSignedItem");
        return [
          String(element.get("elementIdentifier")),
          view(element.get("elementValue")),
        ];
      }),
    );
  }
  // Certify sends the tagged form, COSE_Sign1_Tagged (#6.18).
  const signed = issuerSigned.get("issuerAuth");
  const issuerAuth =
    isTagged(signed) && signed.tag === 18 ? signed.value : signed;
  if (!Array.isArray(issuerAuth) || issuerAuth.length !== 4)
    throw new Error("issuerAuth is not a COSE_Sign1 structure.");
  const [protectedHeader, unprotectedHeader, payload] = issuerAuth;
  const header = Buffer.isBuffer(protectedHeader)
    ? map(decodeCbor(protectedHeader), "Protected header")
    : new Map();
  // x5chain (unprotected header label 33) holds one certificate or a chain
  // with the leaf first.
  const chain = map(unprotectedHeader, "Unprotected header").get(33);
  const leaf = Array.isArray(chain) ? chain[0] : chain;
  let certificate: MdocSummary["certificate"];
  if (Buffer.isBuffer(leaf)) {
    const parsed = new X509Certificate(leaf);
    certificate = {
      subject: parsed.subject,
      issuer: parsed.issuer,
      validTo: parsed.validTo,
    };
  }
  return {
    docType,
    algorithm:
      coseAlgorithms[Number(header.get(1))] ?? String(header.get(1) ?? ""),
    nameSpaces,
    mso: view(embedded(payload)),
    ...(certificate ? { certificate } : {}),
  };
}

// True when the value is a string that decodes as an mDoc. Used to recognise
// an mso_mdoc credential in a /credential response.
export function isMdoc(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    decodeMdoc(value);
    return true;
  } catch {
    return false;
  }
}
