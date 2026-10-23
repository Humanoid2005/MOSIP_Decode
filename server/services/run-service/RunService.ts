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
    return this.dao
      .all()
      .find((run) => ["ISSUING", "HELD", "VERIFYING"].includes(run.phase));
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
      if (!["INJI_MOBILE", "INJI_WEB", "MOCK_WALLET"].includes(String(input.wallet)))
        throw new AppError(422, "Select a supported wallet.");
      const environment = this.env.get();
      if (input.wallet === "INJI_WEB" && !environment.webWalletUrl)
        throw new AppError(409, "Configure the Inji Web URL first.");
      const discovery = await this.issuer.discover(environment);
      const configuration = discovery.configurations.find(
        (config) => config.id === input.configurationId,
      );
      if (!configuration)
        throw new AppError(
          422,
          "Choose a credential configuration advertised by this issuer.",
        );
      if (
        input.wallet === "MOCK_WALLET" &&
        !mockWalletFormats.includes(configuration.format)
      )
        throw new AppError(
          422,
          "The mock wallet supports SD-JWT credentials only.",
        );
      const timestamp = new Date().toISOString();
      const run: TestRun = {
        id: randomUUID(),
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
        if (typeof input.offer === "string" && input.offer.trim()) {
          const resolved = await this.offers.resolve(input.offer, run);
          const latest = this.dao.get(run.id);
          if (latest.phase !== "ISSUING") return latest;
          latest.offerUri = resolved.uri;
          this.dao.save(latest);
          this.telemetry.record(run.id, {
            source: "USER",
            title: "Issuer-provided credential offer",
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
        latest.error =
          error instanceof Error
            ? error.message
            : "Unable to initiate issuance.";
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
  ): TestRun {
    const run = this.dao.get(id);
    if (run.phase !== "ISSUING")
      throw new AppError(
        409,
        "Holder confirmation is only available during issuance.",
      );
    run.phase = "HELD";
    run.holderConfirmed = true;
    run.offerUri = undefined;
    this.dao.save(run);
    this.telemetry.record(id, {
      source: run.wallet === "MOCK_WALLET" ? "WALLET" : "USER",
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
