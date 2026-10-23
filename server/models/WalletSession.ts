import type { KeyObject } from "node:crypto";
export interface HolderKey {
  privateKey: KeyObject;
  publicJwk: Record<string, string>;
}
export interface WalletSession {
  runId: string;
  holder: HolderKey;
  state: string;
  codeVerifier: string;
  scope: string;
  credentialIssuer: string;
  credentialEndpoint: string;
  tokenEndpoint: string;
  vct?: string;
  credential?: string;
}
export interface WalletSessionDao {
  get(runId: string): WalletSession | undefined;
  findByState(state: string): WalletSession | undefined;
  save(session: WalletSession): void;
}
