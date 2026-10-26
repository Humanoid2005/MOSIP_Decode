import type { ScenarioService } from "../scenario-service/ScenarioService.js";
import { randomBytes } from "node:crypto";
import type { VerifierAdapter } from "../../models/contracts.js";
import type { TestRun } from "../../models/dtos.js";
import type { ObservedHttpClient } from "../telemetry/ObservedHttpClient.js";
import { AppError, object, requiredString } from "../errors.js";
import { presentationUri } from "./PresentationRequest.js";
export class InjiVerifierAdapter implements VerifierAdapter {
  constructor(
    private readonly http: ObservedHttpClient,
    private readonly scenarios: ScenarioService,
  ) {}
  async create(run: TestRun) {
    const env = run.environment;
    if (!env.verifyUrl || !env.verifierClientId)
      throw new AppError(
        409,
        "Configure Verify URL and verifier client ID first.",
      );
    const definitionId =
      env.presentationDefinitionIds[run.configuration.format];
    if (!definitionId)
      throw new AppError(
        409,
        `No presentation definition is configured for ${run.configuration.format}.`,
      );
    const definition = object(
      await this.http.json(
        `${env.verifyUrl}/vp-definition/${encodeURIComponent(definitionId)}`,
        "Presentation definition",
        run.id,
      ),
    );
    const nonce = randomBytes(32).toString("base64url");
    const requestedDefinition = this.scenarios.definition(run, definition);
    this.scenarios.expect(run.id, nonce, requestedDefinition);
    const payload = object(
      await this.http.json(
        `${env.verifyUrl}/vp-request`,
        "Presentation request",
        run.id,
        {
          clientId: env.verifierClientId,
          transactionId: run.id,
          nonce,
          presentationDefinition: requestedDefinition,
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
        `${run.environment.verifyUrl}/v2/vp-results/${encodeURIComponent(run.transactionId!)}`,
        "Verification checks (Inji v2)",
        run.id,
        { includeClaims: false, skipStatusChecks: false },
      ),
    );
    if (payload.transactionId !== run.transactionId)
      throw new AppError(
        502,
        "Verifier result belongs to a different transaction.",
      );
    if (
      typeof payload.allChecksSuccessful !== "boolean" ||
      !Array.isArray(payload.credentialResults) ||
      payload.credentialResults.length !== 1
    )
      throw new AppError(
        502,
        "Expected exactly one credential and detailed Inji v2 verification checks. No pass can be inferred.",
      );
    const result = object(payload.credentialResults[0]);
    const checks: import("../../models/verification.js").VerificationCheck[] =
      [];
    for (const [id, label, value] of [
      [
        "issuer-signature",
        "Credential schema and issuer signature",
        result.schemaAndSignatureCheck,
      ],
      ["expiry", "Credential expiry", result.expiryCheck],
      ["holder-proof", "Presentation holder proof", result.holderProofCheck],
    ] as const) {
      const check = value && typeof value === "object" ? object(value) : {};
      const error =
        check.error && typeof check.error === "object"
          ? object(check.error)
          : {};
      checks.push({
        id,
        label,
        source: "INJI_VERIFY",
        status:
          check.valid === true
            ? "PASS"
            : check.valid === false
              ? "FAIL"
              : "NOT_CHECKED",
        ...(typeof error.errorCode === "string"
          ? { detail: error.errorCode }
          : {}),
      });
    }
    const statuses = Array.isArray(result.statusCheck)
      ? result.statusCheck
      : undefined;
    checks.push({
      id: "credential-status",
      label: "Credential status",
      source: "INJI_VERIFY",
      status: !statuses
        ? "NOT_CHECKED"
        : statuses.length === 0
          ? "NOT_APPLICABLE"
          : statuses.some((item) => object(item).valid === false)
            ? "FAIL"
            : statuses.every((item) => object(item).valid === true)
              ? "PASS"
              : "NOT_CHECKED",
      detail:
        statuses?.length === 0
          ? "No credential status entry was checked; this is not evidence of revocation support."
          : undefined,
    });
    if (
      typeof result.allChecksSuccessful !== "boolean" ||
      (payload.allChecksSuccessful &&
        (!result.allChecksSuccessful ||
          checks.some(
            (check) => !["PASS", "NOT_APPLICABLE"].includes(check.status),
          )))
    )
      throw new AppError(
        502,
        "Verifier returned inconsistent or incomplete checks; acceptance cannot be established.",
      );
    const verdict = payload.allChecksSuccessful
      ? ("VALID" as const)
      : checks.find((check) => check.id === "expiry")?.status === "FAIL" &&
          checks.find((check) => check.id === "issuer-signature")?.status ===
            "PASS"
        ? ("EXPIRED" as const)
        : ("INVALID" as const);
    if (
      typeof result.verifiableCredential !== "string" ||
      !result.verifiableCredential
    )
      throw new AppError(
        502,
        "Verifier result has no credential to correlate with this run.",
      );
    return {
      verdict,
      payload,
      credentials: [result.verifiableCredential],
      verification: {
        version: 1 as const,
        upstreamAccepted: payload.allChecksSuccessful,
        checks,
      },
    };
  }
}
