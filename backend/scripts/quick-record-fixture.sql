-- Local-only quick-record fixture. Never run this file with --remote.
INSERT OR IGNORE INTO line_groups (group_id, status, organization_id)
VALUES ('local-quick-record-group', 'unbound', 'org-mafu-investment');

INSERT OR IGNORE INTO farms
  (id, organization_id, name, active, farm_total_equity_fraction,
   player_group_equity_fraction, environment, farm_structure_mode, note)
VALUES
  ('farm-local-quick-record', 'org-mafu-investment', '金雞測試場', 1, 0, 0,
   'test', 'multi_house', 'local quick-record fixture');

INSERT OR IGNORE INTO farms
  (id, organization_id, name, active, farm_total_equity_fraction,
   player_group_equity_fraction, environment, farm_structure_mode, note)
VALUES
  ('farm-local-quick-record-b', 'org-mafu-investment', '金雞測試場B', 1, 0, 0,
   'test', 'whole_farm', 'local quick-record move fixture');

INSERT OR IGNORE INTO houses
  (id, farm_id, name, normalized_name, capacity, active)
VALUES
  ('house-local-quick-record-1', 'farm-local-quick-record', '測試1舍', '測試1舍', 1200, 1);

INSERT OR IGNORE INTO flocks
  (id, farm_id, house_id, batch_code, breed, chick_in_date, initial_count,
   expected_shipment_date, status)
VALUES
  ('flock-local-quick-record-1', 'farm-local-quick-record', 'house-local-quick-record-1',
   'QUICK-RECORD-001', '土雞', date('now'), 1000, date('now', '+90 day'), 'active');

UPDATE farms SET active = 1, environment = 'test', farm_structure_mode = 'multi_house', updated_at = CURRENT_TIMESTAMP
 WHERE id = 'farm-local-quick-record';
UPDATE farms SET active = 1, environment = 'test', farm_structure_mode = 'whole_farm', updated_at = CURRENT_TIMESTAMP
 WHERE id = 'farm-local-quick-record-b';
UPDATE houses SET active = 1, updated_at = CURRENT_TIMESTAMP
 WHERE id = 'house-local-quick-record-1';
UPDATE flocks SET status = 'active', updated_at = CURRENT_TIMESTAMP
 WHERE id = 'flock-local-quick-record-1';
