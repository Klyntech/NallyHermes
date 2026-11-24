import { createHmac, randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { and, eq, gt, isNull } from "drizzle-orm";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { mobileSessions, mobileVoiceTickets } from "../db/schema.js";
import type { MobileSession } from "../db/mobileStore.js";
import { getOrCreateConversation, loadConversationHistory, appendConversationExchange } from "../db/conversationStore.js";
import { respond } from "../agent/orchestrator.js";
import { toVoiceResponse } from "../agent/orchestra.js";
import { splitSpokenChannelReply } from "../agent/voice/spokenSplit.js";
import { isMobileVoiceAudioFrame, parseMobileVoiceControl } from "./voiceProtocol.js";
import { DeepgramTranscriptBuffer } from "./deepgramTranscript.js";
import { buildElevenLabsEndOfStream, buildElevenLabsTextInput, decodeElevenLabsPcmChunk, hasUsableTtsAudio } from "./elevenLabsStream.js";
import { isBargeInSpeech, PCM16_16K_BYTES_PER_MS, PcmPacer } from "./voicePlayback.js";

function envInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min && value <= max ? Math.trunc(value) : fallback;
}

const TICKET_TTL_MS = 60_000, MAX_CONNECTIONS = 100, IDLE_TIMEOUT_MS = 30_000;
const MAX_TRANSCRIPT_CHARS = 3_500, MAX_OUTPUT_BYTES = 8_000_000;
// Live-call budget. This is deliberately independent of VOICE_MAX_AUDIO_BYTES / VOICE_MAX_DURATION_SEC,
// which size Telegram voice *notes*: the microphone streams continuously (silence included), so
// reusing them ended every call after ~2 minutes.
const CALL_MAX_MS = envInt("VOICE_CALL_MAX_SEC", 1_800, 60, 7_200) * 1_000;
const MAX_SESSION_AUDIO_BYTES = Math.ceil(CALL_MAX_MS * PCM16_16K_BYTES_PER_MS * 1.1);
const MAX_SESSION_FRAMES = Math.ceil(CALL_MAX_MS / 10);
// Minimum letters in an interim transcript before it may interrupt Nally (filters echo/noise blips).
const BARGE_IN_MIN_CHARS = envInt("VOICE_BARGE_IN_MIN_CHARS", 6, 1, 40);
// How far ahead of real-time playback the server lets the phone's audio queue run.
const PLAYBACK_LEAD_MS = envInt("VOICE_PLAYBACK_LEAD_MS", 3_000, 500, 10_000);
// If the user starts talking again before Nally produced any audio, their earlier words are kept and
// merged into the next utterance; this is how long we wait for them to finish before answering anyway.
const CARRY_REDISPATCH_MS = 1_800;
// A socket buffer this large means the phone really has stopped reading (about 30 s of PCM).
const STALLED_CLIENT_BYTES = 1_000_000;
const ALLOWED_ORIGINS = new Set(config.MOBILE_VOICE_ALLOWED_ORIGINS.split(",").map((v) => v.trim()).filter(Boolean));
function ticketHash(value: string): string { return createHmac("sha256", config.TELEGRAM_BOT_TOKEN).update(value).digest("hex"); }
export async function mintVoiceTicket(session: MobileSession): Promise<{ ticket: string; expiresAt: Date }> {
  if (!config.VOICE_ENABLED) throw new Error("voice_disabled");
  const ticket = randomBytes(32).toString("base64url"), expiresAt = new Date(Date.now() + TICKET_TTL_MS);
  await db.insert(mobileVoiceTickets).values({ ticketHash: ticketHash(ticket), mobileSessionId: session.sessionId, userId: session.userId, expiresAt });
  return { ticket, expiresAt };
}
export async function consumeVoiceTicket(ticket: string): Promise<MobileSession | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(ticket)) return null;
  const now = new Date();
  const [claimed] = await db.update(mobileVoiceTickets).set({ consumedAt: now }).where(and(eq(mobileVoiceTickets.ticketHash, ticketHash(ticket)), gt(mobileVoiceTickets.expiresAt, now), isNull(mobileVoiceTickets.consumedAt))).returning({ sessionId: mobileVoiceTickets.mobileSessionId, userId: mobileVoiceTickets.userId });
  if (!claimed) return null;
  const [session] = await db.select({ sessionId: mobileSessions.id, userId: mobileSessions.userId, telegramId: mobileSessions.telegramId, telegramChatId: mobileSessions.telegramChatId, expiresAt: mobileSessions.expiresAt }).from(mobileSessions).where(and(eq(mobileSessions.id, claimed.sessionId), eq(mobileSessions.userId, claimed.userId), gt(mobileSessions.expiresAt, now), isNull(mobileSessions.revokedAt))).limit(1);
  return session ?? null;
}

