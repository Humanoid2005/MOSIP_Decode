export interface MimotoContext {
  cookie: string;
  csrfToken: string;
  setCookies(cookies: string[]): void;
}
export interface MimotoSession {
  runId: string;
  owner: string;
  walletId: string;
  credentialId?: string;
  authorization?: {
    state: string;
    codeVerifier: string;
    issuerId: string;
    redirectUri: string;
    expiresAt: number;
  };
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
