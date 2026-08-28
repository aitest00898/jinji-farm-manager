-- Additive, bounded Ambient failure protection and invocation-level evidence.
-- This migration does not backfill, replay, or change any business record.

CREATE TABLE IF NOT EXISTS ambient_digest_invocations (
  invocation_id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('cron', 'manual')),
  scheduled_for TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  run_started_at TEXT NOT NULL,
  expiry_cleanup_started_at TEXT,
  expiry_cleanup_completed_at TEXT,
  expiry_rows_scanned INTEGER NOT NULL DEFAULT 0,
  expiry_rows_deleted INTEGER NOT NULL DEFAULT 0,
  expiry_candidate_like_count INTEGER NOT NULL DEFAULT 0,
  expiry_prefilter_excluded_count INTEGER NOT NULL DEFAULT 0,
  expiry_failure_retained_skipped_count INTEGER NOT NULL DEFAULT 0,
  expiry_expired_after_failure_retention_count INTEGER NOT NULL DEFAULT 0,
  groups_before_cleanup INTEGER NOT NULL DEFAULT 0,
  groups_after_cleanup INTEGER NOT NULL DEFAULT 0,
  per_group_runs_created INTEGER NOT NULL DEFAULT 0,
  failure_retention_candidates_considered INTEGER NOT NULL DEFAULT 0,
  failure_retention_rows_extended INTEGER NOT NULL DEFAULT 0,
  failure_retention_rows_already_guarded INTEGER NOT NULL DEFAULT 0,
  failure_retention_rows_max_expired INTEGER NOT NULL DEFAULT 0,
  invocation_status TEXT NOT NULL DEFAULT 'started'
    CHECK (invocation_status IN ('started', 'cleanup_running', 'group_discovery', 'processing_groups', 'completed', 'failed')),
  error_stage TEXT,
  error_class TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  UNIQUE (trigger_type, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_ambient_digest_invocations_schedule
  ON ambient_digest_invocations (scheduled_for);
CREATE INDEX IF NOT EXISTS idx_ambient_digest_invocations_status
  ON ambient_digest_invocations (invocation_status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_ambient_digest_invocations_retention
  ON ambient_digest_invocations (expires_at);

ALTER TABLE ambient_digest_runs ADD COLUMN invocation_id TEXT;
ALTER TABLE ambient_digest_runs ADD COLUMN failure_retention_candidates_considered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ambient_digest_runs ADD COLUMN failure_retention_rows_extended INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ambient_digest_runs ADD COLUMN failure_retention_rows_already_guarded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ambient_digest_runs ADD COLUMN failure_retention_rows_max_expired INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ambient_digest_runs_invocation
  ON ambient_digest_runs (invocation_id);

ALTER TABLE ambient_chat_buffer ADD COLUMN processing_failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ambient_chat_buffer ADD COLUMN last_processing_failure_stage TEXT;
ALTER TABLE ambient_chat_buffer ADD COLUMN last_processing_failure_at TEXT;
ALTER TABLE ambient_chat_buffer ADD COLUMN last_processing_failure_invocation_id TEXT;
ALTER TABLE ambient_chat_buffer ADD COLUMN failure_retained_until TEXT;

CREATE INDEX IF NOT EXISTS idx_ambient_chat_buffer_failure_retention
  ON ambient_chat_buffer (failure_retained_until, digest_status);

ALTER TABLE ambient_expiry_diagnostics ADD COLUMN processing_failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ambient_expiry_diagnostics ADD COLUMN last_failure_at TEXT;
ALTER TABLE ambient_expiry_diagnostics ADD COLUMN final_expiry_reason TEXT;

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0034', id, 'migration', 'migration', 'apply', 'schema',
       '0034_ambient_invocation_failure_retention',
       '{"migration":"0034_ambient_invocation_failure_retention"}',
       'ambient_invocation_observability_and_bounded_failure_retention',
       'migration-0034-ambient-invocation-failure-retention'
  FROM organizations WHERE active = 1;
