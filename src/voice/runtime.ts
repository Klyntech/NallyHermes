import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { respond } from "../agent/orchestrator.js";
import { config } from "../config.js";
import { DeepgramLiveTranscriber } from "./deepgram.js";
import { streamElevenLabsPcm } from "./elevenlabs.js";
import type { VoiceSession } from "./session.js";
import type { VoiceServerEvent } from "./protocol.js";

export interface VoiceRuntimeTransport {
  sendEvent(sessionId: string, event: VoiceServerEvent): boolean;
  sendAudioFrame(sessionId: string, turnId: number, generationId: number, frame: Buffer): boolean;
}

interface SessionPipeline {
  transcriber?: DeepgramLiveTranscriber;
  history: ChatCompletionMessageParam[];
  currentTurnId: number;
  responseTask?: Promise<void>;
}

function audioFrame(turnId: number, generationId: number, pcm: Buffer): Buffer {
  const header = Buffer.alloc(16);
  header.write("NLYA", 0, "ascii");
  header[4] = 1;
  header[5] = 1;
  header.writeUInt32BE(turnId, 8);
  header.writeUInt32BE(generationId, 12);
  return Buffer.concat([header, pcm]);
}

function parseInputFrame(frame: Buffer): Buffer {
  if (frame.length < 18 || frame.toString("ascii", 0, 4) !== "NLYA" ||
      frame[4] !== 1 || frame[5] !== 1 || frame[6] !== 0 || frame[7] !== 0 ||
      (frame.length - 16) % 2 !== 0) {
    throw new Error("Invalid Nally PCM audio frame.");
  }
  // Client microphone frames are deliberately unbound to an assistant turn.
  if (frame.readUInt32BE(8) !== 0 || frame.readUInt32BE(12) !== 0) {
    throw new Error("Unexpected identifiers on microphone audio frame.");
  }
  return frame.subarray(16);
}

export class NallyVoiceRuntime {
  private readonly pipelines = new Map<string, SessionPipeline>();

  constructor(private readonly transport: VoiceRuntimeTransport) {}

  async startAudio(session: VoiceSession, userId: string): Promise<void> {
    const existing = this.pipelines.get(session.id);
    if (existing?.transcriber) return;
    const pipeline: SessionPipeline = existing ?? {
      history: [],
      currentTurnId: 0
    };
    this.pipelines.set(session.id, pipeline);
    try {
      pipeline.transcriber = await DeepgramLiveTranscriber.connect(config.DEEPGRAM_API_KEY ?? "", (event) => {
        if (session.status !== "ready") return;
        if (event.speechStarted) {
          const previous = session.hasActiveResponse
            ? { turnId: session.currentTurnId, generationId: session.currentGenerationId }
            : undefined;
          pipeline.currentTurnId = session.beginTurn();
          if (previous) {
            this.transport.sendEvent(session.id, {
              v: 1, type: "assistant.interrupted", sessionId: session.id,
              turnId: previous.turnId, generationId: previous.generationId, reason: "user_speech"
            });
          }
          this.transport.sendEvent(session.id, {
            v: 1, type: "input.speech_start", sessionId: session.id, turnId: pipeline.currentTurnId
          });
          return;
        }
        if (!event.text) return;
        this.transport.sendEvent(session.id, {
          v: 1,
          type: event.final ? "input.transcript.final" : "input.transcript.partial",
          sessionId: session.id,
          turnId: pipeline.currentTurnId || session.currentTurnId,
          text: event.text
        });
        if (event.final && pipeline.currentTurnId > 0) {
          const turnId = pipeline.currentTurnId;
          pipeline.responseTask = this.answerTurn(session, pipeline, userId, turnId, event.text);
        }
      });
    } catch (error) {
      this.pipelines.delete(session.id);
      throw error;
    }
  }

  acceptAudio(session: VoiceSession, frame: Buffer): void {
    const pipeline = this.pipelines.get(session.id);
    if (!pipeline?.transcriber) throw new Error("Audio input started before the speech recognizer was ready.");
    pipeline.transcriber.sendAudio(parseInputFrame(frame));
  }

  async handleControl(session: VoiceSession, userId: string, type: string): Promise<void> {
    if (type === "audio.end") {
      this.pipelines.get(session.id)?.transcriber?.finish();
      const pipeline = this.pipelines.get(session.id);
      if (pipeline) pipeline.transcriber = undefined;
    }
    if (type === "session.stop") this.closeSession(session.id);
  }

  closeSession(sessionId: string): void {
    const pipeline = this.pipelines.get(sessionId);
    pipeline?.transcriber?.finish();
    this.pipelines.delete(sessionId);
  }

  private async answerTurn(
    session: VoiceSession,
    pipeline: SessionPipeline,
    userId: string,
    turnId: number,
    transcript: string
  ): Promise<void> {
    let lease: ReturnType<VoiceSession["beginResponse"]> | undefined;
    try {
      lease = session.beginResponse(turnId);
      this.transport.sendEvent(session.id, {
        v: 1, type: "assistant.response_start", sessionId: session.id,
        turnId, generationId: lease.generationId
      });
      const answer = await respond(pipeline.history, transcript, userId);
      if (!session.acceptsOutput(turnId, lease.generationId)) return;
      pipeline.history.push(
        { role: "user", content: transcript },
        { role: "assistant", content: answer }
      );
      pipeline.history = pipeline.history.slice(-24);
      this.transport.sendEvent(session.id, {
        v: 1, type: "assistant.text.delta", sessionId: session.id,
        turnId, generationId: lease.generationId, delta: answer
      });

      let sentAudio = false;
      let pending = Buffer.alloc(0);
      for await (const chunk of streamElevenLabsPcm(answer, {
        apiKey: config.ELEVENLABS_API_KEY ?? "",
        voiceId: config.ELEVENLABS_VOICE_ID ?? "",
        modelId: config.ELEVENLABS_MODEL_ID
      }, lease.signal)) {
        if (!session.acceptsOutput(turnId, lease.generationId)) return;
        pending = Buffer.concat([pending, chunk]);
        // Emit ~40 ms chunks to reduce WebSocket overhead while keeping playback responsive.
        while (pending.length >= 1280) {
          const pcm = pending.subarray(0, 1280);
          pending = pending.subarray(1280);
          if (this.transport.sendAudioFrame(session.id, turnId, lease.generationId, audioFrame(turnId, lease.generationId, pcm))) {
            sentAudio = true;
          }
        }
      }
      if (pending.length >= 2 && session.acceptsOutput(turnId, lease.generationId)) {
        this.transport.sendAudioFrame(session.id, turnId, lease.generationId, audioFrame(turnId, lease.generationId, pending));
        sentAudio = true;
      }
      if (!session.acceptsOutput(turnId, lease.generationId)) return;
      this.transport.sendEvent(session.id, {
        v: 1, type: "assistant.response_end", sessionId: session.id,
        turnId, generationId: lease.generationId
      });
      session.finishResponse(turnId, lease.generationId);
      void sentAudio;
    } catch (error) {
      if (lease && session.acceptsOutput(turnId, lease.generationId)) {
        this.transport.sendEvent(session.id, {
          v: 1, type: "session.error", sessionId: session.id,
          code: "VOICE_RESPONSE_FAILED",
          message: error instanceof Error ? error.message : "Voice response failed."
        });
        session.finishResponse(turnId, lease.generationId);
      }
      console.error("Voice response pipeline failed:", error);
    }
  }
}
