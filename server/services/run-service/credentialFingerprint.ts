import { createHash } from "node:crypto";

export function matchesCredentialFormat(
  value: unknown,
  format: string,
): boolean {
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
