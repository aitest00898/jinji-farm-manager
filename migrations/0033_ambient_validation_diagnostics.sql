-- Additive, bounded diagnostics for Ambient validation failures.
-- These columns store only structural names, types, paths, bounded issue
-- codes, and allowlisted technical enum tokens. They never store AI output,
-- prompts, source text, user ids, secrets, or reasoning.
ALTER TABLE ambient_digest_runs ADD COLUMN validation_root_kind TEXT;
ALTER TABLE ambient_digest_runs ADD COLUMN validation_envelope_kind TEXT;
ALTER TABLE ambient_digest_runs ADD COLUMN validation_candidate_count INTEGER;
ALTER TABLE ambient_digest_runs ADD COLUMN validation_issue_count INTEGER;
ALTER TABLE ambient_digest_runs ADD COLUMN validation_first_issue_code TEXT;
ALTER TABLE ambient_digest_runs ADD COLUMN validation_first_issue_path TEXT;
ALTER TABLE ambient_digest_runs ADD COLUMN validation_first_expected_type TEXT;
ALTER TABLE ambient_digest_runs ADD COLUMN validation_first_actual_type TEXT;
ALTER TABLE ambient_digest_runs ADD COLUMN validation_failed_candidate_index INTEGER;
ALTER TABLE ambient_digest_runs ADD COLUMN validation_structural_keys_json TEXT;
ALTER TABLE ambient_digest_runs ADD COLUMN validation_issue_summary_json TEXT;
ALTER TABLE ambient_digest_runs ADD COLUMN validation_safe_enum_actual TEXT;

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0033', id, 'migration', 'migration', 'apply', 'schema',
       '0033_ambient_validation_diagnostics',
       '{"migration":"0033_ambient_validation_diagnostics"}',
       'bounded_ambient_validation_diagnostics',
       'migration-0033-ambient-validation-diagnostics'
  FROM organizations WHERE active = 1;
