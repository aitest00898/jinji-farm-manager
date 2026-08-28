-- Additive farm-management authorization state.
-- Passwords and password verifiers are never stored in D1; the verifier lives
-- only in the Worker Secret Store.
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_scope
  ON admin_sessions (line_group_id, line_user_id, expires_at, last_used_at);

CREATE TABLE IF NOT EXISTS admin_auth_attempts (
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  locked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (line_group_id, line_user_id)
);

CREATE TABLE IF NOT EXISTS farm_admin_actions (
  id TEXT PRIMARY KEY,
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  intent TEXT NOT NULL CHECK (intent IN ('create_farm', 'archive_farm', 'create_test_farm', 'archive_test_farm')),
  farm_name TEXT NOT NULL,
  farm_id TEXT REFERENCES farms(id),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'test')),
  status TEXT NOT NULL CHECK (status IN ('waiting_password', 'waiting_confirmation', 'completed', 'cancelled', 'expired')),
  expires_at TEXT NOT NULL,
  source_event_id TEXT NOT NULL UNIQUE,
  cancel_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_farm_admin_actions_scope
  ON farm_admin_actions (line_group_id, line_user_id, status, expires_at, created_at);

CREATE INDEX IF NOT EXISTS idx_farm_admin_actions_farm
  ON farm_admin_actions (organization_id, farm_id, intent, status);
