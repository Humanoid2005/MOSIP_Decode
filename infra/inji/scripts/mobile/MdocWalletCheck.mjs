import { X509Certificate, createHash, verify } from "node:crypto";

// Repeats the checks Inji Mobile 0.22 runs with vc-verifier before it stores an
// mso_mdoc credential (MsoMdocValidator and MsoMdocVerifier), including its
// certificate lookup, so a rehearsal shows whether the app would keep the card.
// Like the app, it does not validate the certificate chain.
export function walletMdocChecks(credential, now = Date.now()) {
  const document = decode(Buffer.from(credential, "base64url"));
  const issuerSigned = document.get("issuerSigned");
  const signed = issuerSigned?.get("issuerAuth");
  // COSE_Sign1 may be tagged (#6.18), as Certify sends it; cbor-java ignores the tag.
  const issuerAuth = signed?.tag === 18 ? signed.value : signed;
  const nameSpaces = issuerSigned?.get("nameSpaces");
  if (!Array.isArray(issuerAuth) || !(nameSpaces instanceof Map))
    throw new Error("The mDoc has no issuerSigned structure.");
  const [protectedHeader, unprotectedHeader, payload, signature] = issuerAuth;
  const mso = embedded(payload);

  // validFrom may be up to a minute ahead of this computer's clock.
  const validity = mso.get("validityInfo");
  const from = Date.parse(dateText(validity?.get("validFrom")));
  const until = Date.parse(dateText(validity?.get("validUntil")));
  if (Number.isNaN(from) || Number.isNaN(until)) throw new Error("validFrom / validUntil is not available in the MSO.");
  if (from > now + 60000) throw new Error("validFrom in the MSO is in the future.");
  if (until <= now) throw new Error("validUntil in the MSO is in the past.");
  if (until <= from) throw new Error("validUntil in the MSO is not after validFrom.");

  // vc-verifier takes the first header value, or element [1] when it is an array.
  const values = [...unprotectedHeader.values()];
  const entry = values.length > 1 || Array.isArray(values[0]) ? values[0]?.[1] : values[0];
  if (!Buffer.isBuffer(entry)) throw new Error("The issuerAuth certificate chain is empty.");
  // issuing_country must equal the country in the certificate subject.
  const certificate = new X509Certificate(entry);
  const country = /(?:^|\n|, ?)C=([^,\n]+)/.exec(certificate.subject)?.[1];
  const issuingCountry = [...nameSpaces.values()]
    .flat()
    .map(embedded)
    .find((item) => item.get("elementIdentifier") === "issuing_country")
    ?.get("elementValue");
  if (!country || issuingCountry !== country)
    throw new Error(`issuing_country (${issuingCountry}) does not match the certificate country (${country}).`);

  // COSE Sig_structure for Signature1: protected header, empty external AAD
  // and the payload.
  const toBeSigned = Buffer.concat([
    head(4, 4), text("Signature1"), bytes(protectedHeader), bytes(Buffer.alloc(0)), bytes(payload),
  ]);
  if (!verify("sha256", toBeSigned, { key: certificate.publicKey, dsaEncoding: "ieee-p1363" }, signature))
    throw new Error("The COSE signature does not verify with the certificate key.");

  // Each element is hashed as embedded, tag 24 included (IssuerSignedItemBytes).
  const digests = mso.get("valueDigests");
  const byNamespace = digests.get("nameSpaces") ?? digests;
  for (const [namespace, items] of nameSpaces)
    for (const item of items) {
      const encoded = Buffer.concat([Buffer.from([0xd8, 0x18]), bytes(item.value)]);
      const expected = byNamespace.get(namespace)?.get(embedded(item).get("digestID"));
      if (!Buffer.isBuffer(expected) || !createHash("sha256").update(encoded).digest().equals(expected))
        throw new Error(`The value digest of an element in ${namespace} does not match the MSO.`);
    }
  if (mso.get("docType") !== document.get("docType"))
    throw new Error("The MSO docType does not match the document.");
  return { docType: mso.get("docType"), certificate: certificate.subject.replaceAll("\n", ", ") };
}

// MSO dates are text, optionally wrapped in tag 0.
function dateText(value) {
  return typeof value === "string" ? value : value?.tag === 0 ? value.value : "";
}

// Decodes tag-24 embedded CBOR (bstr .cbor), unwrapping nested tags as well.
function embedded(value) {
  const decoded = decode(value?.tag === 24 ? value.value : value);
  return decoded?.tag === 24 ? embedded(decoded) : decoded;
}

// Minimal CBOR encoders for the Sig_structure.
const head = (major, length) => {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 256) return Buffer.from([(major << 5) | 24, length]);
  if (length < 65536) return Buffer.from([(major << 5) | 25, length >> 8, length & 255]);
  const value = Buffer.alloc(5);
  value[0] = (major << 5) | 26;
  value.writeUInt32BE(length, 1);
  return value;
};
const bytes = (value) => Buffer.concat([head(2, value.length), value]);
const text = (value) => Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value)]);

// Definite-length CBOR only, as Certify encodes it.
// Tagged values are returned as { tag, value }.
function decode(buffer) {
  let offset = 0;
  const take = (length) => {
    if (offset + length > buffer.length) throw new Error("Truncated CBOR data.");
    return buffer.subarray(offset, (offset += length));
  };
  const read = () => {
    const initial = take(1)[0];
    const major = initial >> 5;
    const info = initial & 31;
    if (major === 7) {
      if (info >= 20 && info <= 23) return [false, true, null, undefined][info - 20];
      throw new Error("Unsupported CBOR simple or floating-point value.");
    }
    const argument =
      info < 24 ? info
        : info === 24 ? take(1)[0]
          : info === 25 ? take(2).readUInt16BE()
            : info === 26 ? take(4).readUInt32BE()
              : info === 27 ? Number(take(8).readBigUInt64BE())
                : NaN;
    if (Number.isNaN(argument)) throw new Error("Indefinite-length CBOR is not supported.");
    if (major === 0) return argument;
    if (major === 1) return -1 - argument;
    if (major === 2) return Buffer.from(take(argument));
    if (major === 3) return take(argument).toString("utf8");
    if (major === 4) return Array.from({ length: argument }, read);
    if (major === 5) return new Map(Array.from({ length: argument }, () => [read(), read()]));
    return { tag: argument, value: read() };
  };
  return read();
}
