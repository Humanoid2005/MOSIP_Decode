export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
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
