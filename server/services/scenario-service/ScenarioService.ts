import { scenarioOutcome } from "../../models/scenarios.js";
import type { ObservedHttpClient } from "../telemetry/ObservedHttpClient.js";
import type { RunDao } from "../../models/contracts.js";
import type { JsonObject, TestRun } from "../../models/dtos.js";
import type { FailureStage, ScenarioEvidence } from "../../models/scenarios.js";
import type { TelemetryService } from "../telemetry/TelemetryService.js";
import { credentialFingerprint } from "../run-service/credentialFingerprint.js";
import { AppError, object } from "../errors.js";
import { decodeJwt } from "../mock-wallet/jws.js";

// Applies the negative scenarios and records their evidence on the run. It
// alters the verifier's presentation definition for the mismatch scenarios
// and mutates a copy of the credential or presentation for the signature and
// claim scenarios. It is also the shared way to fail a run at a named stage.
export class ScenarioService {
  constructor(
    private readonly dao: RunDao,
    private readonly telemetry: TelemetryService,
    private readonly http: ObservedHttpClient,
  ) {}

  // Merges evidence into the run's scenario record and logs it as a SCENARIO
  // event. rejectionReasonConfirmed is recomputed on every update so it
  // follows the current outcome.
  record(id: string, evidence: Partial<ScenarioEvidence>) {
    const run = this.dao.get(id);
    run.scenarioEvidence = { ...run.scenarioEvidence, ...evidence };
    run.scenarioEvidence.rejectionReasonConfirmed =
      run.scenario !== "NONE" && scenarioOutcome(run) === "PASS";
    this.dao.save(run);
    this.telemetry.record(id, {
      source: "SCENARIO",
      title: `Scenario: ${run.scenario}`,
      method: "",
      endpoint: "",
      status: 0,
      durationMs: 0,
      request: { scenario: run.scenario, changes: evidence.changes ?? [] },
      response: evidence,
    });
  }

  // Stores the nonce and the presentation definition actually sent to Inji
  // Verify. The bridge's presentation checks compare the submission with
  // them, and the mock wallet checks the signed request against them.
  expect(id: string, nonce: string, definition: JsonObject) {
    const run = this.dao.get(id);
    run.presentationExpectation = { nonce, definition };
    this.dao.save(run);
  }

  // Controls for the credential mutations: the original and the modified
  // credential are each sent to Verify's direct credential check. The original
  // must verify and match a credential issued in this run, and the modified
  // one must fail with a signature error, which isolates the issuer-signature
  // failure from the enclosing presentation. If the controls cannot run they
  // are recorded as CONTROL_UNAVAILABLE, and the scenario stays inconclusive.
  async controls(run: TestRun, original: unknown, modified: unknown) {
    try {
      const verify = async (credential: unknown, label: string) =>
        object(
          await this.http.json(
            `${run.environment.verifyUrl}/v2/vc-verification`,
            label,
            run.id,
            {
              verifiableCredential:
                typeof credential === "string"
                  ? credential
                  : JSON.stringify(credential),
              skipStatusChecks: false,
            },
          ),
        );
      const before = await verify(original, "Control: original credential");
      const after = await verify(modified, "Control: modified credential");
      const signature = object(after.schemaAndSignatureCheck);
      const error = signature.error ? object(signature.error) : {};
      this.record(run.id, {
        controls: {
          originalValid:
            before.allChecksSuccessful === true &&
            run.credentialFingerprints.includes(
              credentialFingerprint(original),
            ),
          modifiedSignatureRejected:
            signature.valid === false &&
            error.errorCode === "ERR_SIGNATURE_VERIFICATION_FAILED",
          errorCode:
            typeof error.errorCode === "string" ? error.errorCode : undefined,
        },
      });
    } catch {
      this.record(run.id, {
        controls: {
          originalValid: false,
          modifiedSignatureRejected: false,
          errorCode: "CONTROL_UNAVAILABLE",
        },
      });
    }
  }

