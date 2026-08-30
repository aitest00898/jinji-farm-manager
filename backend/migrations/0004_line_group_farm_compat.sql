ALTER TABLE line_groups ADD COLUMN farm_id TEXT REFERENCES farms(id);

CREATE INDEX IF NOT EXISTS idx_line_groups_farm
  ON line_groups (farm_id, status);
