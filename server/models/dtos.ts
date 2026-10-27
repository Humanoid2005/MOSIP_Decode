import type { ScenarioId, ScenarioEvidence } from "./scenarios.js";
import type {
  VerificationCheck,
  VerificationEvidence,
} from "./verification.js";
export type JsonObject = Record<string, unknown>;
export type Wallet = "INJI_MOBILE" | "INJI_WEB" | "INJI_MIMOTO" | "MOCK_WALLET";
export type Phase =
  "ISSUING" | "HELD" | "VERIFYING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type Verdict = "PENDING" | "VALID" | "INVALID" | "EXPIRED" | "ERROR";
export interface Environment {
  certifyUrl: string;
  issuerUrl: string;
  verifyUrl: string;
  mimotoUrl: string;
  webWalletUrl: string;
  embeddedWalletUrl: string;
  authorizationUrl: string;
  publicBaseUrl: string;
  verifierClientId: string;
  presentationDefinitionIds: Record<string, string>;
  stackVersion: string;
}
export interface CredentialConfiguration {
  id: string;
  name: string;
  format: string;
  proofTypes: string[];
}
export interface ProtocolEvent {
  id: string;
  timestamp: string;
  source: "HTTP" | "PROXY" | "USER" | "WALLET" | "SCENARIO";
  title: string;
  method: string;
  endpoint: string;
  status: number;
  durationMs: number;
  request: unknown;
  response: unknown;
  repeats?: number;
}
export interface TestRun {
  scenario: ScenarioId;
  scenarioEvidence: ScenarioEvidence;
  parentRunId?: string;
  id: string;
  createdAt: string;
  updatedAt: string;
  wallet: Wallet;
  configuration: CredentialConfiguration;
  environment: Environment;
  phase: Phase;
  verdict: Verdict;
  error?: string;
  offerUri?: string;
  presentationUri?: string;
  requestId?: string;
  transactionId?: string;
  holderConfirmed: boolean;
  holderReceiptSource?: "USER" | "MIMOTO" | "MOCK_WALLET";
  credentialObserved: boolean;
  credentialMatched: boolean;
  credentialFingerprints: string[];
  events: ProtocolEvent[];
  result?: unknown;
  verification?: VerificationEvidence;
  presentationChecks?: VerificationCheck[];
  presentationExpectation?: { nonce: string; definition: JsonObject };
  submittedFingerprints?: string[];
  issuedCredentialFacts?: { format: string; types: string[]; proof: string };
}
export type RunSummary = Omit<
  TestRun,
  | "events"
  | "result"
  | "offerUri"
  | "presentationUri"
  | "credentialFingerprints"
> & { eventCount: number };
