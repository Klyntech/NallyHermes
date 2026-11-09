const TARGET_RATE = 16000;
const FRAME_SAMPLES = 320;

class NallyMicrophoneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sourceQueue = new Float32Array(0);
    this.sourcePosition = 0;
    this.outputQueue = [];
    this.active = true;
    this.port.onmessage = (event) => {
      if (event.data?.type === "stop") this.active = false;
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (output) for (const channel of output) channel.fill(0);
    if (!this.active) return false;

    const input = inputs[0];
    if (!input || !input[0]) return true;
    const mono = input[0];
    const combined = new Float32Array(this.sourceQueue.length + mono.length);
    combined.set(this.sourceQueue);
    combined.set(mono, this.sourceQueue.length);
    const ratio = sampleRate / TARGET_RATE;
    const samples = [];
    while (this.sourcePosition + 1 < combined.length) {
      const left = Math.floor(this.sourcePosition);
      const fraction = this.sourcePosition - left;
      samples.push(combined[left] * (1 - fraction) + combined[left + 1] * fraction);
      this.sourcePosition += ratio;
    }
    const consumed = Math.floor(this.sourcePosition);
    this.sourceQueue = combined.slice(consumed);
    this.sourcePosition -= consumed;
    for (const sample of samples) {
      this.outputQueue.push(sample);
      if (this.outputQueue.length === FRAME_SAMPLES) this.emitFrame();
    }
    return true;
  }

  emitFrame() {
    const pcm = new Int16Array(FRAME_SAMPLES);
    let energy = 0;
    for (let i = 0; i < FRAME_SAMPLES; i++) {
      const sample = Math.max(-1, Math.min(1, this.outputQueue[i]));
      energy += sample * sample;
      pcm[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }
    const rms = Math.sqrt(energy / FRAME_SAMPLES);
    this.outputQueue.length = 0;
    this.port.postMessage({ type: "audio", pcm: pcm.buffer, rms }, [pcm.buffer]);
  }
}

registerProcessor("nally-microphone-processor", NallyMicrophoneProcessor);