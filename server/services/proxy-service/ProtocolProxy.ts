import type { Request, Response } from "express";
import type { EnvironmentService } from "../EnvironmentService.js";
import type { ProxyCaptureService } from "./ProxyCaptureService.js";
import { AppError } from "../errors.js";
import { parsePayload, safeEndpoint } from "../telemetry/sanitize.js";
export class ProtocolProxy {
  constructor(
    private readonly environment: EnvironmentService,
    private readonly capture: ProxyCaptureService,
  ) {}
  async forward(req: Request, res: Response): Promise<void> {
    const match = /^\/(certify|verify|authorization)(\/[^?]*)?(\?.*)?$/.exec(
      req.url,
    );
    if (!match) throw new AppError(404, "Unknown protocol bridge.");
    const role = match[1]!;
    const path = match[2] || "/";
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
    if (url.startsWith(`${env.publicBaseUrl}/bridge/`))
      throw new AppError(
        422,
        "Upstream URL must not point back to the bridge.",
      );
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const request = parsePayload(body, req.headers["content-type"]);
    const id = this.capture.identify(
      role,
      path,
      req.headers.authorization,
      request,
    );
    const headers: Record<string, string> = { "accept-encoding": "identity" };
    for (const name of ["content-type", "accept", "authorization"])
      if (typeof req.headers[name] === "string")
        headers[name] = req.headers[name];
    const started = Date.now();
    try {
      const upstream = await fetch(url, {
        method: req.method,
        headers,
        ...(req.method === "POST" ? { body: new Uint8Array(body) } : {}),
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
      });
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
      const bytes = Buffer.concat(chunks);
      this.capture.capture(id, path, {
        source: "PROXY",
        title: `${role}: ${path}`,
        endpoint: safeEndpoint(url),
        method: req.method,
        status: upstream.status,
        durationMs: Date.now() - started,
        request,
        response: parsePayload(
          bytes,
          upstream.headers.get("content-type") || "",
        ),
      });
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
      res.status(upstream.status).send(bytes);
    } catch {
      this.capture.capture(id, path, {
        source: "PROXY",
        title: `${role}: connection failure`,
        endpoint: safeEndpoint(url),
        method: req.method,
        status: 0,
        durationMs: Date.now() - started,
        request,
        response: {
          error: "Protocol upstream unavailable or response exceeded limits.",
        },
      });
      throw new AppError(
        502,
        "Protocol upstream unavailable or response exceeded limits.",
      );
    }
  }
}
