-- Disposable local-only synthetic world for ONE-WATER LINE AI acceptance.
-- This file is never applied remotely and contains no Production identifiers.

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO organizations (id, name, active)
VALUES ('sim-org', 'ONE-WATER LOCAL SIMULATION', 1);

INSERT OR IGNORE INTO farms
  (id, organization_id, name, active, farm_total_equity_fraction,
   player_group_equity_fraction, environment, site_name, farm_structure_mode,
   note, version)
VALUES
  ('sim-farm-a', 'sim-org', '模擬甲場', 1, 0, 0, 'test', 'LOCAL-A', 'multi_house', 'synthetic only', 1),
  ('sim-farm-b', 'sim-org', '模擬乙場', 1, 0, 0, 'test', 'LOCAL-B', 'multi_house', 'synthetic only', 1),
  ('sim-farm-c', 'sim-org', '模擬丙場', 1, 0, 0, 'test', 'LOCAL-C', 'multi_house', 'synthetic only', 1);

INSERT OR IGNORE INTO houses
  (id, farm_id, name, normalized_name, capacity, active, note, version)
VALUES
  ('sim-house-a1', 'sim-farm-a', '甲一舍', '甲一舍', 200, 1, 'synthetic only', 1),
  ('sim-house-b1', 'sim-farm-b', '乙一舍', '乙一舍', 200, 1, 'synthetic only', 1),
  ('sim-house-c1', 'sim-farm-c', '丙一舍', '丙一舍', 200, 1, 'synthetic only', 1);

INSERT OR IGNORE INTO flocks
  (id, farm_id, house_id, batch_code, breed, chick_in_date, initial_count,
   expected_shipment_date, status, note, version)
VALUES
  ('sim-flock-a1', 'sim-farm-a', 'sim-house-a1', 'SIM-WATER-001', 'synthetic', '2026-01-01', 40, '2026-03-31', 'active', 'synthetic one-water flock', 1),
  ('sim-flock-b1', 'sim-farm-b', 'sim-house-b1', 'SIM-B-001', 'synthetic', '2026-01-01', 20, '2026-03-31', 'active', 'synthetic isolation flock', 1),
  ('sim-flock-c1', 'sim-farm-c', 'sim-house-c1', 'SIM-C-001', 'synthetic', '2026-01-01', 20, '2026-03-31', 'active', 'synthetic isolation flock', 1);

INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
VALUES
  ('sim-alias-a', 'sim-farm-a', '甲場', '甲場', 'short_name', 'trusted', 1),
  ('sim-alias-b', 'sim-farm-b', '乙場', '乙場', 'short_name', 'trusted', 1),
  ('sim-alias-c', 'sim-farm-c', '丙場', '丙場', 'short_name', 'trusted', 1);

INSERT OR IGNORE INTO caretakers
  (id, organization_id, name, normalized_name, active, note, version)
VALUES ('sim-caretaker', 'sim-org', '模擬照顧者', '模擬照顧者', 1, 'synthetic only', 1);

INSERT OR IGNORE INTO farm_caretaker_assignments
  (id, farm_id, caretaker_id, effective_from, effective_to, is_primary)
VALUES ('sim-caretaker-assignment', 'sim-farm-a', 'sim-caretaker', '2026-01-01', NULL, 1);

INSERT OR IGNORE INTO line_groups
  (group_id, status, farm_name, joined_at, bound_at, organization_id, farm_id, conversation_v2_enabled)
VALUES
  ('sim-line-primary', 'bound', '模擬甲場', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'sim-org', 'sim-farm-a', 0),
  ('sim-line-b', 'bound', '模擬乙場', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'sim-org', 'sim-farm-b', 0),
  ('sim-line-c', 'bound', '模擬丙場', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'sim-org', 'sim-farm-c', 0),
  ('sim-line-quiet', 'bound', '模擬甲場', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'sim-org', 'sim-farm-a', 0);

INSERT OR IGNORE INTO operator_identities
  (id, organization_id, identity_type, identity_key, display_name, active, version)
VALUES
  ('sim-operator-a', 'sim-org', 'line_user', 'sim-user-a', '模擬操作員甲', 1, 1),
  ('sim-operator-b', 'sim-org', 'line_user', 'sim-user-b', '模擬操作員乙', 1, 1),
  ('sim-operator-c', 'sim-org', 'line_user', 'sim-user-c', '模擬操作員丙', 1, 1),
  ('sim-operator-noise', 'sim-org', 'line_user', 'sim-user-noise', '模擬雜訊操作員', 1, 1),
  ('sim-operator-cross', 'sim-org', 'line_user', 'sim-user-cross', '模擬跨場操作員', 1, 1),
  ('sim-operator-menu', 'sim-org', 'line_user', 'sim-user-menu', '模擬選單操作員', 1, 1),
  ('sim-operator-candidate', 'sim-org', 'line_user', 'sim-user-candidate', '模擬候選操作員', 1, 1),
  ('sim-operator-ambient', 'sim-org', 'line_user', 'sim-user-ambient', '模擬環境操作員', 1, 1),
  ('sim-operator-query', 'sim-org', 'line_user', 'sim-user-query', '模擬查詢操作員', 1, 1),
  ('sim-operator-duplicate', 'sim-org', 'line_user', 'sim-user-duplicate', '模擬重送操作員', 1, 1),
  ('sim-web-admin', 'sim-org', 'web_admin', 'web-admin:sim-org', '模擬管理者', 1, 1);

