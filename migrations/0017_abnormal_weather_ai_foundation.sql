-- Additive foundation for minimalist abnormal-event recording, one-row-per-day
-- weather summaries, and read-only AI analysis caches.
-- Existing operational, finance, farm, LINE, and audit history is untouched.

ALTER TABLE farms ADD COLUMN latitude REAL
  CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
ALTER TABLE farms ADD COLUMN longitude REAL
  CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));

CREATE TABLE IF NOT EXISTS abnormal_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  farm_id TEXT NOT NULL REFERENCES farms(id),
  house_id TEXT REFERENCES houses(id),
  flock_id TEXT REFERENCES flocks(id),
  occurred_at TEXT,
  occurred_date TEXT NOT NULL,
  approximate_period TEXT CHECK (approximate_period IS NULL OR approximate_period IN ('morning', 'afternoon', 'evening', 'night')),
  reported_at TEXT NOT NULL,
  raw_text TEXT NOT NULL CHECK (length(raw_text) BETWEEN 1 AND 2000),
  source TEXT NOT NULL CHECK (source IN ('line', 'web', 'system')),
  actor_id TEXT,
  ai_category TEXT CHECK (ai_category IS NULL OR ai_category IN (
    'health', 'equipment', 'environment', 'weather_disaster', 'feed', 'water',
    'biosecurity', 'operation', 'logistics', 'structure', 'system', 'other'
  )),
  ai_tags_json TEXT,
  ai_confidence REAL CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  classification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (classification_status IN ('pending', 'classified', 'skipped', 'failed')),
  weather_date TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'reversed', 'corrected', 'reversal')),
  correction_of_id TEXT REFERENCES abnormal_events(id),
  reversal_of_id TEXT REFERENCES abnormal_events(id),
  reason TEXT,
  source_event_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_abnormal_events_scope_time
  ON abnormal_events (organization_id, farm_id, house_id, flock_id, occurred_date, created_at);
CREATE INDEX IF NOT EXISTS idx_abnormal_events_category
  ON abnormal_events (organization_id, ai_category, classification_status, occurred_date);
CREATE INDEX IF NOT EXISTS idx_abnormal_events_links
  ON abnormal_events (correction_of_id, reversal_of_id, status);

CREATE TABLE IF NOT EXISTS abnormal_pending_actions (
  id TEXT PRIMARY KEY,
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  raw_text TEXT NOT NULL CHECK (length(raw_text) BETWEEN 1 AND 2000),
  reported_at TEXT NOT NULL,
  occurred_at TEXT,
  occurred_date TEXT NOT NULL,
  approximate_period TEXT CHECK (approximate_period IS NULL OR approximate_period IN ('morning', 'afternoon', 'evening', 'night')),
  farm_id TEXT REFERENCES farms(id),
  house_id TEXT REFERENCES houses(id),
  candidate_farms_json TEXT NOT NULL DEFAULT '[]',
  candidate_houses_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('waiting_farm', 'waiting_house', 'completed', 'cancelled', 'expired')),
  expires_at TEXT NOT NULL,
  source_event_id TEXT NOT NULL UNIQUE,
  completed_event_id TEXT REFERENCES abnormal_events(id),
  cancel_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_abnormal_pending_scope
  ON abnormal_pending_actions (line_group_id, line_user_id, status, expires_at, created_at);

CREATE TABLE IF NOT EXISTS line_operational_contexts (
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  farm_id TEXT NOT NULL REFERENCES farms(id),
  house_id TEXT REFERENCES houses(id),
  flock_id TEXT REFERENCES flocks(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (line_group_id, line_user_id)
);

CREATE INDEX IF NOT EXISTS idx_line_operational_context_farm
  ON line_operational_contexts (organization_id, farm_id, house_id, updated_at);

CREATE TABLE IF NOT EXISTS weather_daily (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  weather_date TEXT NOT NULL,
  weather_condition TEXT,
  max_temperature_c REAL,
  max_temperature_at TEXT,
  min_temperature_c REAL,
  min_temperature_at TEXT,
  provider TEXT NOT NULL,
  fetch_status TEXT NOT NULL
    CHECK (fetch_status IN ('pending', 'captured', 'backfilled', 'failed', 'location_missing')),
  error_code TEXT,
  fetched_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (farm_id, weather_date)
);

CREATE INDEX IF NOT EXISTS idx_weather_daily_date
  ON weather_daily (weather_date, fetch_status, farm_id);

CREATE TABLE IF NOT EXISTS ai_briefs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('organization', 'farm', 'house', 'flock')),
  scope_id TEXT NOT NULL,
  brief_date TEXT NOT NULL,
  content_json TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  generated_through_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, scope_type, scope_id, brief_date, context_hash)
);

CREATE INDEX IF NOT EXISTS idx_ai_briefs_scope
  ON ai_briefs (organization_id, scope_type, scope_id, brief_date, created_at);

CREATE TABLE IF NOT EXISTS ai_reports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('organization', 'farm', 'house', 'flock', 'finance', 'trend')),
  scope_id TEXT NOT NULL,
  report_type TEXT NOT NULL,
  question TEXT NOT NULL CHECK (length(question) BETWEEN 1 AND 1000),
  content_json TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, scope_type, scope_id, report_type, context_hash)
);

CREATE INDEX IF NOT EXISTS idx_ai_reports_scope
  ON ai_reports (organization_id, scope_type, scope_id, created_at);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0017', id, 'migration', 'migration', 'apply', 'schema',
       '0017_abnormal_weather_ai_foundation',
       '{"migration":"0017_abnormal_weather_ai_foundation"}',
       'additive_abnormal_weather_ai_foundation',
       'migration-0017-abnormal-weather-ai'
  FROM organizations WHERE active = 1;
