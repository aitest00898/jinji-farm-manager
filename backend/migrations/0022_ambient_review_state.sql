-- Narrow, expiring state for the group member who explicitly chose to
-- modify one candidate item. This is not a generic workflow engine.
ALTER TABLE ambient_digest_candidates ADD COLUMN review_user_id TEXT;
ALTER TABLE ambient_digest_candidates ADD COLUMN review_kind TEXT
  CHECK (review_kind IS NULL OR review_kind IN ('item_modify', 'conflict_quantity'));
ALTER TABLE ambient_digest_candidates ADD COLUMN review_candidate_index INTEGER;
ALTER TABLE ambient_digest_candidates ADD COLUMN review_expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_ambient_digest_candidates_review
  ON ambient_digest_candidates (line_group_id, review_user_id, review_expires_at, status);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0022', id, 'migration', 'migration', 'apply', 'schema',
       '0022_ambient_review_state',
       '{"migration":"0022_ambient_review_state"}',
       'additive_ambient_review_state',
       'migration-0022-ambient-review-state'
  FROM organizations WHERE active = 1;
