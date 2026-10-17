import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { boundedPayload } from "./sanitize.js";
export class TelemetryService {
    runs;
    changes = new EventEmitter();
    constructor(runs) {
        this.runs = runs;
    }
    notify(runId) {
        this.changes.emit("change", runId);
    }
    record(runId, event) {
        const run = this.runs.get(runId);
        run.events.push({
            ...event,
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            request: boundedPayload(event.request),
            response: boundedPayload(event.response),
        });
        if (run.events.length > 300)
            run.events.shift();
        run.updatedAt = new Date().toISOString();
        this.runs.save(run);
        this.notify(runId);
    }
}
