INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-erlin-lin-zhiteng', f.id, '林志騰二林', '林志騰二林', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '林志騰二林場' AND f.organization_id = 'org-mafu-investment';
INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-erlin-erlin', f.id, '二林場', '二林', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '林志騰二林場' AND f.organization_id = 'org-mafu-investment';
INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-erlin-erlin-short', f.id, '二林', '二林', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '林志騰二林場' AND f.organization_id = 'org-mafu-investment';

INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-dongshi-lin-zhiteng', f.id, '林志騰東勢', '林志騰東勢', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '林志騰東勢場' AND f.organization_id = 'org-mafu-investment';
INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-dongshi-dongshi', f.id, '東勢場', '東勢', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '林志騰東勢場' AND f.organization_id = 'org-mafu-investment';
INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-dongshi-dongshi-short', f.id, '東勢', '東勢', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '林志騰東勢場' AND f.organization_id = 'org-mafu-investment';

INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-liao-caiyi', f.id, '廖纔藝', '廖纔藝', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '廖纔藝場' AND f.organization_id = 'org-mafu-investment';
INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-liao-caiyi-short', f.id, '纔藝場', '纔藝', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '廖纔藝場' AND f.organization_id = 'org-mafu-investment';

INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-longtan-chen-junbang', f.id, '陳駿榜', '陳駿榜', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '陳駿榜龍潭場' AND f.organization_id = 'org-mafu-investment';
INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-longtan-longtan', f.id, '龍潭場', '龍潭', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '陳駿榜龍潭場' AND f.organization_id = 'org-mafu-investment';
INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-longtan-longtan-short', f.id, '龍潭', '龍潭', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '陳駿榜龍潭場' AND f.organization_id = 'org-mafu-investment';

INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-hongxiumei', f.id, '洪秀美', '洪秀美', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '洪秀美場' AND f.organization_id = 'org-mafu-investment';
INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-hongxiumei-short', f.id, '秀美場', '秀美', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '洪秀美場' AND f.organization_id = 'org-mafu-investment';

INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-huang-huiling', f.id, '黃惠玲', '黃惠玲', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '黃惠玲太保場' AND f.organization_id = 'org-mafu-investment';
INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-taibao-taibao', f.id, '太保場', '太保', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '黃惠玲太保場' AND f.organization_id = 'org-mafu-investment';
INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-taibao-taibao-short', f.id, '太保', '太保', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '黃惠玲太保場' AND f.organization_id = 'org-mafu-investment';

INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-linkaiwei', f.id, '林楷威', '林楷威', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '林楷威場' AND f.organization_id = 'org-mafu-investment';
INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-linkaiwei-short', f.id, '楷威場', '楷威', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '林楷威場' AND f.organization_id = 'org-mafu-investment';

INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-hongjiaqing', f.id, '洪嘉卿', '洪嘉卿', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '洪嘉卿場' AND f.organization_id = 'org-mafu-investment';
INSERT OR IGNORE INTO farm_aliases
  (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count)
SELECT 'alias-hongjiaqing-short', f.id, '嘉卿場', '嘉卿', 'short_name', 'trusted', 0
  FROM farms f WHERE f.name = '洪嘉卿場' AND f.organization_id = 'org-mafu-investment';
