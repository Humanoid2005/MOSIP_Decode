import { AppError, object } from "../errors.js";
export class InjiIssuerAdapter {
    http;
    constructor(http) {
        this.http = http;
    }
    async discover(env, runId) {
        if (!env.certifyUrl || !env.issuerUrl)
            throw new AppError(409, "Configure the Certify service URL and its canonical issuer identifier first.");
        const metadata = object(await this.http.json(`${env.certifyUrl}/.well-known/openid-credential-issuer`, "Issuer metadata", runId));
        if (metadata.credential_issuer !== env.issuerUrl)
            throw new AppError(422, "The configured issuer identifier does not match credential_issuer in Certify metadata.");
        const supported = object(metadata.credential_configurations_supported);
        const configurations = Object.entries(supported).flatMap(([id, value]) => {
            const config = object(value);
            if (!["ldp_vc", "vc+sd-jwt", "dc+sd-jwt"].includes(String(config.format)))
                return [];
            const display = Array.isArray(config.display)
                ? config.display[0]
                : undefined;
            return [
                {
                    id,
                    name: display && typeof display.name === "string" ? display.name : id,
                    format: String(config.format),
                    proofTypes: Array.isArray(config.credential_signing_alg_values_supported)
                        ? config.credential_signing_alg_values_supported.map(String)
                        : [],
                },
            ];
        });
        return { metadata, configurations };
    }
}
