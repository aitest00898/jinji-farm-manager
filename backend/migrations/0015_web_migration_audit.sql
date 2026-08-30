-- Record the additive Web schema rollout itself without fabricating historical
-- business mutations. Existing operational rows predate audit_logs and remain
-- unchanged; future LINE/Web/system mutations are logged by the Worker.
INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0013', id, 'migration', 'migration', 'apply', 'schema',
       '0013_web_management', '{"migration":"0013_web_management"}',
       'additive_web_management_schema', 'migration-0013-web-management'
  FROM organizations WHERE active = 1;

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0014', id, 'migration', 'migration', 'apply', 'schema',
       '0014_web_session_organization', '{"migration":"0014_web_session_organization"}',
       'additive_web_session_scope', 'migration-0014-web-session-organization'
  FROM organizations WHERE active = 1;
