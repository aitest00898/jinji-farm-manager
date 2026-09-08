-- Additive local design for the full recording taxonomy foundation.
-- This migration is intentionally NOT executed in this gate.
-- Existing operational_events, abnormal_events, audit_logs, finance rows,
-- and current V1 write paths remain readable and unchanged.

CREATE TABLE IF NOT EXISTS recording_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  family TEXT NOT NULL CHECK (family = 'operational_event'),
  type TEXT NOT NULL CHECK (type IN ('chick_in', 'shipment', 'weigh', 'mortality', 'cull')),
  subtype TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  house_id TEXT REFERENCES houses(id),
  flock_id TEXT REFERENCES flocks(id),
  male_count INTEGER CHECK (male_count IS NULL OR male_count >= 0),
  female_count INTEGER CHECK (female_count IS NULL OR female_count >= 0),
  total_count INTEGER CHECK (total_count IS NULL OR total_count >= 0),
  condition TEXT CHECK (condition IS NULL OR condition IN ('good', 'fair', 'poor')),
  quantity REAL CHECK (quantity IS NULL OR quantity > 0),
  sex TEXT CHECK (sex IS NULL OR sex IN ('male', 'female', 'mixed', 'unspecified')),
  total_weight REAL CHECK (total_weight IS NULL OR total_weight > 0),
  average_weight REAL CHECK (average_weight IS NULL OR average_weight > 0),
  weight_unit TEXT CHECK (weight_unit IS NULL OR weight_unit = 'kg'),
  age_days INTEGER CHECK (age_days IS NULL OR age_days >= 0),
  source_channel TEXT NOT NULL CHECK (source_channel IN ('line', 'web', 'ambient', 'system')),
  source_message_id TEXT,
  source_candidate_id TEXT,
  raw_text TEXT NOT NULL CHECK (length(raw_text) BETWEEN 1 AND 2000),
  actor_id TEXT,
  confirmed_by TEXT,
  client_operation_id TEXT NOT NULL,
  correction_of_id TEXT REFERENCES recording_events(id),
  reversal_of_id TEXT REFERENCES recording_events(id),
  replacement_of_id TEXT REFERENCES recording_events(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'reversed', 'corrected', 'replacement')),
  legacy_operational_event_id TEXT REFERENCES operational_events(id),
  UNIQUE (organization_id, client_operation_id),
  CHECK (
    total_count IS NULL OR
    (male_count IS NOT NULL AND female_count IS NOT NULL AND total_count = male_count + female_count)
  ),
  CHECK (
    average_weight IS NULL OR
    total_weight IS NULL OR
    quantity IS NULL OR
    abs(average_weight - total_weight / quantity) < 0.000001
  )
);

CREATE INDEX IF NOT EXISTS idx_recording_events_scope_time
  ON recording_events (organization_id, farm_id, house_id, flock_id, occurred_at, created_at);
CREATE INDEX IF NOT EXISTS idx_recording_events_effective
  ON recording_events (organization_id, type, subtype, status, occurred_at);

CREATE TABLE IF NOT EXISTS operational_actions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  family TEXT NOT NULL CHECK (family = 'operational_action'),
  action_type TEXT NOT NULL CHECK (action_type IN (
    'vaccination', 'medication', 'supplement', 'feed_order',
    'lab_test', 'disinfection', 'maintenance'
  )),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  house_id TEXT REFERENCES houses(id),
  flock_id TEXT REFERENCES flocks(id),
  content TEXT,
  vendor TEXT,
  weight REAL CHECK (weight IS NULL OR weight > 0),
  weight_unit TEXT CHECK (weight_unit IS NULL OR weight_unit IN ('kg', 'bag')),
  submitted_at TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('pending', 'waiting_result', 'completed')),
  result TEXT,
  completed_at TEXT,
  completion_status TEXT CHECK (completion_status IS NULL OR completion_status IN ('pending', 'completed')),
  reminder_due_at TEXT,
  maintenance_content TEXT,
  source_channel TEXT NOT NULL CHECK (source_channel IN ('line', 'web', 'ambient', 'system')),
  source_message_id TEXT,
  source_candidate_id TEXT,
  raw_text TEXT NOT NULL CHECK (length(raw_text) BETWEEN 1 AND 2000),
  actor_id TEXT,
  confirmed_by TEXT,
  client_operation_id TEXT NOT NULL,
  correction_of_id TEXT REFERENCES operational_actions(id),
  reversal_of_id TEXT REFERENCES operational_actions(id),
  replacement_of_id TEXT REFERENCES operational_actions(id),
  action_state TEXT NOT NULL DEFAULT 'active'
    CHECK (action_state IN ('active', 'reversed', 'corrected', 'replacement')),
  UNIQUE (organization_id, client_operation_id)
);

CREATE INDEX IF NOT EXISTS idx_operational_actions_scope_time
  ON operational_actions (organization_id, farm_id, house_id, flock_id, occurred_at, created_at);
CREATE INDEX IF NOT EXISTS idx_operational_actions_status
  ON operational_actions (organization_id, action_type, status, reminder_due_at);

ALTER TABLE abnormal_events ADD COLUMN taxonomy_id TEXT;
ALTER TABLE abnormal_events ADD COLUMN taxonomy_subtype TEXT;
ALTER TABLE abnormal_events ADD COLUMN extent TEXT
  CHECK (extent IS NULL OR extent IN ('small', 'medium', 'large'));
ALTER TABLE abnormal_events ADD COLUMN linked_mortality_event_id TEXT REFERENCES operational_events(id);
ALTER TABLE abnormal_events ADD COLUMN detail TEXT;
ALTER TABLE abnormal_events ADD COLUMN source_candidate_id TEXT;

CREATE INDEX IF NOT EXISTS idx_abnormal_events_taxonomy
  ON abnormal_events (organization_id, taxonomy_id, taxonomy_subtype, extent, occurred_date);
CREATE INDEX IF NOT EXISTS idx_abnormal_events_mortality_link
  ON abnormal_events (linked_mortality_event_id);
