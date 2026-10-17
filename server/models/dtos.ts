export type JsonObject = Record<string, unknown>;
export type Wallet = "INJI_MOBILE" | "INJI_WEB";
export type Phase =
  "ISSUING" | "HELD" | "VERIFYING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type Verdict = "PENDING" | "VALID" | "INVALID" | "EXPIRED" | "ERROR";
export interface Environment {
  certifyUrl: string;
  issuerUrl: string;
  verifyUrl: string;
  mimotoUrl: string;
  webWalletUrl: string;
  authorizationUrl: string;
  publicBaseUrl: string;
  verifierClientId: string;
  presentationDefinitionId: string;
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
  source: "HTTP" | "PROXY" | "USER";
  title: string;
  method: string;
  endpoint: string;
  status: number;
  durationMs: number;
  request: unknown;
  response: unknown;
}
export interface TestRun {
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
  credentialObserved: boolean;
  credentialMatched: boolean;
  credentialFingerprints: string[];
  events: ProtocolEvent[];
  result?: unknown;
}
