-- The workbook was not present in the workspace. These values are the exact
-- authoritative import data supplied in the Production task prompt.
INSERT OR IGNORE INTO organizations
  (id, name, active)
VALUES
  ('org-mafu-investment', '大富翁雞場投資組合', 1);

INSERT OR IGNORE INTO farms
  (id, organization_id, name, active, farm_total_equity_fraction, player_group_equity_fraction)
SELECT 'farm-lin-zhiteng-erlin', id, '林志騰二林場', 1, 0.50, 0.10
  FROM organizations WHERE name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO farms
  (id, organization_id, name, active, farm_total_equity_fraction, player_group_equity_fraction)
SELECT 'farm-lin-zhiteng-dongshi', id, '林志騰東勢場', 1, 0.40, 0.20
  FROM organizations WHERE name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO farms
  (id, organization_id, name, active, farm_total_equity_fraction, player_group_equity_fraction)
SELECT 'farm-liao-caiyi', id, '廖纔藝場', 1, 0.50, 0.10
  FROM organizations WHERE name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO farms
  (id, organization_id, name, active, farm_total_equity_fraction, player_group_equity_fraction)
SELECT 'farm-chen-junbang-longtan', id, '陳駿榜龍潭場', 1, 0.10, 0.05
  FROM organizations WHERE name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO farms
  (id, organization_id, name, active, farm_total_equity_fraction, player_group_equity_fraction)
SELECT 'farm-hong-xiumei', id, '洪秀美場', 1, 0.30, 0.25
  FROM organizations WHERE name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO farms
  (id, organization_id, name, active, farm_total_equity_fraction, player_group_equity_fraction)
SELECT 'farm-huang-huiling-taibao', id, '黃惠玲太保場', 1, 0.30, 0.10
  FROM organizations WHERE name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO farms
  (id, organization_id, name, active, farm_total_equity_fraction, player_group_equity_fraction)
SELECT 'farm-lin-kaiwei', id, '林楷威場', 1, 0.25, 0.10
  FROM organizations WHERE name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO farms
  (id, organization_id, name, active, farm_total_equity_fraction, player_group_equity_fraction)
SELECT 'farm-hong-jiaqing', id, '洪嘉卿場', 1, 0.40, 0.20
  FROM organizations WHERE name = '大富翁雞場投資組合';

INSERT OR IGNORE INTO investors (id, organization_id, name, active)
SELECT 'investor-sugar', id, 'SUGAR', 1
  FROM organizations WHERE name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO investors (id, organization_id, name, active)
SELECT 'investor-he', id, '何先生', 1
  FROM organizations WHERE name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO investors (id, organization_id, name, active)
SELECT 'investor-chenghao', id, '承蠔', 1
  FROM organizations WHERE name = '大富翁雞場投資組合';

INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-erlin-sugar', f.id, i.id, 0.0333333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = 'SUGAR'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '林志騰二林場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-erlin-he', f.id, i.id, 0.0333333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '何先生'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '林志騰二林場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-erlin-chenghao', f.id, i.id, 0.0333333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '承蠔'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '林志騰二林場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-dongshi-sugar', f.id, i.id, 0.0666666666666667, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = 'SUGAR'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '林志騰東勢場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-dongshi-he', f.id, i.id, 0.0666666666666667, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '何先生'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '林志騰東勢場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-dongshi-chenghao', f.id, i.id, 0.0666666666666667, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '承蠔'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '林志騰東勢場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-liao-sugar', f.id, i.id, 0.0333333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = 'SUGAR'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '廖纔藝場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-liao-he', f.id, i.id, 0.0333333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '何先生'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '廖纔藝場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-liao-chenghao', f.id, i.id, 0.0333333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '承蠔'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '廖纔藝場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-longtan-sugar', f.id, i.id, 0.0166666666666667, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = 'SUGAR'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '陳駿榜龍潭場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-longtan-he', f.id, i.id, 0.0166666666666667, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '何先生'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '陳駿榜龍潭場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-longtan-chenghao', f.id, i.id, 0.0166666666666667, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '承蠔'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '陳駿榜龍潭場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-hongxiumei-sugar', f.id, i.id, 0.0833333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = 'SUGAR'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '洪秀美場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-hongxiumei-he', f.id, i.id, 0.0833333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '何先生'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '洪秀美場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-hongxiumei-chenghao', f.id, i.id, 0.0833333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '承蠔'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '洪秀美場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-huangtaibao-sugar', f.id, i.id, 0.0333333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = 'SUGAR'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '黃惠玲太保場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-huangtaibao-he', f.id, i.id, 0.0333333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '何先生'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '黃惠玲太保場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-huangtaibao-chenghao', f.id, i.id, 0.0333333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '承蠔'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '黃惠玲太保場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-linkaiwei-sugar', f.id, i.id, 0.0333333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = 'SUGAR'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '林楷威場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-linkaiwei-he', f.id, i.id, 0.0333333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '何先生'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '林楷威場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-linkaiwei-chenghao', f.id, i.id, 0.0333333333333333, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '承蠔'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '林楷威場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-hongjiaqing-sugar', f.id, i.id, 0.0666666666666667, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = 'SUGAR'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '洪嘉卿場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-hongjiaqing-he', f.id, i.id, 0.0666666666666667, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '何先生'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '洪嘉卿場';
INSERT OR IGNORE INTO farm_investor_equity
  (id, farm_id, investor_id, equity_fraction, source, effective_date)
SELECT 'equity-hongjiaqing-chenghao', f.id, i.id, 0.0666666666666667, '大富翁資料.xlsx', NULL
  FROM farms f JOIN organizations o ON o.id = f.organization_id
  JOIN investors i ON i.organization_id = o.id AND i.name = '承蠔'
 WHERE o.name = '大富翁雞場投資組合' AND f.name = '洪嘉卿場';

INSERT OR IGNORE INTO profit_distributions
  (id, organization_id, farm_id, distribution_date, source_date_roc, gross_profit_loss, allocated_profit_loss, expense, net_income, note, source_dataset, source_row_key)
SELECT 'dist-erlin-114-12-17', o.id, f.id, '2025-12-17', '114/12/17', 688462, 68846.2, 0, 68846.2, NULL, '大富翁資料.xlsx', '大富翁資料.xlsx|林志騰二林場|114/12/17'
  FROM organizations o JOIN farms f ON f.organization_id = o.id AND f.name = '林志騰二林場'
 WHERE o.name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO profit_distributions
  (id, organization_id, farm_id, distribution_date, source_date_roc, gross_profit_loss, allocated_profit_loss, expense, net_income, note, source_dataset, source_row_key)
SELECT 'dist-erlin-115-04-15', o.id, f.id, '2026-04-15', '115/04/15', 1166129, 116612.9, 0, 116612.9, NULL, '大富翁資料.xlsx', '大富翁資料.xlsx|林志騰二林場|115/04/15'
  FROM organizations o JOIN farms f ON f.organization_id = o.id AND f.name = '林志騰二林場'
 WHERE o.name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO profit_distributions
  (id, organization_id, farm_id, distribution_date, source_date_roc, gross_profit_loss, allocated_profit_loss, expense, net_income, note, source_dataset, source_row_key)
SELECT 'dist-erlin-115-08-12', o.id, f.id, '2026-08-12', '115/08/12', -133230, -13323, 4000, -17323, NULL, '大富翁資料.xlsx', '大富翁資料.xlsx|林志騰二林場|115/08/12'
  FROM organizations o JOIN farms f ON f.organization_id = o.id AND f.name = '林志騰二林場'
 WHERE o.name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO profit_distributions
  (id, organization_id, farm_id, distribution_date, source_date_roc, gross_profit_loss, allocated_profit_loss, expense, net_income, note, source_dataset, source_row_key)
