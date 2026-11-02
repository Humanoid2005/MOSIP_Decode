import type { ScenarioId, ScenarioEvidence } from "./scenarios.js";
import type {
  VerificationCheck,
  VerificationEvidence,
} from "./verification.js";
// Run and environment records stored by the run DAO and returned by the API.
export type JsonObject = Record<string, unknown>;
// INJI_MIMOTO is the embedded Inji wallet driven from the workbench;
// MOCK_WALLET is the playground's own non-Inji holder.
export type Wallet = "INJI_MOBILE" | "INJI_WEB" | "INJI_MIMOTO" | "MOCK_WALLET";
// ISSUING, HELD and VERIFYING are active phases. Only one run can be active
// at a time, because bridged traffic carries no run identifier.
export type Phase =
  "ISSUING" | "HELD" | "VERIFYING" | "COMPLETED" | "FAILED" | "CANCELLED";
// The verifier's decision. ERROR marks a run that failed without one.
export type Verdict = "PENDING" | "VALID" | "INVALID" | "EXPIRED" | "ERROR";
// The Inji services this server is connected to, fixed at startup.
export interface Environment {
  // Certify's base URL as the orchestrator and the bridge reach it.
  certifyUrl: string;
  // Canonical issuer identifier; must equal credential_issuer in Certify's
  // metadata.
  issuerUrl: string;
  // Inji Verify's v1 base, ending in /v1/verify.
  verifyUrl: string;
  mimotoUrl: string;
  webWalletUrl: string;
  // Page that hosts the embedded wallet. Its origin is the only one allowed
  // to call the embedded wallet API.
  embeddedWalletUrl: string;
  // Authorization server that the bridge forwards token requests to.
  authorizationUrl: string;
  // Public base of the bridge. The bridge refuses upstream URLs under it, so
  // it cannot forward to itself.
  publicBaseUrl: string;
  verifierClientId: string;
  // Existing Inji Verify presentation definition ID per credential format.
  presentationDefinitionIds: Record<string, string>;
  stackVersion: string;
}
// A credential configuration advertised by the issuer. proofTypes lists its
// credential_signing_alg_values_supported.
export interface CredentialConfiguration {
  id: string;
  name: string;
  format: string;
  proofTypes: string[];
}
// One entry in a run's protocol log, redacted before storage. source is HTTP
// for the orchestrator's own upstream calls, PROXY for bridged wallet traffic,
// WALLET for embedded and mock wallet actions, USER for manual confirmations,
// SCENARIO for fault injections and PLAYGROUND for derived records such as a
// decoded mDoc. status is 0 when there is no HTTP response.
export interface ProtocolEvent {
  id: string;
  timestamp: string;
  source: "HTTP" | "PROXY" | "USER" | "WALLET" | "SCENARIO" | "PLAYGROUND";
  title: string;
  method: string;
  endpoint: string;
  status: number;
  durationMs: number;
  request: unknown;
  response: unknown;
  // Number of identical consecutive status polls merged into this event;
  // absent for a single occurrence.
  repeats?: number;
}
// One end-to-end run: issuance, holding and verification of one credential
// with one wallet, plus everything observed on the way. The workbench, the
// inspector and the report all read this record.
export interface TestRun {
  scenario: ScenarioId;
  // What the selected scenario changed and where the run stopped.
  scenarioEvidence: ScenarioEvidence;
  // Set on a replay: the finished run it repeats with a fresh issuance.
  parentRunId?: string;
  id: string;
  createdAt: string;
  updatedAt: string;
  wallet: Wallet;
  configuration: CredentialConfiguration;
  environment: Environment;
  phase: Phase;
  verdict: Verdict;
  // Latest error for the user. A run can carry one and still be retryable.
  error?: string;
  // Credential offer link for the wallet, cleared once the credential is held.
  offerUri?: string;
  // openid4vp link to the verifier's request, cleared when verification ends.
  presentationUri?: string;
  requestId?: string;
  // Verify's transaction ID; the playground sends the run ID as the value.
  transactionId?: string;
  // Whether and how receipt by the holder was confirmed: USER is a manual
  // confirmation for Inji Mobile and Inji Web; MIMOTO and MOCK_WALLET come from
  // the wallet's own storage response.
  holderConfirmed: boolean;
  holderReceiptSource?: "USER" | "MIMOTO" | "MOCK_WALLET";
  // The issued credential was seen in a /credential response, by the bridge or
  // by the mock wallet.
  credentialObserved: boolean;
  // The verifier's result holds exactly one credential, and it is one issued
  // in this run.
  credentialMatched: boolean;
  // Fingerprints of the credentials issued in this run.
  credentialFingerprints: string[];
  events: ProtocolEvent[];
  // The verifier's raw result payload.
  result?: unknown;
  // The verifier's checks followed by the playground's independent checks.
  verification?: VerificationEvidence;
  // Playground checks on the observed submission, merged into verification
  // when the verifier's result is collected.
  presentationChecks?: VerificationCheck[];
  // The nonce and presentation definition sent to the verifier, after any
  // scenario change. The playground's submission checks and the mock wallet's
  // request check compare against it.
  presentationExpectation?: { nonce: string; definition: JsonObject };
  // Fingerprints of the credentials in the observed submission.
  submittedFingerprints?: string[];
  // Format, types and proof algorithm read from the issued credential. The
  // mismatch scenarios use them to confirm the request really differs.
  issuedCredentialFacts?: { format: string; types: string[]; proof: string };
  // The bridge-observed mDoc, sent to the verifier's direct credential check.
  issuedMdoc?: string;
}
// List view of a run, without the event log, the verifier's result, the
// handoff links, the fingerprints and the raw mDoc.
export type RunSummary = Omit<
  TestRun,
  | "events"
  | "result"
  | "offerUri"
  | "presentationUri"
  | "credentialFingerprints"
  | "issuedMdoc"
> & { eventCount: number };
