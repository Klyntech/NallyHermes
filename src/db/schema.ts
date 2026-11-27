import {
  bigserial,
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  integer,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  timezone: text("timezone").notNull().default("Africa/Lagos"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const academicProfiles = pgTable("academic_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  programme: text("programme").notNull().default("Law"),
  institution: text("institution"),
  semester: text("semester"),
  jurisdiction: text("jurisdiction"),
  courses: jsonb("courses").$type<string[]>().default([]).notNull(),
  studyPreferences: text("study_preferences"),
  availability: jsonb("availability").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [index("academic_profiles_user_id_idx").on(table.userId)]);

export const academicDocuments = pgTable("academic_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  course: text("course"),
  sourceType: text("source_type").notNull().default("document"),
  originalName: text("original_name").notNull(),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  extractedText: text("extracted_text"),
  status: text("status").notNull().default("stored"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [index("academic_documents_user_id_idx").on(table.userId), index("academic_documents_course_idx").on(table.userId, table.course)]);

export const timetableEntries = pgTable("timetable_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  course: text("course").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  room: text("room"),
  lecturer: text("lecturer"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [index("timetable_entries_user_id_idx").on(table.userId), index("timetable_entries_schedule_idx").on(table.userId, table.dayOfWeek, table.startTime)]);

export const assessments = pgTable("assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  course: text("course").notNull(),
  title: text("title").notNull(),
  type: text("type").notNull().default("deadline"),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("open"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [index("assessments_user_id_idx").on(table.userId), index("assessments_due_idx").on(table.userId, table.dueAt)]);

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  telegramChatId: text("telegram_chat_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("conversations_user_id_idx").on(table.userId),
  index("conversations_user_chat_idx").on(table.userId, table.telegramChatId)
]);

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  sequence: bigserial("sequence", { mode: "number" }).notNull(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  sourceChannel: text("source_channel").notNull().default("telegram"),
  sourceMessageId: text("source_message_id"),
  status: text("status").notNull().default("complete"),
  /** Structured sources + thinking trace for mobile / rich clients */
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("messages_conversation_id_idx").on(table.conversationId),
  uniqueIndex("messages_source_message_idx").on(table.conversationId, table.sourceChannel, table.sourceMessageId)
    .where(sql`${table.sourceMessageId} IS NOT NULL`)
]);

export const mobilePairingCodes = pgTable("mobile_pairing_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: text("telegram_id").notNull(),
  telegramChatId: text("telegram_chat_id").notNull(),
  codeHash: text("code_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [index("mobile_pairing_codes_expiry_idx").on(table.expiresAt)]);

export const mobileSessions = pgTable("mobile_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  telegramId: text("telegram_id").notNull(),
  telegramChatId: text("telegram_chat_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [index("mobile_sessions_user_id_idx").on(table.userId)]);

export const mobileVoiceTickets = pgTable("mobile_voice_tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketHash: text("ticket_hash").notNull().unique(),
  mobileSessionId: uuid("mobile_session_id").notNull().references(() => mobileSessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [index("mobile_voice_tickets_expiry_idx").on(table.expiresAt)]);

export const mobileLoginChallenges = pgTable("mobile_login_challenges", {
  id: uuid("id").defaultRandom().primaryKey(),
  nonceHash: text("nonce_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [index("mobile_login_challenges_expiry_idx").on(table.expiresAt)]);

export const memories = pgTable("memories", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  kind: text("kind").notNull().default("fact"),
  subject: text("subject"),
  predicate: text("predicate"),
  object: text("object"),
  confidence: integer("confidence").notNull().default(80),
  source: text("source").notNull().default("user"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [index("memories_user_id_idx").on(table.userId), index("memories_context_idx").on(table.userId, table.kind, table.updatedAt)]);

export const scheduledJobs = pgTable("scheduled_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  task: text("task").notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  recurrence: text("recurrence"),
  timezone: text("timezone"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [index("scheduled_jobs_run_at_idx").on(table.runAt)]);

export const workflows = pgTable("workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  instructions: text("instructions").notNull(),
  trigger: text("trigger").notNull().default("schedule"),
  runAt: timestamp("run_at", { withTimezone: true }).notNull(),
  recurrence: text("recurrence").notNull(),
  timezone: text("timezone").notNull(),
  maxRuns: integer("max_runs"),
  untilAt: timestamp("until_at", { withTimezone: true }),
  allowedTools: jsonb("allowed_tools").$type<string[]>().default([]).notNull(),
  approvalPolicy: text("approval_policy").notNull().default("confirm_mutations"),
  outputDestination: text("output_destination").notNull().default("telegram"),
  retryPolicy: jsonb("retry_policy").$type<{ max_attempts: number; backoff_seconds: number }>().default({ max_attempts: 2, backoff_seconds: 60 }).notNull(),
  status: text("status").notNull().default("active"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("workflows_user_id_idx").on(table.userId),
  index("workflows_due_idx").on(table.status, table.runAt)
]);

export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workflowId: uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("running"),
  attempt: integer("attempt").notNull().default(1),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  output: text("output"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [index("workflow_runs_workflow_id_idx").on(table.workflowId)]);

/** Persisted "Always Allow" scopes for write-capable connectors (per Telegram user). */
export const approvalGrants = pgTable("approval_grants", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: text("telegram_id").notNull(),
  provider: text("provider").notNull(),
  scope: text("scope").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("approval_grants_user_provider_idx").on(table.telegramId, table.provider),
  index("approval_grants_scope_idx").on(table.telegramId, table.provider, table.scope)
]);

/** Write actions waiting on Telegram Deny / Allow / Always Allow. */
export const pendingApprovals = pgTable("pending_approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: text("telegram_id").notNull(),
  provider: text("provider").notNull(),
  operation: text("operation").notNull(),
  arguments: jsonb("arguments").$type<Record<string, unknown>>().default({}).notNull(),
  summary: text("summary").notNull(),
  status: text("status").notNull().default("pending"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true })
}, (table) => [
  index("pending_approvals_user_status_idx").on(table.telegramId, table.status),
]);

/** Per-turn relationship episodes — system-written activity log (not chat transcript). */
export const activityEpisodes = pgTable("activity_episodes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  telegramId: text("telegram_id").notNull(),
  channel: text("channel").notNull().default("telegram"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  /** Calendar date (UTC) for range queries and weekly rollups */
  activityDate: text("activity_date").notNull(),
  topics: jsonb("topics").$type<string[]>().default([]).notNull(),
  tools: jsonb("tools").$type<string[]>().default([]).notNull(),
  userIntent: text("user_intent").notNull(),
  nallyAction: text("nally_action"),
  outcome: text("outcome").notNull().default("answered"),
  refs: jsonb("refs").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("activity_episodes_user_time_idx").on(table.userId, table.occurredAt),
  index("activity_episodes_user_date_idx").on(table.userId, table.activityDate),
  index("activity_episodes_telegram_time_idx").on(table.telegramId, table.occurredAt)
]);

/**
 * Weekly activity summaries with explicit date bounds so Nally can pinpoint
 * when things happened ("the week of 2026-11-17").
 */
export const activityWeekSummaries = pgTable("activity_week_summaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  telegramId: text("telegram_id").notNull(),
  /** Monday UTC YYYY-MM-DD */
  weekStart: text("week_start").notNull(),
  /** Sunday UTC YYYY-MM-DD */
  weekEnd: text("week_end").notNull(),
  episodeCount: integer("episode_count").notNull().default(0),
  topics: jsonb("topics").$type<string[]>().default([]).notNull(),
  summary: text("summary").notNull(),
  dayBreakdown: jsonb("day_breakdown").$type<Record<string, string[]>>().default({}).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("activity_week_user_start_idx").on(table.userId, table.weekStart),
  index("activity_week_telegram_start_idx").on(table.telegramId, table.weekStart)
]);

/** Small mutable working state for Jarvis-style continuity. */
export const userWorkingState = pgTable("user_working_state", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  telegramId: text("telegram_id").notNull().unique(),
  activeProjects: jsonb("active_projects").$type<string[]>().default([]).notNull(),
  openLoops: jsonb("open_loops").$type<string[]>().default([]).notNull(),
  lastTopics: jsonb("last_topics").$type<string[]>().default([]).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
