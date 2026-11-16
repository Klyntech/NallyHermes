import { createHmac, randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "./client.js";
import { mobileLoginChallenges, mobilePairingCodes, mobileSessions, userIdentities, users } from "./schema.js";
import { config } from "../config.js";

const PAIRING_CODE_TTL_MS = 5 * 60 * 1_000;
const LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1_000;
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

export type CreatedMobileSession = {
  token: string;
  expiresAt: Date;
  telegramId: string;
  telegramChatId: string;
};

export type TelegramLoginChallenge = {
  nonce: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
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

async function releasePairingCode(code: string, consumedAt: Date): Promise<void> {
  await db.update(mobilePairingCodes)
    .set({ consumedAt: null })
    .where(and(
      eq(mobilePairingCodes.codeHash, hashSecret(code)),
      eq(mobilePairingCodes.consumedAt, consumedAt)
    ));
}

async function createSessionForUser(
  userId: string,
  telegramId: string,
  telegramChatId: string
): Promise<CreatedMobileSession> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(mobileSessions).values({
    userId,
    telegramId,
    telegramChatId,
    tokenHash: hashSecret(token),
    expiresAt
  });
  return { token, expiresAt, telegramId, telegramChatId };
}

/** Consume a Telegram-issued code once. Neon HTTP does not support Drizzle transactions. */
export async function pairMobileSession(codeInput: string): Promise<CreatedMobileSession | null> {
  const code = codeInput.trim();
  if (!/^\d{10}$/.test(code)) return null;

  const now = new Date();
  const [pairing] = await db.update(mobilePairingCodes)
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

  try {
    const [user] = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.telegramId, pairing.telegramId))
      .limit(1);
    if (!user) {
      await releasePairingCode(code, now);
      return null;
    }
    return await createSessionForUser(user.id, pairing.telegramId, pairing.telegramChatId);
  } catch (error) {
    // If session creation fails, make the unexpired code usable again.
    await releasePairingCode(code, now);
    throw error;
  }
}

export async function createTelegramLoginChallenge(): Promise<TelegramLoginChallenge | null> {
  const clientId = config.TELEGRAM_LOGIN_CLIENT_ID;
  const redirectUri = config.TELEGRAM_LOGIN_REDIRECT_URI;
  if (!clientId || !redirectUri) return null;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOGIN_CHALLENGE_TTL_MS);
  const nonce = randomBytes(32).toString("base64url");
  await db.delete(mobileLoginChallenges).where(lt(mobileLoginChallenges.expiresAt, now));
  await db.insert(mobileLoginChallenges).values({ nonceHash: hashSecret(nonce), expiresAt });
  return {
    nonce,
    clientId,
    redirectUri,
    scopes: ["profile", "telegram:bot_access"],
    expiresAt
  };
}

/** Atomically consume a short-lived OIDC nonce; a successful nonce is never reusable. */
export async function consumeTelegramLoginChallenge(nonce: string): Promise<boolean> {
  if (nonce.length < 32 || nonce.length > 128) return false;
  const now = new Date();
  const [challenge] = await db.update(mobileLoginChallenges)
    .set({ consumedAt: now })
    .where(and(
      eq(mobileLoginChallenges.nonceHash, hashSecret(nonce)),
      gt(mobileLoginChallenges.expiresAt, now),
      isNull(mobileLoginChallenges.consumedAt)
    ))
    .returning({ id: mobileLoginChallenges.id });
  return Boolean(challenge);
}

/** Create a native session for an existing Nally Telegram user after verified OIDC login. */
export async function createMobileSessionForTelegramUser(telegramId: string): Promise<CreatedMobileSession | null> {
  const [user] = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.telegramId, telegramId))
    .limit(1);
  if (!user) return null;
  // Private Telegram chat IDs equal their owning user's Telegram ID.
  return createSessionForUser(user.id, telegramId, telegramId);
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


export type LinkedIdentity = {
  provider: string;
  email: string | null;
  displayName: string | null;
  linkedAt: Date;
};

export async function listLinkedIdentities(userId: string): Promise<LinkedIdentity[]> {
  const rows = await db.select({
    provider: userIdentities.provider,
    email: userIdentities.email,
    displayName: userIdentities.displayName,
    linkedAt: userIdentities.linkedAt
  }).from(userIdentities).where(eq(userIdentities.userId, userId));
  return rows;
}

export async function linkUserIdentity(input: {
  userId: string;
  telegramChatId: string;
  provider: "google" | "github";
  providerUserId: string;
  email: string | null;
  displayName: string | null;
}): Promise<LinkedIdentity> {
  const existing = await db.select({
    id: userIdentities.id,
    userId: userIdentities.userId
  }).from(userIdentities).where(and(
    eq(userIdentities.provider, input.provider),
    eq(userIdentities.providerUserId, input.providerUserId)
  )).limit(1);

  if (existing[0] && existing[0].userId !== input.userId) {
    throw new Error("identity_claimed");
  }

  if (existing[0]) {
    await db.update(userIdentities).set({
      email: input.email,
      displayName: input.displayName,
      telegramChatId: input.telegramChatId
    }).where(eq(userIdentities.id, existing[0].id));
  } else {
    // One row per provider per user
    await db.delete(userIdentities).where(and(
      eq(userIdentities.userId, input.userId),
      eq(userIdentities.provider, input.provider)
    ));
    await db.insert(userIdentities).values({
      userId: input.userId,
      provider: input.provider,
      providerUserId: input.providerUserId,
      email: input.email,
      displayName: input.displayName,
      telegramChatId: input.telegramChatId
    });
  }

  return {
    provider: input.provider,
    email: input.email,
    displayName: input.displayName,
    linkedAt: new Date()
  };
}

export async function unlinkUserIdentity(userId: string, provider: string): Promise<boolean> {
  const removed = await db.delete(userIdentities).where(and(
    eq(userIdentities.userId, userId),
    eq(userIdentities.provider, provider)
  )).returning({ id: userIdentities.id });
  return removed.length > 0;
}

/** Sign in with a previously linked OAuth identity and mint a mobile session. */
export async function createMobileSessionFromIdentity(
  provider: "google" | "github",
  providerUserId: string
): Promise<CreatedMobileSession | null> {
  const [identity] = await db.select({
    userId: userIdentities.userId,
    telegramChatId: userIdentities.telegramChatId
  }).from(userIdentities).where(and(
    eq(userIdentities.provider, provider),
    eq(userIdentities.providerUserId, providerUserId)
  )).limit(1);
  if (!identity) return null;

  const [user] = await db.select({
    id: users.id,
    telegramId: users.telegramId
  }).from(users).where(eq(users.id, identity.userId)).limit(1);
  if (!user?.telegramId) return null;

  let chatId = identity.telegramChatId;
  if (!chatId) {
    const [prior] = await db.select({
      telegramChatId: mobileSessions.telegramChatId
    }).from(mobileSessions)
      .where(eq(mobileSessions.userId, user.id))
      .limit(1);
    chatId = prior?.telegramChatId ?? null;
  }
  if (!chatId) return null;

  return createSessionForUser(user.id, user.telegramId, chatId);
}
