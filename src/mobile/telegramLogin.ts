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
