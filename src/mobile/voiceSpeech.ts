/**
 * Streaming text -> speakable chunks.
 *
 * The agent replies as "===SPOKEN=== ... ===TEXT=== ..." (see SPOKEN_STYLE_GUIDANCE). SpokenStreamParser
 * extracts only the spoken part from a token stream; SpeechChunker cuts it into sentences so TTS can start
 * on the first sentence while the model is still writing the rest.
 */

const SPOKEN_MARKER = /===\s*SPOKEN\s*===/i;
const TEXT_MARKER = /===\s*TEXT\s*===/i;
// A buffer tail that could still grow into "===TEXT===" or "===SPOKEN===".
const PARTIAL_MARKER = /^={1,3}\s*(?:t(?:e(?:x(?:t(?:\s*={0,3})?)?)?)?|s(?:p(?:o(?:k(?:e(?:n(?:\s*={0,3})?)?)?)?)?)?)?\s*$/i;

function heldTailStart(buffer: string): number {
  const from = Math.max(0, buffer.length - 24);
  for (let i = from; i < buffer.length; i++) {
    if (buffer[i] === "=" && PARTIAL_MARKER.test(buffer.slice(i))) return i;
  }
  return -1;
}

export class SpokenStreamParser {
  private mode: "undecided" | "spoken" | "done" = "undecided";
  private buffer = "";
  structured = false;

  /** Feed a model text delta; returns text that may be spoken now ("" if nothing yet). */
  feed(delta: string): string {
    if (this.mode === "done" || !delta) return "";
    this.buffer += delta;
    return this.drain(false);
  }

  /** Call once the model finished; returns any text still held back. */
  finish(): string {
    if (this.mode === "done") return "";
    const out = this.drain(true);
    this.mode = "done";
    return out;
  }

  private drain(final: boolean): string {
    let out = "";
    for (;;) {
      if (this.mode === "done") return out;
      if (this.mode === "undecided") {
        const trimmed = this.buffer.trimStart();
        if (!trimmed) return out;
        const spoken = SPOKEN_MARKER.exec(this.buffer);
        if (spoken) {
          this.buffer = this.buffer.slice(spoken.index + spoken[0].length).replace(/^\s+/, "");
          this.mode = "spoken";
          this.structured = true;
          continue;
        }
        const couldBeMarker = trimmed.startsWith("=") && trimmed.length < 24 && !final;
        if (couldBeMarker) return out;
        this.mode = "spoken";
        continue;
      }
      // spoken mode
      const spokenMarker = SPOKEN_MARKER.exec(this.buffer);
      const textMarker = TEXT_MARKER.exec(this.buffer);
      if (spokenMarker && (!textMarker || spokenMarker.index < textMarker.index)) {
        // A second SPOKEN marker (e.g. after a short preamble): keep what precedes it, drop the marker.
        out += this.buffer.slice(0, spokenMarker.index);
        this.buffer = this.buffer.slice(spokenMarker.index + spokenMarker[0].length).replace(/^\s+/, "");
        this.structured = true;
        continue;
      }
      if (textMarker) {
        out += this.buffer.slice(0, textMarker.index);
        this.buffer = "";
        this.mode = "done";
        return out;
      }
      if (final) {
        const held = heldTailStart(this.buffer);
        out += held >= 0 ? this.buffer.slice(0, held) : this.buffer;
        this.buffer = "";
        return out;
      }
      const held = heldTailStart(this.buffer);
      if (held < 0) {
        out += this.buffer;
        this.buffer = "";
      } else {
        out += this.buffer.slice(0, held);
        this.buffer = this.buffer.slice(held);
      }
      return out;
    }
  }
}

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "inc", "ltd", "approx", "dept",
  "e.g", "i.e", "u.s", "u.k", "a.m", "p.m", "ph.d"
]);

