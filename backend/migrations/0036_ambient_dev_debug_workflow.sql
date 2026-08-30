-- Additive development-only Ambient debugging metadata.
-- This stores cohort/source references and bounded run state only. It never
-- copies raw LINE text, prompts, AI completions, secrets, or reasoning, and it
-- does not extend ambient_chat_buffer retention.

CREATE TABLE IF NOT EXISTS ambient_dev_sessions (
  session_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  authorized_actor_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'capturing'
    CHECK (status IN ('capturing', 'locked', 'ended', 'expired')),
  capture_started_at TEXT NOT NULL,
  locked_at TEXT,
  expires_at TEXT NOT NULL,
  commit_armed_at TEXT,
  latest_run_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ambient_dev_sessions_scope
  ON ambient_dev_sessions (organization_id, line_group_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_ambient_dev_sessions_expiry
  ON ambient_dev_sessions (expires_at, status);

CREATE TABLE IF NOT EXISTS ambient_dev_cohort_sources (
  session_id TEXT NOT NULL REFERENCES ambient_dev_sessions(session_id),
  source_message_id TEXT NOT NULL,
  source_event_timestamp TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, source_message_id)
);

CREATE INDEX IF NOT EXISTS idx_ambient_dev_cohort_sources_session
  ON ambient_dev_cohort_sources (session_id, source_event_timestamp);

-- Keep trigger_type compatible with existing cron/manual constraints. The
-- execution mode separates development dry-runs and explicitly confirmed
-- development commits without creating a third copy of the Ambient pipeline.
ALTER TABLE ambient_digest_runs ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'normal'
  CHECK (execution_mode IN ('normal', 'dev_dry_run', 'dev_commit'));
ALTER TABLE ambient_digest_runs ADD COLUMN dev_session_id TEXT;
ALTER TABLE ambient_digest_runs ADD COLUMN normalization_status TEXT NOT NULL DEFAULT 'not_started'
  CHECK (normalization_status IN ('not_started', 'not_reached', 'running', 'success', 'recovered', 'failed'));
ALTER TABLE ambient_digest_runs ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'not_started'
  CHECK (enrichment_status IN ('not_started', 'not_reached', 'running', 'success', 'failed'));
ALTER TABLE ambient_digest_runs ADD COLUMN resolve_status TEXT NOT NULL DEFAULT 'not_started'
  CHECK (resolve_status IN ('not_started', 'not_reached', 'running', 'success', 'failed'));
ALTER TABLE ambient_digest_runs ADD COLUMN first_bad_substage TEXT;
CREATE INDEX IF NOT EXISTS idx_ambient_digest_runs_dev_session
  ON ambient_digest_runs (dev_session_id, run_started_at);

ALTER TABLE ambient_digest_invocations ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'normal'
  CHECK (execution_mode IN ('normal', 'dev_dry_run', 'dev_commit'));
ALTER TABLE ambient_digest_invocations ADD COLUMN dev_session_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ambient_digest_invocations_dev_session
  ON ambient_digest_invocations (dev_session_id, run_started_at);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0036', id, 'migration', 'migration', 'apply', 'schema',
       '0036_ambient_dev_debug_workflow',
       '{"migration":"0036_ambient_dev_debug_workflow"}',
       'additive_ambient_development_debug_workflow',
       'migration-0036-ambient-dev-debug-workflow'
  FROM organizations WHERE active = 1;
