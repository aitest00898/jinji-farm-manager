import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { canonicalStockProjection } from "./recording-write-adapter";

const ORGANIZATION_ID = "org-stock-projection-test";
const FARM_ID = "farm-stock-projection-test";

type SqlValue = string | number | null;

class MemoryD1 {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec(`
      CREATE TABLE recording_events (
        id TEXT,
        organization_id TEXT,
        client_operation_id TEXT,
        farm_id TEXT,
        taxonomy_id TEXT,
        total_count INTEGER,
        lifecycle_status TEXT,
        correction_of_id TEXT,
        reversal_of_id TEXT,
        replacement_of_id TEXT
      );
      CREATE TABLE operational_events (
        id TEXT,
        organization_id TEXT,
        source_event_id TEXT,
        farm_id TEXT,
        taxonomy_id TEXT,
        intent TEXT,
        quantity INTEGER,
        reversed_at TEXT,
        correction_of_event_id TEXT,
        reversal_of_event_id TEXT
      );
      CREATE TABLE operational_actions (
        id TEXT,
        organization_id TEXT,
        client_operation_id TEXT,
        farm_id TEXT,
        taxonomy_id TEXT,
        lifecycle_status TEXT,
        correction_of_id TEXT,
        reversal_of_id TEXT,
        replacement_of_id TEXT
      );
      CREATE TABLE abnormal_events (
        id TEXT,
        organization_id TEXT,
        source_event_id TEXT,
        farm_id TEXT,
        taxonomy_id TEXT,
        correction_of_id TEXT,
        reversal_of_id TEXT
      );
    `);
  }

  prepare(sql: string) {
    return new MemoryPreparedStatement(this.sqlite, sql);
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

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.sqlite.prepare(this.sql).all(...this.values) as T[] };
  }
}

function operationalEvent(
  db: MemoryD1,
  input: {
    id: string;
    taxonomyId: "O3" | "O9";
    intent: "shipment" | "mortality" | "cull";
    quantity: number;
    reversedAt?: string;
    correctionOfId?: string;
    reversalOfId?: string;
  },
) {
  db.sqlite.prepare(`
    INSERT INTO operational_events
      (id, organization_id, source_event_id, farm_id, taxonomy_id, intent, quantity,
       reversed_at, correction_of_event_id, reversal_of_event_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    ORGANIZATION_ID,
    `source-${input.id}`,
    FARM_ID,
    input.taxonomyId,
    input.intent,
    input.quantity,
    input.reversedAt ?? null,
    input.correctionOfId ?? null,
    input.reversalOfId ?? null,
  );
}

function abnormalEvent(db: MemoryD1, id: string, taxonomyId = "A1") {
  db.sqlite.prepare(`
    INSERT INTO abnormal_events
      (id, organization_id, source_event_id, farm_id, taxonomy_id, correction_of_id, reversal_of_id)
    VALUES (?, ?, ?, ?, ?, NULL, NULL)
  `).run(id, ORGANIZATION_ID, `source-${id}`, FARM_ID, taxonomyId);
}

async function project(db: MemoryD1) {
  return canonicalStockProjection(
    { DB: db as unknown as D1Database },
    ORGANIZATION_ID,
    FARM_ID,
  );
}

describe("canonical stock projection relation semantics", () => {
  it("S1 applies one active O3 shipment exactly once", async () => {
    const db = new MemoryD1();
    operationalEvent(db, { id: "s1-shipment", taxonomyId: "O3", intent: "shipment", quantity: 10 });

    await expect(project(db)).resolves.toMatchObject({ currentStockDelta: -10, appliedFactCount: 1, duplicateAuthorityCount: 0 });
    db.sqlite.close();
  });

  it("S2 neutralizes an O3 reversal pair without counting the child", async () => {
    const db = new MemoryD1();
    operationalEvent(db, { id: "s2-original", taxonomyId: "O3", intent: "shipment", quantity: 10 });
    operationalEvent(db, { id: "s2-reversal", taxonomyId: "O3", intent: "shipment", quantity: 10, reversalOfId: "s2-original" });

    await expect(project(db)).resolves.toMatchObject({ currentStockDelta: 0, appliedFactCount: 1, duplicateAuthorityCount: 0 });
    db.sqlite.close();
  });

  it("S3 replaces an O3 parent with its correction exactly once", async () => {
    const db = new MemoryD1();
    operationalEvent(db, { id: "s3-original", taxonomyId: "O3", intent: "shipment", quantity: 10 });
    operationalEvent(db, { id: "s3-correction", taxonomyId: "O3", intent: "shipment", quantity: 7, correctionOfId: "s3-original" });

    await expect(project(db)).resolves.toMatchObject({ currentStockDelta: -7, appliedFactCount: 1, duplicateAuthorityCount: 0 });
    db.sqlite.close();
  });

  it("S4 keeps A1 abnormal observations at zero stock effect", async () => {
    const db = new MemoryD1();
    operationalEvent(db, { id: "s4-mortality", taxonomyId: "O9", intent: "mortality", quantity: 5 });
    abnormalEvent(db, "s4-abnormality");

    await expect(project(db)).resolves.toMatchObject({ currentStockDelta: -5, appliedFactCount: 2, duplicateAuthorityCount: 0 });
    db.sqlite.close();
  });

  it("S5 keeps O9 mortality/cull authority singular across reversal", async () => {
    const db = new MemoryD1();
    operationalEvent(db, { id: "s5-original", taxonomyId: "O9", intent: "cull", quantity: 5, reversedAt: "2026-09-10T00:00:00.000Z" });

    await expect(project(db)).resolves.toMatchObject({ currentStockDelta: 0, appliedFactCount: 1, duplicateAuthorityCount: 0 });
    db.sqlite.close();
  });

  it("S6 reconciles mixed append-only relations without double counting", async () => {
    const db = new MemoryD1();
    operationalEvent(db, { id: "s6-reversed-original", taxonomyId: "O3", intent: "shipment", quantity: 10 });
    operationalEvent(db, { id: "s6-reversal", taxonomyId: "O3", intent: "shipment", quantity: 10, reversalOfId: "s6-reversed-original" });
    operationalEvent(db, { id: "s6-corrected-original", taxonomyId: "O3", intent: "shipment", quantity: 10 });
    operationalEvent(db, { id: "s6-correction", taxonomyId: "O3", intent: "shipment", quantity: 2, correctionOfId: "s6-corrected-original" });
    operationalEvent(db, { id: "s6-mortality", taxonomyId: "O9", intent: "mortality", quantity: 4 });
    abnormalEvent(db, "s6-abnormality", "A8");

    await expect(project(db)).resolves.toMatchObject({ currentStockDelta: -6, appliedFactCount: 4, duplicateAuthorityCount: 0 });
    db.sqlite.close();
  });
});
