import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SessionId, SessionRecord } from "./types.js";

export class SessionStore {
  constructor(private readonly directory: string) {}

  async create(workspace: string): Promise<SessionRecord> {
    const now = new Date().toISOString();
    const session: SessionRecord = { id: randomUUID(), createdAt: now, updatedAt: now, workspace, events: 0 };
    await this.save(session);
    return session;
  }

  async load(id: SessionId): Promise<SessionRecord> {
    const source = await readFile(join(this.directory, `${id}.json`), "utf8");
    return JSON.parse(source) as SessionRecord;
  }

  async recordEvent(session: SessionRecord): Promise<SessionRecord> {
    const updated = { ...session, updatedAt: new Date().toISOString(), events: session.events + 1 };
    await this.save(updated);
    return updated;
  }

  private async save(session: SessionRecord): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(join(this.directory, `${session.id}.json`), `${JSON.stringify(session, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }
}