SELECT 'dist-dongshi-115-03-25', o.id, f.id, '2026-03-25', '115/03/25', 351709, 70341.8, 0, 70341.8, NULL, '大富翁資料.xlsx', '大富翁資料.xlsx|林志騰東勢場|115/03/25'
  FROM organizations o JOIN farms f ON f.organization_id = o.id AND f.name = '林志騰東勢場'
 WHERE o.name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO profit_distributions
  (id, organization_id, farm_id, distribution_date, source_date_roc, gross_profit_loss, allocated_profit_loss, expense, net_income, note, source_dataset, source_row_key)
SELECT 'dist-dongshi-115-07-29', o.id, f.id, '2026-07-29', '115/07/29', -2805, -561, 1500, -2061, NULL, '大富翁資料.xlsx', '大富翁資料.xlsx|林志騰東勢場|115/07/29'
  FROM organizations o JOIN farms f ON f.organization_id = o.id AND f.name = '林志騰東勢場'
 WHERE o.name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO profit_distributions
  (id, organization_id, farm_id, distribution_date, source_date_roc, gross_profit_loss, allocated_profit_loss, expense, net_income, note, source_dataset, source_row_key)
SELECT 'dist-liao-115-07-22', o.id, f.id, '2026-07-22', '115/07/22', 58205, 5820.5, 0, 5820.5, NULL, '大富翁資料.xlsx', '大富翁資料.xlsx|廖纔藝場|115/07/22'
  FROM organizations o JOIN farms f ON f.organization_id = o.id AND f.name = '廖纔藝場'
 WHERE o.name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO profit_distributions
  (id, organization_id, farm_id, distribution_date, source_date_roc, gross_profit_loss, allocated_profit_loss, expense, net_income, note, source_dataset, source_row_key)
SELECT 'dist-liao-115-08-12', o.id, f.id, '2026-08-12', '115/08/12', 46635, 4663.5, 0, 4663.5, NULL, '大富翁資料.xlsx', '大富翁資料.xlsx|廖纔藝場|115/08/12'
  FROM organizations o JOIN farms f ON f.organization_id = o.id AND f.name = '廖纔藝場'
 WHERE o.name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO profit_distributions
  (id, organization_id, farm_id, distribution_date, source_date_roc, gross_profit_loss, allocated_profit_loss, expense, net_income, note, source_dataset, source_row_key)
SELECT 'dist-hongxiumei-115-07-15', o.id, f.id, '2026-07-15', '115/07/15', -84000, -21000, 0, -21000, NULL, '大富翁資料.xlsx', '大富翁資料.xlsx|洪秀美場|115/07/15'
  FROM organizations o JOIN farms f ON f.organization_id = o.id AND f.name = '洪秀美場'
 WHERE o.name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO profit_distributions
  (id, organization_id, farm_id, distribution_date, source_date_roc, gross_profit_loss, allocated_profit_loss, expense, net_income, note, source_dataset, source_row_key)
SELECT 'dist-hongxiumei-115-08-12', o.id, f.id, '2026-08-12', '115/08/12', 55856, 13964, 0, 13964, NULL, '大富翁資料.xlsx', '大富翁資料.xlsx|洪秀美場|115/08/12'
  FROM organizations o JOIN farms f ON f.organization_id = o.id AND f.name = '洪秀美場'
 WHERE o.name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO profit_distributions
  (id, organization_id, farm_id, distribution_date, source_date_roc, gross_profit_loss, allocated_profit_loss, expense, net_income, note, source_dataset, source_row_key)
SELECT 'dist-huangtaibao-115-02-25', o.id, f.id, '2026-02-25', '115/02/25', 1207909, 120790.9, 0, 120790.9, NULL, '大富翁資料.xlsx', '大富翁資料.xlsx|黃惠玲太保場|115/02/25'
  FROM organizations o JOIN farms f ON f.organization_id = o.id AND f.name = '黃惠玲太保場'
 WHERE o.name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO profit_distributions
  (id, organization_id, farm_id, distribution_date, source_date_roc, gross_profit_loss, allocated_profit_loss, expense, net_income, note, source_dataset, source_row_key)
