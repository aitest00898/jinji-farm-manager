-- Additive foundation for a shared Yunlin weather scope and short-lived LINE
-- quick-record bundles. Existing farms, finance rows, operational rows, and
-- append-only audit history are not rewritten by this migration.

CREATE TABLE IF NOT EXISTS weather_scopes (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('county')),
  scope_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  country TEXT NOT NULL,
  latitude REAL NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude REAL NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  provider TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The point is the provider's Taiwan result whose administrative area is
-- Yunlin (Douliu, Taiwan), used only as the county weather representative.
-- It is not a farm location and must not be shown as one.
INSERT OR IGNORE INTO weather_scopes
  (id, scope_type, scope_key, label, country, latitude, longitude, provider)
VALUES
  ('weather-scope-yunlin-county-tw', 'county', 'yunlin-county-tw', '雲林縣', 'Taiwan', 23.70944, 120.54333, 'open-meteo');

CREATE TABLE IF NOT EXISTS weather_scope_daily (
  id TEXT PRIMARY KEY,
  weather_scope_id TEXT NOT NULL REFERENCES weather_scopes(id),
  weather_date TEXT NOT NULL,
  weather_condition TEXT,
  max_temperature_c REAL,
  max_temperature_at TEXT,
  min_temperature_c REAL,
  min_temperature_at TEXT,
  provider TEXT NOT NULL,
  fetch_status TEXT NOT NULL
    CHECK (fetch_status IN ('pending', 'captured', 'backfilled', 'failed')),
  error_code TEXT,
  fetched_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (weather_scope_id, weather_date)
);

CREATE INDEX IF NOT EXISTS idx_weather_scope_daily_date
  ON weather_scope_daily (weather_date, fetch_status, weather_scope_id);

CREATE TABLE IF NOT EXISTS quick_record_sessions (
  id TEXT PRIMARY KEY,
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  active_farm_id TEXT REFERENCES farms(id),
  active_house_id TEXT REFERENCES houses(id),
  active_flock_id TEXT REFERENCES flocks(id),
  pending_items_json TEXT NOT NULL DEFAULT '[]',
  pending_farm_candidates_json TEXT NOT NULL DEFAULT '[]',
  pending_status TEXT NOT NULL DEFAULT 'active'
    CHECK (pending_status IN ('active', 'waiting_farm', 'waiting_house', 'closed')),
  last_confirmed_bundle_id TEXT,
  last_activity_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (line_group_id, line_user_id)
);

CREATE INDEX IF NOT EXISTS idx_quick_record_sessions_expiry
  ON quick_record_sessions (line_group_id, line_user_id, pending_status, expires_at);

ALTER TABLE quick_record_sessions ADD COLUMN pending_correction_json TEXT;

CREATE TABLE IF NOT EXISTS quick_record_bundles (
  id TEXT PRIMARY KEY,
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  farm_id TEXT NOT NULL REFERENCES farms(id),
  house_id TEXT REFERENCES houses(id),
  flock_id TEXT REFERENCES flocks(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'reversed', 'corrected', 'moved', 'split')),
  opened_at TEXT NOT NULL,
  last_event_at TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quick_record_bundles_scope
  ON quick_record_bundles (line_group_id, line_user_id, confirmed_at, status);

CREATE TABLE IF NOT EXISTS quick_record_items (
  id TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL REFERENCES quick_record_bundles(id),
  item_index INTEGER NOT NULL CHECK (item_index >= 0),
  item_type TEXT NOT NULL CHECK (item_type IN ('operational', 'abnormal')),
  intent TEXT,
  raw_text TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  occurred_at TEXT NOT NULL,
  occurred_date TEXT NOT NULL,
  operational_event_id TEXT REFERENCES operational_events(id),
  abnormal_event_id TEXT REFERENCES abnormal_events(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'reversed', 'corrected', 'moved')),
  correction_of_item_id TEXT REFERENCES quick_record_items(id),
  source_event_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (bundle_id, item_index, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_quick_record_items_bundle
  ON quick_record_items (bundle_id, status, item_index);

ALTER TABLE operational_events ADD COLUMN quick_bundle_id TEXT REFERENCES quick_record_bundles(id);
ALTER TABLE abnormal_events ADD COLUMN quick_bundle_id TEXT REFERENCES quick_record_bundles(id);

CREATE INDEX IF NOT EXISTS idx_operational_events_quick_bundle
  ON operational_events (quick_bundle_id, reversed_at, created_at);
CREATE INDEX IF NOT EXISTS idx_abnormal_events_quick_bundle
  ON abnormal_events (quick_bundle_id, status, created_at);

INSERT OR IGNORE INTO audit_logs
  (id, organization_id, source, actor_type, action, entity_type, entity_id,
   after_json, reason, request_id)
SELECT 'audit-migration-0018', id, 'migration', 'migration', 'apply', 'schema',
       '0018_yunlin_weather_quick_records',
       '{"migration":"0018_yunlin_weather_quick_records","weatherScope":"yunlin-county-tw"}',
       'additive_yunlin_weather_and_quick_records',
       'migration-0018-yunlin-weather-quick-records'
  FROM organizations WHERE active = 1;
