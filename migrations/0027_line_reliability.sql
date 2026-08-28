-- Additive reliability state for LINE ingress, queue processing, business
-- completion, and reply delivery. Existing line_events remains the
-- idempotency ledger; these columns make its lifecycle explicit without
-- creating a second official-data store.

ALTER TABLE line_events ADD COLUMN correlation_id TEXT;
ALTER TABLE line_events ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'received';
ALTER TABLE line_events ADD COLUMN business_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE line_events ADD COLUMN reply_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE line_events ADD COLUMN queued_at TEXT;
ALTER TABLE line_events ADD COLUMN processing_started_at TEXT;
ALTER TABLE line_events ADD COLUMN business_completed_at TEXT;
ALTER TABLE line_events ADD COLUMN reply_attempted_at TEXT;
ALTER TABLE line_events ADD COLUMN reply_completed_at TEXT;
ALTER TABLE line_events ADD COLUMN queue_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE line_events ADD COLUMN processing_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE line_events ADD COLUMN reply_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE line_events ADD COLUMN last_error_stage TEXT;
ALTER TABLE line_events ADD COLUMN last_error_class TEXT;
ALTER TABLE line_events ADD COLUMN last_error_message TEXT;
ALTER TABLE line_events ADD COLUMN last_error_at TEXT;
ALTER TABLE line_events ADD COLUMN next_retry_at TEXT;
ALTER TABLE line_events ADD COLUMN reply_payload_json TEXT;
ALTER TABLE line_events ADD COLUMN payload_expires_at TEXT;
ALTER TABLE line_events ADD COLUMN delayed_notice_sent_at TEXT;
ALTER TABLE line_events ADD COLUMN recovery_owner TEXT;
ALTER TABLE line_events ADD COLUMN recovery_lease_until TEXT;
ALTER TABLE line_events ADD COLUMN retained_until TEXT;

-- Keep the same correlation id visible in Conversation V2 diagnostics when a
-- webhook was delivered through the Queue consumer.
ALTER TABLE conversation_v2_traces ADD COLUMN correlation_id TEXT;

UPDATE line_events
   SET lifecycle_status = 'reply_completed',
       business_status = 'completed',
       reply_status = 'sent',
       business_completed_at = COALESCE(business_completed_at, processed_at),
       reply_completed_at = COALESCE(reply_completed_at, processed_at),
       correlation_id = COALESCE(correlation_id, event_id),
       payload_expires_at = COALESCE(payload_expires_at, datetime(received_at, '+24 hours'))
 WHERE processed_at IS NOT NULL;

UPDATE line_events
   SET correlation_id = COALESCE(correlation_id, event_id),
       payload_expires_at = COALESCE(payload_expires_at, datetime(received_at, '+24 hours'))
 WHERE correlation_id IS NULL OR payload_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_line_events_lifecycle
  ON line_events (lifecycle_status, next_retry_at, received_at);

CREATE INDEX IF NOT EXISTS idx_line_events_correlation
  ON line_events (correlation_id);

CREATE INDEX IF NOT EXISTS idx_line_events_payload_expiry
  ON line_events (payload_expires_at, lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_conversation_v2_traces_correlation
  ON conversation_v2_traces (correlation_id);

CREATE TABLE IF NOT EXISTS line_event_recovery_audit (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'web_admin', 'line_admin')),
  actor_id TEXT,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  attempt INTEGER,
  error_stage TEXT,
  error_class TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_line_event_recovery_audit_event
  ON line_event_recovery_audit (event_id, created_at);

CREATE INDEX IF NOT EXISTS idx_line_event_recovery_audit_scope
  ON line_event_recovery_audit (actor_type, created_at);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0027', id, 'migration', 'migration', 'apply', 'schema',
       '0027_line_reliability',
       '{"migration":"0027_line_reliability"}',
       'additive_line_reliability_lifecycle',
       'migration-0027-line-reliability'
  FROM organizations WHERE active = 1;
