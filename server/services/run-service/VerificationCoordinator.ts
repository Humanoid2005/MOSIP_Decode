import type { Server } from "node:http";
import type { RunDao } from "../../models/contracts.js";
import type { VerificationService } from "./VerificationService.js";
import { AppError } from "../errors.js";

export class VerificationCoordinator {
  constructor(
    private readonly dao: RunDao,
    private readonly verification: VerificationService,
  ) {}

  attach(server: Server): void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const poll = async () => {
      let delay = 3000;
      const run = this.dao.active();
      if (run?.phase === "VERIFYING") {
        try {
          await this.verification.refresh(run.id);
        } catch (error) {
          // VerificationService retains the error on the run for retry and reporting.
          if (!(error instanceof AppError)) console.error(error);
          delay = 15000;
        }
      }
      if (!stopped) {
        timer = setTimeout(() => void poll(), delay);
        timer.unref();
      }
    };
    server.once("listening", () => void poll());
    server.once("close", () => {
      stopped = true;
      clearTimeout(timer);
    });
  }
}
