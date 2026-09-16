import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  applyO6Recovery,
  applyO6RecoveryBatch,
  applyO6PointInTimeRecovery,
  auditRangeBoundary,
  discoverO6PointInTimeRecovery,
  dryRunO6Recovery,
  dryRunO6RecoveryBatch,
  dryRunO6PointInTimeRecovery,
  listAuditLogs,
  type BatchRecoveryApplyRequest,
  type BatchRecoveryRequest,
  type PitRecoveryApplyRequest,
  type PitRecoveryDryRunRequest,
  type RecoveryApplyRequest,
  type RecoveryRequest,
} from "./audit-recovery-core";

type SqlValue = string | number | null;

const ORGANIZATION_ID = "org-recovery-test";
const FARM_ID = "farm-recovery-test";
const HOUSE_ID = "house-recovery-test";
const FLOCK_ID = "flock-recovery-test";
const SECOND_HOUSE_ID = "house-recovery-test-2";
const SECOND_FLOCK_ID = "flock-recovery-test-2";
const TARGET_ID = "o6-overdue-target";

class MemoryD1 {
  readonly sqlite = new DatabaseSync(":memory:");
  failBatchAfter: number | null = null;

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
      "INSERT INTO houses (id, farm_id, name, active) VALUES (?, ?, ?, 1)",
    ).run(SECOND_HOUSE_ID, FARM_ID, "Recovery Test House 2");
    this.sqlite.prepare(
      "INSERT INTO flocks (id, farm_id, house_id, status) VALUES (?, ?, ?, 'active')",
    ).run(FLOCK_ID, FARM_ID, HOUSE_ID);
    this.sqlite.prepare(
      "INSERT INTO flocks (id, farm_id, house_id, status) VALUES (?, ?, ?, 'active')",
    ).run(SECOND_FLOCK_ID, FARM_ID, SECOND_HOUSE_ID);
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
    this.sqlite.prepare(
      `INSERT INTO operator_scope_bindings
        (id, operator_id, organization_id, environment, farm_id, house_id, flock_id, active)
       VALUES ('scope-recovery-2', 'operator-recovery', ?, 'test', ?, ?, ?, 1)`,
    ).run(ORGANIZATION_ID, FARM_ID, SECOND_HOUSE_ID, SECOND_FLOCK_ID);
  }

  prepare(sql: string) {
    return new MemoryPreparedStatement(this.sqlite, sql);
  }

  async batch(statements: MemoryPreparedStatement[]) {
    this.sqlite.exec("BEGIN");
    try {
      for (let index = 0; index < statements.length; index += 1) {
        if (this.failBatchAfter !== null && index >= this.failBatchAfter) throw new Error("fixture_batch_failure");
        await statements[index].run();
      }
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
    reversalOfId?: string | null;
    lifecycleStatus?: string;
    createdAt?: string;
    farmId?: string;
    houseId?: string;
    flockId?: string;
  },
) {
  db.sqlite.prepare(
    `INSERT INTO operational_actions
      (id, organization_id, taxonomy_id, family, canonical_type, subtype,
       occurred_at, created_at, farm_id, house_id, flock_id, content,
       submitted_at, workflow_status, result, completed_at, reminder_due_at,
       source_channel, raw_text, client_operation_id, correction_of_id,
       lifecycle_status, reversal_of_id)
     VALUES (?, ?, 'O6', 'operational_action', 'action', 'lab_test', ?, ?, ?, ?, ?,
             '新城雞瘟', ?, ?, ?, ?, ?, 'web', ?, ?, ?, ?, ?)` ,
  ).run(
    input.id,
    ORGANIZATION_ID,
    input.submittedAt,
    input.createdAt ?? input.submittedAt,
    input.farmId ?? FARM_ID,
    input.houseId ?? HOUSE_ID,
    input.flockId ?? FLOCK_ID,
    input.submittedAt,
    input.workflowStatus,
    input.result ?? null,
    input.completedAt ?? null,
    new Date(Date.parse(input.submittedAt) + 3 * 86_400_000).toISOString(),
    `fixture:${input.id}`,
    input.clientOperationId,
    input.correctionOfId ?? null,
    input.lifecycleStatus ?? "active",
    input.reversalOfId ?? null,
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

function batchRequest(targetId: string, clientOperationId: string, overrides: Partial<RecoveryRequest> = {}): RecoveryRequest {
  return baseRequest({ targetId, clientOperationId, ...overrides });
}

function setupBatchDb(input: {
  secondStatus?: "waiting_result" | "completed";
  sameHouseSecondTarget?: boolean;
} = {}): MemoryD1 {
  const db = new MemoryD1();
  insertO6(db, {
    id: "o6-batch-house-a",
    submittedAt: "2026-01-01T00:00:00.000Z",
    workflowStatus: "waiting_result",
    clientOperationId: "o6-batch-source-a",
  });
  if (input.sameHouseSecondTarget) {
    insertO6(db, {
      id: "o6-batch-house-a-2",
      submittedAt: "2026-01-02T00:00:00.000Z",
      workflowStatus: "waiting_result",
      clientOperationId: "o6-batch-source-a-2",
    });
  }
  insertO6(db, {
    id: "o6-batch-house-b",
    submittedAt: "2026-01-03T00:00:00.000Z",
    workflowStatus: input.secondStatus ?? "waiting_result",
    result: input.secondStatus === "completed" ? "陰性" : null,
    completedAt: input.secondStatus === "completed" ? "2026-01-04T00:00:00.000Z" : null,
    clientOperationId: "o6-batch-source-b",
    houseId: SECOND_HOUSE_ID,
    flockId: SECOND_FLOCK_ID,
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

  function batchApplyInput(
    dryRun: Awaited<ReturnType<typeof dryRunO6RecoveryBatch>>,
    requests: readonly RecoveryRequest[],
  ): BatchRecoveryApplyRequest {
    return {
      groups: dryRun.groups.map((group) => ({
        groupId: group.groupId,
        targets: requests.filter((request) => group.targetIds.includes(request.targetId)),
        stateFingerprint: group.stateFingerprint,
        dryRunToken: group.dryRunToken,
      })),
    };
  }

  it("dry-runs and atomically applies two independent dependency groups", async () => {
    const db = setupBatchDb();
    const requests: BatchRecoveryRequest["targets"] = [
      batchRequest("o6-batch-house-a", "batch-op-a", { result: "陰性" }),
      batchRequest("o6-batch-house-b", "batch-op-b", { result: "陽性" }),
    ];
    const dryRun = await dryRunO6RecoveryBatch(
      { DB: db as unknown as D1Database },
      readContext,
      { targets: requests },
    );
    expect(dryRun.groupCount).toBe(2);
    expect(dryRun.groups.every((group) => group.applyEligibility === "ELIGIBLE")).toBe(true);
    expect(dryRun.groups.every((group) => group.stockImpact.delta === 0 && group.lifecycleImpact === "UNCHANGED_NON_STOCK")).toBe(true);
    expect(dryRun.groups.every((group) => group.dependencies.some((dependency) => dependency.relation === "house_status"))).toBe(true);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get()).toEqual({ count: 2 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 0 });

    const applied = await applyO6RecoveryBatch(
      { DB: db as unknown as D1Database },
      applyContext,
      batchApplyInput(dryRun, requests),
    );
    expect(applied.groups.map((group) => group.status)).toEqual(["APPLIED", "APPLIED"]);
    expect(applied.groups.every((group) => group.applied && !group.idempotent)).toBe(true);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get()).toEqual({ count: 4 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 4 });
    for (const targetId of ["o6-batch-house-a", "o6-batch-house-b"]) {
      const child = db.sqlite.prepare(
        "SELECT correction_of_id AS correctionOfId, workflow_status AS workflowStatus FROM operational_actions WHERE correction_of_id = ?",
      ).get(targetId) as { correctionOfId: string; workflowStatus: string };
      expect(child).toEqual({ correctionOfId: targetId, workflowStatus: "completed" });
      expect(db.sqlite.prepare("SELECT action, entity_type AS entityType, entity_id AS entityId FROM audit_logs WHERE entity_id = ?").get(targetId)).toMatchObject({ action: "recovery_apply", entityType: "canonical_recovery", entityId: targetId });
    }

    const actionCount = (db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get() as { count: number }).count;
    const auditCount = (db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number }).count;
    const replay = await applyO6RecoveryBatch(
      { DB: db as unknown as D1Database },
      applyContext,
      batchApplyInput(dryRun, requests),
    );
    expect(replay.groups.every((group) => group.status === "APPLIED" && group.idempotent && !group.applied)).toBe(true);
    expect((db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get() as { count: number }).count).toBe(actionCount);
    expect((db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number }).count).toBe(auditCount);
    db.sqlite.close();
  });

  it("lets a valid group apply while an independent invalid group remains blocked", async () => {
    const db = setupBatchDb({ secondStatus: "completed" });
    const requests = [
      batchRequest("o6-batch-house-a", "batch-op-valid"),
      batchRequest("o6-batch-house-b", "batch-op-blocked"),
    ];
    const dryRun = await dryRunO6RecoveryBatch({ DB: db as unknown as D1Database }, readContext, { targets: requests });
    expect(dryRun.groups.find((group) => group.targetIds.includes("o6-batch-house-a"))?.applyEligibility).toBe("ELIGIBLE");
    expect(dryRun.groups.find((group) => group.targetIds.includes("o6-batch-house-b"))?.applyEligibility).toBe("DENIED");
    const applied = await applyO6RecoveryBatch({ DB: db as unknown as D1Database }, applyContext, batchApplyInput(dryRun, requests));
    expect(applied.groups.find((group) => group.targetIds.includes("o6-batch-house-a"))).toMatchObject({ status: "APPLIED", applied: true });
    expect(applied.groups.find((group) => group.targetIds.includes("o6-batch-house-b"))).toMatchObject({ status: "BLOCKED", applied: false });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get()).toEqual({ count: 3 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 2 });
    db.sqlite.close();
  });

  it("rejects only a stale group while a fresh independent group continues", async () => {
    const db = setupBatchDb();
    const requests = [
      batchRequest("o6-batch-house-a", "batch-op-stale"),
      batchRequest("o6-batch-house-b", "batch-op-fresh"),
    ];
    const dryRun = await dryRunO6RecoveryBatch({ DB: db as unknown as D1Database }, readContext, { targets: requests });
    db.sqlite.prepare(
      "UPDATE operational_actions SET workflow_status = 'completed', result = '陽性', completed_at = '2026-01-11T00:00:00.000Z' WHERE id = ?",
    ).run("o6-batch-house-a");
    const applied = await applyO6RecoveryBatch({ DB: db as unknown as D1Database }, applyContext, batchApplyInput(dryRun, requests));
    expect(applied.groups.find((group) => group.targetIds.includes("o6-batch-house-a"))).toMatchObject({ status: "STALE_STATE" });
    expect(applied.groups.find((group) => group.targetIds.includes("o6-batch-house-b"))).toMatchObject({ status: "APPLIED", applied: true });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get()).toEqual({ count: 3 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 2 });
    db.sqlite.close();
  });

  it("rolls back an entire dependency group when its atomic batch fails", async () => {
    const db = setupBatchDb({ sameHouseSecondTarget: true });
    const requests = [
      batchRequest("o6-batch-house-a", "batch-op-atomic-a"),
      batchRequest("o6-batch-house-a-2", "batch-op-atomic-b"),
    ];
    const dryRun = await dryRunO6RecoveryBatch({ DB: db as unknown as D1Database }, readContext, { targets: requests });
    expect(dryRun.groupCount).toBe(1);
    db.failBatchAfter = 2;
    const failed = await applyO6RecoveryBatch({ DB: db as unknown as D1Database }, applyContext, batchApplyInput(dryRun, requests));
    expect(failed.groups[0]).toMatchObject({ status: "FAILED", applied: false });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get()).toEqual({ count: 3 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 0 });

    db.failBatchAfter = null;
    const retried = await applyO6RecoveryBatch({ DB: db as unknown as D1Database }, applyContext, batchApplyInput(dryRun, requests));
    expect(retried.groups[0]).toMatchObject({ status: "APPLIED", applied: true });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get()).toEqual({ count: 5 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 4 });
    db.sqlite.close();
  });

  it("discovers later O6 changes, preserves selected facts, reverts selected roots, and replays idempotently", async () => {
    const db = new MemoryD1();
    insertO6(db, {
      id: "pit-before-target",
      submittedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      workflowStatus: "waiting_result",
      clientOperationId: "pit-source-before",
    });
    insertO6(db, {
      id: "pit-revert-root",
      submittedAt: "2026-01-02T00:00:00.000Z",
      createdAt: "2026-01-10T00:00:00.000Z",
      workflowStatus: "waiting_result",
      clientOperationId: "pit-source-revert",
    });
    insertO6(db, {
      id: "pit-preserve-root",
      submittedAt: "2026-01-03T00:00:00.000Z",
      createdAt: "2026-01-11T00:00:00.000Z",
      workflowStatus: "completed",
      result: "陰性",
      completedAt: "2026-01-12T00:00:00.000Z",
      clientOperationId: "pit-source-preserve",
    });

    const targetTime = "2026-01-05T00:00:00.000Z";
    const discovered = await discoverO6PointInTimeRecovery(
      { DB: db as unknown as D1Database },
      readContext,
      { environment: "test", targetTime },
    );
    expect(discovered.candidateCount).toBe(2);
    expect(discovered.candidates.map((candidate) => candidate.factId)).toEqual(["pit-revert-root", "pit-preserve-root"]);
    expect(discovered.candidates.every((candidate) => candidate.disposition === "REVERT" && candidate.availableDecisions.includes("PRESERVE"))).toBe(true);

    const selections = discovered.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      decision: candidate.factId === "pit-revert-root" ? "REVERT" as const : "PRESERVE" as const,
    }));
    const dryRun = await dryRunO6PointInTimeRecovery(
      { DB: db as unknown as D1Database },
      readContext,
      { environment: "test", targetTime, selections },
    );
    const group = dryRun.groups[0];
    expect(group).toMatchObject({
      applyEligibility: "ELIGIBLE",
      selectedRevert: ["o6-change:pit-revert-root"],
      selectedPreserve: ["o6-change:pit-preserve-root"],
      before: { pendingSubmissionCount: 2, hasOverdueLabSubmission: true },
      proposedAfter: { pendingSubmissionCount: 1, hasOverdueLabSubmission: true },
    });
    expect(group.dependencyRequired).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "derived_projection", relation: "house_status" }),
    ]));
    expect(group.candidates.find((candidate) => candidate.factId === "pit-revert-root")).toMatchObject({ decision: "REVERT", decisionState: "REVERT" });
    expect(group.candidates.find((candidate) => candidate.factId === "pit-preserve-root")).toMatchObject({ decision: "PRESERVE", decisionState: "PRESERVE" });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get()).toEqual({ count: 3 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 0 });

    const applyInput: PitRecoveryApplyRequest = {
      environment: "test",
      groups: [{
        groupId: group.groupId,
        targetTime,
        selections,
        stateFingerprint: group.stateFingerprint,
        dryRunToken: group.dryRunToken,
        clientOperationId: "pit-apply-1",
      }],
    };
    const applied = await applyO6PointInTimeRecovery(
      { DB: db as unknown as D1Database },
      applyContext,
      applyInput,
    );
    expect(applied.groups[0]).toMatchObject({
      status: "APPLIED",
      applied: true,
      idempotent: false,
      revertedCandidateIds: ["o6-change:pit-revert-root"],
      preservedCandidateIds: ["o6-change:pit-preserve-root"],
      authoritativeReadback: {
        derived: { pendingSubmissionCount: 1, hasOverdueLabSubmission: true },
        revertedFactIds: ["pit-revert-root"],
      },
    });
    expect(db.sqlite.prepare("SELECT workflow_status AS workflowStatus, result, lifecycle_status AS lifecycleStatus FROM operational_actions WHERE id = ?").get("pit-revert-root")).toEqual({ workflowStatus: "waiting_result", result: null, lifecycleStatus: "active" });
    expect(db.sqlite.prepare("SELECT reversal_of_id AS reversalOfId, lifecycle_status AS lifecycleStatus FROM operational_actions WHERE id = ?").get(applied.groups[0].recoveryRecordIds[0])).toEqual({ reversalOfId: "pit-revert-root", lifecycleStatus: "reversed" });
    expect(db.sqlite.prepare("SELECT action, entity_type AS entityType, entity_id AS entityId FROM audit_logs WHERE id = ?").get(applied.groups[0].recoveryAuditIds[0])).toEqual({ action: "selective_pit_recovery", entityType: "canonical_pit_recovery", entityId: "pit-revert-root" });

    const actionCount = (db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get() as { count: number }).count;
    const auditCount = (db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number }).count;
    const replay = await applyO6PointInTimeRecovery({ DB: db as unknown as D1Database }, applyContext, applyInput);
    expect(replay.groups[0]).toMatchObject({ status: "APPLIED", applied: false, idempotent: true });
    expect((db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get() as { count: number }).count).toBe(actionCount);
    expect((db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number }).count).toBe(auditCount);
    db.sqlite.close();
  });

  it("blocks conflicting PIT decisions without mutating canonical state", async () => {
    const db = new MemoryD1();
    insertO6(db, {
      id: "pit-conflict-root",
      submittedAt: "2026-01-02T00:00:00.000Z",
      createdAt: "2026-01-10T00:00:00.000Z",
      workflowStatus: "waiting_result",
      clientOperationId: "pit-source-conflict",
    });
    const candidateId = "o6-change:pit-conflict-root";
    const dryRun = await dryRunO6PointInTimeRecovery(
      { DB: db as unknown as D1Database },
      readContext,
      {
        environment: "test",
        targetTime: "2026-01-05T00:00:00.000Z",
        selections: [
          { candidateId, decision: "REVERT" },
          { candidateId, decision: "PRESERVE" },
        ],
      },
    );
    expect(dryRun.groups[0]).toMatchObject({ applyEligibility: "DENIED" });
    expect(dryRun.groups[0].conflicts).toContain("PIT_CONFLICTING_SELECTION:o6-change:pit-conflict-root");
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get()).toEqual({ count: 1 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 0 });
    db.sqlite.close();
  });

  it("rejects only a stale PIT group while applying an independent fresh group", async () => {
    const db = new MemoryD1();
    insertO6(db, {
      id: "pit-stale-house-a",
      submittedAt: "2026-01-02T00:00:00.000Z",
      createdAt: "2026-01-10T00:00:00.000Z",
      workflowStatus: "waiting_result",
      clientOperationId: "pit-source-stale-a",
    });
    insertO6(db, {
      id: "pit-fresh-house-b",
      submittedAt: "2026-01-03T00:00:00.000Z",
      createdAt: "2026-01-11T00:00:00.000Z",
      workflowStatus: "waiting_result",
      clientOperationId: "pit-source-fresh-b",
      houseId: SECOND_HOUSE_ID,
      flockId: SECOND_FLOCK_ID,
    });
    const targetTime = "2026-01-05T00:00:00.000Z";
    const discovered = await discoverO6PointInTimeRecovery({ DB: db as unknown as D1Database }, readContext, { environment: "test", targetTime });
    const selections = discovered.candidates.map((candidate) => ({ candidateId: candidate.candidateId, decision: "REVERT" as const }));
    const dryRun = await dryRunO6PointInTimeRecovery({ DB: db as unknown as D1Database }, readContext, { environment: "test", targetTime, selections });
    db.sqlite.prepare("UPDATE operational_actions SET result = '陽性', workflow_status = 'completed', completed_at = '2026-01-12T00:00:00.000Z' WHERE id = ?").run("pit-stale-house-a");
    const applied = await applyO6PointInTimeRecovery(
      { DB: db as unknown as D1Database },
      applyContext,
      {
        environment: "test",
        groups: dryRun.groups.map((group, index) => ({
          groupId: group.groupId,
          targetTime,
          selections: group.candidates.map((candidate) => ({ candidateId: candidate.candidateId, decision: "REVERT" as const })),
          stateFingerprint: group.stateFingerprint,
          dryRunToken: group.dryRunToken,
          clientOperationId: `pit-independent-${index}`,
        })),
      },
    );
    expect(applied.groups.find((group) => group.groupId.includes(HOUSE_ID))).toMatchObject({ status: "STALE_STATE", applied: false });
    expect(applied.groups.find((group) => group.groupId.includes(SECOND_HOUSE_ID))).toMatchObject({ status: "APPLIED", applied: true });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM operational_actions").get()).toEqual({ count: 3 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 2 });
    db.sqlite.close();
  });

  it("surfaces lineage dependencies and refuses to revert a dependent O6 correction", async () => {
    const db = new MemoryD1();
    insertO6(db, {
      id: "pit-lineage-parent",
      submittedAt: "2026-01-02T00:00:00.000Z",
      createdAt: "2026-01-10T00:00:00.000Z",
      workflowStatus: "waiting_result",
      clientOperationId: "pit-source-parent",
    });
    insertO6(db, {
      id: "pit-lineage-child",
      submittedAt: "2026-01-02T00:00:00.000Z",
      createdAt: "2026-01-11T00:00:00.000Z",
      workflowStatus: "completed",
      result: "陰性",
      completedAt: "2026-01-12T00:00:00.000Z",
      clientOperationId: "pit-source-child",
      correctionOfId: "pit-lineage-parent",
    });
    const discovered = await discoverO6PointInTimeRecovery(
      { DB: db as unknown as D1Database },
      readContext,
      { environment: "test", targetTime: "2026-01-05T00:00:00.000Z" },
    );
    expect(discovered.candidates.find((candidate) => candidate.factId === "pit-lineage-parent")).toMatchObject({ disposition: "NOT_RECOVERABLE" });
    expect(discovered.candidates.find((candidate) => candidate.factId === "pit-lineage-child")).toMatchObject({ disposition: "DEPENDENCY_REQUIRED" });
    const dryRun = await dryRunO6PointInTimeRecovery(
      { DB: db as unknown as D1Database },
      readContext,
      {
        environment: "test",
        targetTime: "2026-01-05T00:00:00.000Z",
        selections: discovered.candidates.map((candidate) => ({ candidateId: candidate.candidateId, decision: candidate.factId === "pit-lineage-child" ? "REVERT" as const : "PRESERVE" as const })),
      },
    );
    expect(dryRun.groups[0]).toMatchObject({ applyEligibility: "DENIED", dependencyRequiredCandidateIds: ["o6-change:pit-lineage-child"] });
    expect(dryRun.groups[0].conflicts).toContain("PIT_DEPENDENCY_REQUIRED:o6-change:pit-lineage-child");
    db.sqlite.close();
  });
});
