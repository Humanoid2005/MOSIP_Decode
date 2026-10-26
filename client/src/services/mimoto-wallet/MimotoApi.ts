import { ApiError } from "../../api/PlaygroundApi";
import type {
  InjiWallet,
  StoredCredential,
  WalletPresentation,
} from "../../models/mimoto";
import type { TestRun } from "../../models/playground";
export const walletLoginKey = "playground.wallet.login";
export const walletIssuanceKey = "playground.wallet.issuance";
export function signInToWallet() {
  sessionStorage.setItem(walletLoginKey, "workbench");
  location.assign("/v1/mimoto/oauth2/authorize/google");
}
class MimotoApi {
  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const token = document.cookie
      .split(/;\s*/)
      .find((value) => value.startsWith("XSRF-TOKEN="))
      ?.slice("XSRF-TOKEN=".length);
    let response: Response;
    try {
      response = await fetch(`/v1/mimoto${path}`, {
        method,
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(token ? { "X-XSRF-TOKEN": decodeURIComponent(token) } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw new ApiError(
        0,
        "The wallet request timed out or could not connect. Refresh the wallet before retrying.",
      );
    }
    const data: unknown = await response.json().catch(() => null);
    if (!data || typeof data !== "object")
      throw new ApiError(
        response.status,
        `The wallet returned an unreadable response (HTTP ${response.status}). Refresh the wallet before retrying.`,
      );
    const error = data as Record<string, unknown>;
    if (!response.ok)
      throw new ApiError(
        response.status,
        typeof error.errorMessage === "string"
          ? error.errorMessage
          : typeof error.error === "string"
            ? error.error
            : `Wallet returned HTTP ${response.status}.`,
      );
    return data as T;
  }
  wallets = () => this.request<InjiWallet[]>("/wallets");
  create = (walletPin: string, confirmWalletPin: string) =>
    this.request<InjiWallet>("/wallets", "POST", {
      walletName: "Playground wallet",
      walletPin,
      confirmWalletPin,
    });
  unlock = (id: string, walletPin: string) =>
    this.request<InjiWallet>(
      `/wallets/${encodeURIComponent(id)}/unlock`,
      "POST",
      { walletPin },
    );
  credentials = (id: string) =>
    this.request<StoredCredential[]>(
      `/wallets/${encodeURIComponent(id)}/credentials`,
    );
  authorize = (id: string, walletId: string) =>
    this.request<{ url: string }>(
      `/playground/runs/${encodeURIComponent(id)}/authorize`,
      "POST",
      { walletId },
    );
  complete = (id: string, state: string, code: string) =>
    this.request<TestRun>(
      `/playground/runs/${encodeURIComponent(id)}/complete`,
      "POST",
      { state, code },
    );
  prepare = (id: string) =>
    this.request<WalletPresentation>(
      `/playground/runs/${encodeURIComponent(id)}/prepare`,
      "POST",
    );
  submit = (id: string) =>
    this.request<TestRun>(
      `/playground/runs/${encodeURIComponent(id)}/submit`,
      "POST",
    );
}
export const mimotoApi = new MimotoApi();