type Providers = { deepgram: (language: string) => WebSocket; eleven: () => WebSocket };
const defaultProviders: Providers = {
  deepgram: (language) => {
    const q = new URLSearchParams({ model: config.DEEPGRAM_MODEL, language, encoding: "linear16", sample_rate: "16000", channels: "1", interim_results: "true", punctuate: "true", smart_format: "true", endpointing: "300", utterance_end_ms: "1000" });
    return new WebSocket(`wss://api.deepgram.com/v1/listen?${q}`, { headers: { Authorization: `Token ${config.DEEPGRAM_API_KEY}` } });
  },
  eleven: () => {
    const q = new URLSearchParams({ model_id: config.ELEVENLABS_MODEL_ID, output_format: "pcm_16000", inactivity_timeout: "180" });
    return new WebSocket(`wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.ELEVENLABS_VOICE_ID! )}/stream-input?${q}`, { headers: { "xi-api-key": config.ELEVENLABS_API_KEY! } });
  }
};

function rejectUpgrade(socket: { write: (chunk: string) => void; destroy: () => void }, status: number, reason: string, code: string): void {
  const body = JSON.stringify({ error: reason, code });
  socket.write(
    `HTTP/1.1 ${status} ${reason}\r\n` +
      "Content-Type: application/json\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      "Connection: close\r\n\r\n" +
      body
  );
  socket.destroy();
}

export function attachVoiceWebSocket(server: Server, consumeTicket = consumeVoiceTicket, providers: Providers = defaultProviders): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32_768, perMessageDeflate: false });
  const activeBySession = new Set<string>();
  if (!config.VOICE_ENABLED) {
    console.warn("[voice] VOICE_ENABLED is false — /api/mobile/voice upgrades will return 503.");
  } else {
    console.info("[voice] WebSocket upgrade handler attached at /api/mobile/voice");
  }
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/mobile/voice") {
      // Do not destroy unknown paths; other upgrade handlers may own them.
      return;
    }
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    // Empty allow-list = allow any origin (native clients often omit Origin).
    if (origin && ALLOWED_ORIGINS.size > 0 && !ALLOWED_ORIGINS.has(origin)) {
      rejectUpgrade(socket, 403, "Origin not allowed for voice", "origin_forbidden");
      return;
    }
    if (!config.VOICE_ENABLED) {
      rejectUpgrade(socket, 503, "Realtime voice is not enabled on this server", "voice_disabled");
      return;
    }
    if (wss.clients.size >= MAX_CONNECTIONS) {
      rejectUpgrade(socket, 503, "Voice service is at capacity", "voice_capacity");
      return;
    }
    const ticket = url.searchParams.get("ticket");
    if (!ticket) {
      rejectUpgrade(socket, 401, "Missing voice ticket", "ticket_missing");
      return;
    }
    void consumeTicket(ticket).then((session) => {
      if (!session) {
        rejectUpgrade(socket, 401, "Voice ticket is invalid or expired", "ticket_invalid");
        return;
      }
      if (activeBySession.has(session.sessionId)) {
        rejectUpgrade(socket, 429, "A voice call is already active for this account", "session_busy");
        return;
      }
      // Claim synchronously before handleUpgrade so concurrent requests cannot both pass
      // the has() check while the HTTP upgrade callback is still pending.
      activeBySession.add(session.sessionId);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        activeBySession.delete(session.sessionId);
      };
      socket.once("close", release);
      try {
        wss.handleUpgrade(req, socket, head, (ws) => handleSocket(ws, session, release, providers));
      } catch (error) {
        release();
        console.error("Voice WebSocket upgrade failed:", error);
        rejectUpgrade(socket, 500, "Voice connection upgrade failed", "upgrade_failed");
      }
    }).catch((error) => {
      console.error("Voice ticket validation failed:", error);
      rejectUpgrade(socket, 500, "Voice ticket validation failed", "ticket_error");
    });
  });
}

