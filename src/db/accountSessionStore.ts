/**
 * Account session helpers for Nally Account ("Login with Nally" foundation).
 *
 * Only a keyed HMAC of the bearer token is stored.
 * Pattern mirrors the existing mobile session store on feature branches.
 *
 * See docs/identity/nally-account.md
 */

import { createHmac, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { accountSessions, nallyAccounts } from "./schema-accounts.js";

/** Default session lifetime: 30 days. */
export const ACCOUNT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

export type AccountSessionInfo = {
  sessionId: string;
  accountId: string;
  expiresAt: Date;
};

export type CreatedAccountSession = {
  token: string;
  sessionId: string;
  accountId: string;
  expiresAt: Date;
};

export type AccountSessionDeps = {
  /** Secret used for HMAC (e.g. a dedicated ACCOUNT_SESSION_SECRET or bot token). */
  sessionSecret: string;
  /** Drizzle-style insert returning the new row. */
  insertSession: (row: {
    accountId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipHint?: string | null;
  }) => Promise<{ id: string; expiresAt: Date }>;
  /** Lookup active session by token hash. */
  findActiveSession: (tokenHash: string) => Promise<AccountSessionInfo | null>;
  /** Mark session revoked. */
  revokeById: (sessionId: string) => Promise<void>;
  /** Touch last_seen_at (optional, best-effort). */
  touchLastSeen?: (sessionId: string) => Promise<void>;
  /** Confirm the account exists and is active. */
  getActiveAccount?: (accountId: string) => Promise<{ id: string; status: string } | null>;
};

function hashToken(secret: string, token: string): string {
  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

/**
 * Create a new opaque session for a Nally Account.
 * Returns the raw token once — it is never stored.
 */
export async function createAccountSession(
  deps: AccountSessionDeps,
  accountId: string,
  opts?: { userAgent?: string; ipHint?: string; ttlMs?: number }
): Promise<CreatedAccountSession> {
  if (deps.getActiveAccount) {
    const account = await deps.getActiveAccount(accountId);
    if (!account || account.status !== "active") {
      throw new Error("Account not found or not active");
    }
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(deps.sessionSecret, token);
  const ttl = opts?.ttlMs ?? ACCOUNT_SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);

  const row = await deps.insertSession({
    accountId,
    tokenHash,
    expiresAt,
    userAgent: opts?.userAgent ?? null,
    ipHint: opts?.ipHint ?? null
  });

  return {
    token,
    sessionId: row.id,
    accountId,
    expiresAt: row.expiresAt
  };
}

/**
 * Validate a bearer token and return the session if it is still active.
 */
export async function authenticateAccountSession(
  deps: AccountSessionDeps,
  token: string
): Promise<AccountSessionInfo | null> {
  if (!token || token.length < 40 || token.length > 160) return null;

  const tokenHash = hashToken(deps.sessionSecret, token);
  const session = await deps.findActiveSession(tokenHash);
  if (!session) return null;

  // Best-effort last-seen update; never fail the auth path.
  if (deps.touchLastSeen) {
    try {
      await deps.touchLastSeen(session.sessionId);
    } catch {
      // ignore
    }
  }

  return session;
}

/**
 * Revoke a session by id (logout / unlink device).
 */
export async function revokeAccountSession(
  deps: AccountSessionDeps,
  sessionId: string
): Promise<void> {
  await deps.revokeById(sessionId);
}

/**
 * Example wiring against a real Drizzle client:
 *
 * ```ts
 * import { db } from "./client.js";
 * import { accountSessions, nallyAccounts } from "./schema-accounts.js";
 * import { config } from "../config.js";
 *
 * const sessionDeps: AccountSessionDeps = {
 *   sessionSecret: config.ACCOUNT_SESSION_SECRET,
 *
 *   insertSession: async (row) => {
 *     const [created] = await db.insert(accountSessions).values({
 *       accountId: row.accountId,
 *       tokenHash: row.tokenHash,
 *       expiresAt: row.expiresAt,
 *       userAgent: row.userAgent,
 *       ipHint: row.ipHint
 *     }).returning({ id: accountSessions.id, expiresAt: accountSessions.expiresAt });
 *     return created;
 *   },
 *
 *   findActiveSession: async (tokenHash) => {
 *     const now = new Date();
 *     const [row] = await db.select({
 *       sessionId: accountSessions.id,
 *       accountId: accountSessions.accountId,
 *       expiresAt: accountSessions.expiresAt
 *     }).from(accountSessions).where(and(
 *       eq(accountSessions.tokenHash, tokenHash),
 *       gt(accountSessions.expiresAt, now),
 *       isNull(accountSessions.revokedAt)
 *     )).limit(1);
 *     return row ?? null;
 *   },
 *
 *   revokeById: async (sessionId) => {
 *     await db.update(accountSessions)
 *       .set({ revokedAt: new Date() })
 *       .where(and(eq(accountSessions.id, sessionId), isNull(accountSessions.revokedAt)));
 *   },
 *
 *   touchLastSeen: async (sessionId) => {
 *     await db.update(accountSessions)
 *       .set({ lastSeenAt: new Date() })
 *       .where(eq(accountSessions.id, sessionId));
 *   },
 *
 *   getActiveAccount: async (accountId) => {
 *     const [row] = await db.select({ id: nallyAccounts.id, status: nallyAccounts.status })
 *       .from(nallyAccounts).where(eq(nallyAccounts.id, accountId)).limit(1);
 *     return row ?? null;
 *   }
 * };
 * ```
 */
