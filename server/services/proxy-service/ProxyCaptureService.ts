import { createHash } from "node:crypto";
import type { RunDao } from "../../models/contracts.js";
import type { RunService } from "../run-service/RunService.js";
import type { TelemetryService } from "../telemetry/TelemetryService.js";
import {
  credentialFingerprint,
  matchesCredentialFormat,
} from "../run-service/credentialFingerprint.js";
import type { ProtocolEvent } from "../../models/dtos.js";
export class ProxyCaptureService {
  private readonly tokens = new Map<string, string>();
  constructor(
    private readonly dao: RunDao,
    private readonly runs: RunService,
    private readonly telemetry: TelemetryService,
  ) {}
  identify(
    role: string,
    path: string,
    authorization: string | undefined,
    request: unknown,
  ): string | undefined {
    const active = this.runs.active();
    if (!active) return;
    if (role === "verify") {
      const state =
        request && typeof request === "object"
          ? (request as Record<string, unknown>).state
          : undefined;
      return state === active.requestId ||
        path.includes(encodeURIComponent(active.requestId || active.id))
        ? active.id
        : undefined;
    }
    if (path.endsWith("/credential")) {
      const key = this.hash(authorization?.replace(/^Bearer /i, "") || "");
      return this.tokens.get(key) === active.id ? active.id : undefined;
    }
    return active.phase === "ISSUING" ? active.id : undefined;
  }
  capture(
    id: string | undefined,
    path: string,
    event: Omit<ProtocolEvent, "id" | "timestamp">,
  ): void {
    if (!id) return;
    const run = this.dao.get(id);
    if (!["ISSUING", "HELD", "VERIFYING"].includes(run.phase)) return;
    const body =
      event.response && typeof event.response === "object"
        ? (event.response as Record<string, unknown>)
        : {};
    if (event.status >= 200 && event.status < 300) {
      if (typeof body.access_token === "string") {
        this.tokens.set(this.hash(body.access_token), id);
        if (this.tokens.size > 200)
          this.tokens.delete(this.tokens.keys().next().value!);
      }
      if (
        path.endsWith("/credential") &&
        matchesCredentialFormat(body.credential, run.configuration.format)
      ) {
        run.credentialObserved = true;
        run.credentialFingerprints.push(credentialFingerprint(body.credential));
        this.dao.save(run);
      }
    }
    this.telemetry.record(id, event);
  }
  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
