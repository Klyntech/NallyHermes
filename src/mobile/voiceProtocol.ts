export const MOBILE_VOICE_PROTOCOL_VERSION = 1 as const;
export const MOBILE_VOICE_SAMPLE_RATE = 16_000 as const;
export const MOBILE_VOICE_CHANNELS = 1 as const;
export const MOBILE_VOICE_MAX_AUDIO_FRAME_BYTES = 32_000;

export type MobileVoiceClientControl =
  | { type: "start"; protocolVersion: 1; language?: string }
  | { type: "stop_input" }
  | { type: "interrupt" }
  | { type: "close" }
  | { type: "ping" };

export type MobileVoiceServerControl =
  | {
      type: "ready";
      protocolVersion: 1;
      input: { encoding: "pcm_s16le"; sampleRate: 16000; channels: 1 };
    }
  | { type: "transcript"; text: string; final: boolean }
  | { type: "assistant_start"; turnId: string }
  | { type: "text_delta"; turnId: string; text: string }
  | { type: "audio_start"; turnId: string; encoding: "mp3" }
  | { type: "audio_end"; turnId: string }
  | { type: "assistant_end"; turnId: string }
  | { type: "interrupted"; turnId: string }
  | { type: "pong" }
  | { type: "error"; code: string; message: string; recoverable: boolean };

export type ParsedVoiceControl =
  | { ok: true; value: MobileVoiceClientControl }
  | { ok: false; code: "invalid_json" | "invalid_message" | "unsupported_protocol" };

/**
 * Parse only the small JSON control plane. Audio travels in binary WebSocket
 * messages so base64 expansion and JSON buffering are avoided.
 */
export function parseMobileVoiceControl(input: string): ParsedVoiceControl {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return { ok: false, code: "invalid_json" };
  }
  if (!isRecord(value) || typeof value.type !== "string") {
    return { ok: false, code: "invalid_message" };
  }
  if (value.type === "start") {
    if (value.protocolVersion !== MOBILE_VOICE_PROTOCOL_VERSION) {
      return { ok: false, code: "unsupported_protocol" };
    }
    if (value.language !== undefined && (typeof value.language !== "string" || value.language.length > 35)) {
      return { ok: false, code: "invalid_message" };
    }
    return {
      ok: true,
      value: {
        type: "start",
        protocolVersion: MOBILE_VOICE_PROTOCOL_VERSION,
        ...(typeof value.language === "string" ? { language: value.language } : {})
      }
    };
  }
  if (value.type === "stop_input" || value.type === "interrupt" || value.type === "close" || value.type === "ping") {
    return { ok: true, value: { type: value.type } };
  }
  return { ok: false, code: "invalid_message" };
}

export function isMobileVoiceAudioFrame(data: Uint8Array): boolean {
  return data.byteLength > 0 &&
    data.byteLength <= MOBILE_VOICE_MAX_AUDIO_FRAME_BYTES &&
    data.byteLength % 2 === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
