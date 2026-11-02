import type { KeyObject } from "node:crypto";
// The mock wallet's ES256 holder key, created per run and kept only in
// memory. The public JWK goes in the proof of possession header.
export interface HolderKey {
  privateKey: KeyObject;
  publicJwk: Record<string, string>;
}
// State of one mock wallet run. The endpoints and scope come from the
// issuer's and authorization server's metadata.
export interface WalletSession {
  runId: string;
  holder: HolderKey;
  state: string;
  codeVerifier: string;
  scope: string;
  credentialIssuer: string;
  credentialEndpoint: string;
  tokenEndpoint: string;
  // SD-JWT type from the credential configuration, sent with the credential
  // request when the issuer defines one.
  vct?: string;
  // The SD-JWT received at issuance; the copy the wallet later presents.
  credential?: string;
}
export interface WalletSessionDao {
  get(runId: string): WalletSession | undefined;
  findByState(state: string): WalletSession | undefined;
  save(session: WalletSession): void;
}
