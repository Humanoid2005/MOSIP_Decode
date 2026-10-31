import { scenarioOutcome } from "../../models/scenarios.js";
import type { ScenarioService } from "../scenario-service/ScenarioService.js";
import type { RunDao, VerifierAdapter } from "../../models/contracts.js";
import type { TelemetryService } from "../telemetry/TelemetryService.js";
import { AppError, UpstreamError } from "../errors.js";
import { credentialFingerprint } from "./credentialFingerprint.js";
export class VerificationService {
  private readonly busy = new Set<string>();
  private readonly lastPoll = new Map<string, number>();
  constructor(
    private readonly dao: RunDao,
    private readonly verifier: VerifierAdapter,
    private readonly telemetry: TelemetryService,
    private readonly scenarios: ScenarioService,
  ) {}
  async begin(id: string) {
    const run = this.dao.get(id);
    if (run.phase !== "HELD" || this.busy.has(id))
      throw new AppError(
        409,
        "Confirm wallet receipt before requesting a presentation.",
      );
    this.busy.add(id);
    try {
      const result = await this.verifier.create(run);
      const latest = this.dao.get(id);
      if (latest.phase !== "HELD") return latest;
      latest.phase = "VERIFYING";
      latest.requestId = result.requestId;
      latest.transactionId = result.transactionId;
      latest.presentationUri = result.uri;
      latest.error = undefined;
      this.dao.save(latest);
      this.telemetry.notify(id);
      return latest;
    } catch (error) {
      if (
        error instanceof UpstreamError &&
        (error.upstreamStatus >= 500 || error.upstreamStatus === 429)
      ) {
        this.recordError(id, error);
        throw error;
      }
      if (error instanceof AppError && error.status === 503) {
        this.recordError(id, error);
        throw error;
      }
      if (!(error instanceof AppError)) throw error;
      this.scenarios.fail(id, "REQUEST", "REQUEST_FAILED", error.message);
      return this.dao.get(id);
    } finally {
      this.busy.delete(id);
    }
  }
  private recordError(id: string, error: Error) {
    const latest = this.dao.get(id);
    if (!["HELD", "VERIFYING"].includes(latest.phase)) return;
    latest.error = error.message;
    latest.updatedAt = new Date().toISOString();
    this.dao.save(latest);
    this.telemetry.notify(id);
  }
  async refresh(id: string) {
    const run = this.dao.get(id);
    if (
      run.phase !== "VERIFYING" ||
      this.busy.has(id) ||
      Date.now() - (this.lastPoll.get(id) || 0) < 2000
    )
      return run;
    this.busy.add(id);
    this.lastPoll.set(id, Date.now());
    if (this.lastPoll.size > 100)
      this.lastPoll.delete(this.lastPoll.keys().next().value!);
    try {
      const status = await this.verifier.status(run);
      if (status === "ACTIVE") {
        const latest = this.dao.get(id);
        if (latest.phase === "VERIFYING" && latest.error) {
          latest.error = undefined;
          latest.updatedAt = new Date().toISOString();
          this.dao.save(latest);
          this.telemetry.notify(id);
        }
        return latest;
      }
      if (status !== "VP_SUBMITTED") {
        const latest = this.dao.get(id);
        if (latest.phase !== "VERIFYING") return latest;
        latest.phase = "FAILED";
        latest.verdict = "ERROR";
        latest.error =
          status === "EXPIRED"
            ? "Presentation request expired. Start a new run."
            : `Presentation ended with status ${status}.`;
        latest.scenarioEvidence = {
          ...latest.scenarioEvidence,
          stage: "REQUEST",
          errorCode: status === "EXPIRED" ? "REQUEST_EXPIRED" : "REQUEST_ENDED",
          detail: latest.error,
        };
        latest.presentationUri = undefined;
        latest.updatedAt = new Date().toISOString();
        this.dao.save(latest);
        this.telemetry.notify(id);
        return latest;
      }
      const result = await this.verifier.result(run);
      const latest = this.dao.get(id);
      if (latest.phase !== "VERIFYING") return latest;
      latest.error = undefined;
      latest.result = result.payload;
      latest.verification = {
        ...result.verification,
        checks: [
          ...result.verification.checks,
          ...(latest.presentationChecks ?? [
            {
              id: "presentation-evidence",
              label: "Request binding and constraints",
              source: "PLAYGROUND" as const,
              status: "NOT_CHECKED" as const,
              detail: "The submitted presentation was not observed.",
            },
          ]),
        ],
      };
      latest.scenarioEvidence = {
        ...latest.scenarioEvidence,
        stage: "VERIFICATION",
        errorCode: result.verdict,
        rejectionReasonConfirmed: false,
        detail: result.verification.upstreamAccepted
          ? "Inji Verify accepted the presentation. The independent playground checks below can still expose protocol failures."
          : "Inji Verify rejected the presentation. See the individual checks and error codes below; only the expected failure can satisfy a negative scenario.",
      };
      latest.verdict = result.verdict;
      latest.phase = "COMPLETED";
      latest.presentationUri = undefined;
      latest.credentialMatched =
        result.credentials.length === 1 &&
        result.credentials.every((credential) =>
          latest.credentialFingerprints.includes(
            credentialFingerprint(credential),
          ),
        );
      const submitted = latest.submittedFingerprints;
      latest.verification.checks.push({
        id: "result-correlation",
        label: "Result matches the submitted credential",
        source: "PLAYGROUND",
        status:
          submitted?.length === 1 &&
          result.credentials.length === 1 &&
          submitted[0] === credentialFingerprint(result.credentials[0])
            ? "PASS"
            : submitted
              ? "FAIL"
              : "NOT_CHECKED",
      });
      latest.scenarioEvidence.rejectionReasonConfirmed =
        latest.scenario !== "NONE" && scenarioOutcome(latest) === "PASS";
      latest.updatedAt = new Date().toISOString();
      this.dao.save(latest);
      this.telemetry.notify(id);
      return latest;
    } catch (error) {
      if (
        error instanceof UpstreamError &&
        (error.upstreamStatus >= 500 || error.upstreamStatus === 429)
      ) {
        this.recordError(id, error);
        throw error;
      }
      if (error instanceof AppError && error.status === 503) {
        this.recordError(id, error);
        throw error;
      }
      if (!(error instanceof AppError)) {
        // A playground defect is not a verifier verdict; keep the run retryable.
        this.recordError(
          id,
          new Error("Unexpected error while collecting the result. Retrying."),
        );
        throw error;
      }
      this.scenarios.fail(
        id,
        "VERIFICATION",
        "VERIFIER_RESPONSE_ERROR",
        error.message,
      );
      return this.dao.get(id);
    } finally {
      this.busy.delete(id);
    }
  }
}
