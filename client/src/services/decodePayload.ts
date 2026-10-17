function decodePart(value: string): unknown {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(
        atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
        (char) => char.charCodeAt(0),
      ),
    ),
  );
}
export function decodePayload(value: unknown, depth = 0): unknown {
  if (depth > 20) return "[depth limit]";
  if (Array.isArray(value))
    return value.map((item) => decodePayload(item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        decodePayload(item, depth + 1),
      ]),
    );
  if (typeof value !== "string") return value;
  const [jwt, ...disclosures] = value.split("~");
  const parts = jwt?.split(".") || [];
  if (
    parts.length !== 3 ||
    !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  )
    return value;
  try {
    return {
      inspectionOnly: "Decoded, not cryptographically verified",
      header: decodePart(parts[0]),
      claims: decodePart(parts[1]),
      signature: parts[2],
      ...(disclosures.length
        ? {
            disclosures: disclosures.filter(Boolean).map((part) => {
              try {
                return part.includes(".")
                  ? decodePayload(part, depth + 1)
                  : decodePart(part);
              } catch {
                return { undecodable: part };
              }
            }),
          }
        : {}),
    };
  } catch {
    return value;
  }
}
