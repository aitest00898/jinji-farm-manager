-- Additive semantic-parser support for bounded operational notes.
-- Existing operational history remains unchanged and nullable.
ALTER TABLE operational_events ADD COLUMN note TEXT;
ALTER TABLE pending_actions ADD COLUMN note TEXT;
