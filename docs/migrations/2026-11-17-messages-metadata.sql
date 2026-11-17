-- NallyHermes: messages.metadata for mobile sources + thinking
-- Safe to run multiple times on Postgres / Neon.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN messages.metadata IS 'Structured sources and thinking trace for mobile / rich clients';
