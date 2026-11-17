import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.js";
import { getOrCreateConversation, loadConversationMessages } from "../db/conversationStore.js";
import {
  authenticateMobileSession,
  consumeTelegramLoginChallenge,
  createMobileSessionForTelegramUser,
  createTelegramLoginChallenge,
  pairMobileSession,
  revokeMobileSession,
  type MobileSession
} from "../db/mobileStore.js";
import { TelegramLoginError, verifyTelegramLoginIdToken } from "./telegramLogin.js";
import { splitAnswerAndSources } from "../agent/sourceAttribution.js";
import { mintVoiceTicket } from "./voiceSession.js";

const MAX_REQUEST_BYTES = 8_192;
const CLIENT_MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let pairingWindowStart = Date.now();
let pairingAttempts = 0;

type SubmitResult = { state: "accepted" | "in_progress" | "complete" | "awaiting_approval" | "failed" };

export type MobileApiDependencies = {
  authenticateSession?: (token: string) => Promise<MobileSession | null>;
  pairSession?: typeof pairMobileSession;
  createLoginChallenge?: typeof createTelegramLoginChallenge;
  verifyLoginIdToken?: typeof verifyTelegramLoginIdToken;
  consumeLoginChallenge?: typeof consumeTelegramLoginChallenge;
  createTelegramSession?: typeof createMobileSessionForTelegramUser;
  submitMessage: (session: MobileSession, input: { clientMessageId: string; text: string }) => Promise<SubmitResult>;
  getActivity: (telegramId: string) => unknown | null;
  createVoiceTicket?: (session: MobileSession) => Promise<{ ticket: string; expiresAt: Date }>;
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, private",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("request_too_large");
    chunks.push(buffer);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function getBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = /^Bearer ([A-Za-z0-9_-]{40,160})$/.exec(header);
  return match?.[1] ?? null;
}

