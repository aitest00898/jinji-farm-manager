-- Local-only integration fixture. This file is never used by the remote import.
INSERT OR IGNORE INTO line_groups (group_id, status, organization_id)
VALUES ('local-operational-group', 'unbound', 'org-mafu-investment');

INSERT OR IGNORE INTO operational_events
  (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit,
   event_date, house, flock_id, raw_message, raw_farm_text, pending_action_id, source_event_id)
VALUES
  ('fixture-op-hongxiumei-mortality', 'org-mafu-investment', 'farm-hong-xiumei', 'local-operational-group', 'fixture-user', 'mortality', 5, '隻', date('now'), NULL, NULL, '洪秀美場死亡5', '洪秀美場', NULL, 'fixture-event-hongxiumei-mortality'),
  ('fixture-op-hongjiaqing-mortality', 'org-mafu-investment', 'farm-hong-jiaqing', 'local-operational-group', 'fixture-user', 'mortality', 2, '隻', date('now'), NULL, NULL, '洪嘉卿場死亡2', '洪嘉卿場', NULL, 'fixture-event-hongjiaqing-mortality'),
  ('fixture-op-dongshi-feed', 'org-mafu-investment', 'farm-lin-zhiteng-dongshi', 'local-operational-group', 'fixture-user', 'feed', 800, 'kg', date('now'), NULL, NULL, '東勢飼料800kg', '東勢', NULL, 'fixture-event-dongshi-feed'),
  ('fixture-op-taibao-water', 'org-mafu-investment', 'farm-huang-huiling-taibao', 'local-operational-group', 'fixture-user', 'water', 2300, 'L', date('now'), NULL, NULL, '太保場飲水2.3噸', '太保場', NULL, 'fixture-event-taibao-water');
