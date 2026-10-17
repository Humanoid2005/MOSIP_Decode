import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { RunDao } from "../../models/contracts.js";
import type { ProtocolEvent } from "../../models/dtos.js";
import { boundedPayload } from "./sanitize.js";
export class TelemetryService {
  readonly changes = new EventEmitter();
  constructor(private readonly runs: RunDao) {}
  notify(runId: string): void {
    this.changes.emit("change", runId);
  }
  record(runId: string, event: Omit<ProtocolEvent, "id" | "timestamp">): void {
    const run = this.runs.get(runId);
    run.events.push({
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      request: boundedPayload(event.request),
      response: boundedPayload(event.response),
    });
    if (run.events.length > 300) run.events.shift();
    run.updatedAt = new Date().toISOString();
    this.runs.save(run);
    this.notify(runId);
  }
}
