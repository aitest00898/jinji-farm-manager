export const LINE_EVENT_RECOVERY_CRON = "*/2 * * * *";

export const LINE_EVENT_THRESHOLDS_MS = {
  slow: 10_000,
  queuedStalled: 30_000,
  replyStalled: 60_000,
  processingStalled: 120_000,
} as const;

export const LINE_EVENT_MAX_ENQUEUE_ATTEMPTS = 5;
export const LINE_EVENT_MAX_PROCESSING_ATTEMPTS = 3;
export const LINE_EVENT_MAX_REPLY_ATTEMPTS = 3;
export const LINE_EVENT_PAYLOAD_RETENTION_MS = 24 * 60 * 60 * 1000;
export const LINE_EVENT_RETAINED_METADATA_MS = 7 * 24 * 60 * 60 * 1000;
export const LINE_EVENT_REDISPLAY_RETENTION_MS = 30 * 60 * 1000;
export const LINE_EVENT_DELIVERY_TRACE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type LineEventLifecycleStatus =
  | "received"
  | "queued"
  | "processing"
  | "reply_pending"
  | "retry_waiting"
  | "reply_completed"
  | "retained";

export type RetainedResolutionStatus =
  | "unresolved"
  | "acknowledged"
  | "reprocessing"
  | "manually_resolved"
  | "manually_recorded"
  | "force_closed";

export type ReliabilityEventStage = "enqueue" | "processing" | "reply";

export type ReplyDeliveryMode = "reply" | "push" | "uncertain_notice" | "redisplay";

export interface ReliabilityLineEvent {
  type: string;
  webhookEventId?: string;
  timestamp?: number;
  replyToken?: string;
  source?: {
    type?: string;
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  message?: {
    id?: string;
    type?: string;
    text?: string;
    mention?: { mentionees?: unknown[] };
  };
  postback?: { data?: string; params?: Record<string, string> };
  deliveryContext?: { isRedelivery?: boolean };
}

export interface ReliabilityDbEnv {
  DB: D1Database;
}

export interface ReliabilityQueueEnv extends ReliabilityDbEnv {
  EVENTS?: { send(message: unknown): Promise<unknown> };
}

export interface LineEventReceipt {
  eventId: string;
  correlationId: string;
  lifecycleStatus: LineEventLifecycleStatus;
  businessStatus: string;
  replyStatus: string;
  receivedAt: string;
  queuedAt: string | null;
  processingStartedAt: string | null;
  businessCompletedAt: string | null;
  replyCompletedAt: string | null;
  queueAttempts: number;
  processingAttempts: number;
  replyAttempts: number;
  lastErrorStage: string | null;
  lastErrorClass: string | null;
  lastErrorMessage: string | null;
  nextRetryAt: string | null;
  replyPayloadJson: string | null;
  payloadExpiresAt: string | null;
  delayedNoticeSentAt: string | null;
  retainedUntil: string | null;
  firstReceivedAt: string;
  lastReceivedAt: string;
  receiveCount: number;
  redeliveryCount: number;
  enqueueAttemptedAt: string | null;
  processingOwner: string | null;
  processingLeaseUntil: string | null;
  businessStartedAt: string | null;
  businessOutcome: string;
  replyOwner: string | null;
  replyLeaseUntil: string | null;
  replyDeliveryMode: ReplyDeliveryMode | null;
  replyOutcome: string;
  replyLastHttpStatus: number | null;
  replyLastRequestId: string | null;
  replyRetryKey: string | null;
  replyUncertainAt: string | null;
  replyNoticeId: string | null;
  replyNoticePayloadJson: string | null;
  replyNoticeRetryKey: string | null;
  replyNoticeAttempts: number;
  replyNoticeSentAt: string | null;
  redisplayRetryKey: string | null;
  redisplayExpiresAt: string | null;
  retainedAcknowledgedAt: string | null;
  retainedAcknowledgedBy: string | null;
  resolutionStatus: RetainedResolutionStatus;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionReason: string | null;
  resolutionNote: string | null;
  manualRecordReference: string | null;
  conversationRoutingJson: string | null;
  payloadJson: string;
}

export type EventPreparation =
  | { kind: "claimed"; receipt: LineEventReceipt }
  | { kind: "reply_only"; receipt: LineEventReceipt }
  | { kind: "completed"; receipt: LineEventReceipt }
  | { kind: "retained"; receipt: LineEventReceipt }
  | { kind: "in_progress"; receipt: LineEventReceipt };

export interface ReliabilityStatus {
  level: "normal" | "slow" | "attention";
  label: string;
  message: string;
  unfinishedCount: number;
  stalledCount: number;
  retryingCount: number;
  retainedCount: number;
  retainedUnacknowledgedCount: number;
  retainedAcknowledgedCount: number;
  retainedOpenCount: number;
  retainedResolvedCount: number;
  actionableUnfinishedCount: number;
  deliveryUncertainCount: number;
  replyFailureCount: number;
  lastCompletedAt: string | null;
  lastProblemAt: string | null;
  checkedAt: string;
}

export interface ReliabilityReadiness {
  ok: boolean;
  status: ReliabilityStatus | null;
  checks: {
    dataStorage: "正常" | "異常";
    unfinishedMessages: number | null;
    stalledMessages: number | null;
    recentReplyProblems: number | null;
  };
  checkedAt: string;
  errorClass?: string;
}

export interface RecoveryRunResult {
  scanned: number;
  requeued: number;
  retained: number;
  skipped: number;
  failed: number;
}

export interface ManualRecoveryResult extends RecoveryRunResult {
  eventIds: string[];
}

function isoNow(now = new Date()): string {
  return now.toISOString();
}

function sourceGroupId(event: ReliabilityLineEvent): string | null {
  return event.source?.type === "group" ? event.source.groupId ?? null : null;
}

export function reliabilityEventIdFor(event: ReliabilityLineEvent): string {
  return event.webhookEventId ?? [
    event.type,
    event.timestamp ?? 0,
    event.source?.type ?? "unknown",
    event.source?.groupId ?? event.source?.roomId ?? event.source?.userId ?? "unknown",
    event.message?.id ?? "no-message",
  ].join(":");
}

export function reliabilityCorrelationIdFor(event: ReliabilityLineEvent): string {
  return reliabilityEventIdFor(event);
}

function cleanErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "unknown_error");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/giu, "Bearer [redacted]")
    .replace(/replyToken[=:][^,\s]+/giu, "replyToken=[redacted]")
    .replace(/access[_-]?token[=:][^,\s]+/giu, "access_token=[redacted]")
    .slice(0, 240);
}

async function payloadWithoutReplyToken(env: ReliabilityDbEnv, eventId: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT payload_json AS payloadJson FROM line_events WHERE event_id = ?").bind(eventId).first<{ payloadJson: string }>();
  if (!row?.payloadJson || row.payloadJson === '{"redacted":true}') return row?.payloadJson ?? null;
  try {
    const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(payload, "replyToken")) delete payload.replyToken;
    return JSON.stringify(payload);
  } catch {
    return row.payloadJson;
  }
}

export function reliabilityErrorClass(error: unknown): string {
  const message = cleanErrorMessage(error).toLowerCase();
  if (message.includes("d1_error") || message.includes("database") || message.includes("sqlite")) return "d1_error";
  if (message.includes("line reply failed")) {
    const status = /line reply failed:\s*(\d{3})/u.exec(message)?.[1];
    return status ? `line_reply_${status}` : "line_reply_error";
  }
  if (message.includes("line push failed")) {
    const status = /line push failed:\s*(\d{3})/u.exec(message)?.[1];
    return status ? `line_push_${status}` : "line_push_error";
  }
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (message.includes("queue") || message.includes("enqueue")) return "queue_error";
  return error instanceof Error && error.name ? error.name.slice(0, 80) : "processing_error";
}

