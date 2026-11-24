import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { config } from "../config.js";
import * as schema from "./schema.js";

const neonSql = neon(config.DATABASE_URL);
export const db = drizzle({ client: neonSql, schema });

/** Create the application schema safely during startup. Existing data is preserved. */
export async function ensureDatabase(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      telegram_id text NOT NULL UNIQUE,
      username text,
      first_name text,
      timezone text NOT NULL DEFAULT 'Africa/Lagos',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      telegram_chat_id text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role text NOT NULL,
      content text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS memories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content text NOT NULL,
      kind text NOT NULL DEFAULT 'fact',
      subject text,
      predicate text,
      object text,
      confidence integer NOT NULL DEFAULT 80,
      source text NOT NULL DEFAULT 'user',
      expires_at timestamptz,
      last_confirmed_at timestamptz,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS academic_profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      programme text NOT NULL DEFAULT 'Law',
      institution text,
      semester text,
      jurisdiction text,
      courses jsonb NOT NULL DEFAULT '[]'::jsonb,
      study_preferences text,
      availability jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS academic_documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL,
      course text,
      source_type text NOT NULL DEFAULT 'document',
      original_name text NOT NULL,
      file_path text NOT NULL,
      mime_type text NOT NULL,
      size_bytes integer NOT NULL,
      extracted_text text,
      status text NOT NULL DEFAULT 'stored',
      error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS timetable_entries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course text NOT NULL,
      day_of_week integer NOT NULL,
      start_time text NOT NULL,
      end_time text NOT NULL,
      room text,
      lecturer text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS assessments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course text NOT NULL,
      title text NOT NULL,
      type text NOT NULL DEFAULT 'deadline',
      due_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'open',
      notes text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task text NOT NULL,
      run_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      recurrence text,
      timezone text,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS workflows (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text NOT NULL,
      instructions text NOT NULL,
      trigger text NOT NULL DEFAULT 'schedule',
      run_at timestamptz NOT NULL,
      recurrence text NOT NULL,
      timezone text NOT NULL,
      max_runs integer,
      until_at timestamptz,
      allowed_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
      approval_policy text NOT NULL DEFAULT 'confirm_mutations',
      output_destination text NOT NULL DEFAULT 'telegram',
      retry_policy jsonb NOT NULL DEFAULT '{"max_attempts":2,"backoff_seconds":60}'::jsonb,
      status text NOT NULL DEFAULT 'active',
      last_run_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS workflow_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'running',
      attempt integer NOT NULL DEFAULT 1,
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      output text,
      error text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Lagos'",
    "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS telegram_chat_id text NOT NULL DEFAULT ''",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS sequence bigserial",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS source_channel text NOT NULL DEFAULT 'telegram'",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS source_message_id text",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'complete'",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb",
    "CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id)",
    "CREATE INDEX IF NOT EXISTS conversations_user_chat_idx ON conversations(user_id, telegram_chat_id)",
    "CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS messages_sequence_idx ON messages(sequence)",
    "CREATE UNIQUE INDEX IF NOT EXISTS messages_source_message_idx ON messages(conversation_id, source_channel, source_message_id) WHERE source_message_id IS NOT NULL",
    `CREATE TABLE IF NOT EXISTS mobile_pairing_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      telegram_id text NOT NULL,
      telegram_chat_id text NOT NULL,
      code_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS mobile_pairing_codes_expiry_idx ON mobile_pairing_codes(expires_at)",
    `CREATE TABLE IF NOT EXISTS mobile_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      telegram_id text NOT NULL,
      telegram_chat_id text NOT NULL,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS mobile_sessions_user_id_idx ON mobile_sessions(user_id)",
    `CREATE TABLE IF NOT EXISTS mobile_voice_tickets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_hash text NOT NULL UNIQUE,
      mobile_session_id uuid NOT NULL REFERENCES mobile_sessions(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS mobile_voice_tickets_expiry_idx ON mobile_voice_tickets(expires_at)",
    `CREATE TABLE IF NOT EXISTS mobile_login_challenges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nonce_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS mobile_login_challenges_expiry_idx ON mobile_login_challenges(expires_at)",
    "CREATE INDEX IF NOT EXISTS memories_user_id_idx ON memories(user_id)",
    "ALTER TABLE memories ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'fact'",
    "ALTER TABLE memories ADD COLUMN IF NOT EXISTS subject text",
    "ALTER TABLE memories ADD COLUMN IF NOT EXISTS predicate text",
    "ALTER TABLE memories ADD COLUMN IF NOT EXISTS object text",
    "ALTER TABLE memories ADD COLUMN IF NOT EXISTS confidence integer NOT NULL DEFAULT 80",
    "ALTER TABLE memories ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user'",
    "ALTER TABLE memories ADD COLUMN IF NOT EXISTS expires_at timestamptz",
    "ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz",
    "CREATE INDEX IF NOT EXISTS memories_context_idx ON memories(user_id, kind, updated_at)",
    "CREATE INDEX IF NOT EXISTS academic_profiles_user_id_idx ON academic_profiles(user_id)",
    "CREATE INDEX IF NOT EXISTS academic_documents_user_id_idx ON academic_documents(user_id)",
    "CREATE INDEX IF NOT EXISTS academic_documents_course_idx ON academic_documents(user_id, course)",
    `CREATE INDEX IF NOT EXISTS academic_documents_native_search_idx ON academic_documents USING GIN ((
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(course, '')), 'B') ||
      to_tsvector('english', coalesce(extracted_text, ''))
    ))`,
    `UPDATE academic_documents
      SET status = 'indexed', error = NULL
      WHERE extracted_text IS NOT NULL
        AND status IN ('extracted', 'indexing', 'extracted_index_failed')`,
    `CREATE INDEX IF NOT EXISTS memories_native_search_idx ON memories USING GIN ((
      setweight(to_tsvector('english', coalesce(content, '')), 'A') ||
      setweight(
        to_tsvector('english', coalesce(subject, '') || ' ' || coalesce(predicate, '') || ' ' || coalesce(object, '')),
        'B'
      )
    ))`,
    "CREATE INDEX IF NOT EXISTS timetable_entries_user_id_idx ON timetable_entries(user_id)",
    "CREATE INDEX IF NOT EXISTS timetable_entries_schedule_idx ON timetable_entries(user_id, day_of_week, start_time)",
    "CREATE INDEX IF NOT EXISTS assessments_user_id_idx ON assessments(user_id)",
    "CREATE INDEX IF NOT EXISTS assessments_due_idx ON assessments(user_id, due_at)",
    "ALTER TABLE scheduled_jobs ADD COLUMN IF NOT EXISTS recurrence text",
    "ALTER TABLE scheduled_jobs ADD COLUMN IF NOT EXISTS timezone text",
    "CREATE INDEX IF NOT EXISTS scheduled_jobs_run_at_idx ON scheduled_jobs(run_at)",
    "CREATE INDEX IF NOT EXISTS workflows_user_id_idx ON workflows(user_id)",
    "CREATE INDEX IF NOT EXISTS workflows_due_idx ON workflows(status, run_at)",
    "CREATE INDEX IF NOT EXISTS workflow_runs_workflow_id_idx ON workflow_runs(workflow_id)",
    "ALTER TABLE workflows ADD COLUMN IF NOT EXISTS max_runs integer",
    "ALTER TABLE workflows ADD COLUMN IF NOT EXISTS until_at timestamptz",
    `CREATE TABLE IF NOT EXISTS approval_grants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      telegram_id text NOT NULL,
      provider text NOT NULL,
      scope text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS pending_approvals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      telegram_id text NOT NULL,
      provider text NOT NULL,
      operation text NOT NULL,
      arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
      summary text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      result jsonb,
      error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz
    )`,
    "CREATE INDEX IF NOT EXISTS approval_grants_user_provider_idx ON approval_grants(telegram_id, provider)",
    "CREATE INDEX IF NOT EXISTS approval_grants_scope_idx ON approval_grants(telegram_id, provider, scope)",
    "CREATE INDEX IF NOT EXISTS pending_approvals_user_status_idx ON pending_approvals(telegram_id, status)",

    // Self-improvement foundations (Grok-Self-Improvement-3.6)
    `CREATE TABLE IF NOT EXISTS trajectories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
      request_summary text NOT NULL,
      domains jsonb NOT NULL DEFAULT '[]'::jsonb,
      steps jsonb NOT NULL DEFAULT '[]'::jsonb,
      outcome text NOT NULL DEFAULT 'success',
      reusable boolean NOT NULL DEFAULT false,
      skill_id uuid,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS trajectories_user_id_idx ON trajectories(user_id)",
    "CREATE INDEX IF NOT EXISTS trajectories_outcome_idx ON trajectories(user_id, outcome)",
    "CREATE INDEX IF NOT EXISTS trajectories_created_idx ON trajectories(user_id, created_at)",
    `CREATE TABLE IF NOT EXISTS learned_skills (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text NOT NULL,
      description text NOT NULL,
      body text NOT NULL,
      domain text NOT NULL DEFAULT 'general',
      status text NOT NULL DEFAULT 'proposed',
      success_count integer NOT NULL DEFAULT 0,
      source_trajectory_id uuid REFERENCES trajectories(id) ON DELETE SET NULL,
      project_id uuid,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      accepted_at timestamptz
    )`,
    "CREATE INDEX IF NOT EXISTS learned_skills_user_id_idx ON learned_skills(user_id)",
    "CREATE INDEX IF NOT EXISTS learned_skills_status_idx ON learned_skills(user_id, status)",
    "CREATE UNIQUE INDEX IF NOT EXISTS learned_skills_user_name_idx ON learned_skills(user_id, name)",
    `CREATE TABLE IF NOT EXISTS agency_projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text NOT NULL,
      domain text NOT NULL DEFAULT 'general',
      description text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'active',
      horizon_years integer,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS agency_projects_user_id_idx ON agency_projects(user_id)",
    "CREATE INDEX IF NOT EXISTS agency_projects_domain_idx ON agency_projects(user_id, domain)",
    `CREATE TABLE IF NOT EXISTS agency_claims (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES agency_projects(id) ON DELETE CASCADE,
      statement text NOT NULL,
      status text NOT NULL DEFAULT 'open',
      evidence_summary text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS agency_claims_user_id_idx ON agency_claims(user_id)",
    "CREATE INDEX IF NOT EXISTS agency_claims_project_idx ON agency_claims(project_id)",
    `CREATE TABLE IF NOT EXISTS agency_constraints (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id uuid REFERENCES agency_projects(id) ON DELETE CASCADE,
      statement text NOT NULL,
      strength text NOT NULL DEFAULT 'soft',
      domain text NOT NULL DEFAULT 'general',
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS agency_constraints_user_id_idx ON agency_constraints(user_id)",
    "CREATE INDEX IF NOT EXISTS agency_constraints_project_idx ON agency_constraints(project_id)"
  ];

  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
  console.info("Neon database schema is ready.");
}
