-- Additive local design for the full recording taxonomy foundation.
-- This migration is intentionally NOT executed in this gate.
-- Existing operational_events, abnormal_events, audit_logs, finance rows,
-- and current V1 write paths remain readable and unchanged.
--
-- Storage routing is intentionally asymmetric: O1/O4 are new event semantics,
-- O3/O9 remain in the existing operational_events authority, O2/O5/O6/O7/O8
-- use operational_actions, and A1-A16 use abnormal_events. This prevents a
-- second official mortality, cull, or shipment fact.

CREATE TABLE IF NOT EXISTS recording_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  taxonomy_id TEXT NOT NULL CHECK (taxonomy_id IN ('O1', 'O4')),
  family TEXT NOT NULL CHECK (family = 'operational_event'),
  canonical_type TEXT NOT NULL CHECK (canonical_type = 'event'),
  subtype TEXT NOT NULL CHECK (
    (taxonomy_id = 'O1' AND subtype = 'chick_in') OR
    (taxonomy_id = 'O4' AND subtype = 'weigh')
  ),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  house_id TEXT NOT NULL REFERENCES houses(id),
  flock_id TEXT NOT NULL REFERENCES flocks(id),
  male_count INTEGER CHECK (male_count IS NULL OR male_count >= 0),
  female_count INTEGER CHECK (female_count IS NULL OR female_count >= 0),
  total_count INTEGER CHECK (total_count IS NULL OR total_count >= 0),
  condition TEXT CHECK (condition IS NULL OR condition IN ('good', 'fair', 'poor')),
  sex TEXT CHECK (sex IS NULL OR sex IN ('male', 'female', 'mixed', 'unspecified')),
  chick_in_date TEXT,
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
  lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'reversed', 'corrected', 'replacement')),
  UNIQUE (organization_id, client_operation_id),
  CHECK (
    taxonomy_id != 'O1' OR
    (male_count IS NOT NULL AND female_count IS NOT NULL AND condition IS NOT NULL AND
     total_count IS NOT NULL AND total_count = male_count + female_count AND
     average_weight IS NULL AND sex IS NULL)
  ),
  CHECK (
    taxonomy_id != 'O4' OR
    (average_weight IS NOT NULL AND sex IS NOT NULL AND
     male_count IS NULL AND female_count IS NULL AND total_count IS NULL AND condition IS NULL)
  ),
  CHECK (
    taxonomy_id != 'O4' OR
    (age_days IS NULL OR (chick_in_date IS NOT NULL AND
      age_days = CAST(julianday(substr(occurred_at, 1, 10)) - julianday(chick_in_date) AS INTEGER)))
  )
);

CREATE INDEX IF NOT EXISTS idx_recording_events_scope_time
  ON recording_events (organization_id, farm_id, house_id, flock_id, occurred_at, created_at);
CREATE INDEX IF NOT EXISTS idx_recording_events_effective
  ON recording_events (organization_id, canonical_type, subtype, lifecycle_status, occurred_at);
CREATE INDEX IF NOT EXISTS idx_recording_events_lineage
  ON recording_events (correction_of_id, reversal_of_id, replacement_of_id);

CREATE TABLE IF NOT EXISTS operational_actions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  taxonomy_id TEXT NOT NULL CHECK (taxonomy_id IN ('O2', 'O5', 'O6', 'O7', 'O8')),
  family TEXT NOT NULL CHECK (family = 'operational_action'),
  canonical_type TEXT NOT NULL CHECK (canonical_type = 'action'),
  subtype TEXT NOT NULL CHECK (
    (taxonomy_id = 'O2' AND subtype IN ('vaccination', 'medication', 'supplement')) OR
    (taxonomy_id = 'O5' AND subtype = 'feed_order') OR
    (taxonomy_id = 'O6' AND subtype = 'lab_test') OR
    (taxonomy_id = 'O7' AND subtype = 'disinfection') OR
    (taxonomy_id = 'O8' AND subtype = 'maintenance')
  ),
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
  workflow_status TEXT CHECK (workflow_status IS NULL OR workflow_status IN ('pending', 'waiting_result', 'completed')),
  result TEXT,
  completed_at TEXT,
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
  lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'reversed', 'corrected', 'replacement')),
  UNIQUE (organization_id, client_operation_id),
  CHECK (subtype = 'lab_test' OR submitted_at IS NULL),
  CHECK (subtype = 'lab_test' OR result IS NULL),
  CHECK (subtype = 'lab_test' OR completed_at IS NULL),
  CHECK (subtype = 'lab_test' OR reminder_due_at IS NULL),
  CHECK (subtype != 'lab_test' OR (submitted_at IS NOT NULL AND workflow_status IN ('waiting_result', 'completed'))),
  CHECK (subtype != 'lab_test' OR workflow_status != 'completed' OR (result IS NOT NULL AND completed_at IS NOT NULL)),
  CHECK (subtype != 'lab_test' OR workflow_status = 'completed' OR (result IS NULL AND completed_at IS NULL)),
  CHECK (subtype != 'disinfection' OR workflow_status IN ('pending', 'completed')),
  CHECK (subtype IN ('lab_test', 'disinfection') OR workflow_status IS NULL),
  CHECK (subtype IN ('vaccination', 'medication', 'supplement', 'lab_test') OR content IS NULL),
  CHECK (subtype NOT IN ('vaccination', 'medication', 'supplement') OR (content IS NOT NULL AND length(content) BETWEEN 1 AND 240)),
  CHECK (subtype = 'feed_order' OR (vendor IS NULL AND weight IS NULL AND weight_unit IS NULL)),
  CHECK (subtype != 'feed_order' OR (vendor IS NOT NULL AND length(vendor) BETWEEN 1 AND 240 AND weight IS NOT NULL AND weight_unit IS NOT NULL)),
  CHECK (subtype = 'maintenance' OR maintenance_content IS NULL),
  CHECK (subtype != 'maintenance' OR (maintenance_content IS NOT NULL AND length(maintenance_content) BETWEEN 1 AND 240))
);