function rowToReceipt(row: Record<string, unknown>): LineEventReceipt {
  return {
    eventId: String(row.eventId),
    correlationId: String(row.correlationId ?? row.eventId),
    lifecycleStatus: String(row.lifecycleStatus) as LineEventLifecycleStatus,
    businessStatus: String(row.businessStatus ?? "pending"),
    replyStatus: String(row.replyStatus ?? "pending"),
    receivedAt: String(row.receivedAt),
    queuedAt: row.queuedAt ? String(row.queuedAt) : null,
    processingStartedAt: row.processingStartedAt ? String(row.processingStartedAt) : null,
    businessCompletedAt: row.businessCompletedAt ? String(row.businessCompletedAt) : null,
    replyCompletedAt: row.replyCompletedAt ? String(row.replyCompletedAt) : null,
    queueAttempts: Number(row.queueAttempts ?? 0),
    processingAttempts: Number(row.processingAttempts ?? 0),
    replyAttempts: Number(row.replyAttempts ?? 0),
    lastErrorStage: row.lastErrorStage ? String(row.lastErrorStage) : null,
    lastErrorClass: row.lastErrorClass ? String(row.lastErrorClass) : null,
    lastErrorMessage: row.lastErrorMessage ? String(row.lastErrorMessage) : null,
    nextRetryAt: row.nextRetryAt ? String(row.nextRetryAt) : null,
    replyPayloadJson: row.replyPayloadJson ? String(row.replyPayloadJson) : null,
    payloadExpiresAt: row.payloadExpiresAt ? String(row.payloadExpiresAt) : null,
    delayedNoticeSentAt: row.delayedNoticeSentAt ? String(row.delayedNoticeSentAt) : null,
    retainedUntil: row.retainedUntil ? String(row.retainedUntil) : null,
    firstReceivedAt: String(row.firstReceivedAt ?? row.receivedAt),
    lastReceivedAt: String(row.lastReceivedAt ?? row.receivedAt),
    receiveCount: Number(row.receiveCount ?? 1),
    redeliveryCount: Number(row.redeliveryCount ?? 0),
    enqueueAttemptedAt: row.enqueueAttemptedAt ? String(row.enqueueAttemptedAt) : null,
    processingOwner: row.processingOwner ? String(row.processingOwner) : null,
    processingLeaseUntil: row.processingLeaseUntil ? String(row.processingLeaseUntil) : null,
    businessStartedAt: row.businessStartedAt ? String(row.businessStartedAt) : null,
    businessOutcome: String(row.businessOutcome ?? row.businessStatus ?? "pending"),
    replyOwner: row.replyOwner ? String(row.replyOwner) : null,
    replyLeaseUntil: row.replyLeaseUntil ? String(row.replyLeaseUntil) : null,
    replyDeliveryMode: row.replyDeliveryMode ? String(row.replyDeliveryMode) as ReplyDeliveryMode : null,
    replyOutcome: String(row.replyOutcome ?? row.replyStatus ?? "pending"),
    replyLastHttpStatus: row.replyLastHttpStatus === null || row.replyLastHttpStatus === undefined ? null : Number(row.replyLastHttpStatus),
    replyLastRequestId: row.replyLastRequestId ? String(row.replyLastRequestId) : null,
    replyRetryKey: row.replyRetryKey ? String(row.replyRetryKey) : null,
    replyUncertainAt: row.replyUncertainAt ? String(row.replyUncertainAt) : null,
    replyNoticeId: row.replyNoticeId ? String(row.replyNoticeId) : null,
    replyNoticePayloadJson: row.replyNoticePayloadJson ? String(row.replyNoticePayloadJson) : null,
    replyNoticeRetryKey: row.replyNoticeRetryKey ? String(row.replyNoticeRetryKey) : null,
    replyNoticeAttempts: Number(row.replyNoticeAttempts ?? 0),
    replyNoticeSentAt: row.replyNoticeSentAt ? String(row.replyNoticeSentAt) : null,
    redisplayRetryKey: row.redisplayRetryKey ? String(row.redisplayRetryKey) : null,
    redisplayExpiresAt: row.redisplayExpiresAt ? String(row.redisplayExpiresAt) : null,
    retainedAcknowledgedAt: row.retainedAcknowledgedAt ? String(row.retainedAcknowledgedAt) : null,
    retainedAcknowledgedBy: row.retainedAcknowledgedBy ? String(row.retainedAcknowledgedBy) : null,
    resolutionStatus: String(row.resolutionStatus ?? "unresolved") as RetainedResolutionStatus,
    resolvedAt: row.resolvedAt ? String(row.resolvedAt) : null,
    resolvedBy: row.resolvedBy ? String(row.resolvedBy) : null,
    resolutionReason: row.resolutionReason ? String(row.resolutionReason) : null,
    resolutionNote: row.resolutionNote ? String(row.resolutionNote) : null,
    manualRecordReference: row.manualRecordReference ? String(row.manualRecordReference) : null,
    conversationRoutingJson: row.conversationRoutingJson ? String(row.conversationRoutingJson) : null,
    payloadJson: String(row.payloadJson ?? ""),
  };
}

export async function getLineEventReceipt(db: D1Database, eventId: string): Promise<LineEventReceipt | null> {
  const row = await db.prepare(
    `SELECT event_id AS eventId, correlation_id AS correlationId,
            lifecycle_status AS lifecycleStatus, business_status AS businessStatus,
            reply_status AS replyStatus, received_at AS receivedAt,
            queued_at AS queuedAt, processing_started_at AS processingStartedAt,
            business_completed_at AS businessCompletedAt,
            reply_completed_at AS replyCompletedAt,
            queue_attempts AS queueAttempts, processing_attempts AS processingAttempts,
            reply_attempts AS replyAttempts, last_error_stage AS lastErrorStage,
            last_error_class AS lastErrorClass, last_error_message AS lastErrorMessage,
            next_retry_at AS nextRetryAt, reply_payload_json AS replyPayloadJson,
            payload_expires_at AS payloadExpiresAt,
            delayed_notice_sent_at AS delayedNoticeSentAt,
            retained_until AS retainedUntil, payload_json AS payloadJson,
            first_received_at AS firstReceivedAt, last_received_at AS lastReceivedAt,
            receive_count AS receiveCount, redelivery_count AS redeliveryCount,
            enqueue_attempted_at AS enqueueAttemptedAt,
            processing_owner AS processingOwner, processing_lease_until AS processingLeaseUntil,
            business_started_at AS businessStartedAt, business_outcome AS businessOutcome,
            reply_owner AS replyOwner, reply_lease_until AS replyLeaseUntil,
            reply_delivery_mode AS replyDeliveryMode, reply_outcome AS replyOutcome,
            reply_last_http_status AS replyLastHttpStatus, reply_last_request_id AS replyLastRequestId,
            reply_retry_key AS replyRetryKey, reply_uncertain_at AS replyUncertainAt,
            reply_notice_id AS replyNoticeId, reply_notice_payload_json AS replyNoticePayloadJson,
            reply_notice_retry_key AS replyNoticeRetryKey, reply_notice_attempts AS replyNoticeAttempts,
            reply_notice_sent_at AS replyNoticeSentAt,
            redisplay_retry_key AS redisplayRetryKey, redisplay_expires_at AS redisplayExpiresAt,
            retained_acknowledged_at AS retainedAcknowledgedAt,
            retained_acknowledged_by AS retainedAcknowledgedBy,
            resolution_status AS resolutionStatus,
            resolved_at AS resolvedAt,
            resolved_by AS resolvedBy,
            resolution_reason AS resolutionReason,
            resolution_note AS resolutionNote,
            manual_record_reference AS manualRecordReference,
            conversation_routing_json AS conversationRoutingJson
       FROM line_events WHERE event_id = ? LIMIT 1`,
  ).bind(eventId).first<Record<string, unknown>>();
  return row ? rowToReceipt(row) : null;
}

