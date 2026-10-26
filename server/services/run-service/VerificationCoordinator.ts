import type { Server } from "node:http";
import type { RunDao } from "../../models/contracts.js";
import type { VerificationService } from "./VerificationService.js";

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
      const run = this.dao.all().find((item) => item.phase === "VERIFYING");
      if (run) {
        try {
          await this.verification.refresh(run.id);
        } catch {
          // VerificationService retains the error on the run for retry and reporting.
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
