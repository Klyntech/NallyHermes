import type { PcmPacer } from "./voicePlayback.js";
import { SpeechChunker, SpokenStreamParser, type ChunkerOptions } from "./voiceSpeech.js";
import type { TtsEvents, TtsHandle } from "./ttsStream.js";

export type VoiceTurnDeps = {
  /** Runs the agent. `onTextDelta` receives model text as it streams. Resolves null when approval is needed. */
  runAgent(text: string, options: { signal: AbortSignal; onTextDelta: (delta: string) => void }): Promise<string | null>;
  /** Saves the exchange to the conversation. Failure is logged, never fatal. */
  persist(userText: string, answer: string): Promise<void>;
  /** Spoken part of a complete answer (used when nothing could be streamed, e.g. planned requests). */
  splitSpoken(answer: string): string;
  createTts(events: TtsEvents): TtsHandle;
  pacer: Pick<PcmPacer, "push" | "clear" | "whenDrained">;
  send(message: unknown): void;
  /** True when the phone has stopped reading the socket. */
  clientStalled(): boolean;
  maxOutputBytes: number;
  chunker?: ChunkerOptions;
  now?: () => number;
  log?: (event: string, data: Record<string, unknown>) => void;
};

export type VoiceTurnEnd = "finished" | "failed" | "aborted";

/**
 * One spoken reply, end to end:
 *   agent text stream -> spoken-block parser -> sentence chunker -> TTS stream -> paced PCM to the phone.
 * Speech starts on the first sentence while the model is still writing the rest.
 */
export class VoiceTurn {
  private readonly controller = new AbortController();
  private readonly parser = new SpokenStreamParser();
  private readonly chunker: SpeechChunker;
  private readonly now: () => number;
  private tts: TtsHandle | null = null;
  private isActive = true;
  private textSent = false;
  private spokenText = "";
  private audioOn = false;
  private providerFinal = false;
  private outputBytes = 0;
  private audioChunks = 0;
  private readonly startedAt: number;
  private firstDeltaAt = 0;
  private firstChunkAt = 0;
  private firstAudioAt = 0;

  constructor(
    readonly id: string,
    readonly text: string,
    private readonly deps: VoiceTurnDeps,
    private readonly onEnded: (reason: VoiceTurnEnd) => void
  ) {
    this.now = deps.now ?? Date.now;
    this.startedAt = this.now();
    this.chunker = new SpeechChunker(deps.chunker);
  }

  get active(): boolean { return this.isActive; }
  get audioStarted(): boolean { return this.audioOn; }

  async start(): Promise<void> {
    this.deps.send({ type: "assistant_start", turnId: this.id });
    // Overlap the provider handshake with the agent's thinking time. A failure here is retried on demand.
    try { this.openTts(); } catch (error) { this.deps.log?.("tts_prewarm_failed", { message: error instanceof Error ? error.message : "unknown" }); }
    try {
      const answer = await this.deps.runAgent(this.text, {
        signal: this.controller.signal,
        onTextDelta: (delta) => this.onDelta(delta)
      });
      if (this.stale) return;
      if (answer === null) { this.fail("approval_required", "This request needs approval in Telegram."); return; }
      try {
        await this.deps.persist(this.text, answer);
      } catch (error) {
        this.deps.log?.("persist_failed", { message: error instanceof Error ? error.message : "unknown" });
      }
      if (this.stale) return;
      this.finishInput(answer);
    } catch (error) {
      if (this.stale) return;
      console.error("Voice agent turn failed:", error);
      this.fail("agent_error", "I couldn't complete that voice turn.");
    }
  }

  /** Stops everything for this turn. Sends nothing: the caller decides what the phone is told. */
  abort(): { audioStarted: boolean; text: string } {
    const snapshot = { audioStarted: this.audioOn, text: this.text };
    if (this.isActive) {
      this.teardown();
      this.onEnded("aborted");
    }
    return snapshot;
  }

  private get stale(): boolean { return !this.isActive || this.controller.signal.aborted; }

  private openTts(): void {
    this.tts = this.deps.createTts({
      onAudio: (chunk) => this.onAudio(chunk),
      onFinal: () => this.onProviderFinal(),
      onError: (code, message) => this.onTtsError(code, message)
    });
  }

