export const VOICE_AUDIO_HEADER_BYTES: number;
export const VOICE_AUDIO_SAMPLE_RATE: number;
export const VOICE_AUDIO_CODEC_PCM16_MONO: number;
export interface DecodedPcm16Frame {
  turnId: number;
  generationId: number;
  samples: Int16Array;
}
export function encodePcm16Frame(pcmBuffer: ArrayBuffer, turnId?: number, generationId?: number): ArrayBuffer;
export function decodePcm16Frame(frame: ArrayBuffer): DecodedPcm16Frame | null;
