import type { HttpTransport } from "../../models/contracts.js";
import { upstreamFailure } from "./upstreamFailure.js";
import { AppError, UpstreamError } from "../errors.js";
import { safeEndpoint } from "./sanitize.js";
import type { TelemetryService } from "./TelemetryService.js";
export class ObservedHttpClient {
  constructor(
    private readonly http: HttpTransport,
    private readonly telemetry: TelemetryService,
  ) {}
  async json(
    url: string,
    title: string,
    runId?: string,
    request?: unknown,
    options: { coalesce?: boolean } = {},
  ): Promise<unknown> {
    const method = request === undefined ? "GET" : "POST";
    try {
      const response = await this.http.send(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(request === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        ...(request === undefined ? {} : { body: JSON.stringify(request) }),
      });
      if (runId)
        this.telemetry.record(
          runId,
          {
            source: "HTTP",
            title,
            method,
            endpoint: safeEndpoint(url),
            status: response.status,
            durationMs: response.durationMs,
            request: request ?? null,
            response: response.body,
          },
          options,
        );
      if (response.status < 200 || response.status >= 300)
        throw new UpstreamError(
          response.status,
          `${title} failed with HTTP ${response.status}${upstreamFailure(response.body) ? `: ${upstreamFailure(response.body)}` : ""}. See the protocol inspector.`,
        );
      return response.body;
    } catch (error) {
      if (
        runId &&
        error instanceof AppError &&
        !(error instanceof UpstreamError)
      )
        this.telemetry.record(runId, {
          source: "HTTP",
          title,
          method,
          endpoint: safeEndpoint(url),
          status: 0,
          durationMs: 0,
          request: request ?? null,
          response: { error: error.message },
        });
      throw error;
    }
  }
}