  // For the wrong type, format and proof scenarios, replaces the configured
  // presentation definition, under a derived ID, with one input descriptor
  // the issued credential does not satisfy: a type pattern nothing issued
  // matches, the other credential format, or an RSA proof suite or algorithm.
  // matchingMismatchConfirmed records, from the bridge-observed issued
  // credential, that it really differs from the request; neither a wallet's
  // refusal to match nor a verifier rejection scores a pass without it.
  definition(run: TestRun, original: JsonObject): JsonObject {
    if (
      !["WRONG_TYPE", "FORMAT_MISMATCH", "PROOF_MISMATCH"].includes(
        run.scenario,
      )
    )
      return original;
    const definition = structuredClone(original);
    definition.id = `${String(original.id)}-${run.scenario.toLowerCase()}`;
    const ldp = run.configuration.format === "ldp_vc";
    const requestedFormat =
      run.scenario === "FORMAT_MISMATCH"
        ? ldp
          ? "vc+sd-jwt"
          : "ldp_vc"
        : run.configuration.format;
    const proof =
      requestedFormat === "ldp_vc"
        ? {
            proof_type: [
              run.scenario === "PROOF_MISMATCH"
                ? "RsaSignature2018"
                : "Ed25519Signature2020",
            ],
          }
        : {
            "sd-jwt_alg_values": [
              run.scenario === "PROOF_MISMATCH" ? "RS256" : "ES256",
            ],
          };
    const format = { [requestedFormat]: proof };
    // Inji 0.17 drops SD-JWT entries from the top-level format DTO. Keep
    // the restriction on the input descriptor, which is preserved on the wire.
    delete definition.format;
    definition.input_descriptors = [
      {
        id: "scenario-credential",
        format,
        constraints:
          run.scenario === "WRONG_TYPE"
            ? {
                fields: [
                  {
                    path: [ldp ? "$.type[*]" : "$.vct"],
                    filter: {
                      type: "string",
                      pattern: "PlaygroundUnissuedCredential",
                    },
                  },
                ],
              }
            : {},
      },
    ];
    this.record(run.id, {
      applied: true,
      stage: "REQUEST",
      matchingMismatchConfirmed: Boolean(
        run.issuedCredentialFacts &&
        (run.scenario === "WRONG_TYPE"
          ? run.issuedCredentialFacts.types.length > 0 &&
            run.issuedCredentialFacts.types.every(
              (type) => !type.includes("PlaygroundUnissuedCredential"),
            )
          : run.scenario === "FORMAT_MISMATCH"
            ? run.issuedCredentialFacts.format !== requestedFormat
            : run.issuedCredentialFacts.proof &&
              run.issuedCredentialFacts.proof !==
                (ldp ? "RsaSignature2018" : "RS256")),
      ),
      changes: [
        {
          path: "presentation_definition",
          before: original,
          after: definition,
        },
      ],
    });
    return definition;
  }

  // Mutates a copy of the held credential for the bad signature and modified
  // claim scenarios; the wallet's stored credential is never changed. The mock
  // wallet calls this for its SD-JWT before signing the Key Binding JWT: one
  // issuer signature byte is flipped, or the signed id claim is changed
  // without re-signing. The bridge calls it for a JSON-LD modified claim,
  // which changes credentialSubject.fullName. The controls then run on the
  // original and the modified credential.
  async credential(run: TestRun, original: unknown): Promise<unknown> {
    if (!["BAD_SIGNATURE", "MODIFIED_CLAIM"].includes(run.scenario))
      return original;
    let modified: unknown;
    let changes: ScenarioEvidence["changes"];
    if (typeof original === "string" && original.includes("~")) {
      const parts = original.split("~");
      const jwt = parts[0]!.split(".");
      if (jwt.length !== 3)
        throw new AppError(
          422,
          "Cannot mutate an unrecognized credential encoding.",
        );
      if (run.scenario === "BAD_SIGNATURE") {
        const bytes = Buffer.from(jwt[2]!, "base64url");
        if (!bytes.length)
          throw new AppError(422, "Credential signature is empty.");
        bytes[0] = bytes[0]! ^ 1;
        const after = bytes.toString("base64url");
        changes = [{ path: "issuerJwt.signature", before: jwt[2], after }];
        jwt[2] = after;
      } else {
        const claims = decodeJwt(parts[0]!).payload;
        const before = claims.id;
        if (typeof before !== "string")
          throw new AppError(
            422,
            "No signed identifier claim is available to mutate.",
          );
        claims.id = `${before}-modified`;
        jwt[1] = Buffer.from(JSON.stringify(claims)).toString("base64url");
        changes = [{ path: "issuerJwt.payload.id", before, after: claims.id }];
      }
      parts[0] = jwt.join(".");
      modified = parts.join("~");
    } else {
      const credential = structuredClone(object(original));
      if (run.scenario === "BAD_SIGNATURE") {
        throw new AppError(
          422,
          "JSON-LD signature scenarios must mutate the presentation proof only.",
        );
      } else {
        const subject = object(
          Array.isArray(credential.credentialSubject)
            ? credential.credentialSubject[0]
            : credential.credentialSubject,
        );
        const before = subject.fullName;
        subject.fullName = "Modified by playground scenario";
        changes = [
          {
            path: "verifiableCredential.credentialSubject.fullName",
            before,
            after: subject.fullName,
          },
        ];
      }
      modified = credential;
    }
    this.record(run.id, {
      applied: true,
      stage: "SUBMISSION",
      target: "CREDENTIAL_SIGNATURE",
      changes,
      originalFingerprint: credentialFingerprint(original),
      submittedFingerprint: credentialFingerprint(modified),
      mutationNote:
        typeof original === "string" && original.includes("~")
          ? "Changed the issuer-signed SD-JWT copy. The wallet creates a fresh holder binding over that copy. The stored credential is unchanged."
          : "Changed a credential claim inside the signed presentation. This also invalidates the enclosing holder proof. The separate original/modified credential controls isolate the issuer-signature failure. The stored credential is unchanged.",
    });
    await this.controls(run, original, modified);
    return modified;
  }

