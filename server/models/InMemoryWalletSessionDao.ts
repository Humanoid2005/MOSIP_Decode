import type { WalletSession, WalletSessionDao } from "./WalletSession.js";
export class InMemoryWalletSessionDao implements WalletSessionDao {
  private readonly sessions = new Map<string, WalletSession>();
  constructor(private readonly limit = 100) {}
  get(runId: string): WalletSession | undefined {
    return this.sessions.get(runId);
  }
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
