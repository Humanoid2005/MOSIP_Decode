import type { WalletSession, WalletSessionDao } from "./WalletSession.js";
// Mock wallet sessions by run ID, held in memory. Saving moves a session to
// the newest position; beyond the limit the least recently saved is dropped.
export class InMemoryWalletSessionDao implements WalletSessionDao {
  private readonly sessions = new Map<string, WalletSession>();
  constructor(private readonly limit = 100) {}
  get(runId: string): WalletSession | undefined {
    return this.sessions.get(runId);
  }
  // Resolves the authorization callback, which carries only the OAuth state.
  findByState(state: string): WalletSession | undefined {
    for (const session of this.sessions.values())
      if (session.state === state) return session;
  }
  save(session: WalletSession): void {
    this.sessions.delete(session.runId);
    this.sessions.set(session.runId, session);
    if (this.sessions.size > this.limit)
      this.sessions.delete(this.sessions.keys().next().value!);
  }
}
