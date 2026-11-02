import type { IssuerAdapter } from "../../models/contracts.js";
import type {
  CredentialConfiguration,
  Environment,
} from "../../models/dtos.js";
import type { ObservedHttpClient } from "../telemetry/ObservedHttpClient.js";
import { AppError, object } from "../errors.js";
// Reads Inji Certify's OpenID4VCI issuer metadata to list the credential
// configurations a run can be started with.
export class InjiIssuerAdapter implements IssuerAdapter {
  constructor(private readonly http: ObservedHttpClient) {}
  // Fetches metadata from Certify's upstream URL, which differs from the
  // public issuer identifier when the bridge is used; credential_issuer must
  // still equal the configured identifier exactly. Only formats the playground
  // can run (JSON-LD, SD-JWT and mDoc) are listed, and proofTypes holds the
  // issuer's credential signing algorithms.
  async discover(env: Environment, runId?: string) {
    if (!env.certifyUrl || !env.issuerUrl)
      throw new AppError(
        409,
        "Configure the Certify service URL and its canonical issuer identifier first.",
      );
    const metadata = object(
      await this.http.json(
        `${env.certifyUrl}/.well-known/openid-credential-issuer`,
        "Issuer metadata",
        runId,
      ),
    );
    if (metadata.credential_issuer !== env.issuerUrl)
      throw new AppError(
        422,
        "The configured issuer identifier does not match credential_issuer in Certify metadata.",
      );
    const supported = object(metadata.credential_configurations_supported);
    const configurations: CredentialConfiguration[] = Object.entries(
      supported,
    ).flatMap(([id, value]) => {
      const config = object(value);
      if (
        !["ldp_vc", "vc+sd-jwt", "dc+sd-jwt", "mso_mdoc"].includes(
          String(config.format),
        )
      )
        return [];
      const display = Array.isArray(config.display)
        ? config.display[0]
        : undefined;
      return [
        {
          id,
          name: display && typeof display.name === "string" ? display.name : id,
          format: String(config.format),
          proofTypes: Array.isArray(
            config.credential_signing_alg_values_supported,
          )
            ? config.credential_signing_alg_values_supported.map(String)
            : [],
        },
      ];
    });
    return { metadata, configurations };
  }
}
