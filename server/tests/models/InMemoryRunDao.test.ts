import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryRunDao } from "../../models/InMemoryRunDao.js";
import { AppError } from "../../services/errors.js";
import { testRun } from "../fixtures.js";

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
  const all = dao.all();
  assert.equal(all.length, 100);
  assert.equal(all[0]!.id, "run-100");
  assert.throws(() => dao.get("run-0"), AppError);
  dao.save(testRun({ id: "run-1", phase: "HELD" }));
  assert.equal(dao.all().length, 100);
  assert.equal(dao.get("run-1").phase, "HELD");
});

test("reports unknown runs as 404", () => {
  assert.throws(
    () => new InMemoryRunDao().get("missing"),
    (error) => error instanceof AppError && error.status === 404,
  );
});
