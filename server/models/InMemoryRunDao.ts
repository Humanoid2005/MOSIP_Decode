import type { RunDao } from "./contracts.js";
import type { TestRun } from "./dtos.js";
import { AppError } from "../services/errors.js";
export class InMemoryRunDao implements RunDao {
  private readonly runs = new Map<string, TestRun>();
  all(): TestRun[] {
    return [...this.runs.values()].reverse().map((run) => structuredClone(run));
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
  save(run: TestRun): void {
    if (!this.runs.has(run.id) && this.runs.size >= 100) {
      const oldest = this.runs.keys().next().value;
      if (oldest) this.runs.delete(oldest);
    }
    this.runs.set(run.id, structuredClone(run));
  }
}
