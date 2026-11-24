import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "./client.js";
import { accountIdentities, accountSessions, nallyAccounts, users } from "./schema.js";

const scrypt = promisify(scryptCallback);
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const SCRYPT_KEY_LENGTH = 64;

export type NallyAccountSession = {
  sessionId: string;
  accountId: string;
  expiresAt: Date;
};

export type CreatedNallyAccountSession = {
  token: string;
  expiresAt: Date;
  accountId: string;
};

export class NallyAccountError extends Error {
  constructor(message: string, readonly code: "invalid_input" | "conflict" | "invalid_credentials" | "account_unavailable") {
    super(message);
    this.name = "NallyAccountError";
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeUsername(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(normalized)) {
    throw new NallyAccountError("Username must be 3–32 characters using letters, numbers or underscores.", "invalid_input");
  }
  return normalized;
}

async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 256) {
    throw new NallyAccountError("Password must be between 12 and 256 characters.", "invalid_input");
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEY_LENGTH, { N: 16384, r: 8, p: 1 }) as Buffer;
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltText, hashText] = parts;
  const N = Number(n), R = Number(r), P = Number(p);
  if (N !== 16384 || R !== 8 || P !== 1) return false;
  try {
    const salt = Buffer.from(saltText!, "base64url");
    const expected = Buffer.from(hashText!, "base64url");
    if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) return false;
    const actual = await scrypt(password, salt, expected.length, { N, r: R, p: P }) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function createSession(accountId: string): Promise<CreatedNallyAccountSession> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(accountSessions).values({
    accountId,
    tokenHash: hashSessionToken(token),
    expiresAt
  });
  return { token, expiresAt, accountId };
}

/** Idempotent additive migration. Existing users keep their UUID and all existing data. */
export async function ensureNallyAccountSchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS nally_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE,
      username text UNIQUE,
      display_name text,
      password_hash text,
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES nally_accounts(id) ON DELETE SET NULL`,
    `CREATE TABLE IF NOT EXISTS account_identities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL REFERENCES nally_accounts(id) ON DELETE CASCADE,
      provider text NOT NULL CHECK (provider IN ('telegram')),
      subject text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(provider, subject)
    )`,
    `CREATE TABLE IF NOT EXISTS account_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL REFERENCES nally_accounts(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS account_sessions_account_id_idx ON account_sessions(account_id)",
    "CREATE INDEX IF NOT EXISTS account_sessions_expiry_idx ON account_sessions(expires_at)",
    // Reuse the existing user UUID as the initial Nally Account UUID. This is a
    // one-to-one, lossless bridge for every pre-existing Telegram user.
    `INSERT INTO nally_accounts (id, display_name, created_at)
      SELECT id, COALESCE(NULLIF(first_name, ''), NULLIF(username, ''), 'Nally user'), created_at
      FROM users WHERE account_id IS NULL
      ON CONFLICT (id) DO NOTHING`,
    "UPDATE users SET account_id = id WHERE account_id IS NULL",
    `INSERT INTO account_identities (account_id, provider, subject)
      SELECT account_id, 'telegram', telegram_id FROM users
      WHERE account_id IS NOT NULL
      ON CONFLICT (provider, subject) DO NOTHING`
  ];
  for (const statement of statements) await db.execute((await import("drizzle-orm")).sql.raw(statement));
}

export async function registerNallyAccount(input: {
  email: string;
  password: string;
  username?: string;
  displayName?: string;
}): Promise<CreatedNallyAccountSession> {
  const email = normalizeEmail(input.email);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new NallyAccountError("Enter a valid email address.", "invalid_input");
  }
  const username = normalizeUsername(input.username);
  const passwordHash = await hashPassword(input.password);
  try {
    const [account] = await db.insert(nallyAccounts).values({
      email,
      username,
      displayName: input.displayName?.trim().slice(0, 80) || username || email.split("@")[0],
      passwordHash
    }).returning({ id: nallyAccounts.id });
    if (!account) throw new Error("Account creation returned no row.");
    return await createSession(account.id);
  } catch (error) {
    if (error instanceof NallyAccountError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/unique|duplicate/i.test(message)) {
      throw new NallyAccountError("An account with that email or username already exists.", "conflict");
    }
    throw error;
  }
}

