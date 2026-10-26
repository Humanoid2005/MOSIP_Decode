export function upstreamFailure(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  const value = body as Record<string, unknown>;
  const error =
    typeof value.error === "object"
      ? (value.error as Record<string, unknown> | null)
      : value;
  const code =
    error?.errorCode ??
    (typeof value.error === "string" ? value.error : undefined);
  const message =
    error?.errorMessage ?? value.error_description ?? value.message;
  const parts = [code, message].filter(
    (part): part is string => typeof part === "string" && Boolean(part.trim()),
  );
  return parts.length
    ? [...new Set(parts)].join(": ").slice(0, 600)
    : undefined;
}
