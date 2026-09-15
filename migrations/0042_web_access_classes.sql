-- Additive Web access-class metadata. Existing sessions remain ADMIN so the
-- current admin boundary is preserved while PUBLIC remains sessionless.
ALTER TABLE web_admin_sessions ADD COLUMN access_class TEXT NOT NULL DEFAULT 'ADMIN'
  CHECK (access_class IN ('ADMIN', 'SHARED_EDIT'));

CREATE INDEX IF NOT EXISTS idx_web_admin_sessions_access_class
  ON web_admin_sessions (access_class, expires_at, revoked_at);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0042', id, 'migration', 'migration', 'apply', 'schema',
       '0042_web_access_classes', '{"migration":"0042_web_access_classes"}',
       'web_access_class_boundary', 'migration-0042-web-access-classes'
  FROM organizations WHERE active = 1;
