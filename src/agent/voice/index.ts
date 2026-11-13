import { config } from "../../config.js";
import { toVoiceResponse } from "../orchestra.js";
import { transcribeWithDeepgram, type DeepgramTranscript } from "./deepgram.js";
import { synthesizeWithElevenLabs, type ElevenLabsSpeech } from "./elevenlabs.js";

export { transcribeWithDeepgram, synthesizeWithElevenLabs };
export type { DeepgramTranscript, ElevenLabsSpeech };

export function isVoiceConfigured(): boolean {
  return Boolean(
    config.VOICE_ENABLED &&
      config.DEEPGRAM_API_KEY &&
      config.ELEVENLABS_API_KEY &&
      config.ELEVENLABS_VOICE_ID
  );
}

export async function speechToText(
  audio: Buffer,
  mimeType?: string
): Promise<DeepgramTranscript> {
  return transcribeWithDeepgram(audio, { mimeType });
}

export async function textToSpeech(text: string): Promise<ElevenLabsSpeech> {
  const bounded = toVoiceResponse(text, { maxChars: config.VOICE_TTS_MAX_CHARS });
  return synthesizeWithElevenLabs(bounded.text);
}
