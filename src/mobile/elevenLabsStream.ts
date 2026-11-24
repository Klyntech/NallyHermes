export type ElevenLabsTextInput = {
  text: string;
  try_trigger_generation: true;
  flush: true;
};

/** Flush buffered TTS generation with the final text message, without closing the WebSocket. */
export function buildElevenLabsTextInput(text: string): ElevenLabsTextInput {
  const spoken = text.trim();
  if (!spoken) throw new Error("ElevenLabs text input must not be empty.");
  return { text: spoken, try_trigger_generation: true, flush: true };
}

/**
 * Sent AFTER the last text message. ElevenLabs finishes any buffered audio, emits `isFinal`, and
 * closes the socket. Each voice turn uses its own socket, so this is the documented way to end it.
 * (An empty string must never be sent before the text: it would close the socket with no audio.)
 */
export function buildElevenLabsEndOfStream(): { text: "" } {
  return { text: "" };
}

/** Decode a provider audio payload and enforce mono PCM16 frame alignment. */
export function decodeElevenLabsPcmChunk(encoded: unknown): Buffer | null {
  if (typeof encoded !== "string" || encoded.length === 0) return null;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error("ElevenLabs returned malformed base64 audio.");
  }
  const chunk = Buffer.from(encoded, "base64");
  if (chunk.length === 0) return null;
  if (chunk.length % 2 !== 0) throw new Error("ElevenLabs returned non-frame-aligned PCM16 audio.");
  return chunk;
}

export function hasUsableTtsAudio(audioStarted: boolean, outputBytes: number): boolean {
  return audioStarted && Number.isFinite(outputBytes) && outputBytes > 0;
}
