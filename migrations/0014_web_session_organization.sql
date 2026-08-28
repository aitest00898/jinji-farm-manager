-- Additive Web session scope. Existing sessions, if any, remain valid and
-- receive no guessed organization; new sessions are scoped explicitly.
ALTER TABLE web_admin_sessions ADD COLUMN organization_id TEXT REFERENCES organizations(id);

CREATE INDEX IF NOT EXISTS idx_web_admin_sessions_organization
  ON web_admin_sessions (organization_id, expires_at, revoked_at);
