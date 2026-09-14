-- Additive Chapter 2 trust boundary.
-- Existing groups remain denied until an authenticated administrative procedure
-- explicitly authorizes them. No existing operator/scope rows are deleted or
-- reinterpreted by this migration.
ALTER TABLE line_groups
  ADD COLUMN operational_authorized INTEGER NOT NULL DEFAULT 0
  CHECK (operational_authorized IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_line_groups_operational_authorization
  ON line_groups (organization_id, operational_authorized, status);
