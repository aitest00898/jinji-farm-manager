-- Additive, short-lived semantic dedupe state for LINE Message Actions.
-- LINE webhookEventId already protects one redelivery. This table protects
-- repeated, distinct taps on the same semantic action without touching
-- operational, abnormal, correction, audit, or finance history.

CREATE TABLE IF NOT EXISTS line_semantic_action_locks (
  id TEXT PRIMARY KEY,
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  semantic_action_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed')),
  owner_event_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (line_group_id, line_user_id, semantic_action_key)
);

CREATE INDEX IF NOT EXISTS idx_line_semantic_action_locks_expiry
  ON line_semantic_action_locks (line_group_id, line_user_id, semantic_action_key, expires_at);
