/**
 * Nally Account data model (branch: NallyAccountancy)
 *
 * First-party identity independent of Telegram or any single surface.
 * End goal: a real "Login with Nally" experience.
 * See docs/identity/nally-account.md and docs/identity/login-with-nally.md.
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
 * This is the thing behind "Login with Nally".
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

    /** Raw profile bits. Never store secrets here. */
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

/**
 * Opaque sessions for first-party surfaces and future "Login with Nally".
 * Only a keyed HMAC of the bearer token is stored.
 */
export const accountSessions = pgTable(
  "account_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => nallyAccounts.id, { onDelete: "cascade" }),

    /** Keyed HMAC of the bearer token. Never store the raw token. */
    tokenHash: text("token_hash").notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),

    userAgent: text("user_agent"),
    /** Coarse hint only — never long-term full IP storage. */
    ipHint: text("ip_hint")
  },
  (table) => [
    uniqueIndex("account_sessions_token_hash_idx").on(table.tokenHash),
    index("account_sessions_account_id_idx").on(table.accountId),
    index("account_sessions_expires_at_idx").on(table.expiresAt)
  ]
);

/**
 * Registered applications that will be allowed to offer "Login with Nally".
 * Minimal foundation for a future OIDC / OAuth identity-provider surface.
 */
export const oauthClients = pgTable(
  "oauth_clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Public client identifier. */
    clientId: text("client_id").notNull(),

    /** Null for public / native clients (PKCE). */
    clientSecretHash: text("client_secret_hash"),

    name: text("name").notNull(),

    redirectUris: jsonb("redirect_uris").$type<string[]>().default([]).notNull(),
    grantTypes: jsonb("grant_types").$type<string[]>().default(["authorization_code"]).notNull(),
    scopes: jsonb("scopes").$type<string[]>().default(["openid", "profile"]).notNull(),

    /** active | disabled */
    status: text("status").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("oauth_clients_client_id_idx").on(table.clientId),
    index("oauth_clients_status_idx").on(table.status)
  ]
);

/**
 * Short-lived authorization codes issued by /oauth/authorize.
 * Single-use; bound to client + PKCE challenge.
 */
export const oauthAuthorizationCodes = pgTable(
  "oauth_authorization_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    codeHash: text("code_hash").notNull(),

    clientId: text("client_id").notNull(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => nallyAccounts.id, { onDelete: "cascade" }),

    redirectUri: text("redirect_uri").notNull(),

    /** S256 PKCE challenge (base64url). */
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method").notNull().default("S256"),

    scopes: jsonb("scopes").$type<string[]>().default(["openid", "profile"]).notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("oauth_authorization_codes_hash_idx").on(table.codeHash),
    index("oauth_authorization_codes_account_idx").on(table.accountId),
    index("oauth_authorization_codes_expires_idx").on(table.expiresAt)
  ]
);

/**
 * Refresh tokens for Login with Nally clients.
 * Stored as hash only; rotate on use.
 */
export const oauthRefreshTokens = pgTable(
  "oauth_refresh_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    tokenHash: text("token_hash").notNull(),

    clientId: text("client_id").notNull(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => nallyAccounts.id, { onDelete: "cascade" }),

    scopes: jsonb("scopes").$type<string[]>().default(["openid", "profile"]).notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),

    /** Previous token in a rotation chain (optional). */
    parentTokenId: uuid("parent_token_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("oauth_refresh_tokens_hash_idx").on(table.tokenHash),
    index("oauth_refresh_tokens_account_idx").on(table.accountId),
    index("oauth_refresh_tokens_client_idx").on(table.clientId),
    index("oauth_refresh_tokens_expires_idx").on(table.expiresAt)
  ]
);

export type NallyAccount = typeof nallyAccounts.$inferSelect;
export type NewNallyAccount = typeof nallyAccounts.$inferInsert;
export type AccountIdentity = typeof accountIdentities.$inferSelect;
export type NewAccountIdentity = typeof accountIdentities.$inferInsert;
export type AccountSession = typeof accountSessions.$inferSelect;
export type NewAccountSession = typeof accountSessions.$inferInsert;
export type OauthClient = typeof oauthClients.$inferSelect;
export type NewOauthClient = typeof oauthClients.$inferInsert;
export type OauthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
export type NewOauthAuthorizationCode = typeof oauthAuthorizationCodes.$inferInsert;
export type OauthRefreshToken = typeof oauthRefreshTokens.$inferSelect;
export type NewOauthRefreshToken = typeof oauthRefreshTokens.$inferInsert;
