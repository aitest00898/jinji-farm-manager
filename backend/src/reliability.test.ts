import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  LINE_EVENT_MAX_PROCESSING_ATTEMPTS,
  LINE_EVENT_PAYLOAD_RETENTION_MS,
  LINE_EVENT_RECOVERY_CRON,
  LINE_EVENT_THRESHOLDS_MS,
  ensureLineEventReceipt,
  acknowledgeRetainedLineEvents,
  claimReplyDelivery,
  finishDeliveryAttempt,
  formatReliabilityStatusForLine,
  getLineEventReceipt,
  getReliabilityReadiness,
  getReliabilityStatus,
  manuallyRecoverLineEvents,
  markBusinessCompleted,
  markLineEventFailure,
  markLineEventQueued,
  markReplyAttempted,
  markReplyCompleted,
  markReplyDefiniteNotSent,
  markReplyUncertain,
  markRedisplayCompleted,
  markRetainedLineEventManuallyRecorded,
  persistReplyNotice,
  preparePushRetryKey,
  prepareRedisplayRetryKey,
  prepareLineEvent,
  redactExpiredLineEventPayloads,
  recoverStalledLineEvents,
  resolveRetainedLineEvent,
  reliabilityErrorClass,
  startDeliveryAttempt,
  type ReliabilityLineEvent,
} from "./reliability";

type SqlValue = string | number | null;

class MemoryD1 {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec(`
      CREATE TABLE line_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        group_id TEXT,
        received_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        processed_at TEXT,
        correlation_id TEXT,
        lifecycle_status TEXT NOT NULL DEFAULT 'received',
        business_status TEXT NOT NULL DEFAULT 'pending',
        reply_status TEXT NOT NULL DEFAULT 'pending',
        queued_at TEXT,
        processing_started_at TEXT,
        business_completed_at TEXT,
        reply_attempted_at TEXT,
        reply_completed_at TEXT,
        queue_attempts INTEGER NOT NULL DEFAULT 0,
        processing_attempts INTEGER NOT NULL DEFAULT 0,
        reply_attempts INTEGER NOT NULL DEFAULT 0,
        last_error_stage TEXT,
        last_error_class TEXT,
        last_error_message TEXT,
        last_error_at TEXT,
        next_retry_at TEXT,
        reply_payload_json TEXT,
        payload_expires_at TEXT,
        delayed_notice_sent_at TEXT,
        recovery_owner TEXT,
        recovery_lease_until TEXT,
        retained_until TEXT,
        first_received_at TEXT,
        last_received_at TEXT,
        receive_count INTEGER NOT NULL DEFAULT 1,
        redelivery_count INTEGER NOT NULL DEFAULT 0,
        enqueue_attempted_at TEXT,
        processing_owner TEXT,
        processing_lease_until TEXT,
        business_started_at TEXT,
        business_outcome TEXT NOT NULL DEFAULT 'pending',
        reply_owner TEXT,
        reply_lease_until TEXT,
        reply_delivery_mode TEXT,
        reply_outcome TEXT NOT NULL DEFAULT 'pending',
        reply_last_http_status INTEGER,
        reply_last_request_id TEXT,
        reply_retry_key TEXT,
        reply_uncertain_at TEXT,
        reply_notice_id TEXT,
        reply_notice_payload_json TEXT,
        reply_notice_retry_key TEXT,
        reply_notice_attempts INTEGER NOT NULL DEFAULT 0,
        reply_notice_sent_at TEXT,
        redisplay_retry_key TEXT,
        redisplay_expires_at TEXT,
        retained_acknowledged_at TEXT,
        retained_acknowledged_by TEXT,
        resolution_status TEXT NOT NULL DEFAULT 'unresolved',
        resolved_at TEXT,
        resolved_by TEXT,
        resolution_reason TEXT,
        resolution_note TEXT,
        manual_record_reference TEXT,
        conversation_routing_json TEXT
      );
      CREATE TABLE line_event_recovery_audit (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        actor_id TEXT,
        action TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        attempt INTEGER,
        error_stage TEXT,
        error_class TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE line_groups (group_id TEXT PRIMARY KEY, organization_id TEXT);
      CREATE TABLE line_event_delivery_attempts (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        delivery_stage TEXT NOT NULL,
        delivery_mode TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        owner TEXT,
        outcome TEXT NOT NULL,
        http_status INTEGER,
        line_request_id TEXT,
        error_class TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        expires_at TEXT NOT NULL
      );
    `);
  }

  prepare(sql: string) {
    return new MemoryPreparedStatement(this.sqlite, sql);
  }

  exec(sql: string): void {
    this.sqlite.exec(sql);
  }
}

