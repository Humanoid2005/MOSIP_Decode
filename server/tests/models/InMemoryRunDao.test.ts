import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryRunDao } from "../../models/InMemoryRunDao.js";
import { AppError } from "../../services/errors.js";
import { testRun } from "../fixtures.js";
// InMemoryRunDao: copy isolation, newest-first listing, the 100-run limit,
// fields left out of summaries, and the active-run lookup.

test("returns copies so callers cannot mutate stored runs", () => {
  const dao = new InMemoryRunDao();
  const run = testRun();
  dao.save(run);
  run.phase = "FAILED";
  const stored = dao.get(run.id);
  assert.equal(stored.phase, "ISSUING");
  stored.events.push({} as never);
  assert.equal(dao.get(run.id).events.length, 0);
});

test("lists newest first and evicts the oldest run beyond 100", () => {
  const dao = new InMemoryRunDao();
  for (let i = 0; i < 101; i++) dao.save(testRun({ id: `run-${i}` }));
  const summaries = dao.summaries();
  assert.equal(summaries.length, 100);
  assert.equal(summaries[0]!.id, "run-100");
  assert.throws(() => dao.get("run-0"), AppError);
  // Updating a stored run at the limit does not evict another.
  dao.save(testRun({ id: "run-1", phase: "HELD" }));
  assert.equal(dao.summaries().length, 100);
  assert.equal(dao.get("run-1").phase, "HELD");
});

test("summaries omit event payloads and wallet handoff secrets", () => {
  const dao = new InMemoryRunDao();
  dao.save(
    testRun({
      offerUri: "openid-credential-offer://?pre-authorized_code=secret",
      events: [{ id: "e1" } as never, { id: "e2" } as never],
      credentialFingerprints: ["abc"],
    }),
  );
  const [summary] = dao.summaries();
  assert.equal(summary!.eventCount, 2);
  for (const field of ["events", "offerUri", "credentialFingerprints"])
    assert.equal(field in summary!, false);
});

test("finds the newest unfinished run as a copy", () => {
  const dao = new InMemoryRunDao();
  dao.save(testRun({ id: "done", phase: "COMPLETED" }));
  assert.equal(dao.active(), undefined);
  dao.save(testRun({ id: "live", phase: "VERIFYING" }));
  dao.save(testRun({ id: "later", phase: "CANCELLED" }));
  const active = dao.active()!;
  assert.equal(active.id, "live");
  active.phase = "FAILED";
  assert.equal(dao.get("live").phase, "VERIFYING");
});

test("reports unknown runs as 404", () => {
  assert.throws(
    () => new InMemoryRunDao().get("missing"),
    (error) => error instanceof AppError && error.status === 404,
  );
});
