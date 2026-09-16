import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  applyDomainPointInTimeRecovery,
  applyDomainRecovery,
  applyDomainRecoveryBatch,
  discoverDomainPointInTimeRecovery,
  discoverDomainRecovery,
  dryRunDomainPointInTimeRecovery,
  dryRunDomainRecovery,
  dryRunDomainRecoveryBatch,
  type DomainRecoveryApplyRequest,
  type DomainRecoveryRequest,
} from "./audit-recovery-core";

type SqlValue = string | number | null;

const ORGANIZATION_ID = "org-domain-recovery-test";

class MemoryD1 {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec(`
      CREATE TABLE farms (
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, environment TEXT NOT NULL,
        name TEXT NOT NULL, site_name TEXT, latitude REAL, longitude REAL,
        active INTEGER NOT NULL, farm_structure_mode TEXT NOT NULL, note TEXT,
        version INTEGER NOT NULL, updated_at TEXT
      );
      CREATE TABLE houses (
        id TEXT PRIMARY KEY, farm_id TEXT NOT NULL, name TEXT NOT NULL,
        normalized_name TEXT NOT NULL, capacity INTEGER, active INTEGER NOT NULL,
        note TEXT, version INTEGER NOT NULL, updated_at TEXT
      );
      CREATE TABLE flocks (
        id TEXT PRIMARY KEY, farm_id TEXT NOT NULL, house_id TEXT NOT NULL,
        breed TEXT, chick_in_date TEXT, initial_count INTEGER,
        expected_shipment_date TEXT, actual_shipment_date TEXT,
        status TEXT NOT NULL, note TEXT, version INTEGER NOT NULL, updated_at TEXT
      );
      CREATE TABLE caretakers (
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL,
        normalized_name TEXT NOT NULL, active INTEGER NOT NULL, note TEXT,
        version INTEGER NOT NULL, updated_at TEXT
      );
      CREATE TABLE farm_caretaker_assignments (
        id TEXT PRIMARY KEY, farm_id TEXT NOT NULL, caretaker_id TEXT NOT NULL,
        effective_from TEXT NOT NULL, effective_to TEXT, is_primary INTEGER NOT NULL
      );
      CREATE TABLE line_groups (
        group_id TEXT PRIMARY KEY, status TEXT NOT NULL, organization_id TEXT,
        farm_id TEXT, farm_name TEXT, operational_authorized INTEGER NOT NULL DEFAULT 0,
        conversation_v2_enabled INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE operator_identities (
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, identity_type TEXT NOT NULL,
        identity_key TEXT NOT NULL, display_name TEXT NOT NULL, active INTEGER NOT NULL,
        version INTEGER NOT NULL, updated_at TEXT
      );
      CREATE TABLE operator_scope_bindings (
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, environment TEXT NOT NULL,
        operator_id TEXT NOT NULL, farm_id TEXT NOT NULL, house_id TEXT, flock_id TEXT,
        active INTEGER NOT NULL
      );
      CREATE TABLE line_group_operator_bindings (
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, line_group_id TEXT NOT NULL,
        operator_id TEXT NOT NULL, scope_binding_id TEXT NOT NULL, active INTEGER NOT NULL,
        updated_at TEXT
      );
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, source TEXT NOT NULL,
        actor_type TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL,
        entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, before_json TEXT,
        after_json TEXT, changed_fields_json TEXT, reason TEXT, request_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TRIGGER audit_logs_no_update
      BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit_logs_are_append_only'); END;
      CREATE TRIGGER audit_logs_no_delete
      BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit_logs_are_append_only'); END;
    `);
    this.sqlite.prepare(
      `INSERT INTO farms
        (id, organization_id, environment, name, site_name, active, farm_structure_mode, version)
       VALUES ('farm-test', ?, 'test', 'After Farm', 'Site', 1, 'multi_house', 1)`,
    ).run(ORGANIZATION_ID);
    this.sqlite.prepare(
      `INSERT INTO farms
        (id, organization_id, environment, name, site_name, active, farm_structure_mode, version)
       VALUES ('farm-production', ?, 'production', 'Production Farm', 'Site', 1, 'multi_house', 1)`,
    ).run(ORGANIZATION_ID);
    this.sqlite.prepare(
      `INSERT INTO houses
        (id, farm_id, name, normalized_name, capacity, active, version)
       VALUES ('house-test', 'farm-test', 'After House', 'AfterHouse', 1, 1, 1)`,
    ).run();
    this.sqlite.prepare(
      `INSERT INTO flocks
        (id, farm_id, house_id, breed, status, version)
       VALUES ('flock-test', 'farm-test', 'house-test', '紅羽', 'active', 1)`,
    ).run();
    this.sqlite.prepare(
      `INSERT INTO line_groups
        (group_id, status, organization_id, farm_id, operational_authorized, conversation_v2_enabled)
       VALUES ('group-production', 'bound', ?, 'farm-production', 1, 1)`,
    ).run(ORGANIZATION_ID);
    this.sqlite.prepare(
      `INSERT INTO line_groups
        (group_id, status, organization_id, farm_id, operational_authorized, conversation_v2_enabled)
       VALUES ('group-test', 'bound', ?, 'farm-test', 1, 1)`,
    ).run(ORGANIZATION_ID);
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

function env(db: MemoryD1) {
  return { DB: db as unknown as D1Database, CANONICAL_WRITE_HOLD: "off" };
}

function request(overrides: Partial<DomainRecoveryRequest> = {}): DomainRecoveryRequest {
  return {
    environment: "test",
    auditId: "audit-farm-update",
    entityType: "farm",
    targetId: "farm-test",
    clientOperationId: "domain-farm-recovery-1",
    reason: "restore verified farm master data",
    ...overrides,
  };
}

function addAudit(
  db: MemoryD1,
  input: {
    id: string;
    entityType: string;
    entityId: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
    createdAt?: string;
  },
) {
  db.sqlite.prepare(
    `INSERT INTO audit_logs
      (id, organization_id, source, actor_type, actor_id, action, entity_type,
       entity_id, before_json, after_json, changed_fields_json, reason, request_id, created_at)
     VALUES (?, ?, 'web', 'web_admin', 'admin-test', 'update', ?, ?, ?, ?, '[]', 'fixture', ?, ?)`,
  ).run(
    input.id,
    ORGANIZATION_ID,
    input.entityType,
    input.entityId,
    input.before === null ? null : JSON.stringify(input.before),
    JSON.stringify(input.after),
    `request:${input.id}`,
    input.createdAt ?? "2026-02-02T00:00:00.000Z",
  );
}

function addFarmAudit(db: MemoryD1) {
  addAudit(db, {
    id: "audit-farm-update",
    entityType: "farm",
    entityId: "farm-test",
    before: {
      id: "farm-test",
      environment: "test",
      name: "Before Farm",
      siteName: "Site",
      active: true,
      structureMode: "multi_house",
    },
    after: {
      id: "farm-test",
      environment: "test",
      name: "After Farm",
      siteName: "Site",
      active: true,
      structureMode: "multi_house",
    },
  });
}

function addGroupAudits(db: MemoryD1, createdAt = "2026-02-02T00:00:00.000Z") {
  addAudit(db, {
    id: "audit-group-auth",
    entityType: "line_group_operational_authorization",
    entityId: "group-production",
    before: { operationalAuthorized: false },
    after: { operationalAuthorized: true },
    createdAt,
  });
  addAudit(db, {
    id: "audit-group-conversation",
    entityType: "line_group_ai_conversation",
    entityId: "group-production",
    before: { conversationV2Enabled: false },
    after: { conversationV2Enabled: true },
    createdAt,
  });
}

describe("cross-domain recovery authority", () => {
  it("restores versioned master data, preserves audit history, and replays idempotently", async () => {
    const db = new MemoryD1();
    addFarmAudit(db);
    const plan = await dryRunDomainRecovery(env(db), { organizationId: ORGANIZATION_ID }, request());
    expect(plan.proposedAfter).toMatchObject({ name: "Before Farm", version: 2 });
    expect(plan.stockImpact).toEqual({ affected: false, delta: 0 });
    expect(plan.financeImpact).toEqual({ affected: false, delta: 0 });
    expect(plan.applyEligibility).toBe("ELIGIBLE");

    const applyInput: DomainRecoveryApplyRequest = {
      ...request(),
      stateFingerprint: plan.stateFingerprint,
      dryRunToken: plan.dryRunToken,
      confirm: true,
      previewAcknowledged: true,
    };
    const first = await applyDomainRecovery(env(db), { organizationId: ORGANIZATION_ID, actorId: "admin-test", requestId: "apply-1" }, applyInput);
    expect(first).toMatchObject({ applied: true, idempotent: false, authoritativeReadback: { state: { name: "Before Farm", version: 2 } } });
    expect(db.sqlite.prepare("SELECT name, version FROM farms WHERE id = 'farm-test'").get()).toEqual({ name: "Before Farm", version: 2 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 2 });

    const replay = await applyDomainRecovery(env(db), { organizationId: ORGANIZATION_ID, actorId: "admin-test", requestId: "apply-replay" }, applyInput);
    expect(replay).toMatchObject({ applied: false, idempotent: true, recoveryAuditId: first.recoveryAuditId });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 2 });
  });

