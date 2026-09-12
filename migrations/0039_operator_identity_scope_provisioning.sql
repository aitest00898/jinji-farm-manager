-- Minimal operator provisioning contract for the first Production pilot.
-- Authentication remains owned by the existing Web session and LINE identity
-- paths. This migration stores only identity-to-scope bindings; it does not
-- store passwords, tokens, or a second authorization framework.

CREATE TABLE IF NOT EXISTS operator_identities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  identity_type TEXT NOT NULL CHECK (identity_type IN ('line_user', 'web_admin')),
  identity_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, identity_type, identity_key)
);

CREATE INDEX IF NOT EXISTS idx_operator_identities_scope
  ON operator_identities (organization_id, identity_type, active, identity_key);

CREATE TABLE IF NOT EXISTS operator_scope_bindings (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES operator_identities(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'test')),
  farm_id TEXT NOT NULL REFERENCES farms(id),
  house_id TEXT REFERENCES houses(id),
  flock_id TEXT REFERENCES flocks(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (operator_id, environment, farm_id, house_id, flock_id)
);

CREATE INDEX IF NOT EXISTS idx_operator_scope_bindings_lookup
  ON operator_scope_bindings (operator_id, organization_id, environment, farm_id, active);
