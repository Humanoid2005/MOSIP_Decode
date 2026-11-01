import type {
  CredentialConfiguration,
  Environment,
  JsonObject,
  RunSummary,
  TestRun,
} from "./dtos.js";
export interface RunDao {
  summaries(): RunSummary[];
  active(): TestRun | undefined;
  get(id: string): TestRun;
  save(run: TestRun): void;
}
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
export interface IssuerAdapter {
  discover(
    environment: Environment,
    runId?: string,
  ): Promise<{
    metadata: JsonObject;
    configurations: CredentialConfiguration[];
  }>;
}
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
