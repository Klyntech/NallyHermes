-- Continuity P0–P4: run against Neon/Postgres for v4
CREATE TABLE IF NOT EXISTS activity_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_id text NOT NULL,
  channel text NOT NULL DEFAULT 'telegram',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  activity_date text NOT NULL,
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_intent text NOT NULL,
  nally_action text,
  outcome text NOT NULL DEFAULT 'answered',
  refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_episodes_user_time_idx ON activity_episodes (user_id, occurred_at);
CREATE INDEX IF NOT EXISTS activity_episodes_user_date_idx ON activity_episodes (user_id, activity_date);
CREATE INDEX IF NOT EXISTS activity_episodes_telegram_time_idx ON activity_episodes (telegram_id, occurred_at);

CREATE TABLE IF NOT EXISTS activity_week_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_id text NOT NULL,
  week_start text NOT NULL,
  week_end text NOT NULL,
  episode_count integer NOT NULL DEFAULT 0,
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text NOT NULL,
  day_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_week_user_start_idx ON activity_week_summaries (user_id, week_start);
CREATE INDEX IF NOT EXISTS activity_week_telegram_start_idx ON activity_week_summaries (telegram_id, week_start);

CREATE TABLE IF NOT EXISTS user_working_state (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  telegram_id text NOT NULL UNIQUE,
  active_projects jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_loops jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
