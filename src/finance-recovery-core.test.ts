import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  applyFinanceRecovery,
  discoverFinanceRecovery,
  dryRunFinanceRecovery,
  type FinanceRecoveryApplyRequest,
  type FinanceRecoveryRequest,
} from "./finance-recovery-core";

type SqlValue = string | number | null;

const ORGANIZATION_ID = "org-finance-recovery-test";
const FARM_ID = "farm-finance-recovery-test";
const EQUITY_ID = "equity-finance-recovery-test";
const DISTRIBUTION_ID = "distribution-finance-recovery-test";
const ALLOCATION_A_ID = "allocation-finance-a";
const ALLOCATION_B_ID = "allocation-finance-b";

class MemoryD1 {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec(`
      CREATE TABLE farms (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        environment TEXT NOT NULL,
        farm_total_equity_fraction REAL NOT NULL
      );
      CREATE TABLE farm_investor_equity (
        id TEXT PRIMARY KEY,
        farm_id TEXT NOT NULL,
        investor_id TEXT NOT NULL,
        equity_fraction REAL NOT NULL,
        source TEXT NOT NULL,
        effective_date TEXT,
        updated_at TEXT
      );
      CREATE TABLE profit_distributions (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        farm_id TEXT NOT NULL,
        distribution_date TEXT NOT NULL,
        source_date_roc TEXT NOT NULL,
        gross_profit_loss REAL NOT NULL,
        allocated_profit_loss REAL NOT NULL,
        expense REAL NOT NULL,
        net_income REAL NOT NULL,
        note TEXT,
        source_dataset TEXT NOT NULL,
        source_row_key TEXT NOT NULL,
        updated_at TEXT
      );
      CREATE TABLE profit_distribution_allocations (
        id TEXT PRIMARY KEY,
        distribution_id TEXT NOT NULL,
        investor_id TEXT NOT NULL,
        amount REAL NOT NULL
      );
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        source TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        actor_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        changed_fields_json TEXT,
        reason TEXT,
        request_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TRIGGER audit_logs_no_update
      BEFORE UPDATE ON audit_logs
      BEGIN
        SELECT RAISE(ABORT, 'audit_logs_are_append_only');
      END;
      CREATE TRIGGER audit_logs_no_delete
      BEFORE DELETE ON audit_logs
      BEGIN
        SELECT RAISE(ABORT, 'audit_logs_are_append_only');
      END;
    `);
    this.sqlite.prepare(
      `INSERT INTO farms (id, organization_id, environment, farm_total_equity_fraction) VALUES (?, ?, 'test', 0.5)`,
    ).run(FARM_ID, ORGANIZATION_ID);
    this.sqlite.prepare(
      `INSERT INTO farm_investor_equity (id, farm_id, investor_id, equity_fraction, source, effective_date, updated_at)
       VALUES (?, ?, 'investor-a', 0.2, 'import', '2026-01-01', '2026-01-01')`,
    ).run(EQUITY_ID, FARM_ID);
    this.sqlite.prepare(
      `INSERT INTO profit_distributions
        (id, organization_id, farm_id, distribution_date, source_date_roc, gross_profit_loss,
         allocated_profit_loss, expense, net_income, note, source_dataset, source_row_key, updated_at)
       VALUES (?, ?, ?, '2026-02-01', '115-02-01', 1000, 300, 20, 280, 'current', 'fixture', 'dist-row-1', '2026-02-01')`,
    ).run(DISTRIBUTION_ID, ORGANIZATION_ID, FARM_ID);
    this.sqlite.prepare(
      `INSERT INTO profit_distribution_allocations (id, distribution_id, investor_id, amount) VALUES
        (?, ?, 'investor-a', 150), (?, ?, 'investor-b', 150)`,
    ).run(ALLOCATION_A_ID, DISTRIBUTION_ID, ALLOCATION_B_ID, DISTRIBUTION_ID);
    this.insertAudit("audit-finance-equity", "farm_investor_equity", EQUITY_ID, {
      id: EQUITY_ID,
      farmId: FARM_ID,
      investorId: "investor-a",
      equityFraction: 0.1,
      source: "import",
      effectiveDate: "2026-01-01",
    }, {
      id: EQUITY_ID,
      farmId: FARM_ID,
      investorId: "investor-a",
      equityFraction: 0.2,
      source: "import",
      effectiveDate: "2026-01-01",
    });
    this.insertAudit("audit-finance-distribution", "profit_distribution", DISTRIBUTION_ID, {
      id: DISTRIBUTION_ID,
      organizationId: ORGANIZATION_ID,
      farmId: FARM_ID,
      distributionDate: "2026-02-01",
      sourceDateRoc: "115-02-01",
      grossProfitLoss: 900,
      allocatedProfitLoss: 200,
      expense: 10,
      netIncome: 190,
      note: "before",
      sourceDataset: "fixture",
      sourceRowKey: "dist-row-1",
      allocations: [
        { id: ALLOCATION_A_ID, distributionId: DISTRIBUTION_ID, investorId: "investor-a", amount: 100 },
        { id: ALLOCATION_B_ID, distributionId: DISTRIBUTION_ID, investorId: "investor-b", amount: 100 },
      ],
    }, {
      id: DISTRIBUTION_ID,
      organizationId: ORGANIZATION_ID,
      farmId: FARM_ID,
      distributionDate: "2026-02-01",
      sourceDateRoc: "115-02-01",
      grossProfitLoss: 1000,
      allocatedProfitLoss: 300,
      expense: 20,
      netIncome: 280,
      note: "current",
      sourceDataset: "fixture",
      sourceRowKey: "dist-row-1",
      allocations: [
        { id: ALLOCATION_A_ID, distributionId: DISTRIBUTION_ID, investorId: "investor-a", amount: 150 },
        { id: ALLOCATION_B_ID, distributionId: DISTRIBUTION_ID, investorId: "investor-b", amount: 150 },
      ],
    });
  }

  insertAudit(id: string, entityType: string, entityId: string, before: unknown, after: unknown): void {
    this.sqlite.prepare(
      `INSERT INTO audit_logs
        (id, organization_id, source, actor_type, actor_id, action, entity_type, entity_id,
         before_json, after_json, changed_fields_json, reason, request_id, created_at)
       VALUES (?, ?, 'web', 'web_admin', 'fixture-admin', 'update', ?, ?, ?, ?, '[]', 'fixture', ?, '2026-03-01T00:00:00.000Z')`,
    ).run(id, ORGANIZATION_ID, entityType, entityId, JSON.stringify(before), JSON.stringify(after), `request:${id}`);
  }

  prepare(sql: string) {
    return new MemoryPreparedStatement(this.sqlite, sql);
  }

  async batch(statements: MemoryPreparedStatement[]) {
    this.sqlite.exec("BEGIN");
    try {
      for (const statement of statements) await statement.run();
      this.sqlite.exec("COMMIT");
      return [];
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

class MemoryPreparedStatement {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly sql: string,
    private readonly values: SqlValue[] = [],
  ) {}

  bind(...values: SqlValue[]) {
    return new MemoryPreparedStatement(this.sqlite, this.sql, values);
  }

  async first<T>(): Promise<T | null> {
    return (this.sqlite.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.sqlite.prepare(this.sql).all(...this.values) as T[] };
  }

  async run(): Promise<{ success: true }> {
    this.sqlite.prepare(this.sql).run(...this.values);
    return { success: true };
  }
}

const readContext = {
  organizationId: ORGANIZATION_ID,
  actorType: "web_admin" as const,
  actorId: "admin-finance-test",
  requestId: "finance-read-request",
};

const applyContext = {
  ...readContext,
  requestId: "finance-apply-request",
};

function request(overrides: Partial<FinanceRecoveryRequest> = {}): FinanceRecoveryRequest {
  return {
    environment: "test",
    auditId: "audit-finance-equity",
    targetType: "farm_investor_equity",
    targetId: EQUITY_ID,
    clientOperationId: "finance-equity-operation",
    reason: "恢復已核實的 Finance 歷史值",
    ...overrides,
  };
}

function applyRequest(base: FinanceRecoveryRequest, dryRun: Awaited<ReturnType<typeof dryRunFinanceRecovery>>): FinanceRecoveryApplyRequest {
  return { ...base, stateFingerprint: dryRun.stateFingerprint, dryRunToken: dryRun.dryRunToken };
}

describe("Finance recovery core", () => {
  it("dry-runs isolated equity recovery without mutation, then applies and replays idempotently", async () => {
    const db = new MemoryD1();
    const input = request();
    const beforeAuditCount = (db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number }).count;
    const dryRun = await dryRunFinanceRecovery({ DB: db as unknown as D1Database }, readContext, input);
    expect(dryRun).toMatchObject({
      targetType: "farm_investor_equity",
      dependencyImpact: { kind: "ISOLATED" },
      applyEligibility: "ELIGIBLE",
    });
    expect((db.sqlite.prepare("SELECT equity_fraction AS value FROM farm_investor_equity WHERE id = ?").get(EQUITY_ID) as { value: number }).value).toBe(0.2);
    expect((db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number }).count).toBe(beforeAuditCount);

    const first = await applyFinanceRecovery({ DB: db as unknown as D1Database, CANONICAL_WRITE_HOLD: "OFF" }, applyContext, applyRequest(input, dryRun));
    expect(first).toMatchObject({ status: "APPLIED", applied: true, idempotent: false, targetType: "farm_investor_equity" });
    expect((db.sqlite.prepare("SELECT equity_fraction AS value FROM farm_investor_equity WHERE id = ?").get(EQUITY_ID) as { value: number }).value).toBe(0.1);
    expect((db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number }).count).toBe(beforeAuditCount + 1);
    expect(db.sqlite.prepare("SELECT id FROM audit_logs WHERE id = ?").get(first.recoveryAuditId)).toEqual({ id: first.recoveryAuditId });
    const recoveryAudit = db.sqlite.prepare("SELECT before_json AS beforeJson, after_json AS afterJson FROM audit_logs WHERE id = ?").get(first.recoveryAuditId) as { beforeJson: string; afterJson: string };
    expect(JSON.parse(recoveryAudit.beforeJson)).toMatchObject({ current: { id: EQUITY_ID }, dependencyImpact: { kind: "ISOLATED" } });
    expect(JSON.parse(recoveryAudit.afterJson)).toMatchObject({ actualResult: { id: EQUITY_ID, equityFraction: 0.1 }, recoveryLineage: { sourceAuditId: input.auditId } });

    const auditCount = (db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number }).count;
    const replay = await applyFinanceRecovery({ DB: db as unknown as D1Database, CANONICAL_WRITE_HOLD: "OFF" }, applyContext, applyRequest(input, dryRun));
    expect(replay).toMatchObject({ status: "APPLIED", applied: false, idempotent: true, recoveryAuditId: first.recoveryAuditId });
    expect((db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number }).count).toBe(auditCount);
    expect((db.sqlite.prepare("SELECT equity_fraction AS value FROM farm_investor_equity WHERE id = ?").get(EQUITY_ID) as { value: number }).value).toBe(0.1);
    db.sqlite.close();
  });

  it("dry-runs and applies distribution plus allocations as one dependency-aware recovery", async () => {
    const db = new MemoryD1();
    const input = request({
      auditId: "audit-finance-distribution",
      targetType: "profit_distribution",
      targetId: DISTRIBUTION_ID,
      clientOperationId: "finance-distribution-operation",
    });
    const beforeRows = db.sqlite.prepare("SELECT allocated_profit_loss AS allocated, expense, net_income AS net FROM profit_distributions WHERE id = ?").get(DISTRIBUTION_ID);
    const dryRun = await dryRunFinanceRecovery({ DB: db as unknown as D1Database }, readContext, input);
    expect(dryRun).toMatchObject({
      dependencyImpact: { kind: "DEPENDENCY_AWARE" },
      applyEligibility: "ELIGIBLE",
      derivedAfter: { allocationTotals: [expect.objectContaining({ allocated: 200, allocationTotal: 200, consistent: true })] },
    });
    expect(db.sqlite.prepare("SELECT allocated_profit_loss AS allocated, expense, net_income AS net FROM profit_distributions WHERE id = ?").get(DISTRIBUTION_ID)).toEqual(beforeRows);

    const first = await applyFinanceRecovery({ DB: db as unknown as D1Database, CANONICAL_WRITE_HOLD: "OFF" }, applyContext, applyRequest(input, dryRun));
    expect(first).toMatchObject({ status: "APPLIED", applied: true, idempotent: false });
    expect(db.sqlite.prepare("SELECT allocated_profit_loss AS allocated, expense, net_income AS net FROM profit_distributions WHERE id = ?").get(DISTRIBUTION_ID)).toEqual({ allocated: 200, expense: 10, net: 190 });
    expect(db.sqlite.prepare("SELECT amount FROM profit_distribution_allocations WHERE id = ?").get(ALLOCATION_A_ID)).toEqual({ amount: 100 });
    expect(db.sqlite.prepare("SELECT amount FROM profit_distribution_allocations WHERE id = ?").get(ALLOCATION_B_ID)).toEqual({ amount: 100 });
    expect(first.authoritativeReadback?.derived.allocationTotals).toEqual([expect.objectContaining({ allocated: 200, allocationTotal: 200, consistent: true })]);
    db.sqlite.close();
  });

  it("blocks impossible finance snapshots before any apply", async () => {
    const db = new MemoryD1();
    db.insertAudit("audit-finance-invalid", "profit_distribution", DISTRIBUTION_ID, {
      id: DISTRIBUTION_ID,
      organizationId: ORGANIZATION_ID,
      farmId: FARM_ID,
      distributionDate: "2026-02-01",
      sourceDateRoc: "115-02-01",
      grossProfitLoss: 900,
      allocatedProfitLoss: 200,
      expense: 10,
      netIncome: 999,
      note: "invalid",
      sourceDataset: "fixture",
      sourceRowKey: "dist-row-1",
      allocations: [],
    }, {
      id: DISTRIBUTION_ID,
      organizationId: ORGANIZATION_ID,
      farmId: FARM_ID,
      distributionDate: "2026-02-01",
      sourceDateRoc: "115-02-01",
      grossProfitLoss: 1000,
      allocatedProfitLoss: 300,
      expense: 20,
      netIncome: 280,
      note: "current",
      sourceDataset: "fixture",
      sourceRowKey: "dist-row-1",
      allocations: [
        { id: ALLOCATION_A_ID, distributionId: DISTRIBUTION_ID, investorId: "investor-a", amount: 150 },
        { id: ALLOCATION_B_ID, distributionId: DISTRIBUTION_ID, investorId: "investor-b", amount: 150 },
      ],
    });
    const input = request({ auditId: "audit-finance-invalid", targetType: "profit_distribution", targetId: DISTRIBUTION_ID, clientOperationId: "finance-invalid-operation" });
    const dryRun = await dryRunFinanceRecovery({ DB: db as unknown as D1Database }, readContext, input);
    expect(dryRun.applyEligibility).toBe("BLOCKED");
    expect(dryRun.conflicts).toEqual(expect.arrayContaining(["FINANCE_NET_INCOME_INCONSISTENT", "FINANCE_ALLOCATION_TOTAL_INCONSISTENT"]));
    const blocked = await applyFinanceRecovery({ DB: db as unknown as D1Database, CANONICAL_WRITE_HOLD: "OFF" }, applyContext, applyRequest(input, dryRun));
    expect(blocked).toMatchObject({ status: "BLOCKED", applied: false });
    expect((db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number }).count).toBe(3);
    db.sqlite.close();
  });

  it("rejects a stale distribution after the dry-run fingerprint changes", async () => {
    const db = new MemoryD1();
    const input = request({ auditId: "audit-finance-distribution", targetType: "profit_distribution", targetId: DISTRIBUTION_ID, clientOperationId: "finance-stale-operation" });
    const dryRun = await dryRunFinanceRecovery({ DB: db as unknown as D1Database }, readContext, input);
    db.sqlite.prepare("UPDATE profit_distribution_allocations SET amount = 125 WHERE id = ?").run(ALLOCATION_A_ID);
    const stale = await applyFinanceRecovery({ DB: db as unknown as D1Database, CANONICAL_WRITE_HOLD: "OFF" }, applyContext, applyRequest(input, dryRun));
    expect(stale).toMatchObject({ status: "STALE_STATE", applied: false, conflicts: ["STALE_STATE"] });
    expect((db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number }).count).toBe(2);
    expect(db.sqlite.prepare("SELECT amount FROM profit_distribution_allocations WHERE id = ?").get(ALLOCATION_A_ID)).toEqual({ amount: 125 });
    db.sqlite.close();
  });

  it("discovers only recoverable Finance changes in the selected environment", async () => {
    const db = new MemoryD1();
    const result = await discoverFinanceRecovery(
      { DB: db as unknown as D1Database },
      { organizationId: ORGANIZATION_ID },
      { environment: "test" },
    );
    expect(result.candidates.map((candidate) => candidate.targetType)).toEqual(expect.arrayContaining(["profit_distribution", "farm_investor_equity"]));
    expect(result.candidates.every((candidate) => candidate.recoverable)).toBe(true);
    const production = await discoverFinanceRecovery(
      { DB: db as unknown as D1Database },
      { organizationId: ORGANIZATION_ID },
      { environment: "production" },
    );
    expect(production.candidates).toEqual([]);
    db.sqlite.close();
  });
});
