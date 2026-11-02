// Prepares protocol payloads before they are stored on a run or exported.
// `secret` names the fields whose values are redacted at any depth, in any
// case: OAuth tokens and codes, PKCE verifiers, client credentials, wallet
// PINs, passwords, cookies and the CSRF token. Credentials and presentations
// are kept, since they are the evidence the inspector shows.
const secret =
  /^(authorization|cookie|set-cookie|access_token|refresh_token|id_token|pre-authorized_code|code|code_verifier|client_assertion|client_secret|tx_code|pin|walletPin|confirmWalletPin|codeVerifier|accessToken|refreshToken|idToken|assertion|subject_token|actor_token|device_code|password|x-xsrf-token)$/i;
// Returns a copy with secret fields redacted, strings over 100,000 characters
// truncated and nesting beyond 25 levels cut off, so hostile input cannot
// exhaust the stack.
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 25) return "[depth limit]";
  if (Array.isArray(value))
    return value.map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        secret.test(key) ? "[redacted]" : sanitize(item, depth + 1),
      ]),
    );
  if (typeof value === "string" && value.length > 100000)
    return `${value.slice(0, 100000)} [truncated]`;
  return value;
}
// Reduces a URL to origin and path for recording. Query strings can carry
// authorization codes and tokens, and the origin drops any user credentials.
export function safeEndpoint(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}
// Sanitizes an event payload and, when its JSON exceeds 32,768 characters,
// stores a truncated preview instead, keeping each run's history small.
export function boundedPayload(value: unknown): unknown {
  const sanitized = sanitize(value);
  const serialized = JSON.stringify(sanitized) ?? "";
  return serialized.length > 32768
    ? {
        truncated: true,
        note: "Payload exceeds the 32 KB inspector limit.",
        preview: serialized.slice(0, 32768),
      }
    : sanitized;
}
// Decodes a raw bridged body for recording and inspection: form bodies become
// objects, JSON is parsed, other text is kept as is and an empty body is null.
export function parsePayload(buffer: Buffer, contentType = ""): unknown {
  const text = buffer.toString("utf8");
  if (contentType.includes("application/x-www-form-urlencoded"))
    return Object.fromEntries(new URLSearchParams(text));
  try {
    return JSON.parse(text);
  } catch {
    return text || null;
  }
}
