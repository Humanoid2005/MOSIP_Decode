import { createHash } from "node:crypto";
import { presentationChecks } from "../run-service/PresentationChecks.js";
import { decodeJwt } from "../mock-wallet/jws.js";
import { object } from "../errors.js";
import type { RunDao } from "../../models/contracts.js";
import type { RunService } from "../run-service/RunService.js";
import type { TelemetryService } from "../telemetry/TelemetryService.js";
import {
  credentialFingerprint,
  matchesCredentialFormat,
} from "../run-service/credentialFingerprint.js";
import type { ProtocolEvent } from "../../models/dtos.js";
import { decodeMdoc, type MdocSummary } from "../run-service/mdoc.js";
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
      return (active.requestId !== undefined && state === active.requestId) ||
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
  observeSubmission(
    id: string | undefined,
    path: string,
    request: unknown,
  ): void {
    if (!id || !path.startsWith("/vp-submission/")) return;
    const run = this.dao.get(id);
    if (run.phase !== "VERIFYING") return;
    const evidence = presentationChecks(run, request);
    run.presentationChecks = evidence.checks;
    run.submittedFingerprints = evidence.fingerprints;
    this.dao.save(run);
  }
  capture(
    id: string | undefined,
    path: string,
    event: Omit<ProtocolEvent, "id" | "timestamp">,
  ): void {
    if (!id) return;
    const run = this.dao.get(id);
    if (!["ISSUING", "HELD", "VERIFYING"].includes(run.phase)) {
      this.telemetry.record(id, event);
      return;
    }
    let mdoc: MdocSummary | undefined;
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
        if (run.scenario === "EXPIRED_CREDENTIAL") {
          const credential =
            typeof body.credential === "string"
              ? JSON.parse(body.credential)
              : body.credential;
          const expires = (credential as Record<string, unknown>)
            .expirationDate;
          if (typeof expires === "string" && Date.parse(expires) < Date.now())
            run.scenarioEvidence = {
              applied: true,
              stage: "ISSUANCE",
              detail:
                "Observed an issuer-signed credential with a past expirationDate; its claims were not edited after signing.",
              changes: [
                {
                  path: "credential.expirationDate",
                  before: null,
                  after: expires,
                },
              ],
            };
        }
        if (run.scenario === "UNSUPPORTED_DID") {
          const credential =
            typeof body.credential === "string"
              ? JSON.parse(body.credential)
              : body.credential;
          if (
            (credential as Record<string, unknown>).issuer ===
            "did:playground:unresolvable-issuer"
          )
            run.scenarioEvidence = {
              applied: true,
              stage: "ISSUANCE",
              detail:
                "Observed a credential signed by Certify with the intentionally unresolvable fixture DID. The issuer identifier was set before signing.",
              changes: [
                {
                  path: "credential.issuer",
                  before: null,
                  after: "did:playground:unresolvable-issuer",
                },
              ],
            };
        }
        run.credentialObserved = true;
        try {
          if (run.configuration.format === "ldp_vc") {
            const credential = object(
              typeof body.credential === "string"
                ? JSON.parse(body.credential)
                : body.credential,
            );
            run.issuedCredentialFacts = {
              format: "ldp_vc",
              types: Array.isArray(credential.type)
                ? credential.type.filter(
                    (item): item is string => typeof item === "string",
                  )
                : [],
              proof: String(object(credential.proof).type ?? ""),
            };
          } else if (run.configuration.format === "mso_mdoc") {
            mdoc = decodeMdoc(body.credential as string);
            run.issuedCredentialFacts = {
              format: "mso_mdoc",
              types: [mdoc.docType],
              proof: mdoc.algorithm,
            };
            run.issuedMdoc = body.credential as string;
          } else if (typeof body.credential === "string") {
            const credential = decodeJwt(body.credential.split("~")[0]!);
            run.issuedCredentialFacts = {
              format: run.configuration.format,
              types:
                typeof credential.payload.vct === "string"
                  ? [credential.payload.vct]
                  : [],
              proof: String(credential.header.alg ?? ""),
            };
          }
        } catch {
          /* Missing facts make matching-rejection attribution inconclusive. */
        }
        run.credentialFingerprints.push(credentialFingerprint(body.credential));
        this.dao.save(run);
      }
    }
    this.telemetry.record(id, event);
    if (mdoc)
      this.telemetry.record(id, {
        source: "PLAYGROUND",
        title: "Issued mDoc decoded from CBOR (inspection only, not verified)",
        method: "",
        endpoint: "",
        status: 0,
        durationMs: 0,
        request: null,
        response: mdoc,
      });
  }
  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
