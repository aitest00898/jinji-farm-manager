import { describe, expect, it, vi } from "vitest";
import { ambientDigestRunIdForTest, runAmbientDigest, type AmbientBufferedMessage, type AmbientCandidateBundle, type AmbientEnv, type AmbientValidationDiagnostics } from "./ambient";

type FakeRow = AmbientBufferedMessage & { digestStatus: "buffered" | "processed" };

class FakeD1 {
  readonly buffers: FakeRow[];
  readonly runs = new Map<string, Record<string, unknown>>();
  readonly leases = new Map<string, string>();
  failObservability = false;

  constructor(messages: FakeRow[]) {
    this.buffers = messages.map((message) => ({ ...message }));
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async batch(statements: FakeStatement[]) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

class FakeStatement {
  private values: unknown[] = [];

  constructor(private readonly db: FakeD1, private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async run() {
    const sql = this.sql.replace(/\s+/gu, " ").trim();
    if (this.db.failObservability && sql.includes("ambient_digest_runs")) throw new Error("observability_storage_unavailable");
    if (sql.startsWith("INSERT INTO ambient_digest_runs")) {
      const [runId, organizationId, groupId, scheduledFor, trigger, runStartedAt, expiresAt] = this.values as string[];
      const old = this.db.runs.get(runId);
      this.db.runs.set(runId, {
        runId, organizationId, groupId, scheduledFor, trigger, runStartedAt, expiresAt,
        attemptCount: old ? Number(old.attemptCount ?? 1) + 1 : 1,
        runStatus: "running", leaseStatus: "not_attempted", sourceStatus: "not_started",
        sourceCount: 0, prefilterStatus: "not_started", prefilterCount: 0, aiStatus: "not_started",
        validationStatus: "not_started", validationCount: 0, reconcileStatus: "not_started",
        reconcileCount: 0, candidateWriteStatus: "not_started", candidateCreatedCount: 0,
        bufferConsumeStatus: "not_started", processedCount: 0, deliveryStatus: "not_requested",
      });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("UPDATE ambient_digest_runs SET")) {
      const match = sql.match(/^UPDATE ambient_digest_runs SET (.+), updated_at = \? WHERE run_id = \?$/u);
      if (!match) throw new Error("unhandled_observability_update");
      const keys = match[1].split(", ").map((part) => part.split(" = ")[0]);
      const row = this.db.runs.get(String(this.values[this.values.length - 1]));
      if (!row) return { meta: { changes: 0 } };
      keys.forEach((key, index) => {
        const camelKey = key.replace(/_([a-z])/gu, (_match, letter: string) => letter.toUpperCase());
        row[camelKey] = this.values[index];
      });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("DELETE FROM ambient_digest_runs")) return { meta: { changes: 0 } };
    if (sql.startsWith("INSERT INTO ambient_digest_leases")) {
      const [organizationId, groupId, ownerId] = this.values as string[];
      const key = `${organizationId}:${groupId}`;
      if (this.db.leases.has(key)) return { meta: { changes: 0 } };
      this.db.leases.set(key, ownerId);
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("UPDATE ambient_digest_leases")) return { meta: { changes: 1 } };
    if (sql.startsWith("UPDATE ambient_chat_buffer SET digest_status = 'processed'")) {
      const [cutoff, organizationId, groupId] = this.values as string[];
      let changes = 0;
      for (const row of this.db.buffers) {
        if (row.digestStatus === "buffered" && row.eventTimestamp <= cutoff && row.organizationId === organizationId && row.lineGroupId === groupId) {
          row.digestStatus = "processed";
          changes += 1;
        }
      }
      return { meta: { changes } };
    }
    if (sql.startsWith("DELETE FROM ambient_chat_buffer")) return { meta: { changes: 0 } };
    if (sql.startsWith("DELETE FROM ambient_digest_candidates")) return { meta: { changes: 0 } };
    return { meta: { changes: 0 } };
  }

  async all<T>() {
    const sql = this.sql.replace(/\s+/gu, " ").trim();
    if (sql.includes("GROUP BY line_group_id, organization_id")) {
      const [cutoff] = this.values as string[];
      const unique = new Map<string, { lineGroupId: string; organizationId: string }>();
      for (const row of this.db.buffers) {
        if (row.digestStatus === "buffered" && row.eventTimestamp <= cutoff) unique.set(`${row.organizationId}:${row.lineGroupId}`, { lineGroupId: row.lineGroupId, organizationId: row.organizationId });
      }
      return { results: [...unique.values()] as T[] };
    }
    if (sql.includes("FROM ambient_chat_buffer") && sql.includes("line_message_id AS lineMessageId")) {
      const [cutoff, organizationId, groupId] = this.values as string[];
      return {
        results: this.db.buffers
          .filter((row) => row.digestStatus === "buffered" && row.eventTimestamp <= cutoff && row.organizationId === organizationId && row.lineGroupId === groupId)
          .map(({ digestStatus: _digestStatus, ...row }) => row) as T[],
      };
    }
    return { results: [] as T[] };
  }

  async first<T>() {
    return null as T | null;
  }
}

function message(text: string): FakeRow {
  return {
    id: `ambient-${text}`,
    organizationId: "org-test",
    lineGroupId: "group-test",
    lineUserId: "user-test",
    lineMessageId: `message-${text}`,
    eventTimestamp: "2026-08-24T03:00:00.000Z",
    text,
    digestHour: "2026-08-24T11:00:00+08:00",
    digestStatus: "buffered",
  };
}

function env(db: FakeD1): AmbientEnv {
  return { DB: db as unknown as D1Database };
}

const now = new Date("2026-08-24T04:00:00.000Z");

describe("durable Ambient stage observability", () => {
  it("keeps one deterministic run identity and records a completed zero-prefilter run", async () => {
    const db = new FakeD1([message("大家吃飯了嗎")]);
    const run = await runAmbientDigest(env(db), { now, trigger: "cron", extract: vi.fn() });
    const runId = ambientDigestRunIdForTest("org-test", "group-test", "cron", now.toISOString());
    const row = db.runs.get(runId);
    expect(ambientDigestRunIdForTest("org-test", "group-test", "cron", now.toISOString())).toBe(runId);
    expect(run.failedGroups).toBe(0);
    expect(row).toMatchObject({ runStatus: "completed", leaseStatus: "released", sourceStatus: "success", sourceCount: 1, prefilterStatus: "zero", prefilterCount: 0, bufferConsumeStatus: "success", processedCount: 1 });
    expect(db.buffers[0]?.digestStatus).toBe("processed");
  });

  it("notifies the existing full group terminal boundary exactly once", async () => {
    const db = new FakeD1([message("大家吃飯了嗎")]);
    const terminals: Array<{ organizationId: string; groupId: string; status: string }> = [];
    await runAmbientDigest(env(db), {
      now,
      trigger: "cron",
      extract: vi.fn(),
      onGroupTerminal: (context) => terminals.push(context),
    });

    expect(terminals).toEqual([{ organizationId: "org-test", groupId: "group-test", status: "completed" }]);
  });

  it("records AI timeout and leaves the source buffered for safe retry", async () => {
    const db = new FakeD1([message("金雞測試場死亡2隻")]);
    const run = await runAmbientDigest(env(db), {
      now, trigger: "cron", extract: async () => { const error = new Error("AI timed out"); error.name = "TimeoutError"; throw error; },
    });
    const row = db.runs.get(ambientDigestRunIdForTest("org-test", "group-test", "cron", now.toISOString()));
    expect(run.failedGroups).toBe(1);
    expect(row).toMatchObject({ runStatus: "failed", sourceCount: 1, prefilterCount: 1, aiStatus: "timeout", validationStatus: "not_started", errorStage: "ai", errorClass: "timeout" });
    expect(db.buffers[0]?.digestStatus).toBe("buffered");
  });

  it("distinguishes provider success from schema validation rejection", async () => {
    const db = new FakeD1([message("金雞測試場死亡2隻")]);
    await runAmbientDigest(env(db), {
      now, trigger: "cron", extract: async () => ({ attempted: true, bundle: null, validation: "schema_invalid", errorClass: "invalid_ambient_candidate_json" }),
    });
    const row = db.runs.get(ambientDigestRunIdForTest("org-test", "group-test", "cron", now.toISOString()));
    expect(row).toMatchObject({ runStatus: "failed", aiStatus: "success", validationStatus: "rejected", errorStage: "validation", errorClass: "schema_invalid" });
    expect(db.buffers[0]?.digestStatus).toBe("buffered");
  });

  it("persists bounded validation diagnostics beside the run without source values", async () => {
    const db = new FakeD1([message("金雞測試場死亡2隻")]);
    const validationDiagnostics: AmbientValidationDiagnostics = {
      rootKind: "object",
      envelopeKind: "candidates",
      candidateCount: 1,
      issueCount: 1,
      firstIssueCode: "INVALID_ENUM",
      firstIssuePath: "candidates[0].items[0].type",
      firstExpectedType: "enum",
      firstActualType: "string",
      failedCandidateIndex: 0,
      structuralKeysJson: JSON.stringify({ rootKeys: ["candidates"], candidateKeys: [["items", "type"]] }),
      issueSummaryJson: JSON.stringify([{ code: "INVALID_ENUM", path: "candidates[0].items[0].type", expected: "enum", actual: "string", candidateIndex: 0, safeEnumActual: "死亡" }]),
      safeEnumActual: "死亡",
    };
    await runAmbientDigest(env(db), {
      now, trigger: "cron", extract: async () => ({ attempted: true, bundle: null, validation: "schema_invalid", errorClass: "invalid_ambient_candidate_json", validationDiagnostics }),
    });
    const row = db.runs.get(ambientDigestRunIdForTest("org-test", "group-test", "cron", now.toISOString()));
    expect(row).toMatchObject({ validationRootKind: "object", validationEnvelopeKind: "candidates", validationCandidateCount: 1, validationIssueCount: 1, validationFirstIssueCode: "INVALID_ENUM", validationFirstIssuePath: "candidates[0].items[0].type", validationFirstActualType: "string", validationFailedCandidateIndex: 0, validationSafeEnumActual: "死亡" });
    expect(String(row?.validationIssueSummaryJson)).not.toContain("金雞測試場");
    expect(String(row?.validationStructuralKeysJson)).not.toContain("死亡");
  });

  it("does not turn observability storage failure into a duplicate or business failure", async () => {
    const db = new FakeD1([message("大家吃飯了嗎")]);
    db.failObservability = true;
    const run = await runAmbientDigest(env(db), { now, trigger: "cron", extract: vi.fn() });
    expect(run.failedGroups).toBe(0);
    expect(db.buffers[0]?.digestStatus).toBe("processed");
  });

  it("runs the development dry-run through enrichment/reconcile without writing or consuming", async () => {
    const db = new FakeD1([message("金雞測試場死亡2隻")]);
    const bundle: AmbientCandidateBundle = {
      candidates: [{
        farmText: "金雞測試場",
        houseText: null,
        flockText: null,
        items: [{ type: "mortality", quantity: 2, raw: "死亡2隻", confidence: "high" }],
        conflict: false,
      }],
    };
    const run = await runAmbientDigest(env(db), {
      now,
      trigger: "manual",
      executionMode: "dev_dry_run",
      devSessionId: "dev-session-test",
      sourceMessageIds: ["message-金雞測試場死亡2隻"],
      extract: vi.fn(async () => ({ attempted: true, bundle, validation: "schema_valid" as const })),
    });
    const row = db.runs.get(ambientDigestRunIdForTest("org-test", "group-test", "manual", now.toISOString()));
    expect(run.executionMode).toBe("dev_dry_run");
    expect(row).toMatchObject({ runStatus: "completed", executionMode: "dev_dry_run", devSessionId: "dev-session-test", normalizationStatus: "success", enrichmentStatus: "success", resolveStatus: "success", reconcileStatus: "success", candidateWriteStatus: "none_required", bufferConsumeStatus: "not_reached", processedCount: 0 });
    const semantic = JSON.parse(String(row?.devSemanticSummaryJson)) as { validatedCandidateCount: number; itemCount: number; committedCandidateCount: number; candidates: Array<{ items: Array<Record<string, unknown>> }> };
    expect(semantic).toMatchObject({ validatedCandidateCount: 1, itemCount: 1, committedCandidateCount: 0 });
    expect(JSON.stringify(semantic)).not.toContain("死亡2隻");
    expect(semantic.candidates[0]?.items[0]).not.toHaveProperty("raw");
    expect(db.buffers[0]?.digestStatus).toBe("buffered");
  });
});
