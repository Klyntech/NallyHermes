export type DeepgramTranscriptUpdate = {
  text: string;
  final: boolean;
  utterance: string | null;
};

/**
 * Accumulates Deepgram final segments for one utterance while allowing partial
 * results to update the caption. Segment starts let repeated provider results
 * replace the same segment rather than duplicate words.
 */
export class DeepgramTranscriptBuffer {
  private segments: Array<{ start: number | null; text: string }> = [];
  private interim = "";

  update(input: {
    text: string;
    isFinal?: boolean;
    speechFinal?: boolean;
    start?: number;
  }): DeepgramTranscriptUpdate | null {
    const text = input.text.trim();
    if (!text) {
      return input.speechFinal ? this.flush() : null;
    }

    if (!input.isFinal && !input.speechFinal) {
      this.interim = text;
      return {
        text: [...this.segments.map((segment) => segment.text), text].join(" ").trim(),
        final: false,
        utterance: null
      };
    }

    this.interim = "";
    const start = Number.isFinite(input.start) ? Number(input.start) : null;
    const index = start === null ? -1 : this.segments.findIndex((segment) => segment.start === start);
    if (index >= 0) {
      this.segments[index] = { start, text };
    } else if (!(input.speechFinal && this.segments.at(-1)?.text === text)) {
      this.segments.push({ start, text });
    }

    const transcript = this.transcript();
    if (input.speechFinal) {
      this.reset();
      return { text: transcript, final: true, utterance: transcript || null };
    }
    return { text: transcript, final: false, utterance: null };
  }

  /** Flush accumulated final segments on Deepgram UtteranceEnd/Finalize. */
  flush(): DeepgramTranscriptUpdate | null {
    const transcript = this.transcript();
    this.reset();
    return transcript ? { text: transcript, final: true, utterance: transcript } : null;
  }

  private transcript(): string {
    return [...this.segments.map((segment) => segment.text), this.interim].filter(Boolean).join(" ").trim();
  }

  private reset(): void {
    this.segments = [];
    this.interim = "";
  }
}
