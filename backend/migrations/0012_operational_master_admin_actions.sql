-- Additive, confirmation-gated master-data administration.
ALTER TABLE pending_actions ADD COLUMN candidate_houses_json TEXT;

CREATE TABLE IF NOT EXISTS operational_admin_actions (
  id TEXT PRIMARY KEY,
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  intent TEXT NOT NULL CHECK (intent IN ('create_house', 'create_flock')),
  farm_id TEXT NOT NULL REFERENCES farms(id),
  house_id TEXT REFERENCES houses(id),
  house_name TEXT NOT NULL,
  batch_code TEXT,
  breed TEXT,
  chick_in_date TEXT,
  initial_count INTEGER CHECK (initial_count IS NULL OR initial_count > 0),
  expected_shipment_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('waiting_password', 'waiting_confirmation', 'completed', 'cancelled', 'expired')),
  expires_at TEXT NOT NULL,
  source_event_id TEXT NOT NULL UNIQUE,
  cancel_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operational_admin_actions_scope
  ON operational_admin_actions (line_group_id, line_user_id, status, expires_at, created_at);

CREATE INDEX IF NOT EXISTS idx_operational_admin_actions_master
  ON operational_admin_actions (organization_id, farm_id, intent, status);
