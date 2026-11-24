import {
  bigserial,
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  integer,
  uniqueIndex,
  boolean
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

/* -------------------------------------------------------------------------- */
/*  Self-Improvement foundations (Grok-Self-Improvement-3.6)                   */
/* -------------------------------------------------------------------------- */

/** High-level execution trajectories for the learning loop. */
export const trajectories = pgTable("trajectories", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  /** Short human-readable summary of what the user asked */
  requestSummary: text("request_summary").notNull(),
  /** Domain tags: law | code | trading | cross | general */
  domains: jsonb("domains").$type<string[]>().default([]).notNull(),
  /** Ordered list of tool names / high-level steps that were used */
  steps: jsonb("steps").$type<Array<{ tool?: string; summary: string; success: boolean }>>().default([]).notNull(),
  /** Overall outcome */
  outcome: text("outcome").notNull().default("success"), // success | partial | failed
  /** Whether this trajectory looks reusable enough to propose a skill */
  reusable: boolean("reusable").notNull().default(false),
  /** Optional link to a skill that was created/updated from this trajectory */
  skillId: uuid("skill_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("trajectories_user_id_idx").on(table.userId),
  index("trajectories_outcome_idx").on(table.userId, table.outcome),
  index("trajectories_created_idx").on(table.userId, table.createdAt)
]);

/**
 * Learned / proposed skills.
 * Repository skills (file-based) remain the source of truth for static packages.
 * This table holds agent-proposed and user-accepted dynamic skills.
 */
export const learnedSkills = pgTable("learned_skills", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** kebab-case name, unique per user */
  name: text("name").notNull(),
  description: text("description").notNull(),
  /** Full SKILL.md body (frontmatter + content) */
  body: text("body").notNull(),
  /** law | code | trading | cross | general */
  domain: text("domain").notNull().default("general"),
  status: text("status").notNull().default("proposed"), // proposed | accepted | active | deprecated
  /** How many times this skill has been successfully applied */
  successCount: integer("success_count").notNull().default(0),
  /** Source trajectory that produced the initial proposal */
  sourceTrajectoryId: uuid("source_trajectory_id").references(() => trajectories.id, { onDelete: "set null" }),
  /** Optional link into the future Agency Graph (Project node) */
  projectId: uuid("project_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true })
}, (table) => [
  index("learned_skills_user_id_idx").on(table.userId),
  index("learned_skills_status_idx").on(table.userId, table.status),
  uniqueIndex("learned_skills_user_name_idx").on(table.userId, table.name)
]);


/* -------------------------------------------------------------------------- */
/*  Agency Graph — Projects, Claims, Constraints (Grok-Self-Improvement-3.6)  */
/* -------------------------------------------------------------------------- */

export const agencyProjects = pgTable("agency_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  domain: text("domain").notNull().default("general"),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("active"),
  horizonYears: integer("horizon_years"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("agency_projects_user_id_idx").on(table.userId),
  index("agency_projects_domain_idx").on(table.userId, table.domain)
]);

export const agencyClaims = pgTable("agency_claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => agencyProjects.id, { onDelete: "cascade" }),
  statement: text("statement").notNull(),
  status: text("status").notNull().default("open"),
  evidenceSummary: text("evidence_summary"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("agency_claims_user_id_idx").on(table.userId),
  index("agency_claims_project_idx").on(table.projectId)
]);

export const agencyConstraints = pgTable("agency_constraints", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => agencyProjects.id, { onDelete: "cascade" }),
  statement: text("statement").notNull(),
  strength: text("strength").notNull().default("soft"),
  domain: text("domain").notNull().default("general"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("agency_constraints_user_id_idx").on(table.userId),
  index("agency_constraints_project_idx").on(table.projectId)
]);


/* -------------------------------------------------------------------------- */
/*  Device Kernel — Grok-Device-System-3.7                                     */
/* -------------------------------------------------------------------------- */

export const devices = pgTable("devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  label: text("label").notNull(),
  kind: text("kind").notNull().default("other"),
  status: text("status").notNull().default("pending"),
  capabilities: jsonb("capabilities").$type<string[]>().default([]).notNull(),
  /** Hashed device token for heartbeat / job pull */
  tokenHash: text("token_hash"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  pairedAt: timestamp("paired_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("devices_user_id_idx").on(table.userId),
  index("devices_status_idx").on(table.userId, table.status)
]);

export const deviceJobs = pgTable("device_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  capability: text("capability").notNull(),
  summary: text("summary").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  status: text("status").notNull().default("queued"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"),
  projectId: uuid("project_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true })
}, (table) => [
  index("device_jobs_user_id_idx").on(table.userId),
  index("device_jobs_device_status_idx").on(table.deviceId, table.status)
]);

export const devicePairingCodes = pgTable("device_pairing_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: text("telegram_id").notNull(),
  codeHash: text("code_hash").notNull().unique(),
  deviceName: text("device_name").notNull(),
  kind: text("kind").notNull().default("other"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("device_pairing_codes_expiry_idx").on(table.expiresAt)
]);
