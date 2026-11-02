import { createHash } from "node:crypto";
import type { HttpTransport } from "../../models/contracts.js";
import type { MimotoContext } from "../../models/MimotoSession.js";
import type { TelemetryService } from "../telemetry/TelemetryService.js";
import { AppError, UpstreamError } from "../errors.js";
// HTTP client for Mimoto's wallet API, called on behalf of the signed-in
// browser. It forwards the browser's session cookie and CSRF token, so Mimoto
// applies its own authentication exactly as it would for Inji Web.
export class MimotoClient {
  constructor(
    private readonly http: HttpTransport,
    private readonly telemetry: TelemetryService,
  ) {}
  // Identifies the wallet session by a hash of its session cookie, so runs can
  // be tied to a session without storing the cookie itself.
  owner(context: MimotoContext): string {
    const session = context.cookie
      .split(/;\s*/)
      .find((value) => /^(SESSION|JSESSIONID)=/.test(value));
    if (!session) throw new AppError(401, "Sign in to the Inji wallet first.");
    return createHash("sha256").update(session).digest("hex");
  }
  // Sends one request to Mimoto and passes any refreshed cookies back to the
  // browser. Calls made for a run are recorded as wallet events in its
  // telemetry. Non-2xx responses become UpstreamError with Mimoto's own error
  // code and message. Accept-Language is fixed to "en" because Mimoto rejects
  // a browser's language list (gap M5).
  async send(
    base: string,
    path: string,
    context: MimotoContext,
    method = "GET",
    body?: unknown,
    runId?: string,
  ) {
    const response = await this.http.send(`${base}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Accept-Language": "en",
        Cookie: context.cookie,
        "X-XSRF-TOKEN": context.csrfToken,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    context.setCookies(response.headers?.getSetCookie() ?? []);
    if (runId)
      this.telemetry.record(runId, {
        source: "WALLET",
        title: `Mimoto: ${method} ${path}`,
        method,
        endpoint: `${base}${path}`,
        status: response.status,
        durationMs: response.durationMs,
        request: body ?? null,
        response: response.body,
      });
    if (response.status < 200 || response.status >= 300) {
      const error =
        response.body && typeof response.body === "object"
          ? (response.body as Record<string, unknown>)
          : {};
      throw new UpstreamError(
        response.status,
        typeof error.errorMessage === "string"
          ? error.errorMessage
          : `Mimoto returned HTTP ${response.status}. Sign in or unlock your wallet again if the session expired.`,
        typeof error.errorCode === "string"
          ? error.errorCode
          : "WALLET_REQUEST_FAILED",
      );
    }
    return response.body;
  }
}
