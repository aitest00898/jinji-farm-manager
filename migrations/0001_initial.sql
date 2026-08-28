CREATE TABLE IF NOT EXISTS line_groups (
  group_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('unbound', 'bound', 'left')),
  farm_name TEXT,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bound_at TEXT,
  left_at TEXT
);

CREATE TABLE IF NOT EXISTS line_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  group_id TEXT,
  received_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  record_date TEXT NOT NULL,
  house TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('mortality', 'inventory')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  actor_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_rollups (
  group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  record_date TEXT NOT NULL,
  house TEXT NOT NULL,
  mortality_count INTEGER NOT NULL DEFAULT 0,
  latest_inventory INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, record_date, house)
);

CREATE INDEX IF NOT EXISTS idx_daily_records_lookup
  ON daily_records (group_id, record_date, house, record_type);

CREATE INDEX IF NOT EXISTS idx_line_events_group
  ON line_events (group_id, received_at);
