import { createHash } from "node:crypto";
import { isMdoc } from "./mdoc.js";
// Recognises and fingerprints credentials, so a run can show that the
// credential presented and verified is the one issued in the same run.

// Checks that a /credential response carries a credential of the run's
// configured format before the bridge records it as issuance evidence:
// JSON-LD with @context and proof, an SD-JWT whose header typ names the
// format, or a decodable mDoc.
export function matchesCredentialFormat(
  value: unknown,
  format: string,
): boolean {
  if (format === "mso_mdoc") return isMdoc(value);
  let credential = value;
  if (typeof value === "string") {
    try {
      credential = JSON.parse(value);
    } catch {
      if (!["vc+sd-jwt", "dc+sd-jwt"].includes(format)) return false;
      try {
        const header = JSON.parse(
          Buffer.from(value.split(".")[0] ?? "", "base64url").toString("utf8"),
        );
        return header.typ === format;
      } catch {
        return false;
      }
    }
  }
  return (
    format === "ldp_vc" &&
    credential !== null &&
    typeof credential === "object" &&
    !Array.isArray(credential) &&
    "@context" in credential &&
    "proof" in credential
  );
}

// Serializes JSON with object keys sorted, so key order does not change the
// fingerprint.
function canonical(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "";
}
// SHA-256 of the canonical form. A JSON string is parsed first, so a
// credential fingerprints the same as text or as an object. An SD-JWT is
// reduced to its issuer-signed JWT, so disclosures and key binding do not
// affect the match. This is a comparison, not a signature check.
export function credentialFingerprint(value: unknown): string {
  let normalized = value;
  if (typeof value === "string") {
    try {
      normalized = JSON.parse(value);
    } catch {
      normalized = value.includes("~") ? value.split("~")[0] : value;
    }
  }
  return createHash("sha256").update(canonical(normalized)).digest("hex");
}
