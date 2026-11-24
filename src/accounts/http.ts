import type { IncomingMessage, ServerResponse } from "node:http";
import {
  authenticateNallyAccountSession, createNallyAccountSession, getNallyAccount,
  getOrCreateTelegramNallyAccount, linkTelegramIdentity, loginNallyAccount,
  NallyAccountError, registerNallyAccount, revokeNallyAccountSession
} from "../db/nallyAccounts.js";
import { createTelegramLoginChallenge, consumeTelegramLoginChallenge } from "../db/mobileStore.js";
import { TelegramLoginError, verifyTelegramLoginIdToken } from "../mobile/telegramLogin.js";

const MAX_BODY_BYTES = 8_192;

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
    if (size > MAX_BODY_BYTES) throw new Error("request_too_large");
    chunks.push(buffer);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function handleNallyAccountRequest(
  req: IncomingMessage, res: ServerResponse, pathname: string
): Promise<void> {
  try {
    if (pathname === "/api/accounts/register" && req.method === "POST") {
      const body = await readJson(req);
      if (typeof body?.email !== "string" || typeof body.password !== "string") {
        sendJson(res, 400, { error: "Email and password are required." }); return;
      }
      const session = await registerNallyAccount({
        email: body.email, password: body.password,
        username: typeof body.username === "string" ? body.username : undefined,
        displayName: typeof body.displayName === "string" ? body.displayName : undefined
      });
      sendJson(res, 201, { accessToken: session.token, expiresAt: session.expiresAt.toISOString(), accountId: session.accountId });
      return;
    }

    if (pathname === "/api/accounts/login" && req.method === "POST") {
      const body = await readJson(req);
      if (typeof body?.email !== "string" || typeof body.password !== "string") {
        sendJson(res, 400, { error: "Email and password are required." }); return;
      }
      const session = await loginNallyAccount(body.email, body.password);
      sendJson(res, 200, { accessToken: session.token, expiresAt: session.expiresAt.toISOString(), accountId: session.accountId });
      return;
    }

    if (pathname === "/api/accounts/telegram/challenge" && req.method === "POST") {
      const challenge = await createTelegramLoginChallenge();
      if (!challenge) {
        sendJson(res, 503, { error: "Telegram Login is not configured on this server." }); return;
      }
      sendJson(res, 200, {
        nonce: challenge.nonce, clientId: challenge.clientId, redirectUri: challenge.redirectUri,
        scopes: challenge.scopes, expiresAt: challenge.expiresAt.toISOString()
      });
      return;
    }

    if (pathname === "/api/accounts/telegram/login" && req.method === "POST") {
      const body = await readJson(req);
      const idToken = typeof body?.idToken === "string" ? body.idToken : "";
      const nonce = typeof body?.nonce === "string" ? body.nonce : "";
      if (!idToken || idToken.length > 16_384 || nonce.length < 32 || nonce.length > 128) {
        sendJson(res, 400, { error: "Telegram sign-in response is incomplete." }); return;
      }
      const identity = await verifyTelegramLoginIdToken(idToken, nonce);
      if (!await consumeTelegramLoginChallenge(nonce)) {
        sendJson(res, 401, { error: "This Telegram sign-in has expired. Please try again." }); return;
      }
      const accountId = await getOrCreateTelegramNallyAccount(identity.telegramId);
      const session = await createNallyAccountSession(accountId);
      sendJson(res, 200, { accessToken: session.token, expiresAt: session.expiresAt.toISOString(), accountId });
      return;
    }

    const authorization = req.headers.authorization;
    const token = typeof authorization === "string"
      ? /^Bearer ([A-Za-z0-9_-]{40,160})$/.exec(authorization)?.[1] : undefined;
    const session = token ? await authenticateNallyAccountSession(token) : null;
    if (!session) {
      sendJson(res, 401, { error: "A valid Nally Account session is required." }); return;
    }

    if (pathname === "/api/accounts/me" && req.method === "GET") {
      const account = await getNallyAccount(session.accountId);
      if (!account) { sendJson(res, 404, { error: "Nally Account not found." }); return; }
      sendJson(res, 200, account);
      return;
    }

    if (pathname === "/api/accounts/telegram/link" && req.method === "POST") {
      const body = await readJson(req);
      const idToken = typeof body?.idToken === "string" ? body.idToken : "";
      const nonce = typeof body?.nonce === "string" ? body.nonce : "";
      if (!idToken || idToken.length > 16_384 || nonce.length < 32 || nonce.length > 128) {
        sendJson(res, 400, { error: "Telegram sign-in response is incomplete." }); return;
      }
      const identity = await verifyTelegramLoginIdToken(idToken, nonce);
      if (!await consumeTelegramLoginChallenge(nonce)) {
        sendJson(res, 401, { error: "This Telegram sign-in has expired. Please try again." }); return;
      }
      await linkTelegramIdentity(session.accountId, identity.telegramId);
      sendJson(res, 200, { linked: true, provider: "telegram" });
      return;
    }

    if (pathname === "/api/accounts/session" && req.method === "DELETE") {
      await revokeNallyAccountSession(session.sessionId);
      sendJson(res, 200, { revoked: true }); return;
    }

    sendJson(res, 404, { error: "Nally Account route not found." });
  } catch (error) {
    if (error instanceof NallyAccountError) {
      const status = error.code === "invalid_input" ? 400
        : error.code === "conflict" ? 409
        : error.code === "invalid_credentials" ? 401 : 403;
      sendJson(res, status, { error: error.message }); return;
    }
    if (error instanceof TelegramLoginError) {
      sendJson(res, error.status, { error: error.message }); return;
    }
    if (error instanceof Error && error.message === "request_too_large") {
      sendJson(res, 413, { error: "Request body is too large." }); return;
    }
    console.error("Nally Account request failed:", error);
    if (!res.headersSent) sendJson(res, 500, { error: "The account request could not be completed." });
  }
}
