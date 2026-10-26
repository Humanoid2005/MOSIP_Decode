import type { MimotoSession, MimotoSessionDao } from "./MimotoSession.js";
export class InMemoryMimotoSessionDao implements MimotoSessionDao {
  private readonly sessions = new Map<string, MimotoSession>();
  get(runId: string) {
    return this.sessions.get(runId);
  }
  save(session: MimotoSession) {
    this.sessions.set(session.runId, session);
    if (this.sessions.size > 100)
      this.sessions.delete(this.sessions.keys().next().value!);
  }
}
