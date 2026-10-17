import type {
  Environment,
  TestRun,
  RunSummary,
  CredentialConfiguration,
  Wallet,
} from "../models/playground";
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export class PlaygroundApi {
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
        (payload as { error?: string }).error || "Request failed.",
      );
    return payload as T;
  }
  environment = () => this.request<Environment>("/environment");
  discovery = () =>
    this.request<{
      metadata: Record<string, unknown>;
      configurations: CredentialConfiguration[];
    }>("/issuer");
  runs = () => this.request<RunSummary[]>("/runs");
  run = (id: string) =>
    this.request<TestRun>(`/runs/${encodeURIComponent(id)}`);
  start = (body: { wallet: Wallet; configurationId: string; offer: string }) =>
    this.request<TestRun>("/runs", "POST", body);
  action = (
    id: string,
    action: "holder" | "cancel" | "presentation" | "refresh",
  ) =>
    this.request<TestRun>(`/runs/${encodeURIComponent(id)}/${action}`, "POST");
  reportUrl = (id: string) => `/api/v1/runs/${encodeURIComponent(id)}/report`;
}
export const api = new PlaygroundApi();
