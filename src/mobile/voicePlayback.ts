/** Mono PCM16 at 16 kHz is 32 bytes per millisecond. */
export const PCM16_16K_BYTES_PER_MS = 32;

export type PacerClock = {
  now: () => number;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

const realClock: PacerClock = {
  now: () => Date.now(),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/**
 * ElevenLabs synthesizes speech much faster than real time. Forwarding every chunk as soon as
 * it arrives makes the phone queue many seconds of audio: memory grows, barge-in has more audio
 * to flush, and long replies can hit the client's playback cap and kill the call. The pacer keeps
 * the client at most `leadMs` (plus one chunk) ahead of what it has actually played.
 */
export class PcmPacer {
  private queue: Buffer[] = [];
  private sentMs = 0;
  private startedAt: number | null = null;
  private timer: unknown = null;
  private drainWaiters: Array<() => void> = [];
  private disposed = false;

  constructor(
    private readonly emit: (chunk: Buffer) => void,
    private readonly leadMs: number,
    private readonly clock: PacerClock = realClock
  ) {}

  get queuedBytes(): number {
    return this.queue.reduce((total, chunk) => total + chunk.length, 0);
  }

  push(chunk: Buffer): void {
    if (this.disposed || chunk.length === 0) return;
    this.queue.push(chunk);
    this.pump();
  }

  /** Run `callback` once every queued chunk has been handed to `emit`. */
  whenDrained(callback: () => void): void {
    if (this.disposed) return;
    if (this.queue.length === 0) callback();
    else this.drainWaiters.push(callback);
  }

  /** Drop queued audio (barge-in or teardown). Pending drain callbacks are discarded, not run. */
  clear(): void {
    this.queue = [];
    this.drainWaiters = [];
    this.cancelTimer();
    this.sentMs = 0;
    this.startedAt = null;
  }

  dispose(): void {
    this.clear();
    this.disposed = true;
  }

  private bufferedMs(now: number): number {
    if (this.startedAt === null) return 0;
    return Math.max(0, this.sentMs - (now - this.startedAt));
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clock.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private pump(): void {
    if (this.disposed) return;
    this.cancelTimer();
    while (this.queue.length > 0) {
      const now = this.clock.now();
      const buffered = this.bufferedMs(now);
      if (buffered > this.leadMs) {
        this.timer = this.clock.setTimer(() => {
          this.timer = null;
          this.pump();
        }, Math.ceil(buffered - this.leadMs));
        return;
      }
      if (buffered === 0) {
        // First chunk, or the client drained everything (underrun): restart the playback clock.
        this.startedAt = now;
        this.sentMs = 0;
      }
      const chunk = this.queue.shift() as Buffer;
      this.sentMs += chunk.length / PCM16_16K_BYTES_PER_MS;
      this.emit(chunk);
    }
    const waiters = this.drainWaiters;
    this.drainWaiters = [];
    for (const waiter of waiters) waiter();
  }
}

const SHORT_INTERRUPTS = /^(stop|wait|no|hold on|hang on|pause|cancel|sorry|hey|nally)\b/i;

/**
 * Echo and room noise tend to produce 1–2 character interim transcripts. Treat an interim result
 * as real barge-in speech only when it has enough letters/digits, or is a short explicit interrupt
 * such as "stop" or "wait".
 */
export function isBargeInSpeech(interimText: string, minChars: number): boolean {
  const text = interimText.trim();
  if (!text) return false;
  if (SHORT_INTERRUPTS.test(text)) return true;
  return text.replace(/[^\p{L}\p{N}]/gu, "").length >= minChars;
}
