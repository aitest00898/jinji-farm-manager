CREATE TABLE IF NOT EXISTS farm_aliases (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  alias_type TEXT NOT NULL CHECK (alias_type IN ('manual', 'short_name', 'homophone', 'learned')),
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('trusted', 'candidate', 'disabled')),
  confirmation_count INTEGER NOT NULL DEFAULT 0 CHECK (confirmation_count >= 0),
  last_confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (normalized_alias, farm_id)
);

CREATE INDEX IF NOT EXISTS idx_farm_aliases_lookup
  ON farm_aliases (normalized_alias, status, farm_id);

CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  intent TEXT NOT NULL CHECK (intent IN ('mortality', 'cull', 'feed', 'water', 'shipment')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  raw_message TEXT NOT NULL,
  raw_farm_text TEXT,
  candidate_farms_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting_farm', 'waiting_confirmation', 'completed', 'cancelled', 'expired')),
  expires_at TEXT NOT NULL,
  source_event_id TEXT NOT NULL UNIQUE,
  confirmed_farm_id TEXT REFERENCES farms(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_scope
  ON pending_actions (line_group_id, line_user_id, status, expires_at, created_at);

CREATE TABLE IF NOT EXISTS operational_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  farm_id TEXT NOT NULL REFERENCES farms(id),
  line_group_id TEXT NOT NULL REFERENCES line_groups(group_id),
  line_user_id TEXT,
  intent TEXT NOT NULL CHECK (intent IN ('mortality', 'cull', 'feed', 'water', 'shipment')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  event_date TEXT NOT NULL,
  house TEXT,
  flock_id TEXT,
  raw_message TEXT NOT NULL,
  raw_farm_text TEXT,
  pending_action_id TEXT UNIQUE REFERENCES pending_actions(id),
  source_event_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operational_events_org_date
  ON operational_events (organization_id, event_date, intent, farm_id);

CREATE INDEX IF NOT EXISTS idx_operational_events_group_user
  ON operational_events (line_group_id, line_user_id, created_at);
