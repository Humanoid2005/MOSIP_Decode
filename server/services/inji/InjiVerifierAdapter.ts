import { randomBytes } from "node:crypto";
import type { VerifierAdapter } from "../../models/contracts.js";
import type { TestRun } from "../../models/dtos.js";
import type { ObservedHttpClient } from "../telemetry/ObservedHttpClient.js";
import { AppError, object, requiredString } from "../errors.js";
import { presentationUri } from "./PresentationRequest.js";
export class InjiVerifierAdapter implements VerifierAdapter {
  constructor(private readonly http: ObservedHttpClient) {}
  async create(run: TestRun) {
    const env = run.environment;
    if (
      !env.verifyUrl ||
      !env.verifierClientId ||
      !env.presentationDefinitionId
    )
      throw new AppError(
        409,
        "Configure Verify URL, verifier client ID and presentation definition ID first.",
      );
    const definition = object(
      await this.http.json(
        `${env.verifyUrl}/vp-definition/${encodeURIComponent(env.presentationDefinitionId)}`,
        "Presentation definition",
        run.id,
      ),
    );
    const payload = object(
      await this.http.json(
        `${env.verifyUrl}/vp-request`,
        "Presentation request",
        run.id,
        {
          clientId: env.verifierClientId,
          transactionId: run.id,
          nonce: randomBytes(32).toString("base64url"),
          presentationDefinition: definition,
        },
      ),
    );
    return {
      requestId: requiredString(payload.requestId, "requestId"),
      transactionId: requiredString(payload.transactionId, "transactionId"),
      uri: presentationUri(payload, run),
    };
  }
  async status(run: TestRun): Promise<string> {
    const result = object(
      await this.http.json(
        `${run.environment.verifyUrl}/vp-request/${encodeURIComponent(run.requestId!)}/status`,
        "Presentation status",
        run.id,
      ),
    );
    return requiredString(result.status, "status");
  }
  async result(run: TestRun) {
    const payload = object(
      await this.http.json(
        `${run.environment.verifyUrl}/vp-result/${encodeURIComponent(run.transactionId!)}`,
        "Verification result",
        run.id,
      ),
    );
    if (!Array.isArray(payload.vcResults) || !payload.vcResults.length)
      throw new AppError(
        502,
        "Verifier returned no credential results. This adapter expects the Inji Verify v1 API.",
      );
    const results = payload.vcResults.map(object);
    const statuses = results.map((result) => result.verificationStatus);
    if (
      statuses.some(
        (status) => !["SUCCESS", "INVALID", "EXPIRED"].includes(String(status)),
      )
    )
      throw new AppError(
        502,
        "Unknown verification status. Inspect the response and confirm the configured API version.",
      );
    const verdict = statuses.includes("INVALID")
      ? ("INVALID" as const)
      : statuses.includes("EXPIRED")
        ? ("EXPIRED" as const)
        : ("VALID" as const);
    return {
      verdict,
      payload,
      credentials: results.map((result) => result.vc),
    };
  }
}