export async function ensureLineEventReceipt(
  env: ReliabilityDbEnv,
  event: ReliabilityLineEvent,
  receivedAt: string,
  storedEvent: ReliabilityLineEvent = event,
  touchIngress = true,
): Promise<LineEventReceipt> {
  const eventId = reliabilityEventIdFor(event);
  const correlationId = reliabilityCorrelationIdFor(event);
  const payloadExpiresAt = new Date(Date.parse(receivedAt) + LINE_EVENT_PAYLOAD_RETENTION_MS).toISOString();
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO line_events
      (event_id, event_type, group_id, received_at, payload_json, processed_at,
       correlation_id, lifecycle_status, business_status, reply_status,
       payload_expires_at, first_received_at, last_received_at, receive_count,
       redelivery_count, business_outcome, reply_outcome)
     VALUES (?, ?, ?, ?, ?, NULL, ?, 'received', 'pending', 'pending', ?, ?, ?, 1, ?, 'pending', 'pending')`,
  ).bind(
    eventId,
    event.type,
    sourceGroupId(event),
    receivedAt,
    JSON.stringify(storedEvent),
    correlationId,
    payloadExpiresAt,
    receivedAt,
    receivedAt,
    event.deliveryContext?.isRedelivery ? 1 : 0,
  ).run();
  await env.DB.prepare(
    `UPDATE line_events
        SET correlation_id = COALESCE(correlation_id, ?),
            payload_expires_at = COALESCE(payload_expires_at, ?),
            first_received_at = COALESCE(first_received_at, received_at),
            last_received_at = COALESCE(last_received_at, received_at),
            receive_count = COALESCE(receive_count, 1),
            redelivery_count = COALESCE(redelivery_count, 0)
      WHERE event_id = ?`,
  ).bind(correlationId, payloadExpiresAt, eventId).run();
  if (touchIngress && !inserted.meta.changes) {
    await env.DB.prepare(
      `UPDATE line_events
          SET last_received_at = ?,
              receive_count = COALESCE(receive_count, 1) + 1,
              redelivery_count = COALESCE(redelivery_count, 0) + ?
        WHERE event_id = ?`,
    ).bind(receivedAt, event.deliveryContext?.isRedelivery ? 1 : 0, eventId).run();
  }
  const receipt = await getLineEventReceipt(env.DB, eventId);
  if (!receipt) throw new Error("line_event_receipt_missing");
  return receipt;
}

export async function prepareLineEvent(
  env: ReliabilityDbEnv,
  event: ReliabilityLineEvent,
  receivedAt: string,
  storedEvent: ReliabilityLineEvent = event,
  touchIngress = true,
): Promise<EventPreparation> {
  const receipt = await ensureLineEventReceipt(env, event, receivedAt, storedEvent, touchIngress);
  if (receipt.lifecycleStatus === "reply_completed" || receipt.replyStatus === "sent" || receipt.replyStatus === "not_required") {
    return { kind: "completed", receipt };
  }
  if (receipt.lifecycleStatus === "retained") return { kind: "retained", receipt };
  if (receipt.businessStatus === "completed" && receipt.replyPayloadJson) {
    return { kind: "reply_only", receipt };
  }
  const now = new Date();
  const owner = `process-${crypto.randomUUID()}`;
  const processingLeaseUntil = new Date(now.getTime() + LINE_EVENT_THRESHOLDS_MS.processingStalled).toISOString();
  const claimed = await env.DB.prepare(
    `UPDATE line_events
        SET lifecycle_status = 'processing',
            processing_started_at = ?,
            processing_attempts = processing_attempts + 1,
            processing_owner = ?,
            processing_lease_until = ?,
            business_started_at = COALESCE(business_started_at, ?),
            recovery_owner = NULL,
            recovery_lease_until = NULL
      WHERE event_id = ?
        AND (
          lifecycle_status IN ('received', 'queued', 'retry_waiting')
          OR (lifecycle_status = 'processing' AND (processing_lease_until IS NULL OR julianday(?) - julianday(processing_lease_until) >= 0))
        )
        AND business_status <> 'completed'`,
  ).bind(isoNow(now), owner, processingLeaseUntil, isoNow(now), receipt.eventId, isoNow(now)).run();
  if (claimed.meta.changes) {
    const updated = await getLineEventReceipt(env.DB, receipt.eventId);
    if (!updated) throw new Error("line_event_receipt_missing_after_claim");
    return { kind: "claimed", receipt: updated };
  }
  const current = await getLineEventReceipt(env.DB, receipt.eventId);
  if (current?.businessStatus === "completed" && current.replyPayloadJson) return { kind: "reply_only", receipt: current };
  return { kind: "in_progress", receipt: current ?? receipt };
}

export async function markLineEventQueued(
  env: ReliabilityDbEnv,
  eventId: string,
  now = new Date(),
  owner: string | null = null,
): Promise<void> {
  const queuedAt = isoNow(now);
  await env.DB.prepare(
    `UPDATE line_events
        SET lifecycle_status = 'queued', queued_at = ?,
            queue_attempts = queue_attempts + 1,
            enqueue_attempted_at = ?,
            next_retry_at = NULL,
            recovery_owner = ?,
            recovery_lease_until = NULL
      WHERE event_id = ?
        AND lifecycle_status IN ('received', 'retry_waiting')`,
  ).bind(queuedAt, queuedAt, owner, eventId).run();
}

export async function markLineEventProcessing(
  env: ReliabilityDbEnv,
  eventId: string,
  now = new Date(),
): Promise<void> {
  await env.DB.prepare(
    `UPDATE line_events SET lifecycle_status = 'processing', processing_started_at = ? WHERE event_id = ?`,
  ).bind(isoNow(now), eventId).run();
}

export async function markBusinessCompleted(
  env: ReliabilityDbEnv,
  eventId: string,
  messages: unknown[],
  now = new Date(),
): Promise<void> {
  await env.DB.prepare(
    `UPDATE line_events
        SET lifecycle_status = 'reply_pending',
            business_status = 'completed',
            business_outcome = 'completed',
            reply_status = 'pending',
            reply_outcome = 'pending',
            business_completed_at = ?,
            reply_payload_json = ?,
            next_retry_at = NULL,
            processing_owner = NULL,
            processing_lease_until = NULL,
            last_error_stage = NULL,
            last_error_class = NULL,
            last_error_message = NULL,
            last_error_at = NULL
      WHERE event_id = ?`,
  ).bind(isoNow(now), JSON.stringify(messages), eventId).run();
}

export async function markNoReplyCompleted(
  env: ReliabilityDbEnv,
  eventId: string,
  now = new Date(),
): Promise<void> {
  const payload = await payloadWithoutReplyToken(env, eventId);
  await env.DB.prepare(
    `UPDATE line_events
        SET lifecycle_status = 'reply_completed',
            business_status = 'completed',
            business_outcome = 'completed',
            reply_status = 'not_required',
            reply_outcome = 'not_required',
            resolution_status = CASE WHEN COALESCE(resolution_status, 'unresolved') = 'reprocessing' THEN 'manually_resolved' ELSE COALESCE(resolution_status, 'unresolved') END,
            resolved_at = CASE WHEN COALESCE(resolution_status, 'unresolved') = 'reprocessing' THEN COALESCE(resolved_at, ?) ELSE resolved_at END,
            resolved_by = CASE WHEN COALESCE(resolution_status, 'unresolved') = 'reprocessing' THEN COALESCE(resolved_by, 'system_recovery') ELSE resolved_by END,
            resolution_reason = CASE WHEN COALESCE(resolution_status, 'unresolved') = 'reprocessing' THEN COALESCE(resolution_reason, '自動或管理者重新處理成功') ELSE resolution_reason END,
            business_completed_at = COALESCE(business_completed_at, ?),
            reply_completed_at = ?,
            processed_at = ?,
            next_retry_at = NULL,
            processing_owner = NULL,
            processing_lease_until = NULL,
            reply_owner = NULL,
            reply_lease_until = NULL,
            payload_json = COALESCE(?, payload_json),
            last_error_stage = NULL,
            last_error_class = NULL,
            last_error_message = NULL,
            last_error_at = NULL
      WHERE event_id = ?`,
  ).bind(isoNow(now), isoNow(now), isoNow(now), isoNow(now), payload, eventId).run();
}

export async function claimDelayedReplyNotice(
  env: ReliabilityDbEnv,
  eventId: string,
  now = new Date(),
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE line_events SET delayed_notice_sent_at = ?
      WHERE event_id = ? AND delayed_notice_sent_at IS NULL
        AND julianday(?) - julianday(received_at) >= ?`,
  ).bind(isoNow(now), eventId, isoNow(now), LINE_EVENT_THRESHOLDS_MS.slow / 86_400_000).run();
  return Boolean(result.meta.changes);
}

export async function markReplyAttempted(
  env: ReliabilityDbEnv,
  eventId: string,
  now = new Date(),
): Promise<void> {
  const payload = await payloadWithoutReplyToken(env, eventId);
  await env.DB.prepare(
    `UPDATE line_events SET reply_attempted_at = ?, reply_attempts = reply_attempts + 1,
            lifecycle_status = 'reply_pending', reply_status = 'pending', reply_outcome = 'pending',
            payload_json = COALESCE(?, payload_json)
      WHERE event_id = ?`,
  ).bind(isoNow(now), payload, eventId).run();
}

export async function markReplyCompleted(
  env: ReliabilityDbEnv,
  eventId: string,
  now = new Date(),
  owner: string | null = null,
  httpStatus: number | null = null,
  requestId: string | null = null,
): Promise<void> {
  const payload = await payloadWithoutReplyToken(env, eventId);
  await env.DB.prepare(
    `UPDATE line_events
        SET lifecycle_status = 'reply_completed', reply_status = 'sent',
            reply_outcome = 'sent',
            resolution_status = CASE WHEN COALESCE(resolution_status, 'unresolved') = 'reprocessing' THEN 'manually_resolved' ELSE COALESCE(resolution_status, 'unresolved') END,
            resolved_at = CASE WHEN COALESCE(resolution_status, 'unresolved') = 'reprocessing' THEN COALESCE(resolved_at, ?) ELSE resolved_at END,
            resolved_by = CASE WHEN COALESCE(resolution_status, 'unresolved') = 'reprocessing' THEN COALESCE(resolved_by, 'system_recovery') ELSE resolved_by END,
            resolution_reason = CASE WHEN COALESCE(resolution_status, 'unresolved') = 'reprocessing' THEN COALESCE(resolution_reason, '自動或管理者重新處理成功') ELSE resolution_reason END,
            reply_completed_at = ?, processed_at = ?, next_retry_at = NULL,
            reply_last_http_status = COALESCE(?, reply_last_http_status),
            reply_last_request_id = COALESCE(?, reply_last_request_id),
            recovery_owner = NULL, recovery_lease_until = NULL,
            reply_owner = NULL, reply_lease_until = NULL,
            reply_payload_json = NULL, reply_notice_payload_json = NULL,
            payload_json = COALESCE(?, payload_json),
            last_error_stage = NULL, last_error_class = NULL,
            last_error_message = NULL, last_error_at = NULL
      WHERE event_id = ? AND (? IS NULL OR reply_owner = ?)`,
  ).bind(isoNow(now), isoNow(now), isoNow(now), httpStatus, requestId, payload, eventId, owner, owner).run();
}