  // Called by the bridge for each request before it is forwarded. An Inji
  // wallet's presentation submission in the bad signature or modified claim
  // scenario is returned mutated; everything else passes through unchanged.
  // The mock wallet is excluded because it mutates its SD-JWT before signing.
  // If mutation fails, the run fails and the thrown error stops the bridge
  // from forwarding the unmodified submission.
  async bridgeBody(
    id: string | undefined,
    path: string,
    body: Buffer,
    contentType: string,
  ): Promise<Buffer> {
    if (!id || !path.startsWith("/vp-submission/")) return body;
    const run = this.dao.get(id);
    if (
      run.phase !== "VERIFYING" ||
      run.wallet === "MOCK_WALLET" ||
      !["BAD_SIGNATURE", "MODIFIED_CLAIM"].includes(run.scenario)
    )
      return body;
    try {
      return await this.mutateSubmission(run, body, contentType);
    } catch (error) {
      // The wallet will not resubmit, so record the cause instead of waiting
      // for the request to expire.
      const detail =
        error instanceof AppError
          ? error.message
          : "The submitted presentation could not be parsed for mutation. No modified payload was submitted.";
      this.fail(id, "SUBMISSION", "MUTATION_FAILED", detail);
      throw error instanceof AppError ? error : new AppError(422, detail);
    }
  }

  // Rewrites a JSON-LD presentation submission, form-encoded or JSON. Bad
  // signature flips one byte of the presentation proof's detached JWS
  // signature and leaves the credential untouched; modified claim replaces the
  // single credential with a mutated copy from credential(). The body is
  // re-encoded the way it arrived.
  private async mutateSubmission(
    run: TestRun,
    body: Buffer,
    contentType: string,
  ): Promise<Buffer> {
    const id = run.id;
    const form = contentType.includes("application/x-www-form-urlencoded");
    const payload = form
      ? Object.fromEntries(new URLSearchParams(body.toString()))
      : object(JSON.parse(body.toString()));
    const token = payload.vp_token;
    const vp =
      typeof token === "string" ? object(JSON.parse(token)) : object(token);
    const credentials = vp.verifiableCredential;
    if (!Array.isArray(credentials) || !credentials.length)
      throw new AppError(
        422,
        "This presentation encoding cannot be mutated. No modified payload was submitted.",
      );
    const copy = structuredClone(vp);
    if (credentials.length !== 1)
      throw new AppError(422, "Mutation requires exactly one credential.");
    if (run.scenario === "BAD_SIGNATURE") {
      const proof = object(copy.proof);
      if (typeof proof.jws !== "string")
        throw new AppError(
          422,
          "Unsupported presentation proof; no mutation was submitted.",
        );
      const parts = proof.jws.split(".");
      const bytes = Buffer.from(parts[2] ?? "", "base64url");
      if (parts.length !== 3 || bytes.length !== 64)
        throw new AppError(
          422,
          "Expected a 64-byte detached presentation signature.",
        );
      const before = proof.jws;
      bytes[0] = bytes[0]! ^ 1;
      parts[2] = bytes.toString("base64url");
      proof.jws = parts.join(".");
      this.record(id, {
        applied: true,
        stage: "SUBMISSION",
        target: "PRESENTATION_SIGNATURE",
        changes: [{ path: "presentation.proof.jws", before, after: proof.jws }],
        originalFingerprint: credentialFingerprint(credentials[0]),
        submittedFingerprint: credentialFingerprint(credentials[0]),
        mutationNote:
          "Changed one signature byte in the presentation proof. The issuer-signed credential and its claims are unchanged.",
      });
    } else {
      copy.verifiableCredential = [await this.credential(run, credentials[0])];
    }
    payload.vp_token = typeof token === "string" ? JSON.stringify(copy) : copy;
    return Buffer.from(
      form
        ? new URLSearchParams(payload as Record<string, string>).toString()
        : JSON.stringify(payload),
    );
  }

  // Ends an active run as FAILED at the given stage, records the error code
  // and clears the offer and presentation links. A run that has already
  // finished is left alone, so a late failure cannot overwrite a result or a
  // cancellation.
  fail(id: string, stage: FailureStage, errorCode: string, detail: string) {
    const run = this.dao.get(id);
    if (!["ISSUING", "HELD", "VERIFYING"].includes(run.phase)) return;
    run.phase = "FAILED";
    run.verdict = "ERROR";
    run.error = detail;
    run.presentationUri = undefined;
    run.offerUri = undefined;
    run.updatedAt = new Date().toISOString();
    this.dao.save(run);
    this.record(id, { stage, errorCode, detail });
  }
}
