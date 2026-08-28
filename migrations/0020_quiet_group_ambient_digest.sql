-- Additive, short-lived storage for Quiet Group Mode.
-- Ambient messages are candidate input only; they are never an operational,
-- abnormal, finance, or audit ledger row. Official writes continue through
-- the existing Quick Record / Resolver / Audit path after human confirmation.

CREATE TABLE IF NOT EXISTS ambient_chat_buffer (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  line_message_id TEXT NOT NULL UNIQUE,
  event_timestamp TEXT NOT NULL,
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  digest_hour TEXT NOT NULL,
  digest_status TEXT NOT NULL DEFAULT 'buffered'
    CHECK (digest_status IN ('buffered', 'processed', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_ambient_chat_buffer_digest
  ON ambient_chat_buffer (organization_id, line_group_id, digest_hour, digest_status, event_timestamp);

CREATE INDEX IF NOT EXISTS idx_ambient_chat_buffer_expiry
  ON ambient_chat_buffer (expires_at, digest_status);

CREATE TABLE IF NOT EXISTS ambient_digest_candidates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  hour_bucket TEXT NOT NULL,
  candidate_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'ignored', 'snoozed', 'expired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  confirmed_by TEXT,
  confirmed_at TEXT,
  snoozed_until TEXT,
  UNIQUE (line_group_id, hour_bucket)
);

CREATE INDEX IF NOT EXISTS idx_ambient_digest_candidates_scope
  ON ambient_digest_candidates (organization_id, line_group_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_ambient_digest_candidates_expiry
  ON ambient_digest_candidates (expires_at, status);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0020', id, 'migration', 'migration', 'apply', 'schema',
       '0020_quiet_group_ambient_digest',
       '{"migration":"0020_quiet_group_ambient_digest"}',
       'additive_quiet_group_ambient_digest',
       'migration-0020-quiet-group-ambient-digest'
  FROM organizations WHERE active = 1;