export interface ReplyDeliveryClaim {
  owner: string;
  attempt: number;
  mode: ReplyDeliveryMode;
  retryKey: string | null;
}

/**
 * Reserve one reply/push sender. Queue, watchdog and Web recovery all use the
 * same atomic lease, so only one actor can call LINE for an event at a time.
 */
export async function claimReplyDelivery(
  env: ReliabilityDbEnv,
  eventId: string,
  mode: ReplyDeliveryMode,
  now = new Date(),
  retryKey: string | null = null,
): Promise<ReplyDeliveryClaim | null> {
  const owner = `reply-${crypto.randomUUID()}`;
  const leaseUntil = new Date(now.getTime() + LINE_EVENT_THRESHOLDS_MS.replyStalled).toISOString();
  const result = await env.DB.prepare(
    `UPDATE line_events
        SET reply_owner = ?, reply_lease_until = ?, reply_delivery_mode = ?,
            reply_attempted_at = CASE WHEN ? = 'redisplay' THEN reply_attempted_at ELSE ? END,
            reply_attempts = CASE WHEN ? = 'redisplay' THEN reply_attempts ELSE reply_attempts + 1 END,
            reply_notice_attempts = CASE WHEN ? = 'redisplay' THEN COALESCE(reply_notice_attempts, 0) + 1 ELSE reply_notice_attempts END,
            reply_outcome = CASE WHEN ? = 'redisplay' THEN 'uncertain' ELSE 'pending' END,
            reply_status = CASE WHEN ? = 'redisplay' THEN 'uncertain' ELSE 'pending' END,
            reply_retry_key = CASE WHEN ? <> 'redisplay' AND ? IS NOT NULL THEN COALESCE(reply_retry_key, ?) ELSE reply_retry_key END,
            redisplay_retry_key = CASE WHEN ? = 'redisplay' AND ? IS NOT NULL THEN COALESCE(redisplay_retry_key, ?) ELSE redisplay_retry_key END,
            lifecycle_status = 'reply_pending'
      WHERE event_id = ?
        AND lifecycle_status NOT IN ('reply_completed', 'retained')
        AND (reply_owner IS NULL OR reply_lease_until IS NULL OR julianday(?) - julianday(reply_lease_until) >= 0)
        AND (
          (? IN ('reply', 'push') AND reply_outcome IN ('pending', 'definite_not_sent', 'failed', 'legacy_unknown'))
          OR (? = 'uncertain_notice' AND reply_notice_payload_json IS NOT NULL AND reply_notice_sent_at IS NULL)
          OR (? = 'redisplay' AND reply_outcome IN ('uncertain', 'definite_not_sent') AND reply_payload_json IS NOT NULL
              AND redisplay_expires_at IS NOT NULL AND julianday(redisplay_expires_at) > julianday(?))
        )
        AND (
          (? = 'redisplay' AND COALESCE(reply_notice_attempts, 0) < ?)
          OR (? <> 'redisplay' AND reply_attempts < ?)
        )`,
  ).bind(
    owner,
    leaseUntil,
    mode,
    mode,
    isoNow(now),
    mode,
    mode,
    mode,
    mode,
    mode,
    retryKey,
    retryKey,
    mode,
    retryKey,
    retryKey,
    eventId,
    isoNow(now),
    mode,
    mode,
    mode,
    isoNow(now),
    mode,
    LINE_EVENT_MAX_REPLY_ATTEMPTS,
    mode,
    LINE_EVENT_MAX_REPLY_ATTEMPTS,
  ).run();
  if (!result.meta.changes) return null;
  const receipt = await getLineEventReceipt(env.DB, eventId);
  return receipt ? {
    owner,
    attempt: mode === "redisplay" ? receipt.replyNoticeAttempts : receipt.replyAttempts,
    mode,
    retryKey: mode === "redisplay" ? receipt.redisplayRetryKey : receipt.replyRetryKey,
  } : null;
}

export async function markReplyUncertain(
  env: ReliabilityDbEnv,
  eventId: string,
  error: unknown,
  now = new Date(),
  owner: string | null = null,
  httpStatus: number | null = null,
  requestId: string | null = null,
): Promise<void> {
  const errorClass = reliabilityErrorClass(error);
  const errorMessage = cleanErrorMessage(error);
  const payload = await payloadWithoutReplyToken(env, eventId);
  await env.DB.prepare(
    `UPDATE line_events
        SET reply_status = 'uncertain', reply_outcome = 'uncertain', reply_uncertain_at = ?,
            reply_last_http_status = COALESCE(?, reply_last_http_status),
            reply_last_request_id = COALESCE(?, reply_last_request_id),
            last_error_stage = 'reply', last_error_class = ?, last_error_message = ?, last_error_at = ?,
            reply_owner = NULL, reply_lease_until = NULL, next_retry_at = NULL,
            payload_json = COALESCE(?, payload_json)
      WHERE event_id = ? AND (? IS NULL OR reply_owner = ?)`,
  ).bind(isoNow(now), httpStatus, requestId, errorClass, errorMessage, isoNow(now), payload, eventId, owner, owner).run();
}

export async function markReplyDefiniteNotSent(
  env: ReliabilityDbEnv,
  eventId: string,
  error: unknown,
  now = new Date(),
  owner: string | null = null,
  httpStatus: number | null = null,
  requestId: string | null = null,
): Promise<void> {
  const errorClass = reliabilityErrorClass(error);
  const errorMessage = cleanErrorMessage(error);
  const payload = await payloadWithoutReplyToken(env, eventId);
  await env.DB.prepare(
    `UPDATE line_events
        SET reply_status = 'failed', reply_outcome = 'definite_not_sent',
            reply_last_http_status = COALESCE(?, reply_last_http_status),
            reply_last_request_id = COALESCE(?, reply_last_request_id),
            last_error_stage = 'reply', last_error_class = ?, last_error_message = ?, last_error_at = ?,
            reply_owner = NULL, reply_lease_until = NULL,
            payload_json = COALESCE(?, payload_json)
      WHERE event_id = ? AND (? IS NULL OR reply_owner = ?)`,
  ).bind(httpStatus, requestId, errorClass, errorMessage, isoNow(now), payload, eventId, owner, owner).run();
}

export async function persistReplyNotice(
  env: ReliabilityDbEnv,
  eventId: string,
  noticeId: string,
  messages: unknown[],
  now = new Date(),
): Promise<{ noticeId: string; retryKey: string }> {
  const retryKey = crypto.randomUUID();
  const redisplayExpiresAt = new Date(now.getTime() + LINE_EVENT_REDISPLAY_RETENTION_MS).toISOString();
  const existing = await getLineEventReceipt(env.DB, eventId);
  if (existing?.replyNoticeId && existing.replyNoticeRetryKey) {
    return { noticeId: existing.replyNoticeId, retryKey: existing.replyNoticeRetryKey };
  }
  await env.DB.prepare(
    `UPDATE line_events
        SET reply_notice_id = COALESCE(reply_notice_id, ?),
            reply_notice_payload_json = COALESCE(reply_notice_payload_json, ?),
            reply_notice_retry_key = COALESCE(reply_notice_retry_key, ?),
            reply_notice_attempts = COALESCE(reply_notice_attempts, 0),
            redisplay_expires_at = COALESCE(redisplay_expires_at, ?),
            reply_uncertain_at = COALESCE(reply_uncertain_at, ?),
            reply_outcome = 'uncertain', reply_status = 'uncertain'
      WHERE event_id = ?`,
  ).bind(noticeId, JSON.stringify(messages), retryKey, redisplayExpiresAt, isoNow(now), eventId).run();
  const updated = await getLineEventReceipt(env.DB, eventId);
  return { noticeId: updated?.replyNoticeId ?? noticeId, retryKey: updated?.replyNoticeRetryKey ?? retryKey };
}

