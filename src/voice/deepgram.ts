import { WebSocket } from "ws";

export interface DeepgramTranscript {
  text: string;
  final: boolean;
  speechStarted: boolean;
}

export class DeepgramLiveTranscriber {
  private readonly socket: WebSocket;
  private closed = false;
  private pendingFinal: string[] = [];

  private constructor(socket: WebSocket, private readonly onTranscript: (event: DeepgramTranscript) => void) {
    this.socket = socket;
    socket.on("message", (data, isBinary) => {
      if (isBinary || this.closed) return;
      let message: Record<string, unknown>;
      try { message = JSON.parse(data.toString()) as Record<string, unknown>; } catch { return; }
      if (message.type === "SpeechStarted") {
        this.onTranscript({ text: "", final: false, speechStarted: true });
        return;
      }
      if (message.type !== "Results") return;
      const channel = message.channel as { alternatives?: Array<{ transcript?: string }> } | undefined;
      const transcript = channel?.alternatives?.[0]?.transcript?.trim() ?? "";
      const isFinal = message.is_final === true;
      const speechFinal = message.speech_final === true;
      if (transcript && isFinal) this.pendingFinal.push(transcript);
      if (transcript && !isFinal) this.onTranscript({ text: transcript, final: false, speechStarted: false });
      if (speechFinal) {
        const text = this.pendingFinal.join(" ").trim() || transcript;
        this.pendingFinal = [];
        if (text) this.onTranscript({ text, final: true, speechStarted: false });
      }
    });
  }

  static async connect(apiKey: string, onTranscript: (event: DeepgramTranscript) => void): Promise<DeepgramLiveTranscriber> {
    if (!apiKey) throw new Error("DEEPGRAM_API_KEY is not configured.");
    const url = new URL("wss://api.deepgram.com/v1/listen");
    url.searchParams.set("encoding", "linear16");
    url.searchParams.set("sample_rate", "16000");
    url.searchParams.set("channels", "1");
    url.searchParams.set("interim_results", "true");
    url.searchParams.set("vad_events", "true");
    url.searchParams.set("endpointing", "300");
    url.searchParams.set("utterance_end_ms", "1000");
    url.searchParams.set("punctuate", "true");
    const socket = new WebSocket(url, { headers: { Authorization: `Token ${apiKey}` }, perMessageDeflate: false });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Deepgram connection timed out.")), 10_000);
      socket.once("open", () => { clearTimeout(timeout); resolve(); });
      socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
    });
    return new DeepgramLiveTranscriber(socket, onTranscript);
  }

  sendAudio(pcm16: Buffer): void {
    if (!this.closed && this.socket.readyState === WebSocket.OPEN && pcm16.length) this.socket.send(pcm16);
  }

  finish(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "Finalize" }));
      this.socket.send(JSON.stringify({ type: "CloseStream" }));
    }
    this.socket.close();
  }
}
