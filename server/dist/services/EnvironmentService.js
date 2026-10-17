import { AppError, object } from "./errors.js";
export class EnvironmentService {
    environment;
    constructor(initial) {
        this.environment = this.validate(initial);
    }
    get() {
        return { ...this.environment };
    }
    validate(value) {
        const input = object(value);
        const result = {};
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
        ]) {
            const field = input[key];
            if (typeof field !== "string" || field.length > 2048)
                throw new AppError(422, `Invalid ${key}.`);
            result[key] = field.trim();
            if (key.endsWith("Url") && result[key]) {
                let url;
                try {
                    url = new URL(result[key]);
                }
                catch {
                    throw new AppError(422, `${key} must be an absolute URL.`);
                }
                if (!["https:", "http:"].includes(url.protocol) ||
                    url.username ||
                    url.password ||
                    url.hash ||
                    url.search)
                    throw new AppError(422, `${key} must be an HTTP(S) URL without credentials, query or fragment.`);
                result[key] = result[key].replace(/\/+$/, "");
            }
        }
        return result;
    }
}
