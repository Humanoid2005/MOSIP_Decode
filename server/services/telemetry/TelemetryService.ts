import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { RunDao } from "../../models/contracts.js";
import type { ProtocolEvent } from "../../models/dtos.js";
import { boundedPayload } from "./sanitize.js";
// Two events record the same exchange when title, method, endpoint, status and
// payloads match; IDs, timestamps and durations differ between repeated polls.
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
// Keeps each run's protocol timeline, the event list the inspector and report
// show. Payloads are redacted and bounded before storage, only the latest 300
// events are kept, and every change is announced to TelemetrySocket.
export class TelemetryService {
  // Emits "change" with a run ID whenever browsers should refetch that run.
  readonly changes = new EventEmitter();
  constructor(private readonly runs: RunDao) {}
  // Announces a run change made outside record(), such as a phase change.
  notify(runId: string): void {
    this.changes.emit("change", runId);
  }
  // Appends an event to the run's timeline. Throws 404 if the run is gone.
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
