-- Additive Operational Phase 2 master data.
-- Existing farms and operational history are not rewritten. Houses and flocks
-- are intentionally empty until an administrator supplies real master data.
CREATE TABLE IF NOT EXISTS houses (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (farm_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_houses_farm_active
  ON houses (farm_id, active, normalized_name);

CREATE TABLE IF NOT EXISTS flocks (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  house_id TEXT NOT NULL REFERENCES houses(id),
  batch_code TEXT NOT NULL,
  breed TEXT,
  chick_in_date TEXT NOT NULL,
  initial_count INTEGER NOT NULL CHECK (initial_count > 0),
  expected_shipment_date TEXT,
  actual_shipment_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (farm_id, batch_code)
);

CREATE INDEX IF NOT EXISTS idx_flocks_house_status
  ON flocks (house_id, status, expected_shipment_date);

CREATE INDEX IF NOT EXISTS idx_flocks_farm_status
  ON flocks (farm_id, status, chick_in_date);

-- Existing V1 writes retain their legacy house text. New house-aware writes
-- additionally carry the canonical house foreign key; flock_id remains the
-- existing nullable refinement point.
ALTER TABLE operational_events ADD COLUMN house_id TEXT REFERENCES houses(id);

CREATE INDEX IF NOT EXISTS idx_operational_events_house_date
  ON operational_events (house_id, event_date, intent, reversed_at);

CREATE INDEX IF NOT EXISTS idx_operational_events_flock_date
  ON operational_events (flock_id, event_date, intent, reversed_at);
