import type { HttpTransport } from "../models/contracts.js";
import { AppError } from "./errors.js";
// Default HttpTransport for the server's own calls to Inji services; the
// bridge forwards wallet traffic separately. Redirects are refused rather than
// followed, each call times out after 15 seconds and the body is capped at
// 5 MB (502). JSON bodies are parsed and anything else is returned as text.
// Status codes are left to the caller; a network, TLS, timeout or redirect
// failure becomes 503.
export class HttpClient implements HttpTransport {
  async send(url: string, options: RequestInit = {}) {
    const started = Date.now();
    try {
      const response = await fetch(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      const reader = response.body?.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      if (reader)
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 5 * 1024 * 1024) {
            await reader.cancel();
            throw new AppError(502, "Upstream response exceeds 5 MB.");
          }
          chunks.push(part.value);
        }
      const text = Buffer.concat(chunks).toString("utf8");
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* Keep non-JSON responses readable in the inspector. */
      }
      return {
        status: response.status,
        body,
        durationMs: Date.now() - started,
        headers: response.headers,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        503,
        "Cannot reach the configured Inji service. Check its URL, TLS certificate and availability.",
      );
    }
  }
}
