// Response shapes used by the embedded Inji wallet. InjiWallet and
// StoredCredential come from Mimoto's wallet API; WalletPresentation is the
// playground's prepare response, shown to the user before they consent.
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
