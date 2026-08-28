CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS farms (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  farm_total_equity_fraction REAL NOT NULL CHECK (farm_total_equity_fraction >= 0 AND farm_total_equity_fraction <= 1),
  player_group_equity_fraction REAL NOT NULL CHECK (player_group_equity_fraction >= 0 AND player_group_equity_fraction <= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, name)
);

ALTER TABLE line_groups ADD COLUMN organization_id TEXT REFERENCES organizations(id);

ALTER TABLE daily_records ADD COLUMN farm_id TEXT REFERENCES farms(id);

CREATE TABLE IF NOT EXISTS investors (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS farm_investor_equity (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  investor_id TEXT NOT NULL REFERENCES investors(id),
  equity_fraction REAL NOT NULL CHECK (equity_fraction >= 0 AND equity_fraction <= 1),
  source TEXT NOT NULL,
  effective_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (farm_id, investor_id)
);

CREATE TABLE IF NOT EXISTS profit_distributions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  farm_id TEXT NOT NULL REFERENCES farms(id),
  distribution_date TEXT NOT NULL,
  source_date_roc TEXT NOT NULL,
  gross_profit_loss REAL NOT NULL,
  allocated_profit_loss REAL NOT NULL,
  expense REAL NOT NULL DEFAULT 0,
  net_income REAL NOT NULL,
  note TEXT,
  source_dataset TEXT NOT NULL,
  source_row_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profit_distribution_allocations (
  id TEXT PRIMARY KEY,
  distribution_id TEXT NOT NULL REFERENCES profit_distributions(id),
  investor_id TEXT NOT NULL REFERENCES investors(id),
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (distribution_id, investor_id)
);

CREATE TABLE IF NOT EXISTS line_user_investor_links (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  line_user_id TEXT NOT NULL,
  investor_id TEXT REFERENCES investors(id),
  status TEXT NOT NULL DEFAULT 'unlinked' CHECK (status IN ('unlinked', 'linked', 'inactive')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, line_user_id)
);

CREATE INDEX IF NOT EXISTS idx_line_groups_organization
  ON line_groups (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_daily_records_farm_lookup
  ON daily_records (farm_id, record_date, house, record_type);

CREATE INDEX IF NOT EXISTS idx_farms_organization
  ON farms (organization_id, active, name);

CREATE INDEX IF NOT EXISTS idx_investors_organization
  ON investors (organization_id, active, name);

CREATE INDEX IF NOT EXISTS idx_profit_distributions_organization
  ON profit_distributions (organization_id, farm_id, distribution_date);

CREATE INDEX IF NOT EXISTS idx_profit_allocations_investor
  ON profit_distribution_allocations (investor_id, distribution_id);

CREATE INDEX IF NOT EXISTS idx_line_user_investor_links
  ON line_user_investor_links (organization_id, line_user_id, status);
