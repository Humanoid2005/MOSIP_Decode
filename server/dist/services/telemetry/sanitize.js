const secret = /^(authorization|cookie|set-cookie|access_token|refresh_token|id_token|pre-authorized_code|code|client_secret|tx_code|pin|password)$/i;
export function sanitize(value, depth = 0) {
    if (depth > 25)
        return "[depth limit]";
    if (Array.isArray(value))
        return value.map((item) => sanitize(item, depth + 1));
    if (value && typeof value === "object")
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [
            key,
            secret.test(key) ? "[redacted]" : sanitize(item, depth + 1),
        ]));
    if (typeof value === "string" && value.length > 100000)
        return `${value.slice(0, 100000)} [truncated]`;
    return value;
}
export function safeEndpoint(url) {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
}
export function boundedPayload(value) {
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
export function parsePayload(buffer, contentType = "") {
    const text = buffer.toString("utf8");
    if (contentType.includes("application/x-www-form-urlencoded"))
        return Object.fromEntries(new URLSearchParams(text));
    try {
        return JSON.parse(text);
    }
    catch {
        return contentType.includes("jwt") ? text : "[non-JSON body]";
    }
}
