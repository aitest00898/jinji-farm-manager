-- Bind a LINE group to an existing provisioned operator scope.
-- This is an association only: operator_scope_bindings remains the sole
-- authority for environment/farm/house/flock scope fields.

CREATE TABLE IF NOT EXISTS line_group_operator_bindings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  operator_id TEXT NOT NULL REFERENCES operator_identities(id),
  scope_binding_id TEXT NOT NULL REFERENCES operator_scope_bindings(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, line_group_id, operator_id, scope_binding_id)
);

CREATE INDEX IF NOT EXISTS idx_line_group_operator_bindings_lookup
  ON line_group_operator_bindings (organization_id, line_group_id, operator_id, active);

CREATE INDEX IF NOT EXISTS idx_line_group_operator_bindings_scope
  ON line_group_operator_bindings (scope_binding_id, active);
