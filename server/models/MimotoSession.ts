// The browser's Mimoto session as seen by one request: its Cookie header,
// the XSRF token it sent, and a callback that relays cookies Mimoto refreshes
// back to the browser.
export interface MimotoContext {
  cookie: string;
  csrfToken: string;
  setCookies(cookies: string[]): void;
}
// Server-side state of one embedded wallet run. It holds workflow
// identifiers only; keys and PINs stay in Mimoto.
export interface MimotoSession {
  runId: string;
  // Hash of the Mimoto session cookie that started the run; see
  // MimotoClient.owner().
  owner: string;
  walletId: string;
  // Mimoto's ID for the stored credential, set when issuance completes.
  credentialId?: string;
  // Pending authorization code request with its PKCE verifier. It is cleared
  // when the callback is accepted; expiresAt is in epoch milliseconds.
  authorization?: {
    state: string;
    codeVerifier: string;
    issuerId: string;
    redirectUri: string;
    expiresAt: number;
  };
  // The verifier request opened in Mimoto and the stored credential matched
  // to it. submitted becomes true once the user has shared it.
  presentation?: {
    id: string;
    credential: {
      credentialId: string;
      credentialTypeDisplayName: string;
      format: string;
    };
    verifier: { id: string; name: string };
    submitted: boolean;
  };
}
export interface MimotoSessionDao {
  get(runId: string): MimotoSession | undefined;
  save(session: MimotoSession): void;
}
