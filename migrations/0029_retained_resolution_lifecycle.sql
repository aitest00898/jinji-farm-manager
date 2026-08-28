-- Retained message resolution is separate from acknowledgement.  Existing
-- line_events rows remain the durable history; this migration only adds
-- additive resolution metadata and indexes.

ALTER TABLE line_events ADD COLUMN resolution_status TEXT NOT NULL DEFAULT 'unresolved'
  CHECK (resolution_status IN ('unresolved', 'acknowledged', 'reprocessing', 'manually_resolved', 'manually_recorded', 'force_closed'));
ALTER TABLE line_events ADD COLUMN resolved_at TEXT;
ALTER TABLE line_events ADD COLUMN resolved_by TEXT;
ALTER TABLE line_events ADD COLUMN resolution_reason TEXT;
ALTER TABLE line_events ADD COLUMN resolution_note TEXT;
ALTER TABLE line_events ADD COLUMN manual_record_reference TEXT;

-- Preserve the meaning of the old acknowledgement marker without treating it
-- as a final resolution.  It remains visible as "已查看，但尚待決定".
UPDATE line_events
   SET resolution_status = 'acknowledged'
 WHERE lifecycle_status = 'retained'
   AND retained_acknowledged_at IS NOT NULL
   AND resolution_status = 'unresolved';

CREATE INDEX IF NOT EXISTS idx_line_events_resolution
  ON line_events (lifecycle_status, resolution_status, resolved_at);

CREATE INDEX IF NOT EXISTS idx_line_events_resolution_reference
  ON line_events (manual_record_reference);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0029', id, 'migration', 'migration', 'apply', 'schema',
       '0029_retained_resolution_lifecycle',
       '{"migration":"0029_retained_resolution_lifecycle"}',
       'separate_retained_acknowledgement_from_resolution',
       'migration-0029-retained-resolution'
  FROM organizations WHERE active = 1;
