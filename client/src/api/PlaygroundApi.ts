import type { ScenarioId } from "../../../server/models/scenarios";
import type {
  Environment,
  TestRun,
  RunSummary,
  CredentialConfiguration,
  Wallet,
} from "../models/playground";
// Error from the playground or Mimoto API. status is 0 when the server could
// not be reached or timed out; code carries Mimoto's error code, such as
// wallet_locked.
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
// Client for the playground server's REST API under /api/v1.
export class PlaygroundApi {
  // Sends a JSON request with a 60-second timeout. Network failures,
  // unreadable bodies and non-2xx responses all become ApiError, using the
  // server's { error } message when it sends one.
  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`/api/v1${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw new ApiError(
        0,
        "The playground API is unavailable or timed out. Check that the server is running, then refresh the run before retrying.",
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(
        response.status,
        "The API returned an unreadable response. Check the server URL.",
      );
    }
    if (!response.ok)
      throw new ApiError(
        response.status,
        payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
          ? payload.error
          : `Request failed (HTTP ${response.status}).`,
      );
    return payload as T;
  }
  // Stack URLs and settings the server is configured with.
  environment = () => this.request<Environment>("/environment");
  // Live issuer metadata from Inji Certify and its credential configurations
  // in formats the playground supports.
  discovery = () =>
    this.request<{
      metadata: Record<string, unknown>;
      configurations: CredentialConfiguration[];
    }>("/issuer");
  // Summaries of the runs held in the server's memory.
  runs = () => this.request<RunSummary[]>("/runs");
  // One run with its captured events and verification evidence.
  run = (id: string) =>
    this.request<TestRun>(`/runs/${encodeURIComponent(id)}`);
  // Starts a run. offer is a credential offer pasted for Inji Web or Inji
  // Mobile; parentRunId links a scenario rerun to the run it repeats.
  start = (body: {
    wallet: Wallet;
    configurationId: string;
    offer: string;
    scenario?: ScenarioId;
    parentRunId?: string;
  }) => this.request<TestRun>("/runs", "POST", body);
  // Moves a run forward: holder records the user's confirmation that the
  // wallet received the credential, presentation creates the Inji Verify
  // request (or checks an mDoc directly), refresh asks the verifier for a
  // result now, and cancel stops the run locally.
  action = (
    id: string,
    action: "holder" | "cancel" | "presentation" | "refresh",
  ) =>
    this.request<TestRun>(`/runs/${encodeURIComponent(id)}/${action}`, "POST");
  // Mock wallet issuance: returns the authorization URL to open. The server
  // handles the callback and stores the credential in the mock wallet.
  mockAuthorize = (id: string) =>
    this.request<{ url: string }>(
      `/runs/${encodeURIComponent(id)}/mock-wallet/authorize`,
      "POST",
    );
  // Mock wallet presentation: the server answers the run's verifier request
  // with an SD-JWT presentation.
  mockPresent = (id: string) =>
    this.request<TestRun>(
      `/runs/${encodeURIComponent(id)}/mock-wallet/present`,
      "POST",
    );
  // Used directly as a link: the server sends the JSON report as a download.
  reportUrl = (id: string) => `/api/v1/runs/${encodeURIComponent(id)}/report`;
}
export const api = new PlaygroundApi();
