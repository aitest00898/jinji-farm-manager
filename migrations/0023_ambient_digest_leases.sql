-- Additive, per-organization/group lease for manual-vs-Cron Ambient digest
-- processing. A short lease prevents duplicate extraction while allowing a
-- crashed Worker to recover automatically after the lease expires.
CREATE TABLE IF NOT EXISTS ambient_digest_leases (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  owner_id TEXT NOT NULL,
  lease_until TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, line_group_id)
);

CREATE INDEX IF NOT EXISTS idx_ambient_digest_leases_expiry
  ON ambient_digest_leases (lease_until);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0023', id, 'migration', 'migration', 'apply', 'schema',
       '0023_ambient_digest_leases',
       '{"migration":"0023_ambient_digest_leases"}',
       'additive_ambient_digest_lease',
       'migration-0023-ambient-digest-leases'
  FROM organizations WHERE active = 1;
