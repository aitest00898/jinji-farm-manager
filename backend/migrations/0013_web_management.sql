-- Additive Web management foundation.
-- Legacy farm names, operational history, finance rows, and house/flock
-- constraints are retained. No existing row is rewritten by this migration.

CREATE TABLE IF NOT EXISTS caretakers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  note TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_caretakers_organization
  ON caretakers (organization_id, active, normalized_name);

CREATE TABLE IF NOT EXISTS farm_caretaker_assignments (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  caretaker_id TEXT NOT NULL REFERENCES caretakers(id),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  is_primary INTEGER NOT NULL DEFAULT 1 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_farm_caretaker_assignments_farm
  ON farm_caretaker_assignments (farm_id, effective_to, is_primary, effective_from);

CREATE INDEX IF NOT EXISTS idx_farm_caretaker_assignments_caretaker
  ON farm_caretaker_assignments (caretaker_id, effective_to, effective_from);

CREATE UNIQUE INDEX IF NOT EXISTS idx_farm_caretaker_current_primary
  ON farm_caretaker_assignments (farm_id)
  WHERE effective_to IS NULL AND is_primary = 1;

ALTER TABLE farms ADD COLUMN site_name TEXT;
ALTER TABLE farms ADD COLUMN farm_structure_mode TEXT NOT NULL DEFAULT 'whole_farm'
  CHECK (farm_structure_mode IN ('whole_farm', 'multi_house'));
ALTER TABLE farms ADD COLUMN note TEXT;
ALTER TABLE farms ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);

ALTER TABLE houses ADD COLUMN note TEXT;
ALTER TABLE houses ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);

ALTER TABLE flocks ADD COLUMN note TEXT;
ALTER TABLE flocks ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);

ALTER TABLE operational_events ADD COLUMN reversal_of_event_id TEXT REFERENCES operational_events(id);
ALTER TABLE operational_events ADD COLUMN correction_of_event_id TEXT REFERENCES operational_events(id);

CREATE INDEX IF NOT EXISTS idx_operational_events_reversal_link
  ON operational_events (reversal_of_event_id, correction_of_event_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  source TEXT NOT NULL CHECK (source IN ('line', 'web', 'system', 'migration')),
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  changed_fields_json TEXT,
  reason TEXT,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_time
  ON audit_logs (organization_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs (entity_type, entity_id, created_at, id);

CREATE TABLE IF NOT EXISTS web_admin_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  privileged_expires_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_web_admin_sessions_active
  ON web_admin_sessions (token_hash, expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS web_auth_attempts (
  scope_id TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  locked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
