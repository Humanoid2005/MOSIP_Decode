import type { TestRun, Wallet } from "./dtos.js";
import { checkStatus, type VerificationCheck } from "./verification.js";

export type ScenarioId =
  | "NONE"
  | "BAD_SIGNATURE"
  | "MODIFIED_CLAIM"
  | "EXPIRED_CREDENTIAL"
  | "WRONG_TYPE"
  | "FORMAT_MISMATCH"
  | "PROOF_MISMATCH"
  | "UNSUPPORTED_DID"
  | "WRONG_NONCE"
  | "QR_LIMIT";
export type FailureStage =
  | "ISSUANCE"
  | "REQUEST"
  | "WALLET_STORAGE"
  | "WALLET_MATCHING"
  | "SUBMISSION"
  | "VERIFICATION"
  | "HANDOFF";
export interface ScenarioDefinition {
  id: ScenarioId;
  name: string;
  description: string;
  expected: string;
}
export interface ScenarioEvidence {
  applied: boolean;
  stage?: FailureStage;
  errorCode?: string;
  detail?: string;
  originalFingerprint?: string;
  submittedFingerprint?: string;
  changes?: { path: string; before: unknown; after: unknown }[];
  rejectionReasonConfirmed?: boolean;
  mutationNote?: string;
  target?: "PRESENTATION_SIGNATURE" | "CREDENTIAL_SIGNATURE";
  controls?: {
    originalValid: boolean;
    modifiedSignatureRejected: boolean;
    errorCode?: string;
  };
  matchingMismatchConfirmed?: boolean;
}
export type ScenarioOutcome =
  "PENDING" | "PASS" | "FAIL" | "INCONCLUSIVE" | "CANCELLED";

export const scenarios: ScenarioDefinition[] = [
  {
    id: "NONE",
    name: "Normal flow",
    description: "Issue, hold and verify an unchanged credential.",
    expected: "Valid credential with issuance and holder evidence.",
  },
  {
    id: "BAD_SIGNATURE",
    name: "Bad signature",
    description:
      "Corrupt a signature in a presentation copy; preserve the wallet's credential.",
    expected: "The verifier rejects the modified presentation.",
  },
  {
    id: "MODIFIED_CLAIM",
    name: "Modified claim",
    description: "Change a signed claim without renewing its issuer signature.",
    expected: "The verifier rejects the modified presentation.",
  },
  {
    id: "EXPIRED_CREDENTIAL",
    name: "Expired credential",
    description: "Issue the separately signed, expired JSON-LD fixture.",
    expected: "Inji Verify returns an expired credential result.",
  },
  {
    id: "WRONG_TYPE",
    name: "Wrong credential type",
    description:
      "Request a credential type different from the issued Farmer credential.",
    expected: "Wallet matching or the verifier rejects the type mismatch.",
  },
  {
    id: "FORMAT_MISMATCH",
    name: "Format mismatch",
    description:
      "Request a different credential format while preserving the held credential.",
    expected: "Wallet matching or the verifier rejects the format mismatch.",
  },
  {
    id: "PROOF_MISMATCH",
    name: "Proof-type mismatch",
    description:
      "Request a proof suite or signing algorithm different from the issued credential.",
    expected: "Wallet matching or the verifier rejects the proof mismatch.",
  },
  {
    id: "UNSUPPORTED_DID",
    name: "Unsupported DID method",
    description:
      "Issue a separately signed JSON-LD fixture with an intentionally unresolvable did:playground issuer.",
    expected:
      "Rejection of the credential with an unresolvable issuer identifier.",
  },
  {
    id: "WRONG_NONCE",
    name: "Wrong presentation nonce",
    description:
      "Sign the SD-JWT holder binding with a nonce different from the verifier request.",
    expected: "The verifier rejects the holder binding.",
  },
  {
    id: "QR_LIMIT",
    name: "QR size limit",
    description:
      "Probe the handoff size policy with an oversized local sample; no sample is sent to the wallet.",
    expected:
      "The workbench selects the link fallback for the oversized sample.",
  },
];

