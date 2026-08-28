-- Additive Test/Sandbox Farm support.
-- Existing production farms default to production; no existing finance or
-- operational rows are rewritten.
ALTER TABLE farms ADD COLUMN environment TEXT NOT NULL DEFAULT 'production'
  CHECK (environment IN ('production', 'test'));

ALTER TABLE pending_actions ADD COLUMN house TEXT;

CREATE INDEX IF NOT EXISTS idx_farms_environment
  ON farms (organization_id, environment, active, name);

CREATE TABLE IF NOT EXISTS test_farm_actions (
  id TEXT PRIMARY KEY,
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  intent TEXT NOT NULL CHECK (intent IN ('create_test_farm', 'archive_test_farm')),
  farm_name TEXT NOT NULL,
  farm_id TEXT REFERENCES farms(id),
  status TEXT NOT NULL CHECK (status IN ('waiting_confirmation', 'completed', 'cancelled', 'expired')),
  expires_at TEXT NOT NULL,
  source_event_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_test_farm_actions_scope
  ON test_farm_actions (line_group_id, line_user_id, status, expires_at, created_at);

CREATE INDEX IF NOT EXISTS idx_test_farm_actions_farm
  ON test_farm_actions (organization_id, farm_id, intent, status);
