import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryRunDao } from "../../../models/InMemoryRunDao.js";
import type { ProtocolEvent } from "../../../models/dtos.js";
import { TelemetryService } from "../../../services/telemetry/TelemetryService.js";
import { testRun } from "../../fixtures.js";
// TelemetryService: status poll coalescing, event retention and payload
// redaction.

// A Verify status poll event with the given status.
const poll = (status: string): Omit<ProtocolEvent, "id" | "timestamp"> => ({
  source: "HTTP",
  title: "Presentation status",
  method: "GET",
  endpoint: "https://verifier.test/v1/verify/vp-request/req-1/status",
  status: 200,
  durationMs: 5,
  request: null,
  response: { status },
});

function setup() {
  const dao = new InMemoryRunDao();
  dao.save(testRun({ phase: "VERIFYING" }));
  const telemetry = new TelemetryService(dao);
  const notified: string[] = [];
  telemetry.changes.on("change", (id: string) => notified.push(id));
  return { dao, telemetry, notified };
}

test("counts identical consecutive polls in a single event", () => {
  const { dao, telemetry, notified } = setup();
  for (let i = 0; i < 5; i++)
    telemetry.record("run-1", poll("ACTIVE"), { coalesce: true });
  const events = dao.get("run-1").events;
  assert.equal(events.length, 1);
  assert.equal(events[0]!.repeats, 5);
  assert.equal(notified.length, 1);
});

test("records a changed poll result as a new event", () => {
  const { dao, telemetry } = setup();
  telemetry.record("run-1", poll("ACTIVE"), { coalesce: true });
  telemetry.record("run-1", poll("VP_SUBMITTED"), { coalesce: true });
  assert.deepEqual(
    dao.get("run-1").events.map((event) => event.repeats),
    [undefined, undefined],
  );
});

test("keeps every exchange when coalescing is not requested", () => {
  const { dao, telemetry } = setup();
  telemetry.record("run-1", poll("ACTIVE"));
  telemetry.record("run-1", poll("ACTIVE"));
  assert.equal(dao.get("run-1").events.length, 2);
});

test("long polling no longer evicts the earliest issuance evidence", () => {
  const { dao, telemetry } = setup();
  telemetry.record("run-1", { ...poll("issued"), title: "Credential issued" });
  // More polls than the 300-event limit.
  for (let i = 0; i < 400; i++)
    telemetry.record("run-1", poll("ACTIVE"), { coalesce: true });
  assert.equal(dao.get("run-1").events[0]!.title, "Credential issued");
});

test("redacts and bounds recorded payloads", () => {
  const { dao, telemetry } = setup();
  telemetry.record("run-1", { ...poll("x"), request: { access_token: "t" } });
  assert.deepEqual(dao.get("run-1").events[0]!.request, {
    access_token: "[redacted]",
  });
});
