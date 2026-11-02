import type { ScenarioService } from "../scenario-service/ScenarioService.js";
import type { RunDao } from "../../models/contracts.js";
import type {
  MimotoContext,
  MimotoSession,
  MimotoSessionDao,
} from "../../models/MimotoSession.js";
import type { RunService } from "../run-service/RunService.js";
import type { MimotoClient } from "./MimotoClient.js";
import type { MimotoIssuanceService } from "./MimotoIssuanceService.js";
import type { MimotoPresentationService } from "./MimotoPresentationService.js";
import { AppError, UpstreamError } from "../errors.js";
// Entry point for the embedded Inji wallet ("Inji wallet · in this page").
// Mimoto keeps the keys and the stored credential; this service binds each
// wallet action to a run, checks the run's phase and the caller's Mimoto
// session, and lets only one action per run proceed at a time.
export class MimotoWalletService {
  // Runs with a wallet action in flight; see exclusive().
  private readonly busy = new Set<string>();
  constructor(
    private readonly runs: RunService,
    private readonly dao: RunDao,
    private readonly sessions: MimotoSessionDao,
    private readonly client: MimotoClient,
    private readonly issuance: MimotoIssuanceService,
    private readonly presentation: MimotoPresentationService,
    private readonly scenarios: ScenarioService,
  ) {}
  // Binds the run to the caller's Mimoto session and returns the issuer's
  // authorization URL. The phase is checked again after the upstream calls,
  // because the run may have failed or moved on while they were in flight.
  async authorize(id: string, walletId: string, context: MimotoContext) {
    return this.exclusive(id, async () => {
      const run = this.run(id, "ISSUING");
      const existing = this.sessions.get(id);
      const owner = this.client.owner(context);
      if (existing && existing.owner !== owner)
        throw new AppError(403, "This run belongs to another wallet session.");
      const session: MimotoSession = { runId: id, owner, walletId };
      const result = await this.issuance.authorize(run, session, context);
      this.run(id, "ISSUING");
      this.sessions.save(session);
      return result;
    });
  }
  // Handles the authorization callback: Mimoto redeems the code, downloads the
  // credential and stores it, and the stored credential ID becomes the holder
  // receipt. Session errors (401, 403, 423, 429) can be fixed by signing in or
  // unlocking again; any other upstream failure fails the run at the storage
  // stage, because the authorization code has already been consumed.
  async complete(
    id: string,
    state: string,
    code: string,
    context: MimotoContext,
  ) {
    return this.exclusive(id, async () => {
      const run = this.run(id, "ISSUING");
      const session = this.session(id, context);
      try {
        await this.issuance.complete(run, session, context, state, code);
      } catch (error) {
        if (
          error instanceof UpstreamError &&
          ![401, 403, 423, 429].includes(error.upstreamStatus)
        ) {
          this.scenarios.fail(
            id,
            "WALLET_STORAGE",
            error.errorCode,
            `Mimoto did not store the credential (HTTP ${error.upstreamStatus}): ${error.message}. The authorization was consumed; replay with fresh issuance.`,
          );
        }
        throw error;
      }
      this.run(id, "ISSUING");
      return this.runs.confirmHolder(
        id,
        {
          title: "Mimoto stored the credential",
          evidence:
            "Mimoto's authenticated wallet API returned the stored credential ID.",
        },
        "MIMOTO",
      );
    });
  }
  // Hands the run's verifier request to Mimoto and returns what the user
  // reviews before consenting: the verifier and the matching credential.
  async prepare(id: string, context: MimotoContext) {
    return this.exclusive(id, () =>
      this.presentation.prepare(
        this.run(id, "VERIFYING"),
        this.session(id, context),
        context,
      ),
    );
  }
  // Records the user's consent: Mimoto signs the presentation and submits it
  // to the verifier. VerificationCoordinator collects the verdict afterwards.
  async submit(id: string, context: MimotoContext) {
    return this.exclusive(id, async () => {
      await this.presentation.submit(
        this.run(id, "VERIFYING"),
        this.session(id, context),
        context,
      );
      return this.dao.get(id);
    });
  }
  // Loads the run and refuses wallet actions for other wallets or the wrong phase.
  private run(id: string, phase: string) {
    const run = this.dao.get(id);
    if (run.wallet !== "INJI_MIMOTO" || run.phase !== phase)
      throw new AppError(
        409,
        `This wallet action requires an embedded Inji run in phase ${phase}.`,
      );
    return run;
  }
  // Only the Mimoto session that started the run may continue it, so a
  // signed-in session in another browser cannot complete or present it.
  private session(id: string, context: MimotoContext) {
    const session = this.sessions.get(id);
    if (!session || session.owner !== this.client.owner(context))
      throw new AppError(
        403,
        "The wallet session changed or expired. Start a new run after signing in.",
      );
    return session;
  }
  // Serializes wallet actions per run; a double click or a second tab gets 409
  // instead of racing the same authorization code or presentation.
  private async exclusive<T>(id: string, action: () => Promise<T>) {
    if (this.busy.has(id))
      throw new AppError(409, "A wallet action is already in progress.");
    this.busy.add(id);
    try {
      return await action();
    } finally {
      this.busy.delete(id);
    }
  }
}
