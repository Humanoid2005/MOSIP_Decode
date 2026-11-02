import type { ScenarioService } from "../scenario-service/ScenarioService.js";
import type { Request, Response } from "express";
import type { EnvironmentService } from "../EnvironmentService.js";
import type { ProxyCaptureService } from "./ProxyCaptureService.js";
import { upstreamFailure } from "../telemetry/upstreamFailure.js";
import { AppError } from "../errors.js";
import { parsePayload, safeEndpoint } from "../telemetry/sanitize.js";
// Reads the OAuth "error" code from a parsed response body.
function errorCode(body: unknown): string {
  return body && typeof body === "object" && !Array.isArray(body)
    ? String((body as Record<string, unknown>).error ?? "")
    : "";
}
// A wallet can only retry a rejected proof with a fresh c_nonce from the
// issuer. Certify 0.14 sends none and has no nonce endpoint.
function retryable(body: unknown): boolean {
  return (
    ["invalid_proof", "invalid_nonce"].includes(errorCode(body)) &&
    typeof (body as Record<string, unknown>).c_nonce === "string"
  );
}
// The protocol bridge mounted at /bridge. The gateway sends wallet token,
// credential and presentation exchanges here; each request is forwarded to the
// configured Inji service and recorded on the run it belongs to, and the
// upstream status and body are relayed unchanged.
export class ProtocolProxy {
  constructor(
    private readonly environment: EnvironmentService,
    private readonly capture: ProxyCaptureService,
    private readonly scenarios: ScenarioService,
  ) {}
  // Handles one bridged request: checks it against the allowlist, attributes
  // it to the active run, applies any scenario mutation, runs the playground's
  // presentation checks, forwards it and relays the response.
  async forward(req: Request, res: Response): Promise<void> {
    const match = /^\/(certify|verify|authorization)(\/[^?]*)?(\?.*)?$/.exec(
      req.url,
    );
    if (!match) throw new AppError(404, "Unknown protocol bridge.");
    const role = match[1]!;
    const path = match[2] || "/";
    // Only each service's protocol endpoints are reachable, so the bridge is
    // not a general proxy into the stack. "..", backslashes and any
    // percent-encoded dot, slash or backslash are refused to rule out path
    // traversal.
    const permitted =
      role === "certify"
        ? /^\/(\.well-known\/openid-credential-issuer|credential|nonce|notification)$/
        : role === "verify"
          ? /^\/(vp-request|vp-response|vp-submission|presentation-definition)(\/[^\s]*)?$/
          : /^\/(token|oauth\/token|protocol\/openid-connect\/token|\.well-known\/openid-configuration)$/;
    if (
      !permitted.test(path) ||
      !["GET", "POST"].includes(req.method) ||
      /%2e|%2f|%5c|\.\.|\\/i.test(path)
    )
      throw new AppError(404, "This protocol path is not enabled.");
    const env = this.environment.get();
    const target =
      role === "certify"
        ? env.certifyUrl
        : role === "verify"
          ? env.verifyUrl
          : env.authorizationUrl;
    if (!target)
      throw new AppError(
        409,
        "Configure this upstream service before using the protocol bridge.",
      );
    const url = `${target}${path}${match[3] || ""}`;
    // An upstream configured as the bridge itself would forward in a loop.
    if (url.startsWith(`${env.publicBaseUrl}/bridge/`))
      throw new AppError(
        422,
        "Upstream URL must not point back to the bridge.",
      );
    let body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    let request = parsePayload(body, req.headers["content-type"]);
    const id = this.capture.identify(
      role,
      path,
      req.headers.authorization,
      request,
    );
    // A negative scenario may replace a presentation body. It is parsed again
    // so the recorded request and the playground's checks see what the
    // upstream receives.
    body = await this.scenarios.bridgeBody(
      id,
      path,
      body,
      req.headers["content-type"] ?? "",
    );
    request = parsePayload(body, req.headers["content-type"]);
    this.capture.observeSubmission(id, path, request);
    // Only these request headers are forwarded; cookies and other browser
    // headers stop here. An uncompressed response lets the recorded and relayed
    // bytes be the upstream body as sent.
    const headers: Record<string, string> = { "accept-encoding": "identity" };
    for (const name of ["content-type", "accept", "authorization"])
      if (typeof req.headers[name] === "string")
        headers[name] = req.headers[name];
    const started = Date.now();
    let upstream: globalThis.Response;
    let bytes: Buffer;
    // Redirects are relayed to the wallet rather than followed, and the
    // upstream has 20 seconds to answer. A failed or oversized response is
    // recorded on the run and answered with 504 on timeout, 502 otherwise.
    try {
      upstream = await fetch(url, {
        method: req.method,
        headers,
        ...(req.method === "POST" ? { body: new Uint8Array(body) } : {}),
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
      });
      bytes = await this.read(upstream);
    } catch (error) {
      const timedOut =
        error instanceof DOMException && error.name === "TimeoutError";
      const message = timedOut
        ? "Protocol upstream did not respond in time."
        : "Protocol upstream unavailable or response exceeded limits.";
      this.observe(() =>
        this.capture.capture(id, path, {
          source: "PROXY",
          title: `${role}: connection failure`,
          endpoint: safeEndpoint(url),
          method: req.method,
          status: 0,
          durationMs: Date.now() - started,
          request,
          response: { error: message },
        }),
      );
      throw new AppError(timedOut ? 504 : 502, message);
    }
    const responseBody = parsePayload(
      bytes,
      upstream.headers.get("content-type") || "",
    );
    this.observe(() => {
      this.capture.capture(id, path, {
        source: "PROXY",
        title: `${role}: ${path}`,
        endpoint: safeEndpoint(url),
        method: req.method,
        status: upstream.status,
        durationMs: Date.now() - started,
        request,
        response: responseBody,
      });
      this.judge(id, role, path, upstream.status, responseBody);
    });
    // Relays only the response headers a wallet needs to continue the protocol:
    // content type, redirect target, authentication challenge and retry delay.
    for (const name of [
      "content-type",
      "location",
      "www-authenticate",
      "retry-after",
    ]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(upstream.status).end(bytes);
  }

  // Reads the upstream body, cancelling once it passes 5 MB so a large
  // response cannot exhaust memory.
  private async read(upstream: globalThis.Response): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = upstream.body?.getReader();
    if (reader)
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 5 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Response too large");
        }
        chunks.push(part.value);
      }
    return Buffer.concat(chunks);
  }

  // Fails the run on a definitive upstream rejection. Proof errors that come
  // with a fresh c_nonce are left to the wallet to retry.
  private judge(
    id: string | undefined,
    role: string,
    path: string,
    status: number,
    body: unknown,
  ): void {
    if (!id || status < 400 || status >= 500 || status === 429) return;
    const reason = upstreamFailure(body);
    const detail = `HTTP ${status}${reason ? `: ${reason}` : ""}`;
    if (role === "verify" && path.startsWith("/vp-submission/"))
      this.scenarios.fail(
        id,
        "SUBMISSION",
        "SUBMISSION_REJECTED",
        `Verifier submission endpoint returned ${detail}. Inspect the response; a credential verdict was not inferred.`,
      );
    if (
      role === "certify" &&
      path === "/credential" &&
      !retryable(body)
    )
      this.scenarios.fail(
        id,
        "ISSUANCE",
        "ISSUER_REJECTED",
        `Issuer credential endpoint returned ${detail}. Inspect the captured response.`,
      );
  }

  // Observation must never change what the wallet receives.
  private observe(action: () => void): void {
    try {
      action();
    } catch (error) {
      console.error("Protocol bridge observer failed", error);
    }
  }
}
