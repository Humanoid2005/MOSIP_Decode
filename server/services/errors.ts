// Error carrying the HTTP status to return to the client. The error handler in
// app.ts sends its status and message; unexpected errors are logged and
// reported as a generic 500.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
// A non-2xx answer from an upstream Inji service. Statuses the browser can act
// on (bad input, sign-in, permission, conflict, locked) are passed through;
// anything else, including 404, 429 and 5xx, is reported as 502. Callers use
// upstreamStatus to choose between retrying and failing a run.
export class UpstreamError extends AppError {
  constructor(
    public readonly upstreamStatus: number,
    message: string,
    // The upstream's own error code when it sends one, as Mimoto does.
    public readonly errorCode = "UPSTREAM_REJECTED",
  ) {
    super(
      [400, 401, 403, 409, 422, 423].includes(upstreamStatus)
        ? upstreamStatus
        : 502,
      message,
    );
  }
}
// Narrows a parsed JSON value, from a request or an upstream response, to a
// plain object. Arrays and null are rejected with 422.
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError(422, "Expected a JSON object.");
  return value as Record<string, unknown>;
}
// Reads a required non-empty string field and returns it trimmed. Values over
// 4096 characters are rejected, so it suits identifiers and URLs rather than
// credentials or request objects.
export function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 4096)
    throw new AppError(
      422,
      `${name} is required and must be a string under 4096 characters.`,
    );
  return value.trim();
}
