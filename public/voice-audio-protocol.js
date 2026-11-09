export const VOICE_AUDIO_HEADER_BYTES = 16;
export const VOICE_AUDIO_SAMPLE_RATE = 16000;
export const VOICE_AUDIO_CODEC_PCM16_MONO = 1;
const MAGIC = [0x4e, 0x4c, 0x59, 0x41];

export function encodePcm16Frame(pcmBuffer, turnId = 0, generationId = 0) {
  if (!(pcmBuffer instanceof ArrayBuffer) || pcmBuffer.byteLength < 2 || pcmBuffer.byteLength % 2 !== 0) {
    throw new TypeError("PCM payload must be a non-empty Int16 ArrayBuffer");
  }
  if (!Number.isSafeInteger(turnId) || turnId < 0 || turnId > 0xffffffff ||
      !Number.isSafeInteger(generationId) || generationId < 0 || generationId > 0xffffffff) {
    throw new RangeError("Audio frame identifiers must be unsigned 32-bit integers");
  }
  const frame = new ArrayBuffer(VOICE_AUDIO_HEADER_BYTES + pcmBuffer.byteLength);
  const bytes = new Uint8Array(frame);
  bytes.set(MAGIC, 0);
  bytes[4] = 1;
  bytes[5] = VOICE_AUDIO_CODEC_PCM16_MONO;
  bytes[6] = 0;
  bytes[7] = 0;
  const view = new DataView(frame);
  view.setUint32(8, turnId, false);
  view.setUint32(12, generationId, false);
  bytes.set(new Uint8Array(pcmBuffer), VOICE_AUDIO_HEADER_BYTES);
  return frame;
}

export function decodePcm16Frame(frame) {
  if (!(frame instanceof ArrayBuffer) || frame.byteLength <= VOICE_AUDIO_HEADER_BYTES ||
      (frame.byteLength - VOICE_AUDIO_HEADER_BYTES) % 2 !== 0) return null;
  const bytes = new Uint8Array(frame);
  if (!MAGIC.every((value, index) => bytes[index] === value) || bytes[4] !== 1 ||
      bytes[5] !== VOICE_AUDIO_CODEC_PCM16_MONO || bytes[6] !== 0 || bytes[7] !== 0) return null;
  const view = new DataView(frame);
  return {
    turnId: view.getUint32(8, false),
    generationId: view.getUint32(12, false),
    samples: new Int16Array(frame, VOICE_AUDIO_HEADER_BYTES)
  };
}
