import { config } from "../../config.js";
import { toVoiceResponse } from "../orchestra.js";
import { transcribeWithDeepgram, type DeepgramTranscript } from "./deepgram.js";
import { synthesizeWithElevenLabs, type ElevenLabsSpeech } from "./elevenlabs.js";
import { splitSpokenChannelReply, type SpokenChannelReply } from "./spokenSplit.js";

export { transcribeWithDeepgram, synthesizeWithElevenLabs, splitSpokenChannelReply };
export type { DeepgramTranscript, ElevenLabsSpeech, SpokenChannelReply };

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

/**
 * Production voice path: split agent output into spoken + text, TTS only the spoken part.
 */
export async function prepareSpokenDelivery(rawAnswer: string): Promise<{
  split: SpokenChannelReply;
  speech: ElevenLabsSpeech;
}> {
  const split = splitSpokenChannelReply(rawAnswer);
  const bounded = toVoiceResponse(split.spoken, { maxChars: config.VOICE_TTS_MAX_CHARS });
  const speech = await synthesizeWithElevenLabs(bounded.text, {
    speed: config.VOICE_SPEECH_SPEED
  });
  return { split: { ...split, spoken: bounded.text }, speech };
}

/** Legacy helper: TTS the full string. Prefer prepareSpokenDelivery. */
export async function textToSpeech(text: string): Promise<ElevenLabsSpeech> {
  const bounded = toVoiceResponse(text, { maxChars: config.VOICE_TTS_MAX_CHARS });
  return synthesizeWithElevenLabs(bounded.text);
}