CREATE INDEX IF NOT EXISTS idx_operational_actions_scope_time
  ON operational_actions (organization_id, farm_id, house_id, flock_id, occurred_at, created_at);
CREATE INDEX IF NOT EXISTS idx_operational_actions_status
  ON operational_actions (organization_id, subtype, workflow_status, reminder_due_at);
CREATE INDEX IF NOT EXISTS idx_operational_actions_lineage
  ON operational_actions (correction_of_id, reversal_of_id, replacement_of_id);

CREATE TRIGGER IF NOT EXISTS operational_actions_lab_reminder_guard_insert
BEFORE INSERT ON operational_actions
WHEN NEW.subtype = 'lab_test' AND NEW.reminder_due_at IS NOT NULL
  AND abs(julianday(NEW.reminder_due_at) - julianday(NEW.submitted_at, '+3 days')) > 0.000001
BEGIN
  SELECT RAISE(ABORT, 'canonical_lab_reminder_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS operational_actions_lab_reminder_guard_update
BEFORE UPDATE OF subtype, submitted_at, reminder_due_at ON operational_actions
WHEN NEW.subtype = 'lab_test' AND NEW.reminder_due_at IS NOT NULL
  AND abs(julianday(NEW.reminder_due_at) - julianday(NEW.submitted_at, '+3 days')) > 0.000001
BEGIN
  SELECT RAISE(ABORT, 'canonical_lab_reminder_mismatch');
END;

-- Existing V1 operational_events remains authoritative for O3 shipment and
-- O9 mortality/cull. These nullable columns add canonical read/write metadata
-- without converting or duplicating historical rows.
ALTER TABLE operational_events ADD COLUMN taxonomy_id TEXT
  CHECK (taxonomy_id IS NULL OR taxonomy_id IN ('O3', 'O9'));
ALTER TABLE operational_events ADD COLUMN family TEXT
  CHECK (family IS NULL OR family = 'operational_event');
ALTER TABLE operational_events ADD COLUMN canonical_type TEXT
  CHECK (canonical_type IS NULL OR canonical_type = 'event');
ALTER TABLE operational_events ADD COLUMN subtype TEXT
  CHECK (
    subtype IS NULL OR
    (taxonomy_id = 'O3' AND subtype = 'shipment') OR
    (taxonomy_id = 'O9' AND subtype IN ('mortality', 'cull'))
  );
ALTER TABLE operational_events ADD COLUMN sex TEXT
  CHECK (sex IS NULL OR sex IN ('male', 'female', 'mixed', 'unspecified'));
ALTER TABLE operational_events ADD COLUMN total_weight REAL
  CHECK (total_weight IS NULL OR total_weight > 0);
ALTER TABLE operational_events ADD COLUMN average_weight REAL
  CHECK (average_weight IS NULL OR average_weight > 0);
ALTER TABLE operational_events ADD COLUMN weight_unit TEXT
  CHECK (weight_unit IS NULL OR weight_unit = 'kg');
ALTER TABLE operational_events ADD COLUMN occurred_at TEXT;
ALTER TABLE operational_events ADD COLUMN source_channel TEXT
  CHECK (source_channel IS NULL OR source_channel IN ('line', 'web', 'ambient', 'system'));

CREATE INDEX IF NOT EXISTS idx_operational_events_canonical_taxonomy
  ON operational_events (organization_id, taxonomy_id, subtype, event_date, created_at);

CREATE TRIGGER IF NOT EXISTS operational_events_canonical_average_guard_insert
BEFORE INSERT ON operational_events
WHEN NEW.taxonomy_id = 'O3' AND NEW.average_weight IS NOT NULL
  AND (NEW.total_weight IS NULL OR NEW.quantity IS NULL
       OR abs(NEW.average_weight - NEW.total_weight / NEW.quantity) > 0.000000001)
BEGIN
  SELECT RAISE(ABORT, 'canonical_average_weight_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS operational_events_canonical_average_guard_update
BEFORE UPDATE OF taxonomy_id, quantity, total_weight, average_weight ON operational_events
WHEN NEW.taxonomy_id = 'O3' AND NEW.average_weight IS NOT NULL
  AND (NEW.total_weight IS NULL OR NEW.quantity IS NULL
       OR abs(NEW.average_weight - NEW.total_weight / NEW.quantity) > 0.000000001)
BEGIN
  SELECT RAISE(ABORT, 'canonical_average_weight_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS operational_events_canonical_required_guard_insert
BEFORE INSERT ON operational_events
WHEN NEW.taxonomy_id IS NOT NULL AND (
  NEW.family IS NULL OR NEW.canonical_type IS NULL OR NEW.subtype IS NULL OR
  NEW.occurred_at IS NULL OR NEW.source_channel IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'canonical_operational_event_required_field');
END;

CREATE TRIGGER IF NOT EXISTS operational_events_canonical_required_guard_update
BEFORE UPDATE OF taxonomy_id, family, canonical_type, subtype, occurred_at, source_channel ON operational_events
WHEN NEW.taxonomy_id IS NOT NULL AND (
  NEW.family IS NULL OR NEW.canonical_type IS NULL OR NEW.subtype IS NULL OR
  NEW.occurred_at IS NULL OR NEW.source_channel IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'canonical_operational_event_required_field');
END;

CREATE TRIGGER IF NOT EXISTS operational_events_canonical_integer_quantity_guard_insert
BEFORE INSERT ON operational_events
WHEN NEW.taxonomy_id IN ('O3', 'O9') AND NEW.quantity != CAST(NEW.quantity AS INTEGER)
BEGIN
  SELECT RAISE(ABORT, 'canonical_quantity_must_be_integer');
END;

CREATE TRIGGER IF NOT EXISTS operational_events_canonical_integer_quantity_guard_update
BEFORE UPDATE OF taxonomy_id, quantity ON operational_events
WHEN NEW.taxonomy_id IN ('O3', 'O9') AND NEW.quantity != CAST(NEW.quantity AS INTEGER)
BEGIN
  SELECT RAISE(ABORT, 'canonical_quantity_must_be_integer');
END;

CREATE TRIGGER IF NOT EXISTS operational_events_canonical_subtype_field_guard_insert
BEFORE INSERT ON operational_events
WHEN (NEW.taxonomy_id = 'O3' AND NEW.sex IS NULL)
   OR (NEW.taxonomy_id = 'O9' AND (
  NEW.total_weight IS NOT NULL OR NEW.average_weight IS NOT NULL OR NEW.weight_unit IS NOT NULL
))
BEGIN
  SELECT RAISE(ABORT, 'canonical_operational_event_field_semantics');
END;

CREATE TRIGGER IF NOT EXISTS operational_events_canonical_subtype_field_guard_update
BEFORE UPDATE OF taxonomy_id, sex, total_weight, average_weight, weight_unit ON operational_events
WHEN (NEW.taxonomy_id = 'O3' AND NEW.sex IS NULL)
   OR (NEW.taxonomy_id = 'O9' AND (
  NEW.total_weight IS NOT NULL OR NEW.average_weight IS NOT NULL OR NEW.weight_unit IS NOT NULL
))
BEGIN
  SELECT RAISE(ABORT, 'canonical_operational_event_field_semantics');
END;

ALTER TABLE abnormal_events ADD COLUMN taxonomy_id TEXT
  CHECK (taxonomy_id IS NULL OR taxonomy_id IN (
    'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8',
    'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16'
  ));
ALTER TABLE abnormal_events ADD COLUMN family TEXT
  CHECK (family IS NULL OR family = 'operational_observation');
ALTER TABLE abnormal_events ADD COLUMN canonical_type TEXT
  CHECK (canonical_type IS NULL OR canonical_type = 'observation');
ALTER TABLE abnormal_events ADD COLUMN subtype TEXT
  CHECK (
    subtype IS NULL OR
    (taxonomy_id = 'A1' AND subtype = 'mortality_abnormality') OR
    (taxonomy_id = 'A2' AND subtype = 'cough') OR
    (taxonomy_id = 'A3' AND subtype = 'respiratory_distress') OR
    (taxonomy_id = 'A4' AND subtype = 'activity_down') OR
    (taxonomy_id = 'A5' AND subtype IN ('eye_swelling', 'white_crown', 'purple_crown', 'black_crown')) OR
    (taxonomy_id = 'A6' AND subtype IN ('watery', 'white', 'green', 'bloody')) OR
    (taxonomy_id = 'A7' AND subtype = 'growth_delay') OR
    (taxonomy_id = 'A8' AND subtype = 'foot_odor') OR
    (taxonomy_id = 'A9' AND subtype = 'fever') OR
    (taxonomy_id = 'A10' AND subtype IN ('heat_stress', 'catching_stress')) OR
    (taxonomy_id = 'A11' AND subtype IN ('feeding_abnormality', 'water_abnormality')) OR
    (taxonomy_id = 'A12' AND subtype IN ('feed', 'water', 'electricity', 'fan', 'cooling', 'heating', 'other')) OR
    (taxonomy_id = 'A13' AND subtype IN ('high_temperature', 'low_temperature', 'heavy_rain')) OR
    (taxonomy_id = 'A14' AND subtype = 'flooding') OR
    (taxonomy_id = 'A15' AND subtype = 'odor') OR
    (taxonomy_id = 'A16' AND subtype IN ('attack', 'infection', 'spread'))
  );
ALTER TABLE abnormal_events ADD COLUMN extent TEXT
  CHECK (extent IS NULL OR extent IN ('small', 'medium', 'large'));
ALTER TABLE abnormal_events ADD COLUMN linked_mortality_event_id TEXT REFERENCES operational_events(id);
ALTER TABLE abnormal_events ADD COLUMN detail TEXT;
ALTER TABLE abnormal_events ADD COLUMN measured_temperature REAL
  CHECK (measured_temperature IS NULL OR measured_temperature >= 0);
ALTER TABLE abnormal_events ADD COLUMN measurement TEXT;
ALTER TABLE abnormal_events ADD COLUMN evidence TEXT;
ALTER TABLE abnormal_events ADD COLUMN source_candidate_id TEXT;
ALTER TABLE abnormal_events ADD COLUMN source_channel TEXT
  CHECK (source_channel IS NULL OR source_channel IN ('line', 'web', 'ambient', 'system'));

CREATE INDEX IF NOT EXISTS idx_abnormal_events_taxonomy
  ON abnormal_events (organization_id, taxonomy_id, subtype, extent, occurred_date);
CREATE INDEX IF NOT EXISTS idx_abnormal_events_mortality_link
  ON abnormal_events (linked_mortality_event_id);

CREATE TRIGGER IF NOT EXISTS abnormal_events_canonical_required_guard_insert
BEFORE INSERT ON abnormal_events
WHEN NEW.taxonomy_id IS NOT NULL AND (
  NEW.family IS NULL OR NEW.canonical_type IS NULL OR NEW.subtype IS NULL OR
  NEW.extent IS NULL OR NEW.occurred_at IS NULL OR NEW.source_channel IS NULL OR
  (NEW.taxonomy_id = 'A1' AND NEW.linked_mortality_event_id IS NULL) OR
  (NEW.taxonomy_id = 'A12' AND NEW.subtype = 'other' AND NEW.detail IS NULL) OR
  (NEW.taxonomy_id = 'A16' AND NEW.evidence IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'canonical_abnormal_event_required_field');
END;

CREATE TRIGGER IF NOT EXISTS abnormal_events_canonical_required_guard_update
BEFORE UPDATE OF taxonomy_id, family, canonical_type, subtype, extent, occurred_at, source_channel, linked_mortality_event_id ON abnormal_events
WHEN NEW.taxonomy_id IS NOT NULL AND (
  NEW.family IS NULL OR NEW.canonical_type IS NULL OR NEW.subtype IS NULL OR
  NEW.extent IS NULL OR NEW.occurred_at IS NULL OR NEW.source_channel IS NULL OR
  (NEW.taxonomy_id = 'A1' AND NEW.linked_mortality_event_id IS NULL) OR
  (NEW.taxonomy_id = 'A12' AND NEW.subtype = 'other' AND NEW.detail IS NULL) OR
  (NEW.taxonomy_id = 'A16' AND NEW.evidence IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'canonical_abnormal_event_required_field');
END;
