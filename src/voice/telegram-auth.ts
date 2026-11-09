import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramLoginIdentity {
  readonly userId: string;
  readonly username?: string;
  readonly firstName?: string;
}

export interface VoiceCookieOptions {
  readonly botToken: string;
  readonly nowSeconds?: number;
  readonly maxLoginAgeSeconds?: number;
  readonly sessionTtlSeconds?: number;
}

const DEFAULT_LOGIN_AGE_SECONDS = 300;
const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60;
const COOKIE_NAME = "__Host-nally_voice_session";

function entriesOf(data: URLSearchParams | Readonly<Record<string, string>>): [string, string][] {
  return data instanceof URLSearchParams
    ? Array.from(data.entries())
    : Object.entries(data);
}

/** Verifies Telegram Login Widget data using Telegram's documented HMAC-SHA-256 scheme. */
export function verifyTelegramLogin(
  data: URLSearchParams | Readonly<Record<string, string>>,
  botToken: string,
  options: Pick<VoiceCookieOptions, "nowSeconds" | "maxLoginAgeSeconds"> = {}
): TelegramLoginIdentity | null {
  if (!botToken) return null;
  const entries = entriesOf(data);
  const values = new Map(entries);
  const suppliedHash = values.get("hash");
  const authDate = Number(values.get("auth_date"));
  const userId = values.get("id");
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAge = options.maxLoginAgeSeconds ?? DEFAULT_LOGIN_AGE_SECONDS;

  if (!suppliedHash || !/^[a-f0-9]{64}$/i.test(suppliedHash)) return null;
  if (!userId || !/^\d+$/.test(userId)) return null;
  if (!Number.isSafeInteger(authDate) || authDate > now + 30 || now - authDate > maxAge) return null;

  const checkString = entries
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(checkString).digest();
  const actualHash = Buffer.from(suppliedHash, "hex");
  if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) return null;

  const username = values.get("username");
  const firstName = values.get("first_name");
  return {
    userId,
    ...(username ? { username } : {}),
    ...(firstName ? { firstName } : {})
  };
}

function sessionKey(botToken: string): Buffer {
  return createHmac("sha256", botToken).update("nally-voice-session-cookie-v1").digest();
}

export function issueVoiceSessionCookie(
  identity: TelegramLoginIdentity,
  options: VoiceCookieOptions
): { readonly name: string; readonly value: string; readonly expiresAt: number; readonly setCookie: string } {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttl = options.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > 7 * 24 * 60 * 60) {
    throw new Error("Voice session TTL must be between 60 seconds and 7 days");
  }
  const payload = Buffer.from(JSON.stringify({ sub: identity.userId, iat: now, exp: now + ttl })).toString("base64url");
  const signature = createHmac("sha256", sessionKey(options.botToken)).update(payload).digest("base64url");
  const value = `${payload}.${signature}`;
  return {
    name: COOKIE_NAME,
    value,
    expiresAt: now + ttl,
    setCookie: `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ttl}`
  };
}

export function verifyVoiceSessionCookie(
  cookieHeader: string | undefined,
  options: Pick<VoiceCookieOptions, "botToken" | "nowSeconds"> 
): TelegramLoginIdentity | null {
  if (!cookieHeader) return null;
  const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;
  const value = cookie.slice(COOKIE_NAME.length + 1);
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = value.slice(0, separator);
  const suppliedSignature = Buffer.from(value.slice(separator + 1), "base64url");
  const expectedSignature = createHmac("sha256", sessionKey(options.botToken)).update(payload).digest();
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: unknown; iat?: unknown; exp?: unknown;
    };
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (typeof parsed.sub !== "string" || !/^\d+$/.test(parsed.sub)) return null;
    if (!Number.isSafeInteger(parsed.iat) || !Number.isSafeInteger(parsed.exp)) return null;
    if ((parsed.iat as number) > now + 30 || (parsed.exp as number) <= now) return null;
    return { userId: parsed.sub };
  } catch {
    return null;
  }
}

export function clearVoiceSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
