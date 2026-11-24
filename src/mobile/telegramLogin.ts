import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../config.js";

const TELEGRAM_ISSUER = "https://oauth.telegram.org";
const TELEGRAM_JWKS = createRemoteJWKSet(new URL(`${TELEGRAM_ISSUER}/.well-known/jwks.json`));

export class TelegramLoginError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "TelegramLoginError";
  }
}

export async function verifyTelegramLoginIdToken(
  idToken: string,
  expectedNonce: string
): Promise<{ telegramId: string }> {
  const clientId = config.TELEGRAM_LOGIN_CLIENT_ID;
  if (!clientId) throw new TelegramLoginError("Telegram Login is not configured on the server yet.", 503);
  if (idToken.length < 100 || idToken.length > 16_384) {
    throw new TelegramLoginError("Telegram sign-in could not be verified. Please restart sign-in.", 401);
  }

  let payload;
  try {
    const verified = await jwtVerify(idToken, TELEGRAM_JWKS, {
      issuer: TELEGRAM_ISSUER,
      audience: clientId,
      clockTolerance: 5
    });
    payload = verified.payload;
  } catch {
    throw new TelegramLoginError("Telegram sign-in could not be verified. Please restart sign-in.", 401);
  }

  if (typeof payload.nonce !== "string" || payload.nonce !== expectedNonce) {
    throw new TelegramLoginError("This Telegram sign-in has expired. Please try again.", 401);
  }

  const rawTelegramId = payload.id ?? payload.sub;
  const telegramId = typeof rawTelegramId === "number" ? String(rawTelegramId) : rawTelegramId;
  if (typeof telegramId !== "string" || !/^\d{1,20}$/.test(telegramId)) {
    throw new TelegramLoginError("Telegram did not return a valid account ID. Please try again.", 401);
  }

  return { telegramId };
}


export type TelegramLoginWidgetData = {
  id: number | string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
};

/** Verify Telegram's signed Login Widget callback using the bot token. */
export function verifyTelegramLoginWidget(data: unknown): { telegramId: string } {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TelegramLoginError("Telegram sign-in response is incomplete.", 400);
  }
  const value = data as Record<string, unknown>;
  const allowed = new Set(["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new TelegramLoginError("Telegram sign-in response contains unexpected fields.", 401);
  }
  const hash = typeof value.hash === "string" ? value.hash : "";
  const id = typeof value.id === "number" || typeof value.id === "string" ? String(value.id) : "";
  const authDate = typeof value.auth_date === "number" ? value.auth_date
    : typeof value.auth_date === "string" && /^\d+$/.test(value.auth_date) ? Number(value.auth_date) : NaN;
  if (!/^\d{1,20}$/.test(id) || typeof value.first_name !== "string" ||
      !Number.isSafeInteger(authDate) || !/^[a-f0-9]{64}$/i.test(hash)) {
    throw new TelegramLoginError("Telegram sign-in response is invalid.", 401);
  }
  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 30 || now - authDate > 600) {
    throw new TelegramLoginError("This Telegram sign-in has expired. Please try again.", 401);
  }
  const fields = Object.entries(value)
    .filter(([key]) => key !== "hash")
    .map(([key, field]) => {
      if (typeof field !== "string" && typeof field !== "number") {
        throw new TelegramLoginError("Telegram sign-in response is invalid.", 401);
      }
      return [key, String(field)] as const;
    })
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const dataCheckString = fields.map(([key, field]) => `${key}=${field}`).join("\n");
  const secretKey = createHash("sha256").update(config.TELEGRAM_BOT_TOKEN).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const supplied = Buffer.from(hash, "hex");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new TelegramLoginError("Telegram sign-in could not be verified. Please restart sign-in.", 401);
  }
  return { telegramId: id };
}
