import type { IncomingMessage, ServerResponse } from "node:http";
import {
  clearVoiceSessionCookie,
  issueVoiceSessionCookie,
  verifyTelegramLogin,
  verifyVoiceSessionCookie,
  type TelegramLoginIdentity
} from "./telegram-auth.js";

export interface VoiceAuthRouteOptions {
  readonly botToken: string;
  readonly botUsername: string;
  readonly origin: string;
  readonly persistIdentity: (identity: TelegramLoginIdentity) => Promise<void>;
  readonly sessionTtlSeconds?: number;
}

const MAX_BODY_BYTES = 16 * 1024;
const TELEGRAM_FIELDS = new Set(["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"]);

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function isSameOrigin(request: IncomingMessage, expectedOrigin: string): boolean {
  return request.headers.origin === expectedOrigin;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new Error("Unsupported content type");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new RangeError("Request body too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function telegramFields(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const entries = Object.entries(record);
  if (entries.length < 3 || entries.length > TELEGRAM_FIELDS.size) return null;
  const result: Record<string, string> = {};
  for (const [key, field] of entries) {
    if (!TELEGRAM_FIELDS.has(key)) return null;
    if ((key === "id" || key === "auth_date") && typeof field === "number" && Number.isSafeInteger(field)) {
      result[key] = String(field);
      continue;
    }
    if (typeof field !== "string" || field.length > 4096) return null;
    result[key] = field;
  }
  return result;
}

/** Handles same-origin Telegram login, session inspection and logout endpoints. */
export function createVoiceAuthHandler(options: VoiceAuthRouteOptions) {
  const expectedOrigin = new URL(options.origin).origin;

  return async function handleVoiceAuth(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const path = new URL(request.url ?? "/", expectedOrigin).pathname;

    if (request.method === "GET" && path === "/auth/telegram/config") {
      sendJson(response, 200, { botUsername: options.botUsername });
      return true;
    }

    if (request.method === "POST" && path === "/auth/telegram") {
      if (!isSameOrigin(request, expectedOrigin)) {
        sendJson(response, 403, { error: "Forbidden" });
        return true;
      }
      let body: unknown;
      try {
        body = await readJson(request);
      } catch (error) {
        sendJson(response, error instanceof RangeError ? 413 : 400, { error: "Invalid login request" });
        return true;
      }
      const fields = telegramFields(body);
      if (!fields) {
        sendJson(response, 400, { error: "Invalid login request" });
        return true;
      }
      const identity = verifyTelegramLogin(fields, options.botToken);
      if (!identity) {
        sendJson(response, 401, { error: "Telegram authentication failed" });
        return true;
      }
      try {
        await options.persistIdentity(identity);
        const cookie = issueVoiceSessionCookie(identity, {
          botToken: options.botToken,
          ...(options.sessionTtlSeconds ? { sessionTtlSeconds: options.sessionTtlSeconds } : {})
        });
        response.writeHead(204, {
          "set-cookie": cookie.setCookie,
          "cache-control": "no-store"
        });
        response.end();
      } catch {
        sendJson(response, 500, { error: "Login could not be completed" });
      }
      return true;
    }

    if (request.method === "GET" && path === "/auth/session") {
      const identity = verifyVoiceSessionCookie(request.headers.cookie, { botToken: options.botToken });
      if (!identity) {
        sendJson(response, 401, { authenticated: false });
        return true;
      }
      sendJson(response, 200, { authenticated: true, userId: identity.userId });
      return true;
    }

    if (request.method === "POST" && path === "/auth/logout") {
      if (!isSameOrigin(request, expectedOrigin)) {
        sendJson(response, 403, { error: "Forbidden" });
        return true;
      }
      response.writeHead(204, {
        "set-cookie": clearVoiceSessionCookie(),
        "cache-control": "no-store"
      });
      response.end();
      return true;
    }

    return false;
  };
}
