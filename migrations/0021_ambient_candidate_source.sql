-- Keep the origin of an ambient candidate explicit for confirmation/audit
-- reads. Official writes still use the existing Quick Record business path.
ALTER TABLE ambient_digest_candidates
  ADD COLUMN source TEXT NOT NULL DEFAULT 'ambient_digest';

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0021', id, 'migration', 'migration', 'apply', 'schema',
       '0021_ambient_candidate_source',
       '{"migration":"0021_ambient_candidate_source"}',
       'additive_ambient_candidate_source',
       'migration-0021-ambient-candidate-source'
  FROM organizations WHERE active = 1;