SELECT 'dist-huangtaibao-115-06-17', o.id, f.id, '2026-06-17', '115/06/17', 641478, 64147.8, 0, 64147.8, NULL, '大富翁資料.xlsx', '大富翁資料.xlsx|黃惠玲太保場|115/06/17'
  FROM organizations o JOIN farms f ON f.organization_id = o.id AND f.name = '黃惠玲太保場'
 WHERE o.name = '大富翁雞場投資組合';
INSERT OR IGNORE INTO profit_distributions
  (id, organization_id, farm_id, distribution_date, source_date_roc, gross_profit_loss, allocated_profit_loss, expense, net_income, note, source_dataset, source_row_key)
SELECT 'dist-huangtaibao-115-08-12', o.id, f.id, '2026-08-12', '115/08/12', 45350, 4535, 0, 4535, NULL, '大富翁資料.xlsx', '大富翁資料.xlsx|黃惠玲太保場|115/08/12'
  FROM organizations o JOIN farms f ON f.organization_id = o.id AND f.name = '黃惠玲太保場'
 WHERE o.name = '大富翁雞場投資組合';

INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-erlin-114-12-17-sugar', d.id, i.id, 22948.73333333333
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = 'SUGAR'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰二林場|114/12/17';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-erlin-114-12-17-he', d.id, i.id, 22948.73333333333
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '何先生'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰二林場|114/12/17';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-erlin-114-12-17-chenghao', d.id, i.id, 22948.73333333333
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '承蠔'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰二林場|114/12/17';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-erlin-115-04-15-sugar', d.id, i.id, 38870.96666666667
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = 'SUGAR'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰二林場|115/04/15';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-erlin-115-04-15-he', d.id, i.id, 38870.96666666667
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '何先生'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰二林場|115/04/15';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-erlin-115-04-15-chenghao', d.id, i.id, 38870.96666666667
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '承蠔'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰二林場|115/04/15';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-erlin-115-08-12-sugar', d.id, i.id, -5774.333333333333
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = 'SUGAR'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰二林場|115/08/12';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-erlin-115-08-12-he', d.id, i.id, -5774.333333333333
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '何先生'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰二林場|115/08/12';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-erlin-115-08-12-chenghao', d.id, i.id, -5774.333333333333
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '承蠔'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰二林場|115/08/12';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-dongshi-115-03-25-sugar', d.id, i.id, 23447.266666666666
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = 'SUGAR'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰東勢場|115/03/25';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-dongshi-115-03-25-he', d.id, i.id, 23447.266666666666
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '何先生'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰東勢場|115/03/25';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-dongshi-115-03-25-chenghao', d.id, i.id, 23447.266666666666
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '承蠔'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰東勢場|115/03/25';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-dongshi-115-07-29-sugar', d.id, i.id, -687
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = 'SUGAR'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰東勢場|115/07/29';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-dongshi-115-07-29-he', d.id, i.id, -687
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '何先生'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰東勢場|115/07/29';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-dongshi-115-07-29-chenghao', d.id, i.id, -687
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '承蠔'
 WHERE d.source_row_key = '大富翁資料.xlsx|林志騰東勢場|115/07/29';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-liao-115-07-22-sugar', d.id, i.id, 1940.1666666666665
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = 'SUGAR'
 WHERE d.source_row_key = '大富翁資料.xlsx|廖纔藝場|115/07/22';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-liao-115-07-22-he', d.id, i.id, 1940.1666666666665
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '何先生'
 WHERE d.source_row_key = '大富翁資料.xlsx|廖纔藝場|115/07/22';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-liao-115-07-22-chenghao', d.id, i.id, 1940.1666666666665
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '承蠔'
 WHERE d.source_row_key = '大富翁資料.xlsx|廖纔藝場|115/07/22';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-liao-115-08-12-sugar', d.id, i.id, 1554.5
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = 'SUGAR'
 WHERE d.source_row_key = '大富翁資料.xlsx|廖纔藝場|115/08/12';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-liao-115-08-12-he', d.id, i.id, 1554.5
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '何先生'
 WHERE d.source_row_key = '大富翁資料.xlsx|廖纔藝場|115/08/12';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-liao-115-08-12-chenghao', d.id, i.id, 1554.5
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '承蠔'
 WHERE d.source_row_key = '大富翁資料.xlsx|廖纔藝場|115/08/12';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-hongxiumei-115-07-15-sugar', d.id, i.id, -7000
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = 'SUGAR'
 WHERE d.source_row_key = '大富翁資料.xlsx|洪秀美場|115/07/15';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-hongxiumei-115-07-15-he', d.id, i.id, -7000
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '何先生'
 WHERE d.source_row_key = '大富翁資料.xlsx|洪秀美場|115/07/15';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-hongxiumei-115-07-15-chenghao', d.id, i.id, -7000
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '承蠔'
 WHERE d.source_row_key = '大富翁資料.xlsx|洪秀美場|115/07/15';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-hongxiumei-115-08-12-sugar', d.id, i.id, 4654.666666666666
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = 'SUGAR'
 WHERE d.source_row_key = '大富翁資料.xlsx|洪秀美場|115/08/12';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-hongxiumei-115-08-12-he', d.id, i.id, 4654.666666666666
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '何先生'
 WHERE d.source_row_key = '大富翁資料.xlsx|洪秀美場|115/08/12';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-hongxiumei-115-08-12-chenghao', d.id, i.id, 4654.666666666666
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '承蠔'
 WHERE d.source_row_key = '大富翁資料.xlsx|洪秀美場|115/08/12';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-huangtaibao-115-02-25-sugar', d.id, i.id, 40263.63333333333
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = 'SUGAR'
 WHERE d.source_row_key = '大富翁資料.xlsx|黃惠玲太保場|115/02/25';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-huangtaibao-115-02-25-he', d.id, i.id, 40263.63333333333
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '何先生'
 WHERE d.source_row_key = '大富翁資料.xlsx|黃惠玲太保場|115/02/25';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-huangtaibao-115-02-25-chenghao', d.id, i.id, 40263.63333333333
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '承蠔'
 WHERE d.source_row_key = '大富翁資料.xlsx|黃惠玲太保場|115/02/25';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-huangtaibao-115-06-17-sugar', d.id, i.id, 21382.6
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = 'SUGAR'
 WHERE d.source_row_key = '大富翁資料.xlsx|黃惠玲太保場|115/06/17';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-huangtaibao-115-06-17-he', d.id, i.id, 21382.6
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '何先生'
 WHERE d.source_row_key = '大富翁資料.xlsx|黃惠玲太保場|115/06/17';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-huangtaibao-115-06-17-chenghao', d.id, i.id, 21382.6
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '承蠔'
 WHERE d.source_row_key = '大富翁資料.xlsx|黃惠玲太保場|115/06/17';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-huangtaibao-115-08-12-sugar', d.id, i.id, 1511.6666666666665
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = 'SUGAR'
 WHERE d.source_row_key = '大富翁資料.xlsx|黃惠玲太保場|115/08/12';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-huangtaibao-115-08-12-he', d.id, i.id, 1511.6666666666665
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '何先生'
 WHERE d.source_row_key = '大富翁資料.xlsx|黃惠玲太保場|115/08/12';
INSERT OR IGNORE INTO profit_distribution_allocations
  (id, distribution_id, investor_id, amount)
SELECT 'alloc-huangtaibao-115-08-12-chenghao', d.id, i.id, 1511.6666666666665
  FROM profit_distributions d JOIN investors i ON i.organization_id = d.organization_id AND i.name = '承蠔'
 WHERE d.source_row_key = '大富翁資料.xlsx|黃惠玲太保場|115/08/12';

-- The existing private group was the only current line_groups row. Bind it to
-- the portfolio without changing its legacy status or farm_name.
UPDATE line_groups
   SET organization_id = (SELECT id FROM organizations WHERE name = '大富翁雞場投資組合')
 WHERE group_id = 'Ce96852f54b6751ca9954ce977e3c17b2'
   AND (organization_id IS NULL OR organization_id = (SELECT id FROM organizations WHERE name = '大富翁雞場投資組合'));
