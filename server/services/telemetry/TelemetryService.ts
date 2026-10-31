import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { RunDao } from "../../models/contracts.js";
import type { ProtocolEvent } from "../../models/dtos.js";
import { boundedPayload } from "./sanitize.js";
function sameExchange(a: ProtocolEvent, b: ProtocolEvent): boolean {
  return (
    a.title === b.title &&
    a.method === b.method &&
    a.endpoint === b.endpoint &&
    a.status === b.status &&
    JSON.stringify([a.request, a.response]) ===
      JSON.stringify([b.request, b.response])
  );
}
export class TelemetryService {
  readonly changes = new EventEmitter();
  constructor(private readonly runs: RunDao) {}
  notify(runId: string): void {
    this.changes.emit("change", runId);
  }
  record(
    runId: string,
    event: Omit<ProtocolEvent, "id" | "timestamp">,
    options: { coalesce?: boolean } = {},
  ): void {
    const run = this.runs.get(runId);
    const next: ProtocolEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      request: boundedPayload(event.request),
      response: boundedPayload(event.response),
    };
    const last = run.events.at(-1);
    // Identical consecutive polls are counted instead of crowding out the
    // issuance evidence within the event limit; a count alone needs no push.
    if (options.coalesce && last && sameExchange(last, next)) {
      run.events[run.events.length - 1] = {
        ...next,
        id: last.id,
        repeats: (last.repeats ?? 1) + 1,
      };
      this.runs.save(run);
      return;
    }
    run.events.push(next);
    if (run.events.length > 300) run.events.shift();
    run.updatedAt = new Date().toISOString();
    this.runs.save(run);
    this.notify(runId);
  }
}
