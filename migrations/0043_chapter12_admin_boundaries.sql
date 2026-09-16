-- Chapter 12 additive operational boundaries.
-- Existing business facts and audit rows are retained.  This migration adds
-- explicit soft-delete identity, close-only Web session metadata, and
-- confirmation records for multi-item administrative previews.

ALTER TABLE farms ADD COLUMN deleted_at TEXT;
ALTER TABLE houses ADD COLUMN deleted_at TEXT;

ALTER TABLE web_admin_sessions ADD COLUMN client_closed_at TEXT;
ALTER TABLE web_admin_sessions ADD COLUMN client_ip_hash TEXT;
ALTER TABLE web_admin_sessions ADD COLUMN client_user_agent_hash TEXT;
ALTER TABLE web_admin_sessions ADD COLUMN device_hint TEXT;

CREATE INDEX IF NOT EXISTS idx_farms_deleted_identity
  ON farms (organization_id, environment, deleted_at, active);

CREATE INDEX IF NOT EXISTS idx_houses_deleted_identity
  ON houses (farm_id, deleted_at, active);

CREATE INDEX IF NOT EXISTS idx_web_admin_sessions_client_state
  ON web_admin_sessions (organization_id, access_class, revoked_at, client_closed_at);

CREATE TABLE IF NOT EXISTS finance_admin_actions (
  id TEXT PRIMARY KEY,
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  operation TEXT NOT NULL CHECK (operation IN ('update', 'delete', 'batch')),
  payload_json TEXT NOT NULL,
  preview_json TEXT NOT NULL,
  warning_override INTEGER NOT NULL DEFAULT 0 CHECK (warning_override IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('waiting_confirmation', 'completed', 'cancelled', 'expired')),
  expires_at TEXT NOT NULL,
  source_event_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_finance_admin_actions_scope
  ON finance_admin_actions (line_group_id, line_user_id, status, expires_at, created_at);

CREATE TABLE IF NOT EXISTS master_admin_actions (
  id TEXT PRIMARY KEY,
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  operation TEXT NOT NULL CHECK (operation IN ('update', 'delete', 'restore', 'batch')),
  payload_json TEXT NOT NULL,
  preview_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting_confirmation', 'completed', 'cancelled', 'expired')),
  expires_at TEXT NOT NULL,
  source_event_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_master_admin_actions_scope
  ON master_admin_actions (line_group_id, line_user_id, status, expires_at, created_at);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0043', id, 'migration', 'migration', 'apply', 'schema',
       '0043_chapter12_admin_boundaries',
       '{"migration":"0043_chapter12_admin_boundaries"}',
       'chapter12_missing_requirements', 'migration-0043-chapter12'
  FROM organizations WHERE active = 1;