  private onDelta(delta: string): void {
    if (this.stale) return;
    if (!this.firstDeltaAt) this.firstDeltaAt = this.now();
    const spoken = this.parser.feed(delta);
    if (spoken) this.speak(spoken);
  }

  private speak(text: string): void {
    for (const chunk of this.chunker.push(text)) this.sendChunk(chunk);
  }

  private sendChunk(chunk: string): void {
    if (this.stale) return;
    if (!this.tts || this.tts.dead) this.openTts();
    this.textSent = true;
    if (!this.firstChunkAt) this.firstChunkAt = this.now();
    this.spokenText += (this.spokenText ? " " : "") + chunk;
    this.deps.send({ type: "text_delta", turnId: this.id, text: chunk });
    this.tts?.sendText(chunk);
  }

  private finishInput(answer: string): void {
    const tail = this.parser.finish();
    if (tail) this.speak(tail);
    for (const chunk of this.chunker.flush()) this.sendChunk(chunk);
    if (!this.textSent) {
      // Nothing streamed (planned requests) or only a text block: speak the finished answer now.
      const spoken = this.deps.splitSpoken(answer).trim();
      if (spoken) {
        this.speak(spoken);
        for (const chunk of this.chunker.flush()) this.sendChunk(chunk);
      }
    }
    if (!this.textSent) {
      this.teardown();
      this.deps.send({ type: "assistant_end", turnId: this.id });
      this.onEnded("finished");
      return;
    }
    this.tts?.end();
  }

  private onAudio(chunk: Buffer): void {
    if (this.stale) return;
    this.outputBytes += chunk.length;
    this.audioChunks++;
    if (this.outputBytes > this.deps.maxOutputBytes) { this.fail("output_limit", "Voice response exceeded its audio limit."); return; }
    if (this.deps.clientStalled()) { this.fail("backpressure", "Voice client cannot receive audio quickly enough."); return; }
    if (!this.audioOn) {
      this.audioOn = true;
      this.firstAudioAt = this.now();
      this.deps.send({ type: "audio_start", turnId: this.id, encoding: "pcm_s16le", sampleRate: 16000, channels: 1 });
    }
    this.deps.pacer.push(chunk);
  }

  private onProviderFinal(): void {
    if (this.stale || this.providerFinal) return;
    this.providerFinal = true;
    if (!this.audioOn) { this.fail("tts_empty_audio", "Speech synthesis completed without producing audio. Please try again."); return; }
    this.deps.log?.("turn_audio_done", this.metrics());
    this.deps.pacer.whenDrained(() => this.finishOk());
  }

  private onTtsError(code: string, message: string): void {
    if (this.stale) return;
    // A pre-warmed connection that dies before any text was sent is replaced on demand.
    if (!this.textSent) { this.deps.log?.("tts_prewarm_failed", { code }); return; }
    this.fail(code, message);
  }

  private finishOk(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.tts?.abort();
    this.deps.send({ type: "audio_end", turnId: this.id });
    this.deps.send({ type: "assistant_end", turnId: this.id });
    this.onEnded("finished");
  }

  private fail(code: string, message: string): void {
    if (!this.isActive) return;
    this.teardown();
    this.deps.send({ type: "error", code, message, recoverable: true, scope: "turn" });
    this.deps.send({ type: "assistant_end", turnId: this.id });
    this.onEnded("failed");
  }

  private teardown(): void {
    this.isActive = false;
    this.controller.abort(new DOMException("Voice turn ended", "AbortError"));
    this.tts?.abort();
    this.deps.pacer.clear();
  }

  private metrics(): Record<string, unknown> {
    const since = (t: number) => (t ? t - this.startedAt : null);
    return {
      turnId: this.id,
      firstTextDeltaMs: since(this.firstDeltaAt),
      firstSpeechChunkMs: since(this.firstChunkAt),
      firstAudioMs: since(this.firstAudioAt),
      totalMs: this.now() - this.startedAt,
      spokenChars: this.spokenText.length,
      audioBytes: this.outputBytes,
      audioChunks: this.audioChunks
    };
  }
}
