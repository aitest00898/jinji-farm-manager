import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  applyO6Recovery,
  auditRangeBoundary,
  dryRunO6Recovery,
  listAuditLogs,
  type RecoveryApplyRequest,
  type RecoveryRequest,
} from "./audit-recovery-core";

type SqlValue = string | number | null;

const ORGANIZATION_ID = "org-recovery-test";
const FARM_ID = "farm-recovery-test";
const HOUSE_ID = "house-recovery-test";
const FLOCK_ID = "flock-recovery-test";
const TARGET_ID = "o6-overdue-target";

class MemoryD1 {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec(`
      CREATE TABLE farms (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        name TEXT NOT NULL,
        environment TEXT NOT NULL,
        active INTEGER NOT NULL,
        farm_structure_mode TEXT NOT NULL
      );
      CREATE TABLE houses (
        id TEXT PRIMARY KEY,
        farm_id TEXT NOT NULL,
        name TEXT NOT NULL,
        active INTEGER NOT NULL
      );
      CREATE TABLE flocks (
        id TEXT PRIMARY KEY,
        farm_id TEXT NOT NULL,
        house_id TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE line_groups (
        group_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        organization_id TEXT
      );
      CREATE TABLE operator_identities (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        identity_type TEXT NOT NULL,
        identity_key TEXT NOT NULL,
        active INTEGER NOT NULL
      );
      CREATE TABLE operator_scope_bindings (
        id TEXT PRIMARY KEY,
        operator_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        environment TEXT NOT NULL,
        farm_id TEXT NOT NULL,
        house_id TEXT,
        flock_id TEXT,
        active INTEGER NOT NULL
      );
      CREATE TABLE recording_events (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        client_operation_id TEXT NOT NULL,
        farm_id TEXT,
        taxonomy_id TEXT
      );
      CREATE TABLE operational_events (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        source_event_id TEXT NOT NULL,
        farm_id TEXT,
        taxonomy_id TEXT
      );
      CREATE TABLE abnormal_events (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        source_event_id TEXT NOT NULL,
        farm_id TEXT,
        taxonomy_id TEXT
      );
      CREATE TABLE operational_actions (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        taxonomy_id TEXT NOT NULL,
        family TEXT NOT NULL,
        canonical_type TEXT NOT NULL,
        subtype TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        farm_id TEXT NOT NULL,
        house_id TEXT,
        flock_id TEXT,
        content TEXT,
        vendor TEXT,
        weight REAL,
        weight_unit TEXT,
        submitted_at TEXT,
        workflow_status TEXT,
        result TEXT,
        completed_at TEXT,
        reminder_due_at TEXT,
        maintenance_content TEXT,
        source_channel TEXT NOT NULL,
        source_message_id TEXT,
        source_candidate_id TEXT,
        raw_text TEXT NOT NULL,
        actor_id TEXT,
        confirmed_by TEXT,
        client_operation_id TEXT NOT NULL UNIQUE,
        correction_of_id TEXT,
        reversal_of_id TEXT,
        replacement_of_id TEXT,
        lifecycle_status TEXT NOT NULL
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
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      `INSERT INTO farms (id, organization_id, name, environment, active, farm_structure_mode)
       VALUES (?, ?, ?, 'test', 1, 'multi_house')`,
    ).run(FARM_ID, ORGANIZATION_ID, "Recovery Test Farm");
    this.sqlite.prepare(
      "INSERT INTO houses (id, farm_id, name, active) VALUES (?, ?, ?, 1)",
    ).run(HOUSE_ID, FARM_ID, "Recovery Test House");
    this.sqlite.prepare(
      "INSERT INTO flocks (id, farm_id, house_id, status) VALUES (?, ?, ?, 'active')",
    ).run(FLOCK_ID, FARM_ID, HOUSE_ID);
    this.sqlite.prepare(
      `INSERT INTO operator_identities
        (id, organization_id, identity_type, identity_key, active)
       VALUES ('operator-recovery', ?, 'web_admin', ?, 1)`,
    ).run(ORGANIZATION_ID, `web-admin:${ORGANIZATION_ID}`);
    this.sqlite.prepare(
      `INSERT INTO operator_scope_bindings
        (id, operator_id, organization_id, environment, farm_id, house_id, flock_id, active)
       VALUES ('scope-recovery', 'operator-recovery', ?, 'test', ?, ?, ?, 1)`,
    ).run(ORGANIZATION_ID, FARM_ID, HOUSE_ID, FLOCK_ID);
  }

  prepare(sql: string) {
    return new MemoryPreparedStatement(this.sqlite, sql);
  }

  async batch(statements: MemoryPreparedStatement[]) {
    for (const statement of statements) await statement.run();
    return [];
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

function insertO6(
  db: MemoryD1,
  input: {
    id: string;
    submittedAt: string;
    workflowStatus: "waiting_result" | "completed";
    result?: string | null;
    completedAt?: string | null;
    clientOperationId: string;
    correctionOfId?: string | null;
    lifecycleStatus?: string;
  },
) {
  db.sqlite.prepare(
    `INSERT INTO operational_actions
      (id, organization_id, taxonomy_id, family, canonical_type, subtype,
       occurred_at, created_at, farm_id, house_id, flock_id, content,
       submitted_at, workflow_status, result, completed_at, reminder_due_at,
       source_channel, raw_text, client_operation_id, correction_of_id,
       lifecycle_status)
     VALUES (?, ?, 'O6', 'operational_action', 'action', 'lab_test', ?, ?, ?, ?, ?,
             '新城雞瘟', ?, ?, ?, ?, ?, 'web', ?, ?, ?, ?)` ,
  ).run(
    input.id,
    ORGANIZATION_ID,
    input.submittedAt,
    input.submittedAt,
    FARM_ID,
    HOUSE_ID,
    FLOCK_ID,
    input.submittedAt,
    input.workflowStatus,
    input.result ?? null,
    input.completedAt ?? null,
    new Date(Date.parse(input.submittedAt) + 3 * 86_400_000).toISOString(),
    `fixture:${input.id}`,
    input.clientOperationId,
    input.correctionOfId ?? null,
    input.lifecycleStatus ?? "active",
  );
}

function baseRequest(overrides: Partial<RecoveryRequest> = {}): RecoveryRequest {
  return {
    environment: "test",
    targetId: TARGET_ID,
    clientOperationId: "recovery-op-1",
    result: "陰性",
    completedAt: "2026-01-10T00:00:00.000Z",
    reason: "補入已核實檢驗結果",
    ...overrides,
  };
}

function setupDb(): MemoryD1 {
  const db = new MemoryD1();
  insertO6(db, {
    id: TARGET_ID,
    submittedAt: "2026-01-01T00:00:00.000Z",
    workflowStatus: "waiting_result",
    clientOperationId: "o6-target-operation",
  });
  insertO6(db, {
    id: "o6-completed-peer",
    submittedAt: "2026-01-02T00:00:00.000Z",
    workflowStatus: "completed",
    result: "陰性",
    completedAt: "2026-01-03T00:00:00.000Z",
    clientOperationId: "o6-peer-operation",
  });
  return db;
}

const readContext = { organizationId: ORGANIZATION_ID };
const applyContext = {
  organizationId: ORGANIZATION_ID,
  actorId: "operator-recovery",
  requestId: "recovery-test-request",
};

describe("bounded O6 audit and recovery core", () => {
  it("filters current audit visibility and permits bounded archived ADMIN reads without mutation", async () => {
    const db = new MemoryD1();
    const now = new Date("2026-09-16T00:00:00.000Z");
    const cutoff = new Date(now.getTime() - 120 * 86_400_000);
    const insertAudit = db.sqlite.prepare(
      `INSERT INTO audit_logs
        (id, organization_id, source, actor_type, action, entity_type, entity_id, request_id, created_at)
       VALUES (?, ?, 'web', 'web_admin', 'read', 'test', ?, ?, ?)`,
    );
    insertAudit.run("audit-current", ORGANIZATION_ID, "current", "request-current", "2026-09-15T00:00:00.000Z");
    insertAudit.run("audit-boundary", ORGANIZATION_ID, "boundary", "request-boundary", cutoff.toISOString());
    insertAudit.run("audit-archived", ORGANIZATION_ID, "archived", "request-archived", new Date(cutoff.getTime() - 1).toISOString());

    const current = await listAuditLogs(
      { DB: db as unknown as D1Database },
      ORGANIZATION_ID,
      { limit: 20, cursor: null, includeArchived: false, rangeFrom: null, rangeTo: null, now },
    );
    expect(current.auditLogs.map((row) => row.id)).toEqual(["audit-current", "audit-boundary"]);
    expect(current.auditLogs.every((row) => row.archived === false && row.visibility === "current")).toBe(true);

    const archived = await listAuditLogs(
      { DB: db as unknown as D1Database },
      ORGANIZATION_ID,
      {
        limit: 20,
        cursor: null,
        includeArchived: true,
        rangeFrom: auditRangeBoundary("2026-01-01", false),
        rangeTo: auditRangeBoundary("2026-05-18", true),
        now,
      },
    );
    expect(archived.auditLogs.map((row) => row.id)).toEqual(["audit-archived"]);
    expect(archived.auditLogs[0]).toMatchObject({ archived: true, visibility: "archived" });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 3 });
    db.sqlite.close();
  });

  it("produces a dependency-aware dry run without any mutation", async () => {
    const db = setupDb();
    const beforeActions = db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get() as { count: number };
    const beforeAudits = db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number };

    const result = await dryRunO6Recovery(
      { DB: db as unknown as D1Database },
      readContext,
      baseRequest(),
    );

    expect(result).toMatchObject({
      operation: "restore_o6_submission_result",
      environment: "test",
      before: { status: "incomplete", hasOverdueLabSubmission: true, pendingSubmissionCount: 1 },
      proposedAfter: { status: "none", hasOverdueLabSubmission: false, pendingSubmissionCount: 0 },
      stockImpact: { affected: false, delta: 0 },
      lifecycleImpact: "UNCHANGED_NON_STOCK",
      conflicts: [],
      applyEligibility: "ELIGIBLE",
    });
    expect(result.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: TARGET_ID, relation: "target", effective: true }),
      expect.objectContaining({ id: "o6-completed-peer", relation: "house_o6_input", effective: true }),
      expect.objectContaining({ relation: "house_status", kind: "derived_projection", effective: true }),
    ]));
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get()).toEqual(beforeActions);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual(beforeAudits);
    db.sqlite.close();
  });

  it("applies one append-only recovery, preserves lineage, and is idempotent on replay", async () => {
    const db = setupDb();
    const request = baseRequest();
    const dryRun = await dryRunO6Recovery({ DB: db as unknown as D1Database }, readContext, request);
    const applyRequest: RecoveryApplyRequest = {
      ...request,
      stateFingerprint: dryRun.stateFingerprint,
      dryRunToken: dryRun.dryRunToken,
    };

    const first = await applyO6Recovery(
      { DB: db as unknown as D1Database },
      applyContext,
      applyRequest,
    );

    expect(first).toMatchObject({
      applied: true,
      idempotent: false,
      targetId: TARGET_ID,
      canonical: { created: true, lineage: { kind: "correction", referenceId: TARGET_ID } },
      authoritativeReadback: {
        record: { correctionOfId: TARGET_ID, workflowStatus: "completed", result: "陰性" },
        derived: { status: "none", hasOverdueLabSubmission: false, pendingSubmissionCount: 0 },
      },
    });

    const original = db.sqlite.prepare(
      "SELECT workflow_status AS workflowStatus, result, completed_at AS completedAt, lifecycle_status AS lifecycleStatus FROM operational_actions WHERE id = ?",
    ).get(TARGET_ID);
    expect(original).toEqual({ workflowStatus: "waiting_result", result: null, completedAt: null, lifecycleStatus: "active" });
    expect(db.sqlite.prepare("SELECT correction_of_id AS correctionOfId, workflow_status AS workflowStatus, result FROM operational_actions WHERE id = ?").get(first.recoveryRecordId)).toEqual({ correctionOfId: TARGET_ID, workflowStatus: "completed", result: "陰性" });
    expect(db.sqlite.prepare("SELECT action, entity_type AS entityType, entity_id AS entityId FROM audit_logs WHERE id = ?").get(first.recoveryAuditId)).toEqual({ action: "recovery_apply", entityType: "canonical_recovery", entityId: TARGET_ID });

    const actionCount = (db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get() as { count: number }).count;
    const auditCount = (db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number }).count;
    const replay = await applyO6Recovery({ DB: db as unknown as D1Database }, applyContext, applyRequest);
    expect(replay).toMatchObject({ applied: false, idempotent: true, recoveryRecordId: first.recoveryRecordId, recoveryAuditId: first.recoveryAuditId });
    expect((db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get() as { count: number }).count).toBe(actionCount);
    expect((db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number }).count).toBe(auditCount);
    db.sqlite.close();
  });

  it("denies Apply as stale when the authoritative target changes after Dry Run", async () => {
    const db = setupDb();
    const request = baseRequest({ clientOperationId: "recovery-op-stale" });
    const dryRun = await dryRunO6Recovery({ DB: db as unknown as D1Database }, readContext, request);
    db.sqlite.prepare(
      "UPDATE operational_actions SET workflow_status = 'completed', result = '陽性', completed_at = '2026-01-11T00:00:00.000Z' WHERE id = ?",
    ).run(TARGET_ID);

    await expect(applyO6Recovery(
      { DB: db as unknown as D1Database },
      applyContext,
      {
        ...request,
        stateFingerprint: dryRun.stateFingerprint,
        dryRunToken: dryRun.dryRunToken,
      },
    )).rejects.toMatchObject({ code: "STALE_STATE" });

    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get()).toEqual({ count: 2 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 0 });
    db.sqlite.close();
  });
});
