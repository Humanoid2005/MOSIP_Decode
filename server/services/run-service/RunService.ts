import {
  expiredConfigurationId,
  mdocWalletUnsupported,
  unsupportedDidConfigurationId,
  scenarios,
  scenarioUnavailable,
} from "../../models/scenarios.js";
import { randomUUID } from "node:crypto";
import type { IssuerAdapter, RunDao } from "../../models/contracts.js";
import type { EnvironmentService } from "../EnvironmentService.js";
import type { TelemetryService } from "../telemetry/TelemetryService.js";
import type { OfferService } from "./OfferService.js";
import { AppError, object, requiredString } from "../errors.js";
import type { TestRun } from "../../models/dtos.js";
import { mockWalletFormats } from "../mock-wallet/MockWalletService.js";
export class RunService {
  private starting = false;
  constructor(
    private readonly dao: RunDao,
    private readonly env: EnvironmentService,
    private readonly issuer: IssuerAdapter,
    private readonly telemetry: TelemetryService,
    private readonly offers: OfferService,
  ) {}
  active(): TestRun | undefined {
    return this.dao.active();
  }
  isBusy(): boolean {
    return this.starting || Boolean(this.active());
  }
  async start(value: unknown): Promise<TestRun> {
    if (this.isBusy())
      throw new AppError(
        409,
        "Finish or cancel the current run before starting another.",
      );
    this.starting = true;
    try {
      const input = object(value);
      if (
        !["INJI_MOBILE", "INJI_WEB", "INJI_MIMOTO", "MOCK_WALLET"].includes(
          String(input.wallet),
        )
      )
        throw new AppError(422, "Select a supported wallet.");
      const environment = this.env.get();
      if (input.wallet === "INJI_WEB" && !environment.webWalletUrl)
        throw new AppError(409, "Configure the Inji Web URL first.");
      const discovery = await this.issuer.discover(environment);
      const scenario = scenarios.find(
        (item) => item.id === (input.scenario ?? "NONE"),
      );
      if (!scenario) throw new AppError(422, "Unknown test scenario.");
      const parent =
        typeof input.parentRunId === "string"
          ? this.dao.get(input.parentRunId)
          : undefined;
      if (
        parent &&
        !["COMPLETED", "FAILED", "CANCELLED"].includes(parent.phase)
      )
        throw new AppError(409, "Finish the original run before replaying it.");
      const configuration = discovery.configurations.find(
        (config) =>
          config.id ===
          (scenario.id === "EXPIRED_CREDENTIAL"
            ? expiredConfigurationId
            : scenario.id === "UNSUPPORTED_DID"
              ? unsupportedDidConfigurationId
              : input.configurationId),
      );
      if (!configuration)
        throw new AppError(
          422,
          "Choose a credential configuration advertised by this issuer.",
        );
      const unavailable = scenarioUnavailable(
        scenario.id,
        input.wallet as TestRun["wallet"],
        configuration.format,
        discovery.configurations.some(
          (item) => item.id === expiredConfigurationId,
        ),
        discovery.configurations.some(
          (item) => item.id === unsupportedDidConfigurationId,
        ),
      );
      if (unavailable) throw new AppError(422, unavailable);
      if (
        configuration.id === unsupportedDidConfigurationId &&
        scenario.id !== "UNSUPPORTED_DID"
      )
        throw new AppError(
          422,
          "Select the unsupported DID scenario to use this fixture.",
        );
      if (
        configuration.id === expiredConfigurationId &&
        scenario.id !== "EXPIRED_CREDENTIAL"
      )
        throw new AppError(
          422,
          "Select the expiry scenario to use the expired fixture.",
        );
      if (
        input.wallet === "MOCK_WALLET" &&
        !mockWalletFormats.includes(configuration.format)
      )
        throw new AppError(
          422,
          "The mock wallet supports SD-JWT credentials only.",
        );
      if (
        input.wallet === "INJI_MIMOTO" &&
        (!environment.embeddedWalletUrl || !environment.mimotoUrl)
      )
        throw new AppError(409, "The embedded Inji wallet is not configured.");
      const mdocUnsupported = mdocWalletUnsupported(
        input.wallet as TestRun["wallet"],
        configuration.format,
      );
      if (mdocUnsupported) throw new AppError(422, mdocUnsupported);
      if (input.wallet === "INJI_MIMOTO" && configuration.format !== "ldp_vc")
        throw new AppError(
          422,
          "This Mimoto release supports JSON-LD presentations only. Use the mock wallet for SD-JWT.",
        );
      if (
        ["INJI_MIMOTO", "MOCK_WALLET"].includes(String(input.wallet)) &&
        typeof input.offer === "string" &&
        input.offer.trim()
      )
        throw new AppError(
          422,
          "This wallet uses authorization-code issuance and does not redeem credential offers.",
        );
      const timestamp = new Date().toISOString();
      const run: TestRun = {
        id: randomUUID(),
        scenario: scenario.id,
        scenarioEvidence: { applied: false },
        ...(parent ? { parentRunId: parent.id } : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
        wallet: input.wallet as TestRun["wallet"],
        configuration,
        environment,
        phase: "ISSUING",
        verdict: "PENDING",
        holderConfirmed: false,
        credentialObserved: false,
        credentialMatched: false,
        credentialFingerprints: [],
        events: [],
      };
      this.dao.save(run);
      try {
        await this.issuer.discover(environment, run.id);
        const supplied = typeof input.offer === "string" && input.offer.trim();
        if (supplied || run.wallet === "INJI_MOBILE") {
          const resolved = supplied
            ? await this.offers.resolve(input.offer as string, run)
            : this.offers.authorizationCodeOffer(run);
          const latest = this.dao.get(run.id);
          if (latest.phase !== "ISSUING") return latest;
          latest.offerUri = resolved.uri;
          this.dao.save(latest);
          this.telemetry.record(run.id, {
            source: supplied ? "USER" : "PLAYGROUND",
            title: supplied
              ? "Issuer-provided credential offer"
              : "Credential offer for Inji Mobile (authorization code, built from issuer metadata)",
            method: "",
            endpoint: "",
            status: 0,
            durationMs: 0,
            request: resolved.offer,
            response: null,
          });
        }
      } catch (error) {
        const latest = this.dao.get(run.id);
        if (latest.phase !== "ISSUING") return latest;
        latest.phase = "FAILED";
        latest.verdict = "ERROR";
        if (!(error instanceof AppError)) console.error(error);
        latest.error =
          error instanceof AppError
            ? error.message
            : "Unexpected server error while initiating issuance.";
        this.dao.save(latest);
      }
      this.telemetry.notify(run.id);
      return this.dao.get(run.id);
    } finally {
      this.starting = false;
    }
  }
  confirmHolder(
    id: string,
    receipt = {
      title: "Holder confirmed credential receipt",
      evidence: "User confirmation; not a wallet callback.",
    },
    source: "USER" | "MIMOTO" | "MOCK_WALLET" = "USER",
  ): TestRun {
    const run = this.dao.get(id);
    if (run.phase !== "ISSUING")
      throw new AppError(
        409,
        "Holder confirmation is only available during issuance.",
      );
    if (
      (run.wallet === "INJI_MIMOTO" && source !== "MIMOTO") ||
      (run.wallet === "MOCK_WALLET" && source !== "MOCK_WALLET")
    )
      throw new AppError(
        409,
        "Receipt must be confirmed by the selected wallet storage response.",
      );
    run.phase = "HELD";
    run.holderConfirmed = true;
    run.holderReceiptSource = source;
    run.offerUri = undefined;
    this.dao.save(run);
    this.telemetry.record(id, {
      source: source === "USER" ? "USER" : "WALLET",
      title: receipt.title,
      method: "",
      endpoint: "",
      status: 0,
      durationMs: 0,
      request: null,
      response: { evidence: receipt.evidence },
    });
    return this.dao.get(id);
  }
  cancel(id: string): TestRun {
    const run = this.dao.get(requiredString(id, "runId"));
    if (!["ISSUING", "HELD", "VERIFYING"].includes(run.phase))
      throw new AppError(409, "This run is already finished.");
    run.phase = "CANCELLED";
    run.presentationUri = undefined;
    run.offerUri = undefined;
    run.updatedAt = new Date().toISOString();
    this.dao.save(run);
    this.telemetry.notify(id);
    return run;
  }
}
