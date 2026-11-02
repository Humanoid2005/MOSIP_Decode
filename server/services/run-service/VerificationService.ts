import { scenarioOutcome } from "../../models/scenarios.js";
import type { ScenarioService } from "../scenario-service/ScenarioService.js";
import type { RunDao, VerifierAdapter } from "../../models/contracts.js";
import type { TestRun } from "../../models/dtos.js";
import type { TelemetryService } from "../telemetry/TelemetryService.js";
import { AppError, UpstreamError } from "../errors.js";
import { credentialFingerprint } from "./credentialFingerprint.js";
// Verifier side of a run. Creates the Inji Verify presentation request, polls
// its status and collects the result, reporting the playground's own checks
// on the bridged submission next to Verify's. Upstream outages leave the run
// retryable; a verifier rejection or an unusable verifier response fails it.
export class VerificationService {
  // Runs with a verifier call in flight. begin() refuses an overlapping call
  // and refresh() skips one.
  private readonly busy = new Set<string>();
  // Time of the last status poll per run. Polls from the coordinator and the
  // API share it, so Verify is polled at most once every 2 s per run. Bounded
  // to 100 entries.
  private readonly lastPoll = new Map<string, number>();
  constructor(
    private readonly dao: RunDao,
    private readonly verifier: VerifierAdapter,
    private readonly telemetry: TelemetryService,
    private readonly scenarios: ScenarioService,
  ) {}
  // Moves a held run to VERIFYING by creating a presentation request at Inji
  // Verify; an mDoc run is checked directly instead. The phase is checked
  // again afterwards because the run may be cancelled meanwhile. An
  // unreachable service, 5xx or 429 is recorded on the run and rethrown so the
  // user can retry; any other AppError fails the run at the request stage.
  // Other errors are playground defects and leave the run unchanged.
  async begin(id: string) {
    const run = this.dao.get(id);
    if (run.phase !== "HELD" || this.busy.has(id))
      throw new AppError(
        409,
        "Confirm wallet receipt before requesting a presentation.",
      );
    this.busy.add(id);
    try {
      if (run.configuration.format === "mso_mdoc")
        return await this.checkMdoc(run);
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
  // The verifier has no presentation flow for mDoc, so the bridge-observed
  // credential is checked directly. No holder presentation is involved.
  private async checkMdoc(run: TestRun) {
    if (!run.issuedMdoc) {
      this.scenarios.fail(
        run.id,
        "REQUEST",
        "CREDENTIAL_NOT_OBSERVED",
        "The bridge did not observe the issued mDoc, so there is no credential to send to Inji Verify.",
      );
      return this.dao.get(run.id);
    }
    let result: Awaited<ReturnType<VerifierAdapter["checkCredential"]>>;
    try {
      result = await this.verifier.checkCredential(run, run.issuedMdoc);
    } catch (error) {
      // An HTTP 4xx other than 429 is Verify rejecting the credential. Other
      // errors go to begin(), which treats them as outages or request failures.
      if (
        error instanceof UpstreamError &&
        error.upstreamStatus >= 400 &&
        error.upstreamStatus < 500 &&
        error.upstreamStatus !== 429
      ) {
        this.scenarios.fail(
          run.id,
          "VERIFICATION",
          "VERIFIER_REJECTED",
          error.message,
        );
        return this.dao.get(run.id);
      }
      throw error;
    }
    const latest = this.dao.get(run.id);
    if (latest.phase !== "HELD") return latest;
    latest.phase = "COMPLETED";
    latest.verdict = result.verdict;
    latest.result = result.payload;
    latest.verification = result.verification;
    latest.error = undefined;
    latest.scenarioEvidence = {
      ...latest.scenarioEvidence,
      stage: "VERIFICATION",
      errorCode: result.verdict,
      rejectionReasonConfirmed: false,
      detail: result.verification.upstreamAccepted
        ? "Inji Verify accepted the mDoc in a direct credential check. No presentation took place, so this is not an end-to-end pass."
        : "Inji Verify rejected the mDoc in a direct credential check. Its OpenID4VP flow has no mso_mdoc path.",
    };
    latest.updatedAt = new Date().toISOString();
    this.dao.save(latest);
    this.telemetry.notify(run.id);
    return latest;
  }
  // Shows a transient failure on the run without changing its phase, so a
  // later attempt can still complete it.
  private recordError(id: string, error: Error) {
    const latest = this.dao.get(id);
    if (!["HELD", "VERIFYING"].includes(latest.phase)) return;
    latest.error = error.message;
    latest.updatedAt = new Date().toISOString();
    this.dao.save(latest);
    this.telemetry.notify(id);
  }
  // Polls the run's presentation request once. ACTIVE means the wallet has
  // not submitted yet. Any status other than VP_SUBMITTED, such as EXPIRED,
  // fails the run at the request stage. On VP_SUBMITTED the v2 result is
  // fetched and completes the run. Polls are throttled per run and skipped
  // while another verifier call for the run is in flight.
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
        // Clears an error left by an earlier failed poll.
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
      // Verify's checks are followed by the playground's checks, which the
      // bridge recorded when it forwarded the submission. If the submission
      // was not observed, a NOT_CHECKED entry keeps the run from passing.
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
      // The verified credential must be one the bridge saw issued in this run,
      // and, for result correlation, the one the bridge saw submitted.
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
      // Outages are retryable as in begin(). Any other AppError, such as an
      // upstream 4xx or an inconsistent result, fails the run at verification.
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
