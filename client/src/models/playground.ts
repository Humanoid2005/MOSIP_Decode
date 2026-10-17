export type {
  Environment,
  TestRun,
  ProtocolEvent,
  CredentialConfiguration,
  Wallet,
} from "../../../server/models/dtos";
import type { TestRun } from "../../../server/models/dtos";
export type RunSummary = Omit<
  TestRun,
  | "events"
  | "result"
  | "offerUri"
  | "presentationUri"
  | "credentialFingerprints"
> & { eventCount: number };
