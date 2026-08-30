-- Additive, bounded provider-to-parser diagnostics for Ambient runs.
-- The JSON stores only allowlisted kinds, booleans, lengths, and reason codes;
-- it never stores completion text, prompts, source messages, secrets, or tokens.
ALTER TABLE ambient_digest_runs ADD COLUMN transport_diagnostics_json TEXT;
