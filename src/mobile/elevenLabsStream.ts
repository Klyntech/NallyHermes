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
