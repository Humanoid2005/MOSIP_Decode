// Playground API types, re-exported from the server's DTOs so the client and
// server share one definition of runs, events and environment settings.
export type {
  Environment,
  TestRun,
  RunSummary,
  ProtocolEvent,
  CredentialConfiguration,
  Wallet,
} from "../../../server/models/dtos";
