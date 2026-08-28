-- Reliability close-out. Additive only: no existing migration is edited and no
-- official operational data is removed. These fields separate ingress,
-- business completion, and reply delivery, and provide a fenced owner for
-- automatic/manual recovery races.

ALTER TABLE line_events ADD COLUMN first_received_at TEXT;
ALTER TABLE line_events ADD COLUMN last_received_at TEXT;
ALTER TABLE line_events ADD COLUMN receive_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE line_events ADD COLUMN redelivery_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE line_events ADD COLUMN enqueue_attempted_at TEXT;
ALTER TABLE line_events ADD COLUMN processing_owner TEXT;
ALTER TABLE line_events ADD COLUMN processing_lease_until TEXT;
ALTER TABLE line_events ADD COLUMN business_started_at TEXT;
ALTER TABLE line_events ADD COLUMN business_outcome TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE line_events ADD COLUMN reply_owner TEXT;
ALTER TABLE line_events ADD COLUMN reply_lease_until TEXT;
ALTER TABLE line_events ADD COLUMN reply_delivery_mode TEXT;
ALTER TABLE line_events ADD COLUMN reply_outcome TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE line_events ADD COLUMN reply_last_http_status INTEGER;
ALTER TABLE line_events ADD COLUMN reply_last_request_id TEXT;
ALTER TABLE line_events ADD COLUMN reply_retry_key TEXT;
ALTER TABLE line_events ADD COLUMN reply_uncertain_at TEXT;
ALTER TABLE line_events ADD COLUMN reply_notice_id TEXT;
ALTER TABLE line_events ADD COLUMN reply_notice_payload_json TEXT;
ALTER TABLE line_events ADD COLUMN reply_notice_retry_key TEXT;
ALTER TABLE line_events ADD COLUMN reply_notice_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE line_events ADD COLUMN reply_notice_sent_at TEXT;
ALTER TABLE line_events ADD COLUMN redisplay_retry_key TEXT;
ALTER TABLE line_events ADD COLUMN redisplay_expires_at TEXT;
ALTER TABLE line_events ADD COLUMN retained_acknowledged_at TEXT;
ALTER TABLE line_events ADD COLUMN retained_acknowledged_by TEXT;

-- The old 0027 backfill could prove that these rows had a processed_at value,
-- but it could not prove that LINE accepted a reply. Do not represent that
-- historical uncertainty as a successful delivery.
UPDATE line_events
   SET first_received_at = COALESCE(first_received_at, received_at),
       last_received_at = COALESCE(last_received_at, received_at),
       business_outcome = CASE
         WHEN business_status = 'completed' THEN 'completed'
         ELSE 'pending'
       END,
       reply_outcome = CASE
         WHEN reply_status = 'not_required' THEN 'not_required'
         WHEN lifecycle_status = 'reply_completed' AND reply_attempted_at IS NULL THEN 'legacy_unknown'
         WHEN reply_status = 'sent' THEN 'sent'
         ELSE 'pending'
       END
 WHERE first_received_at IS NULL
    OR last_received_at IS NULL
    OR business_outcome = 'pending'
    OR reply_outcome = 'pending';

UPDATE line_events
   SET first_received_at = COALESCE(first_received_at, received_at),
       last_received_at = COALESCE(last_received_at, received_at),
       receive_count = COALESCE(receive_count, 1),
       payload_expires_at = COALESCE(payload_expires_at, strftime('%Y-%m-%dT%H:%M:%fZ', received_at, '+24 hours'))
 WHERE first_received_at IS NULL
    OR last_received_at IS NULL
    OR payload_expires_at IS NULL;

CREATE TABLE IF NOT EXISTS line_event_delivery_attempts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  delivery_stage TEXT NOT NULL CHECK (delivery_stage IN ('reply', 'push', 'uncertain_notice', 'redisplay')),
  delivery_mode TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  owner TEXT,
  outcome TEXT NOT NULL,
  http_status INTEGER,
  line_request_id TEXT,
  error_class TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_line_event_delivery_event
  ON line_event_delivery_attempts (event_id, started_at);
CREATE INDEX IF NOT EXISTS idx_line_event_delivery_expiry
  ON line_event_delivery_attempts (expires_at);
CREATE INDEX IF NOT EXISTS idx_line_events_recovery_owner
  ON line_events (recovery_owner, recovery_lease_until);
CREATE INDEX IF NOT EXISTS idx_line_events_reply_owner
  ON line_events (reply_owner, reply_lease_until);
CREATE INDEX IF NOT EXISTS idx_line_events_receive_lifecycle
  ON line_events (first_received_at, lifecycle_status);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0028', id, 'migration', 'migration', 'apply', 'schema',
       '0028_line_reliability_closeout',
       '{"migration":"0028_line_reliability_closeout"}',
       'separate_reply_delivery_and_recovery_state',
       'migration-0028-line-reliability-closeout'
  FROM organizations WHERE active = 1;
