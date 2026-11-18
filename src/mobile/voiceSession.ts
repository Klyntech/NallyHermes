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

const TICKET_TTL_MS = 60_000, MAX_SESSION_MS = 10 * 60_000, MAX_SESSION_AUDIO_BYTES = 12_000_000;
const MAX_SESSION_FRAMES = 12_000, IDLE_TIMEOUT_MS = 30_000, MAX_CONNECTIONS = 100;
const MAX_TRANSCRIPT_CHARS = 3_500, MAX_OUTPUT_BYTES = 8_000_000;
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
      wss.handleUpgrade(req, socket, head, (ws) => {
        activeBySession.add(session.sessionId);
        handleSocket(ws, session, () => activeBySession.delete(session.sessionId), providers);
      });
    }).catch((error) => {
      console.error("Voice ticket validation failed:", error);
      rejectUpgrade(socket, 500, "Voice ticket validation failed", "ticket_error");
    });
  });
}

function handleSocket(ws: WebSocket, session: MobileSession, cleanup: () => void, providers: Providers): void {
  const startedAt = Date.now(); let started = false, inputStopped = false, closed = false, audioBytes = 0, frames = 0, outputBytes = 0, lastActivity = Date.now();
  let dg: WebSocket | null = null, tts: WebSocket | null = null, turnId = "", turnInterrupted = false, generation = 0, currentTranscript = "", finalTranscript = "";
  let turnAbort: AbortController | null = null, ttsTimer: ReturnType<typeof setTimeout> | null = null;
  const send = (obj: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); };
  // Confirm the transport is up before the client waits forever for Deepgram "ready".
  send({
    type: "hello",
    protocolVersion: 1,
    voiceEnabled: true,
    sttConfigured: Boolean(config.DEEPGRAM_API_KEY?.trim()),
    ttsConfigured: Boolean(config.ELEVENLABS_API_KEY?.trim() && config.ELEVENLABS_VOICE_ID?.trim())
  });
  const closeUpstream = (s: WebSocket | null) => { if (s && s.readyState < WebSocket.CLOSING) s.close(); };
  const interrupt = () => {
    if (!turnId || turnInterrupted) return;
    turnInterrupted = true;
    generation++;
    turnAbort?.abort(new DOMException("Voice turn interrupted", "AbortError"));
    turnAbort = null;
    if (ttsTimer) clearTimeout(ttsTimer);
    ttsTimer = null;
    closeUpstream(tts);
    tts = null;
    send({ type: "interrupted", turnId });
  };
  const terminate = () => {
    if (closed) return;
    closed = true;
    clearInterval(idle);
    if (ttsTimer) clearTimeout(ttsTimer);
    ttsTimer = null;
    turnAbort?.abort(new DOMException("Voice session closed", "AbortError"));
    turnAbort = null;
    closeUpstream(dg); closeUpstream(tts); cleanup();
    if (ws.readyState === WebSocket.OPEN) ws.close(1000, "session ended");
  };
  const fail = (code: string, message: string, recoverable = false) => {
    try { send({ type: "error", code, message, recoverable }); } catch { /* ignore */ }
    setTimeout(() => terminate(), 400);
  };
  const idle = setInterval(() => { if (Date.now() - lastActivity > IDLE_TIMEOUT_MS || Date.now() - startedAt > MAX_SESSION_MS) fail("session_timeout", "Voice session timed out.", true); }, 5_000);
  const beginAnswer = async (text: string) => {
    if (turnId && !turnInterrupted) interrupt();
    const myGeneration = ++generation; turnId = randomBytes(12).toString("hex"); turnInterrupted = false; outputBytes = 0;
    const controller = new AbortController();
    turnAbort = controller;
    const id = turnId; send({ type: "assistant_start", turnId: id });
    try {
      const conversationId = await getOrCreateConversation(session.telegramId, session.telegramChatId);
      const history = await loadConversationHistory(conversationId);
      const answer = await respond(history, text, session.telegramId, undefined, undefined, undefined, { channel: "voice", responseStyle: "spoken", conversationId, signal: controller.signal });
      if (closed || myGeneration !== generation || turnInterrupted || controller.signal.aborted) return;
      if (!answer) { send({ type: "error", code: "approval_required", message: "This request needs approval in Telegram.", recoverable: true }); return; }
      if (closed || myGeneration !== generation || turnInterrupted || controller.signal.aborted) return;
      await appendConversationExchange(conversationId, text, answer, "android");
      if (closed || myGeneration !== generation || turnInterrupted || controller.signal.aborted) return;
      const spoken = toVoiceResponse(splitSpokenChannelReply(answer).spoken, { maxChars: config.VOICE_TTS_MAX_CHARS }).text;
      if (!spoken) { send({ type: "assistant_end", turnId: id }); return; }
      // runAgent returns a complete answer; text is sent once, while audio arrives as provider chunks.
      send({ type: "text_delta", turnId: id, text: spoken });
      const socket = providers.eleven(); tts = socket;
      if (ttsTimer) clearTimeout(ttsTimer);
      const timer = setTimeout(() => { if (tts === socket) fail("tts_timeout", "Speech synthesis timed out.", true); }, config.VOICE_TTS_TIMEOUT_MS);
      ttsTimer = timer;
      socket.on("open", () => {
        if (myGeneration !== generation || turnInterrupted) { closeUpstream(socket); return; }
        send({ type: "audio_start", turnId: id, encoding: "pcm_s16le", sampleRate: 16000, channels: 1 });
        socket.send(JSON.stringify({ text: " ", voice_settings: { stability: config.VOICE_STABILITY, similarity_boost: config.VOICE_SIMILARITY_BOOST, style: config.VOICE_STYLE, speed: config.VOICE_SPEECH_SPEED }, generation_config: { chunk_length_schedule: [120, 160, 250, 290] } }));
        socket.send(JSON.stringify({ text: spoken, try_trigger_generation: true })); socket.send(JSON.stringify({ text: "", flush: true }));
      });
      socket.on("message", (raw, binary) => {
        if (binary || myGeneration !== generation || turnInterrupted || closed) return;
        try {
          const msg = JSON.parse(raw.toString()) as { audio?: string; isFinal?: boolean; error?: string };
          if (msg.error) { clearTimeout(timer); if (ttsTimer === timer) ttsTimer = null; fail("tts_provider_error", "Speech synthesis failed.", true); return; }
          if (msg.audio) { const chunk = Buffer.from(msg.audio, "base64"); outputBytes += chunk.length; if (outputBytes > MAX_OUTPUT_BYTES || outputBytes > config.VOICE_MAX_AUDIO_BYTES) { clearTimeout(timer); fail("output_limit", "Voice response exceeded its audio limit.", true); return; } if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 512_000) ws.send(chunk, { binary: true }); else if (ws.readyState === WebSocket.OPEN) { clearTimeout(timer); fail("backpressure", "Voice client cannot receive audio quickly enough.", true); } }
          if (msg.isFinal) { clearTimeout(timer); if (ttsTimer === timer) ttsTimer = null; send({ type: "audio_end", turnId: id }); send({ type: "assistant_end", turnId: id }); closeUpstream(socket); if (tts === socket) tts = null; if (turnAbort === controller) turnAbort = null; }
        } catch { /* ignore malformed upstream notification */ }
      });
      socket.on("error", () => { clearTimeout(timer); if (ttsTimer === timer) ttsTimer = null; if (myGeneration === generation && !turnInterrupted && !closed) fail("tts_provider_error", "Speech synthesis provider is unavailable.", true); });
      socket.on("close", () => {
        clearTimeout(timer);
        if (ttsTimer === timer) ttsTimer = null;
        const wasActive = tts === socket;
        if (wasActive) tts = null;
        if (wasActive && myGeneration === generation && !turnInterrupted && !closed) fail("tts_disconnected", "Speech synthesis disconnected before completing the reply.", true);
      });
    } catch (error) { if (myGeneration === generation && !turnInterrupted && !closed && !controller.signal.aborted) { console.error("Voice agent turn failed:", error); fail("agent_error", "I couldn't complete that voice turn.", true); } }
  };
  ws.on("message", (data, isBinary) => {
    lastActivity = Date.now(); if (closed) return;
    if (isBinary) {
      const bytes = data as Buffer;
      if (!started || inputStopped || !isMobileVoiceAudioFrame(bytes)) { fail("invalid_audio_frame", "Audio frames must be bounded even-length PCM after start."); return; }
      audioBytes += bytes.length; frames++;
      if (audioBytes > Math.min(MAX_SESSION_AUDIO_BYTES, config.VOICE_MAX_AUDIO_BYTES) || frames > MAX_SESSION_FRAMES || audioBytes / 32_000 > config.VOICE_MAX_DURATION_SEC) { fail("session_limit", "Voice input limit reached."); return; }
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
          const msg = JSON.parse(raw.toString()) as { type?: string; channel?: { alternatives?: Array<{ transcript?: string }> }; is_final?: boolean; speech_final?: boolean };
          if (msg.type === "SpeechStarted") { interrupt(); return; }
          const text = msg.channel?.alternatives?.[0]?.transcript?.trim(); if (!text) return;
          currentTranscript = text; send({ type: "transcript", text: text.slice(0, MAX_TRANSCRIPT_CHARS), final: Boolean(msg.is_final || msg.speech_final) });
          if (!msg.is_final && !msg.speech_final) { if (turnId && !turnInterrupted) interrupt(); return; }
          finalTranscript = `${finalTranscript} ${text}`.trim();
          if (finalTranscript.length > MAX_TRANSCRIPT_CHARS) { fail("transcript_limit", "Voice transcript is too long."); return; }
          if (msg.speech_final) { const utterance = finalTranscript; finalTranscript = ""; currentTranscript = ""; void beginAnswer(utterance); }
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
    else if (control.type === "interrupt") interrupt();
    else if (control.type === "close") terminate();
  });
  ws.on("close", terminate); ws.on("error", terminate);
}
