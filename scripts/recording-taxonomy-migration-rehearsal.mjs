import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const wrangler = path.join(root, "node_modules/.bin/wrangler");
const persistTo = fs.mkdtempSync(path.join(os.tmpdir(), "jinji-recording-taxonomy-rehearsal-"));

function run(args) {
  try {
    return execFileSync(wrangler, args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = String(error?.stderr || error?.stdout || error?.message || error);
    throw new Error("WRANGLER_LOCAL_REHEARSAL_FAILED:" + detail.slice(-4000));
  }
}

function execute(sql) {
  const output = run([
    "d1", "execute", "DB", "--local", "--persist-to", persistTo,
    "--command", sql, "--json",
  ]);
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error("D1_REHEARSAL_JSON_INVALID:" + String(error?.message || error));
  }
}

function rows(sql) {
  const payload = execute(sql);
  const first = Array.isArray(payload) ? payload[0] : payload;
  assert.equal(first?.success, true, "local D1 SQL succeeded");
  return first?.results || [];
}

function expectSqlFailure(sql, expectedText) {
  assert.throws(
    () => execute(sql),
    (error) => String(error?.message || error).includes(expectedText),
    "expected local D1 constraint failure: " + expectedText,
  );
}

const seedSql = `
PRAGMA foreign_keys = ON;
INSERT INTO organizations (id, name, active) VALUES ('org-taxonomy-rehearsal', 'taxonomy rehearsal org', 1);
INSERT INTO farms (id, organization_id, name, active, farm_total_equity_fraction, player_group_equity_fraction, environment)
  VALUES ('farm-taxonomy-rehearsal', 'org-taxonomy-rehearsal', 'taxonomy rehearsal farm', 1, 1, 1, 'test');
INSERT INTO line_groups (group_id, status, organization_id, farm_id) VALUES ('group-taxonomy-rehearsal', 'bound', 'org-taxonomy-rehearsal', 'farm-taxonomy-rehearsal');
INSERT INTO houses (id, farm_id, name, normalized_name) VALUES ('house-taxonomy-rehearsal', 'farm-taxonomy-rehearsal', 'rehearsal house', 'rehearsal-house');
INSERT INTO flocks (id, farm_id, house_id, batch_code, chick_in_date, initial_count, status)
  VALUES ('flock-taxonomy-rehearsal', 'farm-taxonomy-rehearsal', 'house-taxonomy-rehearsal', 'REHEARSAL-001', '2026-09-01', 1000, 'active');
INSERT INTO operational_events
  (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit, event_date, house, flock_id, raw_message, source_event_id)
  VALUES ('legacy-mortality', 'org-taxonomy-rehearsal', 'farm-taxonomy-rehearsal', 'group-taxonomy-rehearsal', 'user-rehearsal', 'mortality', 5, '隻', '2026-09-07', 'rehearsal house', 'flock-taxonomy-rehearsal', 'legacy mortality 5', 'legacy-source-1');
INSERT INTO abnormal_events
  (id, organization_id, farm_id, house_id, flock_id, occurred_date, reported_at, raw_text, source, source_event_id)
  VALUES ('legacy-abnormal', 'org-taxonomy-rehearsal', 'farm-taxonomy-rehearsal', 'house-taxonomy-rehearsal', 'flock-taxonomy-rehearsal', '2026-09-07', '2026-09-08T01:00:00.000Z', 'legacy cough', 'line', 'legacy-abnormal-source-1');
INSERT INTO recording_events
  (id, organization_id, taxonomy_id, family, canonical_type, subtype, occurred_at, created_at, farm_id, house_id, flock_id,
   male_count, female_count, total_count, condition, source_channel, raw_text, client_operation_id, lifecycle_status)
  VALUES ('rec-o1', 'org-taxonomy-rehearsal', 'O1', 'operational_event', 'event', 'chick_in', '2026-09-01T00:00:00+08:00', '2026-09-08T01:00:00.000Z', 'farm-taxonomy-rehearsal', 'house-taxonomy-rehearsal', 'flock-taxonomy-rehearsal', 600, 400, 1000, 'good', 'web', 'synthetic chick in', 'client-rec-o1', 'active');
INSERT INTO recording_events
  (id, organization_id, taxonomy_id, family, canonical_type, subtype, occurred_at, created_at, farm_id, house_id, flock_id,
   chick_in_date, average_weight, sex, age_days, source_channel, raw_text, client_operation_id, lifecycle_status)
  VALUES ('rec-o4', 'org-taxonomy-rehearsal', 'O4', 'operational_event', 'event', 'weigh', '2026-09-08T01:00:00.000Z', '2026-09-08T01:00:00.000Z', 'farm-taxonomy-rehearsal', 'house-taxonomy-rehearsal', 'flock-taxonomy-rehearsal', '2026-09-01', 1.8, 'mixed', 7, 'web', 'synthetic weigh', 'client-rec-o4', 'active');
INSERT INTO operational_actions
  (id, organization_id, taxonomy_id, family, canonical_type, subtype, occurred_at, created_at, farm_id, content, source_channel, raw_text, client_operation_id, lifecycle_status)
  VALUES ('action-o2', 'org-taxonomy-rehearsal', 'O2', 'operational_action', 'action', 'vaccination', '2026-09-08T01:00:00.000Z', '2026-09-08T01:00:00.000Z', 'farm-taxonomy-rehearsal', 'synthetic vaccine', 'web', 'synthetic O2', 'client-action-o2', 'active');
INSERT INTO operational_actions
  (id, organization_id, taxonomy_id, family, canonical_type, subtype, occurred_at, created_at, farm_id, vendor, weight, weight_unit, source_channel, raw_text, client_operation_id, lifecycle_status)
  VALUES ('action-o5', 'org-taxonomy-rehearsal', 'O5', 'operational_action', 'action', 'feed_order', '2026-09-08T01:00:00.000Z', '2026-09-08T01:00:00.000Z', 'farm-taxonomy-rehearsal', 'synthetic vendor', 100, 'kg', 'web', 'synthetic O5', 'client-action-o5', 'active');
INSERT INTO operational_actions
  (id, organization_id, taxonomy_id, family, canonical_type, subtype, occurred_at, created_at, farm_id, submitted_at, content, workflow_status, reminder_due_at, source_channel, raw_text, client_operation_id, lifecycle_status)
  VALUES ('action-o6', 'org-taxonomy-rehearsal', 'O6', 'operational_action', 'action', 'lab_test', '2026-09-08T01:00:00.000Z', '2026-09-08T01:00:00.000Z', 'farm-taxonomy-rehearsal', '2026-09-08T01:00:00.000Z', 'synthetic lab', 'waiting_result', '2026-09-11T01:00:00.000Z', 'web', 'synthetic O6', 'client-action-o6', 'active');
INSERT INTO operational_actions
  (id, organization_id, taxonomy_id, family, canonical_type, subtype, occurred_at, created_at, farm_id, workflow_status, source_channel, raw_text, client_operation_id, lifecycle_status)
  VALUES ('action-o7', 'org-taxonomy-rehearsal', 'O7', 'operational_action', 'action', 'disinfection', '2026-09-08T01:00:00.000Z', '2026-09-08T01:00:00.000Z', 'farm-taxonomy-rehearsal', 'pending', 'web', 'synthetic O7', 'client-action-o7', 'active');
INSERT INTO operational_actions
  (id, organization_id, taxonomy_id, family, canonical_type, subtype, occurred_at, created_at, farm_id, maintenance_content, source_channel, raw_text, client_operation_id, lifecycle_status)
  VALUES ('action-o8', 'org-taxonomy-rehearsal', 'O8', 'operational_action', 'action', 'maintenance', '2026-09-08T01:00:00.000Z', '2026-09-08T01:00:00.000Z', 'farm-taxonomy-rehearsal', 'synthetic maintenance', 'web', 'synthetic O8', 'client-action-o8', 'active');
INSERT INTO operational_events
  (id, organization_id, farm_id, line_group_id, intent, quantity, unit, event_date, house, flock_id, raw_message, source_event_id,
   taxonomy_id, family, canonical_type, subtype, sex, total_weight, average_weight, weight_unit, occurred_at, source_channel)
  VALUES ('op-o3', 'org-taxonomy-rehearsal', 'farm-taxonomy-rehearsal', 'group-taxonomy-rehearsal', 'shipment', 100, '隻', '2026-09-08', 'rehearsal house', 'flock-taxonomy-rehearsal', 'synthetic shipment', 'source-op-o3', 'O3', 'operational_event', 'event', 'shipment', 'male', 180, 1.8, 'kg', '2026-09-08T01:00:00.000Z', 'web');
INSERT INTO operational_events
  (id, organization_id, farm_id, line_group_id, intent, quantity, unit, event_date, house, flock_id, raw_message, source_event_id,
   taxonomy_id, family, canonical_type, subtype, occurred_at, source_channel)
  VALUES ('op-o9', 'org-taxonomy-rehearsal', 'farm-taxonomy-rehearsal', 'group-taxonomy-rehearsal', 'mortality', 5, '隻', '2026-09-08', 'rehearsal house', 'flock-taxonomy-rehearsal', 'synthetic mortality', 'source-op-o9', 'O9', 'operational_event', 'event', 'mortality', '2026-09-08T01:00:00.000Z', 'web');
INSERT INTO abnormal_events
  (id, organization_id, farm_id, house_id, flock_id, occurred_at, occurred_date, reported_at, raw_text, source, source_event_id,
   taxonomy_id, family, canonical_type, subtype, extent, source_channel)
  VALUES ('abnormal-a2', 'org-taxonomy-rehearsal', 'farm-taxonomy-rehearsal', 'house-taxonomy-rehearsal', 'flock-taxonomy-rehearsal', '2026-09-08T01:00:00.000Z', '2026-09-08', '2026-09-08T01:00:00.000Z', 'synthetic cough', 'web', 'source-abnormal-a2', 'A2', 'operational_observation', 'observation', 'cough', 'small', 'web');
INSERT INTO abnormal_events
  (id, organization_id, farm_id, house_id, flock_id, occurred_at, occurred_date, reported_at, raw_text, source, source_event_id,
   taxonomy_id, family, canonical_type, subtype, extent, linked_mortality_event_id, source_channel)
  VALUES ('abnormal-a1', 'org-taxonomy-rehearsal', 'farm-taxonomy-rehearsal', 'house-taxonomy-rehearsal', 'flock-taxonomy-rehearsal', '2026-09-08T01:00:00.000Z', '2026-09-08', '2026-09-08T01:00:00.000Z', 'synthetic mortality abnormality', 'web', 'source-abnormal-a1', 'A1', 'operational_observation', 'observation', 'mortality_abnormality', 'small', 'legacy-mortality', 'web');
INSERT INTO abnormal_events
  (id, organization_id, farm_id, occurred_at, occurred_date, reported_at, raw_text, source, source_event_id,
   taxonomy_id, family, canonical_type, subtype, extent, evidence, source_channel)
  VALUES ('abnormal-a16', 'org-taxonomy-rehearsal', 'farm-taxonomy-rehearsal', '2026-09-08T01:00:00.000Z', '2026-09-08', '2026-09-08T01:00:00.000Z', 'synthetic attack', 'web', 'source-abnormal-a16', 'A16', 'operational_observation', 'observation', 'attack', 'small', 'synthetic evidence', 'web');
INSERT INTO recording_events
  (id, organization_id, taxonomy_id, family, canonical_type, subtype, occurred_at, created_at, farm_id, house_id, flock_id,
   male_count, female_count, total_count, condition, source_channel, raw_text, client_operation_id, correction_of_id, lifecycle_status)
  VALUES ('rec-o1-correction', 'org-taxonomy-rehearsal', 'O1', 'operational_event', 'event', 'chick_in', '2026-09-01T00:00:00+08:00', '2026-09-08T02:00:00.000Z', 'farm-taxonomy-rehearsal', 'house-taxonomy-rehearsal', 'flock-taxonomy-rehearsal', 600, 400, 1000, 'good', 'web', 'synthetic correction', 'client-rec-o1-correction', 'rec-o1', 'corrected');
`;

