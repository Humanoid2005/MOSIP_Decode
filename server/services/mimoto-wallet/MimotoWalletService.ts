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
export class MimotoWalletService {
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
  async prepare(id: string, context: MimotoContext) {
    return this.exclusive(id, () =>
      this.presentation.prepare(
        this.run(id, "VERIFYING"),
        this.session(id, context),
        context,
      ),
    );
  }
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
  private run(id: string, phase: string) {
    const run = this.dao.get(id);
    if (run.wallet !== "INJI_MIMOTO" || run.phase !== phase)
      throw new AppError(
        409,
        `This wallet action requires an embedded Inji run in phase ${phase}.`,
      );
    return run;
  }
  private session(id: string, context: MimotoContext) {
    const session = this.sessions.get(id);
    if (!session || session.owner !== this.client.owner(context))
      throw new AppError(
        403,
        "The wallet session changed or expired. Start a new run after signing in.",
      );
    return session;
  }
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
