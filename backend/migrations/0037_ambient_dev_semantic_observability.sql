-- Additive, development-only semantic observability for completed dry-runs.
-- The JSON is bounded structured metadata only: no raw source text, raw AI
-- completion, prompt, user/group identifiers, secrets, or reasoning.
-- It does not change Candidate, source, retention, or official business data.
ALTER TABLE ambient_digest_runs ADD COLUMN dev_semantic_summary_json TEXT;

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0037', id, 'migration', 'migration', 'apply', 'schema',
       '0037_ambient_dev_semantic_observability',
       '{"migration":"0037_ambient_dev_semantic_observability"}',
       'additive_ambient_dev_semantic_observability',
       'migration-0037-ambient-dev-semantic-observability'
  FROM organizations WHERE active = 1;
