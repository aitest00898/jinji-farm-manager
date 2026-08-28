-- Additive completion pass for the bounded Conversation V2 control plane.
-- Candidate evidence remains inside candidate_json so existing candidate
-- lifecycle and official write paths are unchanged.

ALTER TABLE conversation_v2_sessions ADD COLUMN semantic_memory_json TEXT;

CREATE TABLE IF NOT EXISTS conversation_v2_traces (
  trace_id TEXT PRIMARY KEY,
  event_ref TEXT NOT NULL,
  event_fingerprint TEXT,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  line_group_safe_hash TEXT NOT NULL,
  line_user_safe_hash TEXT NOT NULL,
  session_id TEXT,
  active_object_type TEXT,
  active_object_id TEXT,
  v2_eligibility TEXT NOT NULL,
  planner_invoked INTEGER NOT NULL DEFAULT 0,
  planner_source TEXT,
  model TEXT,
  plan_valid INTEGER,
  goal TEXT,
  topic TEXT,
  requested_tools_json TEXT NOT NULL DEFAULT '[]',
  executed_tools_json TEXT NOT NULL DEFAULT '[]',
  tool_result_status TEXT,
  policy_level TEXT,
  response_strategy TEXT,
  renderer TEXT,
  mutation_level TEXT,
  candidate_mutation_count INTEGER NOT NULL DEFAULT 0,
  official_mutation_count INTEGER NOT NULL DEFAULT 0,
  audit_mutation_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error_class TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_v2_traces_scope
  ON conversation_v2_traces (organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_v2_traces_expiry
  ON conversation_v2_traces (expires_at);

CREATE TABLE IF NOT EXISTS ambient_expiry_diagnostics (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  source_fingerprint TEXT NOT NULL,
  original_event_timestamp TEXT NOT NULL,
  expired_at TEXT NOT NULL,
  last_digest_status TEXT NOT NULL,
  prefilter_result TEXT NOT NULL,
  last_failure_stage TEXT,
  candidate_created INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retain_until TEXT NOT NULL,
  UNIQUE (organization_id, line_group_id, source_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_ambient_expiry_diagnostics_scope
  ON ambient_expiry_diagnostics (organization_id, line_group_id, expired_at);
CREATE INDEX IF NOT EXISTS idx_ambient_expiry_diagnostics_retention
  ON ambient_expiry_diagnostics (retain_until);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0026', id, 'migration', 'migration', 'apply', 'schema',
       '0026_conversation_evidence_observability',
       '{"migration":"0026_conversation_evidence_observability"}',
       'additive_conversation_evidence_observability',
       'migration-0026-conversation-evidence-observability'
  FROM organizations WHERE active = 1;
