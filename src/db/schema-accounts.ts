/**
 * Nally Account data model (branch: NallyAccountancy)
 *
 * First-party identity independent of Telegram or any single surface.
 * See docs/identity/nally-account.md for design rationale.
 *
 * These tables are additive. They do not yet replace the Telegram-rooted
 * `users` table that exists on feature branches. A future migration will
 * create accounts for existing users and re-point foreign keys.
 */

import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";

/**
 * Root Nally identity.
 * One row per human (or agent owner). Owns memories, conversations,
 * skills, schedules, approvals, etc. once migration is complete.
 */
export const nallyAccounts = pgTable(
  "nally_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Optional vanity handle. Stored lowercase. Presented as `@handle`. */
    handle: text("handle"),

    displayName: text("display_name"),

    /** Optional until email verification flows exist. */
    email: text("email"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),

    /** Null means passwordless / OAuth-only account. */
    passwordHash: text("password_hash"),

    timezone: text("timezone").notNull().default("Africa/Lagos"),

    /** active | suspended | deleted */
    status: text("status").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("nally_accounts_handle_idx").on(table.handle),
    uniqueIndex("nally_accounts_email_idx").on(table.email),
    index("nally_accounts_status_idx").on(table.status)
  ]
);

/**
 * Linked identities (Telegram, Google, Samsung, xAI, Apple, email, …).
 * Many provider rows can point at a single Nally Account.
 */
export const accountIdentities = pgTable(
  "account_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => nallyAccounts.id, { onDelete: "cascade" }),

    /**
     * Provider key. Suggested values:
     *   telegram | google | samsung | xai | apple | email | github | …
     */
    provider: text("provider").notNull(),

    /** Stable ID from the provider (Telegram user id, Google `sub`, etc.). */
    providerUserId: text("provider_user_id").notNull(),

    /** Optional human-readable username / handle from the provider. */
    providerUsername: text("provider_username"),

    /** Raw profile bits, tokens metadata, etc. Never store secrets here. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),

    linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("account_identities_provider_user_idx").on(
      table.provider,
      table.providerUserId
    ),
    index("account_identities_account_id_idx").on(table.accountId)
  ]
);

export type NallyAccount = typeof nallyAccounts.$inferSelect;
export type NewNallyAccount = typeof nallyAccounts.$inferInsert;
export type AccountIdentity = typeof accountIdentities.$inferSelect;
export type NewAccountIdentity = typeof accountIdentities.$inferInsert;
