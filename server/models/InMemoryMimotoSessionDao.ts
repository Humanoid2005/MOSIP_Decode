import type { MimotoSession, MimotoSessionDao } from "./MimotoSession.js";
// Embedded wallet sessions by run ID, held in memory. Beyond 100 sessions the
// earliest created is dropped.
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