export async function markReplyNoticeSent(
  env: ReliabilityDbEnv,
  eventId: string,
  now = new Date(),
  owner: string | null = null,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE line_events
        SET reply_notice_sent_at = ?, reply_notice_payload_json = NULL,
            reply_status = 'uncertain', reply_outcome = 'uncertain',
            reply_owner = NULL, reply_lease_until = NULL,
            last_error_stage = NULL, last_error_class = NULL, last_error_message = NULL, last_error_at = NULL
      WHERE event_id = ? AND (? IS NULL OR reply_owner = ?)`,
  ).bind(isoNow(now), eventId, owner, owner).run();
}

export async function preparePushRetryKey(
  env: ReliabilityDbEnv,
  eventId: string,
  messages: unknown[],
): Promise<string> {
  const existing = await getLineEventReceipt(env.DB, eventId);
  if (existing?.replyRetryKey) return existing.replyRetryKey;
  const retryKey = crypto.randomUUID();
  await env.DB.prepare(
    `UPDATE line_events
        SET reply_retry_key = COALESCE(reply_retry_key, ?),
            reply_payload_json = COALESCE(reply_payload_json, ?),
            reply_delivery_mode = COALESCE(reply_delivery_mode, 'push')
      WHERE event_id = ?`,
  ).bind(retryKey, JSON.stringify(messages), eventId).run();
  const updated = await getLineEventReceipt(env.DB, eventId);
  if (!updated?.replyRetryKey) throw new Error("reply_retry_key_persist_failed");
  return updated.replyRetryKey;
}

export async function prepareRedisplayRetryKey(
  env: ReliabilityDbEnv,
  eventId: string,
  now = new Date(),
): Promise<string> {
  const existing = await getLineEventReceipt(env.DB, eventId);
  if (existing?.redisplayRetryKey && existing.redisplayExpiresAt && Date.parse(existing.redisplayExpiresAt) > now.getTime()) return existing.redisplayRetryKey;
  const retryKey = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + LINE_EVENT_REDISPLAY_RETENTION_MS).toISOString();
  await env.DB.prepare(
    `UPDATE line_events SET redisplay_retry_key = ?, redisplay_expires_at = ? WHERE event_id = ?`,
  ).bind(retryKey, expiresAt, eventId).run();
  return retryKey;
}

export async function markRedisplayCompleted(
  env: ReliabilityDbEnv,
  eventId: string,
  now = new Date(),
): Promise<void> {
  const payload = await payloadWithoutReplyToken(env, eventId);
  await env.DB.prepare(
    `UPDATE line_events
        SET lifecycle_status = 'reply_completed', reply_status = 'sent', reply_outcome = 'sent',
            reply_completed_at = ?, processed_at = ?,
            reply_payload_json = NULL, reply_notice_payload_json = NULL,
            redisplay_retry_key = NULL, redisplay_expires_at = NULL,
            payload_json = COALESCE(?, payload_json),
            last_error_stage = NULL, last_error_class = NULL, last_error_message = NULL, last_error_at = NULL
      WHERE event_id = ? AND reply_outcome IN ('uncertain', 'definite_not_sent')`,
  ).bind(isoNow(now), isoNow(now), payload, eventId).run();
}

export async function startDeliveryAttempt(
  env: ReliabilityDbEnv,
  eventId: string,
  correlationId: string,
  stage: ReplyDeliveryMode,
  mode: ReplyDeliveryMode,
  attempt: number,
  owner: string | null,
  now = new Date(),
): Promise<string> {
  const id = `delivery-${crypto.randomUUID()}`;
  const expiresAt = new Date(now.getTime() + LINE_EVENT_DELIVERY_TRACE_RETENTION_MS).toISOString();
  await env.DB.prepare(
    `INSERT INTO line_event_delivery_attempts
      (id, event_id, correlation_id, delivery_stage, delivery_mode, attempt, owner, outcome, started_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'started', ?, ?)`,
  ).bind(id, eventId, correlationId, stage, mode, attempt, owner, isoNow(now), expiresAt).run();
  return id;
}

export async function finishDeliveryAttempt(
  env: ReliabilityDbEnv,
  id: string,
  outcome: string,
  httpStatus: number | null = null,
  lineRequestId: string | null = null,
  errorClass: string | null = null,
  now = new Date(),
): Promise<void> {
  await env.DB.prepare(
    `UPDATE line_event_delivery_attempts
        SET outcome = ?, http_status = ?, line_request_id = ?, error_class = ?, completed_at = ?
      WHERE id = ?`,
  ).bind(outcome, httpStatus, lineRequestId, errorClass, isoNow(now), id).run();
}

export async function acknowledgeRetainedLineEvents(
  env: ReliabilityDbEnv,
  actorId: string,
  now = new Date(),
  organizationId: string | null = null,
  groupId: string | null = null,
  actorType: "web_admin" | "line_admin" = "web_admin",
): Promise<number> {
  const scopeParts: string[] = [];
  const scopeBindings: unknown[] = [];
  if (organizationId) {
    scopeParts.push("AND EXISTS (SELECT 1 FROM line_groups g WHERE g.group_id = line_events.group_id AND g.organization_id = ?)");
    scopeBindings.push(organizationId);
  }
  if (groupId) {
    scopeParts.push("AND line_events.group_id = ?");
    scopeBindings.push(groupId);
  }
  const rows = await env.DB.prepare(
    `SELECT event_id AS eventId, correlation_id AS correlationId,
            resolution_status AS resolutionStatus
       FROM line_events
      WHERE lifecycle_status = 'retained'
        AND COALESCE(resolution_status, 'unresolved') = 'unresolved'
        AND retained_acknowledged_at IS NULL ${scopeParts.join(" ")}`,
  ).bind(...scopeBindings).all<{ eventId: string; correlationId: string | null; resolutionStatus: string }>();
  const result = await env.DB.prepare(
    `UPDATE line_events
        SET retained_acknowledged_at = COALESCE(retained_acknowledged_at, ?),
            retained_acknowledged_by = COALESCE(retained_acknowledged_by, ?),
            resolution_status = CASE WHEN COALESCE(resolution_status, 'unresolved') = 'unresolved' THEN 'acknowledged' ELSE resolution_status END
      WHERE lifecycle_status = 'retained'
        AND COALESCE(resolution_status, 'unresolved') = 'unresolved'
        AND retained_acknowledged_at IS NULL ${scopeParts.join(" ")}`,
  ).bind(isoNow(now), actorId, ...scopeBindings).run();
  for (const row of rows.results) {
    await writeRecoveryAudit(
      env,
      row.eventId,
      row.correlationId ?? row.eventId,
      "acknowledge",
      actorType,
      actorId,
      row.resolutionStatus,
      "acknowledged",
      null,
    );
  }
  return Number(result.meta.changes ?? 0);
}

async function writeRecoveryAudit(
  env: ReliabilityDbEnv,
  eventId: string,
  correlationId: string,
  action: string,
  actorType: "system" | "web_admin" | "line_admin",
  actorId: string | null,
  fromStatus: string | null,
  toStatus: string | null,
  attempt: number | null,
  errorStage: string | null = null,
  errorClass: string | null = null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO line_event_recovery_audit
      (id, event_id, correlation_id, actor_type, actor_id, action,
       from_status, to_status, attempt, error_stage, error_class)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `line-recovery-${crypto.randomUUID()}`,
    eventId,
    correlationId,
    actorType,
    actorId,
    action,
    fromStatus,
    toStatus,
    attempt,
    errorStage,
    errorClass,
  ).run();
}

const RETAINED_RESOLUTION_TERMINAL = ["manually_resolved", "manually_recorded", "force_closed"] as const;

export type RetainedResolutionAction = "manual_resolve" | "force_close" | "manual_record";

export interface RetainedResolutionResult {
  eventId: string;
  changed: boolean;
  resolutionStatus: RetainedResolutionStatus;
  manualRecordReference: string | null;
}

function isRetainedResolutionTerminal(value: string | null | undefined): boolean {
  return RETAINED_RESOLUTION_TERMINAL.includes(value as (typeof RETAINED_RESOLUTION_TERMINAL)[number]);
}

export async function resolveRetainedLineEvent(
  env: ReliabilityDbEnv,
  eventId: string,
  action: "manual_resolve" | "force_close",
  actorId: string,
  now = new Date(),
  reason: string | null = null,
  note: string | null = null,
  actorType: "web_admin" | "line_admin" = "web_admin",
): Promise<RetainedResolutionResult> {
  const current = await getLineEventReceipt(env.DB, eventId);
  if (!current) throw new Error("retained_line_event_not_found");
  if (isRetainedResolutionTerminal(current.resolutionStatus)) {
    return {
      eventId,
      changed: false,
      resolutionStatus: current.resolutionStatus,
      manualRecordReference: current.manualRecordReference,
    };
  }
  if (current.lifecycleStatus !== "retained") throw new Error("line_event_is_not_retained");
  const nextStatus: RetainedResolutionStatus = action === "force_close" ? "force_closed" : "manually_resolved";
  const result = await env.DB.prepare(
    `UPDATE line_events
        SET resolution_status = ?, resolved_at = ?, resolved_by = ?,
            resolution_reason = ?, resolution_note = ?,
            recovery_owner = NULL, recovery_lease_until = NULL
      WHERE event_id = ?
        AND lifecycle_status = 'retained'
        AND COALESCE(resolution_status, 'unresolved') NOT IN ('manually_resolved', 'manually_recorded', 'force_closed')`,
  ).bind(nextStatus, isoNow(now), actorId, reason, note, eventId).run();
  if (Number(result.meta.changes ?? 0) > 0) {
    await writeRecoveryAudit(env, eventId, current.correlationId, action, actorType, actorId, current.resolutionStatus, nextStatus, null);
    return { eventId, changed: true, resolutionStatus: nextStatus, manualRecordReference: null };
  }
  const latest = await getLineEventReceipt(env.DB, eventId);
  if (!latest) throw new Error("retained_line_event_missing_after_resolution");
  return { eventId, changed: false, resolutionStatus: latest.resolutionStatus, manualRecordReference: latest.manualRecordReference };
}

export async function markRetainedLineEventManuallyRecorded(
  env: ReliabilityDbEnv,
  eventId: string,
  actorId: string,
  manualRecordReference: string,
  now = new Date(),
  reason: string | null = null,
  note: string | null = null,
  actorType: "web_admin" | "line_admin" = "web_admin",
): Promise<RetainedResolutionResult> {
  const current = await getLineEventReceipt(env.DB, eventId);
  if (!current) throw new Error("retained_line_event_not_found");
  if (current.resolutionStatus === "manually_recorded") {
    return { eventId, changed: false, resolutionStatus: current.resolutionStatus, manualRecordReference: current.manualRecordReference };
  }
  if (isRetainedResolutionTerminal(current.resolutionStatus)) {
    return { eventId, changed: false, resolutionStatus: current.resolutionStatus, manualRecordReference: current.manualRecordReference };
  }
  if (current.lifecycleStatus !== "retained") throw new Error("line_event_is_not_retained");
  const result = await env.DB.prepare(
    `UPDATE line_events
        SET resolution_status = 'manually_recorded', resolved_at = ?, resolved_by = ?,
            resolution_reason = ?, resolution_note = ?, manual_record_reference = ?,
            recovery_owner = NULL, recovery_lease_until = NULL
      WHERE event_id = ?
        AND lifecycle_status = 'retained'
        AND COALESCE(resolution_status, 'unresolved') NOT IN ('manually_resolved', 'manually_recorded', 'force_closed')`,
  ).bind(isoNow(now), actorId, reason, note, manualRecordReference, eventId).run();
  if (Number(result.meta.changes ?? 0) > 0) {
    await writeRecoveryAudit(env, eventId, current.correlationId, "manual_record", actorType, actorId, current.resolutionStatus, "manually_recorded", null);
    return { eventId, changed: true, resolutionStatus: "manually_recorded", manualRecordReference };
  }
  const latest = await getLineEventReceipt(env.DB, eventId);
  if (!latest) throw new Error("retained_line_event_missing_after_record");
  return { eventId, changed: false, resolutionStatus: latest.resolutionStatus, manualRecordReference: latest.manualRecordReference };
}

export async function markLineEventFailure(
  env: ReliabilityDbEnv,
  eventId: string,
  stage: ReliabilityEventStage,
  error: unknown,
  now = new Date(),
): Promise<"retry_waiting" | "retained"> {
  const receipt = await getLineEventReceipt(env.DB, eventId);
  if (!receipt) throw new Error("line_event_receipt_missing_on_failure");
  const attempt = stage === "enqueue"
    ? receipt.queueAttempts
    : stage === "reply" ? receipt.replyAttempts : receipt.processingAttempts;
  const limit = stage === "enqueue" ? LINE_EVENT_MAX_ENQUEUE_ATTEMPTS : LINE_EVENT_MAX_PROCESSING_ATTEMPTS;
  const retained = attempt >= limit;
  const status = retained ? "retained" : "retry_waiting";
  const retryAt = retained ? null : new Date(now.getTime() + Math.min(60_000, 5_000 * (2 ** Math.max(0, attempt - 1)))).toISOString();
  const retainedUntil = retained ? new Date(now.getTime() + LINE_EVENT_RETAINED_METADATA_MS).toISOString() : null;
  const errorClass = reliabilityErrorClass(error);
  const errorMessage = cleanErrorMessage(error);
  await env.DB.prepare(
    `UPDATE line_events
        SET lifecycle_status = ?,
            resolution_status = CASE
              WHEN ? = 'retained' AND COALESCE(resolution_status, 'unresolved') = 'reprocessing' THEN 'unresolved'
              ELSE COALESCE(resolution_status, 'unresolved')
            END,
            reply_status = CASE WHEN ? = 'reply' THEN 'failed' ELSE reply_status END,
            reply_outcome = CASE
              WHEN ? <> 'reply' THEN reply_outcome
              WHEN ? LIKE 'line_reply_4%' THEN 'definite_not_sent'
              ELSE 'uncertain'
            END,
            last_error_stage = ?, last_error_class = ?, last_error_message = ?,
            last_error_at = ?, next_retry_at = ?, retained_until = ?,
            recovery_owner = NULL, recovery_lease_until = NULL,
            processing_owner = NULL, processing_lease_until = NULL,
            reply_owner = NULL, reply_lease_until = NULL
      WHERE event_id = ?`,
  ).bind(status, status, stage, stage, errorClass, stage, errorClass, errorMessage, isoNow(now), retryAt, retainedUntil, eventId).run();
  await writeRecoveryAudit(
    env,
    receipt.eventId,
    receipt.correlationId,
    retained ? "retained_for_manual_review" : "automatic_retry_scheduled",
    "system",
    "system",
    receipt.lifecycleStatus,
    status,
    attempt,
    stage,
    errorClass,
  );
  return status;
}

interface RecoveryCandidate {
  eventId: string;
  correlationId: string;
  lifecycleStatus: LineEventLifecycleStatus;
  resolutionStatus: RetainedResolutionStatus;
  payloadJson: string;
  receivedAt: string;
  queueAttempts: number;
}

async function recoveryCandidates(
  env: ReliabilityDbEnv,
  now: Date,
  includeRetained: boolean,
  limit: number,
): Promise<RecoveryCandidate[]> {
  const nowIsoValue = isoNow(now);
  const lifecycleClause = includeRetained
    ? "'retained', 'received', 'queued', 'processing', 'reply_pending', 'retry_waiting'"
    : "'received', 'queued', 'processing', 'reply_pending', 'retry_waiting'";
  const rows = await env.DB.prepare(
    `SELECT event_id AS eventId, correlation_id AS correlationId,
            lifecycle_status AS lifecycleStatus, COALESCE(resolution_status, 'unresolved') AS resolutionStatus,
            payload_json AS payloadJson,
            received_at AS receivedAt, queue_attempts AS queueAttempts
       FROM line_events
      WHERE payload_json IS NOT NULL AND length(payload_json) > 2
        AND payload_json <> '{"redacted":true}'
        AND (payload_expires_at IS NULL OR julianday(payload_expires_at) > julianday(?))
        AND lifecycle_status IN (${lifecycleClause})
        AND COALESCE(resolution_status, 'unresolved') NOT IN ('manually_resolved', 'manually_recorded', 'force_closed')
        AND (
          (lifecycle_status = 'received' AND julianday(?) - julianday(received_at) >= ?)
          OR (lifecycle_status = 'queued' AND julianday(?) - julianday(COALESCE(queued_at, received_at)) >= ?)
          OR (lifecycle_status = 'processing' AND julianday(?) - julianday(COALESCE(processing_started_at, received_at)) >= ?)
          OR (lifecycle_status = 'reply_pending' AND julianday(?) - julianday(COALESCE(reply_attempted_at, received_at)) >= ?
              AND (reply_outcome <> 'uncertain' OR reply_notice_sent_at IS NULL))
          OR (lifecycle_status = 'retry_waiting' AND (next_retry_at IS NULL OR julianday(next_retry_at) <= julianday(?)))
          OR (lifecycle_status = 'retained' AND ? = 1)
        )
      ORDER BY received_at, event_id LIMIT ?`,
  ).bind(
    nowIsoValue,
    nowIsoValue, LINE_EVENT_THRESHOLDS_MS.slow / 86_400_000,
    nowIsoValue, LINE_EVENT_THRESHOLDS_MS.queuedStalled / 86_400_000,
    nowIsoValue, LINE_EVENT_THRESHOLDS_MS.processingStalled / 86_400_000,
    nowIsoValue, LINE_EVENT_THRESHOLDS_MS.replyStalled / 86_400_000,
    nowIsoValue,
    includeRetained ? 1 : 0,
    Math.max(1, Math.min(50, limit)),
  ).all<RecoveryCandidate>();
  return rows.results;
}

async function claimRecoveryCandidate(
  env: ReliabilityDbEnv,
  row: RecoveryCandidate,
  now: Date,
  owner: string,
): Promise<boolean> {
  const leaseUntil = new Date(now.getTime() + 60_000).toISOString();
  const result = await env.DB.prepare(
    `UPDATE line_events
        SET lifecycle_status = 'queued', queued_at = ?,
            queue_attempts = queue_attempts + 1,
            recovery_owner = ?, recovery_lease_until = ?, next_retry_at = NULL
            ,resolution_status = CASE WHEN lifecycle_status = 'retained' THEN 'reprocessing' ELSE COALESCE(resolution_status, 'unresolved') END
      WHERE event_id = ?
        AND lifecycle_status = ?
        AND (recovery_lease_until IS NULL OR recovery_lease_until <= ?)`,
  ).bind(isoNow(now), owner, leaseUntil, row.eventId, row.lifecycleStatus, isoNow(now)).run();
  return Boolean(result.meta.changes);
}

async function requeueCandidate(
  env: ReliabilityQueueEnv,
  row: RecoveryCandidate,
  now: Date,
  actorType: "system" | "web_admin" | "line_admin",
  actorId: string,
): Promise<"requeued" | "failed" | "skipped"> {
  let event: ReliabilityLineEvent;
  try {
    event = JSON.parse(row.payloadJson) as ReliabilityLineEvent;
    if (!event || typeof event !== "object" || typeof event.type !== "string") throw new Error("invalid_event_payload");
  } catch (error) {
    await markLineEventFailure(env, row.eventId, "enqueue", error, now);
    return "failed";
  }
  const owner = `${actorType}-${crypto.randomUUID()}`;
  if (!(await claimRecoveryCandidate(env, row, now, owner))) return "skipped";
  try {
    if (!env.EVENTS) throw new Error("queue_binding_missing");
    await env.EVENTS.send({ eventId: row.eventId, correlationId: row.correlationId });
    await writeRecoveryAudit(env, row.eventId, row.correlationId, actorType === "system" ? "automatic_recovery" : "manual_recovery", actorType, actorId, row.lifecycleStatus, "queued", row.queueAttempts + 1);
    return "requeued";
  } catch (error) {
    await markLineEventFailure(env, row.eventId, "enqueue", error, now);
    return "failed";
  }
}

export async function recoverStalledLineEvents(
  env: ReliabilityQueueEnv,
  now = new Date(),
  limit = 20,
): Promise<RecoveryRunResult> {
  const rows = await recoveryCandidates(env, now, false, limit);
  const result: RecoveryRunResult = { scanned: rows.length, requeued: 0, retained: 0, skipped: 0, failed: 0 };
  for (const row of rows) {
    const outcome = await requeueCandidate(env, row, now, "system", "system");
    if (outcome === "requeued") result.requeued += 1;
    else if (outcome === "skipped") result.skipped += 1;
    else result.failed += 1;
  }
  return result;
}

export async function manuallyRecoverLineEvents(
  env: ReliabilityQueueEnv,
  actorId: string,
  now = new Date(),
  limit = 20,
  actorType: "web_admin" | "line_admin" = "web_admin",
): Promise<ManualRecoveryResult> {
  const rows = await recoveryCandidates(env, now, true, limit);
  const result: ManualRecoveryResult = { scanned: rows.length, requeued: 0, retained: 0, skipped: 0, failed: 0, eventIds: [] };
  for (const row of rows) {
    const outcome = await requeueCandidate(env, row, now, actorType, actorId);
    if (outcome === "requeued") {
      result.requeued += 1;
      result.eventIds.push(row.eventId);
    } else if (outcome === "skipped") result.skipped += 1;
    else result.failed += 1;
  }
  return result;
}

/**
 * Requeue exactly one event from the management screen.  The same claim,
 * lease, payload checks, Queue send, and recovery audit as bulk recovery are
 * used here so a repeated click cannot create a second processing owner.
 */
export async function manuallyRecoverLineEvent(
  env: ReliabilityQueueEnv,
  eventId: string,
  actorId: string,
  now = new Date(),
  actorType: "web_admin" | "line_admin" = "web_admin",
): Promise<ManualRecoveryResult> {
  const nowIsoValue = isoNow(now);
  const row = await env.DB.prepare(
    `SELECT event_id AS eventId, correlation_id AS correlationId,
            lifecycle_status AS lifecycleStatus, COALESCE(resolution_status, 'unresolved') AS resolutionStatus,
            payload_json AS payloadJson, received_at AS receivedAt, queue_attempts AS queueAttempts
       FROM line_events
      WHERE event_id = ?
        AND payload_json IS NOT NULL
        AND length(payload_json) > 2
        AND payload_json <> '{"redacted":true}'
        AND (payload_expires_at IS NULL OR julianday(payload_expires_at) > julianday(?))
        AND lifecycle_status IN ('retained', 'received', 'queued', 'processing', 'reply_pending', 'retry_waiting')
        AND COALESCE(resolution_status, 'unresolved') NOT IN ('manually_resolved', 'manually_recorded', 'force_closed')
      LIMIT 1`,
  ).bind(eventId, nowIsoValue).first<RecoveryCandidate>();
  if (!row) return { scanned: 0, requeued: 0, retained: 0, skipped: 1, failed: 0, eventIds: [] };
  const outcome = await requeueCandidate(env, row, now, actorType, actorId);
  return {
    scanned: 1,
    requeued: outcome === "requeued" ? 1 : 0,
    retained: outcome === "failed" ? 1 : 0,
    skipped: outcome === "skipped" ? 1 : 0,
    failed: outcome === "failed" ? 1 : 0,
    eventIds: outcome === "requeued" ? [eventId] : [],
  };
}

export async function redactExpiredLineEventPayloads(env: ReliabilityDbEnv, now = new Date()): Promise<number> {
  const nowIsoValue = isoNow(now);
  const expiryRows = await env.DB.prepare(
    `SELECT event_id AS eventId, correlation_id AS correlationId,
            lifecycle_status AS lifecycleStatus, queue_attempts AS queueAttempts,
            processing_attempts AS processingAttempts, reply_attempts AS replyAttempts
       FROM line_events
      WHERE payload_expires_at IS NOT NULL AND julianday(payload_expires_at) <= julianday(?)
        AND lifecycle_status IN ('received', 'queued', 'processing', 'reply_pending', 'retry_waiting')
        AND (recovery_lease_until IS NULL OR julianday(recovery_lease_until) <= julianday(?))
        AND (processing_lease_until IS NULL OR julianday(processing_lease_until) <= julianday(?))
        AND (reply_lease_until IS NULL OR julianday(reply_lease_until) <= julianday(?))
      ORDER BY received_at, event_id LIMIT 100`,
  ).bind(nowIsoValue, nowIsoValue, nowIsoValue, nowIsoValue).all<{ eventId: string; correlationId: string; lifecycleStatus: string; queueAttempts: number; processingAttempts: number; replyAttempts: number }>();
  let changedCount = 0;
  for (const row of expiryRows.results) {
    const retainedUntil = new Date(now.getTime() + LINE_EVENT_RETAINED_METADATA_MS).toISOString();
    const transition = await env.DB.prepare(
      `UPDATE line_events
          SET lifecycle_status = 'retained',
              payload_json = '{"redacted":true}',
              reply_payload_json = NULL,
              retained_until = COALESCE(retained_until, ?),
              next_retry_at = NULL,
              recovery_owner = NULL,
              recovery_lease_until = NULL,
              last_error_stage = COALESCE(last_error_stage, 'retention'),
              last_error_class = COALESCE(last_error_class, 'payload_expired'),
              last_error_message = COALESCE(last_error_message, '原始訊息保存期限已到，僅保留處理紀錄。'),
              last_error_at = COALESCE(last_error_at, ?)
        WHERE event_id = ?
          AND lifecycle_status IN ('received', 'queued', 'processing', 'reply_pending', 'retry_waiting')
          AND (recovery_lease_until IS NULL OR julianday(recovery_lease_until) <= julianday(?))
          AND (processing_lease_until IS NULL OR julianday(processing_lease_until) <= julianday(?))
          AND (reply_lease_until IS NULL OR julianday(reply_lease_until) <= julianday(?))`,
    ).bind(retainedUntil, nowIsoValue, row.eventId, nowIsoValue, nowIsoValue, nowIsoValue).run();
    changedCount += Number(transition.meta.changes ?? 0);
    await writeRecoveryAudit(
      env,
      row.eventId,
      row.correlationId ?? row.eventId,
      "retained_after_payload_expiry",
      "system",
      "system",
      row.lifecycleStatus,
      "retained",
      Math.max(row.queueAttempts ?? 0, row.processingAttempts ?? 0, row.replyAttempts ?? 0),
      "retention",
      "payload_expired",
    );
  }
  const result = await env.DB.prepare(
    `UPDATE line_events
        SET payload_json = '{"redacted":true}'
      WHERE payload_expires_at IS NOT NULL AND julianday(payload_expires_at) <= julianday(?)
        AND payload_json <> '{"redacted":true}'
        AND lifecycle_status NOT IN ('received', 'queued', 'processing', 'reply_pending', 'retry_waiting')`,
  ).bind(nowIsoValue).run();
  await env.DB.prepare(
    `UPDATE line_events
        SET reply_payload_json = NULL
      WHERE payload_expires_at IS NOT NULL AND julianday(payload_expires_at) <= julianday(?)
        AND lifecycle_status IN ('reply_completed', 'retained')`,
  ).bind(nowIsoValue).run();
  const redisplay = await env.DB.prepare(
    `UPDATE line_events
        SET reply_payload_json = NULL, reply_notice_payload_json = NULL,
            redisplay_retry_key = NULL, redisplay_expires_at = NULL
      WHERE redisplay_expires_at IS NOT NULL
        AND julianday(redisplay_expires_at) <= julianday(?)
        AND reply_outcome = 'uncertain'`,
  ).bind(nowIsoValue).run();
  return changedCount + Number(result.meta.changes ?? 0) + Number(redisplay.meta.changes ?? 0);
}

export async function getReliabilityStatus(
  env: ReliabilityDbEnv,
  organizationId: string | null = null,
  now = new Date(),
): Promise<ReliabilityStatus> {
  const scope = organizationId ? "AND g.organization_id = ?" : "";
  const bindings: unknown[] = organizationId ? [organizationId] : [];
  const [counts, completed, problem, stalled, replyFailures, retainedResolution, uncertain] = await Promise.all([
    env.DB.prepare(
      `SELECT lifecycle_status AS status, COUNT(*) AS count
         FROM line_events e LEFT JOIN line_groups g ON g.group_id = e.group_id
        WHERE 1 = 1 ${scope} GROUP BY lifecycle_status`,
    ).bind(...bindings).all<{ status: string; count: number }>(),
    env.DB.prepare(
      `SELECT MAX(COALESCE(reply_completed_at, business_completed_at, processed_at)) AS value
         FROM line_events e LEFT JOIN line_groups g ON g.group_id = e.group_id
        WHERE 1 = 1 ${scope}`,
    ).bind(...bindings).first<{ value: string | null }>(),
    env.DB.prepare(
      `SELECT MAX(last_error_at) AS value
         FROM line_events e LEFT JOIN line_groups g ON g.group_id = e.group_id
        WHERE last_error_at IS NOT NULL ${scope}`,
    ).bind(...bindings).first<{ value: string | null }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count
         FROM line_events e LEFT JOIN line_groups g ON g.group_id = e.group_id
        WHERE (
          (lifecycle_status = 'received' AND julianday(?) - julianday(received_at) >= ?)
          OR (lifecycle_status = 'queued' AND julianday(?) - julianday(COALESCE(queued_at, received_at)) >= ?)
          OR (lifecycle_status = 'processing' AND julianday(?) - julianday(COALESCE(processing_started_at, received_at)) >= ?)
          OR (lifecycle_status = 'reply_pending' AND julianday(?) - julianday(COALESCE(reply_attempted_at, received_at)) >= ?)
        ) ${scope}`,
    ).bind(
      isoNow(now), LINE_EVENT_THRESHOLDS_MS.slow / 86_400_000,
      isoNow(now), LINE_EVENT_THRESHOLDS_MS.queuedStalled / 86_400_000,
      isoNow(now), LINE_EVENT_THRESHOLDS_MS.processingStalled / 86_400_000,
      isoNow(now), LINE_EVENT_THRESHOLDS_MS.replyStalled / 86_400_000,
      ...bindings,
    ).first<{ count: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count
         FROM line_events e LEFT JOIN line_groups g ON g.group_id = e.group_id
        WHERE last_error_stage = 'reply' AND last_error_at >= datetime(?, '-10 minutes') ${scope}`,
    ).bind(isoNow(now), ...bindings).first<{ count: number }>(),
    env.DB.prepare(
      `SELECT COALESCE(resolution_status, 'unresolved') AS resolutionStatus, COUNT(*) AS count
         FROM line_events e LEFT JOIN line_groups g ON g.group_id = e.group_id
        WHERE lifecycle_status = 'retained' ${scope}
        GROUP BY COALESCE(resolution_status, 'unresolved')`,
    ).bind(...bindings).all<{ resolutionStatus: string; count: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count
         FROM line_events e LEFT JOIN line_groups g ON g.group_id = e.group_id
        WHERE reply_outcome = 'uncertain' ${scope}`,
    ).bind(...bindings).first<{ count: number }>(),
  ]);
  const byStatus = new Map(counts.results.map((row) => [row.status, Number(row.count)]));
  const activeUnfinishedCount = ["received", "queued", "processing", "reply_pending", "retry_waiting"]
    .reduce((sum, status) => sum + (byStatus.get(status) ?? 0), 0);
  const retryingCount = (byStatus.get("retry_waiting") ?? 0) + (byStatus.get("queued") ?? 0) + (byStatus.get("processing") ?? 0);
  const retainedCount = byStatus.get("retained") ?? 0;
  const byResolution = new Map(retainedResolution.results.map((row) => [row.resolutionStatus, Number(row.count)]));
  const retainedAcknowledgedCount = byResolution.get("acknowledged") ?? 0;
  const retainedResolvedCount = RETAINED_RESOLUTION_TERMINAL.reduce((sum, status) => sum + (byResolution.get(status) ?? 0), 0);
  const retainedOpenCount = Math.max(0, retainedCount - retainedResolvedCount);
  const retainedUnacknowledgedCount = byResolution.get("unresolved") ?? 0;
  const actionableUnfinishedCount = activeUnfinishedCount;
  const unfinishedCount = actionableUnfinishedCount + retainedOpenCount;
  const deliveryUncertainCount = Number(uncertain?.count ?? 0);
  const stalledCount = Number(stalled?.count ?? 0);
  const replyFailureCount = Number(replyFailures?.count ?? 0);
  const level = retainedOpenCount > 0 || stalledCount > 0 || deliveryUncertainCount > 0
    ? "attention"
    : actionableUnfinishedCount > 0 || replyFailureCount > 0 ? "slow" : "normal";
  const label = level === "normal" ? "正常" : level === "slow" ? "處理較慢" : "需要處理";
  const message = level === "normal"
    ? "系統目前運作正常。"
    : level === "slow"
      ? `目前有 ${unfinishedCount} 筆訊息處理比較慢，系統正在自動恢復。`
      : `目前有 ${Math.max(retainedOpenCount, stalledCount, deliveryUncertainCount)} 筆訊息尚未完成，需要管理者處理。`;
  return {
    level,
    label,
    message,
    unfinishedCount,
    stalledCount,
    retryingCount,
    retainedCount,
    retainedUnacknowledgedCount,
    retainedAcknowledgedCount,
    retainedOpenCount,
    retainedResolvedCount,
    actionableUnfinishedCount,
    deliveryUncertainCount,
    replyFailureCount,
    lastCompletedAt: completed?.value ?? null,
    lastProblemAt: problem?.value ?? null,
    checkedAt: isoNow(now),
  };
}

