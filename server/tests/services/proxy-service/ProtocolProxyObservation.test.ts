import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { InMemoryRunDao } from "../../../models/InMemoryRunDao.js";
import { AppError } from "../../../services/errors.js";
import { ScenarioService } from "../../../services/scenario-service/ScenarioService.js";
import { TelemetryService } from "../../../services/telemetry/TelemetryService.js";
import { testRun } from "../../fixtures.js";
import { bridge, listen } from "./bridge.js";

let upstream: Awaited<ReturnType<typeof listen>>;

before(async () => {
  upstream = await listen((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString();
      const error = body ? JSON.parse(body).error : undefined;
      res.writeHead(error ? 400 : 200, { "content-type": "application/json" });
      res.end(
        JSON.stringify(error ? { error, c_nonce: "fresh" } : { ok: true }),
      );
    });
  });
});
after(() => upstream.close());

async function send(
  path: string,
  stubs: Parameters<typeof bridge>[1],
  body?: object,
) {
  const proxy = await bridge(upstream.url, stubs);
  try {
    return await fetch(`${proxy.url}/bridge${path}`, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } finally {
    await proxy.close();
  }
}

test("an observer failure does not replace a successful upstream response", async () => {
  const logged = console.error;
  console.error = () => {};
  try {
    const response = await send(
      "/certify/credential",
      {
        identify: () => "run-1",
        capture: () => {
          throw new Error("run evicted");
        },
      },
      { proof: {} },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    console.error = logged;
  }
});

test("relays upstream bytes without adding an ETag", async () => {
  const response = await send(
    "/certify/.well-known/openid-credential-issuer",
    {},
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("etag"), null);
});

test("an unreachable upstream is a 502 recorded as a connection failure", async () => {
  const captured: unknown[] = [];
  const proxy = await bridge("http://127.0.0.1:1", {
    identify: () => "run-1",
    capture: (...args: unknown[]) => void captured.push(args),
  });
  try {
    const response = await fetch(`${proxy.url}/bridge/certify/nonce`, {
      method: "POST",
    });
    assert.equal(response.status, 502);
    assert.match(JSON.stringify(captured), /connection failure/);
  } finally {
    await proxy.close();
  }
});

for (const error of ["invalid_proof", "invalid_nonce"])
  test(`leaves retryable ${error} credential errors to the wallet`, async () => {
    const failures: unknown[][] = [];
    const response = await send(
      "/certify/credential",
      { identify: () => "run-1", failures },
      { error },
    );
    assert.equal(response.status, 400);
    assert.deepEqual(failures, []);
  });

test("fails the run on a definitive credential rejection", async () => {
  const failures: unknown[][] = [];
  await send(
    "/certify/credential",
    { identify: () => "run-1", failures },
    {
      error: "unsupported_credential_format",
    },
  );
  assert.equal(failures.length, 1);
  assert.deepEqual(failures[0]!.slice(0, 3), [
    "run-1",
    "ISSUANCE",
    "ISSUER_REJECTED",
  ]);
});

test("fails the run when the verifier rejects a submission", async () => {
  const failures: unknown[][] = [];
  await send(
    "/verify/vp-submission/direct-post",
    { identify: () => "run-1", failures },
    {
      error: "invalid_request",
    },
  );
  assert.deepEqual(failures[0]!.slice(0, 3), [
    "run-1",
    "SUBMISSION",
    "SUBMISSION_REJECTED",
  ]);
});

test("a presentation that cannot be mutated fails the run with its cause", async () => {
  for (const body of ['{"vp_token":{"proof":{}}}', "{not json"]) {
    const dao = new InMemoryRunDao();
    dao.save(
      testRun({
        wallet: "INJI_MIMOTO",
        scenario: "BAD_SIGNATURE",
        phase: "VERIFYING",
        configuration: {
          id: "FarmerCredential",
          name: "Farmer",
          format: "ldp_vc",
          proofTypes: [],
        },
      }),
    );
    const scenarios = new ScenarioService(
      dao,
      new TelemetryService(dao),
      {} as never,
    );
    await assert.rejects(
      scenarios.bridgeBody(
        "run-1",
        "/vp-submission/direct-post",
        Buffer.from(body),
        "application/json",
      ),
      (error) => error instanceof AppError && error.status === 422,
    );
    const run = dao.get("run-1");
    assert.equal(run.phase, "FAILED");
    assert.equal(run.scenarioEvidence.errorCode, "MUTATION_FAILED");
    assert.equal(run.scenarioEvidence.stage, "SUBMISSION");
  }
});
