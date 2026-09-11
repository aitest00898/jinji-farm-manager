import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  persistAbnormalEventLineage,
  persistOperationalEventLineage,
} from "./canonical-lineage-service";
import { CanonicalWriteError } from "./recording-write-adapter";
import type { LegacyAbnormalEventRow, LegacyOperationalEventRow } from "./recording-runtime-bridge";

type SqlValue = string | number | null;

class MemoryD1 {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec(`
      CREATE TABLE farms (
        id TEXT PRIMARY KEY, organization_id TEXT, name TEXT,
        environment TEXT NOT NULL, active INTEGER NOT NULL
      );
      CREATE TABLE houses (
        id TEXT PRIMARY KEY, farm_id TEXT, name TEXT, active INTEGER NOT NULL
      );
      CREATE TABLE flocks (
        id TEXT PRIMARY KEY, farm_id TEXT, house_id TEXT, status TEXT
      );
      CREATE TABLE line_groups (
        group_id TEXT PRIMARY KEY, status TEXT NOT NULL, organization_id TEXT
      );
      CREATE TABLE operational_events (
        id TEXT PRIMARY KEY, organization_id TEXT, farm_id TEXT, line_group_id TEXT,
        line_user_id TEXT, intent TEXT, quantity REAL, unit TEXT, event_date TEXT,
        house TEXT, house_id TEXT, flock_id TEXT, raw_message TEXT, raw_farm_text TEXT,
        note TEXT, source_event_id TEXT UNIQUE, taxonomy_id TEXT, family TEXT,
        canonical_type TEXT, subtype TEXT, sex TEXT, total_weight REAL,
        average_weight REAL, weight_unit TEXT, occurred_at TEXT, source_channel TEXT,
        created_at TEXT, reversal_of_event_id TEXT, correction_of_event_id TEXT,
        quick_bundle_id TEXT, reversed_at TEXT
      );
      CREATE TABLE abnormal_events (
        id TEXT PRIMARY KEY, organization_id TEXT, farm_id TEXT, house_id TEXT,
        flock_id TEXT, occurred_at TEXT, occurred_date TEXT, approximate_period TEXT,
        reported_at TEXT, raw_text TEXT, source TEXT, actor_id TEXT,
        classification_status TEXT, weather_date TEXT, status TEXT,
        correction_of_id TEXT, reversal_of_id TEXT, reason TEXT,
        source_event_id TEXT UNIQUE, taxonomy_id TEXT, family TEXT, canonical_type TEXT,
        subtype TEXT, extent TEXT, linked_mortality_event_id TEXT, detail TEXT,
        measured_temperature REAL, measurement TEXT, evidence TEXT,
        source_candidate_id TEXT, source_channel TEXT, created_at TEXT,
        quick_bundle_id TEXT
      );
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY, organization_id TEXT, source TEXT, actor_type TEXT,
        actor_id TEXT, action TEXT, entity_type TEXT, entity_id TEXT,
        before_json TEXT, after_json TEXT, changed_fields_json TEXT,
        reason TEXT, request_id TEXT
      );
    `);
    this.sqlite.prepare("INSERT INTO farms VALUES (?, ?, ?, ?, ?)").run("farm-lineage", "org-lineage", "Lineage farm", "test", 1);
    this.sqlite.prepare("INSERT INTO farms VALUES (?, ?, ?, ?, ?)").run("farm-other", "org-other", "Other farm", "test", 1);
    this.sqlite.prepare("INSERT INTO houses VALUES (?, ?, ?, ?)").run("house-lineage", "farm-lineage", "House", 1);
    this.sqlite.prepare("INSERT INTO flocks VALUES (?, ?, ?, ?)").run("flock-lineage", "farm-lineage", "house-lineage", "active");
    this.sqlite.prepare("INSERT INTO line_groups VALUES (?, ?, ?)").run("group-lineage", "bound", "org-lineage");
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

const context = {
  organizationId: "org-lineage",
  actorType: "line_user" as const,
  actorId: "line-user",
  requestId: "lineage-test-request",
  lineGroupId: "group-lineage",
  lineUserId: "line-user",
  environment: "test" as const,
  expectedSourceChannel: "line" as const,
};

function operationalRow(): LegacyOperationalEventRow {
  return {
    id: "operational-original",
    organization_id: "org-lineage",
    farm_id: "farm-lineage",
    line_group_id: "group-lineage",
    line_user_id: "line-user",
    intent: "feed",
    quantity: 10,
    unit: "kg",
    event_date: "2026-09-11",
    occurred_at: "2026-09-11T01:00:00.000Z",
    house_id: "house-lineage",
    flock_id: "flock-lineage",
    raw_message: "飼料 10kg",
    raw_farm_text: "Lineage farm",
    source_event_id: "lineage-original-source",
    source_channel: "line",
    created_at: "2026-09-11T01:00:00.000Z",
  };
}

function abnormalRow(): LegacyAbnormalEventRow {
  return {
    id: "abnormal-original",
    organization_id: "org-lineage",
    farm_id: "farm-lineage",
    house_id: "house-lineage",
    flock_id: "flock-lineage",
    occurred_at: "2026-09-11T01:00:00.000Z",
    occurred_date: "2026-09-11",
    reported_at: "2026-09-11T01:01:00.000Z",
    raw_text: "咳嗽",
    source: "line",
    source_event_id: "abnormal-original-source",
    created_at: "2026-09-11T01:01:00.000Z",
    status: "active",
  };
}

describe("canonical lineage service", () => {
  it("appends operational correction without mutating the original and is idempotent", async () => {
    const db = new MemoryD1();
    const original = operationalRow();
    db.sqlite.prepare(
      `INSERT INTO operational_events
       (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit,
        event_date, house, house_id, flock_id, raw_message, raw_farm_text, source_event_id,
        source_channel, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(...([original.id, original.organization_id, original.farm_id, original.line_group_id, original.line_user_id, original.intent, original.quantity, original.unit, original.event_date, "House", original.house_id, original.flock_id, original.raw_message, original.raw_farm_text, original.source_event_id, original.source_channel, original.created_at] as never[]));

    const env = { DB: db as unknown as D1Database };
    const first = await persistOperationalEventLineage(env, original, {
      kind: "correction",
      originalId: original.id,
      childId: "operational-correction",
      clientOperationId: "lineage-correction-operation",
      quantity: 12,
      reason: "修正飼料量",
    }, context);
    expect(first).toMatchObject({ id: "operational-correction", created: true, canonical: false });

    const unchanged = db.sqlite.prepare("SELECT quantity, reversed_at, correction_of_event_id FROM operational_events WHERE id = ?").get(original.id) as Record<string, unknown>;
    expect(unchanged).toEqual({ quantity: 10, reversed_at: null, correction_of_event_id: null });
    expect(db.sqlite.prepare("SELECT quantity, correction_of_event_id FROM operational_events WHERE id = ?").get("operational-correction")).toEqual({ quantity: 12, correction_of_event_id: original.id });

    const replay = await persistOperationalEventLineage(env, original, {
      kind: "correction",
      originalId: original.id,
      childId: "operational-correction-replay",
      clientOperationId: "lineage-correction-operation",
      quantity: 99,
    }, context);
    expect(replay).toMatchObject({ id: "operational-correction", created: false });

    await expect(persistOperationalEventLineage(env, original, {
      kind: "correction",
      originalId: original.id,
      childId: "operational-correction-duplicate",
      clientOperationId: "lineage-correction-other-operation",
      quantity: 13,
    }, context)).rejects.toMatchObject({
      code: "CANONICAL_LINEAGE_ALREADY_EXISTS",
    } satisfies Partial<CanonicalWriteError>);
    db.sqlite.close();
  });

  it("appends abnormal reversal without mutating the original and rejects cross-organization scope", async () => {
    const db = new MemoryD1();
    const original = abnormalRow();
    db.sqlite.prepare(
      `INSERT INTO abnormal_events
       (id, organization_id, farm_id, house_id, flock_id, occurred_at, occurred_date,
        reported_at, raw_text, source, source_event_id, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(...([original.id, original.organization_id, original.farm_id, original.house_id, original.flock_id, original.occurred_at, original.occurred_date, original.reported_at, original.raw_text, original.source, original.source_event_id, original.created_at, original.status] as never[]));

    const env = { DB: db as unknown as D1Database };
    const result = await persistAbnormalEventLineage(env, original, {
      kind: "reversal",
      originalId: original.id,
      childId: "abnormal-reversal",
      clientOperationId: "lineage-reversal-operation",
      reason: "取消異常",
    }, context);
    expect(result).toMatchObject({ id: "abnormal-reversal", created: true, canonical: false });
    expect(db.sqlite.prepare("SELECT status, reversal_of_id FROM abnormal_events WHERE id = ?").get(original.id)).toEqual({ status: "active", reversal_of_id: null });
    expect(db.sqlite.prepare("SELECT status, reversal_of_id FROM abnormal_events WHERE id = ?").get("abnormal-reversal")).toEqual({ status: "reversal", reversal_of_id: original.id });

    await expect(persistAbnormalEventLineage(env, original, {
      kind: "correction",
      originalId: original.id,
      childId: "abnormal-cross-org",
      clientOperationId: "lineage-cross-org-operation",
      rawText: "跨組織",
      targetFarmId: "farm-other",
    }, context)).rejects.toMatchObject({ code: "CANONICAL_SCOPE_INVALID" });
    db.sqlite.close();
  });
});