export const expiredConfigurationId = "FarmerCredentialExpired";
export const unsupportedDidConfigurationId = "FarmerCredentialUnsupportedDid";
export const qrByteLimit = 2000;
export function qrHandoff(value: string) {
  const bytes = new TextEncoder().encode(value).length;
  return { bytes, fitsQr: bytes < qrByteLimit };
}
export function scenarioDefinition(id: ScenarioId) {
  return scenarios.find((item) => item.id === id)!;
}
export function scenarioUnavailable(
  id: ScenarioId,
  wallet: Wallet,
  format: string,
  fixtureAvailable = true,
  didFixtureAvailable = false,
): string | undefined {
  if (id === "QR_LIMIT")
    return "Local QR sizing is a UI policy, not a verifier rejection scenario.";
  if (id === "UNSUPPORTED_DID" && (format !== "ldp_vc" || !didFixtureAvailable))
    return "Requires the local FarmerCredentialUnsupportedDid JSON-LD issuer configuration.";
  if (id === "EXPIRED_CREDENTIAL" && (format !== "ldp_vc" || !fixtureAvailable))
    return "Requires the local FarmerCredentialExpired JSON-LD issuer configuration.";
  if (id === "WRONG_NONCE" && wallet !== "MOCK_WALLET")
    return "Holder nonce control is available in the SD-JWT mock wallet only.";
  if (
    ["BAD_SIGNATURE", "MODIFIED_CLAIM"].includes(id) &&
    !["INJI_MIMOTO", "MOCK_WALLET"].includes(wallet)
  )
    return "Use the embedded Inji wallet or mock wallet for a controlled, observable mutation.";
  return undefined;
}
function holderBindingConfirmed(
  checks: VerificationCheck[] | undefined,
): boolean {
  return (
    checkStatus(checks, "holder-identity") === "PASS" ||
    ["sd-holder-signature", "sd-hash", "binding-time"].every(
      (id) => checkStatus(checks, id) === "PASS",
    )
  );
}

// The independent playground check each verifier-side scenario deliberately
// breaks. Its failure proves the mutation reached the verifier.
const scenarioTargets: Partial<Record<ScenarioId, string>> = {
  WRONG_NONCE: "nonce",
  WRONG_TYPE: "requested-claims",
  FORMAT_MISMATCH: "requested-format",
  PROOF_MISMATCH: "requested-proof",
};
const bindingChecks = [
  "state",
  "definition",
  "nonce",
  "audience",
  "issued-format",
  "descriptor-id",
  "descriptor-path",
  "requested-format",
  "requested-proof",
  "requested-claims",
  "result-correlation",
];

