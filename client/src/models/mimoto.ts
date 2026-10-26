export interface InjiWallet {
  walletId: string;
  walletName: string;
  walletStatus?: string | null;
}
export interface StoredCredential {
  credentialId: string;
  credentialTypeDisplayName: string;
}
export interface WalletPresentation {
  id: string;
  verifier: { id: string; name: string };
  credential: StoredCredential & { format: string };
  submitted: boolean;
}