  it("rejects a stale version before changing the target", async () => {
    const db = new MemoryD1();
    addFarmAudit(db);
    const plan = await dryRunDomainRecovery(env(db), { organizationId: ORGANIZATION_ID }, request());
    db.sqlite.prepare("UPDATE farms SET name = 'Changed elsewhere', version = 2 WHERE id = 'farm-test'").run();
    await expect(applyDomainRecovery(env(db), { organizationId: ORGANIZATION_ID, actorId: "admin-test", requestId: "apply-stale" }, {
      ...request(),
      stateFingerprint: plan.stateFingerprint,
      dryRunToken: plan.dryRunToken,
      confirm: true,
      previewAcknowledged: true,
    })).rejects.toMatchObject({ code: "STALE_STATE" });
    expect(db.sqlite.prepare("SELECT name FROM farms WHERE id = 'farm-test'").get()).toEqual({ name: "Changed elsewhere" });
  });

  it("groups two settings changes atomically and keeps stock and Finance impact at zero", async () => {
    const db = new MemoryD1();
    addGroupAudits(db);
    const authRequest = request({
      environment: "production",
      auditId: "audit-group-auth",
      entityType: "line_group_operational_authorization",
      targetId: "group-production",
      clientOperationId: "batch-auth",
      reason: "restore group authorization setting",
    });
    const conversationRequest = request({
      environment: "production",
      auditId: "audit-group-conversation",
      entityType: "line_group_ai_conversation",
      targetId: "group-production",
      clientOperationId: "batch-conversation",
      reason: "restore group conversation setting",
    });
    const dryRun = await dryRunDomainRecoveryBatch(env(db), { organizationId: ORGANIZATION_ID }, { targets: [authRequest, conversationRequest] });
    expect(dryRun.groupCount).toBe(1);
    const group = dryRun.groups[0];
    expect(group?.dependencyImpact).toBe(false);
    expect(group?.applyEligibility).toBe("ELIGIBLE");
    expect(group?.targets.every((target) => target.stockImpact.delta === 0 && target.financeImpact.delta === 0)).toBe(true);
    const applied = await applyDomainRecoveryBatch(env(db), { organizationId: ORGANIZATION_ID, actorId: "admin-test", requestId: "batch-apply" }, {
      groups: [{
        groupId: group.groupId,
        stateFingerprint: group.stateFingerprint,
        dryRunToken: group.dryRunToken,
        targets: [
          { ...authRequest, stateFingerprint: group.targets[0].stateFingerprint, dryRunToken: group.targets[0].dryRunToken, confirm: true, previewAcknowledged: true },
          { ...conversationRequest, stateFingerprint: group.targets[1].stateFingerprint, dryRunToken: group.targets[1].dryRunToken, confirm: true, previewAcknowledged: true },
        ],
      }],
    });
    expect(applied).toMatchObject({ appliedGroupCount: 1, blockedGroupCount: 0, groups: [{ status: "APPLIED", applied: true, conflicts: [] }] });
    expect(db.sqlite.prepare("SELECT operational_authorized AS operationalAuthorized, conversation_v2_enabled AS conversationV2Enabled FROM line_groups WHERE group_id = 'group-production'").get()).toEqual({ operationalAuthorized: 0, conversationV2Enabled: 0 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()).toEqual({ count: 4 });
  });

  it("supports selective PIT revert and isolates a test-linked group from Production discovery", async () => {
    const db = new MemoryD1();
    addGroupAudits(db);
    addAudit(db, {
      id: "audit-group-test",
      entityType: "line_group_operational_authorization",
      entityId: "group-test",
      before: { operationalAuthorized: false },
      after: { operationalAuthorized: true },
      createdAt: "2026-02-03T00:00:00.000Z",
    });
    const productionCandidates = await discoverDomainRecovery(env(db), { organizationId: ORGANIZATION_ID }, { environment: "production" });
    expect(productionCandidates.candidates.map((candidate) => candidate.targetId)).not.toContain("group-test");

    const discovery = await discoverDomainPointInTimeRecovery(env(db), { organizationId: ORGANIZATION_ID }, {
      environment: "production",
      targetTime: "2026-02-01T00:00:00.000Z",
    });
    const candidate = discovery.candidates.find((item) => item.auditId === "audit-group-auth");
    expect(candidate).toMatchObject({ disposition: "REVERT", dependencyImpact: false });
    const dryRun = await dryRunDomainPointInTimeRecovery(env(db), { organizationId: ORGANIZATION_ID }, {
      environment: "production",
      targetTime: "2026-02-01T00:00:00.000Z",
      selections: [{ auditId: "audit-group-auth", decision: "REVERT" }],
    });
    const group = dryRun.groups[0];
    const applied = await applyDomainPointInTimeRecovery(env(db), { organizationId: ORGANIZATION_ID, actorId: "admin-test", requestId: "pit-apply" }, {
      environment: "production",
      groups: [{
        groupId: group.groupId,
        targetTime: group.targetTime,
        stateFingerprint: group.stateFingerprint,
        dryRunToken: group.dryRunToken,
        clientOperationId: "pit-group-1",
        selections: [{ auditId: "audit-group-auth", decision: "REVERT" }],
      }],
    });
    expect(applied).toMatchObject({ appliedGroupCount: 1, groups: [{ status: "APPLIED", revertedCandidateIds: ["audit-group-auth"] }] });
    expect(db.sqlite.prepare("SELECT operational_authorized AS operationalAuthorized FROM line_groups WHERE group_id = 'group-production'").get()).toEqual({ operationalAuthorized: 0 });
  });

  it("rejects a Test recovery request for a Production-scoped line group and never crosses organizations", async () => {
    const db = new MemoryD1();
    addGroupAudits(db);
    await expect(dryRunDomainRecovery(env(db), { organizationId: ORGANIZATION_ID }, request({
      environment: "test",
      auditId: "audit-group-auth",
      entityType: "line_group_operational_authorization",
      targetId: "group-production",
    }))).rejects.toMatchObject({ code: "RECOVERY_DOMAIN_ENVIRONMENT_MISMATCH" });
    await expect(dryRunDomainRecovery(env(db), { organizationId: "other-org" }, request())).rejects.toMatchObject({ code: "RECOVERY_DOMAIN_AUDIT_NOT_FOUND" });
  });
});
