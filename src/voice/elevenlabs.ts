export interface ElevenLabsOptions {
  apiKey: string;
  voiceId: string;
  modelId?: string;
}

export async function* streamElevenLabsPcm(
  text: string,
  options: ElevenLabsOptions,
  signal: AbortSignal
): AsyncGenerator<Buffer> {
  if (!options.apiKey || !options.voiceId) {
    throw new Error("ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be configured.");
  }
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(options.voiceId)}/stream?output_format=pcm_16000`,
    {
      method: "POST",
      headers: {
        "xi-api-key": options.apiKey,
        "content-type": "application/json",
        accept: "application/octet-stream"
      },
      body: JSON.stringify({
        text,
        model_id: options.modelId ?? "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      }),
      signal
    }
  );
  if (!response.ok || !response.body) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${detail || response.statusText}`);
  }

  const reader = response.body.getReader();
  let carry = Buffer.alloc(0);
  try {
    while (true) {
      if (signal.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.concat([carry, Buffer.from(value)]);
      // PCM16 samples must remain aligned on two-byte boundaries.
      const usable = chunk.length - (chunk.length % 2);
      if (usable) yield chunk.subarray(0, usable);
      carry = chunk.subarray(usable);
    }
  } finally {
    reader.releaseLock();
  }
}