try {
  run(["d1", "migrations", "apply", "DB", "--local", "--persist-to", persistTo]);
  run(["d1", "migrations", "apply", "DB", "--local", "--persist-to", persistTo]);
  rows(seedSql);

  const tableColumns = new Map();
  for (const table of ["recording_events", "operational_actions", "operational_events", "abnormal_events"]) {
    tableColumns.set(table, new Set(rows("PRAGMA table_info(" + table + ")").map((row) => row.name)));
  }
  const actionColumns = tableColumns.get("operational_actions");
  for (const legacyColumn of ["status", "completion_status", "action_state", "action_type"]) {
    assert.equal(actionColumns.has(legacyColumn), false, "no overlapping legacy action state: " + legacyColumn);
  }
  for (const required of ["taxonomy_id", "family", "canonical_type", "subtype", "workflow_status", "lifecycle_status", "client_operation_id"]) {
    assert.equal(actionColumns.has(required), true, "canonical action column: " + required);
  }
  for (const required of ["taxonomy_id", "family", "canonical_type", "subtype", "occurred_at", "source_channel", "client_operation_id", "lifecycle_status"]) {
    assert.equal(tableColumns.get("recording_events").has(required), true, "canonical event column: " + required);
  }
  for (const required of ["taxonomy_id", "family", "canonical_type", "subtype", "occurred_at", "source_channel"]) {
    assert.equal(tableColumns.get("operational_events").has(required), true, "legacy bridge column: " + required);
    assert.equal(tableColumns.get("abnormal_events").has(required), true, "observation bridge column: " + required);
  }
  for (const required of ["measured_temperature", "measurement", "evidence"]) {
    assert.equal(tableColumns.get("abnormal_events").has(required), true, "observation contract column: " + required);
  }

  assert.deepEqual(rows("SELECT id, intent, quantity FROM operational_events WHERE id = 'legacy-mortality'"), [{ id: "legacy-mortality", intent: "mortality", quantity: 5 }]);
  assert.deepEqual(rows("SELECT id, source_event_id FROM abnormal_events WHERE id = 'legacy-abnormal'"), [{ id: "legacy-abnormal", source_event_id: "legacy-abnormal-source-1" }]);
  assert.deepEqual(rows("SELECT taxonomy_id, subtype, total_count FROM recording_events WHERE id = 'rec-o1'"), [{ taxonomy_id: "O1", subtype: "chick_in", total_count: 1000 }]);
  assert.deepEqual(rows("SELECT taxonomy_id, subtype, workflow_status, reminder_due_at FROM operational_actions WHERE id = 'action-o6'"), [{ taxonomy_id: "O6", subtype: "lab_test", workflow_status: "waiting_result", reminder_due_at: "2026-09-11T01:00:00.000Z" }]);
  assert.deepEqual(rows("SELECT taxonomy_id, subtype, linked_mortality_event_id FROM abnormal_events WHERE id = 'abnormal-a1'"), [{ taxonomy_id: "A1", subtype: "mortality_abnormality", linked_mortality_event_id: "legacy-mortality" }]);
  assert.deepEqual(rows("SELECT taxonomy_id, subtype, evidence FROM abnormal_events WHERE id = 'abnormal-a16'"), [{ taxonomy_id: "A16", subtype: "attack", evidence: "synthetic evidence" }]);
  assert.deepEqual(rows("SELECT COUNT(*) AS count FROM recording_events WHERE taxonomy_id = 'O9'"), [{ count: 0 }]);
  assert.deepEqual(rows("SELECT COUNT(*) AS count FROM operational_events WHERE taxonomy_id = 'O9'"), [{ count: 1 }]);
  assert.deepEqual(rows("SELECT COUNT(*) AS count FROM recording_events WHERE correction_of_id = 'rec-o1'"), [{ count: 1 }]);

  const indexes = new Set(rows("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('idx_recording_events_lineage', 'idx_operational_actions_lineage', 'idx_abnormal_events_mortality_link')").map((row) => row.name));
  for (const name of ["idx_recording_events_lineage", "idx_operational_actions_lineage", "idx_abnormal_events_mortality_link"]) assert.equal(indexes.has(name), true, "lineage index: " + name);

  expectSqlFailure("PRAGMA foreign_keys = ON; INSERT INTO operational_actions (id, organization_id, taxonomy_id, family, canonical_type, subtype, occurred_at, farm_id, content, source_channel, raw_text, client_operation_id) VALUES ('bad-fk', 'org-taxonomy-rehearsal', 'O2', 'operational_action', 'action', 'vaccination', '2026-09-08T01:00:00.000Z', 'missing-farm', 'bad', 'web', 'bad', 'bad-fk-client');", "FOREIGN KEY");
  expectSqlFailure("INSERT INTO recording_events (id, organization_id, taxonomy_id, family, canonical_type, subtype, occurred_at, farm_id, house_id, flock_id, male_count, female_count, total_count, condition, source_channel, raw_text, client_operation_id) SELECT 'duplicate-client', organization_id, taxonomy_id, family, canonical_type, subtype, occurred_at, farm_id, house_id, flock_id, male_count, female_count, total_count, condition, source_channel, raw_text, client_operation_id FROM recording_events WHERE id = 'rec-o1';", "UNIQUE");
  expectSqlFailure("INSERT INTO operational_actions (id, organization_id, taxonomy_id, family, canonical_type, subtype, occurred_at, farm_id, submitted_at, content, workflow_status, source_channel, raw_text, client_operation_id) VALUES ('bad-o6', 'org-taxonomy-rehearsal', 'O6', 'operational_action', 'action', 'lab_test', '2026-09-08T01:00:00.000Z', 'farm-taxonomy-rehearsal', '2026-09-08T01:00:00.000Z', 'bad lab', 'completed', 'web', 'bad O6', 'bad-o6-client');", "CHECK");
  expectSqlFailure("INSERT INTO operational_events (id, organization_id, farm_id, line_group_id, intent, quantity, unit, event_date, raw_message, source_event_id, taxonomy_id, family, canonical_type, subtype, sex, total_weight, average_weight, weight_unit, occurred_at, source_channel) VALUES ('bad-o3', 'org-taxonomy-rehearsal', 'farm-taxonomy-rehearsal', 'group-taxonomy-rehearsal', 'shipment', 100, '隻', '2026-09-08', 'bad shipment', 'bad-o3-source', 'O3', 'operational_event', 'event', 'shipment', 'male', 180, 2, 'kg', '2026-09-08T01:00:00.000Z', 'web');", "canonical_average_weight_mismatch");
  expectSqlFailure("INSERT INTO recording_events (id, organization_id, taxonomy_id, family, canonical_type, subtype, occurred_at, farm_id, house_id, flock_id, average_weight, sex, chick_in_date, age_days, source_channel, raw_text, client_operation_id) VALUES ('bad-age', 'org-taxonomy-rehearsal', 'O4', 'operational_event', 'event', 'weigh', '2026-09-08T01:00:00.000Z', 'farm-taxonomy-rehearsal', 'house-taxonomy-rehearsal', 'flock-taxonomy-rehearsal', 1.8, 'mixed', '2026-09-01', 6, 'web', 'bad age', 'bad-age-client');", "CHECK");
  expectSqlFailure("INSERT INTO abnormal_events (id, organization_id, farm_id, occurred_date, reported_at, raw_text, source, source_event_id, taxonomy_id, family, canonical_type, subtype, source_channel) VALUES ('bad-a2', 'org-taxonomy-rehearsal', 'farm-taxonomy-rehearsal', '2026-09-08', '2026-09-08T01:00:00.000Z', 'bad abnormal', 'web', 'bad-a2-source', 'A2', 'operational_observation', 'observation', 'cough', 'web');", "canonical_abnormal_event_required_field");

  console.log("MIGRATION_REHEARSAL=PASS");
  console.log("OLD_ROWS_READABLE=YES");
  console.log("CANONICAL_ROUTES_INSERTABLE=YES");
  console.log("IDEMPOTENCY_AND_FOREIGN_KEYS=PASS");
  console.log("DERIVED_FIELD_GUARDS=PASS");
  console.log("ACTION_WORKFLOW_STATE_UNAMBIGUOUS=PASS");
} finally {
  fs.rmSync(persistTo, { recursive: true, force: true });
}
