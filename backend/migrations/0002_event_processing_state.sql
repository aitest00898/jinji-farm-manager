ALTER TABLE line_events ADD COLUMN processed_at TEXT;

ALTER TABLE daily_records ADD COLUMN event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_records_event
  ON daily_records (event_id);
