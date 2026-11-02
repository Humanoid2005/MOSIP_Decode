import type { RunDao } from "./contracts.js";
import type { RunSummary, TestRun } from "./dtos.js";
import { AppError } from "../services/errors.js";
const activePhases: TestRun["phase"][] = ["ISSUING", "HELD", "VERIFYING"];
// Bounded in-memory run history. Reads and writes are deep copies, so a
// caller's change takes effect only when it saves the run. History is lost
// when the server restarts.
// Summaries and the active lookup avoid cloning event histories, which the
// bridge, coordinator and run list hit on every request or poll.
export class InMemoryRunDao implements RunDao {
  private readonly runs = new Map<string, TestRun>();
  // Newest first.
  summaries(): RunSummary[] {
    return [...this.runs.values()]
      .reverse()
      .map(
        ({
          events,
          result,
          offerUri,
          presentationUri,
          credentialFingerprints,
          issuedMdoc,
          ...run
        }) => ({ ...structuredClone(run), eventCount: events.length }),
      );
  }
  // The newest run still in an active phase, if any.
  active(): TestRun | undefined {
    const run = [...this.runs.values()]
      .reverse()
      .find((item) => activePhases.includes(item.phase));
    return run && structuredClone(run);
  }
  get(id: string): TestRun {
    const run = this.runs.get(id);
    if (!run)
      throw new AppError(
        404,
        "Run not found. History resets when the server restarts.",
      );
    return structuredClone(run);
  }
  // Saving a new run when 100 are stored evicts the oldest one.
  save(run: TestRun): void {
    if (!this.runs.has(run.id) && this.runs.size >= 100) {
      const oldest = this.runs.keys().next().value;
      if (oldest) this.runs.delete(oldest);
    }
    this.runs.set(run.id, structuredClone(run));
  }
}
