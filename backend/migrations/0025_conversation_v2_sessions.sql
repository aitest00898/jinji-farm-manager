-- Short-lived, per-user conversation control-plane state.
-- This stores only routing context and bounded result summaries; it is not a
-- transcript archive and does not replace Candidate or Quick Record state.
CREATE TABLE IF NOT EXISTS conversation_v2_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  active_object_type TEXT CHECK (active_object_type IS NULL OR active_object_type IN ('candidate', 'daily_review', 'quick_record')),
  active_object_id TEXT,
  last_goal TEXT,
  last_topic TEXT,
  last_action TEXT,
  last_tool TEXT,
  last_tool_result_summary TEXT,
  last_explained_issue TEXT,
  last_referenced_field TEXT,
  turn_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_v2_session_scope
  ON conversation_v2_sessions (organization_id, line_group_id, line_user_id);

CREATE INDEX IF NOT EXISTS idx_conversation_v2_session_expiry
  ON conversation_v2_sessions (line_group_id, line_user_id, expires_at);
