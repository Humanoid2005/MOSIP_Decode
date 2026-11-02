import type { Environment } from "../models/dtos.js";
import { AppError, object } from "./errors.js";
// Holds the Inji endpoints and identifiers the playground works against, read
// once at startup from config/environment.ts. Each new run stores a copy, so a
// run keeps the endpoints it started with.
export class EnvironmentService {
  private readonly environment: Environment;
  constructor(initial: Environment) {
    this.environment = this.validate(initial);
  }
  get(): Environment {
    return { ...this.environment };
  }
  // Rejects malformed configuration at startup instead of on first use. URLs
  // must be absolute HTTP(S) without credentials, query or fragment, and lose
  // trailing slashes because callers append paths to them. Empty values are
  // allowed; features that need them refuse to start, usually with 409.
  private validate(value: unknown): Environment {
    const input = object(value);
    const result = {} as Environment;
    for (const key of [
      "certifyUrl",
      "issuerUrl",
      "verifyUrl",
      "mimotoUrl",
      "webWalletUrl",
      "embeddedWalletUrl",
      "authorizationUrl",
      "publicBaseUrl",
      "verifierClientId",
      "stackVersion",
    ] as const) {
      const field = input[key];
      if (typeof field !== "string" || field.length > 2048)
        throw new AppError(422, `Invalid ${key}.`);
      result[key] = field.trim();
      if (key.endsWith("Url") && result[key]) {
        let url: URL;
        try {
          url = new URL(result[key]);
        } catch {
          throw new AppError(422, `${key} must be an absolute URL.`);
        }
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.hash ||
          url.search
        )
          throw new AppError(
            422,
            `${key} must be an HTTP(S) URL without credentials, query or fragment.`,
          );
        result[key] = result[key].replace(/\/+$/, "");
      }
    }
    result.presentationDefinitionIds = this.definitionIds(
      input.presentationDefinitionIds,
    );
    return result;
  }
  // Maps each credential format to the Inji Verify presentation definition ID
  // used for its runs (INJI_PRESENTATION_DEFINITION_IDS).
  private definitionIds(value: unknown): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [format, id] of Object.entries(object(value))) {
      if (typeof id !== "string" || !id.trim() || id.length > 2048)
        throw new AppError(
          422,
          `Invalid presentation definition ID for ${format}.`,
        );
      result[format] = id.trim();
    }
    return result;
  }
}
