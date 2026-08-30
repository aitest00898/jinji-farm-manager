-- Additive Conversation V2 group rollout and routing observability.
-- Existing groups are closed by default. No Candidate, Farm, or user text can
-- grant access without this explicit group setting.

ALTER TABLE line_groups ADD COLUMN conversation_v2_enabled INTEGER NOT NULL DEFAULT 0 CHECK (conversation_v2_enabled IN (0, 1));

-- Keep the route decision durable beside the existing LINE idempotency ledger.
-- The JSON stores safe metadata only; it must never contain raw user text,
-- reply tokens, secrets, or model hidden reasoning.
ALTER TABLE line_events ADD COLUMN conversation_routing_json TEXT;

CREATE INDEX IF NOT EXISTS idx_line_groups_conversation_v2
  ON line_groups (organization_id, conversation_v2_enabled, status);

CREATE INDEX IF NOT EXISTS idx_line_events_conversation_routing
  ON line_events (correlation_id, conversation_routing_json);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0031', id, 'migration', 'migration', 'apply', 'schema',
       '0031_conversation_v2_group_rollout_observability',
       '{"migration":"0031_conversation_v2_group_rollout_observability"}',
       'group_v2_access_and_durable_routing_observability',
       'migration-0031-conversation-v2-group-rollout-observability'
  FROM organizations WHERE active = 1;