/** Remove what text-to-speech should not read aloud: links, markdown markers, bullets. */
export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)[^)]*\)/gi, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, "$1")
    .replace(/(^|\n)\s*[-*•]\s+/g, "$1")
    .replace(/(\*\*|__|`+)/g, "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export type ChunkerOptions = {
  /** Cut the first chunk at a clause boundary once it is this long, so audio can start sooner. */
  firstClauseChars?: number;
  /** Later sentences are grouped until at least this long (better prosody than one-word chunks). */
  minChars?: number;
  /** Never hold more than this without cutting at a space. */
  maxChars?: number;
  /** Stop speaking after roughly this many characters (cut at a sentence end). */
  maxTotalChars?: number;
};

export class SpeechChunker {
  private pending = "";
  private emitted = 0;
  private first = true;
  private capped = false;
  private readonly o: Required<ChunkerOptions>;

  constructor(options: ChunkerOptions = {}) {
    this.o = { firstClauseChars: 70, minChars: 45, maxChars: 260, maxTotalChars: 900, ...options };
  }

  get emittedChars(): number { return this.emitted; }

  push(text: string): string[] {
    if (this.capped || !text) return [];
    this.pending += text;
    return this.collect(false);
  }

  flush(): string[] {
    if (this.capped) return [];
    return this.collect(true);
  }

  private collect(final: boolean): string[] {
    const out: string[] = [];
    for (;;) {
      const cut = this.nextCut(final);
      if (cut <= 0) break;
      const raw = this.pending.slice(0, cut);
      this.pending = this.pending.slice(cut);
      const chunk = sanitizeForSpeech(raw);
      if (!chunk || !/[\p{L}\p{N}]/u.test(chunk)) continue;
      out.push(chunk);
      this.emitted += chunk.length;
      this.first = false;
      if (this.emitted >= this.o.maxTotalChars) {
        this.capped = true;
        this.pending = "";
        break;
      }
    }
    return out;
  }

  /** Index just past the next chunk, or 0 when more text is needed. */
  private nextCut(final: boolean): number {
    const text = this.pending;
    if (!text.trim()) { if (final) this.pending = ""; return 0; }
    const minLen = this.first ? 1 : this.o.minChars;
    let search = 0;
    for (;;) {
      const end = this.findSentenceEnd(text, search);
      if (end < 0) break;
      if (sanitizeForSpeech(text.slice(0, end)).length >= minLen) return end;
      search = end;
    }
    if (this.first && text.length >= this.o.firstClauseChars) {
      const clause = this.lastClauseBreak(text);
      if (clause > 24) return clause;
    }
    if (text.length >= this.o.maxChars) {
      const space = text.lastIndexOf(" ", this.o.maxChars);
      return space > 40 ? space + 1 : this.o.maxChars;
    }
    return final ? text.length : 0;
  }

  private findSentenceEnd(text: string, from: number): number {
    const re = /[.!?…]+["')\]]*(?=\s)|\n+/g;
    re.lastIndex = from;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const end = m.index + m[0].length;
      if (m[0].startsWith("\n")) return end;
      if (text[m.index] === "." && this.isAbbreviationOrDecimal(text, m.index)) continue;
      // Need the following whitespace to be present to be sure the sentence ended.
      return end;
    }
    return -1;
  }

  private isAbbreviationOrDecimal(text: string, dotIndex: number): boolean {
    const before = text.slice(Math.max(0, dotIndex - 8), dotIndex).toLowerCase();
    const word = /([a-z]+(?:\.[a-z]+)*)$/.exec(before)?.[1] ?? "";
    if (word && ABBREVIATIONS.has(word)) return true;
    return /\d$/.test(before) && /^\d/.test(text.slice(dotIndex + 1).trimStart()) ;
  }

  private lastClauseBreak(text: string): number {
    let best = -1;
    const re = /[,;:—–](?=\s)/g;
    for (let m = re.exec(text); m; m = re.exec(text)) best = m.index + 1;
    return best;
  }
}