export async function loginNallyAccount(emailInput: string, password: string): Promise<CreatedNallyAccountSession> {
  const email = normalizeEmail(emailInput);
  const [account] = await db.select({
    id: nallyAccounts.id,
    passwordHash: nallyAccounts.passwordHash,
    status: nallyAccounts.status
  }).from(nallyAccounts).where(eq(nallyAccounts.email, email)).limit(1);

  // Use a fixed-cost dummy hash for unknown accounts to reduce account-enumeration timing differences.
  const valid = account?.passwordHash
    ? await verifyPassword(password, account.passwordHash)
    : await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  if (!account || !valid || account.status !== "active" || !account.passwordHash) {
    throw new NallyAccountError("Email or password is incorrect.", "invalid_credentials");
  }
  return createSession(account.id);
}

export async function authenticateNallyAccountSession(token: string): Promise<NallyAccountSession | null> {
  if (token.length < 40 || token.length > 160) return null;
  const now = new Date();
  const [session] = await db.select({
    sessionId: accountSessions.id,
    accountId: accountSessions.accountId,
    expiresAt: accountSessions.expiresAt
  }).from(accountSessions).where(and(
    eq(accountSessions.tokenHash, hashSessionToken(token)),
    gt(accountSessions.expiresAt, now),
    isNull(accountSessions.revokedAt)
  )).limit(1);
  if (!session) return null;
  const [account] = await db.select({ status: nallyAccounts.status })
    .from(nallyAccounts).where(eq(nallyAccounts.id, session.accountId)).limit(1);
  return account?.status === "active" ? session : null;
}

export async function revokeNallyAccountSession(sessionId: string): Promise<void> {
  await db.update(accountSessions).set({ revokedAt: new Date() })
    .where(and(eq(accountSessions.id, sessionId), isNull(accountSessions.revokedAt)));
}

export async function getNallyAccount(accountId: string) {
  const [account] = await db.select({
    id: nallyAccounts.id,
    email: nallyAccounts.email,
    username: nallyAccounts.username,
    displayName: nallyAccounts.displayName,
    status: nallyAccounts.status,
    createdAt: nallyAccounts.createdAt
  }).from(nallyAccounts).where(eq(nallyAccounts.id, accountId)).limit(1);
  if (!account) return null;
  const identities = await db.select({
    provider: accountIdentities.provider,
    subject: accountIdentities.subject,
    createdAt: accountIdentities.createdAt
  }).from(accountIdentities).where(eq(accountIdentities.accountId, accountId));
  return { ...account, identities };
}

export async function getOrCreateTelegramNallyAccount(telegramId: string): Promise<string> {
  const [identity] = await db.select({ accountId: accountIdentities.accountId })
    .from(accountIdentities).where(and(
      eq(accountIdentities.provider, "telegram"),
      eq(accountIdentities.subject, telegramId)
    )).limit(1);
  if (identity) return identity.accountId;

  const [legacyUser] = await db.select({ id: users.id, accountId: users.accountId, firstName: users.firstName, username: users.username })
    .from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (legacyUser?.accountId) return legacyUser.accountId;

  const [account] = await db.insert(nallyAccounts).values({
    displayName: legacyUser?.firstName || legacyUser?.username || "Nally user"
  }).returning({ id: nallyAccounts.id });
  if (!account) throw new Error("Could not create Nally Account.");
  try {
    await db.insert(accountIdentities).values({
      accountId: account.id,
      provider: "telegram",
      subject: telegramId
    });
    if (legacyUser) {
      await db.update(users).set({ accountId: account.id }).where(eq(users.id, legacyUser.id));
    }
    return account.id;
  } catch (error) {
    const [existing] = await db.select({ accountId: accountIdentities.accountId })
      .from(accountIdentities).where(and(
        eq(accountIdentities.provider, "telegram"),
        eq(accountIdentities.subject, telegramId)
      )).limit(1);
    if (existing) return existing.accountId;
    throw error;
  }
}

export async function linkTelegramIdentity(accountId: string, telegramId: string): Promise<void> {
  const [existing] = await db.select({ accountId: accountIdentities.accountId })
    .from(accountIdentities).where(and(
      eq(accountIdentities.provider, "telegram"),
      eq(accountIdentities.subject, telegramId)
    )).limit(1);
  if (existing && existing.accountId !== accountId) {
    throw new NallyAccountError("This Telegram identity is already linked to another Nally Account.", "conflict");
  }
  const [legacyUser] = await db.select({ id: users.id, accountId: users.accountId })
    .from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (legacyUser?.accountId && legacyUser.accountId !== accountId) {
    throw new NallyAccountError("This Telegram identity belongs to another Nally Account.", "conflict");
  }
  if (!existing) {
    await db.insert(accountIdentities).values({ accountId, provider: "telegram", subject: telegramId });
  }
  if (legacyUser) {
    await db.update(users).set({ accountId }).where(eq(users.id, legacyUser.id));
  }
}
