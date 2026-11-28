import { createHmac, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "./client.js";
import { oauthFlows, userIdentities, users } from "./schema.js";
import { createSessionForUser, type CreatedMobileSession } from "./mobileStore.js";
import { verifierMatchesChallenge, type FlowPurpose, type FlowRow, type OAuthProvider } from "../mobile/oauthWeb.js";

const FLOW_TTL_MS = 10 * 60_000;
const EXCHANGE_TTL_MS = 2 * 60_000;

function hashSecret(value: string): string {
  return createHmac("sha256", config.TELEGRAM_BOT_TOKEN).update(value, "utf8").digest("hex");
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS user_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_user_id text NOT NULL,
    email text,
    display_name text,
    telegram_chat_id text NOT NULL,
    linked_at timestamptz NOT NULL DEFAULT now()
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS user_identities_provider_uid_idx ON user_identities(provider, provider_user_id)",
  "CREATE INDEX IF NOT EXISTS user_identities_user_id_idx ON user_identities(user_id)",
  `CREATE TABLE IF NOT EXISTS oauth_flows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    state_hash text NOT NULL UNIQUE,
    purpose text NOT NULL,
    provider text NOT NULL,
    telegram_id text,
    telegram_chat_id text,
    code_challenge text,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    exchange_code_hash text UNIQUE,
    exchange_user_id uuid,
    exchange_expires_at timestamptz,
    exchange_consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  "CREATE INDEX IF NOT EXISTS oauth_flows_expiry_idx ON oauth_flows(expires_at)"
];

let schemaReady: Promise<void> | null = null;

/** Creates the account-linking tables if they are missing. Safe to call repeatedly. */
export function ensureOAuthSchema(): Promise<void> {
  schemaReady ??= (async () => {
    for (const statement of SCHEMA_STATEMENTS) await db.execute(sql.raw(statement));
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export type LinkedIdentity = { provider: string; email: string | null; displayName: string | null; linkedAt: Date };

export async function listLinkedIdentities(userId: string): Promise<LinkedIdentity[]> {
  await ensureOAuthSchema();
  return db.select({
    provider: userIdentities.provider,
    email: userIdentities.email,
    displayName: userIdentities.displayName,
    linkedAt: userIdentities.linkedAt
  }).from(userIdentities).where(eq(userIdentities.userId, userId));
}

export async function findUserIdByTelegramId(telegramId: string): Promise<string | null> {
  await ensureOAuthSchema();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, telegramId)).limit(1);
  return user?.id ?? null;
}

export async function listIdentitiesForTelegramId(telegramId: string): Promise<LinkedIdentity[]> {
  const userId = await findUserIdByTelegramId(telegramId);
  return userId ? listLinkedIdentities(userId) : [];
}

export async function findUserIdByIdentity(provider: OAuthProvider, providerUserId: string): Promise<string | null> {
  await ensureOAuthSchema();
  const [row] = await db.select({ userId: userIdentities.userId }).from(userIdentities).where(and(
    eq(userIdentities.provider, provider),
    eq(userIdentities.providerUserId, providerUserId)
  )).limit(1);
  return row?.userId ?? null;
}

/** Throws Error("identity_claimed") when that login already belongs to another Nally account. */
export async function linkUserIdentity(input: {
  userId: string;
  telegramChatId: string;
  provider: OAuthProvider;
  providerUserId: string;
  email: string | null;
  displayName: string | null;
}): Promise<LinkedIdentity> {
  await ensureOAuthSchema();
  const [existing] = await db.select({ id: userIdentities.id, userId: userIdentities.userId }).from(userIdentities).where(and(
    eq(userIdentities.provider, input.provider),
    eq(userIdentities.providerUserId, input.providerUserId)
  )).limit(1);
  if (existing && existing.userId !== input.userId) throw new Error("identity_claimed");
  if (existing) {
    await db.update(userIdentities).set({
      email: input.email, displayName: input.displayName, telegramChatId: input.telegramChatId
    }).where(eq(userIdentities.id, existing.id));
  } else {
    // One login per provider per user: a re-link replaces the previous one.
    await db.delete(userIdentities).where(and(eq(userIdentities.userId, input.userId), eq(userIdentities.provider, input.provider)));
    await db.insert(userIdentities).values({
      userId: input.userId, provider: input.provider, providerUserId: input.providerUserId,
      email: input.email, displayName: input.displayName, telegramChatId: input.telegramChatId
    });
  }
  return { provider: input.provider, email: input.email, displayName: input.displayName, linkedAt: new Date() };
}

export async function unlinkUserIdentity(userId: string, provider: string): Promise<boolean> {
  await ensureOAuthSchema();
  const removed = await db.delete(userIdentities).where(and(
    eq(userIdentities.userId, userId), eq(userIdentities.provider, provider)
  )).returning({ id: userIdentities.id });
  return removed.length > 0;
}

export async function createFlow(input: {
  purpose: FlowPurpose;
  provider: OAuthProvider;
  telegramId?: string;
  telegramChatId?: string;
  codeChallenge?: string;
}): Promise<{ state: string; expiresAt: Date }> {
  await ensureOAuthSchema();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + FLOW_TTL_MS);
  const state = randomBytes(32).toString("base64url");
  await db.delete(oauthFlows).where(lt(oauthFlows.expiresAt, new Date(now.getTime() - 60 * 60_000)));
  await db.insert(oauthFlows).values({
    stateHash: hashSecret(state),
    purpose: input.purpose,
    provider: input.provider,
    telegramId: input.telegramId ?? null,
    telegramChatId: input.telegramChatId ?? null,
    codeChallenge: input.codeChallenge ?? null,
    expiresAt
  });
  return { state, expiresAt };
}

export async function peekFlow(state: string): Promise<{ purpose: FlowPurpose; provider: OAuthProvider } | null> {
  await ensureOAuthSchema();
  if (state.length < 32 || state.length > 128) return null;
  const [row] = await db.select({ purpose: oauthFlows.purpose, provider: oauthFlows.provider }).from(oauthFlows).where(and(
    eq(oauthFlows.stateHash, hashSecret(state)),
    gt(oauthFlows.expiresAt, new Date()),
    isNull(oauthFlows.consumedAt)
  )).limit(1);
  return row ? { purpose: row.purpose as FlowPurpose, provider: row.provider as OAuthProvider } : null;
}

/** Atomically uses up a state value: it can complete exactly one provider round-trip. */
export async function consumeFlow(state: string): Promise<FlowRow | null> {
  await ensureOAuthSchema();
  if (state.length < 32 || state.length > 128) return null;
  const now = new Date();
  const [row] = await db.update(oauthFlows).set({ consumedAt: now }).where(and(
    eq(oauthFlows.stateHash, hashSecret(state)),
    gt(oauthFlows.expiresAt, now),
    isNull(oauthFlows.consumedAt)
  )).returning({
    id: oauthFlows.id,
    purpose: oauthFlows.purpose,
    provider: oauthFlows.provider,
    telegramId: oauthFlows.telegramId,
    telegramChatId: oauthFlows.telegramChatId,
    codeChallenge: oauthFlows.codeChallenge
  });
  return row ? { ...row, purpose: row.purpose as FlowPurpose, provider: row.provider as OAuthProvider } : null;
}

export async function issueExchangeCode(flowId: string, userId: string): Promise<string> {
  await ensureOAuthSchema();
  const code = randomBytes(32).toString("base64url");
  await db.update(oauthFlows).set({
    exchangeCodeHash: hashSecret(code),
    exchangeUserId: userId,
    exchangeExpiresAt: new Date(Date.now() + EXCHANGE_TTL_MS),
    exchangeConsumedAt: null
  }).where(eq(oauthFlows.id, flowId));
  return code;
}

/** The app trades the one-time code plus its PKCE verifier for a normal mobile session. A wrong verifier burns the code. */
export async function redeemExchangeCode(code: string, verifier: string): Promise<CreatedMobileSession | null> {
  await ensureOAuthSchema();
  if (!/^[A-Za-z0-9_-]{43}$/.test(code) || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) return null;
  const now = new Date();
  const [flow] = await db.update(oauthFlows).set({ exchangeConsumedAt: now }).where(and(
    eq(oauthFlows.exchangeCodeHash, hashSecret(code)),
    gt(oauthFlows.exchangeExpiresAt, now),
    isNull(oauthFlows.exchangeConsumedAt)
  )).returning({ userId: oauthFlows.exchangeUserId, challenge: oauthFlows.codeChallenge });
  if (!flow?.userId || !flow.challenge || !verifierMatchesChallenge(verifier, flow.challenge)) return null;
  const [user] = await db.select({ id: users.id, telegramId: users.telegramId }).from(users).where(eq(users.id, flow.userId)).limit(1);
  if (!user) return null;
  // A private Telegram chat's id equals its owner's Telegram id, so the app shares that exact conversation.
  return createSessionForUser(user.id, user.telegramId, user.telegramId);
}