function handleSocket(ws: WebSocket, session: MobileSession, cleanup: () => void, providers: Providers): void {
  const startedAt = Date.now();
  let started = false, inputStopped = false, closed = false, audioBytes = 0, frames = 0, outputBytes = 0, lastActivity = Date.now();
  let dg: WebSocket | null = null, tts: WebSocket | null = null;
  // Turn state. `generation` changes whenever a turn starts, is interrupted or fails, so any late
  // callback from an older turn can tell it is stale and do nothing.
  let turnId = "", turnActive = false, audioActive = false, generation = 0;
  let pendingUtterance = "", carry = "";
  let turnAbort: AbortController | null = null;
  let ttsTimer: ReturnType<typeof setTimeout> | null = null, carryTimer: ReturnType<typeof setTimeout> | null = null;
  const transcriptBuffer = new DeepgramTranscriptBuffer();
  const send = (obj: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); };
  const pacer = new PcmPacer((chunk) => { if (ws.readyState === WebSocket.OPEN) ws.send(chunk, { binary: true }); }, PLAYBACK_LEAD_MS);
  // Confirm the transport is up before the client waits forever for Deepgram "ready".
  send({
    type: "hello",
    protocolVersion: 1,
    voiceEnabled: true,
    sttConfigured: Boolean(config.DEEPGRAM_API_KEY?.trim()),
    ttsConfigured: Boolean(config.ELEVENLABS_API_KEY?.trim() && config.ELEVENLABS_VOICE_ID?.trim())
  });
  const closeUpstream = (s: WebSocket | null) => { if (s && s.readyState < WebSocket.CLOSING) s.close(); };
  const clearCarry = () => {
    carry = "";
    if (carryTimer) { clearTimeout(carryTimer); carryTimer = null; }
  };
  const armCarry = () => {
    if (carryTimer) { clearTimeout(carryTimer); carryTimer = null; }
    if (!carry || closed) return;
    carryTimer = setTimeout(() => {
      carryTimer = null;
      if (closed || turnActive || !carry) return;
      const text = carry;
      carry = "";
      void beginAnswer(text);
    }, CARRY_REDISPATCH_MS);
  };
  /** Stop everything that belongs to the current turn: agent request, TTS socket, queued PCM. */
  const teardownTurn = () => {
    generation++;
    turnAbort?.abort(new DOMException("Voice turn ended", "AbortError"));
    turnAbort = null;
    if (ttsTimer) { clearTimeout(ttsTimer); ttsTimer = null; }
    const socket = tts;
    tts = null;
    closeUpstream(socket);
    pacer.clear();
    turnActive = false;
    audioActive = false;
  };
  const interrupt = (userSpoke: boolean) => {
    if (!turnActive) return;
    const id = turnId;
    // The user talked over Nally before any audio played: remember what they asked so that the
    // continuation is answered together with it instead of replacing it.
    if (userSpoke && !audioActive && pendingUtterance) carry = pendingUtterance;
    pendingUtterance = "";
    teardownTurn();
    send({ type: "interrupted", turnId: id });
    if (carry) armCarry();
  };
  const terminate = () => {
    if (closed) return;
    closed = true;
    clearInterval(idle);
    clearCarry();
    teardownTurn();
    pacer.dispose();
    closeUpstream(dg); cleanup();
    if (ws.readyState === WebSocket.OPEN) ws.close(1000, "session ended");
  };
  /** Session-level failure: tell the client and end the call. */
  const fail = (code: string, message: string, recoverable = false) => {
    try { send({ type: "error", code, message, recoverable, scope: "call" }); } catch { /* ignore */ }
    setTimeout(() => terminate(), 400);
  };
  const idle = setInterval(() => {
    const now = Date.now();
    if (now - lastActivity > IDLE_TIMEOUT_MS) fail("session_timeout", "Voice session timed out.", true);
    else if (now - startedAt > CALL_MAX_MS) fail("call_time_limit", "This call reached its time limit. Start a new call to keep talking.", true);
  }, 5_000);
  const beginAnswer = async (utterance: string) => {
    if (closed) return;
    if (turnActive) interrupt(true);
    const text = carry ? `${carry} ${utterance}` : utterance;
    clearCarry();
    pendingUtterance = text;
    const myGeneration = ++generation;
    turnId = randomBytes(12).toString("hex"); turnActive = true; audioActive = false; outputBytes = 0;
    const id = turnId;
    const controller = new AbortController();
    turnAbort = controller;
    const stale = () => closed || myGeneration !== generation || controller.signal.aborted;
    /** Turn-level failure: end this reply only. The call and the live transcription stay up. */
    const failTurn = (code: string, message: string) => {
      if (stale() || !turnActive) return;
      pendingUtterance = "";
      teardownTurn();
      send({ type: "error", code, message, recoverable: true, scope: "turn" });
      send({ type: "assistant_end", turnId: id });
    };
    const finishTurn = () => {
      if (stale() || !turnActive) return;
      turnActive = false; audioActive = false; pendingUtterance = "";
      if (ttsTimer) { clearTimeout(ttsTimer); ttsTimer = null; }
      const socket = tts;
      tts = null;
      closeUpstream(socket);
      if (turnAbort === controller) turnAbort = null;
      send({ type: "audio_end", turnId: id });
      send({ type: "assistant_end", turnId: id });
    };
    const turnStartedAt = Date.now();
    send({ type: "assistant_start", turnId: id });
    try {
      const conversationId = await getOrCreateConversation(session.telegramId, session.telegramChatId);
      const history = await loadConversationHistory(conversationId);
      const answer = await respond(history, text, session.telegramId, undefined, undefined, undefined, { channel: "voice", responseStyle: "spoken", conversationId, signal: controller.signal });
      if (stale()) return;
      if (!answer) { failTurn("approval_required", "This request needs approval in Telegram."); return; }
      await appendConversationExchange(conversationId, text, answer, "android");
      if (stale()) return;
      const agentMs = Date.now() - turnStartedAt;
      const spoken = toVoiceResponse(splitSpokenChannelReply(answer).spoken, { maxChars: config.VOICE_TTS_MAX_CHARS }).text;
      if (!spoken) {
        turnActive = false; pendingUtterance = "";
        send({ type: "assistant_end", turnId: id });
        return;
      }
      // runAgent returns a complete answer; text is sent once, while audio arrives as provider chunks.
      send({ type: "text_delta", turnId: id, text: spoken });
      const socket = providers.eleven(); tts = socket;
      const ttsStartedAt = Date.now();
      let audioChunks = 0, providerFinal = false, firstAudioMs = 0;
      if (ttsTimer) clearTimeout(ttsTimer);
      const timer = setTimeout(() => { if (tts === socket && !providerFinal) failTurn("tts_timeout", "Speech synthesis timed out."); }, config.VOICE_TTS_TIMEOUT_MS);
      ttsTimer = timer;
      const clearTimer = () => { clearTimeout(timer); if (ttsTimer === timer) ttsTimer = null; };
      /** Provider is done: let queued PCM reach the phone, then end the turn. */
      const complete = () => {
        if (providerFinal || stale() || !turnActive) return;
        providerFinal = true;
        clearTimer();
        if (!hasUsableTtsAudio(audioActive, outputBytes)) { failTurn("tts_empty_audio", "Speech synthesis completed without producing audio. Please try again."); return; }
        console.info("[voice] TTS completed", { agentMs, firstAudioMs, bytes: outputBytes, chunks: audioChunks, durationMs: Date.now() - ttsStartedAt });
        closeUpstream(socket); if (tts === socket) tts = null;
        pacer.whenDrained(() => finishTurn());
      };
      socket.on("open", () => {
        if (stale()) { closeUpstream(socket); return; }
        socket.send(JSON.stringify({ text: " ", voice_settings: { stability: config.VOICE_STABILITY, similarity_boost: config.VOICE_SIMILARITY_BOOST, style: config.VOICE_STYLE, speed: config.VOICE_SPEECH_SPEED }, generation_config: { chunk_length_schedule: [120, 160, 250, 290] } }));
        // Final text with flush, then end-of-stream. The provider generates the audio, emits isFinal and
        // closes. Waiting for isFinal after a flush alone is not guaranteed to ever complete.
        socket.send(JSON.stringify(buildElevenLabsTextInput(spoken)));
        socket.send(JSON.stringify(buildElevenLabsEndOfStream()));
      });
      socket.on("message", (raw, binary) => {
        if (binary || stale() || providerFinal) return;
        try {
          const msg = JSON.parse(raw.toString()) as { audio?: string; isFinal?: boolean; error?: string };
          if (msg.error) { clearTimer(); failTurn("tts_provider_error", "Speech synthesis failed."); return; }
          const chunk = decodeElevenLabsPcmChunk(msg.audio);
          if (chunk) {
            outputBytes += chunk.length; audioChunks++;
            if (outputBytes > MAX_OUTPUT_BYTES || outputBytes > config.VOICE_MAX_AUDIO_BYTES) { clearTimer(); failTurn("output_limit", "Voice response exceeded its audio limit."); return; }
            if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount >= STALLED_CLIENT_BYTES) { clearTimer(); failTurn("backpressure", "Voice client cannot receive audio quickly enough."); return; }
            if (!audioActive) {
              audioActive = true;
              firstAudioMs = Date.now() - turnStartedAt;
              send({ type: "audio_start", turnId: id, encoding: "pcm_s16le", sampleRate: 16000, channels: 1 });
            }
            pacer.push(chunk);
          }
          if (msg.isFinal) complete();
        } catch (error) {
          clearTimer();
          console.warn("[voice] Invalid TTS audio payload", error instanceof Error ? error.message : "unknown error");
          failTurn("tts_invalid_audio", "Speech synthesis returned invalid audio. Please try again.");
        }
      });
      socket.on("error", () => { clearTimer(); if (!providerFinal) failTurn("tts_provider_error", "Speech synthesis provider is unavailable."); });
      socket.on("close", () => {
        clearTimer();
        if (tts !== socket) return; // already finished, interrupted or replaced
        tts = null;
        if (stale() || providerFinal) return;
        // Provider hung up. If audio was produced, treat that as the end of the reply.
        if (audioActive && outputBytes > 0) complete();
        else failTurn("tts_disconnected", "Speech synthesis disconnected before producing audio.");
      });
    } catch (error) { if (!stale()) { console.error("Voice agent turn failed:", error); failTurn("agent_error", "I couldn't complete that voice turn."); } }
  };
  const flushTranscript = () => {
    const update = transcriptBuffer.flush();
    if (update) send({ type: "transcript", text: update.text.slice(0, MAX_TRANSCRIPT_CHARS), final: true });
    if (update?.utterance) void beginAnswer(update.utterance);
  };
  ws.on("message", (data, isBinary) => {
    lastActivity = Date.now(); if (closed) return;
    if (isBinary) {
      const bytes = data as Buffer;
      if (!started || inputStopped || !isMobileVoiceAudioFrame(bytes)) { fail("invalid_audio_frame", "Audio frames must be bounded even-length PCM after start."); return; }
      audioBytes += bytes.length; frames++;
      if (audioBytes > MAX_SESSION_AUDIO_BYTES || frames > MAX_SESSION_FRAMES) { fail("session_limit", "Voice input limit reached."); return; }
      if (!dg || dg.readyState !== WebSocket.OPEN) { fail("stt_unavailable", "Speech recognition is not ready.", true); return; }
      if (dg.bufferedAmount > 1_000_000) { fail("stt_backpressure", "Speech recognition is overloaded.", true); return; }
      dg.send(bytes); return;
    }
    if ((data as Buffer).byteLength > 2048) { fail("control_too_large", "Control message is too large."); return; }
    const parsed = parseMobileVoiceControl((data as Buffer).toString("utf8"));
    if (!parsed.ok) { fail(parsed.code, "Invalid voice control message."); return; }
    const control = parsed.value;
    if (control.type === "start") {
      if (started) { fail("already_started", "Session has already started."); return; }
      if (!config.DEEPGRAM_API_KEY?.trim()) {
        fail("stt_unconfigured", "Deepgram is not configured on the server (DEEPGRAM_API_KEY).", true);
        return;
      }
      if (!config.ELEVENLABS_API_KEY?.trim() || !config.ELEVENLABS_VOICE_ID?.trim()) {
        fail("tts_unconfigured", "ElevenLabs is not configured on the server (ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID).", true);
        return;
      }
      started = true;
      try {
        dg = providers.deepgram(control.language ?? config.DEEPGRAM_LANGUAGE);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown";
        console.error("[voice] Deepgram start failed:", detail);
        fail("stt_unavailable", `Speech recognition could not be started (${detail}).`, true);
        return;
      }
      const socket = dg, timer = setTimeout(() => { if (!started || socket.readyState !== WebSocket.OPEN) fail("stt_timeout", "Speech recognition setup timed out.", true); }, config.VOICE_STT_TIMEOUT_MS);
      socket.on("open", () => { clearTimeout(timer); if (!closed && ws.readyState === WebSocket.OPEN) send({ type: "ready", protocolVersion: 1, input: { encoding: "pcm_s16le", sampleRate: 16000, channels: 1 } }); });
      socket.on("message", (raw, binary) => {
        if (binary || closed) return;
        try {
          const msg = JSON.parse(raw.toString()) as {
            type?: string;
            channel?: { alternatives?: Array<{ transcript?: string }> };
            is_final?: boolean;
            speech_final?: boolean;
            start?: number;
            err_code?: string;
            err_msg?: string;
            description?: string;
            message?: string;
          };
          if (msg.type === "Error" || msg.err_code || msg.err_msg) {
            const detail = (msg.err_msg ?? msg.description ?? msg.message ?? msg.err_code ?? "provider error").slice(0, 180);
            fail("stt_provider_error", `Speech recognition provider reported an error (${detail}).`, true);
            return;
          }
          // Only sent when vad_events=true; interrupting on bare voice activity is echo-prone, so require audio to be playing.
          if (msg.type === "SpeechStarted") { if (audioActive) interrupt(true); return; }
          if (msg.type === "UtteranceEnd") { flushTranscript(); return; }
          const text = msg.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
          const update = transcriptBuffer.update({ text, isFinal: msg.is_final, speechFinal: msg.speech_final, start: msg.start });
          if (!update) return;
          send({ type: "transcript", text: update.text.slice(0, MAX_TRANSCRIPT_CHARS), final: update.final });
          if (update.text.length > MAX_TRANSCRIPT_CHARS) { fail("transcript_limit", "Voice transcript is too long."); return; }
          if (!update.utterance) {
            // Still mid-utterance. Barge in only on speech-like interim text, and keep waiting while the user talks.
            if (!msg.is_final && !msg.speech_final && text && turnActive && isBargeInSpeech(text, BARGE_IN_MIN_CHARS)) interrupt(true);
            else if (carry) armCarry();
          }
          if (update.utterance) void beginAnswer(update.utterance);
        } catch { /* provider keepalive or non-JSON frame */ }
      });
      socket.on("error", (err) => {
        clearTimeout(timer);
        if (!closed) {
          const detail = err instanceof Error ? err.message : "provider error";
          fail("stt_provider_error", `Speech recognition provider is unavailable (${detail}).`, true);
        }
      });
      socket.on("close", (code, reason) => {
        clearTimeout(timer);
        if (!closed) {
          const why = reason?.toString()?.trim() || `code ${code}`;
          fail("stt_disconnected", `Speech recognition disconnected (${why}). Check DEEPGRAM_API_KEY.`, true);
        }
      });
    } else if (!started) fail("start_required", "Send start before other controls.");
    else if (control.type === "ping") send({ type: "pong"});
    else if (control.type === "stop_input") { inputStopped = true; if (dg?.readyState === WebSocket.OPEN) dg.send(JSON.stringify({ type: "Finalize" })); }
    else if (control.type === "interrupt") interrupt(false);
    else if (control.type === "close") terminate();
  });
  ws.on("close", terminate); ws.on("error", terminate);
}
