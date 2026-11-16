import { createHmac, randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "./client.js";
import { mobilePairingCodes, mobileSessions, users } from "./schema.js";
import { config } from "../config.js";

const PAIRING_CODE_TTL_MS = 5 * 60 * 1_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

function hashSecret(value: string): string {
  return createHmac("sha256", config.TELEGRAM_BOT_TOKEN).update(value, "utf8").digest("hex");
}

export type MobileSession = {
  sessionId: string;
  userId: string;
  telegramId: string;
  telegramChatId: string;
  expiresAt: Date;
};

export async function createMobilePairingCode(
  telegramId: string,
  telegramChatId: string
): Promise<{ code: string; expiresAt: Date }> {
  const now = Date.now();
  const expiresAt = new Date(now + PAIRING_CODE_TTL_MS);
  const code = String(randomInt(1_000_000_000, 9_999_999_999));
  await db.insert(mobilePairingCodes).values({
    telegramId,
    telegramChatId,
    codeHash: hashSecret(code),
    expiresAt
  });
  return { code, expiresAt };
}

/** Consume a Telegram-issued code exactly once and return a new app-only bearer token. */
export async function pairMobileSession(codeInput: string): Promise<{
  token: string;
  expiresAt: Date;
  telegramId: string;
  telegramChatId: string;
} | null> {
  const code = codeInput.trim();
  if (!/^\d{10}$/.test(code)) return null;

  return db.transaction(async (tx) => {
    const now = new Date();
    const [pairing] = await tx.update(mobilePairingCodes)
      .set({ consumedAt: now })
      .where(and(
        eq(mobilePairingCodes.codeHash, hashSecret(code)),
        gt(mobilePairingCodes.expiresAt, now),
        isNull(mobilePairingCodes.consumedAt)
      ))
      .returning({
        telegramId: mobilePairingCodes.telegramId,
        telegramChatId: mobilePairingCodes.telegramChatId
      });
    if (!pairing) return null;

    const [user] = await tx.select({ id: users.id })
      .from(users)
      .where(eq(users.telegramId, pairing.telegramId))
      .limit(1);
    if (!user) return null;

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await tx.insert(mobileSessions).values({
      userId: user.id,
      telegramId: pairing.telegramId,
      telegramChatId: pairing.telegramChatId,
      tokenHash: hashSecret(token),
      expiresAt
    });
    return {
      token,
      expiresAt,
      telegramId: pairing.telegramId,
      telegramChatId: pairing.telegramChatId
    };
  });
}

export async function authenticateMobileSession(token: string): Promise<MobileSession | null> {
  if (token.length < 40 || token.length > 160) return null;
  const now = new Date();
  const [session] = await db.select({
    sessionId: mobileSessions.id,
    userId: mobileSessions.userId,
    telegramId: mobileSessions.telegramId,
    telegramChatId: mobileSessions.telegramChatId,
    expiresAt: mobileSessions.expiresAt
  })
    .from(mobileSessions)
    .where(and(
      eq(mobileSessions.tokenHash, hashSecret(token)),
      gt(mobileSessions.expiresAt, now),
      isNull(mobileSessions.revokedAt)
    ))
    .limit(1);
  return session ?? null;
}

export async function revokeMobileSession(sessionId: string): Promise<void> {
  await db.update(mobileSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(mobileSessions.id, sessionId), isNull(mobileSessions.revokedAt)));
}
