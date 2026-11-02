import type {
  CredentialConfiguration,
  Environment,
  JsonObject,
  RunSummary,
  TestRun,
} from "./dtos.js";
// Contracts between the workflow services and their storage, transport and
// Inji adapters, so each can be replaced without touching the workflow.
// Run storage. Reads return copies: a caller changes its copy and save()s it.
// active() returns the newest run in ISSUING, HELD or VERIFYING.
export interface RunDao {
  summaries(): RunSummary[];
  active(): TestRun | undefined;
  get(id: string): TestRun;
  save(run: TestRun): void;
}
// Plain upstream HTTP. body is the parsed JSON response, or the text when it
// is not JSON. Non-2xx responses are returned rather than thrown.
export interface HttpTransport {
  send(
    url: string,
    options?: RequestInit,
  ): Promise<{
    status: number;
    body: unknown;
    durationMs: number;
    headers?: Headers;
  }>;
}
// Reads the issuer's OpenID4VCI metadata and lists the credential
// configurations the playground can run. With a runId the metadata request is
// recorded on that run.
export interface IssuerAdapter {
  discover(
    environment: Environment,
    runId?: string,
  ): Promise<{
    metadata: JsonObject;
    configurations: CredentialConfiguration[];
  }>;
}
// The verifier side of a run: create the OpenID4VP request, poll its status,
// then collect the verdict together with the verifier's per-check evidence.
export interface VerifierAdapter {
  create(
    run: TestRun,
  ): Promise<{ requestId: string; transactionId: string; uri: string }>;
  status(run: TestRun): Promise<string>;
  result(run: TestRun): Promise<{
    verdict: "VALID" | "INVALID" | "EXPIRED";
    payload: unknown;
    credentials: unknown[];
    verification: import("./verification.js").VerificationEvidence;
  }>;
  // Direct credential check, for formats the verifier has no presentation flow for.
  checkCredential(
    run: TestRun,
    credential: string,
  ): Promise<{
    verdict: "VALID" | "INVALID" | "EXPIRED";
    payload: unknown;
    verification: import("./verification.js").VerificationEvidence;
  }>;
}
