-- Audit-safe reversal markers for automated test-farm runtime validation.
-- Rows remain immutable history; normal queries exclude rows with reversed_at.
ALTER TABLE operational_events ADD COLUMN reversed_at TEXT;
ALTER TABLE operational_events ADD COLUMN reversal_reason TEXT;
