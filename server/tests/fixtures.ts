import type { TestRun } from "../models/dtos.js";
import type { VerificationCheck } from "../models/verification.js";
// Shared run fixtures for tests.

// The test verifier's identifier, also used as the run's verifierClientId.
export const verifierDid = "did:web:verifier.test:v1:verify";

// A mock wallet SD-JWT run in ISSUING against test endpoints. Overrides
// replace whole fields.
export function testRun(overrides: Partial<TestRun> = {}): TestRun {
  const now = new Date().toISOString();
  return {
    id: "run-1",
    scenario: "NONE",
    scenarioEvidence: { applied: false },
    createdAt: now,
    updatedAt: now,
    wallet: "MOCK_WALLET",
    configuration: {
      id: "FarmerCredentialSdJwt",
      name: "Farmer credential",
      format: "vc+sd-jwt",
      proofTypes: ["ES256"],
    },
    environment: {
      certifyUrl: "https://issuer.test/v1/certify/issuance",
      issuerUrl: "https://issuer.test/v1/certify/issuance",
      verifyUrl: "https://verifier.test/v1/verify",
      mimotoUrl: "",
      webWalletUrl: "",
      embeddedWalletUrl: "",
      authorizationUrl: "https://auth.test/realms/inji",
      publicBaseUrl: "http://localhost:8000",
      verifierClientId: verifierDid,
      presentationDefinitionIds: {},
      stackVersion: "test",
    },
    phase: "ISSUING",
    verdict: "PENDING",
    holderConfirmed: false,
    credentialObserved: false,
    credentialMatched: false,
    credentialFingerprints: [],
    events: [],
    ...overrides,
  };
}

// A PLAYGROUND verification check with the given status.
export function check(
  id: string,
  status: VerificationCheck["status"] = "PASS",
  detail?: string,
): VerificationCheck {
  return {
    id,
    label: id,
    source: "PLAYGROUND",
    status,
    ...(detail ? { detail } : {}),
  };
}
