-- Candidate workflow history and deterministic Daily Operations Review state.
-- Candidate source rows and candidate workflow rows intentionally remain
-- separate: processing ambient chat never completes an open candidate.

ALTER TABLE ambient_digest_candidates ADD COLUMN terminal_reason TEXT;
ALTER TABLE ambient_digest_candidates ADD COLUMN terminal_raw_text TEXT;
ALTER TABLE ambient_digest_candidates ADD COLUMN workflow_history_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS daily_operations_reviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  review_type TEXT NOT NULL DEFAULT 'operations',
  local_date TEXT NOT NULL,
  snapshot_cutoff TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  context_expires_at TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sending', 'sent', 'failed')),
  delivery_owner TEXT,
  delivery_lease_until TEXT,
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  last_error_class TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, line_group_id, review_type, local_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_operations_reviews_delivery
  ON daily_operations_reviews (organization_id, line_group_id, local_date, delivery_status);

CREATE TABLE IF NOT EXISTS daily_review_contexts (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES daily_operations_reviews(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  context_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (line_group_id, line_user_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_review_contexts_active
  ON daily_review_contexts (line_group_id, line_user_id, expires_at);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0024', id, 'migration', 'migration', 'apply', 'schema',
       '0024_candidate_repair_daily_review',
       '{"migration":"0024_candidate_repair_daily_review"}',
       'additive_candidate_repair_daily_review',
       'migration-0024-candidate-repair-daily-review'
  FROM organizations WHERE active = 1;
