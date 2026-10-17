import type { Environment } from "../models/dtos.js";
import { AppError, object } from "./errors.js";
export class EnvironmentService {
  private readonly environment: Environment;
  constructor(initial: Environment) {
    this.environment = this.validate(initial);
  }
  get(): Environment {
    return { ...this.environment };
  }
  private validate(value: unknown): Environment {
    const input = object(value);
    const result = {} as Environment;
    for (const key of [
      "certifyUrl",
      "issuerUrl",
      "verifyUrl",
      "mimotoUrl",
      "webWalletUrl",
      "authorizationUrl",
      "publicBaseUrl",
      "verifierClientId",
      "presentationDefinitionId",
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
    return result;
  }
}
