import type { HttpTransport } from "../../models/contracts.js";
import { upstreamFailure } from "./upstreamFailure.js";
import { AppError, UpstreamError } from "../errors.js";
import { safeEndpoint } from "./sanitize.js";
import type { TelemetryService } from "./TelemetryService.js";
// JSON client for the workbench's own calls to Inji services: issuer metadata,
// Verify requests, polls and results, and scenario control checks. Each call
// made for a run is recorded as an HTTP event on that run.
export class ObservedHttpClient {
  constructor(
    private readonly http: HttpTransport,
    private readonly telemetry: TelemetryService,
  ) {}
  // Sends a GET, or a JSON POST when a request body is given, and returns the
  // parsed response. With a run ID, the exchange is recorded first, so a
  // rejection is visible in the inspector; non-2xx then throws UpstreamError
  // with the upstream's reason. Transport failures have no response and are
  // recorded with status 0. coalesce folds identical consecutive polls into a
  // single event.
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
