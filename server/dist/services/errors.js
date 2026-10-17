export class AppError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
export function object(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new AppError(422, "Expected a JSON object.");
    return value;
}
export function requiredString(value, name) {
    if (typeof value !== "string" || !value.trim() || value.length > 4096)
        throw new AppError(422, `${name} is required and must be a string under 4096 characters.`);
    return value.trim();
}
