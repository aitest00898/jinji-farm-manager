-- Local-only Phase 2 fixture. Never run this file with --remote.
INSERT OR IGNORE INTO line_groups (group_id, status, organization_id)
VALUES ('local-phase2-group', 'unbound', 'org-mafu-investment');

INSERT OR IGNORE INTO houses
  (id, farm_id, name, normalized_name, capacity, active)
VALUES
  ('fixture-house-hongxiumei-1', 'farm-hong-xiumei', '1舍', '1舍', 1200, 1),
  ('fixture-house-hongxiumei-2', 'farm-hong-xiumei', '2舍', '2舍', 800, 1);

INSERT OR IGNORE INTO flocks
  (id, farm_id, house_id, batch_code, breed, chick_in_date, initial_count, expected_shipment_date, status)
VALUES
  ('fixture-flock-hongxiumei-1', 'farm-hong-xiumei', 'fixture-house-hongxiumei-1', 'PHASE2-1', '土雞', date('now', '-18 day'), 1000, date('now', '+3 day'), 'active'),
  ('fixture-flock-hongxiumei-2', 'farm-hong-xiumei', 'fixture-house-hongxiumei-2', 'PHASE2-2', '土雞', date('now', '-30 day'), 500, date('now', '+10 day'), 'active');

INSERT OR IGNORE INTO operational_events
  (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit,
   event_date, house, house_id, flock_id, raw_message, raw_farm_text, pending_action_id, source_event_id)
VALUES
  ('fixture-phase2-mortality', 'org-mafu-investment', 'farm-hong-xiumei', 'local-phase2-group', 'phase2-fixture-user', 'mortality', 5, '隻', date('now'), '1舍', 'fixture-house-hongxiumei-1', 'fixture-flock-hongxiumei-1', '洪秀美場1舍死亡5', '洪秀美場', NULL, 'fixture-phase2-mortality'),
  ('fixture-phase2-cull', 'org-mafu-investment', 'farm-hong-xiumei', 'local-phase2-group', 'phase2-fixture-user', 'cull', 2, '隻', date('now'), '1舍', 'fixture-house-hongxiumei-1', 'fixture-flock-hongxiumei-1', '洪秀美場1舍淘汰2', '洪秀美場', NULL, 'fixture-phase2-cull'),
  ('fixture-phase2-shipment', 'org-mafu-investment', 'farm-hong-xiumei', 'local-phase2-group', 'phase2-fixture-user', 'shipment', 100, '隻', date('now'), '1舍', 'fixture-house-hongxiumei-1', 'fixture-flock-hongxiumei-1', '洪秀美場1舍出雞100', '洪秀美場', NULL, 'fixture-phase2-shipment');
