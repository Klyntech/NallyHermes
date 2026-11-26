import { decodeElevenLabsPcmChunk } from "./elevenLabsStream.js";

/** The slice of a `ws` WebSocket this module needs (kept loose so tests can use a fake). */
export type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): unknown;
};

export type TtsEvents = {
  onAudio: (chunk: Buffer) => void;
  onFinal: () => void;
  onError: (code: string, message: string) => void;
};

export type TtsConfig = {
  voiceSettings: Record<string, unknown>;
  generationConfig?: Record<string, unknown>;
  /** Maximum time from the first text to the provider's final message. */
  timeoutMs: number;
};

export interface TtsHandle {
  sendText(text: string): void;
  end(): void;
  abort(): void;
  /** True once the stream has finished, failed or been aborted: do not reuse it. */
  readonly dead: boolean;
}

const OPEN = 1;

/**
 * One ElevenLabs stream-input connection for one reply. It can be opened before there is any text
 * (so the TLS/WebSocket handshake overlaps with the model thinking), receives text sentence by
 * sentence, and is ended with the documented empty-text message.
 */
export class ElevenLabsStream implements TtsHandle {
  private ready = false;
  private done = false;
  private endRequested = false;
  private queue: Array<Record<string, unknown>> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  audioBytes = 0;

  constructor(
    private readonly socket: SocketLike,
    private readonly config: TtsConfig,
    private readonly events: TtsEvents
  ) {
    socket.on("open", () => this.onOpen());
    socket.on("message", (raw: { toString(): string }, binary?: boolean) => this.onMessage(raw, binary === true));
    socket.on("error", () => this.fail("tts_provider_error", "Speech synthesis provider is unavailable."));
    socket.on("close", () => this.onClose());
    if (socket.readyState === OPEN) this.onOpen();
  }

  get dead(): boolean { return this.done; }

  sendText(text: string): void {
    const clean = text.trim();
    if (!clean || this.done) return;
    this.armTimeout();
    // Each chunk ends with a space and may trigger generation straight away.
    this.write({ text: `${clean} `, try_trigger_generation: true });
  }

  end(): void {
    if (this.done) return;
    this.endRequested = true;
    if (this.ready) this.sendRaw({ text: "" });
  }

  abort(): void {
    if (this.done) return;
    this.done = true;
    this.clearTimer();
    this.closeSocket();
  }

  private write(message: Record<string, unknown>): void {
    if (this.ready) this.sendRaw(message);
    else this.queue.push(message);
  }

  private sendRaw(message: Record<string, unknown>): void {
    if (this.socket.readyState !== OPEN) return;
    try { this.socket.send(JSON.stringify(message)); } catch { /* the close handler reports it */ }
  }

  private onOpen(): void {
    if (this.ready || this.done) return;
    this.ready = true;
    this.sendRaw({
      text: " ",
      voice_settings: this.config.voiceSettings,
      ...(this.config.generationConfig ? { generation_config: this.config.generationConfig } : {})
    });
    for (const message of this.queue) this.sendRaw(message);
    this.queue = [];
    if (this.endRequested) this.sendRaw({ text: "" });
  }

  private onMessage(raw: { toString(): string }, binary: boolean): void {
    if (binary || this.done) return;
    try {
      const msg = JSON.parse(raw.toString()) as { audio?: string; isFinal?: boolean; error?: string };
      if (msg.error) { this.fail("tts_provider_error", "Speech synthesis failed."); return; }
      const chunk = decodeElevenLabsPcmChunk(msg.audio);
      if (chunk) {
        this.audioBytes += chunk.length;
        this.events.onAudio(chunk);
        if (this.done) return;
      }
      if (msg.isFinal) this.finish();
    } catch (error) {
      console.warn("[voice] Invalid TTS payload", error instanceof Error ? error.message : "unknown error");
      this.fail("tts_invalid_audio", "Speech synthesis returned invalid audio. Please try again.");
    }
  }

  private onClose(): void {
    if (this.done) return;
    // The provider hung up. With audio already produced that is the end of the reply.
    if (this.audioBytes > 0) this.finish();
    else this.fail("tts_disconnected", "Speech synthesis disconnected before producing audio.");
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.clearTimer();
    this.closeSocket();
    this.events.onFinal();
  }

  private fail(code: string, message: string): void {
    if (this.done) return;
    this.done = true;
    this.clearTimer();
    this.closeSocket();
    this.events.onError(code, message);
  }

  private armTimeout(): void {
    if (this.timer || this.done) return;
    this.timer = setTimeout(() => this.fail("tts_timeout", "Speech synthesis timed out."), this.config.timeoutMs);
  }

  private clearTimer(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  private closeSocket(): void {
    try { if (this.socket.readyState < 2) this.socket.close(); } catch { /* already closing */ }
  }
}
