export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export class UpstreamError extends AppError {
  constructor(
    public readonly upstreamStatus: number,
    message: string,
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
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError(422, "Expected a JSON object.");
  return value as Record<string, unknown>;
}
export function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 4096)
    throw new AppError(
      422,
      `${name} is required and must be a string under 4096 characters.`,
    );
  return value.trim();
}