export async function getReliabilityReadiness(
  env: ReliabilityDbEnv,
  now = new Date(),
): Promise<ReliabilityReadiness> {
  try {
    await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    const status = await getReliabilityStatus(env, null, now);
    const retryOrReply = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM line_events WHERE lifecycle_status IN ('retry_waiting', 'reply_pending')",
    ).first<{ count: number }>();
    const ok = status.stalledCount === 0
      && status.retainedOpenCount === 0
      && status.deliveryUncertainCount === 0
      && Number(retryOrReply?.count ?? 0) === 0;
    return {
      ok,
      status,
      checks: {
        dataStorage: "正常",
        unfinishedMessages: status.unfinishedCount,
        stalledMessages: status.stalledCount,
        recentReplyProblems: status.replyFailureCount,
      },
      checkedAt: status.checkedAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      checks: { dataStorage: "異常", unfinishedMessages: null, stalledMessages: null, recentReplyProblems: null },
      checkedAt: isoNow(now),
      errorClass: reliabilityErrorClass(error),
    };
  }
}

export function formatReliabilityStatusForLine(status: ReliabilityStatus): string {
  if (status.level === "normal") return "✅ 系統目前運作正常。\n目前沒有未完成的訊息。";
  if (status.level === "slow") return `⚠️ ${status.message}\n不需要重複輸入。`;
  return `❗ ${status.message}\n訊息不會被刪除，系統會先自動恢復。\n需要時管理者可到管理網頁決定如何處理。`;
}
