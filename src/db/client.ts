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
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
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
    "CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id)",
    "CREATE INDEX IF NOT EXISTS conversations_user_chat_idx ON conversations(user_id, telegram_chat_id)",
    "CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id)",
    "CREATE INDEX IF NOT EXISTS memories_user_id_idx ON memories(user_id)",
    "ALTER TABLE scheduled_jobs ADD COLUMN IF NOT EXISTS recurrence text",
    "ALTER TABLE scheduled_jobs ADD COLUMN IF NOT EXISTS timezone text",
    "CREATE INDEX IF NOT EXISTS scheduled_jobs_run_at_idx ON scheduled_jobs(run_at)"
    ,"CREATE INDEX IF NOT EXISTS workflows_user_id_idx ON workflows(user_id)"
    ,"CREATE INDEX IF NOT EXISTS workflows_due_idx ON workflows(status, run_at)"
    ,"CREATE INDEX IF NOT EXISTS workflow_runs_workflow_id_idx ON workflow_runs(workflow_id)"
  ];

  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
  console.info("Neon database schema is ready.");
}
