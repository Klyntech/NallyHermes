import { config } from "../../config.js";

export type ElevenLabsSpeech = {
  audio: Buffer;
  mimeType: string;
  extension: string;
  provider: "elevenlabs";
  speed: number;
};

/**
 * Synthesize speech with ElevenLabs at a slightly reduced speaking rate
 * for clearer production playback (default 0.9 = 10% slower).
 * @see https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */
export async function synthesizeWithElevenLabs(
  text: string,
  options?: { voiceId?: string; speed?: number }
): Promise<ElevenLabsSpeech> {
  if (!config.VOICE_ENABLED) {
    throw new Error("Voice is disabled. Set VOICE_ENABLED=true to use speech output.");
  }
  if (!config.ELEVENLABS_API_KEY) {
    throw new Error("ElevenLabs is not configured. Add ELEVENLABS_API_KEY.");
  }

  const voiceId = options?.voiceId ?? config.ELEVENLABS_VOICE_ID;
  if (!voiceId) {
    throw new Error("ELEVENLABS_VOICE_ID is required for speech output.");
  }

  const speed = clampSpeed(options?.speed ?? config.VOICE_SPEECH_SPEED);
  const clipped = text.trim().slice(0, config.VOICE_TTS_MAX_CHARS);
  if (!clipped) {
    throw new Error("Nothing to speak.");
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": config.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify({
      text: clipped,
      model_id: config.ELEVENLABS_MODEL_ID,
      output_format: "mp3_44100_128",
      voice_settings: {
        stability: config.VOICE_STABILITY,
        similarity_boost: config.VOICE_SIMILARITY_BOOST,
        style: config.VOICE_STYLE,
        use_speaker_boost: true,
        speed
      }
    }),
    signal: AbortSignal.timeout(config.VOICE_TTS_TIMEOUT_MS)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audio: Buffer.from(arrayBuffer),
    mimeType: "audio/mpeg",
    extension: "mp3",
    provider: "elevenlabs",
    speed
  };
}

function clampSpeed(value: number): number {
  if (!Number.isFinite(value)) return 0.9;
  return Math.min(1.2, Math.max(0.7, value));
}
