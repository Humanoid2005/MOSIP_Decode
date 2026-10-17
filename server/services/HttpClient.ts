import type { HttpTransport } from "../models/contracts.js";
import { AppError } from "./errors.js";
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
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        502,
        "Cannot reach the configured Inji service. Check its URL, TLS certificate and availability.",
      );
    }
  }
}
