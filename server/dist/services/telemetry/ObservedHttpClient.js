import { AppError } from "../errors.js";
import { safeEndpoint } from "./sanitize.js";
export class ObservedHttpClient {
    http;
    telemetry;
    constructor(http, telemetry) {
        this.http = http;
        this.telemetry = telemetry;
    }
    async json(url, title, runId, request) {
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
                this.telemetry.record(runId, {
                    source: "HTTP",
                    title,
                    method,
                    endpoint: safeEndpoint(url),
                    status: response.status,
                    durationMs: response.durationMs,
                    request: request ?? null,
                    response: response.body,
                });
            if (response.status < 200 || response.status >= 300)
                throw new AppError(502, `${title} failed with HTTP ${response.status}. See the protocol inspector.`);
            return response.body;
        }
        catch (error) {
            if (runId &&
                error instanceof AppError &&
                !error.message.includes("HTTP "))
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
