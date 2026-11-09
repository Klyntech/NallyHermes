export const VOICE_PROTOCOL_VERSION = 1 as const;

export type VoiceClientEvent =
  | { v: 1; type: "session.start"; sessionId: string }
  | { v: 1; type: "audio.start"; sessionId: string }
  | { v: 1; type: "audio.end"; sessionId: string }
  | { v: 1; type: "turn.cancel"; sessionId: string; turnId: number }
  | { v: 1; type: "client.playback"; sessionId: string; turnId: number; generationId: number; playedThroughMs: number }
  | { v: 1; type: "session.stop"; sessionId: string };

export type VoiceServerEvent =
  | { v: 1; type: "session.ready"; sessionId: string }
  | { v: 1; type: "session.error"; sessionId: string; code: string; message: string }
  | { v: 1; type: "session.closed"; sessionId: string }
  | { v: 1; type: "input.speech_start"; sessionId: string; turnId: number }
  | { v: 1; type: "input.transcript.partial" | "input.transcript.final"; sessionId: string; turnId: number; text: string }
  | { v: 1; type: "assistant.response_start"; sessionId: string; turnId: number; generationId: number }
  | { v: 1; type: "assistant.text.delta"; sessionId: string; turnId: number; generationId: number; delta: string }
  | { v: 1; type: "assistant.response_end"; sessionId: string; turnId: number; generationId: number }
  | { v: 1; type: "assistant.audio.start" | "assistant.audio.end"; sessionId: string; turnId: number; generationId: number }
  | { v: 1; type: "assistant.interrupted"; sessionId: string; turnId: number; generationId: number; reason: string }
  | { v: 1; type: "usage.update"; sessionId: string; audioInputMs?: number; audioOutputMs?: number; inputTokens?: number; outputTokens?: number };

const CLIENT_TYPES = new Set([
  "session.start", "audio.start", "audio.end", "turn.cancel", "client.playback", "session.stop"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

/** Parse and validate untrusted JSON control data from a voice client. */
export function parseVoiceClientEvent(input: unknown): VoiceClientEvent {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      throw new Error("Malformed voice event JSON");
    }
  }

  if (!isRecord(value)) throw new Error("Voice event must be a JSON object");
  if (value.v !== VOICE_PROTOCOL_VERSION) throw new Error("Unsupported voice protocol version");
  if (typeof value.type !== "string" || !CLIENT_TYPES.has(value.type)) {
    throw new Error("Unsupported voice client event type");
  }
  if (typeof value.sessionId !== "string" || value.sessionId.length < 1 || value.sessionId.length > 128) {
    throw new Error("Invalid voice sessionId");
  }

  switch (value.type) {
    case "session.start":
    case "audio.start":
    case "audio.end":
    case "session.stop":
      return { v: 1, type: value.type, sessionId: value.sessionId };
    case "turn.cancel":
      if (!isPositiveInteger(value.turnId)) throw new Error("Invalid turnId");
      return { v: 1, type: "turn.cancel", sessionId: value.sessionId, turnId: value.turnId };
    case "client.playback":
      if (!isPositiveInteger(value.turnId) || !isPositiveInteger(value.generationId)) {
        throw new Error("Invalid playback turn or generation identifier");
      }
      if (typeof value.playedThroughMs !== "number" || !Number.isFinite(value.playedThroughMs) || value.playedThroughMs < 0) {
        throw new Error("Invalid playback position");
      }
      return {
        v: 1,
        type: "client.playback",
        sessionId: value.sessionId,
        turnId: value.turnId,
        generationId: value.generationId,
        playedThroughMs: value.playedThroughMs
      };
  }
}
