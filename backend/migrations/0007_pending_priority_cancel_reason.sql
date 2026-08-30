-- Additive audit metadata for pending-action interruption.
-- No existing rows are deleted or rewritten.
ALTER TABLE pending_actions ADD COLUMN cancel_reason TEXT;
ALTER TABLE test_farm_actions ADD COLUMN cancel_reason TEXT;