export async function handleMobileApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: MobileApiDependencies
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;
  if (!pathname.startsWith("/api/mobile/")) return;

  try {
    if (pathname === "/api/mobile/login/challenge" && req.method === "POST") {
      const challenge = await (deps.createLoginChallenge ?? createTelegramLoginChallenge)();
      if (!challenge) {
        sendJson(res, 503, { error: "Telegram Login is not configured on the server yet." });
        return;
      }
      sendJson(res, 200, {
        nonce: challenge.nonce,
        clientId: challenge.clientId,
        redirectUri: challenge.redirectUri,
        scopes: challenge.scopes,
        expiresAt: challenge.expiresAt.toISOString()
      });
      return;
    }

    if (pathname === "/api/mobile/telegram-login" && req.method === "POST") {
      const body = await readJson(req);
      const idToken = typeof body?.idToken === "string" ? body.idToken : "";
      const nonce = typeof body?.nonce === "string" ? body.nonce : "";
      if (!idToken || idToken.length > 16_384 || nonce.length < 32 || nonce.length > 128) {
        sendJson(res, 400, { error: "Telegram sign-in response is incomplete. Please try again." });
        return;
      }
      const identity = await (deps.verifyLoginIdToken ?? verifyTelegramLoginIdToken)(idToken, nonce);
      const consumed = await (deps.consumeLoginChallenge ?? consumeTelegramLoginChallenge)(nonce);
      if (!consumed) {
        sendJson(res, 401, { error: "This Telegram sign-in has expired. Please try again." });
        return;
      }
      const session = await (deps.createTelegramSession ?? createMobileSessionForTelegramUser)(identity.telegramId);
      if (!session) {
        sendJson(res, 409, { error: "Start a private chat with NallyHermes in Telegram first, then sign in again." });
        return;
      }
      sendJson(res, 200, { accessToken: session.token, expiresAt: session.expiresAt.toISOString() });
      return;
    }

    if (pathname === "/api/mobile/pair" && req.method === "POST") {
      const now = Date.now();
      if (now - pairingWindowStart >= 60_000) {
        pairingWindowStart = now;
        pairingAttempts = 0;
      }
      pairingAttempts++;
      if (pairingAttempts > 60) {
        sendJson(res, 429, { error: "Too many pairing attempts. Wait a minute and try again." });
        return;
      }
      const body = await readJson(req);
      if (!body || typeof body.code !== "string" || !/^\d{10}$/.test(body.code.trim())) {
        sendJson(res, 400, { error: "Enter the 10-digit code from your private Telegram chat." });
        return;
      }
      const paired = await (deps.pairSession ?? pairMobileSession)(body.code);
      if (!paired) {
        sendJson(res, 401, { error: "That pairing code is invalid, expired, or already used." });
        return;
      }
      sendJson(res, 200, { accessToken: paired.token, expiresAt: paired.expiresAt.toISOString() });
      return;
    }

    const token = getBearerToken(req);
    const session = token ? await (deps.authenticateSession ?? authenticateMobileSession)(token) : null;
    if (!session) {
      sendJson(res, 401, { error: "Pair the app with your private Telegram chat to continue." });
      return;
    }

    if (pathname === "/api/mobile/me" && req.method === "GET") {
      sendJson(res, 200, { linked: true, expiresAt: session.expiresAt.toISOString() });
      return;
    }

    if (pathname === "/api/mobile/voice-health" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        voiceEnabled: config.VOICE_ENABLED,
        sttConfigured: Boolean(config.DEEPGRAM_API_KEY?.trim()),
        ttsConfigured: Boolean(config.ELEVENLABS_API_KEY?.trim() && config.ELEVENLABS_VOICE_ID?.trim()),
        websocketPath: "/api/mobile/voice",
        protocolVersion: 1
      });
      return;
    }

    if (pathname === "/api/mobile/voice-ticket" && req.method === "POST") {
      const ticket = await (deps.createVoiceTicket ?? mintVoiceTicket)(session);
      sendJson(res, 201, {
        ticket: ticket.ticket,
        expiresAt: ticket.expiresAt.toISOString(),
        websocketPath: "/api/mobile/voice",
        protocolVersion: 1,
        input: { encoding: "pcm_s16le", sampleRate: 16000, channels: 1 }
      });
      return;
    }

    if (pathname === "/api/mobile/messages" && req.method === "GET") {
      const rawCursor = url.searchParams.get("afterSequence") ?? "0";
      const afterSequence = Number(rawCursor);
      if (!/^\d+$/.test(rawCursor) || !Number.isSafeInteger(afterSequence) || afterSequence < 0) {
        sendJson(res, 400, { error: "Invalid message cursor." });
        return;
      }
      const conversationId = await getOrCreateConversation(session.telegramId, session.telegramChatId);
      const messages = await loadConversationMessages(conversationId, afterSequence, 200);
      const nextSequence = messages.length ? messages[messages.length - 1]!.sequence : afterSequence;
      sendJson(res, 200, {
        messages: messages.map((message) => {
          const meta = (message.metadata && typeof message.metadata === "object")
            ? message.metadata as Record<string, unknown>
            : {};
          const parsed = splitAnswerAndSources(message.content);
          const sources = Array.isArray(meta.sources) && meta.sources.length
            ? meta.sources
            : parsed.sources.map((s) => ({
                kind: s.kind,
                title: s.title,
                url: s.url ?? null,
                course: s.course ?? null,
                documentId: s.documentId ?? null
              }));
          const thinking = meta.thinking && typeof meta.thinking === "object" ? meta.thinking : undefined;
          return {
            id: message.id,
            sequence: message.sequence,
            role: message.role,
            text: parsed.body,
            source: message.sourceChannel,
            status: message.status,
            createdAt: message.createdAt.toISOString(),
            sources: sources.length ? sources : undefined,
            thinking
          };
        }),
        nextSequence,
        activity: deps.getActivity(session.telegramId)
      });
      return;
    }

    if (pathname === "/api/mobile/messages" && req.method === "POST") {
      const body = await readJson(req);
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      const clientMessageId = typeof body?.clientMessageId === "string" ? body.clientMessageId.trim() : "";
      if (!text || text.length > 3_500) {
        sendJson(res, 400, { error: "Message text must be between 1 and 3,500 characters." });
        return;
      }
      if (!CLIENT_MESSAGE_ID.test(clientMessageId)) {
        sendJson(res, 400, { error: "A valid clientMessageId is required." });
        return;
      }
      const result = await deps.submitMessage(session, { clientMessageId, text });
      sendJson(res, result.state === "complete" ? 200 : 202, {
        clientMessageId,
        state: result.state
      });
      return;
    }

    if (pathname === "/api/mobile/session" && req.method === "DELETE") {
      await revokeMobileSession(session.sessionId);
      sendJson(res, 200, { revoked: true });
      return;
    }

    sendJson(res, 404, { error: "Mobile API route not found." });
  } catch (error) {
    if (error instanceof Error && error.message === "voice_disabled") {
      sendJson(res, 503, { error: "Realtime voice is not enabled on this server." });
      return;
    }
    if (error instanceof TelegramLoginError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }
    if (error instanceof Error && error.message === "request_too_large") {
      sendJson(res, 413, { error: "Request body is too large." });
      return;
    }
    console.error("Mobile API request failed:", error);
    if (!res.headersSent) sendJson(res, 500, { error: "The request could not be completed. Try again shortly." });
  }
}