export function scenarioOutcome(
  run: Pick<
    TestRun,
    | "scenario"
    | "scenarioEvidence"
    | "phase"
    | "verdict"
    | "credentialObserved"
    | "credentialMatched"
    | "holderConfirmed"
    | "verification"
  >,
): ScenarioOutcome {
  if (run.phase === "CANCELLED") return "CANCELLED";
  if (!["COMPLETED", "FAILED"].includes(run.phase)) return "PENDING";
  if (run.scenario === "NONE") return interoperabilityOutcome(run);
  if (!run.scenarioEvidence?.applied) return "INCONCLUSIVE";
  if (run.scenario === "QR_LIMIT") return "INCONCLUSIVE";
  if (
    run.scenarioEvidence.stage === "WALLET_MATCHING" &&
    run.scenarioEvidence.errorCode === "NO_MATCHING_CREDENTIAL"
  )
    return ["WRONG_TYPE", "FORMAT_MISMATCH", "PROOF_MISMATCH"].includes(
      run.scenario,
    ) &&
      run.scenarioEvidence.matchingMismatchConfirmed &&
      run.credentialObserved &&
      run.holderConfirmed
      ? "PASS"
      : "INCONCLUSIVE";
  if (run.verification?.upstreamAccepted) return "FAIL";
  const checks = run.verification?.checks;
  const target = scenarioTargets[run.scenario];
  if (
    !run.credentialObserved ||
    !run.holderConfirmed ||
    !holderBindingConfirmed(checks) ||
    !bindingChecks.every(
      (id) => checkStatus(checks, id) === (id === target ? "FAIL" : "PASS"),
    )
  )
    return "INCONCLUSIVE";
  const allowedFailures =
    run.scenario === "WRONG_NONCE"
      ? ["nonce", "holder-proof"]
      : target
        ? [target]
        : run.scenario === "EXPIRED_CREDENTIAL"
          ? ["expiry"]
          : run.scenarioEvidence.target === "PRESENTATION_SIGNATURE"
            ? ["holder-proof"]
            : ["issuer-signature", "holder-proof"];
  if (
    checks?.some(
      (check) => check.status === "FAIL" && !allowedFailures.includes(check.id),
    )
  )
    return "INCONCLUSIVE";
  const signature = checks?.find((check) => check.id === "issuer-signature");
  const holder = checks?.find((check) => check.id === "holder-proof");
  // The rejection is only attributed to the mutation when Inji found nothing
  // else wrong with the credential; unchecked results (an outage) are not enough.
  if (target)
    return run.credentialMatched &&
      signature?.status === "PASS" &&
      checkStatus(checks, "expiry") === "PASS" &&
      ["PASS", "NOT_APPLICABLE"].includes(
        checkStatus(checks, "credential-status"),
      ) &&
      (holder?.status === "PASS" ||
        (run.scenario === "WRONG_NONCE" && holder?.status === "FAIL")) &&
      (run.scenario === "WRONG_NONCE" ||
        run.scenarioEvidence.matchingMismatchConfirmed)
      ? "PASS"
      : "INCONCLUSIVE";
  if (run.scenario === "EXPIRED_CREDENTIAL")
    return run.credentialMatched &&
      signature?.status === "PASS" &&
      holder?.status === "PASS" &&
      checkStatus(checks, "expiry") === "FAIL"
      ? "PASS"
      : "INCONCLUSIVE";
  if (["BAD_SIGNATURE", "MODIFIED_CLAIM"].includes(run.scenario)) {
    const evidence = run.scenarioEvidence;
    if (checkStatus(checks, "result-correlation") !== "PASS")
      return "INCONCLUSIVE";
    if (evidence.target === "PRESENTATION_SIGNATURE")
      return signature?.status === "PASS" &&
        holder?.status === "FAIL" &&
        holder.detail === "ERR_SIGNATURE_VERIFICATION_FAILED" &&
        run.credentialMatched
        ? "PASS"
        : "INCONCLUSIVE";
    return evidence.controls?.originalValid &&
      evidence.controls.modifiedSignatureRejected &&
      signature?.status === "FAIL" &&
      signature.detail === "ERR_SIGNATURE_VERIFICATION_FAILED"
      ? "PASS"
      : "INCONCLUSIVE";
  }
  return "INCONCLUSIVE";
}

export function interoperabilityOutcome(
  run: Pick<
    TestRun,
    | "verification"
    | "credentialObserved"
    | "credentialMatched"
    | "holderConfirmed"
    | "phase"
    | "verdict"
  >,
): ScenarioOutcome {
  if (run.phase === "CANCELLED") return "CANCELLED";
  if (!["COMPLETED", "FAILED"].includes(run.phase)) return "PENDING";
  if (
    run.phase === "FAILED" ||
    run.verdict === "INVALID" ||
    run.verdict === "EXPIRED"
  )
    return "FAIL";
  const checks = run.verification?.checks;
  if (checks?.some((check) => check.status === "FAIL")) return "FAIL";
  const required = [
    "issuer-signature",
    "holder-proof",
    "expiry",
    "state",
    "definition",
    "nonce",
    "audience",
    "issued-format",
    "descriptor-id",
    "descriptor-path",
    "requested-format",
    "requested-proof",
    "requested-claims",
    "result-correlation",
  ];
  return run.verdict === "VALID" &&
    run.verification?.version === 1 &&
    run.verification.upstreamAccepted &&
    checks?.length &&
    required.every((id) => checkStatus(checks, id) === "PASS") &&
    holderBindingConfirmed(checks) &&
    ["PASS", "NOT_APPLICABLE"].includes(
      checkStatus(checks, "credential-status"),
    ) &&
    checks.every(
      (check) =>
        check.status === "PASS" ||
        (check.id === "credential-status" && check.status === "NOT_APPLICABLE"),
    ) &&
    run.credentialObserved &&
    run.credentialMatched &&
    run.holderConfirmed
    ? "PASS"
    : "INCONCLUSIVE";
}
