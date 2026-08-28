-- Additive Conversation V2 safety trace metadata.
-- These fields explain the speech act and final write guard without storing
-- raw private text or model reasoning.

ALTER TABLE conversation_v2_traces ADD COLUMN speech_act TEXT;
ALTER TABLE conversation_v2_traces ADD COLUMN object_type TEXT;
ALTER TABLE conversation_v2_traces ADD COLUMN goal_guard TEXT;

CREATE INDEX IF NOT EXISTS idx_conversation_v2_traces_goal_guard
  ON conversation_v2_traces (goal_guard, created_at);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0030', id, 'migration', 'migration', 'apply', 'schema',
       '0030_conversation_safety_trace',
       '{"migration":"0030_conversation_safety_trace"}',
       'persist_speech_act_object_type_goal_guard',
       'migration-0030-conversation-safety-trace'
  FROM organizations WHERE active = 1;
