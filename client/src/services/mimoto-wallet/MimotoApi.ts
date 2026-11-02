import { ApiError } from "../../api/PlaygroundApi";
import type {
  InjiWallet,
  StoredCredential,
  WalletPresentation,
} from "../../models/mimoto";
import type { TestRun } from "../../models/playground";
// sessionStorage keys that survive the full-page redirects of the embedded
// wallet. walletLoginKey marks a sign-in started from the workbench;
// walletIssuanceKey holds the run ID and state of a pending authorization.
export const walletLoginKey = "playground.wallet.login";
export const walletIssuanceKey = "playground.wallet.issuance";
// Starts Mimoto's account sign-in. Its "google" login provider is configured
// to use the local Keycloak, which also offers registration. Mimoto then
// returns to /playground/login-return, where the marker set here sends the
// browser back to the workbench.
export function signInToWallet() {
  sessionStorage.setItem(walletLoginKey, "workbench");
  location.assign("/v1/mimoto/oauth2/authorize/google");
}
// Browser client for the embedded Inji wallet. Requests go to /v1/mimoto on
// the page's own origin so Mimoto's session cookie is sent, which is why the
// embedded wallet works only on the secure workbench origin.
class MimotoApi {
  // Sends the session cookie and copies the XSRF-TOKEN cookie into the
  // X-XSRF-TOKEN header, as Mimoto's CSRF protection requires. Failures become
  // ApiError with Mimoto's errorMessage and errorCode when present.
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
          // Mimoto rejects the browser's default list; it accepts a bare 2-letter code.
          "Accept-Language": "en",
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
        typeof error.errorCode === "string" ? error.errorCode : undefined,
      );
    return data as T;
  }
  // The signed-in user's wallets. A 401 or 403 here means no Mimoto session.
  wallets = () => this.request<InjiWallet[]>("/wallets");
  // Creates a wallet protected by the user's PIN.
  create = (walletPin: string, confirmWalletPin: string) =>
    this.request<InjiWallet>("/wallets", "POST", {
      walletName: "Playground wallet",
      walletPin,
      confirmWalletPin,
    });
  // Unlocks a wallet for the current Mimoto session.
  unlock = (id: string, walletPin: string) =>
    this.request<InjiWallet>(
      `/wallets/${encodeURIComponent(id)}/unlock`,
      "POST",
      { walletPin },
    );
  // Stored credentials. Mimoto refuses this for a locked wallet, so the
  // workbench also uses it to learn whether the wallet is unlocked.
  credentials = (id: string) =>
    this.request<StoredCredential[]>(
      `/wallets/${encodeURIComponent(id)}/credentials`,
    );
  // The remaining calls use the playground server's routes under
  // /v1/mimoto/playground, which act on Mimoto with this session's cookies.
  // authorize returns the issuer's authorization URL for the run, complete
  // passes back the code from the callback, prepare opens the verifier request
  // for review, and submit shares the credential after consent.
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