INSERT OR IGNORE INTO operator_scope_bindings
  (id, operator_id, organization_id, environment, farm_id, house_id, flock_id, active)
VALUES
  ('sim-scope-a', 'sim-operator-a', 'sim-org', 'test', 'sim-farm-a', 'sim-house-a1', 'sim-flock-a1', 1),
  ('sim-scope-b', 'sim-operator-b', 'sim-org', 'test', 'sim-farm-b', 'sim-house-b1', 'sim-flock-b1', 1),
  ('sim-scope-c', 'sim-operator-c', 'sim-org', 'test', 'sim-farm-c', 'sim-house-c1', 'sim-flock-c1', 1),
  ('sim-scope-noise', 'sim-operator-noise', 'sim-org', 'test', 'sim-farm-a', 'sim-house-a1', 'sim-flock-a1', 1),
  ('sim-scope-cross', 'sim-operator-cross', 'sim-org', 'test', 'sim-farm-a', 'sim-house-a1', 'sim-flock-a1', 1),
  ('sim-scope-menu', 'sim-operator-menu', 'sim-org', 'test', 'sim-farm-a', 'sim-house-a1', 'sim-flock-a1', 1),
  ('sim-scope-candidate', 'sim-operator-candidate', 'sim-org', 'test', 'sim-farm-a', 'sim-house-a1', 'sim-flock-a1', 1),
  ('sim-scope-ambient', 'sim-operator-ambient', 'sim-org', 'test', 'sim-farm-a', 'sim-house-a1', 'sim-flock-a1', 1),
  ('sim-scope-query', 'sim-operator-query', 'sim-org', 'test', 'sim-farm-a', 'sim-house-a1', 'sim-flock-a1', 1),
  ('sim-scope-duplicate', 'sim-operator-duplicate', 'sim-org', 'test', 'sim-farm-a', 'sim-house-a1', 'sim-flock-a1', 1),
  ('sim-web-scope-a', 'sim-web-admin', 'sim-org', 'test', 'sim-farm-a', 'sim-house-a1', 'sim-flock-a1', 1),
  ('sim-web-scope-b', 'sim-web-admin', 'sim-org', 'test', 'sim-farm-b', 'sim-house-b1', 'sim-flock-b1', 1),
  ('sim-web-scope-c', 'sim-web-admin', 'sim-org', 'test', 'sim-farm-c', 'sim-house-c1', 'sim-flock-c1', 1);

INSERT OR IGNORE INTO line_group_operator_bindings
  (id, organization_id, line_group_id, operator_id, scope_binding_id, active)
VALUES
  ('sim-binding-a', 'sim-org', 'sim-line-primary', 'sim-operator-a', 'sim-scope-a', 1),
  ('sim-binding-b', 'sim-org', 'sim-line-b', 'sim-operator-b', 'sim-scope-b', 1),
  ('sim-binding-c', 'sim-org', 'sim-line-c', 'sim-operator-c', 'sim-scope-c', 1),
  ('sim-binding-noise', 'sim-org', 'sim-line-primary', 'sim-operator-noise', 'sim-scope-noise', 1),
  ('sim-binding-cross', 'sim-org', 'sim-line-primary', 'sim-operator-cross', 'sim-scope-cross', 1),
  ('sim-binding-menu', 'sim-org', 'sim-line-primary', 'sim-operator-menu', 'sim-scope-menu', 1),
  ('sim-binding-candidate', 'sim-org', 'sim-line-primary', 'sim-operator-candidate', 'sim-scope-candidate', 1),
  ('sim-binding-ambient', 'sim-org', 'sim-line-primary', 'sim-operator-ambient', 'sim-scope-ambient', 1),
  ('sim-binding-query', 'sim-org', 'sim-line-primary', 'sim-operator-query', 'sim-scope-query', 1),
  ('sim-binding-duplicate', 'sim-org', 'sim-line-primary', 'sim-operator-duplicate', 'sim-scope-duplicate', 1),
  ('sim-binding-quiet', 'sim-org', 'sim-line-quiet', 'sim-operator-a', 'sim-scope-a', 1);

INSERT OR IGNORE INTO admin_sessions
  (id, line_group_id, line_user_id, expires_at)
VALUES
  ('sim-admin-session', 'sim-line-primary', 'sim-user-admin', '2099-01-01T00:00:00.000Z');
