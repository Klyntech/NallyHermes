import { config } from "../../config.js";

export type DeepgramTranscript = {
  text: string;
  confidence: number | null;
  durationSec: number | null;
  provider: "deepgram";
};

/**
 * Transcribe an audio buffer with Deepgram Nova.
 * @see https://developers.deepgram.com/reference/speech-to-text-api/listen
 */
export async function transcribeWithDeepgram(
  audio: Buffer,
  options?: { mimeType?: string; language?: string }
): Promise<DeepgramTranscript> {
  if (!config.VOICE_ENABLED) {
    throw new Error("Voice is disabled. Set VOICE_ENABLED=true to use speech input.");
  }
  if (!config.DEEPGRAM_API_KEY) {
    throw new Error("Deepgram is not configured. Add DEEPGRAM_API_KEY.");
  }

  const language = options?.language ?? config.DEEPGRAM_LANGUAGE;
  const model = config.DEEPGRAM_MODEL;
  const params = new URLSearchParams({
    model,
    smart_format: "true",
    punctuate: "true",
    language
  });

  const response = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${config.DEEPGRAM_API_KEY}`,
      "Content-Type": options?.mimeType ?? "audio/ogg"
    },
    body: audio,
    signal: AbortSignal.timeout(config.VOICE_STT_TIMEOUT_MS)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Deepgram STT failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{ transcript?: string; confidence?: number }>;
      }>;
    };
    metadata?: { duration?: number };
  };

  const alt = data.results?.channels?.[0]?.alternatives?.[0];
  const text = alt?.transcript?.trim() ?? "";
  if (!text) {
    throw new Error("Deepgram returned an empty transcript.");
  }

  return {
    text,
    confidence: typeof alt?.confidence === "number" ? alt.confidence : null,
    durationSec: typeof data.metadata?.duration === "number" ? data.metadata.duration : null,
    provider: "deepgram"
  };
}
