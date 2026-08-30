-- Additive, metadata-only lifecycle evidence for each Ambient scheduled/manual
-- run scoped to one organization and LINE group. This table is deliberately
-- separate from ambient_chat_buffer: it never changes source-buffer semantics.
-- It stores counts, bounded statuses, timestamps, and safe error classes only.
CREATE TABLE IF NOT EXISTS ambient_digest_runs (
  run_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  scheduled_for TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('cron', 'manual')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  run_started_at TEXT NOT NULL,
  lease_status TEXT NOT NULL DEFAULT 'not_attempted'
    CHECK (lease_status IN ('not_attempted', 'acquired', 'busy', 'failed', 'released')),
  lease_acquired_at TEXT,
  source_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (source_status IN ('not_started', 'success', 'empty', 'failed')),
  source_selected_at TEXT,
  source_count INTEGER NOT NULL DEFAULT 0,
  prefilter_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (prefilter_status IN ('not_started', 'candidate_like', 'zero', 'failed')),
  prefilter_completed_at TEXT,
  prefilter_count INTEGER NOT NULL DEFAULT 0,
  ai_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (ai_status IN ('not_started', 'success', 'failed', 'timeout', 'schema_invalid')),
  ai_started_at TEXT,
  ai_completed_at TEXT,
  validation_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (validation_status IN ('not_started', 'success', 'rejected', 'failed')),
  validation_completed_at TEXT,
  validation_count INTEGER NOT NULL DEFAULT 0,
  reconcile_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (reconcile_status IN ('not_started', 'running', 'success', 'empty', 'failed')),
  reconcile_started_at TEXT,
  reconcile_completed_at TEXT,
  reconcile_count INTEGER NOT NULL DEFAULT 0,
  candidate_write_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (candidate_write_status IN ('not_started', 'running', 'none_required', 'success', 'failed')),
  candidate_write_started_at TEXT,
  candidate_write_completed_at TEXT,
  candidate_created_count INTEGER NOT NULL DEFAULT 0,
  buffer_consume_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (buffer_consume_status IN ('not_started', 'running', 'not_reached', 'none_required', 'success', 'partial', 'failed')),
  buffer_consume_started_at TEXT,
  buffer_consume_completed_at TEXT,
  processed_count INTEGER NOT NULL DEFAULT 0,
  delivery_status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (delivery_status IN ('not_requested', 'sent', 'failed')),
  run_status TEXT NOT NULL DEFAULT 'created'
    CHECK (run_status IN ('created', 'running', 'busy', 'completed', 'failed')),
  error_stage TEXT,
  error_class TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  UNIQUE (organization_id, line_group_id, scheduled_for, trigger_type)
);

CREATE INDEX IF NOT EXISTS idx_ambient_digest_runs_schedule
  ON ambient_digest_runs (organization_id, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_ambient_digest_runs_group_schedule
  ON ambient_digest_runs (line_group_id, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_ambient_digest_runs_status
  ON ambient_digest_runs (run_status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_ambient_digest_runs_retention
  ON ambient_digest_runs (expires_at);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0032', id, 'migration', 'migration', 'apply', 'schema',
       '0032_ambient_digest_run_observability',
       '{"migration":"0032_ambient_digest_run_observability"}',
       'additive_ambient_digest_stage_observability',
       'migration-0032-ambient-digest-run-observability'
  FROM organizations WHERE active = 1;
