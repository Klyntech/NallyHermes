export type VoiceSessionStatus = "ready" | "closing" | "closed";

export interface ResponseLease {
  readonly turnId: number;
  readonly generationId: number;
  readonly signal: AbortSignal;
}

interface ActiveResponse extends ResponseLease {
  readonly controller: AbortController;
}

export class VoiceSession {
  readonly id: string;
  private statusValue: VoiceSessionStatus = "ready";
  private nextTurnId = 0;
  private generationFence = 0;
  private activeResponse?: ActiveResponse;

  constructor(id: string) {
    if (!id || id.length > 128) throw new Error("Invalid voice session id");
    this.id = id;
  }

  get status(): VoiceSessionStatus {
    return this.statusValue;
  }

  get currentTurnId(): number {
    return this.nextTurnId;
  }

  get currentGenerationId(): number {
    return this.generationFence;
  }

  get hasActiveResponse(): boolean {
    return this.activeResponse !== undefined;
  }

  /** Start a new user turn, interrupting any response that is still active. */
  beginTurn(): number {
    this.assertReady();
    if (this.activeResponse) this.interrupt("new_user_turn");
    this.nextTurnId += 1;
    return this.nextTurnId;
  }

  /** Start one assistant generation for the current turn. */
  beginResponse(turnId: number): ResponseLease {
    this.assertReady();
    if (!Number.isSafeInteger(turnId) || turnId < 1 || turnId !== this.nextTurnId) {
      throw new Error("Response turn does not match the current session turn");
    }
    if (this.activeResponse) this.interrupt("superseded");
    this.generationFence += 1;
    const controller = new AbortController();
    const response: ActiveResponse = {
      turnId,
      generationId: this.generationFence,
      signal: controller.signal,
      controller
    };
    this.activeResponse = response;
    return { turnId, generationId: response.generationId, signal: response.signal };
  }

  /** Cancel active work and advance the fence so late chunks become invalid. */
  interrupt(reason = "user_interruption"): ResponseLease | undefined {
    this.assertReady();
    const active = this.activeResponse;
    if (!active) return undefined;
    this.activeResponse = undefined;
    active.controller.abort(new Error(reason));
    this.generationFence += 1;
    return { turnId: active.turnId, generationId: active.generationId, signal: active.signal };
  }

  acceptsOutput(turnId: number, generationId: number): boolean {
    return this.statusValue === "ready"
      && this.activeResponse?.turnId === turnId
      && this.activeResponse.generationId === generationId
      && !this.activeResponse.signal.aborted;
  }

  finishResponse(turnId: number, generationId: number): boolean {
    if (!this.acceptsOutput(turnId, generationId)) return false;
    this.activeResponse = undefined;
    return true;
  }

  close(): void {
    if (this.statusValue === "closed") return;
    if (this.activeResponse) {
      this.activeResponse.controller.abort(new Error("session_closed"));
      this.activeResponse = undefined;
      this.generationFence += 1;
    }
    this.statusValue = "closed";
  }

  private assertReady(): void {
    if (this.statusValue !== "ready") throw new Error(`Voice session is ${this.statusValue}`);
  }
}

export class VoiceSessionRegistry {
  private readonly sessions = new Map<string, VoiceSession>();

  constructor(private readonly maxSessions = 100) {
    if (!Number.isSafeInteger(maxSessions) || maxSessions < 1) {
      throw new Error("maxSessions must be a positive safe integer");
    }
  }

  create(sessionId: string): VoiceSession {
    if (this.sessions.has(sessionId)) throw new Error("Voice session already exists");
    if (this.sessions.size >= this.maxSessions) throw new Error("Voice session capacity reached");
    const session = new VoiceSession(sessionId);
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  close(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.close();
    this.sessions.delete(sessionId);
    return true;
  }

  get size(): number {
    return this.sessions.size;
  }

  closeAll(): void {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }
}
