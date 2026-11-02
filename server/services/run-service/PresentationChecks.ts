import { createHash, createPublicKey, verify } from "node:crypto";
import type { TestRun, JsonObject } from "../../models/dtos.js";
import type { VerificationCheck } from "../../models/verification.js";
import { object } from "../errors.js";
import { decodeJwt } from "../mock-wallet/jws.js";
import { credentialFingerprint } from "./credentialFingerprint.js";
// The playground's own checks on a presentation submission, made as the
// bridge forwards it to Inji Verify, after any scenario mutation. They are
// reported next to Verify's checks, which missed several mismatches (gaps V1,
// V2). The returned fingerprints identify the submitted credential.

// Deliberately limited to the two presentation encodings and constraint shapes
// exercised by this playground. Unsupported shapes are never treated as passes.
export function presentationChecks(
  run: TestRun,
  body: unknown,
): {
  checks: VerificationCheck[];
  fingerprints: string[];
} {
  const checks: VerificationCheck[] = [];
  const fingerprints: string[] = [];
  // Records one check: true passes, false fails and undefined means the check
  // could not be made (NOT_CHECKED).
  const add = (
    id: string,
    label: string,
    valid: boolean | undefined,
    detail?: string,
  ) =>
    checks.push({
      id,
      label,
      source: "PLAYGROUND",
      status:
        valid === true ? "PASS" : valid === false ? "FAIL" : "NOT_CHECKED",
      detail,
    });
  try {
    const expected = run.presentationExpectation;
    if (!expected)
      throw new Error("No correlated presentation request was recorded.");
    const request = object(body);
    // The verifier request uses its request ID as state, so this binds the
    // submission to this run's request.
    add(
      "state",
      "Submission state matches this request",
      request.state === run.requestId,
    );
    const submission = object(
      typeof request.presentation_submission === "string"
        ? JSON.parse(request.presentation_submission)
        : request.presentation_submission,
    );
    add(
      "definition",
      "Presentation definition ID",
      submission.definition_id === expected.definition.id,
    );
    // Inji Mobile sends a single SD-JWT as a JSON string ("…~…"); other wallets
    // send it bare. Inji Verify accepts both.
    const token =
      typeof request.vp_token === "string" &&
      request.vp_token.trim().startsWith('"')
        ? JSON.parse(request.vp_token)
        : request.vp_token;
    let credential: JsonObject;
    let actualFormat: string;
    let algorithm: unknown;
    let isSdJwt = false;
    // SD-JWT: the issuer JWT and disclosures, then the Key Binding JWT after
    // the last "~". The format is taken from the run's configuration, so
    // issued-format only separates SD-JWT from JSON-LD here.
    if (typeof token === "string" && !token.trim().startsWith("{")) {
      isSdJwt = true;
      actualFormat = run.configuration.format;
      if (!["vc+sd-jwt", "dc+sd-jwt"].includes(actualFormat))
        throw new Error("Unexpected SD-JWT presentation format.");
      const boundary = token.lastIndexOf("~");
      if (boundary < 0) throw new Error("Missing SD-JWT holder binding.");
      const sdJwt = token.slice(0, boundary + 1);
      const kbJwt = token.slice(boundary + 1);
      const issuer = decodeJwt(sdJwt.split("~")[0]!);
      const binding = decodeJwt(kbJwt);
      credential = issuer.payload;
      algorithm = issuer.header.alg;
      fingerprints.push(credentialFingerprint(token));
      add(
        "nonce",
        "Presentation nonce",
        binding.payload.nonce === expected.nonce,
      );
      add(
        "audience",
        "Presentation audience",
        binding.payload.aud === run.environment.verifierClientId,
      );
      add(
        "sd-hash",
        "Holder binding covers this SD-JWT",
        binding.payload.sd_hash ===
          createHash("sha256").update(sdJwt, "ascii").digest("base64url"),
      );
      // The Key Binding JWT must be created during this run, allowing 60 s of
      // clock skew.
      const iat = binding.payload.iat;
      add(
        "binding-time",
        "Holder binding creation time",
        typeof iat === "number" &&
          iat >= Math.floor(Date.parse(run.createdAt) / 1000) - 60 &&
          iat <= Math.floor(Date.now() / 1000) + 60,
      );
      // Verifies the Key Binding JWT against the holder key the issuer bound
      // into the credential: cnf.jwk, or a did:jwk in cnf.kid. Only ES256
      // with a P-256 public key is supported; anything else fails the check.
      let valid = false;
      try {
        const cnf = object(credential.cnf);
        const jwk = cnf.jwk
          ? object(cnf.jwk)
          : typeof cnf.kid === "string" && cnf.kid.startsWith("did:jwk:")
            ? object(
                JSON.parse(
                  Buffer.from(
                    cnf.kid.slice(8).split("#")[0]!,
                    "base64url",
                  ).toString(),
                ),
              )
            : {};
        const parts = kbJwt.split(".");
        if (
          parts.length === 3 &&
          binding.header.alg === "ES256" &&
          binding.header.typ === "kb+jwt" &&
          !binding.header.crit &&
          jwk.kty === "EC" &&
          jwk.crv === "P-256" &&
          !jwk.d
        ) {
          valid = verify(
            "sha256",
            Buffer.from(`${parts[0]}.${parts[1]}`),
            {
              key: createPublicKey({
                key: {
                  kty: "EC",
                  crv: "P-256",
                  x: String(jwk.x),
                  y: String(jwk.y),
                },
                format: "jwk",
              }),
              dsaEncoding: "ieee-p1363",
            },
            Buffer.from(parts[2]!, "base64url"),
          );
        }
      } catch {
        valid = false;
      }
      add(
        "sd-holder-signature",
        "SD-JWT holder signature against issuer cnf key",
        valid,
        "Independent ES256 key-binding check; the issuer signature is checked separately by Inji Verify.",
      );
    } else {
      // JSON-LD: a presentation with exactly one credential. Its proof must
      // carry the request nonce as challenge and the verifier client ID as
      // domain, and be an authentication proof by the presentation's holder.
      // Verify checks the proof signature itself (holder-proof).
      actualFormat = "ldp_vc";
      const vp = object(typeof token === "string" ? JSON.parse(token) : token);
      const credentials = vp.verifiableCredential;
      if (!Array.isArray(credentials) || credentials.length !== 1)
        throw new Error("Expected exactly one presented credential.");
      credential = object(
        typeof credentials[0] === "string"
          ? JSON.parse(credentials[0])
          : credentials[0],
      );
      fingerprints.push(credentialFingerprint(credential));
      const proof = object(vp.proof);
      algorithm = object(credential.proof).type;
      add("nonce", "Presentation nonce", proof.challenge === expected.nonce);
      add(
        "audience",
        "Presentation domain",
        proof.domain === run.environment.verifierClientId,
      );
      add(
        "holder-identity",
        "Presentation holder and proof purpose",
        proof.proofPurpose === "authentication" &&
          typeof proof.verificationMethod === "string" &&
          (proof.verificationMethod === vp.holder ||
            proof.verificationMethod.split("#")[0] === vp.holder),
      );
    }
    add(
      "issued-format",
      "Presentation uses the selected credential format",
      actualFormat === run.configuration.format,
    );
    const descriptors = expected.definition.input_descriptors;
    const map = submission.descriptor_map;
    if (
      !Array.isArray(descriptors) ||
      descriptors.length !== 1 ||
      !Array.isArray(map) ||
      map.length !== 1
    )
      throw new Error(
        "Only one input descriptor and one descriptor mapping are supported.",
      );
    const descriptor = object(descriptors[0]);
    const mapping = object(map[0]);
    const nested = mapping.path_nested
      ? object(mapping.path_nested)
      : undefined;
    add(
      "descriptor-id",
      "Descriptor ID matches the verifier request",
      mapping.id === descriptor.id && (!nested || nested.id === descriptor.id),
      `Requested ${String(descriptor.id)}; received ${String(mapping.id)}.`,
    );
    // An SD-JWT is mapped as the token itself. A JSON-LD presentation is
    // mapped at "$" with the credential nested at $.verifiableCredential[0].
    add(
      "descriptor-path",
      "Descriptor path and declared format",
      isSdJwt
        ? mapping.path === "$" && mapping.format === actualFormat && !nested
        : mapping.path === "$" &&
            mapping.format === "ldp_vp" &&
            nested?.path === "$.verifiableCredential[0]" &&
            nested.format === "ldp_vc" &&
            !nested.path_nested,
    );
    // A format restriction may sit on the definition and on the descriptor.
    // Each one present must allow the actual format and list the credential's
    // algorithm or proof suite. A restriction with other rule keys cannot be
    // evaluated and leaves the proof check NOT_CHECKED.
    const formats = [expected.definition.format, descriptor.format].filter(
      (value) => value !== undefined,
    );
    let formatValid = true;
    let proofValid: boolean | undefined = true;
    for (const value of formats) {
      const format = object(value);
      if (!Object.hasOwn(format, actualFormat)) {
        formatValid = false;
        continue;
      }
      const rules = object(format[actualFormat]);
      const allowed = isSdJwt ? rules["sd-jwt_alg_values"] : rules.proof_type;
      if (
        !Array.isArray(allowed) ||
        Object.keys(rules).some(
          (key) => key !== (isSdJwt ? "sd-jwt_alg_values" : "proof_type"),
        )
      )
        proofValid = undefined;
      else if (!allowed.includes(algorithm)) proofValid = false;
    }
    add("requested-format", "Verifier's requested format", formatValid);
    add(
      "requested-proof",
      "Verifier's requested proof suite / algorithm",
      proofValid,
      formats.length ? undefined : "No proof restriction in the request.",
    );
    // Only field constraints on $.type[*] (JSON-LD) or $.vct (SD-JWT) with a
    // string filter by pattern or const are evaluated; a pattern is used as a
    // regular expression. Any other shape, or submission_requirements, leaves
    // the claims check NOT_CHECKED.
    const constraints = descriptor.constraints
      ? object(descriptor.constraints)
      : {};
    let typeValid: boolean | undefined = true;
    if (
      Object.keys(constraints).some((key) => key !== "fields") ||
      expected.definition.submission_requirements
    )
      typeValid = undefined;
    else if (constraints.fields !== undefined) {
      if (!Array.isArray(constraints.fields)) typeValid = undefined;
      else
        for (const field of constraints.fields) {
          const rule = object(field);
          const filter = rule.filter ? object(rule.filter) : {};
          if (
            !Array.isArray(rule.path) ||
            rule.path.length !== 1 ||
            !["$.type[*]", "$.vct"].includes(String(rule.path[0])) ||
            Object.keys(rule).some(
              (key) => !["path", "filter"].includes(key),
            ) ||
            Object.keys(filter).some(
              (key) => !["type", "pattern", "const"].includes(key),
            ) ||
            filter.type !== "string"
          ) {
            typeValid = undefined;
            break;
          }
          const values =
            rule.path[0] === "$.type[*]" ? credential.type : [credential.vct];
          const matched =
            Array.isArray(values) &&
            values.some(
              (value) =>
                typeof value === "string" &&
                (filter.const === undefined || filter.const === value) &&
                (filter.pattern === undefined ||
                  (typeof filter.pattern === "string" &&
                    new RegExp(filter.pattern).test(value))),
            );
          if (!matched) typeValid = false;
        }
    }
    add(
      "requested-claims",
      "Requested credential type / claim constraints",
      typeValid,
      typeValid === undefined
        ? "Unsupported constraint shape; full Presentation Exchange conformance is not claimed."
        : undefined,
    );
  } catch (error) {
    // A submission that cannot be decoded or has an unsupported shape adds a
    // NOT_CHECKED entry, so the run cannot pass.
    add(
      "presentation-evidence",
      "Presentation evidence",
      undefined,
      error instanceof Error
        ? error.message
        : "Unrecognized presentation encoding.",
    );
  }
  return { checks, fingerprints };
}
