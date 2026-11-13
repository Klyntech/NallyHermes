/**
 * Split a spoken-channel agent reply into:
 * - spoken: sent to ElevenLabs TTS (no links)
 * - text: Telegram-only supplement (links, sources, tables)
 */

export type SpokenChannelReply = {
  spoken: string;
  text: string;
  /** True when the model used ===SPOKEN=== / ===TEXT=== markers. */
  structured: boolean;
};

const SPOKEN_MARKER = /===\s*SPOKEN\s*===/i;
const TEXT_MARKER = /===\s*TEXT\s*===/i;
const URL_RE = /https?:\/\/\S+/gi;
const WWW_RE = /\bwww\.\S+/gi;

/** Strip URLs and collapse leftover punctuation for safer TTS. */
export function stripUnspeakable(text: string): string {
  let out = text.replace(URL_RE, "").replace(WWW_RE, "");
  // Drop orphan "Source / Last checked:" lines that only had links
  out = out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^source\s*\/\s*last\s*checked:?$/i.test(line)) return false;
      if (/^sources?:?$/i.test(line)) return false;
      return true;
    })
    .join("\n");
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

/**
 * Prefer structured ===SPOKEN=== / ===TEXT=== blocks.
 * Fallback: treat the whole answer as spoken (after URL strip) and put
 * extracted URLs into text.
 */
export function splitSpokenChannelReply(raw: string): SpokenChannelReply {
  const body = (raw ?? "").trim();
  if (!body) {
    return { spoken: "I did not catch a reply.", text: "", structured: false };
  }

  const spokenIdx = body.search(SPOKEN_MARKER);
  const textIdx = body.search(TEXT_MARKER);

  if (spokenIdx >= 0 && textIdx >= 0 && textIdx > spokenIdx) {
    const spokenPart = body
      .slice(spokenIdx)
      .replace(SPOKEN_MARKER, "")
      .split(TEXT_MARKER)[0];
    const spokenBlock = (spokenPart ?? "").trim();
    const textBlock = body.slice(textIdx).replace(TEXT_MARKER, "").trim();
    const spoken = stripUnspeakable(spokenBlock) || "Here is the answer in the text message.";
    const text = textBlock
      .replace(/^\(no extra text\)\s*$/i, "")
      .replace(/^n\/?a$/i, "")
      .replace(/^none$/i, "")
      .trim();
    return { spoken, text, structured: true };
  }

  // Unstructured fallback: pull links into text, speak the rest
  const links = [...body.matchAll(URL_RE)].map((m) => m[0]);
  const spoken = stripUnspeakable(body) || "I put the details in the text message.";
  const text =
    links.length > 0
      ? ["Sources:", ...links.map((u) => `- ${u}`)].join("\n")
      : "";
  return { spoken, text, structured: false };
}

