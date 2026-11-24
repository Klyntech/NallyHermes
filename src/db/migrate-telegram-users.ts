/**
 * Phase-1 backfill: create a Nally Account + telegram identity
 * for every existing row in the legacy `users` table.
 *
 * Safe to re-run (idempotent via account_identities unique constraint).
 * Does not mutate the legacy users table.
 *
 * See docs/identity/migration-telegram-to-nally.md
 *
 * NOTE: This module assumes the legacy `users` table still exists
 * (feature branches). When merging into a branch that has `src/db/schema.ts`,
 * wire the real `db` client and the real `users` table import.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import {
  nallyAccounts,
  accountIdentities,
  type NewNallyAccount,
  type NewAccountIdentity
} from "./schema-accounts.js";

/** Minimal shape of the legacy users table we need. */
export type LegacyUser = {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  timezone: string;
};

export type MigrateResult = {
  scanned: number;
  created: number;
  skipped: number;
  errors: Array<{ telegramId: string; error: string }>;
};

export type MigrateDeps = {
  /** Select all legacy users (or a batch). */
  listLegacyUsers: (offset: number, limit: number) => Promise<LegacyUser[]>;
  /** Insert helpers — use the real Drizzle db in production. */
  insertAccount: (row: NewNallyAccount) => Promise<{ id: string }>;
  insertIdentity: (row: NewAccountIdentity) => Promise<void>;
  /** Returns true if a telegram identity already exists. */
  hasTelegramIdentity: (telegramId: string) => Promise<boolean>;
};

const BATCH_SIZE = 100;

/**
 * Run the Phase-1 backfill.
 * Processes users in batches; never creates duplicate telegram identities.
 */
export async function migrateTelegramUsersToNallyAccounts(
  deps: MigrateDeps
): Promise<MigrateResult> {
  const result: MigrateResult = {
    scanned: 0,
    created: 0,
    skipped: 0,
    errors: []
  };

  let offset = 0;

  for (;;) {
    const batch = await deps.listLegacyUsers(offset, BATCH_SIZE);
    if (batch.length === 0) break;

    for (const user of batch) {
      result.scanned += 1;

      try {
        const exists = await deps.hasTelegramIdentity(user.telegramId);
        if (exists) {
          result.skipped += 1;
          continue;
        }

        const displayName =
          user.firstName?.trim() ||
          user.username?.trim() ||
          null;

        const account = await deps.insertAccount({
          displayName,
          timezone: user.timezone || "Africa/Lagos",
          status: "active"
        });

        await deps.insertIdentity({
          accountId: account.id,
          provider: "telegram",
          providerUserId: user.telegramId,
          providerUsername: user.username,
          metadata: {
            legacy_user_id: user.id,
            migrated_at: new Date().toISOString()
          }
        });

        result.created += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ telegramId: user.telegramId, error: message });
      }
    }

    offset += batch.length;
    if (batch.length < BATCH_SIZE) break;
  }

  return result;
}

/**
 * Example wiring (pseudo — adapt to real db client on feature branches):
 *
 * ```ts
 * import { db } from "./client.js";
 * import { users } from "./schema.js";
 * import { nallyAccounts, accountIdentities } from "./schema-accounts.js";
 *
 * const result = await migrateTelegramUsersToNallyAccounts({
 *   listLegacyUsers: async (offset, limit) =>
 *     db.select({
 *       id: users.id,
 *       telegramId: users.telegramId,
 *       username: users.username,
 *       firstName: users.firstName,
 *       timezone: users.timezone
 *     }).from(users).offset(offset).limit(limit),
 *
 *   hasTelegramIdentity: async (telegramId) => {
 *     const [row] = await db.select({ id: accountIdentities.id })
 *       .from(accountIdentities)
 *       .where(and(
 *         eq(accountIdentities.provider, "telegram"),
 *         eq(accountIdentities.providerUserId, telegramId)
 *       )).limit(1);
 *     return Boolean(row);
 *   },
 *
 *   insertAccount: async (row) => {
 *     const [created] = await db.insert(nallyAccounts).values(row).returning({ id: nallyAccounts.id });
 *     return created;
 *   },
 *
 *   insertIdentity: async (row) => {
 *     await db.insert(accountIdentities).values(row);
 *   }
 * });
 * ```
 */