class MemoryPreparedStatement {
  constructor(private readonly sqlite: DatabaseSync, private readonly sql: string, private readonly values: SqlValue[] = []) {}

  bind(...values: SqlValue[]): MemoryPreparedStatement {
    return new MemoryPreparedStatement(this.sqlite, this.sql, values);
  }

  async run(): Promise<{ meta: { changes: number } }> {
    const result = this.sqlite.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }

  async first<T>(): Promise<T | null> {
    return (this.sqlite.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.sqlite.prepare(this.sql).all(...this.values) as T[] };
  }
}

function event(id: string): ReliabilityLineEvent {
  return {
    type: "message",
    webhookEventId: id,
    timestamp: Date.parse("2035-01-01T00:00:00.000Z"),
    replyToken: `${id}-reply-token`,
    source: { type: "group", groupId: "fault-test-group", userId: "fault-test-user" },
    message: { id: `${id}-message`, type: "text", text: "死亡5" },
  };
}

function env(db: MemoryD1) {
  return { DB: db } as unknown as Parameters<typeof ensureLineEventReceipt>[0];
}

describe("LINE reliability lifecycle and fault recovery", () => {
  it("keeps an ingress receipt before Queue enqueue can finish", async () => {
    const db = new MemoryD1();
    const source = event("fault-ingress");
    const receipt = await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");

    expect(receipt.lifecycleStatus).toBe("received");
    expect(receipt.correlationId).toBe("fault-ingress");
    expect(receipt.payloadJson).toContain("fault-ingress");
    expect(Date.parse(receipt.payloadExpiresAt ?? "") - Date.parse(receipt.receivedAt)).toBe(LINE_EVENT_PAYLOAD_RETENTION_MS);
  });

  it("retries an enqueue failure through the same correlated event", async () => {
    const db = new MemoryD1();
    const source = event("fault-enqueue");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    await markLineEventQueued(env(db), source.webhookEventId!, new Date("2035-01-01T00:00:01.000Z"), "webhook");
    const failed = await markLineEventFailure(env(db), source.webhookEventId!, "enqueue", new Error("queue send timeout"), new Date("2035-01-01T00:00:02.000Z"));
    expect(failed).toBe("retry_waiting");

    const sent: unknown[] = [];
    const result = await recoverStalledLineEvents({ ...env(db), EVENTS: { send: async (message: unknown) => { sent.push(message); } } }, new Date("2035-01-01T00:00:08.000Z"));
    expect(result.requeued).toBe(1);
    expect(sent).toHaveLength(1);
    expect((sent[0] as { correlationId: string }).correlationId).toBe("fault-enqueue");
    expect((await getLineEventReceipt(db as unknown as D1Database, "fault-enqueue"))?.lifecycleStatus).toBe("queued");
  });

  it("bounds repeated processing failures and keeps the payload for review", async () => {
    const db = new MemoryD1();
    const source = event("fault-d1");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    db.exec(`UPDATE line_events SET lifecycle_status='processing', processing_attempts=${LINE_EVENT_MAX_PROCESSING_ATTEMPTS} WHERE event_id='fault-d1'`);

    const result = await markLineEventFailure(env(db), "fault-d1", "processing", new Error("D1_ERROR: internal error"), new Date("2035-01-01T00:03:00.000Z"));
    const receipt = await getLineEventReceipt(db as unknown as D1Database, "fault-d1");
    expect(result).toBe("retained");
    expect(receipt?.lifecycleStatus).toBe("retained");
    expect(receipt?.payloadJson).toContain("fault-d1");
    expect(receipt?.lastErrorClass).toBe("d1_error");
  });

  it("separates business completion from a failed LINE reply", async () => {
    const db = new MemoryD1();
    const source = event("fault-reply");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    await markBusinessCompleted(env(db), "fault-reply", [{ type: "text", text: "已完成" }], new Date("2035-01-01T00:00:01.000Z"));
    await markReplyAttempted(env(db), "fault-reply", new Date("2035-01-01T00:00:02.000Z"));
    await markLineEventFailure(env(db), "fault-reply", "reply", new Error("LINE reply failed: 500"), new Date("2035-01-01T00:00:03.000Z"));

    const receipt = await getLineEventReceipt(db as unknown as D1Database, "fault-reply");
    const next = await prepareLineEvent(env(db), source, "2035-01-01T00:00:00.000Z");
    expect(receipt).toMatchObject({ businessStatus: "completed", replyStatus: "failed", lifecycleStatus: "retry_waiting" });
    expect(next.kind).toBe("reply_only");
    expect(next.kind === "reply_only" ? next.receipt.replyPayloadJson : null).toContain("已完成");
  });

  it("does not duplicate a business write when a reply-only retry is prepared", async () => {
    const db = new MemoryD1();
    const source = event("fault-candidate-reply");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    await markBusinessCompleted(env(db), "fault-candidate-reply", [{ type: "text", text: "待確認資料已保留" }], new Date("2035-01-01T00:00:01.000Z"));
    const before = await getLineEventReceipt(db as unknown as D1Database, "fault-candidate-reply");
    const next = await prepareLineEvent(env(db), source, "2035-01-01T00:00:00.000Z");
    const after = await getLineEventReceipt(db as unknown as D1Database, "fault-candidate-reply");
    expect(next.kind).toBe("reply_only");
    expect(after?.businessCompletedAt).toBe(before?.businessCompletedAt);
    expect(after?.replyPayloadJson).toBe(before?.replyPayloadJson);
  });

  it("allows one authorized manual recovery and makes a duplicate click a no-op", async () => {
    const db = new MemoryD1();
    const source = event("fault-manual");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    db.exec(`UPDATE line_events SET lifecycle_status='retained', retained_until='2035-01-08T00:00:00.000Z', payload_expires_at='2035-01-02T00:00:00.000Z' WHERE event_id='fault-manual'`);
    const sent: unknown[] = [];
    const queueEnv = { ...env(db), EVENTS: { send: async (message: unknown) => { sent.push(message); } } };

    const first = await manuallyRecoverLineEvents(queueEnv, "web-admin", new Date("2035-01-01T01:00:00.000Z"));
    const second = await manuallyRecoverLineEvents(queueEnv, "web-admin", new Date("2035-01-01T01:00:01.000Z"));
    expect(first.requeued).toBe(1);
    expect(second.requeued).toBe(0);
    expect(sent).toHaveLength(1);
    expect((await getLineEventReceipt(db as unknown as D1Database, "fault-manual"))?.lifecycleStatus).toBe("queued");
  });

  it("adds the delayed-reply notice once, not once per retry", async () => {
    const db = new MemoryD1();
    const source = event("fault-delay");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    const first = await import("./reliability").then(({ claimDelayedReplyNotice }) => claimDelayedReplyNotice(env(db), "fault-delay", new Date("2035-01-01T00:00:11.000Z")));
    const second = await import("./reliability").then(({ claimDelayedReplyNotice }) => claimDelayedReplyNotice(env(db), "fault-delay", new Date("2035-01-01T00:00:12.000Z")));
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("redacts expired raw event payloads without making them recoverable", async () => {
    const db = new MemoryD1();
    const source = event("fault-expired");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    db.exec(`UPDATE line_events SET lifecycle_status='retained', retained_until='2035-01-08T00:00:00.000Z', payload_expires_at='2035-01-01T00:00:01.000Z' WHERE event_id='fault-expired'`);
    expect(await redactExpiredLineEventPayloads(env(db), new Date("2035-01-02T00:00:00.000Z"))).toBe(1);
    const receipt = await getLineEventReceipt(db as unknown as D1Database, "fault-expired");
    const recovery = await manuallyRecoverLineEvents({ ...env(db), EVENTS: { send: async () => {} } }, "web-admin", new Date("2035-01-02T00:00:00.000Z"));
    expect(receipt?.payloadJson).toBe('{"redacted":true}');
    expect(recovery.scanned).toBe(0);
  });

  it("moves an unfinished event to retained metadata when its raw payload expires", async () => {
    const db = new MemoryD1();
    const source = event("fault-expired-active");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    db.exec(`UPDATE line_events SET lifecycle_status='retry_waiting', payload_expires_at='2035-01-01T00:00:01.000Z', next_retry_at='2035-01-01T00:00:02.000Z' WHERE event_id='fault-expired-active'`);
    expect(await redactExpiredLineEventPayloads(env(db), new Date("2035-01-02T00:00:00.000Z"))).toBe(1);
    const receipt = await getLineEventReceipt(db as unknown as D1Database, "fault-expired-active");
    const audit = await db.prepare("SELECT action, from_status AS fromStatus, to_status AS toStatus FROM line_event_recovery_audit WHERE event_id = ?").bind("fault-expired-active").all<{ action: string; fromStatus: string; toStatus: string }>();
    expect(receipt).toMatchObject({ lifecycleStatus: "retained", payloadJson: '{"redacted":true}', lastErrorClass: "payload_expired" });
    expect(audit.results).toContainEqual({ action: "retained_after_payload_expiry", fromStatus: "retry_waiting", toStatus: "retained" });
  });

  it("reports human-readable status while retaining technical readiness semantics", async () => {
    const db = new MemoryD1();
    const status = await getReliabilityStatus(env(db), null, new Date("2035-01-01T00:00:00.000Z"));
    const ready = await getReliabilityReadiness(env(db), new Date("2035-01-01T00:00:00.000Z"));
    expect(status.level).toBe("normal");
    expect(formatReliabilityStatusForLine(status)).toContain("系統目前運作正常");
    expect(ready.ok).toBe(true);
    expect(LINE_EVENT_RECOVERY_CRON).toBe("*/2 * * * *");
    expect(LINE_EVENT_THRESHOLDS_MS.processingStalled).toBe(120_000);
  });

  it("classifies failures without retaining token values", () => {
    expect(reliabilityErrorClass(new Error("D1_ERROR: internal error"))).toBe("d1_error");
    expect(reliabilityErrorClass(new Error("LINE reply failed: 429"))).toBe("line_reply_429");
    expect(reliabilityErrorClass(new Error("queue send timeout"))).toBe("timeout");
  });

  it("counts webhook redelivery without counting Queue replay as a new receive", async () => {
    const db = new MemoryD1();
    const source = { ...event("fault-redelivery"), deliveryContext: { isRedelivery: true } };
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:05.000Z", source, true);
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:06.000Z", source, false);
    const receipt = await getLineEventReceipt(db as unknown as D1Database, "fault-redelivery");
    expect(receipt).toMatchObject({ receiveCount: 2, redeliveryCount: 2, firstReceivedAt: "2035-01-01T00:00:00.000Z", lastReceivedAt: "2035-01-01T00:00:05.000Z" });
  });

  it("allows only one reply sender lease", async () => {
    const db = new MemoryD1();
    const source = event("fault-reply-race");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    await markBusinessCompleted(env(db), "fault-reply-race", [{ type: "text", text: "答案" }], new Date("2035-01-01T00:00:01.000Z"));
    const [first, second] = await Promise.all([
      claimReplyDelivery(env(db), "fault-reply-race", "reply", new Date("2035-01-01T00:00:02.000Z")),
      claimReplyDelivery(env(db), "fault-reply-race", "reply", new Date("2035-01-01T00:00:02.000Z")),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it("persists one Push retry key before a Push call", async () => {
    const db = new MemoryD1();
    const source = event("fault-push-key");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    const first = await preparePushRetryKey(env(db), "fault-push-key", [{ type: "text", text: "保留答案" }]);
    const second = await preparePushRetryKey(env(db), "fault-push-key", [{ type: "text", text: "不應替換" }]);
    expect(first).toMatch(/^[0-9a-f-]{36}$/u);
    expect(second).toBe(first);
    expect((await getLineEventReceipt(db as unknown as D1Database, "fault-push-key"))?.replyPayloadJson).toContain("保留答案");
  });

  it("records uncertain Reply separately from a definite invalid-token failure", async () => {
    const db = new MemoryD1();
    const source = event("fault-reply-outcome");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    await markBusinessCompleted(env(db), "fault-reply-outcome", [{ type: "text", text: "答案" }]);
    const claim = await claimReplyDelivery(env(db), "fault-reply-outcome", "reply");
    expect(claim).not.toBeNull();
    await markReplyUncertain(env(db), "fault-reply-outcome", new Error("network timeout"), new Date(), claim?.owner ?? null, null, null);
    expect((await getLineEventReceipt(db as unknown as D1Database, "fault-reply-outcome"))?.replyOutcome).toBe("uncertain");
    await markReplyDefiniteNotSent(env(db), "fault-reply-outcome", new Error("LINE reply failed: 400"));
    expect((await getLineEventReceipt(db as unknown as D1Database, "fault-reply-outcome"))?.replyOutcome).toBe("definite_not_sent");
  });

  it("persists delivery trace metadata without storing token values", async () => {
    const db = new MemoryD1();
    const source = event("fault-delivery-trace");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    const attempt = await startDeliveryAttempt(env(db), "fault-delivery-trace", "fault-delivery-trace", "push", "push", 1, "owner");
    await finishDeliveryAttempt(env(db), attempt, "sent", 200, "line-request-1");
    const rows = await db.prepare("SELECT outcome, http_status AS httpStatus, line_request_id AS requestId FROM line_event_delivery_attempts WHERE event_id = ?").bind("fault-delivery-trace").all<{ outcome: string; httpStatus: number; requestId: string }>();
    expect(rows.results).toEqual([{ outcome: "sent", httpStatus: 200, requestId: "line-request-1" }]);
  });

  it("keeps an active processing lease out of expiry redaction", async () => {
    const db = new MemoryD1();
    const source = event("fault-expiry-lease");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    db.exec("UPDATE line_events SET lifecycle_status='processing', processing_lease_until='2035-01-02T00:00:00.000Z', payload_expires_at='2035-01-01T00:00:01.000Z' WHERE event_id='fault-expiry-lease'");
    expect(await redactExpiredLineEventPayloads(env(db), new Date("2035-01-01T12:00:00.000Z"))).toBe(0);
    expect((await getLineEventReceipt(db as unknown as D1Database, "fault-expiry-lease"))?.payloadJson).toContain("fault-expiry-lease");
  });

  it("acknowledging retained history does not clear readiness or delete it", async () => {
    const db = new MemoryD1();
    const source = event("fault-retained-ack");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    db.exec("UPDATE line_events SET lifecycle_status='retained', reply_status='pending', reply_outcome='pending', retained_until='2035-01-08T00:00:00.000Z' WHERE event_id='fault-retained-ack'");
    const before = await getReliabilityReadiness(env(db), new Date("2035-01-01T00:00:00.000Z"));
    expect(before.ok).toBe(false);
    expect(await acknowledgeRetainedLineEvents(env(db), "admin", new Date("2035-01-01T00:00:01.000Z"))).toBe(1);
    const after = await getReliabilityReadiness(env(db), new Date("2035-01-01T00:00:02.000Z"));
    expect(after.ok).toBe(false);
    const receipt = await getLineEventReceipt(db as unknown as D1Database, "fault-retained-ack");
    expect(receipt?.lifecycleStatus).toBe("retained");
    expect(receipt?.resolutionStatus).toBe("acknowledged");
  });

  it("clears readiness only after a retained message is explicitly resolved", async () => {
    const db = new MemoryD1();
    await ensureLineEventReceipt(env(db), event("fault-retained-resolve"), "2035-01-01T00:00:00.000Z");
    db.exec("UPDATE line_events SET lifecycle_status='retained', reply_status='pending', reply_outcome='pending' WHERE event_id='fault-retained-resolve'");
    const result = await resolveRetainedLineEvent(env(db), "fault-retained-resolve", "manual_resolve", "admin", new Date("2035-01-01T00:00:01.000Z"));
    expect(result.changed).toBe(true);
    expect(result.resolutionStatus).toBe("manually_resolved");
    expect((await getReliabilityReadiness(env(db), new Date("2035-01-01T00:00:02.000Z"))).ok).toBe(true);
    expect((await getLineEventReceipt(db as unknown as D1Database, "fault-retained-resolve"))?.lifecycleStatus).toBe("retained");
    expect((await db.prepare("SELECT COUNT(*) AS count FROM line_event_recovery_audit WHERE event_id = ? AND action = 'manual_resolve'").bind("fault-retained-resolve").first<{ count: number }>())?.count).toBe(1);
  });

  it("keeps force close idempotent and preserves the line event", async () => {
    const db = new MemoryD1();
    await ensureLineEventReceipt(env(db), event("fault-retained-force"), "2035-01-01T00:00:00.000Z");
    db.exec("UPDATE line_events SET lifecycle_status='retained' WHERE event_id='fault-retained-force'");
    const first = await resolveRetainedLineEvent(env(db), "fault-retained-force", "force_close", "admin", new Date("2035-01-01T00:00:01.000Z"));
    const second = await resolveRetainedLineEvent(env(db), "fault-retained-force", "force_close", "admin", new Date("2035-01-01T00:00:02.000Z"));
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.resolutionStatus).toBe("force_closed");
    expect((await db.prepare("SELECT COUNT(*) AS count FROM line_events WHERE event_id = ?").bind("fault-retained-force").first<{ count: number }>())?.count).toBe(1);
  });

  it("marks manual record completion idempotently without deleting the source event", async () => {
    const db = new MemoryD1();
    await ensureLineEventReceipt(env(db), event("fault-retained-record"), "2035-01-01T00:00:00.000Z");
    db.exec("UPDATE line_events SET lifecycle_status='retained' WHERE event_id='fault-retained-record'");
    const first = await markRetainedLineEventManuallyRecorded(env(db), "fault-retained-record", "admin", "operational_event:manual-1", new Date("2035-01-01T00:00:01.000Z"), null, "死亡 2 隻");
    const second = await markRetainedLineEventManuallyRecorded(env(db), "fault-retained-record", "admin", "operational_event:manual-1", new Date("2035-01-01T00:00:02.000Z"), "重複點擊");
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.manualRecordReference).toBe("operational_event:manual-1");
    expect((await getReliabilityReadiness(env(db), new Date("2035-01-01T00:00:03.000Z"))).ok).toBe(true);
  });

  it("keeps redisplay retry key stable for duplicate button clicks", async () => {
    const db = new MemoryD1();
    const source = event("fault-redisplay");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    const first = await prepareRedisplayRetryKey(env(db), "fault-redisplay", new Date("2035-01-01T00:00:01.000Z"));
    const second = await prepareRedisplayRetryKey(env(db), "fault-redisplay", new Date("2035-01-01T00:00:02.000Z"));
    expect(second).toBe(first);
  });

  it("uses the same sender lease for redisplay and completes only once", async () => {
    const db = new MemoryD1();
    const source = event("fault-redisplay-lease");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    await markBusinessCompleted(env(db), "fault-redisplay-lease", [{ type: "text", text: "原始答案" }]);
    await persistReplyNotice(env(db), "fault-redisplay-lease", "notice-redisplay", [{ type: "text", text: "請重新顯示" }], new Date("2035-01-01T00:01:00.000Z"));
    db.exec("UPDATE line_events SET reply_status='uncertain', reply_outcome='uncertain', reply_notice_sent_at='2035-01-01T00:01:01.000Z' WHERE event_id='fault-redisplay-lease'");
    const retryKey = await prepareRedisplayRetryKey(env(db), "fault-redisplay-lease", new Date("2035-01-01T00:01:02.000Z"));
    const [first, second] = await Promise.all([
      claimReplyDelivery(env(db), "fault-redisplay-lease", "redisplay", new Date("2035-01-01T00:01:03.000Z"), retryKey),
      claimReplyDelivery(env(db), "fault-redisplay-lease", "redisplay", new Date("2035-01-01T00:01:03.000Z"), retryKey),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    await markRedisplayCompleted(env(db), "fault-redisplay-lease", new Date("2035-01-01T00:01:04.000Z"));
    expect((await getLineEventReceipt(db as unknown as D1Database, "fault-redisplay-lease"))?.replyOutcome).toBe("sent");
  });

  it("removes the Reply token from the durable event copy after a Reply attempt", async () => {
    const db = new MemoryD1();
    const source = event("fault-token-scrub");
    await ensureLineEventReceipt(env(db), source, "2035-01-01T00:00:00.000Z");
    await markReplyAttempted(env(db), "fault-token-scrub", new Date("2035-01-01T00:00:01.000Z"));
    const receipt = await getLineEventReceipt(db as unknown as D1Database, "fault-token-scrub");
    expect(receipt?.payloadJson).not.toContain("fault-token-scrub-reply-token");
  });
});
