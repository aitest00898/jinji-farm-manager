import {
  botName,
  classifyInput,
  classifyCommand,
  joinReply,
  normalize,
  parseCommand,
  safeRejectionReply,
  unboundReply,
  type OperationalDraft,
  type OperationalIntent,
  type ParsedCommand,
} from "./core";
import { FarmResolver, canonicalFarmKey, normalizedFarmKey, type FarmAliasRecord, type FarmCandidate, type FarmRecord } from "./farm-resolver";
import {
  deterministicToUnified,
  normalizeAiUnifiedIntent,
  operationalDraftFromUnified,
  parseAiUnifiedIntent,
  isUnifiedRecordIntent,
  shouldInvokeSemanticAi,
  shouldPreferAiOverDeterministic,
  type UnifiedIntent,
} from "./semantic";
import { ADMIN_SESSION_TTL_MS, nextAdminFailureState, verifyAdminPassword } from "./admin-auth";
import {
  deriveCurrentStock,
  flockAgeDays,
  isIsoDate,
  normalizedHouseName,
  shipmentReminder,
  taipeiDate,
  type ShipmentReminder,
  type StockAdjustment,
} from "./master-data";
import { handleWebApi } from "./web-api";
import { writeAuditLog } from "./domain";
import {
  formatAbnormalReply,
  insertAbnormalEvent,
  looksLikeMinimalAbnormalText,
  parseAbnormalTiming,
  type AbnormalScope,
} from "./abnormal";
import {
  isReadOnlyAnalysisQuestion,
  processAbnormalClassification,
  runReadOnlyAnalysis,
  PRODUCTION_AI_MODEL,
  type AnalysisScope,
} from "./analysis";
import {
  activateDailyReviewContext,
  clearDailyReviewContext,
  dailyReviewCronExpression,
  hasActiveDailyReviewContext,
  hasRecentSentDailyReview,
  loadActiveDailyReviewContext,
  runDailyOperationsReview,
  scheduledJobForCron,
  formatDailyReview,
} from "./daily-review";
import { parseCandidateRepairIntent, type CandidateRepairField, type CandidateRepairIntent } from "./candidate-workflow";
import {
  classifyConversationalGoalWithAi,
  routeConversationalGoal,
  type ConversationalRoute,
} from "./conversational-agent";
import {
  chooseSafeConversationV2Plan,
  classifyConversationV2WithAi,
  classifyConversationSpeechAct,
  conversationOfficialRecordAllowed,
  inferConversationAnswerContract,
  normalizeConversationV2ReferencePlan,
  isConversationMemoryRelevant,
  isReadOnlyConversationGoal,
  isBroadOperationalReadRequest,
  routeConversationV2Deterministic,
  finalConversationAnswerModeForRenderer,
  type ConversationV2Context,
  type ConversationV2Goal,
  type ConversationV2OutcomeKind,
  type ConversationV2Plan,
  type ConversationAnswerContract,
  type ConversationReferenceScope,
  type ConversationReferentSource,
  type ConversationV2SemanticMemory,
  type ConversationV2Topic,
  type ConversationObjectType,
  type ConversationSpeechAct,
} from "./conversation-v2";
import {
  conversationV2EligibilityDecision,
  type ConversationV2SkipReason,
} from "./conversation-v2-rollout";
import { composeGroundedCandidateResponse } from "./conversation-composer";
import {
  formatAmbientPreview,
  previewBufferedAmbientMessages,
} from "./ambient-preview";
import {
  bufferAmbientMessage,
  extractAmbientCandidates,
  formatAmbientCandidate,
  hasSelfMention,
  interactionGateDecision,
  resolveAndReconcileAmbientBundle,
  runAmbientAiRequestInput,
  runAmbientDigest,
  stripSelfMention,
  validateAmbientCandidateBundle,
  type AmbientCandidate,
  type AmbientCandidateConflictEvidence,
  type AmbientCandidateEvidence,
  type AmbientCandidateBundle,
  type AmbientBufferedMessage,
  type AmbientEnv,
  type AmbientMentionee,
  type AmbientDigestRunOptions,
  type AmbientExtractionResult,
} from "./ambient";
import {
  developmentAmbientAuthorization,
  handleDevelopmentAmbientCommand,
  parseDevelopmentAmbientCommand,
} from "./ambient-dev";
import {
  ambientV2_2ShadowGroupMatches,
  createAmbientV2_2ShadowCorrelationId,
  emitAmbientV2_2V1TerminalTelemetry,
  runAmbientV2_2Shadow,
  type AmbientV2_2ShadowTelemetry,
} from "./ambient-extraction-v2-2-shadow";
import { validateAmbientV2_2WorkerParityRequest } from "./ambient-extraction-v2-2-provider-parity";
import {
  handleLineAbnormalInput,
  handleLineAbnormalPendingInput,
} from "./line-abnormal";
import {
  applyQuickCorrectionTarget,
  correctionLooksRelevant,
  handleGroupCorrectionInput,
  handleQuickCorrectionInput,
  listQuickCorrectionTargets,
} from "./quick-correction";
import {
  handlePendingFarmPostback,
  handlePendingHousePostback,
  handleQuickRecordInput,
  quickRecordHasActiveContext,
  quickRecordHasPending,
  quickRecordLooksRelevant,
} from "./quick-record";
import {
  AI_PRESETS,
  addAmbientCandidateCancelReply,
  addAmbientCandidateEditReply,
  buildAiQuickReply,
  buildAiFollowupReplies,
  buildAmbientConflictReplies,
  buildAmbientConfirmationReplies,
  buildAmbientCandidateEditReplies,
  buildAmbientCandidateSelectReplies,
  buildAmbientDigestReplies,
  buildAmbientEntityQuickReply,
  buildAmbientReconciliationReplies,
  buildAmbientPreviewReplies,
  buildAmbientItemReplies,
  buildBatchSummaryFollowupReplies,
  buildCorrectionQuantityReplies,
  buildCorrectionQuickReplies,
  buildCorrectionTargetReplies,
  buildWholeCancelConfirmationReplies,
  buildFarmSummaryFollowupReplies,
  buildFarmQuickReply,
  buildFlockQuickReply,
  buildHouseQuickReply,
  buildPendingHouseQuickReply,
  buildPostRecordActions,
  buildQuickRecordAbnormalReplies,
  buildQuickRecordCategoryReplies,
  buildQuickRecordCountReplies,
  buildRecentAbnormalFollowupReplies,
  buildTodaySummaryFollowupReplies,
  buildWeatherFollowupReplies,
  buildMainMenuFlex,
  buildMoreMenuFlex,
  buildManagementMenuFlex,
  buildManagementWebLinkFlex,
  buildDeveloperMenuFlex,
  buildMessageDiagnosticsMenuFlex,
  buildPendingDiagnosticsMenuFlex,
  buildTestToolsMenuFlex,
  buildSettingsMenuFlex,
  buildReliabilityStatusReplies,
  buildReliabilityRecoveryConfirmationReplies,
  buildTextMessage,
  parseLinePostback,
  navigationActionForText,
  quickAbnormalShortcutText,
  type QuickRecordCategory,
  type LineReplyMessage,
  type LineTextMessage,
  type LineQuickReply,
  type MenuFarm,
  type MenuHouse,
  type MenuFlock,
} from "./line-menu";
import {
  abortSemanticAction,
  acquireSemanticAction,
  completeSemanticAction,
  semanticActionKey,
  type SemanticActionLock,
} from "./semantic-dedupe";
import { classifyLineFastPath, type FastPathDecision } from "./fast-path";
import {
  ensureLineEventReceipt,
  claimDelayedReplyNotice,
  formatReliabilityStatusForLine,
  getLineEventReceipt,
  getReliabilityReadiness,
  getReliabilityStatus,
  acknowledgeRetainedLineEvents,
  LINE_EVENT_RECOVERY_CRON,
  markBusinessCompleted,
  markLineEventFailure,
  markLineEventQueued,
  markNoReplyCompleted,
  markReplyAttempted,
  markReplyCompleted,
  claimReplyDelivery,
  finishDeliveryAttempt,
  markReplyDefiniteNotSent,
  markReplyNoticeSent,
  markReplyUncertain,
  markRedisplayCompleted,
  persistReplyNotice,
  preparePushRetryKey,
  prepareRedisplayRetryKey,
  startDeliveryAttempt,
  manuallyRecoverLineEvents,
  prepareLineEvent,
  recoverStalledLineEvents,
  redactExpiredLineEventPayloads,
  reliabilityCorrelationIdFor,
  reliabilityEventIdFor,
} from "./reliability";

export interface Env {
  DB: D1Database;
  EVENTS: Queue<QueueMessage>;
  AI: Ai;
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_ACCOUNT_NAME: string;
  LINE_ACCOUNT_ID: string;
  CONVERSATION_V2_MODE?: "off" | "shadow" | "test_farm" | "on";
  CONVERSATION_MODEL?: string;
  LINE_API_BASE?: string;
  FARM_ADMIN_PASSWORD_HASH?: string;
  /** Temporary, non-secret runtime harness gate; absent in normal deploys. */
  RUNTIME_TEST_TOKEN?: string;
  /** Development-only Ambient command gate; production defaults to disabled. */
  DEV_COMMANDS_ENABLED?: string;
  DEV_AMBIENT_GROUP_ALLOWLIST?: string;
  DEV_AMBIENT_ACTOR_ALLOWLIST?: string;
  /** Local-only deterministic AI seam for the dev runtime harness. */
  RUNTIME_DEV_AMBIENT_AI_STUB_JSON?: string;
  /** Explicit remote-dev-only gate for the real Ambient semantic eval adapter. */
  RUNTIME_AMBIENT_SEMANTIC_EVAL_ENABLED?: string;
  /** Explicit, default-off allowlist for ordinary-line V2.2 shadow only. */
  AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST?: string;
}

/**
 * Local runtime-test seam only. The real development command path never uses
 * this unless the temporary runtime harness gate and the explicit stub value
 * are both present. It still enters extractAmbientCandidates, so parsing,
 * normalization, validation, enrichment, resolve, and reconcile remain the
 * production implementations. No stub completion is persisted.
 */
function developmentAmbientExtractor(env: Env): NonNullable<AmbientDigestRunOptions["extract"]> | undefined {
  const stubJson = env.RUNTIME_DEV_AMBIENT_AI_STUB_JSON?.trim();
  if (!env.RUNTIME_TEST_TOKEN || !stubJson) return undefined;
  return (ambientEnv, messages) => extractAmbientCandidates(
    {
      ...ambientEnv,
      AI: {
        run: async () => ({ response: stubJson }),
      } as unknown as Ai,
    },
    messages,
    SEMANTIC_AI_MODEL,
  );
}

interface LineQueueMessage {
  eventId?: string;
  event?: LineEvent;
  receivedAt?: string;
  correlationId?: string;
}

interface AbnormalClassificationQueueMessage {
  kind: "classify_abnormal";
  abnormalEventId: string;
}

type QueueMessage = LineQueueMessage | AbnormalClassificationQueueMessage;

interface LineWebhookPayload {
  destination?: string;
  events: LineEvent[];
}

interface LineEvent {
  type: string;
  mode?: string;
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
    mention?: {
      mentionees?: AmbientMentionee[];
    };
  };
  postback?: {
    data?: string;
    params?: Record<string, string>;
  };
  deliveryContext?: {
    isRedelivery?: boolean;
  };
}

/**
 * Global LINE Bot notification policy.
 *
 * Every outbound message sent by this Worker is intentionally silent. This is
 * enforced at the request builder/sender boundary so new handlers cannot
 * accidentally opt a message back into LINE push notifications.
 */
const LINE_BOT_NOTIFICATION_DISABLED = true as const;

export interface LineReplyPayload {
  replyToken: string;
  messages: LineReplyMessage[];
  notificationDisabled: true;
}

export interface LinePushPayload {
  to: string;
  messages: LineReplyMessage[];
  notificationDisabled: true;
}

type ReplySender = (
  replyToken: string | undefined,
  messages: LineReplyMessage[],
  env: Env,
) => Promise<LineDeliveryResult | void>;

export interface LineDeliveryResult {
  status: number;
  requestId: string | null;
}

export class LineApiError extends Error {
  readonly status: number | null;
  readonly requestId: string | null;
  readonly ambiguous: boolean;
  readonly accepted: boolean;

  constructor(
    message: string,
    options: { status?: number | null; requestId?: string | null; ambiguous?: boolean; accepted?: boolean } = {},
  ) {
    super(message);
    this.name = "LineApiError";
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
    this.ambiguous = options.ambiguous ?? false;
    this.accepted = options.accepted ?? false;
  }
}

interface GroupState {
  status: string;
  farmName: string | null;
  organizationId: string | null;
  farmId: string | null;
}

interface FarmRow {
  id: string;
  name: string;
  active?: number;
  playerGroupEquityFraction?: number;
  environment?: "production" | "test";
  siteName?: string | null;
  structureMode?: "whole_farm" | "multi_house";
  note?: string | null;
  version?: number;
}

interface HouseRow {
  id: string;
  farmId: string;
  farmName: string;
  name: string;
  normalizedName: string;
  active: number;
}

interface FlockRow {
  id: string;
  farmId: string;
  farmName: string;
  farmEnvironment: "production" | "test";
  houseId: string;
  houseName: string;
  batchCode: string;
  breed: string | null;
  chickInDate: string;
  initialCount: number;
  expectedShipmentDate: string | null;
  status: "active" | "closed" | "cancelled";
}

interface ProfitTotals {
  gross: number;
  allocated: number;
  expense: number;
  net: number;
}

interface InvestorAmount {
  name: string;
  amount: number;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const today = (): string => new Date().toISOString().slice(0, 10);

const sourceGroupId = (event: LineEvent): string | null =>
  event.source?.type === "group" ? event.source.groupId ?? null : null;

const eventIdFor = (event: LineEvent): string => reliabilityEventIdFor(event);

function base64(bytes: ArrayBuffer): string {
  const data = new Uint8Array(bytes);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function lineSignature(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return base64(digest);
}

async function verifyLineSignature(
  body: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;
  const expected = await lineSignature(body, secret);
  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return difference === 0;
}

export function buildLineReplyPayload(
  replyToken: string,
  messages: LineReplyMessage[],
): LineReplyPayload {
  return {
    replyToken,
    messages,
    notificationDisabled: LINE_BOT_NOTIFICATION_DISABLED,
  };
}

export function buildLinePushPayload(
  to: string,
  messages: LineReplyMessage[],
): LinePushPayload {
  return {
    to,
    messages,
    notificationDisabled: LINE_BOT_NOTIFICATION_DISABLED,
  };
}

export async function replyLine(
  replyToken: string | undefined,
  messages: LineReplyMessage[],
  env: Env,
): Promise<LineDeliveryResult | void> {
  if (!replyToken) return;
  let response: Response;
  try {
    response = await fetch(`${env.LINE_API_BASE ?? "https://api.line.me"}/v2/bot/message/reply`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildLineReplyPayload(replyToken, messages)),
    });
  } catch (error) {
    throw new LineApiError(`LINE reply network error: ${error instanceof Error ? error.message : "network_error"}`, { ambiguous: true });
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new LineApiError(`LINE reply failed: ${response.status} ${detail.slice(0, 200)}`, {
      status: response.status,
      requestId: response.headers.get("x-line-request-id"),
      ambiguous: response.status >= 500,
    });
  }
  return { status: response.status, requestId: response.headers.get("x-line-request-id") };
}

export async function pushLine(
  groupId: string,
  messages: LineReplyMessage[],
  env: Env,
  retryKey?: string,
): Promise<LineDeliveryResult> {
  let response: Response;
  try {
    response = await fetch(`${env.LINE_API_BASE ?? "https://api.line.me"}/v2/bot/message/push`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        "content-type": "application/json",
        ...(retryKey ? { "X-Line-Retry-Key": retryKey } : {}),
      },
      body: JSON.stringify(buildLinePushPayload(groupId, messages)),
    });
  } catch (error) {
    throw new LineApiError(`LINE push network error: ${error instanceof Error ? error.message : "network_error"}`, { ambiguous: true });
  }
  if (response.status === 409 && retryKey) {
    throw new LineApiError("LINE push retry key already accepted", {
      status: 409,
      requestId: response.headers.get("x-line-request-id"),
      accepted: true,
    });
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new LineApiError(`LINE push failed: ${response.status} ${detail.slice(0, 200)}`, {
      status: response.status,
      requestId: response.headers.get("x-line-request-id"),
      ambiguous: response.status >= 500,
    });
  }
  return { status: response.status, requestId: response.headers.get("x-line-request-id") };
}

function runtimeTestAuthorized(request: Request, env: Env): boolean {
  const token = env.RUNTIME_TEST_TOKEN;
  return Boolean(token && request.headers.get("x-codex-runtime-token") === token);
}

async function runtimeTestGroupId(env: Env): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT lg.group_id AS groupId
       FROM line_groups lg
       JOIN organizations o ON o.id = lg.organization_id AND o.active = 1
      WHERE lg.status <> 'left'
      ORDER BY lg.group_id
      LIMIT 1`,
  ).first<{ groupId: string }>();
  return row?.groupId ?? null;
}

async function fillRuntimeTestEvent(env: Env, event: LineEvent): Promise<LineEvent | null> {
  if (event.source?.type !== "group" || event.source.groupId) return event;
  const groupId = await runtimeTestGroupId(env);
  if (!groupId) return null;
  return { ...event, source: { ...event.source, groupId } };
}

async function ensureGroup(env: Env, groupId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO line_groups (group_id, status)
     VALUES (?, 'unbound')
     ON CONFLICT(group_id) DO NOTHING`,
  )
    .bind(groupId)
    .run();
}

async function groupState(env: Env, groupId: string): Promise<GroupState> {
  const row = await env.DB.prepare(
    `SELECT status,
            farm_name AS farmName,
            organization_id AS organizationId,
            farm_id AS farmId
       FROM line_groups
      WHERE group_id = ?`,
  )
    .bind(groupId)
    .first<GroupState>();
  return row ?? { status: "unbound", farmName: null, organizationId: null, farmId: null };
}

function isExplicitWakeCommand(command: ParsedCommand, text = ""): boolean {
  const commandClass = classifyCommand(command);
  // Complete operational records such as「死亡5」are intentionally not
  // global wake words. Control, admin, and deterministic query commands are
  // explicit Bot commands and retain their existing manual-text behavior.
  return commandClass === "CONTROL"
    || commandClass === "ADMIN"
    || commandClass === "QUERY"
    || Boolean(navigationActionForText(text));
}

async function hasScopedPendingState(env: Env, groupId: string, userId: string, now: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS present FROM (
       SELECT id FROM pending_actions
        WHERE line_group_id = ? AND line_user_id = ?
          AND status IN ('waiting_farm', 'waiting_confirmation') AND expires_at > ?
       UNION ALL
       SELECT id FROM abnormal_pending_actions
        WHERE line_group_id = ? AND line_user_id = ?
          AND status IN ('waiting_farm', 'waiting_house') AND expires_at > ?
       UNION ALL
       SELECT id FROM farm_admin_actions
        WHERE line_group_id = ? AND line_user_id = ?
          AND status IN ('waiting_password', 'waiting_confirmation') AND expires_at > ?
       UNION ALL
       SELECT id FROM operational_admin_actions
        WHERE line_group_id = ? AND line_user_id = ?
          AND status IN ('waiting_password', 'waiting_confirmation') AND expires_at > ?
       UNION ALL
       SELECT id FROM ambient_digest_candidates
        WHERE line_group_id = ? AND review_user_id = ?
          AND status = 'pending' AND review_expires_at > ?
     ) LIMIT 1`,
  ).bind(groupId, userId, now, groupId, userId, now, groupId, userId, now, groupId, userId, now, groupId, userId, now).first<{ present: number }>();
  return Boolean(row?.present) || await hasActiveDailyReviewContext(env, groupId, userId, now);
}

function eventWithMessageText(event: LineEvent, text: string): LineEvent {
  return { ...event, message: event.message ? { ...event.message, text } : event.message };
}

async function redactAdminPasswordEvent(env: Env, event: LineEvent): Promise<LineEvent> {
  const groupId = sourceGroupId(event);
  const lineUserId = event.source?.userId;
  if (!groupId || !lineUserId || event.type !== "message" || event.message?.type !== "text") return event;
  const pending = await env.DB.prepare(
    `SELECT id FROM (
        SELECT id, created_at FROM farm_admin_actions
         WHERE line_group_id = ? AND line_user_id = ?
           AND status = 'waiting_password' AND expires_at > ?
        UNION ALL
        SELECT id, created_at FROM operational_admin_actions
         WHERE line_group_id = ? AND line_user_id = ?
           AND status = 'waiting_password' AND expires_at > ?
      )
      ORDER BY created_at DESC, id DESC LIMIT 1`,
  )
    .bind(groupId, lineUserId, new Date().toISOString(), groupId, lineUserId, new Date().toISOString())
    .first<{ id: string }>();
  if (!pending) return event;
  return {
    ...event,
    message: event.message ? { ...event.message, text: "[admin-password-redacted]" } : event.message,
  };
}

interface EventState {
  eventId: string;
  alreadyProcessed: boolean;
  replyOnlyMessages?: LineReplyMessage[];
  retained?: boolean;
}

async function recordEvent(
  env: Env,
  event: LineEvent,
  receivedAt: string,
  touchIngress = true,
  storedEventOverride?: LineEvent,
): Promise<EventState> {
  const storedEvent = storedEventOverride ?? await redactAdminPasswordEvent(env, event);
  const preparation = await prepareLineEvent(env, event, receivedAt, storedEvent, touchIngress);
  if (preparation.kind === "completed" || preparation.kind === "in_progress") {
    return { eventId: preparation.receipt.eventId, alreadyProcessed: true };
  }
  if (preparation.kind === "retained") {
    return { eventId: preparation.receipt.eventId, alreadyProcessed: true, retained: true };
  }
  if (preparation.kind === "reply_only") {
    let messages: LineReplyMessage[] = [];
    try {
      const parsed = JSON.parse(preparation.receipt.replyPayloadJson ?? "[]") as unknown;
      if (Array.isArray(parsed)) messages = parsed as LineReplyMessage[];
    } catch {
      await markLineEventFailure(env, preparation.receipt.eventId, "reply", new Error("invalid_saved_reply_payload"));
      return { eventId: preparation.receipt.eventId, alreadyProcessed: true, retained: true };
    }
    return { eventId: preparation.receipt.eventId, alreadyProcessed: false, replyOnlyMessages: messages };
  }
  return { eventId: preparation.receipt.eventId, alreadyProcessed: false };
}

async function persistBusinessResponse(
  env: Env,
  eventId: string,
  messages: LineReplyMessage[],
): Promise<LineReplyMessage[]> {
  const delayed = await claimDelayedReplyNotice(env, eventId);
  const finalMessages = delayed
    ? [buildTextMessage("⚠️ 剛才系統短暫延遲，以下是稍早未完成的回覆。"), ...messages]
    : messages;
  await markBusinessCompleted(env, eventId, finalMessages);
  return finalMessages;
}

async function deliverTrackedReply(
  env: Env,
  eventId: string,
  event: LineEvent,
  messages: LineReplyMessage[],
  replySender: ReplySender,
  trace?: RuntimeTrace,
  options: { allowPushFallback?: boolean } = {},
): Promise<void> {
  const allowPushFallback = options.allowPushFallback !== false;
  const receipt = await getLineEventReceipt(env.DB, eventId);
  if (!receipt) throw new Error("line_event_receipt_missing_before_reply");
  const target = sourceGroupId(event) ?? event.source?.userId ?? null;
  const now = new Date();
  // A webhook redelivery must not extend the one-minute Reply-token window.
  // Use the first durable receipt timestamp, not the latest retry timestamp.
  const firstReceivedAt = Date.parse(receipt.firstReceivedAt || receipt.receivedAt);
  const replyTokenFresh = Boolean(event.replyToken)
    && Number.isFinite(firstReceivedAt)
    && now.getTime() - firstReceivedAt < 55_000;

  const lineRequestId = (error: unknown): string | null => error instanceof LineApiError ? error.requestId : null;
  const lineStatus = (error: unknown): number | null => error instanceof LineApiError ? error.status : null;
  const isAccepted = (error: unknown): boolean => error instanceof LineApiError && error.accepted;
  const isAmbiguous = (error: unknown): boolean => error instanceof LineApiError
    ? error.ambiguous
    : true;

  const pushSavedAnswer = async (): Promise<boolean> => {
    if (!target) return false;
    const retryKey = await preparePushRetryKey(env, eventId, messages);
    const claim = await claimReplyDelivery(env, eventId, "push", new Date(), retryKey);
    if (!claim) {
      const latest = await getLineEventReceipt(env.DB, eventId);
      return latest?.replyStatus === "sent" || latest?.replyOutcome === "sent";
    }
    const attemptId = await startDeliveryAttempt(env, eventId, receipt.correlationId, "push", "push", claim.attempt, claim.owner);
    try {
      const result = await pushLine(target, messages, env, claim.retryKey ?? retryKey);
      await finishDeliveryAttempt(env, attemptId, "sent", result.status, result.requestId);
      await markReplyCompleted(env, eventId, new Date(), claim.owner, result.status, result.requestId);
      return true;
    } catch (error) {
      await finishDeliveryAttempt(env, attemptId, isAccepted(error) ? "accepted" : isAmbiguous(error) ? "uncertain" : "definite_not_sent", lineStatus(error), lineRequestId(error), error instanceof LineApiError ? error.name : "push_error").catch(() => undefined);
      if (isAccepted(error)) {
        await markReplyCompleted(env, eventId, new Date(), claim.owner, 409, lineRequestId(error));
        return true;
      }
      if (isAmbiguous(error)) await markReplyUncertain(env, eventId, error, new Date(), claim.owner, lineStatus(error), lineRequestId(error));
      else await markReplyDefiniteNotSent(env, eventId, error, new Date(), claim.owner, lineStatus(error), lineRequestId(error));
      return false;
    }
  };

  const sendUncertainNotice = async (): Promise<void> => {
    if (!allowPushFallback) return;
    if (!target) return;
    const noticeId = receipt.replyNoticeId ?? `notice-${crypto.randomUUID()}`;
    const noticeMessages: LineReplyMessage[] = [buildTextMessage(
      "⚠️ 剛才系統短暫延遲，這則回覆可能沒有正常顯示。\n如要重新查看，請按「重新顯示」。",
      {
        items: [{
          type: "action",
          action: {
            type: "postback",
            label: "重新顯示",
            data: new URLSearchParams({ action: "reliability_redisplay", notice: noticeId }).toString(),
            displayText: "重新顯示",
          },
        }],
      },
    )];
    const notice = await persistReplyNotice(env, eventId, noticeId, noticeMessages);
    const claim = await claimReplyDelivery(env, eventId, "uncertain_notice", new Date(), notice.retryKey);
    if (!claim) return;
    const attemptId = await startDeliveryAttempt(env, eventId, receipt.correlationId, "uncertain_notice", "uncertain_notice", claim.attempt, claim.owner);
    try {
      const result = await pushLine(target, noticeMessages, env, notice.retryKey);
      await finishDeliveryAttempt(env, attemptId, "sent", result.status, result.requestId);
      await markReplyNoticeSent(env, eventId, new Date(), claim.owner);
    } catch (error) {
      await finishDeliveryAttempt(env, attemptId, isAccepted(error) ? "accepted" : isAmbiguous(error) ? "uncertain" : "definite_not_sent", lineStatus(error), lineRequestId(error), error instanceof LineApiError ? error.name : "notice_error").catch(() => undefined);
      if (isAccepted(error)) await markReplyNoticeSent(env, eventId, new Date(), claim.owner);
      else await markReplyUncertain(env, eventId, error, new Date(), claim.owner, lineStatus(error), lineRequestId(error));
    }
  };

  if (receipt.replyOutcome === "uncertain") {
    await sendUncertainNotice();
    return;
  }

  // A previous Reply call may have reached LINE while the Worker died before
  // recording its result. Once the one-minute Reply-token window is gone, do
  // not silently turn that ambiguous result into a duplicate Push.
  if (receipt.replyAttempts > 0 && receipt.replyOutcome === "pending") {
    await markReplyUncertain(env, eventId, new LineApiError("reply_result_unknown", { ambiguous: true }));
    await sendUncertainNotice();
    return;
  }

  const mode = replyTokenFresh ? "reply" : "push" as const;
  if (mode === "push" && !allowPushFallback) {
    await markReplyDefiniteNotSent(env, eventId, new Error("reply_token_expired_dev_reply_only"));
    return;
  }
  if (mode === "push" && !target) {
    await markReplyDefiniteNotSent(env, eventId, new Error("line_push_target_missing"));
    throw new Error("line_push_target_missing");
  }
  const retryKey = mode === "push" ? await preparePushRetryKey(env, eventId, messages) : null;
  const claim = await claimReplyDelivery(env, eventId, mode, now, retryKey);
  if (!claim) return;
  traceMark(trace, "line_reply_start_ms");
  const attemptId = await startDeliveryAttempt(env, eventId, receipt.correlationId, mode, mode, claim.attempt, claim.owner, now);
  try {
    const result = mode === "reply"
      ? await replySender(event.replyToken, messages, env)
      : await pushLine(target ?? "", messages, env, claim.retryKey ?? retryKey ?? undefined);
    const status = result?.status ?? 200;
    const requestId = result?.requestId ?? null;
    await finishDeliveryAttempt(env, attemptId, "sent", status, requestId);
    await markReplyCompleted(env, eventId, new Date(), claim.owner, status, requestId);
    traceMark(trace, "line_reply_complete_ms");
  } catch (error) {
    await finishDeliveryAttempt(env, attemptId, isAccepted(error) ? "accepted" : isAmbiguous(error) ? "uncertain" : "definite_not_sent", lineStatus(error), lineRequestId(error), error instanceof LineApiError ? error.name : "reply_error").catch(() => undefined);
    if (isAccepted(error)) {
      await markReplyCompleted(env, eventId, new Date(), claim.owner, 409, lineRequestId(error));
      return;
    }
    if (mode === "reply" && isAmbiguous(error)) {
      await markReplyUncertain(env, eventId, error, new Date(), claim.owner, lineStatus(error), lineRequestId(error));
      await sendUncertainNotice();
      return;
    }
    if (mode === "reply" && !isAmbiguous(error)) {
      await markReplyDefiniteNotSent(env, eventId, error, new Date(), claim.owner, lineStatus(error), lineRequestId(error));
      if (!allowPushFallback || await pushSavedAnswer()) return;
    } else {
      await markReplyUncertain(env, eventId, error, new Date(), claim.owner, lineStatus(error), lineRequestId(error));
    }
    if (!allowPushFallback) return;
    throw error;
  }
}

function fastPathReplyMessages(decision: FastPathDecision): LineReplyMessage[] {
  if (decision.action === "menu_home") return [buildMainMenuFlex()];
  if (decision.action === "menu_more") return [buildMoreMenuFlex()];
  if (decision.action === "menu_help") return [buildTextMessage(MENU_HELP_TEXT)];
  throw new Error("fast_path_reply_builder_missing");
}

async function enqueueLineEvent(
  env: Env,
  event: LineEvent,
  owner: string,
): Promise<void> {
  const eventId = eventIdFor(event);
  const correlationId = reliabilityCorrelationIdFor(event);
  await markLineEventQueued(env, eventId, new Date(), owner);
  await env.EVENTS.send({ eventId, correlationId });
  console.log(JSON.stringify({
    event: "line_event_queued",
    event_id_suffix: eventId.slice(-12),
    correlation_id_suffix: correlationId.slice(-12),
    owner,
  }));
}

/**
 * Process an allowlisted static action without waiting for the Queue.
 *
 * This deliberately reuses the existing receipt, business-completion and
 * tracked-reply functions.  The only omitted step is Queue enqueue; it is
 * not a second business workflow and it never handles stateful actions.
 */
async function processFastPathEvent(
  env: Env,
  event: LineEvent,
  storedEvent: LineEvent,
  receivedAt: string,
  decision: FastPathDecision,
  replySender: ReplySender = replyLine,
): Promise<void> {
  const eventId = eventIdFor(event);
  const correlationId = reliabilityCorrelationIdFor(event);
  const startedAt = Date.now();
  const trace: RuntimeTrace = { correlation_id: correlationId };
  console.log(JSON.stringify({
    event: "line_fast_path_start",
    action: decision.action,
    response_kind: decision.responseKind,
    event_id_suffix: eventId.slice(-12),
    correlation_id_suffix: correlationId.slice(-12),
  }));
  try {
    const eventState = await recordEvent(env, event, receivedAt, false, storedEvent);
    if (eventState.replyOnlyMessages) {
      await deliverTrackedReply(env, eventState.eventId, event, eventState.replyOnlyMessages, replySender, trace);
    } else if (!eventState.alreadyProcessed) {
      const finalMessages = await persistBusinessResponse(env, eventState.eventId, fastPathReplyMessages(decision));
      await deliverTrackedReply(env, eventState.eventId, event, finalMessages, replySender, trace);
    }
    const receipt = await getLineEventReceipt(env.DB, eventId);
    console.log(JSON.stringify({
      event: "line_fast_path_complete",
      action: decision.action,
      event_id_suffix: eventId.slice(-12),
      correlation_id_suffix: correlationId.slice(-12),
      lifecycle_status: receipt?.lifecycleStatus ?? null,
      business_status: receipt?.businessStatus ?? null,
      reply_outcome: receipt?.replyOutcome ?? null,
      queued: Boolean(receipt?.queuedAt),
      duration_ms: Date.now() - startedAt,
    }));
  } catch (error) {
    const current = await getLineEventReceipt(env.DB, eventId).catch(() => null);
    // Once the deterministic response is durably complete, the only safe
    // recovery is the existing reply-only path.  Never enqueue the full
    // business event after that boundary.
    if (current?.businessStatus === "completed") {
      console.error(JSON.stringify({
        event: "line_fast_path_business_complete_reply_recovery",
        action: decision.action,
        event_id_suffix: eventId.slice(-12),
        correlation_id_suffix: correlationId.slice(-12),
        reply_outcome: current.replyOutcome,
        error_class: error instanceof Error && error.name ? error.name : "fast_path_reply_error",
      }));
      return;
    }
    try {
      const status = await markLineEventFailure(env, eventId, "processing", error);
      if (status === "retry_waiting") await enqueueLineEvent(env, event, "fast_path_fallback");
      console.error(JSON.stringify({
        event: "line_fast_path_fallback_queue",
        action: decision.action,
        event_id_suffix: eventId.slice(-12),
        correlation_id_suffix: correlationId.slice(-12),
        lifecycle_status: status,
        error_class: error instanceof Error && error.name ? error.name : "fast_path_error",
      }));
    } catch (fallbackError) {
      const status = await markLineEventFailure(env, eventId, "enqueue", fallbackError).catch(() => "retry_waiting" as const);
      console.error(JSON.stringify({
        event: "line_fast_path_fallback_failure",
        action: decision.action,
        event_id_suffix: eventId.slice(-12),
        correlation_id_suffix: correlationId.slice(-12),
        lifecycle_status: status,
        error_class: fallbackError instanceof Error && fallbackError.name ? fallbackError.name : "fast_path_fallback_error",
      }));
    }
  }
}

async function markEventProcessed(env: Env, eventId: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE line_events SET processed_at = CURRENT_TIMESTAMP WHERE event_id = ?",
  )
    .bind(eventId)
    .run();
}

function helpReply(accountName: string): string {
  return `${botName(accountName)}\n你可以直接用平常說話的方式告訴我：\n\n紀錄：金雞測試場死亡5\n異常：金雞測試場有咳嗽、風扇異常\n查詢：今天死亡、目前存欄、近期出雞\n查看：雞場與批次、待確認資料、歷史紀錄、雲林天氣\n分析：最近哪一場需要注意？\n修改：直接說哪裡需要更正\n取消：取消這筆、先不要記\n\n輸入「選單」可以查看常用功能；管理者可輸入「管理功能」或「開發選單」。`;
}

function safeOperationalBindingReply(accountName: string, state: GroupState): string {
  if (!state.organizationId) return unboundReply(accountName);
  if (!state.farmId) {
    return `${botName(accountName)}\n⚠️ 本群已綁定投資組合，但尚未指定營運雞場。\n投資資料查詢不受影響；營運事件請先指定雞場。`;
  }
  return `${botName(accountName)}\n⚠️ 本群目前尚未完成營運資料綁定。`;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value * 100)}%`;
}

async function organizationName(env: Env, organizationId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT name FROM organizations WHERE id = ?")
    .bind(organizationId)
    .first<{ name: string }>();
  return row?.name ?? "大富翁雞場投資組合";
}

async function resolveFarm(
  env: Env,
  organizationId: string,
  requestedName: string,
): Promise<FarmRow | null> {
  const resolver = await loadFarmResolver(env, organizationId);
  const resolution = resolver.resolve(requestedName);
  if (resolution.kind !== "direct" || !resolution.farm) return null;
  return env.DB.prepare(
    `SELECT id, name, environment, player_group_equity_fraction AS playerGroupEquityFraction
       FROM farms
      WHERE organization_id = ? AND id = ? AND active = 1 AND environment = 'production'
      LIMIT 1`,
  )
    .bind(organizationId, resolution.farm.id)
    .first<FarmRow>();
}

async function loadFarmResolver(env: Env, organizationId: string): Promise<FarmResolver> {
  const farms = await env.DB.prepare(
    `SELECT id, name, active, environment, site_name AS siteName,
            farm_structure_mode AS structureMode, note, version
       FROM farms
      WHERE organization_id = ?
      ORDER BY id`,
  )
    .bind(organizationId)
    .all<FarmRecord>();
  const aliases = await env.DB.prepare(
    `SELECT a.farm_id AS farmId,
            a.alias,
            a.normalized_alias AS normalizedAlias,
            a.alias_type AS aliasType,
            a.status
       FROM farm_aliases a
       JOIN farms f ON f.id = a.farm_id
      WHERE f.organization_id = ?
      ORDER BY a.id`,
  )
    .bind(organizationId)
    .all<FarmAliasRecord>();
  return new FarmResolver(farms.results, aliases.results);
}

async function portfolioTotals(env: Env, organizationId: string): Promise<ProfitTotals> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(gross_profit_loss), 0) AS gross,
            COALESCE(SUM(allocated_profit_loss), 0) AS allocated,
            COALESCE(SUM(expense), 0) AS expense,
            COALESCE(SUM(net_income), 0) AS net
       FROM profit_distributions d
       JOIN farms f ON f.id = d.farm_id
      WHERE d.organization_id = ? AND f.environment = 'production'`,
  )
    .bind(organizationId)
    .first<ProfitTotals>();
  return row ?? { gross: 0, allocated: 0, expense: 0, net: 0 };
}

async function investorAmounts(
  env: Env,
  organizationId: string,
  farmId?: string,
): Promise<InvestorAmount[]> {
  const filter = farmId ? "AND d.farm_id = ?" : "";
  const bindings = farmId ? [organizationId, farmId] : [organizationId];
  const rows = await env.DB.prepare(
    `SELECT i.name, COALESCE(SUM(CASE WHEN d.id IS NOT NULL AND EXISTS (
              SELECT 1 FROM farms f WHERE f.id = d.farm_id AND f.environment = 'production'
            ) THEN a.amount ELSE 0 END), 0) AS amount
       FROM investors i
       LEFT JOIN profit_distribution_allocations a ON a.investor_id = i.id
       LEFT JOIN profit_distributions d ON d.id = a.distribution_id ${filter}
      WHERE i.organization_id = ?
      GROUP BY i.id, i.name
      ORDER BY i.id`,
  )
    .bind(...(farmId ? [farmId, organizationId] : [organizationId]))
    .all<InvestorAmount>();
  return rows.results;
}

async function farmProfitReply(
  env: Env,
  organizationId: string,
  requestedName: string,
  accountName: string,
): Promise<string> {
  const farm = await resolveFarm(env, organizationId, requestedName);
  if (!farm) return safeRejectionReply(accountName);
  const totals = await env.DB.prepare(
    `SELECT COALESCE(SUM(gross_profit_loss), 0) AS gross,
            COALESCE(SUM(allocated_profit_loss), 0) AS allocated,
            COALESCE(SUM(expense), 0) AS expense,
            COALESCE(SUM(net_income), 0) AS net
       FROM profit_distributions
      WHERE organization_id = ? AND farm_id = ?`,
  )
    .bind(organizationId, farm.id)
    .first<ProfitTotals>();
  const amounts = await investorAmounts(env, organizationId, farm.id);
  const result = totals ?? { gross: 0, allocated: 0, expense: 0, net: 0 };
  return [
    `${botName(accountName)} ${farm.name}`,
    `歷史總盈虧：${formatAmount(result.gross)}`,
    `玩家分配盈虧：${formatAmount(result.allocated)}`,
    `支出：${formatAmount(result.expense)}`,
    `玩家淨收入：${formatAmount(result.net)}`,
    ...amounts.map((item) => `${item.name}：${formatAmount(item.amount)}`),
  ].join("\n");
}

async function farmListReply(
  env: Env,
  organizationId: string,
  accountName: string,
): Promise<string> {
  const name = await organizationName(env, organizationId);
  const rows = await env.DB.prepare(
    "SELECT name FROM farms WHERE organization_id = ? AND active = 1 AND environment = 'production' ORDER BY id",
  )
    .bind(organizationId)
    .all<{ name: string }>();
  return [`${botName(accountName)} ${name}`, ...rows.results.map((row) => row.name)].join("\n");
}

async function equityReply(
  env: Env,
  organizationId: string,
  accountName: string,
): Promise<string> {
  const name = await organizationName(env, organizationId);
  const rows = await env.DB.prepare(
    `SELECT name, player_group_equity_fraction AS playerGroupEquityFraction
       FROM farms
      WHERE organization_id = ? AND active = 1 AND environment = 'production'
      ORDER BY id`,
  )
    .bind(organizationId)
    .all<FarmRow>();
  return [
    `${botName(accountName)} ${name}`,
    "玩家持股：",
    ...rows.results.map((row) => `${row.name}：${formatPercent(row.playerGroupEquityFraction ?? 0)}`),
  ].join("\n");
}

async function portfolioProfitReply(
  env: Env,
  organizationId: string,
  accountName: string,
): Promise<string> {
  const name = await organizationName(env, organizationId);
  const totals = await portfolioTotals(env, organizationId);
  const amounts = await investorAmounts(env, organizationId);
  return [
    `${botName(accountName)} ${name}`,
    `玩家分配盈虧：${formatAmount(totals.allocated)}`,
    `支出：${formatAmount(totals.expense)}`,
    `玩家淨收入：${formatAmount(totals.net)}`,
    ...amounts.map((item) => `${item.name}：${formatAmount(item.amount)}`),
  ].join("\n");
}

async function farmProfitListReply(
  env: Env,
  organizationId: string,
  accountName: string,
): Promise<string> {
  const name = await organizationName(env, organizationId);
  const rows = await env.DB.prepare(
    `SELECT f.name,
            COALESCE(SUM(d.gross_profit_loss), 0) AS gross,
            COALESCE(SUM(d.allocated_profit_loss), 0) AS allocated,
            COALESCE(SUM(d.expense), 0) AS expense,
            COALESCE(SUM(d.net_income), 0) AS net
       FROM farms f
       LEFT JOIN profit_distributions d ON d.farm_id = f.id
      WHERE f.organization_id = ? AND f.active = 1 AND f.environment = 'production'
      GROUP BY f.id, f.name
      ORDER BY f.id`,
  )
    .bind(organizationId)
    .all<{ name: string; gross: number; allocated: number; expense: number; net: number }>();
  return [
    `${botName(accountName)} ${name}`,
    "各場歷史盈虧：",
    ...rows.results.map((row) =>
      `${row.name}：總盈虧 ${formatAmount(row.gross)}／玩家分配 ${formatAmount(row.allocated)}／支出 ${formatAmount(row.expense)}／淨收入 ${formatAmount(row.net)}`,
    ),
  ].join("\n");
}

async function linkedInvestor(
  env: Env,
  organizationId: string,
  lineUserId: string,
): Promise<{ investorId: string } | null> {
  const row = await env.DB.prepare(
    `SELECT investor_id AS investorId
       FROM line_user_investor_links
      WHERE organization_id = ? AND line_user_id = ?
        AND active = 1 AND status = 'linked' AND investor_id IS NOT NULL`,
  )
    .bind(organizationId, lineUserId)
    .first<{ investorId: string | null }>();
  return row?.investorId ? { investorId: row.investorId } : null;
}

async function myEquityReply(
  env: Env,
  organizationId: string,
  lineUserId: string | undefined,
  accountName: string,
): Promise<string> {
  if (!lineUserId || !(await linkedInvestor(env, organizationId, lineUserId))) {
    return `${botName(accountName)}\n⚠️ 你的 LINE 帳號尚未綁定投資人身份。\n目前可查詢整體或指定雞場資料。`;
  }
  const link = await linkedInvestor(env, organizationId, lineUserId);
  const rows = await env.DB.prepare(
    `SELECT f.name, e.equity_fraction AS fraction
       FROM farm_investor_equity e
       JOIN farms f ON f.id = e.farm_id
      WHERE e.investor_id = ? AND f.organization_id = ? AND f.environment = 'production'
      ORDER BY f.id`,
  )
    .bind(link?.investorId, organizationId)
    .all<{ name: string; fraction: number }>();
  return [
    `${botName(accountName)} 我的持股`,
    ...rows.results.map((row) => `${row.name}：${formatPercent(row.fraction)}`),
  ].join("\n");
}

async function myProfitReply(
  env: Env,
  organizationId: string,
  lineUserId: string | undefined,
  accountName: string,
): Promise<string> {
  if (!lineUserId) {
    return `${botName(accountName)}\n⚠️ 你的 LINE 帳號尚未綁定投資人身份。\n目前可查詢整體或指定雞場資料。`;
  }
  const link = await linkedInvestor(env, organizationId, lineUserId);
  if (!link) {
    return `${botName(accountName)}\n⚠️ 你的 LINE 帳號尚未綁定投資人身份。\n目前可查詢整體或指定雞場資料。`;
  }
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(a.amount), 0) AS amount
       FROM profit_distribution_allocations a
       JOIN profit_distributions d ON d.id = a.distribution_id
       JOIN farms f ON f.id = d.farm_id AND f.environment = 'production'
      WHERE a.investor_id = ? AND d.organization_id = ?`,
  )
    .bind(link.investorId, organizationId)
    .first<{ amount: number }>();
  return `${botName(accountName)}\n我的累計盈虧：${formatAmount(row?.amount ?? 0)}`;
}

async function todayMortalityReply(
  env: Env,
  groupId: string,
  organizationId: string,
  house: string | undefined,
  accountName: string,
  requestedDay = taipeiDate(),
): Promise<string> {
  const day = requestedDay;
  const rows = await env.DB.prepare(
    `SELECT f.name, f.environment,
            COALESCE((
              SELECT SUM(e.quantity)
                FROM operational_events e
               WHERE e.organization_id = f.organization_id
                 AND e.farm_id = f.id
                 AND e.line_group_id = ?
                 AND e.event_date = ?
                 AND e.intent = 'mortality'
                 AND e.reversed_at IS NULL
                 AND (? IS NULL OR e.house = ?)
            ), 0)
            + COALESCE((
              SELECT SUM(d.amount)
                FROM daily_records d
               WHERE d.group_id = ?
                 AND d.farm_id = f.id
                 AND d.record_date = ?
                 AND d.record_type = 'mortality'
                 AND (? IS NULL OR d.house = ?)
            ), 0) AS amount
       FROM farms f
      WHERE f.organization_id = ? AND f.active = 1
      ORDER BY f.id`,
  )
    .bind(groupId, day, house ?? null, house ?? null, groupId, day, house ?? null, house ?? null, organizationId)
    .all<{ name: string; environment: "production" | "test"; amount: number }>();
  const productionRows = rows.results.filter((row) => row.environment === "production");
  const testRows = rows.results.filter((row) => row.environment === "test");
  const productionTotal = productionRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const testTotal = testRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const productionDetails = productionTotal === 0
    ? ["目前無正式死亡紀錄。"]
    : productionRows.filter((row) => Number(row.amount || 0) > 0).map((row) => `${row.name}：${formatAmount(row.amount)}隻`);
  const testDetails = testRows.length === 0
    ? ["目前沒有測試雞場。"]
    : testTotal === 0
      ? ["目前無測試死亡紀錄。"]
      : testRows.filter((row) => Number(row.amount || 0) > 0).map((row) => `🧪 ${row.name}：${formatAmount(row.amount)}隻`);
  return [
    `${botName(accountName)} 今日死亡`,
    "正式雞場：",
    ...productionDetails,
    `正式場合計：${formatAmount(productionTotal)}隻`,
    "🧪 測試雞場：",
    ...testDetails,
    `測試場合計：${formatAmount(testTotal)}隻`,
  ].join("\n");
}

function daysAgo(dayCount: number): string {
  return new Date(Date.now() - dayCount * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function mortalityTopReply(
  env: Env,
  groupId: string,
  organizationId: string,
  days: number | null,
  accountName: string,
): Promise<string> {
  if (days === null) {
    return [
      `${botName(accountName)} 你想查最近：`,
      "1. 3天",
      "2. 7天",
      "3. 14天",
      "請回覆天數。",
    ].join("\n");
  }
  const end = today();
  const start = days === 1 ? end : daysAgo(days - 1);
  const rows = await env.DB.prepare(
    `SELECT f.name, f.environment,
            COALESCE((
              SELECT SUM(e.quantity) FROM operational_events e
               WHERE e.organization_id = f.organization_id AND e.farm_id = f.id
                 AND e.line_group_id = ? AND e.intent = 'mortality'
                 AND e.reversed_at IS NULL
                 AND e.event_date BETWEEN ? AND ?
            ), 0)
            + COALESCE((
              SELECT SUM(d.amount) FROM daily_records d
               WHERE d.group_id = ? AND d.farm_id = f.id
                 AND d.record_type = 'mortality'
                 AND d.record_date BETWEEN ? AND ?
            ), 0) AS amount
       FROM farms f
      WHERE f.organization_id = ? AND f.active = 1
      ORDER BY amount DESC, f.id`,
  )
    .bind(groupId, start, end, groupId, start, end, organizationId)
    .all<{ name: string; environment: "production" | "test"; amount: number }>();
  const top = Number(rows.results[0]?.amount ?? 0);
  if (!top) {
    return `${botName(accountName)}\n${days === 1 ? "今日" : `最近${days}天`}尚無死亡紀錄。`;
  }
  const leaders = rows.results.filter((row) => Number(row.amount) === top);
  return [
    `${botName(accountName)} ${days === 1 ? "今日" : `最近${days}天`}死亡最多：`,
    ...leaders.map((row) => `${row.environment === "test" ? "🧪 " : ""}${row.name}：${formatAmount(row.amount)}隻`),
  ].join("\n");
}

async function farmTodayMortalityReply(
  env: Env,
  groupId: string,
  organizationId: string,
  farm: FarmRow,
  house: string | undefined,
  accountName: string,
): Promise<string> {
  const day = today();
  const row = await env.DB.prepare(
    `SELECT COALESCE((
              SELECT SUM(e.quantity)
               FROM operational_events e
               WHERE e.organization_id = ? AND e.farm_id = ?
                 AND e.line_group_id = ? AND e.event_date = ? AND e.intent = 'mortality'
                 AND e.reversed_at IS NULL
                 AND (? IS NULL OR e.house = ?)
            ), 0)
            + COALESCE((
              SELECT SUM(d.amount)
                FROM daily_records d
               WHERE d.group_id = ? AND d.farm_id = ?
                 AND d.record_date = ? AND d.record_type = 'mortality'
                 AND (? IS NULL OR d.house = ?)
            ), 0) AS amount`,
  )
    .bind(
      organizationId,
      farm.id,
      groupId,
      day,
      house ?? null,
      house ?? null,
      groupId,
      farm.id,
      day,
      house ?? null,
      house ?? null,
    )
    .first<{ amount: number }>();
  return `${botName(accountName)} ${farm.name}\n${house ? `${house} ` : ""}今日死亡：${formatAmount(row?.amount ?? 0)}隻`;
}

async function activeFlocks(
  env: Env,
  organizationId: string,
  house?: string,
  farmId?: string,
): Promise<FlockRow[]> {
  const normalizedHouse = house ? normalizedHouseName(house) : null;
  const rows = await env.DB.prepare(
    `SELECT fl.id,
            fl.farm_id AS farmId,
            f.name AS farmName,
            f.environment AS farmEnvironment,
            fl.house_id AS houseId,
            h.name AS houseName,
            h.normalized_name AS normalizedName,
            fl.batch_code AS batchCode,
            fl.breed,
            fl.chick_in_date AS chickInDate,
            fl.initial_count AS initialCount,
            fl.expected_shipment_date AS expectedShipmentDate,
            fl.status
       FROM flocks fl
       JOIN houses h ON h.id = fl.house_id AND h.active = 1
       JOIN farms f ON f.id = fl.farm_id AND f.active = 1
      WHERE f.organization_id = ?
        AND (? IS NULL OR f.id = ?)
        AND fl.status = 'active'
        AND (? IS NULL OR h.normalized_name = ? OR h.name = ?)
      ORDER BY f.id, h.normalized_name, fl.batch_code, fl.id`,
  )
    .bind(organizationId, farmId ?? null, farmId ?? null, normalizedHouse, normalizedHouse, house ?? null)
    .all<FlockRow>();
  return rows.results;
}

async function activeHousesForFarm(env: Env, farmId: string): Promise<HouseRow[]> {
  const rows = await env.DB.prepare(
    `SELECT h.id,
            h.farm_id AS farmId,
            f.name AS farmName,
            h.name,
            h.normalized_name AS normalizedName,
            h.active
       FROM houses h
       JOIN farms f ON f.id = h.farm_id
      WHERE h.farm_id = ? AND h.active = 1
      ORDER BY h.normalized_name, h.id`,
  )
    .bind(farmId)
    .all<HouseRow>();
  return rows.results;
}

function shipmentReminderText(reminder: ShipmentReminder): string {
  if (reminder === "overdue") return "已逾期";
  if (reminder === "today") return "今天出雞";
  if (reminder === "one_day") return "明天出雞";
  if (reminder === "seven_days") return "7日內出雞";
  return "";
}

async function flockAgeReply(
  env: Env,
  organizationId: string,
  house: string | undefined,
  accountName: string,
  farmId?: string,
): Promise<string> {
  const rows = await activeFlocks(env, organizationId, house, farmId);
  if (!rows.length) {
    return `${botName(accountName)}\n目前尚未建立 ${house ?? "雞舍"} 的 flock 日齡主檔，沒有自行推算。`;
  }
  const asOf = taipeiDate();
  return [
    `${botName(accountName)} ${house ?? "目前"}日齡（${asOf}）`,
    ...rows.map((row) => `${farmDisplayName({ name: row.farmName, environment: row.farmEnvironment })}｜${row.houseName}｜${row.batchCode}：日齡 ${flockAgeDays(row.chickInDate, asOf)}日（入雛 ${row.chickInDate}）`),
  ].join("\n");
}

async function derivedCurrentStockReply(
  env: Env,
  organizationId: string,
  house: string | undefined,
  accountName: string,
  farmId?: string,
): Promise<string | null> {
  const flocks = await activeFlocks(env, organizationId, house, farmId);
  if (!flocks.length) return null;

  const flockPlaceholders = flocks.map(() => "?").join(", ");
  const flockEvents = await env.DB.prepare(
    `SELECT flock_id AS flockId, intent, quantity
       FROM operational_events
      WHERE flock_id IN (${flockPlaceholders})
        AND reversed_at IS NULL
        AND intent IN ('mortality', 'cull', 'shipment')`,
  )
    .bind(...flocks.map((flock) => flock.id))
    .all<{ flockId: string; intent: StockAdjustment["intent"]; quantity: number }>();
  const houseEvents = await env.DB.prepare(
    `SELECT house_id AS houseId, intent, quantity
       FROM operational_events
      WHERE house_id IN (${flockPlaceholders})
        AND flock_id IS NULL
        AND reversed_at IS NULL
        AND intent IN ('mortality', 'cull', 'shipment')`,
  )
    .bind(...flocks.map((flock) => flock.houseId))
    .all<{ houseId: string; intent: StockAdjustment["intent"]; quantity: number }>();

  const flockAdjustments = new Map<string, StockAdjustment[]>();
  for (const event of flockEvents.results) {
    const list = flockAdjustments.get(event.flockId) ?? [];
    list.push({ intent: event.intent, quantity: Number(event.quantity) });
    flockAdjustments.set(event.flockId, list);
  }
  const houseAdjustments = new Map<string, StockAdjustment[]>();
  for (const event of houseEvents.results) {
    const list = houseAdjustments.get(event.houseId) ?? [];
    list.push({ intent: event.intent, quantity: Number(event.quantity) });
    houseAdjustments.set(event.houseId, list);
  }

  const byHouse = new Map<string, FlockRow[]>();
  for (const flock of flocks) {
    const list = byHouse.get(flock.houseId) ?? [];
    list.push(flock);
    byHouse.set(flock.houseId, list);
  }
  const lines: string[] = [];
  for (const houseFlocks of byHouse.values()) {
    const first = houseFlocks[0];
    const batchStocks = houseFlocks.map((flock) => ({
      flock,
      stock: deriveCurrentStock(flock.initialCount, flockAdjustments.get(flock.id) ?? []),
    }));
    const houseLevelReduction = (houseAdjustments.get(first.houseId) ?? []).reduce((sum, event) => sum + event.quantity, 0);
    const totalBeforeHouseLevel = batchStocks.reduce((sum, item) => sum + item.stock, 0);
    const total = Math.max(0, totalBeforeHouseLevel - houseLevelReduction);
    lines.push(`${farmDisplayName({ name: first.farmName, environment: first.farmEnvironment })}｜${first.houseName}：${formatAmount(total)}隻`);
    for (const item of batchStocks) {
      lines.push(`  ${item.flock.batchCode}：${formatAmount(item.stock)}隻`);
    }
  }
  return [`${botName(accountName)} 目前存欄（由入雛數－死亡／淘汰／出雞推導）`, ...lines].join("\n");
}

async function upcomingShipmentsReply(
  env: Env,
  organizationId: string,
  accountName: string,
): Promise<string> {
  const rows = await activeFlocks(env, organizationId);
  if (!rows.length) return `${botName(accountName)}\n目前尚未建立出雞 shipment 主檔，沒有自行推算。`;
  const asOf = taipeiDate();
  const upcoming = rows
    .map((row) => ({ row, reminder: shipmentReminder(row.expectedShipmentDate, asOf) }))
    .filter((item) => item.reminder !== null);
  if (!upcoming.length) return `${botName(accountName)}\n未來 7 日內沒有已設定的出雞提醒。`;
  const lines = upcoming.map(({ row, reminder }) =>
    `${farmDisplayName({ name: row.farmName, environment: row.farmEnvironment })}｜${row.houseName}｜${row.batchCode}：${row.expectedShipmentDate}（${shipmentReminderText(reminder)}）`,
  );
  return [`${botName(accountName)} 近期出雞`, ...lines].join("\n");
}

async function inventoryReply(
  env: Env,
  groupId: string,
  house: string | undefined,
  accountName: string,
): Promise<string> {
  const filters = house ? "AND house = ?" : "";
  const bindings = house ? [groupId, house] : [groupId];
  const rows = await env.DB.prepare(
    `SELECT house, amount, record_date AS recordDate
       FROM daily_records d
      WHERE group_id = ? AND record_type = 'inventory' ${filters}
        AND NOT EXISTS (
          SELECT 1 FROM daily_records newer
           WHERE newer.group_id = d.group_id
             AND newer.house = d.house
             AND newer.record_type = 'inventory'
             AND (newer.record_date > d.record_date
               OR (newer.record_date = d.record_date AND newer.id > d.id))
        )
      ORDER BY house`,
  )
    .bind(...bindings)
    .all<{ house: string; amount: number; recordDate: string }>();
  if (!rows.results.length) return `${botName(accountName)}\n目前尚無存欄紀錄。`;
  return [
    `${botName(accountName)} 目前存欄`,
    ...rows.results.map((row) => `${row.house}：${formatAmount(row.amount)}隻（${row.recordDate}）`),
  ].join("\n");
}

async function summaryReply(env: Env, groupId: string, house: string | undefined): Promise<string> {
  const day = today();
  const filters = house ? "AND house = ?" : "";
  const bindings = house ? [groupId, day, house] : [groupId, day];
  const rows = await env.DB.prepare(
    `SELECT house,
            COALESCE(SUM(CASE WHEN record_type = 'mortality' THEN amount ELSE 0 END), 0) AS mortality,
            MAX(CASE WHEN record_type = 'inventory' THEN amount END) AS inventory
       FROM daily_records
      WHERE group_id = ? AND record_date = ? ${filters}
      GROUP BY house ORDER BY house`,
  )
    .bind(...bindings)
    .all<{ house: string; mortality: number; inventory: number | null }>();

  if (rows.results.length === 0) {
    return `${botName()}\n今日尚無 ${house ? `${house} ` : ""}紀錄。`;
  }

  const details = rows.results.map((row) => {
    const inventory = row.inventory === null ? "尚未登記" : `${row.inventory.toLocaleString()}隻`;
    return `${row.house}死亡：${row.mortality}隻\n目前存欄：${inventory}`;
  });
  return `${botName()}\n${details.join("\n")}`;
}

const PENDING_TTL_MS = 10 * 60 * 1000;

interface PendingActionRow {
  id: string;
  lineGroupId: string;
  lineUserId: string;
  organizationId: string;
  intent: OperationalIntent;
  quantity: number;
  unit: "隻" | "kg" | "L";
  rawMessage: string;
  rawFarmText: string | null;
  house: string | null;
  note: string | null;
  candidateFarmsJson: string;
  candidateHousesJson: string | null;
  status: "waiting_farm" | "waiting_confirmation" | "completed" | "cancelled" | "expired";
  expiresAt: string;
  sourceEventId: string;
  confirmedFarmId: string | null;
}

interface TestFarmActionRow {
  id: string;
  lineGroupId: string;
  lineUserId: string;
  organizationId: string;
  intent: "create_test_farm" | "archive_test_farm";
  farmName: string;
  farmId: string | null;
  status: "waiting_confirmation" | "completed" | "cancelled" | "expired";
  expiresAt: string;
  sourceEventId: string;
}

type FarmAdminIntent = "create_farm" | "archive_farm" | "create_test_farm" | "archive_test_farm";
type FarmAdminEnvironment = "production" | "test";
type FarmAdminStatus = "waiting_password" | "waiting_confirmation" | "completed" | "cancelled" | "expired";

interface FarmAdminActionRow {
  id: string;
  lineGroupId: string;
  lineUserId: string;
  organizationId: string;
  intent: FarmAdminIntent;
  farmName: string;
  farmId: string | null;
  environment: FarmAdminEnvironment;
  status: FarmAdminStatus;
  expiresAt: string;
  sourceEventId: string;
  cancelReason: string | null;
}

interface OperationalAdminActionRow {
  id: string;
  lineGroupId: string;
  lineUserId: string;
  organizationId: string;
  intent: "create_house" | "create_flock";
  farmId: string;
  houseId: string | null;
  houseName: string;
  batchCode: string | null;
  breed: string | null;
  chickInDate: string | null;
  initialCount: number | null;
  expectedShipmentDate: string | null;
  status: FarmAdminStatus;
  expiresAt: string;
  sourceEventId: string;
  cancelReason: string | null;
}

interface PendingHouseCandidate {
  houseId: string;
  houseName: string;
}

interface StoredCandidate extends FarmCandidate {
  farmId: string;
  farmName: string;
}

function operationLabel(intent: OperationalIntent): string {
  if (intent === "mortality") return "死亡";
  if (intent === "cull") return "淘汰";
  if (intent === "feed") return "飼料";
  if (intent === "water") return "飲水";
  return "出雞";
}

function operationQuantityText(quantity: number, unit: "隻" | "kg" | "L"): string {
  return unit === "隻" ? `${formatAmount(quantity)}隻` : `${formatAmount(quantity)} ${unit}`;
}

function candidateList(candidates: FarmCandidate[]): string {
  return candidates
    .map((candidate, index) => `${index + 1}. ${candidate.environment === "test" ? "🧪 " : ""}${candidate.farmName}`)
    .join("\n");
}

function farmDisplayName(farm: Pick<FarmRow, "name" | "environment">): string {
  return `${farm.environment === "test" ? "🧪 " : ""}${farm.name}`;
}

function operationalCandidateReply(
  draft: OperationalDraft,
  candidates: FarmCandidate[],
  accountName: string,
): string {
  const quantity = operationQuantityText(draft.quantity, draft.unit);
  if (!draft.farmText) {
    return [
      `${botName(accountName)} 要將「${operationLabel(draft.intent)} ${quantity}」記錄在哪一個雞場？`,
      candidateList(candidates),
      "請回覆名稱或編號。",
    ].join("\n");
  }
  if (candidates.length === 1) {
    return [
      `${botName(accountName)} 我找到最可能的雞場：`,
      `1. ${candidates[0].environment === "test" ? "🧪 " : ""}${candidates[0].farmName}`,
      `要將「${operationLabel(draft.intent)} ${quantity}」記錄到這一場嗎？`,
      "請回覆：1 / 是 / 否",
    ].join("\n");
  }
  return [
    `${botName(accountName)} ⚠️ 找到 ${candidates.length} 個符合「${draft.rawFarmText ?? draft.farmText}」的雞場：`,
    candidateList(candidates),
    `要將「${operationLabel(draft.intent)} ${quantity}」記錄在哪一場？`,
    "請回覆名稱或編號。",
  ].join("\n");
}

function queryCandidateReply(
  farmText: string,
  candidates: FarmCandidate[],
  accountName: string,
): string {
  return [
    `${botName(accountName)} ⚠️ 無法唯一確定「${farmText}」是哪一個雞場。`,
    candidateList(candidates),
    "請用正式雞場名稱重新查詢。",
  ].join("\n");
}

function parseStoredCandidates(value: string): StoredCandidate[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredCandidate => {
      if (typeof item !== "object" || item === null) return false;
      const record = item as Record<string, unknown>;
      return typeof record.farmId === "string" && typeof record.farmName === "string";
    });
  } catch {
    return [];
  }
}

async function redactQuietLineEventPayload(env: Env, eventId: string, event: LineEvent): Promise<void> {
  // line_events remains the idempotency ledger, not a long-lived group-chat
  // archive. Keep event identity/source metadata, while the short-lived
  // ambient_chat_buffer remains the only place that holds ordinary text.
  const redacted = event.message
    ? { ...event, message: { ...event.message, text: "[ambient-buffered]" } }
    : event;
  await env.DB.prepare(
    `UPDATE line_events SET payload_json = ? WHERE event_id = ?`,
  ).bind(JSON.stringify(redacted), eventId).run();
}

function parseStoredHouseCandidates(value: string | null): PendingHouseCandidate[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingHouseCandidate => {
      if (typeof item !== "object" || item === null) return false;
      const record = item as Record<string, unknown>;
      return typeof record.houseId === "string" && typeof record.houseName === "string";
    });
  } catch {
    return [];
  }
}

function houseCandidateList(candidates: PendingHouseCandidate[]): string {
  return candidates.map((candidate, index) => `${index + 1}. ${candidate.houseName}`).join("\n");
}

function houseOperationalCandidateReply(
  farm: Pick<FarmRow, "name" | "environment">,
  draft: OperationalDraft,
  candidates: PendingHouseCandidate[],
  accountName: string,
): string {
  return [
    `${botName(accountName)} ${farmDisplayName(farm)}目前有多個進行中雞舍：`,
    houseCandidateList(candidates),
    `要將「${operationLabel(draft.intent)} ${operationQuantityText(draft.quantity, draft.unit)}」記錄在哪一舍？`,
    "請回覆舍別名稱或編號。",
  ].join("\n");
}

async function expirePendingActions(
  env: Env,
  groupId: string,
  lineUserId: string,
  now = new Date().toISOString(),
): Promise<void> {
  await env.DB.prepare(
    `UPDATE pending_actions
        SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE line_group_id = ? AND line_user_id = ?
        AND status IN ('waiting_farm', 'waiting_confirmation')
        AND expires_at <= ?`,
  )
    .bind(groupId, lineUserId, now)
    .run();
}

async function latestPending(
  env: Env,
  groupId: string,
  lineUserId: string,
  statuses: string[] = ["waiting_farm", "waiting_confirmation"],
): Promise<PendingActionRow | null> {
  const placeholders = statuses.map(() => "?").join(", ");
  return env.DB.prepare(
    `SELECT id,
            line_group_id AS lineGroupId,
            line_user_id AS lineUserId,
            organization_id AS organizationId,
            intent, quantity, unit,
            raw_message AS rawMessage,
            raw_farm_text AS rawFarmText,
            house,
            note,
            candidate_farms_json AS candidateFarmsJson,
            candidate_houses_json AS candidateHousesJson,
            status, expires_at AS expiresAt,
            source_event_id AS sourceEventId,
            confirmed_farm_id AS confirmedFarmId
       FROM pending_actions
      WHERE line_group_id = ? AND line_user_id = ? AND status IN (${placeholders})
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
  )
    .bind(groupId, lineUserId, ...statuses)
    .first<PendingActionRow>();
}

async function hasRecentlyExpiredPending(env: Env, groupId: string, lineUserId: string): Promise<boolean> {
  const lower = new Date(Date.now() - PENDING_TTL_MS).toISOString();
  const row = await env.DB.prepare(
    `SELECT id FROM pending_actions
      WHERE line_group_id = ? AND line_user_id = ?
        AND status = 'expired' AND expires_at > ?
      ORDER BY updated_at DESC, id DESC LIMIT 1`,
  )
    .bind(groupId, lineUserId, lower)
    .first<{ id: string }>();
  return Boolean(row);
}

function testFarmNameError(value: string): string | null {
  const name = normalize(value);
  const length = Array.from(name).length;
  if (!name) return "名稱不可為空白。";
  if (length < 2 || length > 40) return "名稱長度必須介於 2 到 40 個字元。";
  if (/[\u0000-\u001F\u007F]/u.test(name)) return "名稱含有不允許的控制字元。";
  if (/^(?:test|production|prod|正式|正式雞場|測試|測試場|雞場列表|大富翁盈虧)$/iu.test(name)) {
    return "這個名稱是保留字，請改用明確的測試雞場名稱。";
  }
  return null;
}

function testFarmCreateConfirmation(accountName: string, farmName: string): string {
  return [
    `${botName(accountName)} 🧪 即將建立測試雞場`,
    `名稱：${farmName}`,
    "類型：TEST",
    "此雞場：",
    "• 不納入投資持股",
    "• 不納入財務盈虧",
    "• 僅供營運功能測試",
    "請回覆：確認 / 取消",
  ].join("\n");
}

function testFarmArchiveConfirmation(accountName: string, farmName: string): string {
  return [
    `${botName(accountName)} ⚠️ 即將封存測試雞場：`,
    farmDisplayName({ name: farmName, environment: "test" }),
    "封存後：",
      "• 不再出現在一般待確認資料",
    "• 歷史測試事件仍保留",
    "請回覆：確認封存 / 取消",
  ].join("\n");
}

function testFarmCreateUsageReply(accountName: string): string {
  return [
    `${botName(accountName)} ⚠️ 請提供測試雞場名稱。`,
    "例如：",
    "新增測試場 金雞測試場",
  ].join("\n");
}

function testFarmArchiveUsageReply(accountName: string): string {
  return [
    `${botName(accountName)} ⚠️ 請提供要封存的測試雞場名稱。`,
    "例如：",
    "封存測試場 金雞測試場",
  ].join("\n");
}

async function expireTestFarmActions(
  env: Env,
  groupId: string,
  lineUserId: string,
  now = new Date().toISOString(),
): Promise<void> {
  await env.DB.prepare(
    `UPDATE test_farm_actions
        SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE line_group_id = ? AND line_user_id = ?
        AND status = 'waiting_confirmation' AND expires_at <= ?`,
  )
    .bind(groupId, lineUserId, now)
    .run();
}

async function expireFarmAdminActions(
  env: Env,
  groupId: string,
  lineUserId: string,
  now = new Date().toISOString(),
): Promise<void> {
  await env.DB.prepare(
    `UPDATE farm_admin_actions
        SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE line_group_id = ? AND line_user_id = ?
        AND status IN ('waiting_password', 'waiting_confirmation')
        AND expires_at <= ?`,
  )
    .bind(groupId, lineUserId, now)
    .run();
  await expireOperationalAdminActions(env, groupId, lineUserId, now);
}

async function cancelScopedPendingActions(
  env: Env,
  groupId: string,
  lineUserId: string,
  reason: "user_cancelled" | "superseded_by_new_command" = "superseded_by_new_command",
): Promise<boolean> {
  await expirePendingActions(env, groupId, lineUserId);
  await expireTestFarmActions(env, groupId, lineUserId);
  await expireFarmAdminActions(env, groupId, lineUserId);
  const active = await env.DB.prepare(
    `SELECT (
        (SELECT COUNT(*) FROM pending_actions
          WHERE line_group_id = ? AND line_user_id = ?
            AND status IN ('waiting_farm', 'waiting_confirmation'))
        +
        (SELECT COUNT(*) FROM test_farm_actions
          WHERE line_group_id = ? AND line_user_id = ?
            AND status = 'waiting_confirmation')
        +
        (SELECT COUNT(*) FROM farm_admin_actions
          WHERE line_group_id = ? AND line_user_id = ?
          AND status IN ('waiting_password', 'waiting_confirmation'))
        +
        (SELECT COUNT(*) FROM operational_admin_actions
          WHERE line_group_id = ? AND line_user_id = ?
          AND status IN ('waiting_password', 'waiting_confirmation'))
        +
        (SELECT COUNT(*) FROM abnormal_pending_actions
          WHERE line_group_id = ? AND line_user_id = ?
          AND status IN ('waiting_farm', 'waiting_house'))
      ) AS count`,
  )
    .bind(groupId, lineUserId, groupId, lineUserId, groupId, lineUserId, groupId, lineUserId, groupId, lineUserId)
    .first<{ count: number }>();
  if (!active?.count) return false;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE pending_actions
          SET status = 'cancelled', cancel_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE line_group_id = ? AND line_user_id = ?
          AND status IN ('waiting_farm', 'waiting_confirmation')`,
    ).bind(reason, groupId, lineUserId),
    env.DB.prepare(
      `UPDATE test_farm_actions
          SET status = 'cancelled', cancel_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE line_group_id = ? AND line_user_id = ?
          AND status = 'waiting_confirmation'`,
    ).bind(reason, groupId, lineUserId),
    env.DB.prepare(
      `UPDATE farm_admin_actions
          SET status = 'cancelled', cancel_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE line_group_id = ? AND line_user_id = ?
          AND status IN ('waiting_password', 'waiting_confirmation')`,
    ).bind(reason, groupId, lineUserId),
    env.DB.prepare(
      `UPDATE operational_admin_actions
          SET status = 'cancelled', cancel_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE line_group_id = ? AND line_user_id = ?
          AND status IN ('waiting_password', 'waiting_confirmation')`,
    ).bind(reason, groupId, lineUserId),
    env.DB.prepare(
      `UPDATE abnormal_pending_actions
          SET status = 'cancelled', cancel_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE line_group_id = ? AND line_user_id = ?
          AND status IN ('waiting_farm', 'waiting_house')`,
    ).bind(reason, groupId, lineUserId),
  ]);
  return true;
}

async function latestTestFarmAction(
  env: Env,
  groupId: string,
  lineUserId: string,
): Promise<TestFarmActionRow | null> {
  return env.DB.prepare(
    `SELECT id,
            line_group_id AS lineGroupId,
            line_user_id AS lineUserId,
            organization_id AS organizationId,
            intent, farm_name AS farmName, farm_id AS farmId,
            status, expires_at AS expiresAt,
            source_event_id AS sourceEventId
       FROM test_farm_actions
      WHERE line_group_id = ? AND line_user_id = ? AND status = 'waiting_confirmation'
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
  )
    .bind(groupId, lineUserId)
    .first<TestFarmActionRow>();
}

async function hasRecentlyExpiredTestFarmAction(
  env: Env,
  groupId: string,
  lineUserId: string,
): Promise<boolean> {
  const lower = new Date(Date.now() - PENDING_TTL_MS).toISOString();
  const row = await env.DB.prepare(
    `SELECT id FROM test_farm_actions
      WHERE line_group_id = ? AND line_user_id = ?
        AND status = 'expired' AND expires_at > ?
      ORDER BY updated_at DESC, id DESC LIMIT 1`,
  )
    .bind(groupId, lineUserId, lower)
    .first<{ id: string }>();
  return Boolean(row);
}

function farmAdminNeedsPasswordReply(accountName: string): string {
  return `${botName(accountName)}\n🔐 此操作需要管理權限。\n請輸入管理密碼。`;
}

function farmAdminConfirmation(accountName: string, intent: FarmAdminIntent, farmName: string, environment: FarmAdminEnvironment): string {
  const isCreate = intent === "create_farm" || intent === "create_test_farm";
  const isTest = environment === "test";
  if (isCreate) {
    return [
      `${botName(accountName)} ${isTest ? "🧪" : "🏭"} 即將建立${isTest ? "測試" : "正式"}雞場`,
      `名稱：${farmName}`,
      `類型：${isTest ? "測試雞場" : "正式雞場"}`,
      isTest ? "此雞場不納入投資持股與財務盈虧。" : "不會自動建立持股、盈虧、flock 或 house 主檔。",
      "請回覆：確認 / 取消",
    ].join("\n");
  }
  return [
    `${botName(accountName)} ⚠️ 即將封存${isTest ? "測試" : "正式"}雞場：`,
    farmDisplayName({ name: farmName, environment }),
    "封存只會停用此雞場，不會刪除營運、財務或 audit history。",
    "請回覆：確認封存 / 取消",
  ].join("\n");
}

function farmAdminCreateUsageReply(accountName: string): string {
  return `${botName(accountName)} ⚠️ 請提供要建立的雞場名稱。\n例如：\n新增養雞場 大仁新場`;
}

function farmAdminArchiveUsageReply(accountName: string): string {
  return `${botName(accountName)} ⚠️ 請提供要封存的雞場名稱。\n例如：\n封存養雞場 大仁新場`;
}

async function existingFarmByNormalizedName(
  env: Env,
  organizationId: string,
  name: string,
): Promise<{ id: string; name: string; active: number; environment: FarmAdminEnvironment } | null> {
  const rows = await env.DB.prepare(
    `SELECT id, name, active, environment
       FROM farms WHERE organization_id = ? ORDER BY id`,
  )
    .bind(organizationId)
    .all<{ id: string; name: string; active: number; environment: FarmAdminEnvironment }>();
  const key = normalizedFarmKey(name);
  return rows.results.find((row) => normalizedFarmKey(row.name) === key) ?? null;
}

async function latestFarmAdminAction(
  env: Env,
  groupId: string,
  lineUserId: string,
  statuses: FarmAdminStatus[] = ["waiting_password", "waiting_confirmation"],
): Promise<FarmAdminActionRow | null> {
  const placeholders = statuses.map(() => "?").join(", ");
  return env.DB.prepare(
    `SELECT id,
            line_group_id AS lineGroupId,
            line_user_id AS lineUserId,
            organization_id AS organizationId,
            intent,
            farm_name AS farmName,
            farm_id AS farmId,
            environment,
            status,
            expires_at AS expiresAt,
            source_event_id AS sourceEventId,
            cancel_reason AS cancelReason
       FROM farm_admin_actions
      WHERE line_group_id = ? AND line_user_id = ? AND status IN (${placeholders})
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
  )
    .bind(groupId, lineUserId, ...statuses)
    .first<FarmAdminActionRow>();
}

async function expireOperationalAdminActions(
  env: Env,
  groupId: string,
  lineUserId: string,
  now = new Date().toISOString(),
): Promise<void> {
  await env.DB.prepare(
    `UPDATE operational_admin_actions
        SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE line_group_id = ? AND line_user_id = ?
        AND status IN ('waiting_password', 'waiting_confirmation')
        AND expires_at <= ?`,
  )
    .bind(groupId, lineUserId, now)
    .run();
}

async function latestOperationalAdminAction(
  env: Env,
  groupId: string,
  lineUserId: string,
  statuses: FarmAdminStatus[] = ["waiting_password", "waiting_confirmation"],
): Promise<OperationalAdminActionRow | null> {
  const placeholders = statuses.map(() => "?").join(", ");
  return env.DB.prepare(
    `SELECT id,
            line_group_id AS lineGroupId,
            line_user_id AS lineUserId,
            organization_id AS organizationId,
            intent,
            farm_id AS farmId,
            house_id AS houseId,
            house_name AS houseName,
            batch_code AS batchCode,
            breed,
            chick_in_date AS chickInDate,
            initial_count AS initialCount,
            expected_shipment_date AS expectedShipmentDate,
            status,
            expires_at AS expiresAt,
            source_event_id AS sourceEventId,
            cancel_reason AS cancelReason
       FROM operational_admin_actions
      WHERE line_group_id = ? AND line_user_id = ? AND status IN (${placeholders})
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
  )
    .bind(groupId, lineUserId, ...statuses)
    .first<OperationalAdminActionRow>();
}

function operationalAdminConfirmation(accountName: string, action: OperationalAdminActionRow, farm: FarmRow): string {
  if (action.intent === "create_house") {
    return [
      `${botName(accountName)} 即將建立雞舍`,
      `${farmDisplayName(farm)}｜${action.houseName}`,
      "請回覆：確認 / 取消",
    ].join("\n");
  }
  return [
    `${botName(accountName)} 🐣 即將建立新批次`,
    `雞場：${farmDisplayName(farm)}`,
    `雞舍：${action.houseName}`,
    `批次：${action.batchCode ?? ""}`,
    `入雛日期：${action.chickInDate ?? ""}`,
    `入雛數：${Number(action.initialCount ?? 0).toLocaleString()}隻`,
    action.expectedShipmentDate ? `預計出雞：${action.expectedShipmentDate}` : "預計出雞：未設定",
    "請回覆：確認 / 取消",
  ].join("\n");
}

async function startOperationalAdminAction(
  env: Env,
  event: LineEvent,
  eventId: string,
  groupId: string,
  organizationId: string,
  command: Extract<ParsedCommand, { kind: "create_house" | "create_flock" }>,
  accountName: string,
): Promise<string> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return safeRejectionReply(accountName);
  const resolver = await loadFarmResolver(env, organizationId);
  const resolution = resolver.resolve(command.farmName);
  if (resolution.kind !== "direct" || !resolution.farm) {
    return resolution.kind === "candidates"
      ? `${botName(accountName)}\n⚠️ 無法安全唯一確定雞場：\n${candidateList(resolution.candidates)}\n請回覆正式雞場名稱。`
      : safeRejectionReply(accountName);
  }
  const farm = await validateOperationalFarm(env, organizationId, resolution.farm.id);
  if (!farm) return safeRejectionReply(accountName);
  const houseName = normalizedHouseName(command.houseName);
  if (!/^(?:[\p{L}\p{N}_-]{1,18})舍$/u.test(houseName)) {
    return `${botName(accountName)}\n⚠️ 雞舍名稱必須是有效舍別，例如 3舍、A舍或育雛舍。`;
  }

  let houseId: string | null = null;
  let batchCode: string | null = null;
  let chickInDate: string | null = null;
  let initialCount: number | null = null;
  let expectedShipmentDate: string | null = null;
  if (command.kind === "create_house") {
    const duplicate = await env.DB.prepare(
      `SELECT id, name, active FROM houses
        WHERE farm_id = ? AND normalized_name = ? LIMIT 1`,
    ).bind(farm.id, houseName).first<{ id: string; name: string; active: number }>();
    if (duplicate) return `${botName(accountName)}\n⚠️ ${farmDisplayName(farm)} 已存在舍別：${duplicate.name}（${duplicate.active ? "啟用中" : "已封存"}），不建立 duplicate。`;
  } else {
    const house = await env.DB.prepare(
      `SELECT id, name FROM houses
        WHERE farm_id = ? AND active = 1
          AND (normalized_name = ? OR name = ?) LIMIT 1`,
    ).bind(farm.id, houseName, command.houseName).first<{ id: string; name: string }>();
    if (!house) return `${botName(accountName)}\n⚠️ ${farmDisplayName(farm)} 尚未建立 ${command.houseName} 雞舍主檔，請先建立雞舍。`;
    houseId = house.id;
    batchCode = normalize(command.batchCode);
    chickInDate = command.chickInDate;
    initialCount = command.initialCount;
    expectedShipmentDate = command.expectedShipmentDate ?? null;
    if (!batchCode || batchCode.length > 60 || /[\u0000-\u001F\u007F]/u.test(batchCode) || !isIsoDate(chickInDate)) {
      return `${botName(accountName)}\n⚠️ 批次資料無效，請提供有效入雛日期與批次代碼。`;
    }
    if (expectedShipmentDate && (!isIsoDate(expectedShipmentDate) || expectedShipmentDate < chickInDate)) {
      return `${botName(accountName)}\n⚠️ 預計出雞日期不可早於入雛日期。`;
    }
    const duplicate = await env.DB.prepare(
      `SELECT id FROM flocks WHERE farm_id = ? AND batch_code = ? LIMIT 1`,
    ).bind(farm.id, batchCode).first<{ id: string }>();
    if (duplicate) return `${botName(accountName)}\n⚠️ ${farmDisplayName(farm)} 已存在批次 ${batchCode}，不建立 duplicate。`;
  }

  const previous = await env.DB.prepare(
    `SELECT id, status FROM operational_admin_actions WHERE source_event_id = ? LIMIT 1`,
  ).bind(eventId).first<{ id: string; status: FarmAdminStatus }>();
  if (previous?.status === "completed") return `${botName(accountName)}\n✅ 上一筆主檔操作已完成，沒有重複寫入。`;
  if (previous) {
    const existing = await latestOperationalAdminAction(env, groupId, lineUserId);
    return existing ? operationalAdminConfirmation(accountName, existing, farm) : safeRejectionReply(accountName);
  }

  const session = await activeAdminSession(env, groupId, lineUserId);
  const actionId = `operational-admin-action-${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT INTO operational_admin_actions
      (id, line_group_id, line_user_id, organization_id, intent, farm_id, house_id,
       house_name, batch_code, chick_in_date, initial_count, expected_shipment_date,
       status, expires_at, source_event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      actionId,
      groupId,
      lineUserId,
      organizationId,
      command.kind,
      farm.id,
      houseId,
      houseName,
      batchCode,
      chickInDate,
      initialCount,
      expectedShipmentDate,
      session ? "waiting_confirmation" : "waiting_password",
      new Date(Date.now() + PENDING_TTL_MS).toISOString(),
      eventId,
    )
    .run();
  const action = await latestOperationalAdminAction(env, groupId, lineUserId);
  if (!action) return safeRejectionReply(accountName);
  return session ? operationalAdminConfirmation(accountName, action, farm) : farmAdminNeedsPasswordReply(accountName);
}

async function completeOperationalAdminAction(
  env: Env,
  action: OperationalAdminActionRow,
  accountName: string,
): Promise<string> {
  const now = new Date().toISOString();
  if (action.status === "completed") return `${botName(accountName)}\n✅ 上一筆主檔操作已完成，沒有重複寫入。`;
  if (action.status !== "waiting_confirmation" || action.expiresAt <= now) {
    if (action.status === "waiting_confirmation") {
      await env.DB.prepare(
        `UPDATE operational_admin_actions SET status = 'expired', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND line_group_id = ? AND line_user_id = ? AND status = 'waiting_confirmation'`,
      ).bind(action.id, action.lineGroupId, action.lineUserId).run();
    }
    return `${botName(accountName)}\n⚠️ 上一筆待確認主檔操作已逾時，請重新輸入完整指令。`;
  }
  const farm = await env.DB.prepare(
    `SELECT id, name, active, environment FROM farms
      WHERE id = ? AND organization_id = ? AND active = 1 LIMIT 1`,
  ).bind(action.farmId, action.organizationId).first<FarmRow>();
  if (!farm) return safeRejectionReply(accountName);

  if (action.intent === "create_house") {
    const duplicate = await env.DB.prepare(
      `SELECT id, name FROM houses WHERE farm_id = ? AND normalized_name = ? LIMIT 1`,
    ).bind(action.farmId, normalizedHouseName(action.houseName)).first<{ id: string; name: string }>();
    if (duplicate) {
      await env.DB.prepare(
        `UPDATE operational_admin_actions SET status = 'cancelled', cancel_reason = 'duplicate_house', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'waiting_confirmation'`,
      ).bind(action.id).run();
      return `${botName(accountName)}\n⚠️ 已存在舍別 ${duplicate.name}，不建立 duplicate。`;
    }
    const houseId = `house-${action.id}`;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO houses (id, farm_id, name, normalized_name, active)
       VALUES (?, ?, ?, ?, 1)`,
    ).bind(houseId, action.farmId, action.houseName, normalizedHouseName(action.houseName)).run();
    await env.DB.prepare(
      `UPDATE operational_admin_actions SET status = 'completed', house_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND line_group_id = ? AND line_user_id = ?
          AND status = 'waiting_confirmation' AND expires_at > ?`,
    ).bind(houseId, action.id, action.lineGroupId, action.lineUserId, now).run();
    const completed = await env.DB.prepare(
      `SELECT status FROM operational_admin_actions WHERE id = ? LIMIT 1`,
    ).bind(action.id).first<{ status: FarmAdminStatus }>();
    if (completed?.status !== "completed") return safeRejectionReply(accountName);
    await writeAuditLog(env, {
      organizationId: action.organizationId,
      source: "line",
      actorType: "line_user",
      actorId: action.lineUserId,
      action: "create",
      entityType: "house",
      entityId: houseId,
      after: { farmId: action.farmId, name: action.houseName },
      requestId: action.sourceEventId,
    });
    return `${botName(accountName)}\n✅ 雞舍建立成功\n${farmDisplayName(farm)}｜${action.houseName}`;
  }

  if (!action.houseId || !action.batchCode || !action.chickInDate || !action.initialCount) return safeRejectionReply(accountName);
  const house = await env.DB.prepare(
    `SELECT id, name FROM houses WHERE id = ? AND farm_id = ? AND active = 1 LIMIT 1`,
  ).bind(action.houseId, action.farmId).first<{ id: string; name: string }>();
  if (!house) return safeRejectionReply(accountName);
  const duplicate = await env.DB.prepare(
    `SELECT id FROM flocks WHERE farm_id = ? AND batch_code = ? LIMIT 1`,
  ).bind(action.farmId, action.batchCode).first<{ id: string }>();
  if (duplicate) {
    await env.DB.prepare(
      `UPDATE operational_admin_actions SET status = 'cancelled', cancel_reason = 'duplicate_flock', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'waiting_confirmation'`,
    ).bind(action.id).run();
    return `${botName(accountName)}\n⚠️ 已存在批次 ${action.batchCode}，不建立 duplicate。`;
  }
  const flockId = `flock-${action.id}`;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO flocks
      (id, farm_id, house_id, batch_code, breed, chick_in_date, initial_count, expected_shipment_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
  ).bind(flockId, action.farmId, action.houseId, action.batchCode, action.breed, action.chickInDate, action.initialCount, action.expectedShipmentDate).run();
  await env.DB.prepare(
    `UPDATE operational_admin_actions SET status = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND line_group_id = ? AND line_user_id = ?
        AND status = 'waiting_confirmation' AND expires_at > ?`,
  ).bind(action.id, action.lineGroupId, action.lineUserId, now).run();
  const completed = await env.DB.prepare(
    `SELECT status FROM operational_admin_actions WHERE id = ? LIMIT 1`,
  ).bind(action.id).first<{ status: FarmAdminStatus }>();
  if (completed?.status !== "completed") return safeRejectionReply(accountName);
  await writeAuditLog(env, {
    organizationId: action.organizationId,
    source: "line",
    actorType: "line_user",
    actorId: action.lineUserId,
    action: "create",
    entityType: "flock",
    entityId: flockId,
    after: {
      farmId: action.farmId,
      houseId: action.houseId,
      batchCode: action.batchCode,
      chickInDate: action.chickInDate,
      initialCount: action.initialCount,
      expectedShipmentDate: action.expectedShipmentDate,
    },
    requestId: action.sourceEventId,
  });
  return `${botName(accountName)}\n✅ 批次建立成功\n${farmDisplayName(farm)}｜${house.name}｜${action.batchCode}`;
}

async function activeAdminSession(
  env: Env,
  groupId: string,
  lineUserId: string,
  now = new Date().toISOString(),
): Promise<{ id: string; expiresAt: string } | null> {
  return env.DB.prepare(
    `SELECT id, expires_at AS expiresAt
       FROM admin_sessions
      WHERE line_group_id = ? AND line_user_id = ? AND expires_at > ?
      ORDER BY expires_at DESC, id DESC
      LIMIT 1`,
  )
    .bind(groupId, lineUserId, now)
    .first<{ id: string; expiresAt: string }>();
}

async function startFarmAdminAction(
  env: Env,
  event: LineEvent,
  eventId: string,
  groupId: string,
  organizationId: string,
  intent: FarmAdminIntent,
  requestedName: string,
  accountName: string,
): Promise<string> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return safeRejectionReply(accountName);
  const farmName = normalize(requestedName);
  const nameError = testFarmNameError(farmName);
  if (nameError) return `${botName(accountName)}\n⚠️ 無法執行雞場管理操作：${nameError}`;
  const environment: FarmAdminEnvironment = intent.endsWith("test_farm") ? "test" : "production";

  if (intent.startsWith("create_")) {
    const existing = await existingFarmByNormalizedName(env, organizationId, farmName);
    if (existing) {
      return `${botName(accountName)}\n⚠️ 已存在同名雞場：${farmDisplayName(existing)}。不建立 duplicate。`;
    }
  } else {
    const resolver = await loadFarmResolver(env, organizationId);
    const resolution = resolver.resolve(farmName);
    if (resolution.kind === "candidates") {
      return `${botName(accountName)}\n⚠️ 無法安全唯一確定要封存的雞場：\n${candidateList(resolution.candidates)}\n請回覆正式雞場名稱。`;
    }
    if (resolution.kind !== "direct" || !resolution.farm) {
      return `${botName(accountName)}\n⚠️ 找不到可封存的雞場：${farmName}。`;
    }
    const farm = await validateOperationalFarm(env, organizationId, resolution.farm.id);
    if (!farm) return safeRejectionReply(accountName);
    if (farm.environment !== environment) {
      return `${botName(accountName)}\n⚠️ 此指令只允許封存${environment === "test" ? "測試" : "正式"}雞場。`;
    }
    if (farm.active === 0) return `${botName(accountName)}\n⚠️ ${farmDisplayName(farm)} 已經封存。`;
  }

  const previous = await env.DB.prepare(
    `SELECT id, status FROM farm_admin_actions WHERE source_event_id = ? LIMIT 1`,
  )
    .bind(eventId)
    .first<{ id: string; status: FarmAdminStatus }>();
  if (previous?.status === "completed") {
    return `${botName(accountName)}\n✅ 上一筆雞場管理操作已完成，沒有重複修改。`;
  }
  if (previous) {
    const existingAction = await latestFarmAdminAction(env, groupId, lineUserId, ["waiting_password", "waiting_confirmation"]);
    if (existingAction?.id === previous.id) {
      return existingAction.status === "waiting_password"
        ? farmAdminNeedsPasswordReply(accountName)
        : farmAdminConfirmation(accountName, existingAction.intent, existingAction.farmName, existingAction.environment);
    }
  }

  const session = await activeAdminSession(env, groupId, lineUserId);
  const actionId = `farm-admin-action-${crypto.randomUUID()}`;
  const status: FarmAdminStatus = session ? "waiting_confirmation" : "waiting_password";
  const farmId = intent.startsWith("archive_") ? (await loadFarmResolver(env, organizationId)).resolve(farmName).farm?.id ?? null : null;
  await env.DB.prepare(
    `INSERT INTO farm_admin_actions
      (id, line_group_id, line_user_id, organization_id, intent, farm_name, farm_id,
       environment, status, expires_at, source_event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      actionId,
      groupId,
      lineUserId,
      organizationId,
      intent,
      farmName,
      farmId,
      environment,
      status,
      new Date(Date.now() + PENDING_TTL_MS).toISOString(),
      eventId,
    )
    .run();
  return status === "waiting_password"
    ? farmAdminNeedsPasswordReply(accountName)
    : farmAdminConfirmation(accountName, intent, farmName, environment);
}

async function adminAuthAttemptState(
  env: Env,
  groupId: string,
  lineUserId: string,
): Promise<{ failedCount: number; lockedUntil: string | null } | null> {
  return env.DB.prepare(
    `SELECT failed_count AS failedCount, locked_until AS lockedUntil
       FROM admin_auth_attempts WHERE line_group_id = ? AND line_user_id = ? LIMIT 1`,
  )
    .bind(groupId, lineUserId)
    .first<{ failedCount: number; lockedUntil: string | null }>();
}

async function handleFarmAdminPasswordInput(
  env: Env,
  event: LineEvent,
  groupId: string,
  accountName: string,
): Promise<string | null> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return null;
  await expireFarmAdminActions(env, groupId, lineUserId);
  const action = await latestFarmAdminAction(env, groupId, lineUserId, ["waiting_password"]);
  const operationalAction = action ? null : await latestOperationalAdminAction(env, groupId, lineUserId, ["waiting_password"]);
  if (!action && !operationalAction) return null;
  const now = new Date().toISOString();
  const attempts = await adminAuthAttemptState(env, groupId, lineUserId);
  if (attempts?.lockedUntil && attempts.lockedUntil > now) {
    return `${botName(accountName)}\n🔒 管理驗證失敗次數過多，請稍後再試。`;
  }
  const password = event.message?.text ?? "";
  const valid = await verifyAdminPassword(password, env.FARM_ADMIN_PASSWORD_HASH);
  if (!valid) {
    const next = nextAdminFailureState(attempts, now);
    const failedCount = next.failedCount;
    const lockedUntil = next.lockedUntil;
    await env.DB.prepare(
      `INSERT INTO admin_auth_attempts (line_group_id, line_user_id, failed_count, locked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(line_group_id, line_user_id) DO UPDATE SET
         failed_count = excluded.failed_count,
         locked_until = excluded.locked_until,
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(groupId, lineUserId, failedCount, lockedUntil)
      .run();
    return lockedUntil
      ? `${botName(accountName)}\n🔒 管理驗證失敗次數過多，請稍後再試。`
      : `${botName(accountName)}\n❌ 管理密碼錯誤。`;
  }

  const sessionId = `admin-session-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO admin_auth_attempts (line_group_id, line_user_id, failed_count, locked_until)
       VALUES (?, ?, 0, NULL)
       ON CONFLICT(line_group_id, line_user_id) DO UPDATE SET
         failed_count = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP`,
    ).bind(groupId, lineUserId),
    env.DB.prepare(
      `INSERT INTO admin_sessions (id, line_group_id, line_user_id, expires_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(sessionId, groupId, lineUserId, expiresAt),
    env.DB.prepare(
      `UPDATE farm_admin_actions
          SET status = 'waiting_confirmation', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND line_group_id = ? AND line_user_id = ?
          AND status = 'waiting_password' AND expires_at > ?`,
    ).bind(action?.id ?? "", groupId, lineUserId, now),
    env.DB.prepare(
      `UPDATE operational_admin_actions
          SET status = 'waiting_confirmation', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND line_group_id = ? AND line_user_id = ?
          AND status = 'waiting_password' AND expires_at > ?`,
    ).bind(operationalAction?.id ?? "", groupId, lineUserId, now),
  ]);
  if (action) {
    const refreshed = await latestFarmAdminAction(env, groupId, lineUserId, ["waiting_confirmation"]);
    if (!refreshed) return `${botName(accountName)}\n⚠️ 管理操作已逾時，請重新輸入完整指令。`;
    return [
      `${botName(accountName)}\n✅ 管理身份驗證成功。`,
      farmAdminConfirmation(accountName, refreshed.intent, refreshed.farmName, refreshed.environment),
    ].join("\n");
  }
  const refreshed = await latestOperationalAdminAction(env, groupId, lineUserId, ["waiting_confirmation"]);
  if (!refreshed) return `${botName(accountName)}\n⚠️ 管理操作已逾時，請重新輸入完整指令。`;
  const farm = await env.DB.prepare(
    `SELECT id, name, active, environment FROM farms
      WHERE id = ? AND organization_id = ? LIMIT 1`,
  ).bind(refreshed.farmId, refreshed.organizationId).first<FarmRow>();
  if (!farm) return safeRejectionReply(accountName);
  return [
    `${botName(accountName)}\n✅ 管理身份驗證成功。`,
    operationalAdminConfirmation(accountName, refreshed, farm),
  ].join("\n");
}

async function completeFarmAdminAction(
  env: Env,
  action: FarmAdminActionRow,
  accountName: string,
): Promise<string> {
  const now = new Date().toISOString();
  if (action.status === "completed") return `${botName(accountName)}\n✅ 上一筆雞場管理操作已完成，沒有重複修改。`;
  if (action.status !== "waiting_confirmation" || action.expiresAt <= now) {
    if (action.status === "waiting_confirmation") {
      await env.DB.prepare(
        `UPDATE farm_admin_actions SET status = 'expired', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND line_group_id = ? AND line_user_id = ? AND status = 'waiting_confirmation'`,
      ).bind(action.id, action.lineGroupId, action.lineUserId).run();
    }
    return `${botName(accountName)}\n⚠️ 上一筆待確認雞場管理操作已逾時，請重新輸入完整指令。`;
  }

  if (action.intent === "create_farm" || action.intent === "create_test_farm") {
    const duplicate = await existingFarmByNormalizedName(env, action.organizationId, action.farmName);
    if (duplicate) {
      await env.DB.prepare(
        `UPDATE farm_admin_actions SET status = 'cancelled', cancel_reason = 'duplicate_farm', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'waiting_confirmation'`,
      ).bind(action.id).run();
      return `${botName(accountName)}\n⚠️ 已存在同名雞場：${farmDisplayName(duplicate)}。不建立 duplicate。`;
    }
    const farmId = `farm-admin-${action.id}`;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO farms
        (id, organization_id, name, active, environment, farm_total_equity_fraction, player_group_equity_fraction)
       VALUES (?, ?, ?, 1, ?, 0, 0)`,
    )
      .bind(farmId, action.organizationId, action.farmName, action.environment)
      .run();
    const created = await env.DB.prepare(
      `SELECT id, name, active, environment FROM farms
        WHERE id = ? AND organization_id = ? AND active = 1 LIMIT 1`,
    ).bind(farmId, action.organizationId).first<FarmRow>();
    if (!created || created.environment !== action.environment) return safeRejectionReply(accountName);
    await env.DB.prepare(
      `UPDATE farm_admin_actions
          SET status = 'completed', farm_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND line_group_id = ? AND line_user_id = ?
          AND status = 'waiting_confirmation' AND expires_at > ?`,
    ).bind(farmId, action.id, action.lineGroupId, action.lineUserId, now).run();
    const updated = await env.DB.prepare(
      `SELECT status FROM farm_admin_actions WHERE id = ? LIMIT 1`,
    ).bind(action.id).first<{ status: FarmAdminStatus }>();
    if (updated?.status !== "completed") return safeRejectionReply(accountName);
    await writeAuditLog(env, {
      organizationId: action.organizationId,
      source: "line",
      actorType: "line_user",
      actorId: action.lineUserId,
      action: "create",
      entityType: "farm",
      entityId: farmId,
      after: { id: farmId, name: created.name, environment: created.environment },
      requestId: action.sourceEventId,
    });
    return `${botName(accountName)}\n✅ ${action.environment === "test" ? "測試" : "正式"}雞場建立成功\n${farmDisplayName(created)}｜${action.environment === "test" ? "測試雞場" : "正式雞場"}`;
  }

  if (!action.farmId) return safeRejectionReply(accountName);
  const farm = await env.DB.prepare(
    `SELECT id, name, active, environment FROM farms
      WHERE id = ? AND organization_id = ? LIMIT 1`,
  ).bind(action.farmId, action.organizationId).first<FarmRow>();
  if (!farm || farm.environment !== action.environment) return safeRejectionReply(accountName);
  if (farm.active === 1) {
    await env.DB.prepare(
      `UPDATE farms SET active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND organization_id = ? AND environment = ? AND active = 1`,
    ).bind(action.farmId, action.organizationId, action.environment).run();
  }
  await env.DB.prepare(
    `UPDATE farm_admin_actions
        SET status = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND line_group_id = ? AND line_user_id = ?
        AND status = 'waiting_confirmation' AND expires_at > ?`,
  ).bind(action.id, action.lineGroupId, action.lineUserId, now).run();
  const updated = await env.DB.prepare(
    `SELECT status FROM farm_admin_actions WHERE id = ? LIMIT 1`,
  ).bind(action.id).first<{ status: FarmAdminStatus }>();
  if (updated?.status !== "completed") return safeRejectionReply(accountName);
  await writeAuditLog(env, {
    organizationId: action.organizationId,
    source: "line",
    actorType: "line_user",
    actorId: action.lineUserId,
    action: "archive",
    entityType: "farm",
    entityId: action.farmId,
    before: { id: farm.id, name: farm.name, active: true, environment: farm.environment },
    after: { id: farm.id, name: farm.name, active: false, environment: farm.environment },
    requestId: action.sourceEventId,
  });
  return `${botName(accountName)}\n✅ ${action.environment === "test" ? "測試" : "正式"}雞場已封存\n${farmDisplayName(farm)}`;
}

async function handleFarmAdminPendingInput(
  env: Env,
  event: LineEvent,
  text: string,
  groupId: string,
  accountName: string,
): Promise<string | null> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return null;
  await expireFarmAdminActions(env, groupId, lineUserId);
  const action = await latestFarmAdminAction(env, groupId, lineUserId, ["waiting_confirmation"]);
  const operationalAction = action ? null : await latestOperationalAdminAction(env, groupId, lineUserId, ["waiting_confirmation"]);
  if (!action && !operationalAction) return null;
  const normalized = normalize(text);
  if (/^(?:取消|不要|算了|否|不是)$/iu.test(normalized)) {
    if (action) {
      await env.DB.prepare(
        `UPDATE farm_admin_actions
            SET status = 'cancelled', cancel_reason = 'user_cancelled', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND line_group_id = ? AND line_user_id = ? AND status = 'waiting_confirmation'`,
      ).bind(action.id, groupId, lineUserId).run();
    } else {
      await env.DB.prepare(
        `UPDATE operational_admin_actions
            SET status = 'cancelled', cancel_reason = 'user_cancelled', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND line_group_id = ? AND line_user_id = ? AND status = 'waiting_confirmation'`,
      ).bind(operationalAction?.id ?? "", groupId, lineUserId).run();
    }
    return `${botName(accountName)}\n✅ 已取消上一筆雞場管理操作。`;
  }
  const confirmed = action
    ? (action.intent.startsWith("archive_")
      ? /^(?:確認封存|確認|確定)$/iu.test(normalized)
      : /^(?:確認|確定)$/iu.test(normalized))
    : /^(?:確認|確定)$/iu.test(normalized);
  if (!confirmed) return null;
  return action
    ? completeFarmAdminAction(env, action, accountName)
    : completeOperationalAdminAction(env, operationalAction!, accountName);
}

async function existingFarmByName(
  env: Env,
  organizationId: string,
  name: string,
): Promise<{ id: string; name: string; active: number; environment: "production" | "test" } | null> {
  return env.DB.prepare(
    `SELECT id, name, active, environment
       FROM farms
      WHERE organization_id = ? AND name = ?
      LIMIT 1`,
  )
    .bind(organizationId, normalize(name))
    .first<{ id: string; name: string; active: number; environment: "production" | "test" }>();
}

async function createTestFarmPendingAction(
  env: Env,
  event: LineEvent,
  eventId: string,
  groupId: string,
  organizationId: string,
  requestedName: string,
  accountName: string,
): Promise<string> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return safeRejectionReply(accountName);
  const farmName = normalize(requestedName);
  const nameError = testFarmNameError(farmName);
  if (nameError) return `${botName(accountName)}\n⚠️ 無法建立測試雞場：${nameError}`;

  const existing = await existingFarmByName(env, organizationId, farmName);
  if (existing?.environment === "production") {
    return `${botName(accountName)}\n⚠️ 「${farmName}」已是正式雞場，不能建立同名測試雞場。`;
  }
  if (existing?.environment === "test" && existing.active === 1) {
    return `${botName(accountName)}\n⚠️ 已存在啟用中的測試雞場：${farmDisplayName(existing)}。`;
  }
  if (existing?.environment === "test" && existing.active === 0) {
    return `${botName(accountName)}\n⚠️ 已存在已封存的測試雞場：${farmDisplayName(existing)}。`;
  }

  const previous = await env.DB.prepare(
    `SELECT id, status FROM test_farm_actions WHERE source_event_id = ? LIMIT 1`,
  )
    .bind(eventId)
    .first<{ id: string; status: TestFarmActionRow["status"] }>();
  if (previous?.status === "completed") {
    return `${botName(accountName)}\n✅ 測試雞場建立確認已完成，沒有重複建立。`;
  }
  if (previous) {
    const action = await env.DB.prepare(
      `SELECT id, line_group_id AS lineGroupId, line_user_id AS lineUserId,
              organization_id AS organizationId, intent, farm_name AS farmName,
              farm_id AS farmId, status, expires_at AS expiresAt,
              source_event_id AS sourceEventId
         FROM test_farm_actions WHERE id = ? LIMIT 1`,
    ).bind(previous.id).first<TestFarmActionRow>();
    return action ? testFarmCreateConfirmation(accountName, action.farmName) : safeRejectionReply(accountName);
  }

  const actionId = `test-farm-action-${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT INTO test_farm_actions
      (id, line_group_id, line_user_id, organization_id, intent, farm_name,
       status, expires_at, source_event_id)
     VALUES (?, ?, ?, ?, 'create_test_farm', ?, 'waiting_confirmation', ?, ?)`,
  )
    .bind(actionId, groupId, lineUserId, organizationId, farmName, new Date(Date.now() + PENDING_TTL_MS).toISOString(), eventId)
    .run();
  return testFarmCreateConfirmation(accountName, farmName);
}

async function archiveTestFarmPendingAction(
  env: Env,
  event: LineEvent,
  eventId: string,
  groupId: string,
  organizationId: string,
  requestedName: string,
  accountName: string,
): Promise<string> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return safeRejectionReply(accountName);
  const resolver = await loadFarmResolver(env, organizationId);
  const resolution = resolver.resolve(requestedName);
  if (resolution.kind === "candidates") {
    return `${botName(accountName)}\n⚠️ 無法安全唯一確定要封存的測試雞場：\n${candidateList(resolution.candidates)}\n請回覆正式測試雞場名稱。`;
  }
  if (resolution.kind !== "direct" || !resolution.farm) return `${botName(accountName)}\n⚠️ 找不到可封存的測試雞場：${normalize(requestedName)}。`;
  const farm = await validateOperationalFarm(env, organizationId, resolution.farm.id);
  if (!farm) return safeRejectionReply(accountName);
  if (farm.environment === "production") {
    return `${botName(accountName)}\n❌ 「${farm.name}」是正式雞場，測試場管理指令不能修改它。`;
  }
  if (farm.active !== undefined && farm.active === 0) {
    return `${botName(accountName)}\n⚠️ 測試雞場 ${farmDisplayName(farm)} 已經封存。`;
  }

  const previous = await env.DB.prepare(
    `SELECT id, status FROM test_farm_actions WHERE source_event_id = ? LIMIT 1`,
  )
    .bind(eventId)
    .first<{ id: string; status: TestFarmActionRow["status"] }>();
  if (previous?.status === "completed") {
    return `${botName(accountName)}\n✅ 測試雞場封存確認已完成，沒有重複修改。`;
  }
  if (previous) return testFarmArchiveConfirmation(accountName, farm.name);

  const actionId = `test-farm-action-${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT INTO test_farm_actions
      (id, line_group_id, line_user_id, organization_id, intent, farm_name,
       farm_id, status, expires_at, source_event_id)
     VALUES (?, ?, ?, ?, 'archive_test_farm', ?, ?, 'waiting_confirmation', ?, ?)`,
  )
    .bind(actionId, groupId, lineUserId, organizationId, farm.name, farm.id, new Date(Date.now() + PENDING_TTL_MS).toISOString(), eventId)
    .run();
  return testFarmArchiveConfirmation(accountName, farm.name);
}

async function completeTestFarmAction(
  env: Env,
  event: LineEvent,
  eventId: string,
  action: TestFarmActionRow,
  accountName: string,
): Promise<string> {
  const now = new Date().toISOString();
  if (action.status === "completed") {
    return `${botName(accountName)}\n✅ 上一筆測試雞場操作已完成，沒有重複寫入。`;
  }
  if (action.status !== "waiting_confirmation" || action.expiresAt <= now) {
    if (action.status === "waiting_confirmation") {
      await env.DB.prepare(
        `UPDATE test_farm_actions SET status = 'expired', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND line_group_id = ? AND line_user_id = ? AND status = 'waiting_confirmation'`,
      ).bind(action.id, action.lineGroupId, action.lineUserId).run();
    }
    return `${botName(accountName)}\n⚠️ 上一筆待確認測試雞場操作已逾時，請重新輸入完整指令。`;
  }

  if (action.intent === "create_test_farm") {
    const farmId = `test-farm-${action.id}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO farms
          (id, organization_id, name, active, environment,
           farm_total_equity_fraction, player_group_equity_fraction)
         SELECT ?, organization_id, farm_name, 1, 'test', 0, 0
           FROM test_farm_actions
          WHERE id = ? AND line_group_id = ? AND line_user_id = ?
            AND status = 'waiting_confirmation' AND expires_at > ?`,
      ).bind(farmId, action.id, action.lineGroupId, action.lineUserId, now),
      env.DB.prepare(
        `UPDATE test_farm_actions
            SET status = 'completed', farm_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND line_group_id = ? AND line_user_id = ?
            AND status = 'waiting_confirmation' AND expires_at > ?
            AND EXISTS (
              SELECT 1 FROM farms f
               WHERE f.id = ? AND f.organization_id = ?
                 AND f.environment = 'test' AND f.active = 1
            )`,
      ).bind(farmId, action.id, action.lineGroupId, action.lineUserId, now, farmId, action.organizationId),
    ]);
    const created = await env.DB.prepare(
      `SELECT id, name, active, environment FROM farms WHERE id = ? AND organization_id = ? LIMIT 1`,
    ).bind(farmId, action.organizationId).first<FarmRow>();
    const updated = await env.DB.prepare(
      `SELECT status FROM test_farm_actions WHERE id = ? LIMIT 1`,
    ).bind(action.id).first<{ status: TestFarmActionRow["status"] }>();
    if (updated?.status === "completed" && created?.environment === "test") {
      await writeAuditLog(env, {
        organizationId: action.organizationId,
        source: "line",
        actorType: "line_user",
        actorId: action.lineUserId,
        action: "create",
        entityType: "farm",
        entityId: farmId,
        after: { id: farmId, name: created.name, environment: "test" },
        requestId: action.sourceEventId,
      });
      return `${botName(accountName)}\n✅ 測試雞場建立成功\n${farmDisplayName(created)}｜TEST`;
    }
    const duplicate = await existingFarmByName(env, action.organizationId, action.farmName);
    if (duplicate?.environment === "production") {
      return `${botName(accountName)}\n⚠️ 「${action.farmName}」已是正式雞場，不能建立同名測試雞場。`;
    }
    return safeRejectionReply(accountName);
  }

  if (!action.farmId) return safeRejectionReply(accountName);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE farms SET active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND organization_id = ? AND environment = 'test' AND active = 1`,
    ).bind(action.farmId, action.organizationId),
    env.DB.prepare(
      `UPDATE test_farm_actions
          SET status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND line_group_id = ? AND line_user_id = ?
          AND status = 'waiting_confirmation' AND expires_at > ?
          AND EXISTS (
            SELECT 1 FROM farms f WHERE f.id = ? AND f.environment = 'test' AND f.active = 0
          )`,
    ).bind(action.id, action.lineGroupId, action.lineUserId, now, action.farmId),
  ]);
  const updated = await env.DB.prepare(
    `SELECT status FROM test_farm_actions WHERE id = ? LIMIT 1`,
  ).bind(action.id).first<{ status: TestFarmActionRow["status"] }>();
  if (updated?.status === "completed") {
    await writeAuditLog(env, {
      organizationId: action.organizationId,
      source: "line",
      actorType: "line_user",
      actorId: action.lineUserId,
      action: "archive",
      entityType: "farm",
      entityId: action.farmId,
      after: { id: action.farmId, name: action.farmName, active: false, environment: "test" },
      requestId: action.sourceEventId,
    });
    return `${botName(accountName)}\n✅ 測試雞場已封存\n${farmDisplayName({ name: action.farmName, environment: "test" })}`;
  }
  return safeRejectionReply(accountName);
}

async function handleTestFarmPendingInput(
  env: Env,
  event: LineEvent,
  text: string,
  eventId: string,
  groupId: string,
  accountName: string,
): Promise<string | null> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return null;
  await expireTestFarmActions(env, groupId, lineUserId);
  const pending = await latestTestFarmAction(env, groupId, lineUserId);
  const normalized = normalize(text);
  if (/^(?:取消|不要|算了|否|不是)$/iu.test(normalized)) {
    if (!pending) return null;
    await env.DB.prepare(
      `UPDATE test_farm_actions SET status = 'cancelled', cancel_reason = 'user_cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND line_group_id = ? AND line_user_id = ? AND status = 'waiting_confirmation'`,
    ).bind(pending.id, groupId, lineUserId).run();
    return `${botName(accountName)}\n✅ 已取消上一筆測試雞場操作。`;
  }
  const confirmation = pending?.intent === "archive_test_farm"
    ? /^(?:確認封存|確認|確定)$/iu.test(normalized)
    : /^(?:確認|確定|是|好)$/iu.test(normalized);
  if (!confirmation) {
    if (!pending && /^(?:確認|確定|確認封存|是|好)$/iu.test(normalized) && await hasRecentlyExpiredTestFarmAction(env, groupId, lineUserId)) {
      return `${botName(accountName)}\n⚠️ 上一筆待確認測試雞場操作已逾時，請重新輸入完整指令。`;
    }
    return null;
  }
  if (!pending) return null;
  return completeTestFarmAction(env, event, eventId, pending, accountName);
}

async function testFarmListReply(
  env: Env,
  organizationId: string,
  accountName: string,
): Promise<string> {
  const rows = await env.DB.prepare(
    `SELECT name FROM farms
      WHERE organization_id = ? AND active = 1 AND environment = 'test'
      ORDER BY id`,
  ).bind(organizationId).all<{ name: string }>();
  if (!rows.results.length) return `${botName(accountName)}\n目前沒有測試雞場。`;
  return [`${botName(accountName)} 🧪 測試雞場`, ...rows.results.map((row, index) => `${index + 1}. ${row.name}`)].join("\n");
}

async function createPendingAction(
  env: Env,
  event: LineEvent,
  eventId: string,
  groupId: string,
  organizationId: string,
  draft: OperationalDraft,
  candidates: FarmCandidate[],
  accountName: string,
  unmatchedFarm = false,
  houseCandidates: PendingHouseCandidate[] = [],
): Promise<string> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return safeRejectionReply(accountName);
  const existing = await env.DB.prepare(
    `SELECT id, status, candidate_farms_json AS candidateFarmsJson, expires_at AS expiresAt
       FROM pending_actions WHERE source_event_id = ? LIMIT 1`,
  )
    .bind(eventId)
    .first<{ id: string; status: string; candidateFarmsJson: string; expiresAt: string }>();
  if (existing) {
    if (existing.status === "completed") return `${botName(accountName)}\n✅ 上一筆操作已完成，沒有重複寫入。`;
    return operationalCandidateReply(draft, parseStoredCandidates(existing.candidateFarmsJson), accountName);
  }

  const id = `pending-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
  const status = draft.farmText ? "waiting_confirmation" : "waiting_farm";
  await env.DB.prepare(
    `INSERT INTO pending_actions
      (id, line_group_id, line_user_id, organization_id, intent, quantity, unit,
       raw_message, raw_farm_text, house, note, candidate_farms_json, candidate_houses_json, status, expires_at, source_event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      groupId,
      lineUserId,
      organizationId,
      draft.intent,
      draft.quantity,
      draft.unit,
      event.message?.text ?? draft.rawFarmText ?? "",
      draft.rawFarmText,
      draft.house ?? null,
      draft.note ?? null,
      JSON.stringify(candidates),
      houseCandidates.length ? JSON.stringify(houseCandidates) : null,
      status,
      expiresAt,
      eventId,
    )
    .run();
  if (unmatchedFarm) {
    return [
      `${botName(accountName)} ⚠️ 無法安全辨識「${draft.rawFarmText ?? draft.farmText}」。`,
      "請從正式雞場候選中選擇：",
      candidateList(candidates),
      `要將「${operationLabel(draft.intent)} ${operationQuantityText(draft.quantity, draft.unit)}」記錄在哪一場？請回覆名稱或編號。`,
    ].join("\n");
  }
  if (houseCandidates.length) {
    const farm = candidates[0]
      ? { name: candidates[0].farmName, environment: candidates[0].environment }
      : { name: draft.farmText ?? "雞場", environment: "production" as const };
    return houseOperationalCandidateReply(farm, draft, houseCandidates, accountName);
  }
  return operationalCandidateReply(draft, candidates, accountName);
}

async function validateOperationalFarm(
  env: Env,
  organizationId: string,
  farmId: string,
): Promise<FarmRow | null> {
  return env.DB.prepare(
    `SELECT f.id AS id, f.name AS name, f.environment, f.player_group_equity_fraction AS playerGroupEquityFraction
       FROM farms f
       JOIN organizations o ON o.id = f.organization_id
      WHERE f.id = ? AND f.organization_id = ? AND f.active = 1 AND o.active = 1
      LIMIT 1`,
  )
    .bind(farmId, organizationId)
    .first<FarmRow>();
}

function validOperationalDraft(draft: OperationalDraft): boolean {
  if (!Number.isFinite(draft.quantity) || draft.quantity <= 0) return false;
  if (draft.eventDate && draft.eventDate !== "today" && draft.eventDate !== today()) return false;
  if (draft.note && (draft.note.length > 500 || /[\u0000-\u001F\u007F]/u.test(draft.note))) return false;
  if ((draft.intent === "mortality" || draft.intent === "cull" || draft.intent === "shipment") && !Number.isInteger(draft.quantity)) return false;
  if (draft.intent === "feed" && draft.unit !== "kg") return false;
  if (draft.intent === "water" && draft.unit !== "L") return false;
  if ((draft.intent === "mortality" || draft.intent === "cull" || draft.intent === "shipment") && draft.unit !== "隻") return false;
  return true;
}

async function learnCandidateAlias(
  env: Env,
  farmId: string,
  rawFarmText: string | null,
): Promise<void> {
  if (!rawFarmText) return;
  const alias = normalize(rawFarmText);
  const normalizedAlias = normalizedFarmKey(alias);
  if (normalizedAlias.length < 3 || /^(?:雞場|鸡场|牧場|牧场|場|场|林|東|东)$/iu.test(normalizedAlias)) return;
  const id = `alias-learned-${normalizedAlias}-${farmId}`;
  const existing = await env.DB.prepare(
    "SELECT id FROM farm_aliases WHERE normalized_alias = ? AND farm_id = ? LIMIT 1",
  ).bind(normalizedAlias, farmId).first<{ id: string }>();
  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO farm_aliases
        (id, farm_id, alias, normalized_alias, alias_type, status, confirmation_count, last_confirmed_at)
       VALUES (?, ?, ?, ?, 'learned', 'candidate', 1, CURRENT_TIMESTAMP)`,
    )
      .bind(id, farmId, alias, normalizedAlias)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE farm_aliases
          SET confirmation_count = confirmation_count + 1,
              last_confirmed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'candidate'`,
    )
      .bind(id)
      .run();
  }
  const other = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM farm_aliases
      WHERE normalized_alias = ? AND status IN ('trusted', 'candidate') AND farm_id <> ?`,
  )
    .bind(normalizedAlias, farmId)
    .first<{ count: number }>();
  if ((other?.count ?? 0) === 0) {
    await env.DB.prepare(
      `UPDATE farm_aliases SET status = 'trusted', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND confirmation_count >= 3 AND status = 'candidate'`,
    )
      .bind(id)
      .run();
  }
}

async function writeOperationalEvent(
  env: Env,
  event: LineEvent,
  eventId: string,
  groupId: string,
  organizationId: string,
  farm: FarmRow,
  draft: OperationalDraft,
  accountName: string,
  pendingActionId?: string,
): Promise<string> {
  if (!validOperationalDraft(draft)) return safeRejectionReply(accountName);
  const validFarm = await validateOperationalFarm(env, organizationId, farm.id);
  if (!validFarm) return safeRejectionReply(accountName);
  let houseId: string | null = null;
  let flockId: string | null = null;
  let canonicalHouse: string | null = draft.house ?? null;
  let requestedHouseText = draft.house;
  if (!requestedHouseText) {
    const activeHouses = await activeHousesForFarm(env, validFarm.id);
    if (activeHouses.length > 1) {
      return `${botName(accountName)}\n⚠️ ${farmDisplayName(validFarm)}目前有多個進行中雞舍，請重新輸入指定舍別的完整事件。`;
    }
    if (activeHouses.length === 1) requestedHouseText = activeHouses[0].name;
  }
  if (requestedHouseText) {
    const requestedHouse = normalizedHouseName(requestedHouseText);
    const house = await env.DB.prepare(
      `SELECT id, name
         FROM houses
        WHERE farm_id = ? AND active = 1
          AND (normalized_name = ? OR name = ?)
        LIMIT 1`,
    )
      .bind(validFarm.id, requestedHouse, requestedHouseText)
      .first<{ id: string; name: string }>();
    if (!house) {
      return `${botName(accountName)}\n⚠️ ${farmDisplayName(validFarm)} 尚未建立 ${requestedHouseText} 雞舍主檔，沒有寫入。`;
    }
    houseId = house.id;
    canonicalHouse = house.name;
    const activeFlocks = await env.DB.prepare(
      `SELECT id FROM flocks
        WHERE farm_id = ? AND house_id = ? AND status = 'active'
        ORDER BY id`,
    )
      .bind(validFarm.id, house.id)
      .all<{ id: string }>();
    // A single active flock can be linked deterministically. With multiple
    // active batches, keep the event at house level instead of guessing.
    if (activeFlocks.results.length === 1) flockId = activeFlocks.results[0].id;
  }
  const lineUserId = event.source?.userId ?? null;
  const eventIdValue = `operational-${eventId}`;
  const insert = env.DB.prepare(
    `INSERT OR IGNORE INTO operational_events
      (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit,
       event_date, house, house_id, flock_id, raw_message, raw_farm_text, note, pending_action_id, source_event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    eventIdValue,
    organizationId,
    farm.id,
    groupId,
    lineUserId,
    draft.intent,
    draft.quantity,
    draft.unit,
    today(),
    canonicalHouse,
    houseId,
    flockId,
    event.message?.text ?? draft.rawFarmText ?? "",
    draft.rawFarmText,
    draft.note ?? null,
    pendingActionId ?? null,
    eventId,
  );
  if (pendingActionId) {
    await env.DB.batch([
      insert,
      env.DB.prepare(
        `UPDATE pending_actions
            SET status = 'completed', confirmed_farm_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND line_group_id = ? AND line_user_id = ?
            AND status IN ('waiting_farm', 'waiting_confirmation') AND expires_at > ?`,
      ).bind(farm.id, pendingActionId, groupId, lineUserId, new Date().toISOString()),
    ]);
  } else {
    await insert.run();
  }
  const stored = await env.DB.prepare(
    `SELECT farm_id AS farmId, intent, quantity, unit, note, pending_action_id AS pendingActionId
       FROM operational_events WHERE source_event_id = ? LIMIT 1`,
  )
    .bind(eventId)
    .first<{ farmId: string; intent: OperationalIntent; quantity: number; unit: "隻" | "kg" | "L"; note: string | null; pendingActionId: string | null }>();
  if (!stored) return safeRejectionReply(accountName);
  await writeAuditLog(env, {
    organizationId,
    source: "line",
    actorType: "line_user",
    actorId: lineUserId,
    action: "create",
    entityType: "operational_event",
    entityId: eventIdValue,
    after: {
      farmId: farm.id,
      farmName: farm.name,
      house: canonicalHouse,
      houseId,
      flockId,
      intent: stored.intent,
      quantity: stored.quantity,
      unit: stored.unit,
      eventDate: today(),
      pendingActionId: stored.pendingActionId,
    },
    requestId: eventId,
  });
  if (pendingActionId) await learnCandidateAlias(env, farm.id, draft.rawFarmText);
  if (lineUserId) {
    try {
      await env.DB.prepare(
        `INSERT INTO line_operational_contexts
          (line_group_id, line_user_id, organization_id, farm_id, house_id, flock_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(line_group_id, line_user_id) DO UPDATE SET
           organization_id = excluded.organization_id,
           farm_id = excluded.farm_id,
           house_id = excluded.house_id,
           flock_id = excluded.flock_id,
           updated_at = excluded.updated_at`,
      ).bind(
        groupId,
        lineUserId,
        organizationId,
        farm.id,
        houseId,
        flockId,
        new Date().toISOString(),
      ).run();
    } catch {
      // Context is an accelerator only; the operational ledger write above is
      // already committed and must not be reported as failed.
    }
  }
  return [
    `${botName(accountName)} ✅ 紀錄成功`,
    `${farmDisplayName(farm)}${canonicalHouse ? `｜${canonicalHouse}` : ""}｜${operationLabel(stored.intent)}｜${operationQuantityText(stored.quantity, stored.unit)}`,
    ...(stored.note ? [`備註：${stored.note}`] : []),
  ].join("\n");
}

async function confirmPendingAction(
  env: Env,
  event: LineEvent,
  eventId: string,
  pending: PendingActionRow,
  farmId: string,
  accountName: string,
  houseOverride?: string,
): Promise<string> {
  const candidates = parseStoredCandidates(pending.candidateFarmsJson);
  if (!candidates.some((candidate) => candidate.farmId === farmId)) return safeRejectionReply(accountName);
  if (pending.status === "completed") return `${botName(accountName)}\n✅ 上一筆操作已完成，沒有重複寫入。`;
  if (pending.status !== "waiting_farm" && pending.status !== "waiting_confirmation") return `${botName(accountName)}\n⚠️ 上一筆待確認操作已失效，請重新輸入完整事件。`;
  if (pending.expiresAt <= new Date().toISOString()) {
    await env.DB.prepare(
      "UPDATE pending_actions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('waiting_farm', 'waiting_confirmation')",
    ).bind(pending.id).run();
    return `${botName(accountName)}\n⚠️ 上一筆待確認操作已逾時，請重新輸入完整事件。`;
  }
  const farm = await validateOperationalFarm(env, pending.organizationId, farmId);
  if (!farm) return safeRejectionReply(accountName);
  const draft: OperationalDraft = {
    intent: pending.intent,
    quantity: Number(pending.quantity),
    unit: pending.unit,
    farmText: pending.rawFarmText,
    rawFarmText: pending.rawFarmText,
    house: houseOverride ?? pending.house ?? undefined,
    note: pending.note ?? undefined,
  };
  return writeOperationalEvent(env, event, eventId, pending.lineGroupId, pending.organizationId, farm, draft, accountName, pending.id);
}

async function handlePendingInput(
  env: Env,
  event: LineEvent,
  text: string,
  eventId: string,
  groupId: string,
  organizationId: string,
  accountName: string,
): Promise<string | null> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return null;
  await expirePendingActions(env, groupId, lineUserId);
  const normalized = normalize(text);
  const pending = await latestPending(env, groupId, lineUserId);
  if (/^(?:取消|不要|算了|否|不是)$/iu.test(normalized)) {
    if (!pending) return null;
    await env.DB.prepare(
      `UPDATE pending_actions SET status = 'cancelled', cancel_reason = 'user_cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND line_group_id = ? AND line_user_id = ?
          AND status IN ('waiting_farm', 'waiting_confirmation')`,
    ).bind(pending.id, groupId, lineUserId).run();
    return `${botName(accountName)}\n✅ 已取消上一筆待確認操作。`;
  }

  const houseCandidates = parseStoredHouseCandidates(pending?.candidateHousesJson ?? null);
  const farmCandidate = parseStoredCandidates(pending?.candidateFarmsJson ?? "")[0];
  if (pending && houseCandidates.length && farmCandidate) {
    const number = normalized.match(/^(\d+)$/u);
    const selected = number
      ? houseCandidates[Number(number[1]) - 1]
      : houseCandidates.find((candidate) => normalizedHouseName(candidate.houseName) === normalizedHouseName(normalized));
    if (selected) {
      return confirmPendingAction(env, event, eventId, pending, farmCandidate.farmId, accountName, selected.houseName);
    }
    if (/^(?:是|好|確認|確定)$/iu.test(normalized)) {
      if (houseCandidates.length === 1) {
        return confirmPendingAction(env, event, eventId, pending, farmCandidate.farmId, accountName, houseCandidates[0].houseName);
      }
      return `${botName(accountName)}\n請回覆舍別名稱或編號。\n${houseCandidateList(houseCandidates)}`;
    }
    return `${botName(accountName)}\n請回覆舍別名稱或編號。\n${houseCandidateList(houseCandidates)}`;
  }

  const number = normalized.match(/^(\d+)$/u);
  if (number) {
    if (!pending) {
      return (await hasRecentlyExpiredPending(env, groupId, lineUserId))
        ? `${botName(accountName)}\n⚠️ 上一筆待確認操作已逾時，請重新輸入完整事件。`
        : `${botName(accountName)}\n目前沒有待確認的操作。`;
    }
    const candidates = parseStoredCandidates(pending.candidateFarmsJson);
    const index = Number(number[1]) - 1;
    if (index < 0 || index >= candidates.length) {
      return `${botName(accountName)}\n請回覆候選清單中的編號。\n${candidateList(candidates)}`;
    }
    return confirmPendingAction(env, event, eventId, pending, candidates[index].farmId, accountName);
  }

  if (/^(?:是|好|確認|確定)$/iu.test(normalized)) {
    if (!pending) return null;
    const candidates = parseStoredCandidates(pending.candidateFarmsJson);
    if (candidates.length !== 1) return `${botName(accountName)}\n請回覆候選清單中的編號或正式雞場名稱。`;
    return confirmPendingAction(env, event, eventId, pending, candidates[0].farmId, accountName);
  }

  if (!pending) return null;
  const resolver = await loadFarmResolver(env, organizationId);
  const resolution = resolver.resolve(normalized);
  const candidates = parseStoredCandidates(pending.candidateFarmsJson);
  if (resolution.kind === "direct" && resolution.farm) {
    if (candidates.some((candidate) => candidate.farmId === resolution.farm?.id)) {
      return confirmPendingAction(env, event, eventId, pending, resolution.farm.id, accountName);
    }
    return `${botName(accountName)}\n⚠️ 這個雞場不在上一筆候選清單中，請重新輸入完整事件。`;
  }
  if (resolution.kind === "candidates") {
    const scoped = resolution.candidates.filter((candidate) => candidates.some((item) => item.farmId === candidate.farmId));
    if (scoped.length) return `${botName(accountName)}\n請從上一筆候選清單選擇：\n${candidateList(candidates)}`;
  }
  return null;
}

async function handleOperationalDraft(
  env: Env,
  event: LineEvent,
  eventId: string,
  groupId: string,
  state: GroupState,
  draft: OperationalDraft,
  accountName: string,
): Promise<string> {
  if (!state.organizationId) return unboundReply(accountName);
  const resolver = await loadFarmResolver(env, state.organizationId);
  if (!draft.farmText) {
    return createPendingAction(env, event, eventId, groupId, state.organizationId, draft, resolver.allCandidates(), accountName);
  }
  const resolution = resolver.resolve(draft.farmText);
  if (draft.requiresFarmConfirmation) {
    if (resolution.kind === "direct" && resolution.farm) {
      const candidate: FarmCandidate = {
        farmId: resolution.farm.id,
        farmName: resolution.farm.name,
        score: 1,
        reason: "substring",
        environment: resolution.farm.environment,
      };
      return createPendingAction(env, event, eventId, groupId, state.organizationId, draft, [candidate], accountName);
    }
    if (resolution.kind === "candidates") {
      return createPendingAction(env, event, eventId, groupId, state.organizationId, draft, resolution.candidates, accountName);
    }
    return createPendingAction(
      env,
      event,
      eventId,
      groupId,
      state.organizationId,
      draft,
      resolver.allCandidates(),
      accountName,
      true,
    );
  }
  if (resolution.kind === "direct" && resolution.farm) {
    const farm = await validateOperationalFarm(env, state.organizationId, resolution.farm.id);
    if (!farm) return safeRejectionReply(accountName);
    let resolvedDraft = draft;
    if (!draft.house) {
      const houses = await activeHousesForFarm(env, farm.id);
      if (houses.length > 1) {
        const farmCandidate: FarmCandidate = {
          farmId: farm.id,
          farmName: farm.name,
          score: 1,
          reason: "substring",
          environment: farm.environment,
        };
        return createPendingAction(
          env,
          event,
          eventId,
          groupId,
          state.organizationId,
          draft,
          [farmCandidate],
          accountName,
          false,
          houses.map((house) => ({ houseId: house.id, houseName: house.name })),
        );
      }
      if (houses.length === 1) resolvedDraft = { ...draft, house: houses[0].name };
    }
    return writeOperationalEvent(env, event, eventId, groupId, state.organizationId, farm, resolvedDraft, accountName);
  }
  if (resolution.kind === "candidates") {
    return createPendingAction(env, event, eventId, groupId, state.organizationId, draft, resolution.candidates, accountName);
  }
  return createPendingAction(
    env,
    event,
    eventId,
    groupId,
    state.organizationId,
    draft,
    resolver.allCandidates(),
    accountName,
    true,
  );
}

async function resolveFarmQuery(
  env: Env,
  organizationId: string,
  requestedName: string,
  accountName: string,
): Promise<{ farm: FarmRow | null; reply?: string }> {
  const resolver = await loadFarmResolver(env, organizationId);
  const resolution = resolver.resolve(requestedName);
  if (resolution.kind === "candidates") {
    return { farm: null, reply: queryCandidateReply(requestedName, resolution.candidates, accountName) };
  }
  if (resolution.kind !== "direct" || !resolution.farm) return { farm: null, reply: safeRejectionReply(accountName) };
  const farm = await validateOperationalFarm(env, organizationId, resolution.farm.id);
  return { farm, reply: farm ? undefined : safeRejectionReply(accountName) };
}

interface SemanticAiResult {
  attempted: boolean;
  intent: UnifiedIntent | null;
  validationResult: string;
  errorKind?: string;
  usage?: Record<string, number> | null;
}

interface RuntimeTrace {
  correlation_id?: string;
  ai_invoked?: boolean;
  intent?: string;
  confidence?: number;
  latency_ms?: number;
  validation_result?: string;
  semantic_action_key?: string;
  semantic_dedupe?: "acquired" | "suppressed" | "not_applicable";
  interaction_gate?: "explicit" | "active" | "quiet";
  ambient_buffered?: boolean;
  mention_stripped?: boolean;
  conversation_v2_ai_first?: boolean;
  conversation_v2_explicit_self_mention?: boolean;
  conversation_v2_dispatch_entered?: boolean;
  conversation_v2_eligible?: boolean;
  conversation_v2_planner_invoked?: boolean;
  conversation_v2_skip_reason?: ConversationV2SkipReason | "unsupported_command_class" | "not_dispatched";
  conversation_v2_group_access?: "enabled" | "disabled" | "not_found";
  conversation_v2_global_mode?: string;
  conversation_v2_group_enabled?: boolean;
  conversation_v2_group_found?: boolean;
  conversation_v2_planner_started_at?: string;
  conversation_v2_planner_completed_at?: string;
  conversation_v2_planner_duration_ms?: number;
  conversation_v2_ai_invoked?: boolean;
  conversation_v2_ai_attempted?: boolean;
  conversation_v2_ai_duration_ms?: number;
  conversation_v2_ai_validation?: string;
  conversation_v2_ai_error_class?: string | null;
  conversation_v2_deterministic_goal?: string;
  conversation_v2_deterministic_topic?: string | null;
  conversation_v2_ai_goal?: string | null;
  conversation_v2_selected_goal?: string;
  conversation_v2_topic?: string | null;
  conversation_v2_selected_by?: "ai" | "deterministic_policy" | "fallback";
  conversation_v2_plan_valid?: boolean | null;
  conversation_v2_tool_invoked?: boolean;
  conversation_v2_tool_status?: string;
  conversation_v2_tool_error_class?: string | null;
  conversation_v2_composer_invoked?: boolean;
  conversation_v2_renderer?: string;
  conversation_v2_renderer_status?: "not_attempted" | "success" | "failed";
  conversation_v2_mutation_level?: "read" | "candidate" | "official";
  conversation_v2_session_persisted?: boolean;
  conversation_v2_session_read_status?: "not_attempted" | "found" | "not_found" | "error";
  conversation_v2_session_write_attempted?: boolean;
  conversation_v2_session_write_status?: "not_attempted" | "success" | "failed";
  conversation_v2_session_write_error_class?: string;
  conversation_v2_trace_id?: string;
  conversation_v2_trace_save_status?: "not_attempted" | "success" | "failed";
  conversation_v2_trace_save_error_class?: string;
  conversation_v2_fallback_origin?: string;
  conversation_v2_fallback_reason?: string;
  conversation_v2_returned_null?: boolean;
  conversation_v2_outcome_kind?: ConversationV2OutcomeKind;
  conversation_v2_plan_source?: "ai" | "fallback" | "deterministic_policy";
  conversation_v2_requested_tools?: string[];
  conversation_v2_executed_tools?: string[];
  conversation_v2_response_strategy?: string;
  conversation_v2_policy_level?: "read" | "candidate" | "official_handoff";
  conversation_v2_tool_result_status?: string;
  conversation_v2_speech_act?: string;
  conversation_v2_object_type?: string | null;
  conversation_v2_goal_guard?: string;
  conversation_v2_answer_contract_mode?: ConversationAnswerContract["mode"] | null;
  conversation_v2_requested_count?: number | null;
  conversation_v2_example_count?: number | null;
  conversation_v2_capability_count?: number | null;
  conversation_v2_limitation_count?: number | null;
  conversation_v2_wants_examples?: boolean;
  conversation_v2_wants_capabilities?: boolean;
  conversation_v2_wants_limitations?: boolean;
  conversation_v2_wants_summary?: boolean;
  conversation_v2_wants_reasons?: boolean;
  conversation_v2_wants_consequences?: boolean;
  conversation_v2_wants_options?: boolean;
  conversation_v2_read_only_explicit?: boolean;
  conversation_v2_broad_read_plan?: string | null;
  conversation_v2_broad_read_tools_requested?: string[];
  conversation_v2_broad_read_tools_executed?: string[];
  conversation_v2_memory_used_for_routing?: boolean;
  conversation_v2_memory_used_in_response?: boolean;
  conversation_v2_consequence_vs_advice?: "consequence" | "advice" | null;
  conversation_v2_renderer_variant?: string | null;
  conversation_v2_reference_scope?: ConversationReferenceScope | null;
  conversation_v2_referent_required?: boolean;
  conversation_v2_referent_resolved?: boolean;
  conversation_v2_referent_source?: ConversationReferentSource | null;
  conversation_v2_generic_rule_used?: boolean;
  conversation_v2_active_candidate_count?: number;
  conversation_v2_advice_subject_exists?: boolean;
  timing?: {
    webhook_received_ms?: number;
    command_resolved_ms?: number;
    d1_query_start_ms?: number;
    d1_query_complete_ms?: number;
    summary_build_complete_ms?: number;
    line_reply_start_ms?: number;
    line_reply_complete_ms?: number;
    total_ms?: number;
  };
  /** Internal only; removed before the runtime harness response is returned. */
  startedAtMs?: number;
}

function traceMark(trace: RuntimeTrace | undefined, key: keyof NonNullable<RuntimeTrace["timing"]>): void {
  if (!trace || trace.startedAtMs === undefined) return;
  trace.timing ??= {};
  trace.timing[key] = Date.now() - trace.startedAtMs;
}

function finalizeConversationV2AnswerContractTrace(
  trace: RuntimeTrace | undefined,
  answerContract: ConversationAnswerContract,
): void {
  if (!trace) return;
  const mode = finalConversationAnswerModeForRenderer({
    renderer: trace.conversation_v2_renderer,
    rendererVariant: trace.conversation_v2_renderer_variant,
    fallbackMode: answerContract.mode,
  });
  trace.conversation_v2_answer_contract_mode = mode;
  if (mode === "options") {
    trace.conversation_v2_wants_options = true;
    trace.conversation_v2_consequence_vs_advice = "advice";
  } else if (mode === "consequence") {
    trace.conversation_v2_wants_consequences = true;
    trace.conversation_v2_consequence_vs_advice = "consequence";
  }
}

async function safeConversationHash(value: string): Promise<string> {
  try {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
  } catch {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
}

function conversationReplySummary(messages: LineReplyMessage[]): string {
  return messages
    .map((message) => message.type === "text" ? message.text : "")
    .filter(Boolean)
    .join("\n")
    .slice(0, 800);
}

async function writeConversationV2Trace(
  env: Env,
  event: LineEvent,
  organizationId: string,
  groupId: string,
  userId: string,
  now: Date,
  eligibility: boolean,
  session: ConversationV2SessionRow | null,
  trace: RuntimeTrace | undefined,
  text: string,
): Promise<"not_attempted" | "success" | "failed"> {
  if (!trace?.conversation_v2_dispatch_entered) {
    if (trace) trace.conversation_v2_trace_save_status = "not_attempted";
    return "not_attempted";
  }
  if (trace.conversation_v2_trace_id) {
    trace.conversation_v2_trace_save_status = "success";
    return "success";
  }
  try {
    const traceId = trace.conversation_v2_trace_id ?? `conversation-v2-trace-${crypto.randomUUID()}`;
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const eventRef = event.webhookEventId ?? event.message?.id ?? "eventless";
    const [groupHash, userHash, eventFingerprint] = await Promise.all([
      safeConversationHash(`group:${groupId}`),
      safeConversationHash(`user:${userId}`),
      safeConversationHash(`text:${text}`),
    ]);
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM conversation_v2_traces WHERE expires_at <= ?`).bind(now.toISOString()),
      env.DB.prepare(
        `INSERT INTO conversation_v2_traces
          (trace_id, correlation_id, event_ref, event_fingerprint, organization_id,
           line_group_safe_hash, line_user_safe_hash, session_id,
           active_object_type, active_object_id, v2_eligibility,
           planner_invoked, planner_source, model, plan_valid, goal, topic,
           speech_act, object_type, goal_guard,
           requested_tools_json, executed_tools_json, tool_result_status,
           policy_level, response_strategy, renderer, mutation_level,
           candidate_mutation_count, official_mutation_count,
           audit_mutation_count, duration_ms, error_class, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        traceId,
        trace.correlation_id ?? eventRef,
        eventRef.slice(0, 240),
        eventFingerprint,
        organizationId,
        groupHash,
        userHash,
        session?.id ?? conversationV2SessionId(organizationId, groupId, userId),
        session?.activeObjectType ?? (trace.conversation_v2_selected_goal ? "candidate" : null),
        session?.activeObjectId ?? null,
        eligibility ? "eligible" : "ineligible",
        trace.conversation_v2_planner_invoked ? 1 : 0,
        trace.conversation_v2_plan_source ?? (trace.conversation_v2_ai_invoked ? "ai" : "fallback"),
        env.CONVERSATION_MODEL ?? PRODUCTION_AI_MODEL,
        trace.conversation_v2_ai_validation === "schema_valid" ? 1 : trace.conversation_v2_ai_validation ? 0 : null,
        trace.conversation_v2_selected_goal ?? null,
        trace.conversation_v2_topic ?? null,
        trace.conversation_v2_speech_act ?? null,
        trace.conversation_v2_object_type ?? null,
        trace.conversation_v2_goal_guard ?? null,
        JSON.stringify(trace.conversation_v2_requested_tools ?? []),
        JSON.stringify(trace.conversation_v2_executed_tools ?? []),
        trace.conversation_v2_tool_result_status ?? trace.conversation_v2_tool_status ?? "success",
        trace.conversation_v2_policy_level ?? "read",
        trace.conversation_v2_response_strategy
          ?? trace.conversation_v2_outcome_kind
          ?? trace.conversation_v2_renderer
          ?? "goal_specific",
        trace.conversation_v2_renderer ?? null,
        trace.conversation_v2_mutation_level ?? "read",
        trace.conversation_v2_mutation_level === "candidate" ? 1 : 0,
        0,
        0,
        trace.startedAtMs === undefined ? null : Date.now() - trace.startedAtMs,
        eligibility ? null : trace.conversation_v2_skip_reason ?? "v2_ineligible",
        expiresAt,
      ),
    ]);
    trace.conversation_v2_trace_id = traceId;
    trace.conversation_v2_trace_save_status = "success";
    return "success";
  } catch (error) {
    const errorClass = error instanceof Error && error.name ? error.name : "db_error";
    trace.conversation_v2_trace_save_status = "failed";
    trace.conversation_v2_trace_save_error_class = errorClass;
    console.log(JSON.stringify({ event: "conversation_v2_trace_error", error_class: errorClass }));
    return "failed";
  }
}

async function persistConversationV2RoutingObservability(
  env: Env,
  event: LineEvent,
  organizationId: string | null,
  groupId: string | null,
  trace: RuntimeTrace | undefined,
): Promise<void> {
  if (!trace?.conversation_v2_explicit_self_mention || !organizationId || !groupId) return;
  const userId = event.source?.userId;
  if (!userId) return;
  try {
    if (trace.conversation_v2_dispatch_entered && !trace.conversation_v2_trace_id) {
      await writeConversationV2Trace(
        env,
        event,
        organizationId,
        groupId,
        userId,
        new Date(event.timestamp ?? Date.now()),
        trace.conversation_v2_eligible === true,
        null,
        trace,
        event.message?.text ?? "",
      );
    }
    const metadata = {
      schema_version: 1,
      correlation_id: trace.correlation_id ?? eventIdFor(event),
      explicit_self_mention: true,
      v2_dispatch_entered: trace.conversation_v2_dispatch_entered === true,
      v2_eligible: trace.conversation_v2_eligible ?? null,
      v2_skip_reason: trace.conversation_v2_skip_reason ?? null,
      group_access: trace.conversation_v2_group_access ?? null,
      planner_invoked: trace.conversation_v2_planner_invoked === true,
      ai_attempted: trace.conversation_v2_ai_attempted ?? trace.conversation_v2_ai_invoked ?? false,
      ai_duration_ms: trace.conversation_v2_ai_duration_ms ?? null,
      ai_validation: trace.conversation_v2_ai_validation ?? null,
      ai_error_class: trace.conversation_v2_ai_error_class ?? null,
      ai_goal: trace.conversation_v2_ai_goal ?? null,
      deterministic_goal: trace.conversation_v2_deterministic_goal ?? null,
      deterministic_topic: trace.conversation_v2_deterministic_topic ?? null,
      selected_by: trace.conversation_v2_selected_by ?? null,
      plan_valid: trace.conversation_v2_plan_valid ?? null,
      global_mode: trace.conversation_v2_global_mode ?? null,
      group_v2_enabled: trace.conversation_v2_group_enabled ?? null,
      group_found: trace.conversation_v2_group_found ?? null,
      planner_started_at: trace.conversation_v2_planner_started_at ?? null,
      planner_completed_at: trace.conversation_v2_planner_completed_at ?? null,
      planner_duration_ms: trace.conversation_v2_planner_duration_ms ?? null,
      tool_invoked: trace.conversation_v2_tool_invoked ?? false,
      tool_status: trace.conversation_v2_tool_status ?? trace.conversation_v2_tool_result_status ?? "not_attempted",
      tool_error_class: trace.conversation_v2_tool_error_class ?? null,
      session_read_status: trace.conversation_v2_session_read_status ?? "not_attempted",
      session_write_attempted: trace.conversation_v2_session_write_attempted ?? false,
      session_write_status: trace.conversation_v2_session_write_status ?? "not_attempted",
      session_write_error_class: trace.conversation_v2_session_write_error_class ?? null,
      fallback_origin: trace.conversation_v2_fallback_origin ?? null,
      fallback_reason: trace.conversation_v2_fallback_reason ?? null,
      v2_returned_null: trace.conversation_v2_returned_null ?? false,
      trace_id: trace.conversation_v2_trace_id ?? null,
      trace_save_status: trace.conversation_v2_trace_save_status ?? "not_attempted",
      trace_save_error_class: trace.conversation_v2_trace_save_error_class ?? null,
      goal: trace.conversation_v2_selected_goal ?? null,
      topic: trace.conversation_v2_topic ?? null,
      renderer: trace.conversation_v2_renderer ?? null,
      renderer_status: trace.conversation_v2_renderer_status ?? "not_attempted",
      composer_invoked: trace.conversation_v2_composer_invoked ?? false,
      mutation_level: trace.conversation_v2_mutation_level ?? "read",
      v2_outcome_kind: trace.conversation_v2_outcome_kind ?? null,
      answer_contract_mode: trace.conversation_v2_answer_contract_mode ?? null,
      requested_count: trace.conversation_v2_requested_count ?? null,
      example_count: trace.conversation_v2_example_count ?? null,
      capability_count: trace.conversation_v2_capability_count ?? null,
      limitation_count: trace.conversation_v2_limitation_count ?? null,
      wants_examples: trace.conversation_v2_wants_examples ?? false,
      wants_capabilities: trace.conversation_v2_wants_capabilities ?? false,
      wants_limitations: trace.conversation_v2_wants_limitations ?? false,
      wants_summary: trace.conversation_v2_wants_summary ?? false,
      wants_reasons: trace.conversation_v2_wants_reasons ?? false,
      wants_consequences: trace.conversation_v2_wants_consequences ?? false,
      wants_options: trace.conversation_v2_wants_options ?? false,
      read_only_explicit: trace.conversation_v2_read_only_explicit ?? false,
      broad_read_plan: trace.conversation_v2_broad_read_plan ?? null,
      broad_read_tools_requested: trace.conversation_v2_broad_read_tools_requested ?? [],
      broad_read_tools_executed: trace.conversation_v2_broad_read_tools_executed ?? [],
      memory_used_for_routing: trace.conversation_v2_memory_used_for_routing ?? false,
      memory_used_in_response: trace.conversation_v2_memory_used_in_response ?? false,
      consequence_vs_advice: trace.conversation_v2_consequence_vs_advice ?? null,
      renderer_variant: trace.conversation_v2_renderer_variant ?? null,
      reference_scope: trace.conversation_v2_reference_scope ?? null,
      referent_required: trace.conversation_v2_referent_required ?? false,
      referent_resolved: trace.conversation_v2_referent_resolved ?? false,
      referent_source: trace.conversation_v2_referent_source ?? null,
      generic_rule_used: trace.conversation_v2_generic_rule_used ?? false,
      active_candidate_count: trace.conversation_v2_active_candidate_count ?? null,
      advice_subject_exists: trace.conversation_v2_advice_subject_exists ?? null,
      created_at: new Date().toISOString(),
    };
    await env.DB.prepare(
      `UPDATE line_events
          SET conversation_routing_json = ?
        WHERE event_id = ?`,
    ).bind(JSON.stringify(metadata), eventIdFor(event)).run();
  } catch (error) {
    // Routing observability is best effort and must never trigger business or
    // reply re-execution. The existing runtime log is the last-resort signal.
    console.log(JSON.stringify({
      event: "conversation_v2_routing_observability_error",
      error_class: error instanceof Error && error.name ? error.name : "db_error",
    }));
  }
}

function menuActionForCommand(command: ParsedCommand): string | null {
  switch (command.kind) {
    case "menu_quick_record":
    case "menu_today_summary":
    case "menu_farms":
    case "menu_recent_abnormal":
    case "menu_correction_help":
    case "menu_weather":
    case "menu_ai":
    case "menu_finance":
    case "menu_audit":
    case "menu_help":
    case "menu_pending_candidates":
    case "menu_management":
    case "menu_developer":
      return command.kind;
    default:
      return null;
  }
}

function logAiObservation(
  aiInvoked: boolean,
  intent: UnifiedIntent | null,
  confidence: number,
  latencyMs: number,
  validationResult: string,
  trace?: RuntimeTrace,
): void {
  if (trace) {
    trace.ai_invoked = aiInvoked;
    trace.intent = intent?.intent ?? "unknown";
    trace.confidence = confidence;
    trace.latency_ms = latencyMs;
    trace.validation_result = validationResult;
  }
  console.log(JSON.stringify({
    ai_invoked: aiInvoked,
    intent: intent?.intent ?? "unknown",
    confidence,
    latency_ms: latencyMs,
    validation_result: validationResult,
  }));
}

function naturalLanguageFallbackReply(accountName: string): string {
  return [
    `${botName(accountName)} ⚠️ 目前無法完成自然語言解析。`,
    "請改用：",
    "洪秀美場死亡5",
  ].join("\n");
}

const SEMANTIC_AI_MODEL = "@cf/meta/llama-3.2-3b-instruct";
const BENCHMARK_MODEL_ALLOWLIST = new Set([
  SEMANTIC_AI_MODEL,
  "@cf/zai-org/glm-4.7-flash",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/nvidia/nemotron-3-120b-a12b",
]);

function aiResponseText(result: unknown): string {
  if (typeof result === "string") return result;
  if (typeof result !== "object" || result === null) return "";
  const response = (result as { response?: unknown }).response;
  if (typeof response === "string") return response;
  if (response && typeof response === "object") return JSON.stringify(response);
  return "";
}

function aiUsage(result: unknown): Record<string, number> | null {
  if (typeof result !== "object" || result === null) return null;
  const record = result as { usage?: unknown; response?: unknown };
  const responseUsage = record.response && typeof record.response === "object"
    ? (record.response as { usage?: unknown }).usage
    : undefined;
  const value = record.usage ?? responseUsage;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const numbers = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === "number" && Number.isFinite(item))
    .map(([key, item]) => [key, item as number] as const);
  return numbers.length ? Object.fromEntries(numbers) : null;
}

function aiErrorKind(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/(?:403|paid|free.?plan|not entitled|require_workers_paid|permission)/iu.test(message)) return "ineligible_free";
  if (/(?:429|quota|rate.?limit|daily allocation|neuron)/iu.test(message)) return "free_budget_or_rate_limited";
  return "ai_error";
}

const HYBRID_SEMANTIC_SYSTEM_PROMPT = `你是金雞協會助理Ai的雞場營運／查詢語意解析器。只能輸出 UnifiedIntent JSON，不得輸出解釋、聊天、Markdown 或任何資料庫操作。
允許 intent：record_mortality, record_cull, record_feed, record_water, record_shipment, record_inventory, query_today_mortality, query_today_mortality_top, query_recent_mortality_top, query_farm_mortality, query_current_stock, query_daily_summary, query_flock_age, query_upcoming_shipments, query_farm_list, query_equity, query_my_equity, query_farm_profit, query_farm_profit_list, query_portfolio_profit, query_investor_profit, unknown。
自然語言只能抽取 intent、farmText、houseText、quantity、unit、date、period、note、confidence、needsConfirmation。正式 farm_id、金額、死亡統計、排序結果一律由應用程式與 D1 決定。
生日、死亡日、一般知識、餐廳、菜單、位置、營業時間、獸醫診斷、藥物處方與其他無法映射到上述 intent 的內容，必須輸出 intent=unknown、confidence=0、needsConfirmation=true。
farmText 只能是使用者訊息中的原始雞場片段；不得創造雞場名稱，不得輸出 candidateFarmIds，也不得把 farmText 自行轉成 farm_id。
record 時 quantity 必須是正數；死亡／淘汰／出雞 unit 用 bird，飼料用 kg，飲水用 L；飲水若使用噸，先換算為 1000 L／噸。query 不要計算數字。
所有欄位都必須輸出；沒有值用 null。
嚴格範例：
「金雞測試場今天死了3隻」→ record_mortality，farmText=「金雞測試場」，quantity=3，unit=bird。
「金雞測試場今天又掛了2隻」→ record_mortality，farmText=「金雞測試場」，quantity=2，unit=bird；「掛了」在本系統是死亡口語，不是飼料。
「金雞側市場今天死1隻」→ record_mortality，farmText=「金雞側市場」，quantity=1，unit=bird；這是錯字候選，不得改成已知正式名稱。
「今天哪場死最多」→ query_today_mortality_top，farmText=null，quantity=null。
「洪秀美今天死多少」→ query_farm_mortality，farmText=「洪秀美」，quantity=null。
farmText 只保留雞場名稱／別名／錯字片段，不得包含今天、又、那邊、死亡詞、數字、單位、備註。`;

async function parseSemanticWithAiModel(
  env: Env,
  input: string,
  organizationId: string,
  model: string,
  trace?: RuntimeTrace,
  enforceInvocationGate = true,
): Promise<SemanticAiResult> {
  if (!env.AI || (enforceInvocationGate && !shouldInvokeSemanticAi(input))) {
    if (trace) {
      trace.ai_invoked = false;
      trace.intent = "unknown";
      trace.confidence = 0;
      trace.latency_ms = 0;
      trace.validation_result = "not_invoked";
    }
    return { attempted: false, intent: null, validationResult: "not_invoked", usage: null };
  }
  const started = Date.now();
  const resolver = await loadFarmResolver(env, organizationId);
  const knownFarms = resolver.allCandidates().map((candidate) => ({
    name: candidate.farmName,
    environment: candidate.environment ?? "production",
  }));
  const prompt = `${HYBRID_SEMANTIC_SYSTEM_PROMPT}\nknownFarms=${JSON.stringify(knownFarms)}\ncurrentDate=${today()}`;
  try {
    const result = await env.AI.run(model, {
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: input },
      ],
      // @cf/meta/llama-3.2-3b-instruct does not use Workers AI
      // response_format/json_schema. The prompt plus parseAiUnifiedIntent
      // provide the bounded JSON contract and local validation.
      max_tokens: 320,
      temperature: 0,
    });
    const raw = aiResponseText(result);
    if (!raw) {
      logAiObservation(true, null, 0, Date.now() - started, "empty_response", trace);
      return { attempted: true, intent: null, validationResult: "empty_response", usage: aiUsage(result) };
    }
    const parsedIntent = parseAiUnifiedIntent(raw);
    const intent = parsedIntent ? normalizeAiUnifiedIntent(parsedIntent, input) : null;
    const validationResult = intent ? "schema_valid" : "schema_invalid";
    logAiObservation(true, intent, intent?.confidence ?? 0, Date.now() - started, validationResult, trace);
    return { attempted: true, intent, validationResult, usage: aiUsage(result) };
  } catch (error) {
    logAiObservation(true, null, 0, Date.now() - started, "ai_error", trace);
    return { attempted: true, intent: null, validationResult: "ai_error", errorKind: aiErrorKind(error), usage: null };
  }
}

async function parseSemanticWithAi(
  env: Env,
  input: string,
  organizationId: string,
  trace?: RuntimeTrace,
): Promise<SemanticAiResult> {
  return parseSemanticWithAiModel(env, input, organizationId, SEMANTIC_AI_MODEL, trace, true);
}

function intentDateIsCurrent(intent: UnifiedIntent): boolean {
  return intent.date === null || intent.date === "today" || intent.date === today();
}

async function handleUnifiedIntent(
  env: Env,
  event: LineEvent,
  eventId: string,
  groupId: string,
  state: GroupState,
  intent: UnifiedIntent,
  accountName: string,
): Promise<string> {
  if (intent.intent === "unknown") return safeRejectionReply(accountName);

  if (intent.intent === "record_mortality" || intent.intent === "record_cull" || intent.intent === "record_feed" || intent.intent === "record_water" || intent.intent === "record_shipment") {
    if (!state.organizationId || !intentDateIsCurrent(intent)) return safeRejectionReply(accountName);
    const draft = operationalDraftFromUnified(intent);
    if (!draft) return safeRejectionReply(accountName);
    if (intent.needsConfirmation) draft.requiresFarmConfirmation = true;
    return handleOperationalDraft(env, event, eventId, groupId, state, draft, accountName);
  }

  if (intent.intent === "record_inventory") {
    if (state.status !== "bound" || !state.farmId || intent.quantity === null || intent.houseText === null) {
      return safeOperationalBindingReply(accountName, state);
    }
    await env.DB.prepare(
      `INSERT INTO daily_records
        (group_id, farm_id, record_date, house, record_type, amount, event_id, actor_user_id)
       VALUES (?, ?, ?, ?, 'inventory', ?, ?, ?)
       ON CONFLICT(event_id) DO NOTHING`,
    )
      .bind(groupId, state.farmId, today(), intent.houseText, intent.quantity, eventId, event.source?.userId ?? null)
      .run();
    return `${botName(accountName)}\n✅ 已登記\n${intent.houseText}目前存欄：${intent.quantity.toLocaleString()}隻`;
  }

  if (intent.intent === "query_today_mortality") {
    if (!state.organizationId || !intentDateIsCurrent(intent)) return safeRejectionReply(accountName);
    return todayMortalityReply(env, groupId, state.organizationId, intent.houseText ?? undefined, accountName);
  }
  if (intent.intent === "query_today_mortality_top") {
    if (!state.organizationId || !intentDateIsCurrent(intent)) return safeRejectionReply(accountName);
    return mortalityTopReply(env, groupId, state.organizationId, 1, accountName);
  }
  if (intent.intent === "query_recent_mortality_top") {
    if (!state.organizationId) return safeRejectionReply(accountName);
    const days = intent.period === "3d" ? 3 : intent.period === "7d" ? 7 : intent.period === "14d" ? 14 : null;
    return mortalityTopReply(env, groupId, state.organizationId, days, accountName);
  }
  if (intent.intent === "query_farm_mortality") {
    if (!state.organizationId || !intentDateIsCurrent(intent) || !intent.farmText) return safeRejectionReply(accountName);
    const lookup = await resolveFarmQuery(env, state.organizationId, intent.farmText, accountName);
    if (!lookup.farm) return lookup.reply ?? safeRejectionReply(accountName);
    return farmTodayMortalityReply(env, groupId, state.organizationId, lookup.farm, intent.houseText ?? undefined, accountName);
  }

  if (intent.intent === "query_farm_list" || intent.intent === "query_equity" || intent.intent === "query_farm_profit_list" || intent.intent === "query_my_equity" || intent.intent === "query_farm_profit" || intent.intent === "query_portfolio_profit" || intent.intent === "query_investor_profit") {
    if (!state.organizationId) return unboundReply(accountName);
    if (intent.intent === "query_farm_list") return farmListReply(env, state.organizationId, accountName);
    if (intent.intent === "query_equity") return equityReply(env, state.organizationId, accountName);
    if (intent.intent === "query_farm_profit_list") return farmProfitListReply(env, state.organizationId, accountName);
    if (intent.intent === "query_my_equity") return myEquityReply(env, state.organizationId, event.source?.userId, accountName);
    if (intent.intent === "query_farm_profit") {
      return intent.farmText ? farmProfitReply(env, state.organizationId, intent.farmText, accountName) : safeRejectionReply(accountName);
    }
    if (intent.intent === "query_portfolio_profit") return portfolioProfitReply(env, state.organizationId, accountName);
    return myProfitReply(env, state.organizationId, event.source?.userId, accountName);
  }

  if (intent.intent === "query_current_stock") {
    if (!state.organizationId) return unboundReply(accountName);
    let farmId: string | undefined;
    if (intent.farmText) {
      const lookup = await resolveFarmQuery(env, state.organizationId, intent.farmText, accountName);
      if (!lookup.farm) return lookup.reply ?? safeRejectionReply(accountName);
      farmId = lookup.farm.id;
    }
    const derived = await derivedCurrentStockReply(env, state.organizationId, intent.houseText ?? undefined, accountName, farmId);
    if (derived) return derived;
    if (farmId) return `${botName(accountName)}\n目前尚未建立 ${intent.houseText ?? "雞舍"} 的 flock 存欄主檔，沒有自行推算。`;
    if (state.status !== "bound" || !state.farmId) return safeOperationalBindingReply(accountName, state);
    return inventoryReply(env, groupId, intent.houseText ?? undefined, accountName);
  }
  if (intent.intent === "query_flock_age") {
    if (!state.organizationId) return unboundReply(accountName);
    let farmId: string | undefined;
    if (intent.farmText) {
      const lookup = await resolveFarmQuery(env, state.organizationId, intent.farmText, accountName);
      if (!lookup.farm) return lookup.reply ?? safeRejectionReply(accountName);
      farmId = lookup.farm.id;
    }
    return flockAgeReply(env, state.organizationId, intent.houseText ?? undefined, accountName, farmId);
  }
  if (intent.intent === "query_upcoming_shipments") {
    if (!state.organizationId) return unboundReply(accountName);
    return upcomingShipmentsReply(env, state.organizationId, accountName);
  }
  if (state.status !== "bound" || (state.organizationId && !state.farmId)) return safeOperationalBindingReply(accountName, state);
  if (intent.intent === "query_daily_summary") return summaryReply(env, groupId, intent.houseText ?? undefined);
  return safeRejectionReply(accountName);
}

async function lineAnalysisScope(
  env: Env,
  groupId: string,
  lineUserId: string | undefined,
  state: GroupState,
): Promise<AnalysisScope> {
  if (lineUserId) {
    const context = await env.DB.prepare(
      `SELECT farm_id AS farmId, house_id AS houseId, flock_id AS flockId
         FROM line_operational_contexts
        WHERE line_group_id = ? AND line_user_id = ? LIMIT 1`,
    ).bind(groupId, lineUserId).first<{ farmId: string; houseId: string | null; flockId: string | null }>();
    if (context?.flockId) return { type: "flock", id: context.flockId };
    if (context?.houseId) return { type: "house", id: context.houseId };
    if (context?.farmId) return { type: "farm", id: context.farmId };
  }
  if (state.farmId) return { type: "farm", id: state.farmId };
  return { type: "organization", id: "organization" };
}

function analysisLineReply(accountName: string, report: Awaited<ReturnType<typeof runReadOnlyAnalysis>>["report"]): string {
  const causes = report.possibleCauses.map((cause) => `- ${cause.text}（證據${cause.evidence === "strong" ? "較強" : cause.evidence === "medium" ? "中等" : "較弱"}）`);
  return [
    `${botName(accountName)} AI 營運分析`,
    `目前狀態：${report.currentStatus}`,
    `主要發現：${report.findings.length ? report.findings.join("；") : "目前沒有足夠資料。"}`,
    `可能原因：${causes.length ? causes.join(" ") : "目前沒有足夠證據。"}`,
    `風險：${report.risks.length ? report.risks.join("；") : "未發現已驗證風險。"}`,
    `建議：${report.recommendations.length ? report.recommendations.join("；") : "目前沒有建議。"}`,
    `資料限制：${report.limitations.length ? report.limitations.join("；") : "無。"}`,
  ].join("\n");
}

function menuFarmChoices(candidates: FarmCandidate[]): MenuFarm[] {
  return candidates.map((candidate) => ({
    id: candidate.farmId,
    name: candidate.farmName,
    environment: candidate.environment,
  }));
}

async function menuFarmList(env: Env, organizationId: string): Promise<MenuFarm[]> {
  const resolver = await loadFarmResolver(env, organizationId);
  return menuFarmChoices(resolver.allCandidates());
}

function menuTemperature(value: number | null, at: string | null): string {
  if (value === null || !Number.isFinite(Number(value))) return "尚無資料";
  const formatted = Number(value).toFixed(1).replace(/\.0$/u, "");
  return `${formatted}°C${at ? `（${at}）` : ""}`;
}

async function menuWeatherRow(env: Env, date?: string): Promise<{
  weatherDate: string;
  condition: string | null;
  maxTemperatureC: number | null;
  maxTemperatureAt: string | null;
  minTemperatureC: number | null;
  minTemperatureAt: string | null;
} | null> {
  const filter = date ? "AND w.weather_date = ?" : "AND w.weather_date <= ?";
  const row = await env.DB.prepare(
    `SELECT w.weather_date AS weatherDate, w.weather_condition AS condition,
            w.max_temperature_c AS maxTemperatureC, w.max_temperature_at AS maxTemperatureAt,
            w.min_temperature_c AS minTemperatureC, w.min_temperature_at AS minTemperatureAt
       FROM weather_scope_daily w
       JOIN weather_scopes s ON s.id = w.weather_scope_id
      WHERE s.scope_key = 'yunlin-county-tw'
        AND s.active = 1
        AND w.fetch_status IN ('captured', 'backfilled')
        ${filter}
      ORDER BY w.weather_date DESC
      LIMIT 1`,
  ).bind(date ?? taipeiDate()).first<{
    weatherDate: string;
    condition: string | null;
    maxTemperatureC: number | null;
    maxTemperatureAt: string | null;
    minTemperatureC: number | null;
    minTemperatureAt: string | null;
  }>();
  return row ?? null;
}

async function menuTodaySummaryReply(
  env: Env,
  organizationId: string,
  accountName: string,
  trace?: RuntimeTrace,
): Promise<string> {
  const day = taipeiDate();
  traceMark(trace, "d1_query_start_ms");
  const [operations, abnormalities, flocks, weather] = await Promise.all([
    env.DB.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN intent = 'mortality' THEN quantity ELSE 0 END), 0) AS mortality,
         COALESCE(SUM(CASE WHEN intent = 'cull' THEN quantity ELSE 0 END), 0) AS cull,
         COALESCE(SUM(CASE WHEN intent = 'shipment' THEN quantity ELSE 0 END), 0) AS shipment
       FROM operational_events
      WHERE organization_id = ? AND event_date = ? AND reversed_at IS NULL`,
    ).bind(organizationId, day).first<{ mortality: number; cull: number; shipment: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count
         FROM abnormal_events
        WHERE organization_id = ? AND occurred_date = ? AND status = 'active'`,
    ).bind(organizationId, day).first<{ count: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count
         FROM flocks k JOIN farms f ON f.id = k.farm_id
        WHERE f.organization_id = ? AND f.active = 1 AND k.status = 'active'`,
    ).bind(organizationId).first<{ count: number }>(),
    menuWeatherRow(env, day),
  ]);
  traceMark(trace, "d1_query_complete_ms");
  const lines = [
    `${botName(accountName)} 📊 今日營運`,
    `• 今日死亡：${formatAmount(Number(operations?.mortality ?? 0))} 隻`,
    `• 今日淘汰：${formatAmount(Number(operations?.cull ?? 0))} 隻`,
    `• 今日異常：${formatAmount(Number(abnormalities?.count ?? 0))} 筆`,
    `• 進行中批次：${formatAmount(Number(flocks?.count ?? 0))}`,
    `• 今日出雞：${formatAmount(Number(operations?.shipment ?? 0))} 隻`,
  ];
  if (weather) {
    lines.push(
      "🌤️ 雲林天氣",
      `資料日期：${weather.weatherDate}`,
      `最高溫：${menuTemperature(weather.maxTemperatureC, weather.maxTemperatureAt)}`,
      `最低溫：${menuTemperature(weather.minTemperatureC, weather.minTemperatureAt)}`,
    );
  }
  traceMark(trace, "summary_build_complete_ms");
  return lines.join("\n");
}

async function menuFarmSummaryReply(env: Env, organizationId: string, farmId: string, accountName: string, houseId?: string): Promise<string> {
  const farm = await env.DB.prepare(
    `SELECT id, name, environment, farm_structure_mode AS structureMode
       FROM farms
      WHERE id = ? AND organization_id = ? AND active = 1
      LIMIT 1`,
  ).bind(farmId, organizationId).first<FarmRow>();
  if (!farm) return `${botName(accountName)}\n⚠️ 找不到可查詢的雞場。`;
  const houses = await activeHousesForFarm(env, farm.id);
  const selectedHouse = houseId ? houses.find((house) => house.id === houseId) : undefined;
  if (houseId && !selectedHouse) return `${botName(accountName)}\n⚠️ 找不到這個雞舍，沒有執行查詢。`;
  const flocks = await activeFlocks(env, organizationId, selectedHouse?.name, farm.id);
  const lines = [
    `${botName(accountName)} ${farmDisplayName(farm)}`,
    `雞舍：${selectedHouse?.name ?? (houses.length ? houses.map((house) => house.name).join("、") : "全場／尚未建立雞舍")}`,
    `進行中批次：${flocks.length ? flocks.map((flock) => `${flock.batchCode}（${flock.houseName}）`).join("、") : "目前沒有"}`,
  ];
  if (flocks.length) {
    lines.push(
      ...flocks.map((flock) => `• ${flock.batchCode}｜${flock.houseName}｜日齡 ${flockAgeDays(flock.chickInDate, taipeiDate())}日｜預計出雞 ${flock.expectedShipmentDate ?? "未設定"}`),
    );
  }
  const stock = await derivedCurrentStockReply(env, organizationId, selectedHouse?.name, accountName, farm.id);
  if (stock) lines.push("目前存欄：", ...stock.split("\n").slice(1));
  return lines.join("\n");
}

async function menuFlockSummaryReply(env: Env, organizationId: string, farmId: string, flockId: string, accountName: string): Promise<string> {
  const flock = await env.DB.prepare(
    `SELECT fl.id, fl.batch_code AS batchCode, fl.chick_in_date AS chickInDate,
            fl.initial_count AS initialCount, fl.expected_shipment_date AS expectedShipmentDate,
            h.name AS houseName, f.name AS farmName, f.environment AS farmEnvironment
       FROM flocks fl
       JOIN houses h ON h.id = fl.house_id AND h.active = 1
       JOIN farms f ON f.id = fl.farm_id AND f.active = 1
      WHERE fl.id = ? AND fl.farm_id = ? AND f.organization_id = ? AND fl.status = 'active'
      LIMIT 1`,
  ).bind(flockId, farmId, organizationId).first<{
    id: string;
    batchCode: string;
    chickInDate: string;
    initialCount: number;
    expectedShipmentDate: string | null;
    houseName: string;
    farmName: string;
    farmEnvironment: "production" | "test";
  }>();
  if (!flock) return `${botName(accountName)}\n⚠️ 找不到可查詢的進行中批次。`;
  const adjustments = await env.DB.prepare(
    `SELECT intent, quantity
       FROM operational_events
      WHERE organization_id = ? AND flock_id = ? AND reversed_at IS NULL
        AND intent IN ('mortality', 'cull', 'shipment')`,
  ).bind(organizationId, flock.id).all<{ intent: StockAdjustment["intent"]; quantity: number }>();
  const stock = deriveCurrentStock(flock.initialCount, adjustments.results);
  return [
    `${botName(accountName)} ${farmDisplayName({ name: flock.farmName, environment: flock.farmEnvironment })}`,
    `批次：${flock.batchCode}`,
    `雞舍：${flock.houseName}`,
    `日齡：${flockAgeDays(flock.chickInDate, taipeiDate())}日（入雛 ${flock.chickInDate}）`,
    `目前存欄：${formatAmount(stock)}隻`,
    `預計出雞：${flock.expectedShipmentDate ?? "未設定"}`,
  ].join("\n");
}

function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

async function menuRecentAbnormalReply(env: Env, organizationId: string, accountName: string, days?: number): Promise<string> {
  const day = taipeiDate();
  const since = days && days > 0 ? dateOffset(day, days - 1) : null;
  const rows = await (since
    ? env.DB.prepare(
      `SELECT f.name AS farmName, f.environment AS farmEnvironment,
              a.occurred_date AS occurredDate, a.occurred_at AS occurredAt,
              a.raw_text AS rawText
         FROM abnormal_events a JOIN farms f ON f.id = a.farm_id
        WHERE a.organization_id = ? AND a.status = 'active' AND a.occurred_date >= ?
        ORDER BY a.occurred_at DESC, a.created_at DESC
        LIMIT 15`,
    ).bind(organizationId, since)
    : env.DB.prepare(
      `SELECT f.name AS farmName, f.environment AS farmEnvironment,
              a.occurred_date AS occurredDate, a.occurred_at AS occurredAt,
              a.raw_text AS rawText
         FROM abnormal_events a JOIN farms f ON f.id = a.farm_id
        WHERE a.organization_id = ? AND a.status = 'active'
        ORDER BY a.occurred_at DESC, a.created_at DESC
        LIMIT 15`,
    ).bind(organizationId)).all<{ farmName: string; farmEnvironment: "production" | "test"; occurredDate: string; occurredAt: string | null; rawText: string }>();
  if (!rows.results.length) return `${botName(accountName)}\n⚠️ 目前沒有異常紀錄。`;
  const grouped = new Map<string, string[]>();
  for (const row of rows.results) {
    const farm = farmDisplayName({ name: row.farmName, environment: row.farmEnvironment });
    const time = row.occurredAt && row.occurredAt.length >= 16 ? ` ${row.occurredAt.slice(11, 16)}` : "";
    const list = grouped.get(farm) ?? [];
    list.push(`• ${row.occurredDate}${time}｜${row.rawText}`);
    grouped.set(farm, list);
  }
  return [`${botName(accountName)} ⚠️ 最近異常`, ...[...grouped.entries()].flatMap(([farm, items]) => [farm, ...items])].join("\n");
}

async function menuWeatherReply(env: Env, accountName: string): Promise<string> {
  const row = await menuWeatherRow(env);
  if (!row) return `${botName(accountName)}\n目前尚無完整的雲林每日氣象紀錄。`;
  return [
    `${botName(accountName)} 🌤️ 雲林氣象`,
    `資料日期：${row.weatherDate}`,
    `天氣：${row.condition ?? "尚無概況"}`,
    "最高溫：",
    menuTemperature(row.maxTemperatureC, row.maxTemperatureAt),
    "最低溫：",
    menuTemperature(row.minTemperatureC, row.minTemperatureAt),
  ].join("\n");
}

async function menuAuditReply(env: Env, organizationId: string, accountName: string): Promise<string> {
  const rows = await env.DB.prepare(
    `SELECT created_at AS createdAt, source, action, entity_type AS entityType,
            reason, before_json AS beforeJson, after_json AS afterJson
       FROM audit_logs
      WHERE organization_id = ?
        AND action IN ('correct', 'corrected', 'reverse', 'reversal', 'move', 'split', 'cancel', 'pending_correction')
      ORDER BY created_at DESC, id DESC
      LIMIT 12`,
  ).bind(organizationId).all<{ createdAt: string; source: string; action: string; entityType: string; reason: string | null; beforeJson: string | null; afterJson: string | null }>();
  if (!rows.results.length) return `${botName(accountName)}\n📋 目前沒有可顯示的歷史紀錄。`;
  const sourceLabel = (source: string): string => source === "line" ? "LINE" : source === "web" ? "WEB" : source.toUpperCase();
  return [
    `${botName(accountName)} 📋 歷史紀錄`,
    ...rows.results.map((row) => {
      const before = row.beforeJson ? "有修改前" : "";
      const after = row.afterJson ? "有修改後" : "";
      return `${row.createdAt.slice(0, 16).replace("T", " ")}｜${sourceLabel(row.source)}｜${row.action}\n${before}${before && after ? "／" : ""}${after}${row.reason ? `\n原因：${row.reason.slice(0, 80)}` : ""}`;
    }),
  ].join("\n");
}

const MENU_QUICK_RECORD_TEXT = "✍️ 快速紀錄\n\n直接告訴我發生什麼即可。\n\n• 死亡5\n• 咳嗽 臭腳\n• 死亡3 水簾故障\n• 氣溫太高\n\n可以分開連續輸入，我會幫你整理。";
const MENU_CORRECTION_TEXT = "✏️ 更正紀錄\n\n直接告訴我哪裡錯即可。\n\n• 死亡不是5，是3\n• 咳嗽不要記\n• 不是臭腳，是白冠\n• 剛剛全部是東勢場\n• 剛剛全部取消";
const MENU_HELP_TEXT = "常用方式：\n\n紀錄：死亡5 咳嗽\n查詢：今天死亡\n更正：死亡不是5是3\n分析：最近哪一場需要注意？\n\n輸入「選單」可隨時開啟功能選單。";

function isRecordSuccessReply(reply: string | undefined): boolean {
  return Boolean(reply && /^(?:✅ 已紀錄至|✅ 已完成紀錄)/u.test(reply));
}

function quickRecordReplyMessages(
  result: {
    reply?: string;
    quickReplyFarms?: Array<{ id: string; name: string; environment: "production" | "test" }>;
    quickReplyHouses?: Array<{ id: string; name: string }>;
    quickReplyHouseFarm?: { id: string; name: string; environment: "production" | "test" };
  },
  accountName: string,
): LineReplyMessage[] {
  const text = result.reply ?? safeRejectionReply(accountName);
  if (result.quickReplyFarms?.length) {
    return [buildTextMessage(text, buildFarmQuickReply(result.quickReplyFarms, "pending_select_farm") ?? undefined)];
  }
  if (result.quickReplyHouses?.length && result.quickReplyHouseFarm) {
    return [buildTextMessage(text, buildPendingHouseQuickReply(result.quickReplyHouseFarm, result.quickReplyHouses) ?? undefined)];
  }
  return [buildTextMessage(text, isRecordSuccessReply(result.reply) ? buildPostRecordActions() : undefined)];
}

function validQuickRecordCategory(value: string | null): QuickRecordCategory | null {
  return value && ["mortality", "cull", "health", "equipment", "environment", "disaster", "custom"].includes(value)
    ? value as QuickRecordCategory
    : null;
}

function quickShortcutPrompt(type: QuickRecordCategory): LineReplyMessage[] {
  if (type === "mortality" || type === "cull") {
    const label = type === "mortality" ? "死亡" : "淘汰";
    return [buildTextMessage(`🐔 ${label}幾隻？\n也可以直接輸入「${label}7」。`, buildQuickRecordCountReplies(type))];
  }
  if (type === "custom") return [buildTextMessage("請直接輸入看到的情況即可。\n例如：雞一直甩頭、飼料晚一天到。")];
  const labels: Record<string, string> = {
    health: "健康異常",
    equipment: "設備異常",
    environment: "環境異常",
    disaster: "災損",
  };
  return [buildTextMessage(`⚠️ ${labels[type]}\n請選常見紀錄，或按「其他」直接輸入。`, buildQuickRecordAbnormalReplies(type))];
}

async function handleQuickRecordPostback(
  env: Env,
  event: LineEvent,
  eventId: string,
  groupId: string,
  organizationId: string,
  accountName: string,
  action: string,
  params: URLSearchParams,
): Promise<LineReplyMessage[]> {
  if (action === "quick_record_category") {
    const type = validQuickRecordCategory(params.get("type"));
    return type ? quickShortcutPrompt(type) : [buildTextMessage("⚠️ 這個紀錄類別無法辨識，請重新輸入「選單」。")];
  }
  if (action === "quick_record_count") {
    const type = params.get("type");
    if (type !== "mortality" && type !== "cull") return [buildTextMessage("⚠️ 這個數量選項無法辨識。")];
    const count = params.get("count");
    if (count === "other") return [buildTextMessage(`請直接輸入${type === "mortality" ? "死亡" : "淘汰"}數量，例如：${type === "mortality" ? "死亡" : "淘汰"}7。`)];
    if (!count || !/^(?:1|2|3|5|10|20)$/u.test(count)) return [buildTextMessage("⚠️ 這個數量選項無法辨識。")];
    const result = await handleQuickRecordInput(env, event, `${type === "mortality" ? "死亡" : "淘汰"} ${count}`, eventId, groupId, organizationId, accountName);
    return quickRecordReplyMessages(result, accountName);
  }
  if (action === "quick_record_abnormal") {
    const type = params.get("type");
    if (type !== "health" && type !== "equipment" && type !== "environment" && type !== "disaster") {
      return [buildTextMessage("⚠️ 這個異常類別無法辨識。")];
    }
    const text = quickAbnormalShortcutText(type, params.get("key") ?? "");
    if (!text) return [buildTextMessage("⚠️ 這個異常選項已失效，請重新輸入「選單」。")];
    const result = await handleQuickRecordInput(env, event, text, eventId, groupId, organizationId, accountName);
    return quickRecordReplyMessages(result, accountName);
  }
  if (action === "quick_record_custom") {
    const type = params.get("type");
    if (type === "correction" || type === "correction_quantity") return [buildTextMessage(MENU_CORRECTION_TEXT, buildCorrectionQuickReplies())];
    if (type === "mortality" || type === "cull") return [buildTextMessage(`請直接輸入${type === "mortality" ? "死亡" : "淘汰"}數量，例如：${type === "mortality" ? "死亡" : "淘汰"}7。`)];
    return [buildTextMessage("請直接輸入看到的情況即可，不需要填分類或嚴重程度。")];
  }
  return [buildTextMessage("⚠️ 這個快速紀錄操作目前無法辨識。")];
}

interface AmbientCandidateRow {
  id: string;
  organizationId: string;
  lineGroupId: string;
  hourBucket: string;
  candidateJson: string;
  status: "pending" | "confirmed" | "ignored" | "snoozed" | "expired";
  expiresAt: string;
  snoozedUntil: string | null;
  source: "ambient_digest";
  reviewUserId: string | null;
  reviewKind: "item_modify" | "conflict_quantity" | null;
  reviewCandidateIndex: number | null;
  reviewExpiresAt: string | null;
  terminalReason: string | null;
  terminalRawText: string | null;
  workflowHistoryJson: string;
}

async function loadAmbientCandidate(
  env: Env,
  groupId: string,
  organizationId: string,
  candidateId: string,
): Promise<{ row: AmbientCandidateRow; bundle: AmbientCandidateBundle } | null> {
  const row = await env.DB.prepare(
    `SELECT id, organization_id AS organizationId, line_group_id AS lineGroupId,
            hour_bucket AS hourBucket, candidate_json AS candidateJson,
            status, expires_at AS expiresAt, snoozed_until AS snoozedUntil, source,
            review_user_id AS reviewUserId, review_kind AS reviewKind,
            review_candidate_index AS reviewCandidateIndex,
            review_expires_at AS reviewExpiresAt,
            terminal_reason AS terminalReason, terminal_raw_text AS terminalRawText,
            workflow_history_json AS workflowHistoryJson
       FROM ambient_digest_candidates
      WHERE id = ? AND line_group_id = ? AND organization_id = ?
      LIMIT 1`,
  ).bind(candidateId, groupId, organizationId).first<AmbientCandidateRow>();
  if (!row) return null;
  const snoozeDue = row.status === "snoozed" && row.snoozedUntil !== null && Date.parse(row.snoozedUntil) <= Date.now();
  if (row.status !== "pending" && !snoozeDue) return null;
  if (snoozeDue) {
    await env.DB.prepare(
      `UPDATE ambient_digest_candidates
          SET status = 'pending', snoozed_until = NULL
        WHERE id = ? AND line_group_id = ? AND organization_id = ? AND status = 'snoozed'`,
    ).bind(row.id, row.lineGroupId, row.organizationId).run();
    row.status = "pending";
    row.snoozedUntil = null;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(row.candidateJson); } catch { return null; }
  const bundle = validateAmbientCandidateBundle(parsed);
  return bundle ? { row, bundle } : null;
}

interface AmbientCandidateInboxEntry {
  row: AmbientCandidateRow;
  bundle: AmbientCandidateBundle;
}

async function loadAmbientCandidateInbox(
  env: Env,
  groupId: string,
  organizationId: string,
  now: string,
): Promise<AmbientCandidateInboxEntry[]> {
  const rows = await env.DB.prepare(
    `SELECT id, organization_id AS organizationId, line_group_id AS lineGroupId,
            hour_bucket AS hourBucket, candidate_json AS candidateJson,
            status, expires_at AS expiresAt, snoozed_until AS snoozedUntil, source,
            review_user_id AS reviewUserId, review_kind AS reviewKind,
            review_candidate_index AS reviewCandidateIndex,
            review_expires_at AS reviewExpiresAt,
            terminal_reason AS terminalReason, terminal_raw_text AS terminalRawText,
            workflow_history_json AS workflowHistoryJson
       FROM ambient_digest_candidates
      WHERE line_group_id = ? AND organization_id = ?
        AND (status = 'pending' OR (status = 'snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= ?))
      ORDER BY created_at, id`,
  ).bind(groupId, organizationId, now).all<AmbientCandidateRow>();
  const entries: AmbientCandidateInboxEntry[] = [];
  for (const row of rows.results) {
    let parsed: unknown;
    try { parsed = JSON.parse(row.candidateJson); } catch {
      console.log(JSON.stringify({ event: "ambient_candidate_render_failure", group_id_suffix: groupId.slice(0, 4), candidate_id: row.id, error_class: "invalid_candidate_json" }));
      continue;
    }
    const bundle = validateAmbientCandidateBundle(parsed);
    if (!bundle) {
      console.log(JSON.stringify({ event: "ambient_candidate_render_failure", group_id_suffix: groupId.slice(0, 4), candidate_id: row.id, error_class: "invalid_candidate_schema" }));
      continue;
    }
    entries.push({ row, bundle });
  }
  return entries;
}

function candidateWorkflowHistory(row: AmbientCandidateRow): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(row.workflowHistoryJson || "[]");
    return Array.isArray(parsed) ? parsed.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object")) : [];
  } catch {
    return [];
  }
}

function candidateWorkflowSummary(bundle: AmbientCandidateBundle): Record<string, unknown> {
  return {
    candidates: bundle.candidates.map((candidate) => ({
      eventType: candidate.eventType,
      farmText: candidate.farmText,
      houseText: candidate.houseText,
      flockText: candidate.flockText,
      caretakerText: candidate.caretakerText,
      caretakerClues: candidate.caretakerClues,
      evidence: (candidate.evidence ?? []).slice(0, 24),
      conflictEvidence: (candidate.conflictEvidence ?? []).slice(0, 4),
      userOverrides: candidate.userOverrides,
      state: candidate.state,
      reconciliationStatus: candidate.reconciliation?.status,
      items: candidate.items.map((item) => ({ type: item.type, quantity: item.quantity, raw: item.raw })),
    })),
  };
}

async function appendCandidateWorkflowHistory(
  env: Env,
  row: AmbientCandidateRow,
  event: {
    action: string;
    actorId: string;
    rawText?: string;
    field?: string;
    before?: unknown;
    after?: unknown;
    terminalReason?: string;
  },
): Promise<void> {
  const history = candidateWorkflowHistory(row);
  history.push({
    action: event.action,
    actorId: event.actorId,
    at: new Date().toISOString(),
    ...(event.rawText ? { rawText: event.rawText.slice(0, 500) } : {}),
    ...(event.field ? { field: event.field } : {}),
    ...(event.before !== undefined ? { before: event.before } : {}),
    ...(event.after !== undefined ? { after: event.after } : {}),
  });
  const compact = history.slice(-40);
  await env.DB.prepare(
    `UPDATE ambient_digest_candidates
        SET workflow_history_json = ?,
            terminal_reason = COALESCE(?, terminal_reason),
            terminal_raw_text = COALESCE(?, terminal_raw_text)
      WHERE id = ? AND line_group_id = ? AND organization_id = ?`,
  ).bind(
    JSON.stringify(compact),
    event.terminalReason ?? null,
    event.rawText ? event.rawText.slice(0, 500) : null,
    row.id,
    row.lineGroupId,
    row.organizationId,
  ).run();
}

function candidateEditableFields(candidate: AmbientCandidate): CandidateRepairField[] {
  const fields: CandidateRepairField[] = [];
  if (candidate.farmText || candidate.caretakerText || candidate.resolution?.resolvedFarmId || candidate.resolution?.candidateFarmIds?.length) fields.push("farm");
  if (candidate.houseText || candidate.resolution?.resolvedHouseId || candidate.resolution?.candidateHouseIds?.length) fields.push("house");
  if (candidate.flockText || candidate.resolution?.resolvedFlockId || candidate.resolution?.candidateFlockIds?.length) fields.push("flock");
  if (candidate.items.some((item) => item.type === "mortality" || item.type === "cull")) fields.push("quantity");
  if (candidate.items.some((item) => item.type === "abnormal")) fields.push("event");
  return fields;
}

function candidateDisplayLabel(entry: AmbientCandidateInboxEntry, index: number): string {
  const candidate = entry.bundle.candidates.find((item) => item.items.length > 0) ?? entry.bundle.candidates[0];
  const item = candidate?.items[0];
  const itemText = item?.type === "mortality"
    ? `死亡${item.quantity ?? "?"}`
    : item?.type === "cull"
      ? `淘汰${item.quantity ?? "?"}`
      : item?.raw ?? "營運資訊";
  const farm = candidate?.farmText ?? "雞場待確認";
  return `${index + 1}. ${farm}｜${itemText}`.slice(0, 60);
}

async function renderCandidateEditMenu(
  entry: AmbientCandidateInboxEntry,
): Promise<LineReplyMessage[]> {
  const candidate = entry.bundle.candidates.find((item) => item.items.length > 0) ?? entry.bundle.candidates[0];
  const fields = candidate ? candidateEditableFields(candidate) : [];
  const quickReply = buildAmbientCandidateEditReplies(entry.row.id, fields);
  return [buildTextMessage(
    "你想修改哪一項？已知的其他資料會保留。",
    quickReply ?? undefined,
  )];
}

async function loadSingleAmbientCandidateForAction(
  env: Env,
  groupId: string,
  organizationId: string,
  now: string,
  candidateId?: string,
): Promise<{ entry?: AmbientCandidateInboxEntry; entries: AmbientCandidateInboxEntry[] }> {
  const entries = await loadAmbientCandidateInbox(env, groupId, organizationId, now);
  if (candidateId) {
    const entry = entries.find((item) => item.row.id === candidateId);
    return { entry, entries };
  }
  return { entry: entries.length === 1 ? entries[0] : undefined, entries };
}

async function cancelAmbientCandidate(
  env: Env,
  entry: AmbientCandidateInboxEntry,
  actorId: string,
  rawText?: string,
): Promise<LineReplyMessage[]> {
  const result = await env.DB.prepare(
    `UPDATE ambient_digest_candidates
        SET status = 'ignored', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP,
            review_user_id = NULL, review_kind = NULL, review_candidate_index = NULL,
            review_expires_at = NULL, terminal_reason = 'cancelled', terminal_raw_text = ?
      WHERE id = ? AND line_group_id = ? AND organization_id = ?
        AND status IN ('pending', 'snoozed')`,
  ).bind(actorId, rawText?.slice(0, 500) ?? null, entry.row.id, entry.row.lineGroupId, entry.row.organizationId).run();
  if (!result.meta.changes) return [buildTextMessage("這筆待確認資訊已處理完成。")];
  await appendCandidateWorkflowHistory(env, entry.row, {
    action: "cancel",
    actorId,
    rawText,
    terminalReason: "cancelled",
  });
  return [buildTextMessage("✅ 已取消這筆待確認資料；原始聊天已完成整理，不會再次建立同一筆。正式資料沒有新增。")];
}

function ambientItemText(item: AmbientCandidate["items"][number]): string {
  if (item.type === "mortality") return `死亡${item.quantity ?? ""}`;
  if (item.type === "cull") return `淘汰${item.quantity ?? ""}`;
  return item.raw;
}

type AmbientBlockingField = "farm" | "house" | "flock" | "quantity" | "reconciliation" | "confirmation";

function ambientCandidateBlockingField(candidate: AmbientCandidate): AmbientBlockingField {
  if (candidate.state === "possibly_recorded") return "reconciliation";
  const resolution = candidate.resolution;
  const quantityUnknown = candidate.state === "unresolved_quantity"
    || candidate.items.some((item) => item.type !== "abnormal" && item.quantity === null)
    || (candidate.quantityConfidence === "unknown" && candidate.eventType !== "abnormal");
  const quantityConflict = candidate.conflict && /數量|死亡|淘汰/u.test(candidate.conflictText ?? "");
  if (quantityUnknown || quantityConflict) return "quantity";
  if (!resolution?.resolvedFarmId) return "farm";
  if (resolution.candidateHouseIds?.length && !resolution.resolvedHouseId) return "house";
  if (resolution.candidateFlockIds?.length && !resolution.resolvedFlockId) return "flock";
  if (candidate.conflict) return "farm";
  return "confirmation";
}

async function ambientDigestQuickReply(
  env: Env,
  organizationId: string,
  candidateId: string,
  bundle: AmbientCandidateBundle,
): Promise<ReturnType<typeof buildAmbientDigestReplies> | null> {
  const candidateIndex = bundle.candidates.findIndex((candidate) => candidate.items.length > 0);
  const candidate = candidateIndex >= 0 ? bundle.candidates[candidateIndex] : null;
  if (!candidate) return null;
  const field = ambientCandidateBlockingField(candidate);
  if (field === "farm") {
    const farms = await menuFarmList(env, organizationId);
    const compatibleIds = new Set(candidate.resolution?.candidateFarmIds ?? []);
    const choices = compatibleIds.size ? farms.filter((farm) => compatibleIds.has(farm.id)) : farms;
    return addAmbientCandidateEditReply(addAmbientCandidateCancelReply(
      buildFarmQuickReply(choices, "ambient_select_farm", { candidate: candidateId, item: String(candidateIndex) }),
      candidateId,
    ), candidateId);
  }
  if (field === "house") {
    const ids = candidate.resolution?.candidateHouseIds ?? [];
    const names = candidate.resolution?.candidateHouseNames ?? [];
    return addAmbientCandidateEditReply(addAmbientCandidateCancelReply(buildAmbientEntityQuickReply(
      "ambient_select_house",
      candidateId,
      candidateIndex,
      ids.map((id, index) => ({ id, label: names[index] ?? "雞舍", displayText: names[index] ?? "雞舍" })),
    ), candidateId), candidateId);
  }
  if (field === "flock") {
    const ids = candidate.resolution?.candidateFlockIds ?? [];
    const rows = ids.length
      ? await env.DB.prepare(
        `SELECT id, batch_code AS batchCode FROM flocks WHERE id IN (${ids.map(() => "?").join(",")}) AND status = 'active' ORDER BY batch_code, id`,
      ).bind(...ids).all<{ id: string; batchCode: string }>()
      : { results: [] as Array<{ id: string; batchCode: string }> };
    return addAmbientCandidateEditReply(addAmbientCandidateCancelReply(buildAmbientEntityQuickReply(
      "ambient_select_flock",
      candidateId,
      candidateIndex,
      rows.results.map((row) => ({ id: row.id, label: row.batchCode, displayText: row.batchCode })),
    ), candidateId), candidateId);
  }
  if (field === "quantity") return buildAmbientConflictReplies(candidateId);
  if (field === "reconciliation") return buildAmbientReconciliationReplies(candidateId);
  return buildAmbientConfirmationReplies(candidateId);
}

async function renderAmbientCandidateInbox(
  env: Env,
  organizationId: string,
  entries: AmbientCandidateInboxEntry[],
  newCandidateIds: Set<string> = new Set(),
): Promise<LineReplyMessage[]> {
  const total = entries.length;
  return Promise.all(entries.map(async (entry, index) => {
    const newLabel = newCandidateIds.has(entry.row.id) ? "｜新增" : "";
    const suffix = total > 1 ? `（第${index + 1}筆）` : "";
    const title = `📋 目前有 ${total} 筆待確認營運資訊${suffix}${newLabel}`;
    const quickReply = await ambientDigestQuickReply(env, organizationId, entry.row.id, entry.bundle);
    return buildTextMessage(formatAmbientCandidate(entry.bundle, title), quickReply ?? undefined);
  }));
}

function candidateStateLabel(candidate: AmbientCandidate): string {
  const labels: Record<string, string> = {
    new: "待確認新增紀錄",
    unresolved_entity: "雞場／舍別／批次尚未完全確定",
    unresolved_quantity: "數量尚未確定",
    conflict: "聊天內容有衝突",
    possibly_recorded: "可能已存在正式紀錄",
    already_recorded: "已比對到正式紀錄",
    no_actionable_event: "沒有可處理的營運事件",
    system_failure: "摘要系統故障",
  };
  return labels[candidate.state ?? "new"] ?? "待確認";
}

async function loadCandidateCaretakerRelations(
  env: Env,
  organizationId: string,
  candidate: AmbientCandidate,
): Promise<Array<{ caretakerName: string; farmName: string }>> {
  const clues = [...new Set((candidate.caretakerClues?.length
    ? candidate.caretakerClues
    : candidate.caretakerText
      ? [candidate.caretakerText]
      : []).map((value) => value.trim()).filter(Boolean))];
  if (!clues.length) return [];
  const rows = await env.DB.prepare(
    `SELECT c.name AS caretakerName, f.name AS farmName
       FROM caretakers c
       JOIN farm_caretaker_assignments a ON a.caretaker_id = c.id
       JOIN farms f ON f.id = a.farm_id
      WHERE c.organization_id = ? AND c.active = 1 AND f.organization_id = ? AND f.active = 1
      ORDER BY c.name, f.name`,
  ).bind(organizationId, organizationId).all<{ caretakerName: string; farmName: string }>();
  return rows.results.filter((row) => {
    const name = normalize(row.caretakerName);
    return clues.some((clueValue) => {
      const clue = normalize(clueValue);
      return name === clue || name.includes(clue) || clue.includes(name);
    });
  });
}

async function explainAmbientCandidate(
  env: Env,
  organizationId: string,
  entry: AmbientCandidateInboxEntry,
  accountName: string,
  topic?: ConversationV2Topic,
): Promise<LineReplyMessage[]> {
  const candidate = entry.bundle.candidates.find((item) => item.items.length > 0) ?? entry.bundle.candidates[0];
  if (!candidate) return [buildTextMessage(`${botName(accountName)}\n目前找不到這筆待確認資料。`)];
  const itemText = candidate.items.map((item) => {
    const label = item.type === "mortality" ? "死亡" : item.type === "cull" ? "淘汰" : item.raw;
    return `${label}${item.quantity === null ? "（未確認數量）" : `：${item.quantity}`}`;
  }).join("、");
  const lines = [
    `${botName(accountName)}｜這筆待確認資料目前的狀態`,
    `事件：${itemText || "尚無可確認項目"}`,
    `雞場：${candidate.farmText ?? "尚未確定"}`,
    `舍別：${candidate.houseText ?? "尚未確定／未提供"}`,
    `批次：${candidate.flockText ?? "尚未確定／未提供"}`,
    `狀態：${candidateStateLabel(candidate)}`,
  ];
  if (candidate.caretakerText) {
    lines.push(`原始聊天的飼養者線索：${candidate.caretakerText}`);
    const relations = await loadCandidateCaretakerRelations(env, organizationId, candidate);
    if (candidate.farmText && relations.length && !relations.some((row) => normalize(row.farmName) === normalize(candidate.farmText ?? ""))) {
      lines.push(`目前資料中的對應雞場：${relations.map((row) => row.farmName).join("、")}`);
      lines.push("這表示原始飼養者線索與你目前選的雞場不同；飼養者是線索，不會取代你的合法雞場選擇。" );
    } else if (relations.length) {
      lines.push(`目前資料中的對應雞場：${relations.map((row) => row.farmName).join("、")}`);
    } else {
      lines.push("目前資料沒有找到這個飼養者的有效雞場對應；這是低權重線索，不是雞場外鍵。" );
    }
  }
  if (candidate.userOverrides?.caretaker?.status === "dismissed") {
    lines.push("你已選擇不採用這個飼養者線索，系統保留原文，但不再把它當成目前不能完成的條件。" );
  } else if (candidate.userOverrides?.caretaker?.status === "overridden") {
    lines.push("你已明確選定雞場，因此目前以你的選擇為準；原始飼養者線索仍保留作為來源說明。" );
  }
  if (candidate.conflict || candidate.state === "conflict" || topic === "candidate_conflict" || topic === "caretaker_conflict") {
    lines.push(`衝突內容：${candidate.conflictText ?? "同一段聊天或線索出現不同說法。"}`);
    if (topic === "caretaker_conflict") {
      lines.push("這裡的衝突是飼養者線索與目前雞場／飼養者關聯不一致；飼養者線索只是參考，不會自動取代你明確選定的合法雞場。" );
    }
  }
  if (candidate.reconciliation?.status === "possibly_recorded") lines.push("對帳結果：可能與正式紀錄相近，仍需要你確認是否同一筆。" );
  if (candidate.reconciliation?.status === "already_recorded") lines.push("對帳結果：已有高信心正式紀錄，這筆不會直接新增第二筆。" );
  if (candidate.resolution?.status !== "resolved") lines.push(`目前下一個必要欄位：${ambientCandidateBlockingField(candidate) === "farm" ? "雞場" : ambientCandidateBlockingField(candidate) === "house" ? "舍別" : ambientCandidateBlockingField(candidate) === "flock" ? "批次" : ambientCandidateBlockingField(candidate) === "quantity" ? "數量" : "確認"}`);
  return [buildTextMessage(lines.join("\n"))];
}

interface CandidateConflictEvidence {
  conflictType: string;
  sourceEvidence: string[];
  structuredEvidence: AmbientCandidateEvidence[];
  structuredConflict: AmbientCandidateConflictEvidence | null;
  resolvedFacts: string[];
  databaseRelationships: string[];
  businessRule: string;
  isBlocking: boolean;
  blockingField: AmbientBlockingField;
  whyBlocking: string;
  canUserOverride: boolean;
  currentEffect: string;
  suggestedSafeOptions: string[];
}

async function getCandidateConflictEvidence(
  env: Env,
  organizationId: string,
  entry: AmbientCandidateInboxEntry,
): Promise<CandidateConflictEvidence> {
  const candidate = entry.bundle.candidates.find((item) => item.items.length > 0) ?? entry.bundle.candidates[0];
  if (!candidate) {
    return {
      conflictType: "candidate_missing",
      sourceEvidence: [],
      structuredEvidence: [],
      structuredConflict: null,
      resolvedFacts: [],
      databaseRelationships: [],
      businessRule: "找不到待確認資料。",
      isBlocking: false,
      blockingField: "confirmation",
      whyBlocking: "目前沒有可供說明的候選。",
      canUserOverride: false,
      currentEffect: "沒有資料變更。",
      suggestedSafeOptions: [],
    };
  }
  const blockingField = ambientCandidateBlockingField(candidate);
  let linkedSourceRows: Array<{ lineMessageId: string; eventTimestamp: string; text: string; lineUserId: string }> = [];
  const linkedIds = [...new Set([...(candidate.sourceMessageIds ?? []), ...(entry.bundle.sourceMessageIds ?? [])])].slice(0, 100);
  if (linkedIds.length) {
    try {
      linkedSourceRows = (await env.DB.prepare(
        `SELECT line_message_id AS lineMessageId, event_timestamp AS eventTimestamp,
                text, line_user_id AS lineUserId
           FROM ambient_chat_buffer
          WHERE organization_id = ? AND line_group_id = ?
            AND line_message_id IN (${linkedIds.map(() => "?").join(",")})
          ORDER BY event_timestamp, line_message_id`,
      ).bind(organizationId, entry.row.lineGroupId, ...linkedIds).all<typeof linkedSourceRows[0]>()).results;
    } catch {
      linkedSourceRows = [];
    }
  }
  const sourceEvidence = (candidate.rawTexts?.length ? candidate.rawTexts : linkedSourceRows.map((row) => row.text))
    .slice(0, 4).map((value) => value.slice(0, 160));
  const structuredEvidence = (candidate.evidence ?? []).length
    ? (candidate.evidence ?? []).slice(0, 48)
    : linkedSourceRows.slice(0, 24).map((row) => ({
      evidenceType: "source_fact" as const,
      field: "raw_source",
      normalizedValue: row.text.slice(0, 240),
      sourceRef: row.lineMessageId,
      sourceTimestamp: row.eventTimestamp,
      sourceUser: row.lineUserId,
      confidence: "low" as const,
      extractionSource: "deterministic" as const,
    }));
  const structuredConflict = candidate.conflictEvidence?.[0] ?? null;
  const resolvedFacts = [
    candidate.farmText ? `雞場：${candidate.farmText}` : "雞場：尚未確定",
    candidate.houseText ? `舍別：${candidate.houseText}` : "舍別：未提供或尚未確定",
    candidate.flockText ? `批次：${candidate.flockText}` : "批次：未提供或尚未確定",
    `${candidate.items[0]?.type === "mortality" ? "死亡" : candidate.items[0]?.type === "cull" ? "淘汰" : "事件"}：${candidate.items[0]?.quantity ?? "尚未確認"}`,
  ];
  const databaseRelationships: string[] = [];
  const caretakerClues = candidate.caretakerClues ?? (candidate.caretakerText ? [candidate.caretakerText] : []);
  if (caretakerClues.length) {
    const relations = await loadCandidateCaretakerRelations(env, organizationId, candidate);
    const clueLabel = caretakerClues.join("、");
    databaseRelationships.push(relations.length
      ? `資料庫中「${clueLabel}」目前對應：${[...new Set(relations.map((row) => row.farmName))].join("、")}`
      : `資料庫中找不到「${clueLabel}」的有效雞場關聯`);
  } else {
    databaseRelationships.push("目前這筆待確認資料沒有保存可識別的飼養者文字，因此無法從現有線索還原兩個飼養者姓名的逐一比較。");
  }
  const caretakerConflict = (candidate.conflicts ?? []).some((value) => /caretaker|飼養者|饲养者/u.test(value))
    || /飼養者|饲养者/u.test(candidate.conflictText ?? "");
  const conflictType = candidate.conflictText
    ?? (caretakerConflict ? "飼養者線索不一致" : "待確認資料有不同說法");
  const isBlocking = blockingField !== "confirmation";
  const businessRule = "正式死亡資料使用合法雞場與事件欄位寫入；飼養者線索不是 operational_events 的必要 foreign key。";
  const whyBlocking = isBlocking
    ? `目前系統把「${blockingField === "farm" ? "雞場／衝突" : blockingField}」視為下一個必要步驟，所以尚未進入正式確認。`
    : "目前沒有未完成的必要欄位，這個提示不會阻止正式確認。";
  const canUserOverride = caretakerConflict && Boolean(candidate.farmText);
  const currentEffect = isBlocking
    ? "尚未建立正式營運紀錄；這筆待確認資料仍在等待處理。"
    : "不會因這個線索自動新增、修改或刪除正式紀錄。";
  const suggestedSafeOptions = canUserOverride
    ? ["保留已選雞場，將飼養者只當作來源說明", "明確指定或修改雞場", "忽略這個非必要線索", "查看目前還缺的必要欄位"]
    : ["查看目前還缺的必要欄位", "修改這筆待確認資料", "保留待確認或取消這筆"];
  return {
    conflictType,
    sourceEvidence,
    structuredEvidence,
    structuredConflict,
    resolvedFacts,
    databaseRelationships,
    businessRule,
    isBlocking,
    blockingField,
    whyBlocking,
    canUserOverride,
    currentEffect,
    suggestedSafeOptions,
  };
}

function candidateEventLine(candidate: AmbientCandidate): string {
  return candidate.items.map((item) => {
    const label = item.type === "mortality" ? "死亡" : item.type === "cull" ? "淘汰" : item.raw;
    return `${label}${item.quantity === null ? "（尚未確認數量）" : `：${item.quantity}`}`;
  }).join("、") || "尚無可確認事件";
}

function candidateStateValue(candidate: AmbientCandidate): string {
  return candidate.state === "conflict" || candidate.conflict
    ? `衝突：${candidate.conflictText ?? "不同說法尚未釐清"}`
    : candidateStateLabel(candidate);
}

function renderAmbientCandidateStateV2(
  accountName: string,
  candidate: AmbientCandidate,
): LineReplyMessage[] {
  return [buildTextMessage(`${botName(accountName)}\n${composeGroundedCandidateResponse({
    goal: "SHOW_STATE",
    topic: "candidate_state",
    candidate,
  })}`)];
}

async function renderAmbientCandidateExplanationV2(
  env: Env,
  organizationId: string,
  entry: AmbientCandidateInboxEntry,
  accountName: string,
  topic: ConversationV2Topic | null,
): Promise<LineReplyMessage[]> {
  const candidate = entry.bundle.candidates.find((item) => item.items.length > 0) ?? entry.bundle.candidates[0];
  if (!candidate) return [buildTextMessage(`${botName(accountName)}\n目前找不到這筆待確認資料。`)];
  const evidence = await getCandidateConflictEvidence(env, organizationId, entry);
  const response = composeGroundedCandidateResponse({
    goal: topic === "candidate_consequence" ? "QUERY" : "EXPLAIN",
    topic,
    candidate,
    conflictEvidence: evidence.structuredConflict,
    evidence: evidence.structuredEvidence,
  });
  return [buildTextMessage(`${botName(accountName)}\n${response}`, buildAmbientDigestReplies(entry.row.id))];
}

async function queryCaretakerFarms(
  env: Env,
  organizationId: string,
  text: string,
  entries: AmbientCandidateInboxEntry[],
  accountName: string,
): Promise<LineReplyMessage[]> {
  const candidate = entries.length === 1 ? entries[0].bundle.candidates.find((item) => item.caretakerText) : undefined;
  const inferred = candidate?.caretakerText ?? text.replace(/(?:目前|對應|有哪些|哪幾個|哪几个|雞場|鸡场|場|场)/gu, " ").trim();
  if (!inferred) return [buildTextMessage(`${botName(accountName)}\n請提供要查詢的飼養者名稱。`)];
  const rows = await env.DB.prepare(
    `SELECT c.name AS caretakerName, f.name AS farmName
       FROM caretakers c
       JOIN farm_caretaker_assignments a ON a.caretaker_id = c.id
       JOIN farms f ON f.id = a.farm_id
      WHERE c.organization_id = ? AND c.active = 1 AND f.organization_id = ? AND f.active = 1
      ORDER BY c.name, f.name`,
  ).bind(organizationId, organizationId).all<{ caretakerName: string; farmName: string }>();
  const clue = normalize(inferred);
  const matches = rows.results.filter((row) => normalize(row.caretakerName).includes(clue) || clue.includes(normalize(row.caretakerName)));
  return [buildTextMessage(matches.length
    ? `${botName(accountName)}\n${matches[0].caretakerName}目前對應：${[...new Set(matches.map((row) => row.farmName))].join("、")}`
    : `${botName(accountName)}\n目前找不到「${inferred}」的有效雞場對應；這不會自動把飼養者當成雞場。`)];
}

const FARM_CARETAKER_QUERY_TAIL = /(?:目前\s*)?(?:設定|设定)\s*(?:的\s*)?(?:飼養者|饲养者)\s*(?:有誰|有谁|誰|谁)?\s*$/u;

/**
 * Remove only the relationship-query wording that follows a farm name.
 * Keep this separate from FarmResolver: the resolver still owns the
 * deterministic, ambiguity-safe farm selection boundary.
 */
export function inferFarmCaretakerQueryName(text: string): string {
  return normalize(text)
    .replace(FARM_CARETAKER_QUERY_TAIL, " ")
    .replace(/(?:目前|有沒有|有吗|有嗎|哪些|哪幾個|哪几个|飼養者|饲养者|雞場|鸡场|場|场)/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

async function queryFarmCaretakers(
  env: Env,
  organizationId: string,
  text: string,
  entries: AmbientCandidateInboxEntry[],
  accountName: string,
): Promise<LineReplyMessage[]> {
  const candidate = entries.length === 1 ? entries[0].bundle.candidates.find((item) => item.farmText) : undefined;
  const inferred = candidate?.farmText ?? inferFarmCaretakerQueryName(text);
  if (!inferred) return [buildTextMessage(`${botName(accountName)}\n請提供要查詢的雞場名稱。`)];
  const lookup = await resolveFarmQuery(env, organizationId, inferred, accountName);
  if (!lookup.farm) return [buildTextMessage(`${botName(accountName)}\n目前找不到「${inferred}」的有效雞場，沒有查詢到飼養者。`)];
  const rows = await env.DB.prepare(
    `SELECT c.name AS caretakerName
       FROM farm_caretaker_assignments a
       JOIN caretakers c ON c.id = a.caretaker_id
      WHERE a.farm_id = ? AND c.organization_id = ? AND c.active = 1
        AND a.effective_from <= date('now') AND (a.effective_to IS NULL OR a.effective_to >= date('now'))
      ORDER BY c.name`,
  ).bind(lookup.farm.id, organizationId).all<{ caretakerName: string }>();
  return [buildTextMessage(rows.results.length
    ? `${botName(accountName)}\n${lookup.farm.name}目前設定的飼養者：${rows.results.map((row) => row.caretakerName).join("、")}`
    : `${botName(accountName)}\n目前資料中${lookup.farm.name}沒有有效的飼養者對應。`)];
}

async function queryOpenCandidateInbox(
  env: Env,
  organizationId: string,
  entries: AmbientCandidateInboxEntry[],
  accountName: string,
): Promise<LineReplyMessage[]> {
  if (!entries.length) return [buildTextMessage(`${botName(accountName)}\n目前沒有待確認資訊。`)];
  return [buildTextMessage(`${botName(accountName)}\n目前有 ${entries.length} 筆待確認營運資訊。`), ...await renderAmbientCandidateInbox(env, organizationId, entries)];
}

function conversationRequestedDay(text: string, now = new Date()): string {
  const base = taipeiDate(now);
  if (!/(?:昨天|昨日)/u.test(text)) return base;
  const date = new Date(`${base}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

interface ConversationReadMemoryPatch {
  activeObjectType?: ConversationObjectType | null;
  activeObjectId?: string | null;
  activeObjectSummary?: string | null;
  lastExplainedIssue?: string | null;
  lastExplainedObjectType?: ConversationObjectType | null;
  lastExplainedObjectId?: string | null;
  lastRecommendedOptions?: string[];
  lastQueryResult?: string | null;
  lastQueryResultType?: ConversationObjectType | null;
  lastReferencedObject?: string | null;
  lastReferencedObjectType?: ConversationObjectType | null;
  lastPendingObjectType?: ConversationObjectType | null;
  lastPendingObjectId?: string | null;
}

interface RecentOperationalEventRow {
  id: string;
  intent: string;
  quantity: number;
  unit: string;
  eventDate: string;
  house: string | null;
  rawMessage: string;
  farmName: string;
  farmEnvironment: "production" | "test";
  createdAt: string;
}

async function conversationTodayAbnormalReply(
  env: Env,
  organizationId: string,
  accountName: string,
): Promise<{ messages: LineReplyMessage[]; summary: string; objectType: ConversationObjectType; objectId: string | null }> {
  const day = taipeiDate();
  const rows = await env.DB.prepare(
    `SELECT a.id, f.name AS farmName, f.environment AS farmEnvironment,
            a.occurred_date AS occurredDate, a.occurred_at AS occurredAt,
            a.raw_text AS rawText
       FROM abnormal_events a
       JOIN farms f ON f.id = a.farm_id
      WHERE a.organization_id = ? AND a.occurred_date = ? AND a.status = 'active'
      ORDER BY a.occurred_at DESC, a.created_at DESC, a.id DESC
      LIMIT 20`,
  ).bind(organizationId, day).all<{ id: string; farmName: string; farmEnvironment: "production" | "test"; occurredDate: string; occurredAt: string | null; rawText: string }>();
  if (!rows.results.length) {
    const summary = `今天沒有正式異常紀錄（${day}）。`;
    return { messages: [buildTextMessage(`${botName(accountName)}\n${summary}`)], summary, objectType: "abnormal_event", objectId: null };
  }
  const lines = [
    `${botName(accountName)} 今天的異常紀錄`,
    ...rows.results.map((row) => {
      const time = row.occurredAt && row.occurredAt.length >= 16 ? ` ${row.occurredAt.slice(11, 16)}` : "";
      return `• ${row.farmEnvironment === "test" ? "🧪 " : ""}${row.farmName}｜${row.occurredDate}${time}｜${row.rawText}`;
    }),
  ];
  return {
    messages: [buildTextMessage(lines.join("\n"))],
    summary: `今天有 ${rows.results.length} 筆正式異常紀錄。`,
    objectType: "abnormal_event",
    objectId: rows.results[0]?.id ?? null,
  };
}

interface ConversationTodayAttentionResult {
  messages: LineReplyMessage[];
  summary: string;
  executedTools: string[];
}

/**
 * Bounded, read-only plan for broad operational questions such as "今天有
 * 沒有需要注意的事？".  It deliberately uses a fixed set of organization-
 * scoped aggregates and never accepts model-generated SQL or an unbounded
 * history scan.
 */
async function conversationTodayAttentionReply(
  env: Env,
  organizationId: string,
  entries: AmbientCandidateInboxEntry[],
  accountName: string,
  contract: ConversationAnswerContract,
): Promise<ConversationTodayAttentionResult> {
  const day = taipeiDate();
  const recentSince = dateOffset(day, 2);
  const [mortality, abnormalRows, recent] = await Promise.all([
    env.DB.prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS total, COUNT(*) AS records
         FROM operational_events
        WHERE organization_id = ? AND event_date = ? AND intent = 'mortality' AND reversed_at IS NULL`,
    ).bind(organizationId, day).first<{ total: number; records: number }>(),
    env.DB.prepare(
      `SELECT f.name AS farmName, f.environment AS farmEnvironment, COUNT(*) AS count
         FROM abnormal_events a
         JOIN farms f ON f.id = a.farm_id
        WHERE a.organization_id = ? AND a.occurred_date = ? AND a.status = 'active'
        GROUP BY f.id, f.name, f.environment
        ORDER BY count DESC, f.id
        LIMIT 5`,
    ).bind(organizationId, day).all<{ farmName: string; farmEnvironment: "production" | "test"; count: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count
         FROM operational_events
        WHERE organization_id = ? AND event_date >= ? AND event_date <= ? AND reversed_at IS NULL`,
    ).bind(organizationId, recentSince, day).first<{ count: number }>(),
  ]);
  const mortalityTotal = Number(mortality?.total ?? 0);
  const mortalityRecords = Number(mortality?.records ?? 0);
  const abnormalCount = abnormalRows.results.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  const pendingCount = entries.length;
  const attention: string[] = [];
  if (abnormalCount > 0) {
    const farms = abnormalRows.results.map((row) => `${row.farmEnvironment === "test" ? "🧪 " : ""}${row.farmName} ${row.count} 筆`).join("、");
    attention.push(`今天有 ${abnormalCount} 筆正式異常紀錄，涉及：${farms}。`);
  }
  if (pendingCount > 0) {
    attention.push(`目前有 ${pendingCount} 筆待確認資料，尚未列入正式紀錄。`);
  }
  if (mortalityTotal > 0 && attention.length < 3) {
    attention.push(`今天已記錄 ${formatAmount(mortalityTotal)} 隻死亡（${mortalityRecords} 筆）；這是目前查到的正式資料。`);
  }
  const requested = contract.brevity === "short" ? 2 : 3;
  const lines = [botName(accountName), `依目前資料（${day}，目前可見的組織範圍）整理：`];
  if (attention.length) {
    lines.push(`今天目前有 ${attention.length} 件值得注意：`, ...attention.slice(0, requested).map((item, index) => `${index + 1}. ${item}`));
  } else if (mortalityRecords === 0 && abnormalCount === 0 && pendingCount === 0) {
    lines.push("目前資料還不足以判斷整體狀況；今天查到的正式死亡、正式異常與待確認資料都是 0。" );
  } else {
    lines.push("依目前已記錄的資料，暫時沒有看到需要優先處理的明顯異常。" );
    lines.push(`今天正式死亡：${formatAmount(mortalityTotal)} 隻；正式異常：${abnormalCount} 筆；最近三天正式營運紀錄：${Number(recent?.count ?? 0)} 筆。`);
  }
  if (contract.readOnlyExplicit) lines.push("只查資料，沒有修改任何紀錄。" );
  return {
    messages: [buildTextMessage(lines.join("\n"))],
    summary: lines.slice(1).join(" ").slice(0, 800),
    executedTools: [
      "get_today_effective_records",
      "get_today_mortality",
      "get_today_abnormal",
      "get_pending_actions",
      "get_recent_effective_records",
    ],
  };
}

async function conversationRecentOperationalReply(
  env: Env,
  organizationId: string,
  groupId: string,
  userId: string,
  accountName: string,
  eventId: string | null = null,
): Promise<{ messages: LineReplyMessage[]; summary: string; objectType: ConversationObjectType; objectId: string | null }> {
  const row = await env.DB.prepare(
    `SELECT e.id, e.intent, e.quantity, e.unit, e.event_date AS eventDate,
            e.house, e.raw_message AS rawMessage, e.created_at AS createdAt,
            f.name AS farmName, f.environment AS farmEnvironment
       FROM operational_events e
       JOIN farms f ON f.id = e.farm_id
      WHERE e.organization_id = ? AND e.line_group_id = ?
        AND (e.line_user_id = ? OR e.line_user_id IS NULL)
        AND (? IS NULL OR e.id = ?)
        AND e.reversed_at IS NULL
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 1`,
  ).bind(organizationId, groupId, userId, eventId, eventId).first<RecentOperationalEventRow>();
  if (!row) {
    const summary = "目前找不到最近的正式營運紀錄。";
    return { messages: [buildTextMessage(`${botName(accountName)}\n${summary}`)], summary, objectType: "operational_event", objectId: null };
  }
  const intentLabel: Record<string, string> = { mortality: "死亡", cull: "淘汰", feed: "飼料", water: "飲水", shipment: "出雞" };
  const summary = `最近一筆是${intentLabel[row.intent] ?? row.intent}${row.quantity}${row.unit}，雞場是${row.farmName}。`;
  const text = [
    `${botName(accountName)} 最近一筆正式紀錄`,
    `事件：${intentLabel[row.intent] ?? row.intent}${row.quantity}${row.unit}`,
    `雞場：${row.farmEnvironment === "test" ? "🧪 " : ""}${row.farmName}`,
    `日期：${row.eventDate}`,
    `舍別：${row.house ?? "未填寫"}`,
    `原始說明：${row.rawMessage}`,
  ].join("\n");
  return { messages: [buildTextMessage(text)], summary, objectType: "operational_event", objectId: row.id };
}

async function conversationEventAbnormalityReply(
  env: Env,
  organizationId: string,
  groupId: string,
  userId: string,
  memory: ConversationV2SemanticMemory | null,
  accountName: string,
): Promise<{ messages: LineReplyMessage[]; summary: string; objectType: ConversationObjectType; objectId: string | null }> {
  const eventId = memory?.activeObjectType === "operational_event" ? memory.activeObjectId : null;
  const event = eventId
    ? await env.DB.prepare(
      `SELECT e.id, e.farm_id AS farmId, e.house, e.event_date AS eventDate,
              f.name AS farmName, f.environment AS farmEnvironment
         FROM operational_events e JOIN farms f ON f.id = e.farm_id
        WHERE e.id = ? AND e.organization_id = ? AND e.line_group_id = ?
        LIMIT 1`,
    ).bind(eventId, organizationId, groupId).first<{ id: string; farmId: string; house: string | null; eventDate: string; farmName: string; farmEnvironment: "production" | "test" }>()
    : await env.DB.prepare(
      `SELECT e.id, e.farm_id AS farmId, e.house, e.event_date AS eventDate,
              f.name AS farmName, f.environment AS farmEnvironment
         FROM operational_events e JOIN farms f ON f.id = e.farm_id
        WHERE e.organization_id = ? AND e.line_group_id = ?
          AND (e.line_user_id = ? OR e.line_user_id IS NULL)
          AND e.reversed_at IS NULL
        ORDER BY e.created_at DESC, e.id DESC LIMIT 1`,
    ).bind(organizationId, groupId, userId).first<{ id: string; farmId: string; house: string | null; eventDate: string; farmName: string; farmEnvironment: "production" | "test" }>();
  if (!event) {
    const summary = "目前找不到可以比對的正式紀錄。";
    return { messages: [buildTextMessage(`${botName(accountName)}\n${summary}`)], summary, objectType: "abnormal_event", objectId: null };
  }
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count
       FROM abnormal_events
      WHERE organization_id = ? AND farm_id = ? AND occurred_date = ? AND status = 'active'`,
  ).bind(organizationId, event.farmId, event.eventDate).first<{ count: number }>();
  const count = Number(row?.count ?? 0);
  const summary = count > 0
    ? `這筆正式紀錄同一天同一雞場目前有 ${count} 筆異常，需再看內容確認是否相關。`
    : "目前查不到同一天同一雞場的正式異常紀錄，所以沒有證據說它和這筆死亡有關。";
  return {
    messages: [buildTextMessage([
      `${botName(accountName)} 這筆紀錄的異常比對`,
      `正式紀錄：${event.farmEnvironment === "test" ? "🧪 " : ""}${event.farmName}｜${event.eventDate}${event.house ? `｜${event.house}` : ""}`,
      count > 0 ? `目前查到同一天同一雞場有 ${count} 筆異常紀錄。這只代表有時間與雞場上的交集，不代表一定是同一件事。` : "目前沒有查到同一天同一雞場的正式異常紀錄。",
      "如果你要，我可以再把異常內容列出來；這次查詢沒有修改資料。",
    ].join("\n"))],
    summary,
    objectType: "abnormal_event",
    objectId: null,
  };
}

async function conversationReadOnlyFallback(
  env: Env,
  event: LineEvent,
  groupId: string,
  organizationId: string,
  accountName: string,
  analysis: ReturnType<typeof classifyConversationSpeechAct>,
): Promise<LineReplyMessage[]> {
  const userId = event.source?.userId ?? "";
  if (analysis.recommendedGoal === "QUERY" && analysis.topic === "today_mortality") {
    return [buildTextMessage(await todayMortalityReply(env, groupId, organizationId, undefined, accountName, conversationRequestedDay(event.message?.text ?? "", new Date(event.timestamp ?? Date.now()))))];
  }
  if (analysis.recommendedGoal === "QUERY" && analysis.topic === "today_abnormal") {
    return (await conversationTodayAbnormalReply(env, organizationId, accountName)).messages;
  }
  if (analysis.recommendedGoal === "QUERY" && analysis.topic === "recent_event") {
    return (await conversationRecentOperationalReply(env, organizationId, groupId, userId, accountName)).messages;
  }
  if (analysis.recommendedGoal === "QUERY" && analysis.topic === "event_abnormality") {
    return (await conversationEventAbnormalityReply(env, organizationId, groupId, userId, null, accountName)).messages;
  }
  if (analysis.recommendedGoal === "QUERY" && analysis.topic === "pending_status") {
    const entries = await loadAmbientCandidateInbox(env, groupId, organizationId, new Date(event.timestamp ?? Date.now()).toISOString());
    return queryOpenCandidateInbox(env, organizationId, entries, accountName);
  }
  if (analysis.recommendedGoal === "ADVISE") {
    return [buildTextMessage(`${botName(accountName)}\n這是在詢問可以怎麼處理，不會直接替你取消或記錄。你可以稍後處理；如果確定不要這筆，請另外明確說「取消這筆」。` )];
  }
  if (analysis.recommendedGoal === "EXPLAIN" || analysis.recommendedGoal === "SHOW_STATE") {
    return [buildTextMessage(`${botName(accountName)}\n這看起來是查詢或說明問題，不是新增紀錄，所以我沒有改動資料。請再補充要查看的雞場、日期或那一筆內容。` )];
  }
  return [buildTextMessage(`${botName(accountName)}\n我先把這句當成查詢或說明問題處理，沒有新增紀錄；如果你要記一筆新的營運資料，請直接說明事件和數量。` )];
}

function conversationV2CapabilityReply(
  accountName: string,
  contract: ConversationAnswerContract = inferConversationAnswerContract("你能幫我做什麼？"),
): LineReplyMessage[] {
  const examples = [
    "今天各雞場的死亡紀錄是多少？",
    "最近哪一場有異常？",
    "這筆待確認資料哪裡不一致？",
    "今天有什麼需要優先注意？",
    "這筆紀錄為什麼會被標記？",
    "某個飼養者目前對應哪些雞場？",
    "雲林今天的天氣如何？",
    "最近有沒有哪筆資料還在等待確認？",
    "某個批次目前的狀況如何？",
    "今天各雞場目前有哪些批次？",
  ];
  const capabilities = [
    "查詢今天或最近的營運狀況",
    "查看死亡、異常、雞場與批次資料",
    "查看待確認資料與歷史紀錄",
    "分析異常、趨勢、風險與可能原因",
    "解釋目前資料哪裡不一致、是否會影響紀錄",
    "依目前資料提供下一步建議",
  ];
  const limitations = [
    "一般詢問不會直接修改正式紀錄。",
    "資料不足時，不會自行猜雞場、數量或批次並寫入。",
    "不會把待確認資料當成正式紀錄。",
    "不會自行修改財務資料。",
  ];
  const count = (value: number | undefined, fallback: number): number => Math.min(10, Math.max(1, Math.trunc(value ?? fallback)));
  const requestedExamples = count(contract.exampleCount ?? contract.requestedCount, 3);
  const requestedCapabilities = count(contract.capabilityCount, 3);
  const requestedLimitations = count(contract.limitationCount, 2);
  const lines = [botName(accountName)];
  if (contract.mode === "examples" || contract.wantsExamples) {
    lines.push("你可以直接這樣問：", ...examples.slice(0, Math.min(requestedExamples, examples.length)).map((item, index) => `${index + 1}.「${item}」`));
  } else if (contract.mode === "capability_limits" || (contract.wantsCapabilities && contract.wantsLimitations)) {
    lines.push(
      "可以幫你：",
      ...capabilities.slice(0, Math.min(requestedCapabilities, capabilities.length)).map((item, index) => `${index + 1}. ${item}`),
      "",
      "不會直接替你做：",
      ...limitations.slice(0, Math.min(requestedLimitations, limitations.length)).map((item, index) => `${index + 1}. ${item}`),
    );
  } else {
    const selectedCapabilities = contract.brevity === "short" ? capabilities.slice(0, 4) : capabilities;
    lines.push("我可以協助你：", ...selectedCapabilities.map((item) => `• ${item}`));
    if (contract.wantsLimitations) {
      lines.push("", "不會直接替你做：", ...limitations.slice(0, requestedLimitations).map((item) => `• ${item}`));
    }
    lines.push("", "一般詢問不會直接修改正式資料；需要新增或修改時，仍會先經過安全確認流程。" );
  }
  if (contract.readOnlyExplicit) lines.push("", "可以，只查資料，不修改紀錄。" );
  return [buildTextMessage(lines.join("\n"))];
}

function conversationV2UnknownReadOnlyReply(accountName: string): LineReplyMessage[] {
  return [buildTextMessage([
    botName(accountName),
    "我知道你是在問問題，但目前還不能確定你想查哪一類資料。",
    "你可以直接問：",
    "• 今天各雞場的狀況",
    "• 最近的死亡或異常",
    "• 某一場最近發生什麼事",
    "• 待確認資料哪裡有問題",
    "• 最近哪一場需要注意",
    "• 某筆紀錄為什麼有疑問",
    "",
    "如果只是詢問，我不會修改正式資料。",
  ].join("\n"))];
}

function conversationV2NoCandidateReply(accountName: string, goal: ConversationV2Goal): LineReplyMessage[] {
  const action = goal === "SHOW_STATE" ? "查看"
    : goal === "ADVISE" ? "提供處理建議"
      : goal === "CANCEL" ? "取消"
        : goal === "CONFIRM" ? "確認"
          : goal === "REPAIR" ? "修改"
            : goal === "QUERY" ? "查詢"
              : "解釋或比較";
  return [buildTextMessage([
    botName(accountName),
    `目前沒有待確認資料可供我${action}。`,
    "如果你想查最近的異常、死亡紀錄或某一場的狀況，可以直接告訴我雞場或時間。",
    "這次沒有修改任何資料。",
  ].join("\n"))];
}

function conversationV2ReadOnlyRefusalReply(accountName: string): LineReplyMessage[] {
  return [buildTextMessage([
    botName(accountName),
    "這句目前不足以安全建立或修改正式紀錄。",
    "我先把它當成詢問處理，沒有修改資料。",
    "如果要新增或修改，請清楚說明事件、數量與對應的雞場資料。",
  ].join("\n"))];
}

interface ConversationV2SessionRow {
  id: string;
  organizationId: string;
  lineGroupId: string;
  lineUserId: string;
  activeObjectType: "candidate" | "daily_review" | "quick_record" | null;
  activeObjectId: string | null;
  lastGoal: ConversationV2Goal | null;
  lastTopic: ConversationV2Topic | null;
  lastAction: string | null;
  lastTool: string | null;
  lastToolResultSummary: string | null;
  lastExplainedIssue: string | null;
  lastReferencedField: string | null;
  turnCount: number;
  updatedAt: string;
  expiresAt: string;
  semanticMemory: ConversationV2SemanticMemory | null;
}

interface ConversationV2SessionPatch {
  activeObjectId?: string | null;
  lastGoal?: ConversationV2Goal | null;
  lastTopic?: ConversationV2Topic | null;
  lastAction?: string | null;
  lastTool?: string | null;
  lastToolResultSummary?: string | null;
  lastExplainedIssue?: string | null;
  lastReferencedField?: string | null;
  turnCount?: number;
  semanticMemory?: ConversationV2SemanticMemory | null;
}

function parseConversationV2SemanticMemory(value: string | null | undefined): ConversationV2SemanticMemory | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const arrayValue = (key: string, max: number): string[] | undefined => {
      const raw = parsed[key];
      if (!Array.isArray(raw)) return undefined;
      return raw.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 200)).slice(0, max);
    };
    const goal = typeof parsed.lastGoal === "string" ? parsed.lastGoal as ConversationV2Goal : null;
    const topic = typeof parsed.lastTopic === "string" ? parsed.lastTopic as ConversationV2Topic : null;
    return {
      activeObjectType: ["operational_event", "abnormal_event", "candidate", "pending_action", "farm", "house", "flock", "daily_review", "query_result", "quick_record"].includes(parsed.activeObjectType as string)
        ? parsed.activeObjectType as ConversationObjectType
        : null,
      activeObjectId: typeof parsed.activeObjectId === "string" ? parsed.activeObjectId.slice(0, 240) : null,
      activeObjectSummary: typeof parsed.activeObjectSummary === "string" ? parsed.activeObjectSummary.slice(0, 500) : null,
      lastGoal: goal,
      lastTopic: topic,
      lastAction: typeof parsed.lastAction === "string" ? parsed.lastAction.slice(0, 120) : null,
      lastQueryResult: typeof parsed.lastQueryResult === "string" ? parsed.lastQueryResult.slice(0, 800) : null,
      lastQueryResultType: ["operational_event", "abnormal_event", "candidate", "pending_action", "farm", "house", "flock", "daily_review", "query_result", "quick_record"].includes(parsed.lastQueryResultType as string)
        ? parsed.lastQueryResultType as ConversationObjectType
        : null,
      lastReferencedObject: typeof parsed.lastReferencedObject === "string" ? parsed.lastReferencedObject.slice(0, 240) : null,
      lastReferencedObjectType: ["operational_event", "abnormal_event", "candidate", "pending_action", "farm", "house", "flock", "daily_review", "query_result", "quick_record"].includes(parsed.lastReferencedObjectType as string)
        ? parsed.lastReferencedObjectType as ConversationObjectType
        : null,
      lastReferencedField: typeof parsed.lastReferencedField === "string" ? parsed.lastReferencedField.slice(0, 120) : null,
      lastExplainedIssue: typeof parsed.lastExplainedIssue === "string" ? parsed.lastExplainedIssue.slice(0, 800) : null,
      lastExplainedObjectType: ["operational_event", "abnormal_event", "candidate", "pending_action", "farm", "house", "flock", "daily_review", "query_result", "quick_record"].includes(parsed.lastExplainedObjectType as string)
        ? parsed.lastExplainedObjectType as ConversationObjectType
        : null,
      lastExplainedObjectId: typeof parsed.lastExplainedObjectId === "string" ? parsed.lastExplainedObjectId.slice(0, 240) : null,
      lastConclusion: typeof parsed.lastConclusion === "string" ? parsed.lastConclusion.slice(0, 800) : null,
      lastEvidenceRefs: arrayValue("lastEvidenceRefs", 48),
      lastBlockingStatus: parsed.lastBlockingStatus === "blocking" || parsed.lastBlockingStatus === "non_blocking" || parsed.lastBlockingStatus === "unknown" ? parsed.lastBlockingStatus : null,
      lastRecommendedOptions: arrayValue("lastRecommendedOptions", 8),
      lastActionProposal: typeof parsed.lastActionProposal === "string" ? parsed.lastActionProposal.slice(0, 240) : null,
      lastUserExplicitDecision: typeof parsed.lastUserExplicitDecision === "string" ? parsed.lastUserExplicitDecision.slice(0, 240) : null,
      lastUserQuestionType: ["ASSERT", "QUERY", "EXPLAIN_REQUEST", "ADVICE_REQUEST", "REFERENCE", "CORRECTION", "CANCEL", "CONFIRM", "NAVIGATION", "META_CONVERSATION", "UNKNOWN"].includes(parsed.lastUserQuestionType as string)
        ? parsed.lastUserQuestionType as ConversationSpeechAct
        : null,
      lastPendingObjectType: ["operational_event", "abnormal_event", "candidate", "pending_action", "farm", "house", "flock", "daily_review", "query_result", "quick_record"].includes(parsed.lastPendingObjectType as string)
        ? parsed.lastPendingObjectType as ConversationObjectType
        : null,
      lastPendingObjectId: typeof parsed.lastPendingObjectId === "string" ? parsed.lastPendingObjectId.slice(0, 240) : null,
      lastAssistantResponseSummary: typeof parsed.lastAssistantResponseSummary === "string" ? parsed.lastAssistantResponseSummary.slice(0, 800) : null,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt.slice(0, 80) : null,
    };
  } catch {
    return null;
  }
}

function conversationV2SessionId(organizationId: string, groupId: string, userId: string): string {
  return `conversation-v2-${organizationId}-${groupId}-${userId}`;
}

async function loadConversationV2Session(
  env: Env,
  organizationId: string,
  groupId: string,
  userId: string,
  now: string,
  trace?: RuntimeTrace,
): Promise<ConversationV2SessionRow | null> {
  if (trace) trace.conversation_v2_session_read_status = "not_found";
  try {
    const row = await env.DB.prepare(
      `SELECT id, organization_id AS organizationId, line_group_id AS lineGroupId,
              line_user_id AS lineUserId, active_object_type AS activeObjectType,
              active_object_id AS activeObjectId, last_goal AS lastGoal,
              last_topic AS lastTopic, last_action AS lastAction,
              last_tool AS lastTool, last_tool_result_summary AS lastToolResultSummary,
              last_explained_issue AS lastExplainedIssue,
              last_referenced_field AS lastReferencedField,
              turn_count AS turnCount, updated_at AS updatedAt, expires_at AS expiresAt,
              semantic_memory_json AS semanticMemoryJson
         FROM conversation_v2_sessions
        WHERE organization_id = ? AND line_group_id = ? AND line_user_id = ?
          AND expires_at > ?
        LIMIT 1`,
    ).bind(organizationId, groupId, userId, now).first<ConversationV2SessionRow & { semanticMemoryJson?: string | null }>();
    if (row && trace) trace.conversation_v2_session_read_status = "found";
    return row ? { ...row, semanticMemory: parseConversationV2SemanticMemory(row.semanticMemoryJson) } : null;
  } catch (error) {
    if (trace) trace.conversation_v2_session_read_status = "error";
    console.log(JSON.stringify({
      event: "conversation_v2_session_read_error",
      group_id_suffix: groupId.length <= 12 ? groupId : `${groupId.slice(0, 4)}…${groupId.slice(-4)}`,
      error_class: error instanceof Error && error.name ? error.name : "db_error",
    }));
    return null;
  }
}

async function saveConversationV2Session(
  env: Env,
  organizationId: string,
  groupId: string,
  userId: string,
  now: Date,
  patch: ConversationV2SessionPatch,
  previous?: ConversationV2SessionRow | null,
): Promise<void> {
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const current = previous ?? {
    activeObjectId: null,
    lastGoal: null,
    lastTopic: null,
    lastAction: null,
    lastTool: null,
    lastToolResultSummary: null,
    lastExplainedIssue: null,
    lastReferencedField: null,
    turnCount: 0,
    semanticMemory: null,
  };
  await env.DB.prepare(
    `INSERT INTO conversation_v2_sessions
       (id, organization_id, line_group_id, line_user_id, active_object_type,
        active_object_id, last_goal, last_topic, last_action, last_tool,
        last_tool_result_summary, last_explained_issue, last_referenced_field,
        turn_count, semantic_memory_json, updated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT (organization_id, line_group_id, line_user_id) DO UPDATE SET
       active_object_type = excluded.active_object_type,
       active_object_id = excluded.active_object_id,
       last_goal = excluded.last_goal,
       last_topic = excluded.last_topic,
       last_action = excluded.last_action,
       last_tool = excluded.last_tool,
       last_tool_result_summary = excluded.last_tool_result_summary,
       last_explained_issue = excluded.last_explained_issue,
       last_referenced_field = excluded.last_referenced_field,
       turn_count = excluded.turn_count,
       semantic_memory_json = excluded.semantic_memory_json,
       updated_at = CURRENT_TIMESTAMP,
       expires_at = excluded.expires_at`,
  ).bind(
    conversationV2SessionId(organizationId, groupId, userId),
    organizationId,
    groupId,
    userId,
    patch.activeObjectId === null ? null : (patch.activeObjectId !== undefined || current.activeObjectId ? "candidate" : null),
    patch.activeObjectId !== undefined ? patch.activeObjectId : current.activeObjectId,
    patch.lastGoal ?? current.lastGoal,
    patch.lastTopic ?? current.lastTopic,
    patch.lastAction ?? current.lastAction,
    patch.lastTool ?? current.lastTool,
    patch.lastToolResultSummary ?? current.lastToolResultSummary,
    patch.lastExplainedIssue ?? current.lastExplainedIssue,
    patch.lastReferencedField ?? current.lastReferencedField,
    patch.turnCount ?? (current.turnCount + 1),
    patch.semanticMemory === undefined ? (current.semanticMemory ? JSON.stringify(current.semanticMemory) : null) : (patch.semanticMemory ? JSON.stringify(patch.semanticMemory) : null),
    expiresAt,
  ).run();
}

async function conversationV2FarmEnvironment(
  env: Env,
  organizationId: string,
  candidate: AmbientCandidate | null,
): Promise<"production" | "test" | null> {
  if (!candidate) return null;
  if (candidate.resolution?.resolvedFarmId) {
    const resolved = await env.DB.prepare(
      `SELECT environment FROM farms WHERE id = ? AND organization_id = ? AND active = 1 LIMIT 1`,
    ).bind(candidate.resolution.resolvedFarmId, organizationId).first<{ environment: "production" | "test" }>();
    if (resolved?.environment) return resolved.environment;
  }
  if (candidate.farmText) {
    const resolved = await resolveFarmQuery(env, organizationId, candidate.farmText, env.LINE_ACCOUNT_NAME);
    return resolved.farm?.environment ?? null;
  }
  return null;
}

async function conversationV2GroupEligibility(
  env: Env,
  groupId: string,
  organizationId: string,
): Promise<ReturnType<typeof conversationV2EligibilityDecision> & {
  globalMode: string;
  groupEnabled: boolean;
  groupFound: boolean;
}> {
  const group = await env.DB.prepare(
    `SELECT conversation_v2_enabled AS conversationV2Enabled
       FROM line_groups
      WHERE group_id = ? AND organization_id = ?
      LIMIT 1`,
  ).bind(groupId, organizationId).first<{ conversationV2Enabled: number | null }>();
  const groupEnabled = group?.conversationV2Enabled === 1;
  const groupFound = Boolean(group);
  return {
    ...conversationV2EligibilityDecision(
    env.CONVERSATION_V2_MODE,
      groupEnabled,
      groupFound,
    ),
    globalMode: env.CONVERSATION_V2_MODE ?? "off",
    groupEnabled,
    groupFound,
  };
}

function conversationV2CandidateContext(
  entries: AmbientCandidateInboxEntry[],
  session: ConversationV2SessionRow | null,
  environment: "production" | "test" | null,
  pendingContextActive = false,
  referencedCandidate = false,
): { current?: AmbientCandidateInboxEntry; context: ConversationV2Context } {
  const pointedCandidateId = session?.activeObjectType === "candidate" && session.activeObjectId
    ? session.activeObjectId
    : session?.semanticMemory?.activeObjectType === "candidate" ? session.semanticMemory.activeObjectId : null;
  const pointed = pointedCandidateId
    ? entries.find((entry) => entry.row.id === pointedCandidateId)
    : undefined;
  const semanticObjectType = session?.semanticMemory?.activeObjectType ?? null;
  const candidateFallbackAllowed = !pendingContextActive
    && (!semanticObjectType || semanticObjectType === "candidate" || referencedCandidate);
  const current = pointed ?? (candidateFallbackAllowed && entries.length === 1 ? entries[0] : undefined);
  const candidate = current?.bundle.candidates.find((item) => item.items.length > 0);
  const activeObjectType = pendingContextActive && semanticObjectType !== "candidate"
    ? "pending_action"
    : semanticObjectType;
  return {
    current,
    context: {
      openCandidateCount: entries.length,
      hasCurrentCandidate: Boolean(current),
      currentCandidateId: current?.row.id ?? null,
      currentCandidateFarm: candidate?.farmText ?? null,
      currentCandidateHouse: candidate?.houseText ?? null,
      currentCandidateFlock: candidate?.flockText ?? null,
      currentCandidateEvent: candidate?.eventType ?? candidate?.items[0]?.type ?? null,
      currentCandidateQuantity: candidate?.quantity ?? candidate?.items[0]?.quantity ?? null,
      currentCandidateCaretaker: candidate?.caretakerText ?? null,
      currentCandidateConflictText: candidate?.conflictText ?? null,
      currentCandidateConflictCodes: candidate?.conflicts ?? [],
      currentCandidateSourceEvidence: (candidate?.rawTexts ?? []).slice(0, 4).map((value) => value.slice(0, 160)),
      currentCandidateEvidence: (candidate?.evidence ?? []).slice(0, 24),
      currentCandidateConflictEvidence: (candidate?.conflictEvidence ?? []).slice(0, 4),
      currentCandidateReconciliation: candidate?.reconciliation?.status ?? null,
      currentCandidateCaretakerOverride: candidate?.userOverrides?.caretaker?.status ?? null,
      currentCandidateEnvironment: environment,
      currentCandidateState: candidate?.state ?? null,
      currentCandidateBlockingField: candidate ? ambientCandidateBlockingField(candidate) : null,
      activeObjectType,
      activeObjectId: session?.semanticMemory?.activeObjectId ?? null,
      activeObjectSummary: session?.semanticMemory?.activeObjectSummary ?? null,
      lastGoal: session?.lastGoal ?? null,
      lastTopic: session?.lastTopic ?? null,
      lastResponseType: session?.lastAction ?? null,
      lastExplainedIssue: session?.lastExplainedIssue ?? null,
      semanticMemory: session?.semanticMemory ?? null,
    },
  };
}

function conversationV2AdviceReply(
  accountName: string,
  entry: AmbientCandidateInboxEntry,
): LineReplyMessage[] {
  const candidate = entry.bundle.candidates.find((item) => item.items.length > 0) ?? entry.bundle.candidates[0];
  if (!candidate) return [buildTextMessage(`${botName(accountName)}\n目前找不到這筆待確認資訊。`)];
  return [buildTextMessage(
    `${botName(accountName)}\n${composeGroundedCandidateResponse({ goal: "ADVISE", topic: "candidate_cancel", candidate })}`,
    buildAmbientDigestReplies(entry.row.id),
  )];
}

function conversationV2CandidateClassConsequenceReply(accountName: string): LineReplyMessage[] {
  return [buildTextMessage([
    botName(accountName),
    "待確認資料如果一直不處理，通常會有這些情況：",
    "• 不會因為放著就自動變成正式紀錄；要經過既有確認流程，才會建立正式資料。",
    "• 在確認、忽略或暫緩等處理前，它會維持待確認狀態，並可能繼續出現在待確認資料或每日檢視中。",
    "• 尚未確認的資料不會直接當成正式營運紀錄計入統計。",
    "這次只是說明，沒有修改任何資料。",
  ].join("\n"))];
}

function conversationV2GenericAdviceReply(accountName: string, pendingCount: number): LineReplyMessage[] {
  const subject = pendingCount > 0
    ? "如果目前有待確認資料，通常可以："
    : "如果之後有一筆待確認資料，通常可以：";
  return [buildTextMessage([
    botName(accountName),
    subject,
    "• 補充或修改缺少的資料，再依流程確認。",
    "• 先暫緩，之後再處理。",
    "• 如果確定不需要，再走明確的忽略／取消流程。",
    pendingCount > 0
      ? "以上是一般處理方式；這次沒有替你選定或修改任何一筆資料。"
      : "目前沒有待確認資料，所以這次只是說明選項，沒有任何資料被修改。",
  ].join("\n"))];
}

function conversationV2MissingInstanceReferenceReply(accountName: string): LineReplyMessage[] {
  return [buildTextMessage([
    botName(accountName),
    "你說的「這筆」目前沒有可可靠對應的待確認資料。",
    "請先告訴我是哪一筆，或先查看待確認資料；我不會自行猜最近一筆。",
  ].join("\n"))];
}

async function handleConversationOrchestratorV2Input(
  env: Env,
  event: LineEvent,
  groupId: string,
  organizationId: string,
  accountName: string,
  text: string,
  trace?: RuntimeTrace,
): Promise<LineReplyMessage[] | null> {
  const userId = event.source?.userId;
  if (!userId) return null;
  const now = new Date(event.timestamp ?? Date.now());
  const nowIso = now.toISOString();
  // A Quick Record/Pending workflow is context, not a blanket conversational
  // lock. Read, explanation, advice, and meta turns must still reach V2; only
  // a new assertion/correction is handed back to the existing narrow workflow.
  const quickContextActive = await quickRecordHasActiveContext(env, groupId, userId, nowIso);
  const quickPendingContextActive = await quickRecordHasPending(env, groupId, userId, nowIso);
  const pendingContextActive = await hasScopedPendingState(env, groupId, userId, nowIso);

  const entries = await loadAmbientCandidateInbox(env, groupId, organizationId, nowIso);
  const session = await loadConversationV2Session(env, organizationId, groupId, userId, nowIso, trace);
  const pointedCandidateId = session?.activeObjectType === "candidate" && session.activeObjectId
    ? session.activeObjectId
    : session?.semanticMemory?.activeObjectType === "candidate" ? session.semanticMemory.activeObjectId : null;
  const pointed = pointedCandidateId
    ? entries.find((entry) => entry.row.id === pointedCandidateId)
    : undefined;
  const gateCurrent = pointed ?? (entries.length === 1 ? entries[0] : undefined);
  const environment = await conversationV2FarmEnvironment(
    env,
    organizationId,
    gateCurrent?.bundle.candidates.find((candidate) => candidate.items.length > 0) ?? null,
  );
  const eligibility = await conversationV2GroupEligibility(env, groupId, organizationId);
  const v2Eligible = eligibility.eligible;
  if (trace) {
    trace.conversation_v2_dispatch_entered = true;
    trace.conversation_v2_eligible = v2Eligible;
    trace.conversation_v2_skip_reason = eligibility.reason;
    trace.conversation_v2_global_mode = eligibility.globalMode;
    trace.conversation_v2_group_enabled = eligibility.groupEnabled;
    trace.conversation_v2_group_found = eligibility.groupFound;
    trace.conversation_v2_group_access = eligibility.reason === "eligible"
      ? "enabled"
      : eligibility.reason === "group_not_found" ? "not_found" : "disabled";
  }
  if (!v2Eligible) {
    if (trace) {
      trace.conversation_v2_returned_null = true;
      trace.conversation_v2_fallback_origin = "v2_ineligible";
      trace.conversation_v2_fallback_reason = eligibility.reason;
    }
    return null;
  }
  const plannerStartedAtMs = Date.now();
  if (trace) {
    trace.conversation_v2_planner_invoked = true;
    trace.conversation_v2_planner_started_at = new Date().toISOString();
  }

  const referencedCandidate = entries.length === 1 && (
    session?.semanticMemory?.lastReferencedObjectType === "candidate"
    || session?.semanticMemory?.lastExplainedObjectType === "candidate"
    || /(?:這筆|这笔|這個|这个|那筆|那笔|那個|那个|它|這件|这件)/u.test(text)
  );
  let scoped = conversationV2CandidateContext(entries, session, environment, pendingContextActive, referencedCandidate);
  // Explicit @AI natural language is AI-first. Deterministic routing is still
  // evaluated after the model as a local safety/fallback policy, never as the
  // gate that decides whether the model gets to understand the request.
  const aiStartedAt = Date.now();
  const aiResult = await classifyConversationV2WithAi(env.AI, env.CONVERSATION_MODEL, text, scoped.context);
  if (trace) {
    trace.conversation_v2_ai_first = true;
    trace.conversation_v2_ai_invoked = aiResult.attempted;
    trace.conversation_v2_ai_attempted = aiResult.attempted;
    trace.conversation_v2_ai_duration_ms = Date.now() - aiStartedAt;
    trace.conversation_v2_ai_validation = aiResult.validation;
    trace.conversation_v2_ai_error_class = aiResult.errorClass ?? null;
  }
  const deterministic = routeConversationV2Deterministic(text, scoped.context);
  const selected = normalizeConversationV2ReferencePlan(
    chooseSafeConversationV2Plan(deterministic, aiResult.plan),
    text,
    scoped.context,
  );
  // A class-level rule must never silently borrow the only open Candidate as
  // its subject.  Keep the inbox count for generic advice/observability, but
  // remove the concrete entry from this turn's rendering context.
  if (selected.referenceScope === "class"
    && (selected.goal === "EXPLAIN" || selected.goal === "ADVISE" || selected.goal === "QUERY" || selected.goal === "SHOW_STATE")) {
    scoped = {
      current: undefined,
      context: {
        ...scoped.context,
        hasCurrentCandidate: false,
        currentCandidateId: null,
        currentCandidateFarm: null,
        currentCandidateHouse: null,
        currentCandidateFlock: null,
        currentCandidateEvent: null,
        currentCandidateQuantity: null,
        currentCandidateCaretaker: null,
        currentCandidateConflictText: null,
        currentCandidateConflictCodes: [],
        currentCandidateSourceEvidence: [],
        currentCandidateEvidence: [],
        currentCandidateConflictEvidence: [],
        currentCandidateReconciliation: null,
        currentCandidateCaretakerOverride: null,
        currentCandidateState: null,
        currentCandidateBlockingField: null,
        activeObjectType: scoped.context.activeObjectType === "candidate" ? null : scoped.context.activeObjectType,
        activeObjectId: scoped.context.activeObjectType === "candidate" ? null : scoped.context.activeObjectId,
      },
    };
  }
  const speech = classifyConversationSpeechAct(text, scoped.context);
  const answerContract = selected.answerContract ?? deterministic.answerContract ?? inferConversationAnswerContract(text);
  const memoryRelevant = isConversationMemoryRelevant(text, scoped.context);
  const selectedBy = aiResult.plan && selected.goal === aiResult.plan.goal ? "ai" : "deterministic_policy";
  if (trace) {
    trace.conversation_v2_planner_completed_at = new Date().toISOString();
    trace.conversation_v2_planner_duration_ms = Date.now() - plannerStartedAtMs;
    trace.conversation_v2_deterministic_goal = deterministic.goal;
    trace.conversation_v2_deterministic_topic = deterministic.topic;
    trace.conversation_v2_ai_goal = aiResult.plan?.goal ?? null;
    trace.conversation_v2_selected_goal = selected.goal;
    trace.conversation_v2_topic = selected.topic;
    trace.conversation_v2_speech_act = speech.speechAct;
    trace.conversation_v2_object_type = speech.objectType;
    trace.conversation_v2_goal_guard = speech.safeToRecord ? "record_assertion" : speech.reason;
    trace.conversation_v2_mutation_level = selected.goal === "REPAIR" || selected.goal === "CANCEL" || selected.goal === "CONFIRM" ? "candidate" : "read";
    trace.conversation_v2_plan_source = selectedBy;
    trace.conversation_v2_selected_by = selectedBy;
    trace.conversation_v2_plan_valid = aiResult.validation === "schema_valid"
      ? true
      : aiResult.attempted ? false : null;
    trace.conversation_v2_requested_tools = selected.requestedTools;
    trace.conversation_v2_executed_tools = [];
    trace.conversation_v2_tool_invoked = false;
    trace.conversation_v2_tool_status = selected.requestedTools.length ? "direct_handler_pending" : "not_needed";
    trace.conversation_v2_policy_level = trace.conversation_v2_mutation_level === "candidate" ? "candidate" : "read";
    trace.conversation_v2_tool_result_status = "pending";
    trace.conversation_v2_answer_contract_mode = answerContract.mode;
    trace.conversation_v2_requested_count = answerContract.requestedCount ?? null;
    trace.conversation_v2_example_count = answerContract.exampleCount ?? null;
    trace.conversation_v2_capability_count = answerContract.capabilityCount ?? null;
    trace.conversation_v2_limitation_count = answerContract.limitationCount ?? null;
    trace.conversation_v2_wants_examples = answerContract.wantsExamples;
    trace.conversation_v2_wants_capabilities = answerContract.wantsCapabilities;
    trace.conversation_v2_wants_limitations = answerContract.wantsLimitations;
    trace.conversation_v2_wants_summary = answerContract.wantsSummary;
    trace.conversation_v2_wants_reasons = answerContract.wantsReasons;
    trace.conversation_v2_wants_consequences = answerContract.wantsConsequences;
    trace.conversation_v2_wants_options = answerContract.wantsOptions;
    trace.conversation_v2_read_only_explicit = answerContract.readOnlyExplicit;
    trace.conversation_v2_memory_used_for_routing = memoryRelevant;
    trace.conversation_v2_memory_used_in_response = false;
    trace.conversation_v2_broad_read_plan = selected.topic === "today_attention" ? "today_attention" : null;
    trace.conversation_v2_broad_read_tools_requested = selected.topic === "today_attention" ? selected.requestedTools : [];
    trace.conversation_v2_broad_read_tools_executed = [];
    trace.conversation_v2_consequence_vs_advice = answerContract.mode === "consequence"
      ? "consequence"
      : answerContract.mode === "options" ? "advice" : null;
    trace.conversation_v2_reference_scope = selected.referenceScope ?? "none";
    trace.conversation_v2_referent_required = selected.referentRequired ?? false;
    trace.conversation_v2_referent_resolved = selected.referentResolved ?? false;
    trace.conversation_v2_referent_source = selected.referentSource ?? "none";
    trace.conversation_v2_generic_rule_used = selected.genericRuleUsed ?? false;
    trace.conversation_v2_active_candidate_count = entries.length;
    trace.conversation_v2_advice_subject_exists = selected.goal === "ADVISE"
      ? selected.referenceScope === "instance"
        ? Boolean(selected.referentResolved)
        : entries.length > 0
      : undefined;
  }
  // Existing Quick Record owns a deliberately narrow set of concrete
  // observations and pending farm/house selections.  Those are safe,
  // deterministic continuation actions, not general conversation goals.
  // Let them reach the existing resolver after V2 has had its AI-first
  // opportunity; otherwise an explicit mention would turn a valid pending
  // selection or abnormal observation into a read-only fallback.
  // Concrete record-shaped text belongs to the existing Quick Record owner,
  // even when an older quick session has expired. Otherwise V2 would safely
  // answer a new observation as an unknown read-only question and the legacy
  // workflow would never get a chance to open the next session. A question or
  // conditional explanation that merely mentions an event keyword remains in
  // V2. A live waiting_farm/waiting_house session additionally hands off a
  // plain selection such as a farm name or house number.
  const concreteQuickRecord = quickRecordLooksRelevant(text)
    && !speech.question
    && !speech.conditional;
  const pendingQuickSelection = quickPendingContextActive
    && !speech.question
    && !speech.conditional;
  const legacyQuickContinuation = concreteQuickRecord
    || pendingQuickSelection
    || (quickContextActive && correctionLooksRelevant(text))
    || (pendingContextActive && speech.speechAct === "UNKNOWN" && !speech.question && !speech.conditional);
  // A single open item is a safe target for an explicit Candidate action even
  // after a read query changed the semantic active object to query_result.  It
  // does not make the Candidate modal: read/advice goals keep the current
  // semantic object, while an explicit repair/cancel/confirm can use the
  // unambiguous sole open item.
  if (!scoped.current
    && !pendingContextActive
    && entries.length === 1
    && (selected.goal === "REPAIR" || selected.goal === "CANCEL" || selected.goal === "CONFIRM")) {
    scoped = conversationV2CandidateContext(entries, null, environment, false);
  }
  if (legacyQuickContinuation
    || ((quickContextActive || pendingContextActive)
      && (speech.speechAct === "ASSERT" || speech.speechAct === "CORRECTION" || selected.goal === "RECORD"))
    || (selected.goal === "RECORD" && conversationOfficialRecordAllowed(speech))) {
    if (trace) {
      trace.conversation_v2_outcome_kind = "business_handoff";
      trace.conversation_v2_fallback_origin = "existing_business_handoff";
      trace.conversation_v2_fallback_reason = selected.goal === "RECORD" ? "explicit_record_intent" : "active_quick_or_pending_workflow";
      trace.conversation_v2_returned_null = true;
      trace.conversation_v2_response_strategy = "business_handoff";
    }
    return null;
  }
  console.log(JSON.stringify({
    event: "conversation_v2_plan",
    group_id_suffix: groupId.length <= 12 ? groupId : `${groupId.slice(0, 4)}…${groupId.slice(-4)}`,
    user_id_suffix: userId.length <= 12 ? userId : `${userId.slice(0, 4)}…${userId.slice(-4)}`,
    active_object_type: scoped.current ? "candidate" : null,
    goal: selected.goal,
    target: selected.target,
    topic: selected.topic,
    requested_tools: selected.requestedTools,
    mutation_level: selected.goal === "REPAIR" || selected.goal === "CANCEL" || selected.goal === "CONFIRM" ? "candidate" : "read",
    ai_first: true,
    ai_fallback: aiResult.attempted,
    ai_plan_goal: aiResult.plan?.goal ?? null,
    deterministic_goal: deterministic.goal,
    goal_source: selectedBy,
    ai_validation: aiResult.validation,
    confidence: selected.confidence,
  }));

  const save = async (
    lastAction: string,
    summary: string,
    entry?: AmbientCandidateInboxEntry,
    memoryPatch: ConversationReadMemoryPatch = {},
  ): Promise<void> => {
    const candidate = entry?.bundle.candidates.find((item) => item.items.length > 0) ?? entry?.bundle.candidates[0];
    const conflict = candidate?.conflictEvidence?.[0];
    const previousMemory = session?.semanticMemory ?? {};
    const semanticMemory: ConversationV2SemanticMemory = {
      ...previousMemory,
      activeObjectType: memoryPatch.activeObjectType ?? (entry ? "candidate" : previousMemory.activeObjectType ?? null),
      activeObjectId: memoryPatch.activeObjectId ?? (entry?.row.id ?? previousMemory.activeObjectId ?? null),
      activeObjectSummary: memoryPatch.activeObjectSummary ?? previousMemory.activeObjectSummary ?? null,
      lastGoal: selected.goal,
      lastTopic: selected.topic,
      lastReferenceScope: selected.referenceScope ?? null,
      lastAction,
      lastQueryResult: memoryPatch.lastQueryResult ?? previousMemory.lastQueryResult ?? null,
      lastQueryResultType: memoryPatch.lastQueryResultType ?? previousMemory.lastQueryResultType ?? null,
      lastReferencedObject: memoryPatch.lastReferencedObject ?? entry?.row.id ?? previousMemory.lastReferencedObject ?? null,
      lastReferencedObjectType: entry ? "candidate" : memoryPatch.lastReferencedObjectType ?? previousMemory.lastReferencedObjectType ?? null,
      lastReferencedField: selected.proposedAction && "field" in selected.proposedAction ? selected.proposedAction.field : previousMemory.lastReferencedField ?? null,
      lastExplainedIssue: memoryPatch.lastExplainedIssue ?? summary.slice(0, 800),
      lastExplainedObjectType: memoryPatch.lastExplainedObjectType ?? (entry ? "candidate" : previousMemory.lastExplainedObjectType ?? null),
      lastExplainedObjectId: memoryPatch.lastExplainedObjectId ?? (entry?.row.id ?? previousMemory.lastExplainedObjectId ?? null),
      lastConclusion: memoryPatch.lastExplainedIssue ?? summary.slice(0, 800),
      lastEvidenceRefs: candidate?.evidence?.map((item) => item.sourceRef).filter((value): value is string => Boolean(value)).slice(0, 48) ?? previousMemory.lastEvidenceRefs ?? [],
      lastBlockingStatus: conflict ? (conflict.blocking ? "blocking" : "non_blocking") : "unknown",
      lastRecommendedOptions: memoryPatch.lastRecommendedOptions ?? (conflict?.overrideAllowed ? ["保留已選雞場", "忽略線索", "修改必要欄位", "取消這筆"] : previousMemory.lastRecommendedOptions ?? []),
      lastActionProposal: selected.proposedAction?.type ?? null,
      lastUserExplicitDecision: ["REPAIR", "CANCEL", "CONFIRM"].includes(selected.goal) ? text.slice(0, 240) : previousMemory.lastUserExplicitDecision ?? null,
      lastUserQuestionType: speech.speechAct,
      lastPendingObjectType: memoryPatch.lastPendingObjectType ?? (pendingContextActive ? "pending_action" : previousMemory.lastPendingObjectType ?? null),
      lastPendingObjectId: memoryPatch.lastPendingObjectId ?? previousMemory.lastPendingObjectId ?? null,
      lastAssistantResponseSummary: summary.slice(0, 800),
      updatedAt: nowIso,
    };
    if (trace) {
      trace.conversation_v2_outcome_kind ??= "rendered";
      trace.conversation_v2_returned_null = false;
      trace.conversation_v2_renderer_status = trace.conversation_v2_renderer ? "success" : "not_attempted";
      trace.conversation_v2_composer_invoked = Boolean(trace.conversation_v2_renderer);
      trace.conversation_v2_tool_status = trace.conversation_v2_tool_status === "direct_handler_pending"
        ? "direct_handler"
        : trace.conversation_v2_tool_status ?? "not_needed";
    }
    if (trace) trace.conversation_v2_session_write_attempted = true;
    try {
      await saveConversationV2Session(env, organizationId, groupId, userId, now, {
        // The legacy SQL column only supports candidate/daily-review/quick
        // record values. General read objects live in semantic_memory_json;
        // never encode an official event id as a Candidate there.
        activeObjectId: entry?.row.id ?? null,
        lastGoal: selected.goal,
        lastTopic: selected.topic,
        lastAction,
        lastTool: selected.requestedTools[0] ?? null,
        lastToolResultSummary: summary.slice(0, 500),
        lastExplainedIssue: summary.slice(0, 800),
        turnCount: (session?.turnCount ?? 0) + 1,
        semanticMemory,
      });
      if (trace) {
        trace.conversation_v2_session_write_status = "success";
        trace.conversation_v2_session_persisted = true;
      }
    } catch (error) {
      if (trace) {
        trace.conversation_v2_session_write_status = "failed";
        trace.conversation_v2_session_write_error_class = error instanceof Error && error.name ? error.name : "db_error";
      }
      throw error;
    }
    if (trace) {
      trace.conversation_v2_tool_result_status = "success";
      trace.conversation_v2_response_strategy ??= trace.conversation_v2_renderer ?? `${selected.goal.toLowerCase()}_grounded`;
      finalizeConversationV2AnswerContractTrace(trace, answerContract);
      await writeConversationV2Trace(env, event, organizationId, groupId, userId, now, v2Eligible, session, trace, text);
    }
  };

  // Final local assertion guard: an AI plan or a parser cannot turn a
  // question, quote, historical reference, or hypothetical into a new
  // official record. The existing business writer remains the only owner of
  // a proven ASSERT/RECORD turn.
  if (selected.goal === "RECORD" && !conversationOfficialRecordAllowed(speech)) {
    const reply = conversationV2ReadOnlyRefusalReply(accountName);
    if (trace) {
      trace.conversation_v2_renderer = "renderConversationV2ReadOnlyRefusal";
      trace.conversation_v2_mutation_level = "read";
      trace.conversation_v2_policy_level = "read";
      trace.conversation_v2_goal_guard = "blocked_unproven_record_assertion";
      trace.conversation_v2_outcome_kind = "refused";
    }
    await save("record_goal_guard", conversationReplySummary(reply), undefined, {
      activeObjectType: scoped.context.activeObjectType ?? null,
      activeObjectId: scoped.context.activeObjectId ?? null,
      activeObjectSummary: conversationReplySummary(reply),
      lastExplainedIssue: conversationReplySummary(reply),
    });
    return reply;
  }

  const candidateActionGoal = selected.goal === "REPAIR" || selected.goal === "CANCEL" || selected.goal === "CONFIRM";
  const candidateReadGoal = (selected.goal === "EXPLAIN" || selected.goal === "SHOW_STATE" || selected.goal === "ADVISE")
    && selected.target === "candidate"
    && selected.referenceScope !== "class";
  if ((candidateActionGoal || candidateReadGoal) && !scoped.current && entries.length > 1) {
    const reply = await renderAmbientCandidateSelection(entries);
    if (trace) trace.conversation_v2_renderer = "renderAmbientCandidateSelection";
    await save("candidate_selection_required", conversationReplySummary(reply));
    return reply;
  }
  if (candidateActionGoal && !scoped.current && !entries.length) {
    const reply = conversationV2NoCandidateReply(accountName, selected.goal);
    if (trace) {
      trace.conversation_v2_renderer = "renderConversationV2NoCandidate";
      trace.conversation_v2_outcome_kind = "no_data";
      trace.conversation_v2_mutation_level = "read";
      trace.conversation_v2_policy_level = "read";
      trace.conversation_v2_goal_guard = "no_candidate_for_action";
    }
    await save("no_candidate", conversationReplySummary(reply));
    return reply;
  }
  const entry = scoped.current;

  if (selected.goal === "CANCEL" && !entry && pendingContextActive) {
    const cancelled = await cancelScopedPendingActions(env, groupId, userId, "user_cancelled");
    const reply = [buildTextMessage(cancelled
      ? `${botName(accountName)}\n✅ 已取消目前待回答的問題。正式資料沒有新增。`
      : `${botName(accountName)}\n目前沒有正在等待回答的問題。` )];
    if (trace) trace.conversation_v2_renderer = "cancelScopedPendingActions";
    await save("cancel_pending_action", conversationReplySummary(reply), undefined, {
      activeObjectType: "pending_action",
      activeObjectId: null,
      activeObjectSummary: conversationReplySummary(reply),
      lastPendingObjectType: "pending_action",
      lastPendingObjectId: null,
    });
    return reply;
  }

  if ((selected.goal === "ANALYZE" || selected.goal === "QUERY") && selected.topic === "today_attention") {
    const result = await conversationTodayAttentionReply(env, organizationId, entries, accountName, answerContract);
    if (trace) {
      trace.conversation_v2_renderer = "renderTodayAttentionSummary";
      trace.conversation_v2_renderer_variant = "today_attention";
      trace.conversation_v2_tool_invoked = true;
      trace.conversation_v2_tool_status = "success";
      trace.conversation_v2_tool_result_status = "success";
      trace.conversation_v2_executed_tools = result.executedTools;
      trace.conversation_v2_broad_read_plan = "today_attention";
      trace.conversation_v2_broad_read_tools_requested = selected.requestedTools;
      trace.conversation_v2_broad_read_tools_executed = result.executedTools;
    }
    await save("analyze_today_attention", result.summary, undefined, {
      activeObjectType: "query_result",
      activeObjectId: null,
      activeObjectSummary: result.summary,
      lastQueryResult: result.summary,
      lastQueryResultType: "query_result",
    });
    return result.messages;
  }

  if (selected.goal === "QUERY" && selected.topic === "today_mortality") {
    const result = await todayMortalityReply(env, groupId, organizationId, undefined, accountName, conversationRequestedDay(text, now));
    if (trace) trace.conversation_v2_renderer = "todayMortalityReply";
    await save("query_today_mortality", conversationReplySummary([buildTextMessage(result)]), undefined, {
      activeObjectType: "query_result",
      activeObjectId: null,
      activeObjectSummary: result,
      lastQueryResult: result,
      lastQueryResultType: "operational_event",
    });
    return [buildTextMessage(result)];
  }
  if (selected.goal === "QUERY" && selected.topic === "today_abnormal") {
    const result = await conversationTodayAbnormalReply(env, organizationId, accountName);
    if (trace) trace.conversation_v2_renderer = "conversationTodayAbnormalReply";
    await save("query_today_abnormal", result.summary, undefined, {
      activeObjectType: "query_result",
      activeObjectId: result.objectId,
      activeObjectSummary: result.summary,
      lastQueryResult: result.summary,
      lastQueryResultType: "abnormal_event",
    });
    return result.messages;
  }
  if (selected.goal === "QUERY" && selected.topic === "recent_event") {
    const referencedEventId = session?.semanticMemory?.activeObjectType === "operational_event"
      ? session.semanticMemory.activeObjectId
      : null;
    const result = await conversationRecentOperationalReply(env, organizationId, groupId, userId, accountName, referencedEventId);
    if (trace) trace.conversation_v2_renderer = "conversationRecentOperationalReply";
    await save("query_recent_event", result.summary, undefined, {
      activeObjectType: "operational_event",
      activeObjectId: result.objectId,
      activeObjectSummary: result.summary,
      lastQueryResult: result.summary,
      lastQueryResultType: "operational_event",
      lastReferencedObject: result.objectId,
      lastReferencedObjectType: "operational_event",
    });
    return result.messages;
  }
  if (selected.goal === "QUERY" && selected.topic === "event_abnormality") {
    if (entry) {
      const reply = [buildTextMessage(`${botName(accountName)}\n這筆目前還在待確認，尚未建立正式死亡紀錄，所以現在沒有可比對的正式異常。先前的線索不會因這次查詢被寫入或修改。` )];
      if (trace) trace.conversation_v2_renderer = "renderPendingCandidateAbnormalityExplanation";
      await save("query_candidate_abnormality", conversationReplySummary(reply), entry);
      return reply;
    }
    const result = await conversationEventAbnormalityReply(env, organizationId, groupId, userId, session?.semanticMemory ?? null, accountName);
    if (trace) trace.conversation_v2_renderer = "conversationEventAbnormalityReply";
    await save("query_event_abnormality", result.summary, undefined, {
      activeObjectType: session?.semanticMemory?.activeObjectType === "operational_event" ? "operational_event" : "query_result",
      activeObjectId: session?.semanticMemory?.activeObjectType === "operational_event" ? session.semanticMemory.activeObjectId : result.objectId,
      activeObjectSummary: result.summary,
      lastQueryResult: result.summary,
      lastQueryResultType: "abnormal_event",
      lastReferencedObject: session?.semanticMemory?.activeObjectType === "operational_event" ? session.semanticMemory.activeObjectId : result.objectId,
      lastReferencedObjectType: session?.semanticMemory?.activeObjectType === "operational_event" ? "operational_event" : "abnormal_event",
      lastExplainedObjectType: session?.semanticMemory?.activeObjectType === "operational_event" ? "operational_event" : "abnormal_event",
      lastExplainedObjectId: session?.semanticMemory?.activeObjectType === "operational_event" ? session.semanticMemory.activeObjectId : result.objectId,
    });
    return result.messages;
  }
  if (selected.goal === "QUERY" && selected.topic === "pending_status") {
    const reply = await queryOpenCandidateInbox(env, organizationId, entries, accountName);
    if (trace) trace.conversation_v2_renderer = "queryOpenCandidateInbox";
    await save("query_pending_status", conversationReplySummary(reply), entry);
    return reply;
  }

  if (selected.goal === "SHOW_STATE" && selected.target === "pending_action") {
    const reply = [buildTextMessage(`${botName(accountName)}\n目前有一個待回答的問題，系統正在等你補充必要資料。你可以直接回答問題，也可以說明要先暫停或取消。` )];
    if (trace) trace.conversation_v2_renderer = "renderPendingConversationState";
    await save("show_pending_state", conversationReplySummary(reply), undefined, {
      activeObjectType: "pending_action",
      activeObjectId: null,
      activeObjectSummary: conversationReplySummary(reply),
      lastPendingObjectType: "pending_action",
    });
    return reply;
  }
  if (selected.goal === "EXPLAIN"
    && selected.referenceScope === "class"
    && selected.topic === "candidate_consequence"
    && !entry) {
    const reply = conversationV2CandidateClassConsequenceReply(accountName);
    if (trace) {
      trace.conversation_v2_renderer = "renderCandidateClassConsequence";
      trace.conversation_v2_renderer_variant = "class_consequence";
      trace.conversation_v2_consequence_vs_advice = "consequence";
      trace.conversation_v2_memory_used_in_response = false;
    }
    await save("explain_candidate_class_consequence", conversationReplySummary(reply), undefined, {
      activeObjectType: "query_result",
      activeObjectId: null,
      activeObjectSummary: conversationReplySummary(reply),
      lastQueryResult: conversationReplySummary(reply),
      lastQueryResultType: "query_result",
      lastExplainedObjectType: "query_result",
      lastExplainedObjectId: null,
    });
    return reply;
  }
  if (selected.goal === "EXPLAIN"
    && selected.referenceScope === "instance"
    && selected.referentRequired
    && !selected.referentResolved
    && !entry) {
    const reply = conversationV2MissingInstanceReferenceReply(accountName);
    if (trace) {
      trace.conversation_v2_renderer = "renderConversationV2MissingInstanceReference";
      trace.conversation_v2_renderer_variant = "instance_reference_missing";
      trace.conversation_v2_outcome_kind = "clarified";
      trace.conversation_v2_memory_used_in_response = false;
    }
    await save("explain_instance_reference_missing", conversationReplySummary(reply), undefined, {
      activeObjectType: "query_result",
      activeObjectId: null,
      activeObjectSummary: conversationReplySummary(reply),
      lastQueryResult: conversationReplySummary(reply),
      lastQueryResultType: "query_result",
    });
    return reply;
  }
  if (selected.goal === "EXPLAIN" && selected.target === "current_context" && !entry) {
    const previous = memoryRelevant ? session?.semanticMemory?.lastConclusion ?? session?.lastExplainedIssue : null;
    const reply = [buildTextMessage(`${botName(accountName)}\n${previous
      ? `上一輪提到的是：${previous}。如果你要問的是剛才的處理原因，我可以依這個上下文繼續說明。`
      : pendingContextActive
        ? "剛才之所以請你補充資料，是因為目前這筆操作還缺必要資訊；你可以直接回答待回答的欄位，或先說明要不要繼續。"
        : "目前沒有足夠的上一輪說明可以可靠還原；你可以直接說明要查詢的資料或要解釋哪一筆。"}`)];
    if (trace) {
      trace.conversation_v2_renderer = "renderConversationContextExplanation";
      trace.conversation_v2_renderer_variant = previous ? "context_follow_up" : "context_standalone";
      trace.conversation_v2_memory_used_in_response = Boolean(previous);
    }
    await save("explain_context", conversationReplySummary(reply), undefined, {
      activeObjectType: pendingContextActive ? "pending_action" : "query_result",
      activeObjectSummary: conversationReplySummary(reply),
      lastExplainedIssue: conversationReplySummary(reply),
    });
    return reply;
  }
  if (selected.goal === "ADVISE" && !entry) {
    if (selected.referenceScope === "instance"
      && selected.referentRequired
      && !selected.referentResolved) {
      const reply = conversationV2MissingInstanceReferenceReply(accountName);
      if (trace) {
        trace.conversation_v2_renderer = "renderConversationV2MissingInstanceReference";
        trace.conversation_v2_renderer_variant = "instance_reference_missing";
        trace.conversation_v2_outcome_kind = "clarified";
        trace.conversation_v2_memory_used_in_response = false;
      }
      await save("advise_instance_reference_missing", conversationReplySummary(reply), undefined, {
        activeObjectType: "query_result",
        activeObjectId: null,
        activeObjectSummary: conversationReplySummary(reply),
        lastQueryResult: conversationReplySummary(reply),
        lastQueryResultType: "query_result",
      });
      return reply;
    }
    const reply = conversationV2GenericAdviceReply(accountName, entries.length);
    if (trace) {
      trace.conversation_v2_renderer = "renderPendingAdvice";
      trace.conversation_v2_renderer_variant = entries.length > 0 ? "class_options_subject_exists" : "class_options_no_subject";
      trace.conversation_v2_consequence_vs_advice = "advice";
      trace.conversation_v2_memory_used_in_response = false;
    }
    await save("advise_context", conversationReplySummary(reply), undefined, {
      activeObjectType: pendingContextActive ? "pending_action" : "query_result",
      activeObjectSummary: conversationReplySummary(reply),
      lastRecommendedOptions: ["補充或修改資料", "稍後處理", "明確忽略或取消"],
    });
    return reply;
  }

  if (selected.goal === "SHOW_STATE") {
    const activeObjectType = scoped.context.activeObjectType ?? session?.semanticMemory?.activeObjectType ?? null;
    if (activeObjectType === "operational_event") {
      const result = await conversationRecentOperationalReply(
        env,
        organizationId,
        groupId,
        userId,
        accountName,
        session?.semanticMemory?.activeObjectId ?? null,
      );
      if (trace) trace.conversation_v2_renderer = "conversationOperationalEventState";
      await save("show_operational_event_state", conversationReplySummary(result.messages), undefined, {
        activeObjectType: "operational_event",
        activeObjectId: result.objectId,
        activeObjectSummary: result.summary,
        lastQueryResult: result.summary,
        lastQueryResultType: "operational_event",
        lastReferencedObject: result.objectId,
        lastReferencedObjectType: "operational_event",
        lastExplainedObjectType: "operational_event",
        lastExplainedObjectId: result.objectId,
      });
      return result.messages;
    }
    if (!entry) {
      const reply = conversationV2NoCandidateReply(accountName, selected.goal);
      if (trace) {
        trace.conversation_v2_renderer = "renderConversationV2NoCandidate";
        trace.conversation_v2_outcome_kind = "no_data";
      }
      await save("show_state_no_candidate", conversationReplySummary(reply), undefined, {
        activeObjectType: "query_result",
        activeObjectSummary: conversationReplySummary(reply),
        lastQueryResult: conversationReplySummary(reply),
        lastQueryResultType: "query_result",
      });
      return reply;
    }
    const candidate = entry.bundle.candidates.find((item) => item.items.length > 0) ?? entry.bundle.candidates[0];
    if (!candidate) {
      const reply = conversationV2NoCandidateReply(accountName, selected.goal);
      if (trace) {
        trace.conversation_v2_renderer = "renderConversationV2NoCandidate";
        trace.conversation_v2_outcome_kind = "no_data";
      }
      await save("show_state_no_candidate", conversationReplySummary(reply));
      return reply;
    }
    const reply = renderAmbientCandidateStateV2(accountName, candidate);
    if (trace) trace.conversation_v2_renderer = "renderAmbientCandidateStateV2";
    if (trace) trace.conversation_v2_session_persisted = true;
    await save("show_state", conversationReplySummary(reply), entry);
    return reply;
  }
  if (selected.goal === "EXPLAIN" || selected.goal === "COMPARE" || selected.goal === "ANALYZE") {
    if (!entry) {
      const reply = conversationV2NoCandidateReply(accountName, selected.goal);
      if (trace) {
        trace.conversation_v2_renderer = "renderConversationV2NoCandidate";
        trace.conversation_v2_outcome_kind = "no_data";
      }
      await save("read_no_candidate", conversationReplySummary(reply), undefined, {
        activeObjectType: "query_result",
        activeObjectSummary: conversationReplySummary(reply),
        lastQueryResult: conversationReplySummary(reply),
        lastQueryResultType: "query_result",
      });
      return reply;
    }
    const reply = await renderAmbientCandidateExplanationV2(env, organizationId, entry, accountName, selected.topic ?? "candidate_conflict");
    if (trace) {
      trace.conversation_v2_renderer = "renderAmbientCandidateExplanationV2";
      trace.conversation_v2_renderer_variant = answerContract.mode === "consequence" ? "consequence" : "grounded_explanation";
      if (answerContract.mode === "consequence") trace.conversation_v2_consequence_vs_advice = "consequence";
    }
    if (trace) trace.conversation_v2_session_persisted = true;
    await save("explain", conversationReplySummary(reply), entry);
    return reply;
  }
  if (selected.goal === "ADVISE") {
    if (!entry) {
      const reply = conversationV2NoCandidateReply(accountName, selected.goal);
      if (trace) {
        trace.conversation_v2_renderer = "renderConversationV2NoCandidate";
        trace.conversation_v2_outcome_kind = "no_data";
      }
      await save("advise_no_candidate", conversationReplySummary(reply), undefined, {
        activeObjectType: "query_result",
        activeObjectSummary: conversationReplySummary(reply),
        lastQueryResult: conversationReplySummary(reply),
        lastQueryResultType: "query_result",
      });
      return reply;
    }
    const reply = conversationV2AdviceReply(accountName, entry);
    if (trace) {
      trace.conversation_v2_renderer = "conversationV2AdviceReply";
      trace.conversation_v2_renderer_variant = "options";
      trace.conversation_v2_consequence_vs_advice = "advice";
    }
    if (trace) trace.conversation_v2_session_persisted = true;
    await save("advise_no_action", conversationReplySummary(reply), entry);
    return reply;
  }
  if (selected.goal === "CANCEL") {
    if (!entry) {
      const reply = conversationV2NoCandidateReply(accountName, selected.goal);
      if (trace) {
        trace.conversation_v2_renderer = "renderConversationV2NoCandidate";
        trace.conversation_v2_outcome_kind = "no_data";
        trace.conversation_v2_mutation_level = "read";
        trace.conversation_v2_policy_level = "read";
      }
      await save("cancel_no_candidate", conversationReplySummary(reply));
      return reply;
    }
    const reply = await cancelAmbientCandidate(env, entry, userId, text);
    if (trace) trace.conversation_v2_renderer = "cancelAmbientCandidate";
    await save("cancel_candidate", conversationReplySummary(reply), undefined);
    return reply;
  }
  if (selected.goal === "CONFIRM") {
    if (!entry) {
      const reply = conversationV2NoCandidateReply(accountName, selected.goal);
      if (trace) {
        trace.conversation_v2_renderer = "renderConversationV2NoCandidate";
        trace.conversation_v2_outcome_kind = "no_data";
        trace.conversation_v2_mutation_level = "read";
        trace.conversation_v2_policy_level = "read";
      }
      await save("confirm_no_candidate", conversationReplySummary(reply));
      return reply;
    }
    const reply = await handleAmbientPostback(env, event, eventIdFor(event), accountName, "ambient_confirm_all", new URLSearchParams({ candidate: entry.row.id }), organizationId, groupId);
    if (trace) trace.conversation_v2_renderer = "handleAmbientPostback";
    await save("confirm_candidate", conversationReplySummary(reply), entry);
    return reply;
  }
  if (selected.goal === "REPAIR") {
    if (!entry) {
      const reply = conversationV2NoCandidateReply(accountName, selected.goal);
      if (trace) {
        trace.conversation_v2_renderer = "renderConversationV2NoCandidate";
        trace.conversation_v2_outcome_kind = "no_data";
        trace.conversation_v2_mutation_level = "read";
        trace.conversation_v2_policy_level = "read";
      }
      await save("repair_no_candidate", conversationReplySummary(reply));
      return reply;
    }
    if (selected.needsClarification || !selected.proposedAction) {
      const reply = await renderCandidateEditMenu(entry);
      if (trace) trace.conversation_v2_renderer = "renderCandidateEditMenu";
      await save("repair_clarification", conversationReplySummary(reply), entry);
      return reply;
    }
    if (selected.proposedAction.type === "dismiss_clue") {
      const reply = await dismissAmbientCandidateClue(env, event, entry, "caretaker", text);
      if (trace) trace.conversation_v2_renderer = "dismissAmbientCandidateClue";
      await save("dismiss_candidate_clue", conversationReplySummary(reply), entry);
      return reply;
    }
    if (selected.proposedAction.type === "set_field") {
      const reply = await applyAmbientCandidatePatch(env, event, entry, selected.proposedAction.field, selected.proposedAction.value, text);
      if (trace) trace.conversation_v2_renderer = "applyAmbientCandidatePatch";
      await save("candidate_patch", conversationReplySummary(reply), entry);
      return reply;
    }
    if (selected.proposedAction.type === "clear_field") {
      const reply = await applyAmbientCandidatePatch(env, event, entry, selected.proposedAction.field, null, text);
      if (trace) trace.conversation_v2_renderer = "applyAmbientCandidatePatch";
      await save("candidate_clear", conversationReplySummary(reply), entry);
      return reply;
    }
    if (selected.proposedAction.type === "snooze_candidate") {
      const reply = await handleAmbientPostback(env, event, eventIdFor(event), accountName, "ambient_snooze", new URLSearchParams({ candidate: entry.row.id }), organizationId, groupId);
      if (trace) trace.conversation_v2_renderer = "handleAmbientPostback";
      await save("snooze_candidate", conversationReplySummary(reply), entry);
      return reply;
    }
  }
  if (selected.goal === "QUERY" && selected.target === "open_candidates") {
    const reply = await queryOpenCandidateInbox(env, organizationId, entries, accountName);
    if (trace) trace.conversation_v2_renderer = "queryOpenCandidateInbox";
    await save("query_open_candidates", conversationReplySummary(reply));
    return reply;
  }
  if (selected.goal === "QUERY" && selected.target === "candidate") {
    if (!entry) {
      const reply = conversationV2NoCandidateReply(accountName, selected.goal);
      if (trace) {
        trace.conversation_v2_renderer = "renderConversationV2NoCandidate";
        trace.conversation_v2_outcome_kind = "no_data";
      }
      await save("query_candidate_no_candidate", conversationReplySummary(reply), undefined, {
        activeObjectType: "query_result",
        activeObjectSummary: conversationReplySummary(reply),
        lastQueryResult: conversationReplySummary(reply),
        lastQueryResultType: "query_result",
      });
      return reply;
    }
    const reply = await renderAmbientCandidateExplanationV2(env, organizationId, entry, accountName, selected.topic ?? "candidate_consequence");
    if (trace) trace.conversation_v2_renderer = "renderAmbientCandidateExplanationV2";
    await save("query_candidate", conversationReplySummary(reply), entry);
    return reply;
  }
  if (selected.goal === "QUERY" && selected.target === "caretaker_farms") {
    const reply = await queryCaretakerFarms(env, organizationId, text, entries, accountName);
    if (trace) trace.conversation_v2_renderer = "queryCaretakerFarms";
    await save("query_caretaker_farms", conversationReplySummary(reply));
    return reply;
  }
  if (selected.goal === "QUERY" && selected.target === "farm_caretakers") {
    const reply = await queryFarmCaretakers(env, organizationId, text, entries, accountName);
    if (trace) trace.conversation_v2_renderer = "queryFarmCaretakers";
    await save("query_farm_caretakers", conversationReplySummary(reply));
    return reply;
  }
  if (selected.goal === "HELP") {
    const reply = conversationV2CapabilityReply(accountName, answerContract);
    if (trace) {
      trace.conversation_v2_renderer = "renderConversationV2Capability";
      trace.conversation_v2_renderer_variant = answerContract.mode === "examples"
        ? "capability_examples"
        : answerContract.mode === "capability_limits" ? "capability_limits" : "capability_generic";
    }
    await save("help", conversationReplySummary(reply));
    return reply;
  }
  if (selected.goal === "CLARIFY" && entry) {
    const reply = await renderCandidateEditMenu(entry);
    if (trace) trace.conversation_v2_renderer = "renderCandidateEditMenu";
    await save("clarify", conversationReplySummary(reply), entry);
    return reply;
  }
  const reply = conversationV2UnknownReadOnlyReply(accountName);
  if (trace) {
    trace.conversation_v2_renderer = "renderConversationV2UnknownReadOnly";
    trace.conversation_v2_outcome_kind = "safe_unknown_fallback";
    trace.conversation_v2_fallback_origin = "v2_unknown_read_only_fallback";
    trace.conversation_v2_fallback_reason = "no_supported_v2_renderer_for_selected_read_goal";
  }
  await save("safe_unknown_fallback", conversationReplySummary(reply), undefined, {
    activeObjectType: "query_result",
    activeObjectSummary: conversationReplySummary(reply),
    lastQueryResult: conversationReplySummary(reply),
    lastQueryResultType: "query_result",
  });
  return reply;
}

async function handleConversationalAgentInput(
  env: Env,
  event: LineEvent,
  groupId: string,
  organizationId: string,
  accountName: string,
  text: string,
): Promise<LineReplyMessage[] | null> {
  const userId = event.source?.userId;
  if (userId) {
    const now = new Date(event.timestamp ?? Date.now()).toISOString();
    // Active Quick Record/Pending state has a narrower domain contract than
    // the conversational layer; let that scoped handler consume the reply.
    if (await quickRecordHasActiveContext(env, groupId, userId, now)
      || await hasScopedPendingState(env, groupId, userId, now)) return null;
  }
  // Bounded context is group-scoped, then narrowed to the one user only for
  // future session pointers. Candidate Inbox itself is intentionally a
  // group-level work queue shared by authorized members.
  const entries = await loadAmbientCandidateInbox(env, groupId, organizationId, new Date(event.timestamp ?? Date.now()).toISOString());
  const context = { openCandidateCount: entries.length, hasCurrentCandidate: entries.length === 1 };
  let route = routeConversationalGoal(text, context);
  if (route.goal === "UNKNOWN" && !/(?:死亡|死亡|淘汰|咳嗽|咳|臭腳|白冠|風扇|水簾|飼料|飲水|出雞|查詢|統計|摘要)/u.test(text)) {
    const aiResult = await classifyConversationalGoalWithAi(env.AI, text, context);
    console.log(JSON.stringify({
      event: "conversational_goal",
      goal: aiResult.route?.goal ?? "UNKNOWN",
      validation: aiResult.validation,
      ai_fallback: aiResult.attempted,
      open_candidate_count: entries.length,
    }));
    if (aiResult.route) route = aiResult.route;
  }
  if (route.goal === "REPAIR" || route.goal === "CANCEL") return null;
  if (route.goal === "EXPLAIN" || route.goal === "SHOW_STATE") {
    if (!entries.length) return [buildTextMessage(`${botName(accountName)}\n目前沒有待確認資料可供說明。`)];
    if (!entries.length || entries.length > 1) return renderAmbientCandidateSelection(entries);
    return explainAmbientCandidate(env, organizationId, entries[0], accountName);
  }
  if (route.goal === "QUERY" && route.target === "open_candidates") return queryOpenCandidateInbox(env, organizationId, entries, accountName);
  if (route.goal === "QUERY" && route.target === "caretaker_farms") return queryCaretakerFarms(env, organizationId, text, entries, accountName);
  if (route.goal === "QUERY" && route.target === "farm_caretakers") return queryFarmCaretakers(env, organizationId, text, entries, accountName);
  if (route.goal === "CLARIFY" && entries.length) {
    return entries.length > 1 ? renderAmbientCandidateSelection(entries) : renderCandidateEditMenu(entries[0]);
  }
  return null;
}

function ambientCandidateInput(candidate: AmbientCandidate, farmName: string): string {
  const house = candidate.houseText ? ` ${candidate.houseText}` : "";
  return `${farmName}${house} ${candidate.items.map(ambientItemText).join(" ")}`.trim();
}

async function validAmbientFarm(
  env: Env,
  organizationId: string,
  farmId: string,
): Promise<MenuFarm | null> {
  return env.DB.prepare(
    `SELECT id, name, environment
       FROM farms
      WHERE id = ? AND organization_id = ? AND active = 1
      LIMIT 1`,
  ).bind(farmId, organizationId).first<MenuFarm>();
}

async function resolveAmbientCandidateFarm(
  env: Env,
  organizationId: string,
  candidate: AmbientCandidate,
): Promise<MenuFarm | null> {
  if (!candidate.farmText) return null;
  const lookup = await resolveFarmQuery(env, organizationId, candidate.farmText, env.LINE_ACCOUNT_NAME);
  return lookup.farm ? { id: lookup.farm.id, name: lookup.farm.name, environment: lookup.farm.environment } : null;
}

function ambientCandidateFarmQuickReply(env: Env, organizationId: string, candidateId: string, candidateIndex: number, candidate?: AmbientCandidate): Promise<LineReplyMessage[]> {
  return menuFarmList(env, organizationId).then((farms) => {
    const candidateFarmIds = new Set(candidate?.resolution?.candidateFarmIds ?? []);
    const choices = candidateFarmIds.size ? farms.filter((farm) => candidateFarmIds.has(farm.id)) : farms;
    return [buildTextMessage(
    "請先選擇這筆待確認資料要記在哪一個雞場；尚未確認前不會寫入正式資料。",
    addAmbientCandidateEditReply(
      addAmbientCandidateCancelReply(buildFarmQuickReply(choices, "ambient_select_farm", { candidate: candidateId, item: String(candidateIndex) }), candidateId),
      candidateId,
    ) ?? undefined,
  )];
  });
}

function ambientCandidateSourceMessages(
  row: AmbientCandidateRow,
  bundle: AmbientCandidateBundle,
  now: string,
): AmbientBufferedMessage[] {
  const candidates = bundle.candidates;
  const sourceMessageIds = bundle.sourceMessageIds?.length
    ? bundle.sourceMessageIds
    : [...new Set(candidates.flatMap((candidate) => candidate.sourceMessageIds ?? []))];
  const sourceTimestamps = bundle.sourceTimestamps?.length
    ? bundle.sourceTimestamps
    : [...new Set(candidates.flatMap((candidate) => candidate.sourceTimestamps ?? []))];
  const sourceUsers = bundle.sourceUsers?.length
    ? bundle.sourceUsers
    : [...new Set(candidates.flatMap((candidate) => candidate.sourceUsers ?? []))];
  const rawTexts = candidates.flatMap((candidate) => candidate.rawTexts ?? candidate.items.map((item) => item.raw));
  const ids = sourceMessageIds.length ? sourceMessageIds : [`candidate-source-${row.id}`];
  return ids.map((lineMessageId, index) => ({
    id: `ambient-source-${lineMessageId}`,
    organizationId: row.organizationId,
    lineGroupId: row.lineGroupId,
    lineUserId: sourceUsers[index] ?? sourceUsers[0] ?? "ambient-candidate-source",
    lineMessageId,
    eventTimestamp: sourceTimestamps[index] ?? sourceTimestamps[0] ?? now,
    text: rawTexts[index] ?? rawTexts[0] ?? "候選營運資訊",
    digestHour: row.hourBucket,
  }));
}

async function applyAmbientCandidateEntityChoice(
  env: Env,
  event: LineEvent,
  row: AmbientCandidateRow,
  bundle: AmbientCandidateBundle,
  candidateIndex: number,
  field: "farm" | "house" | "flock",
  selectedId: string,
  accountName: string,
): Promise<LineReplyMessage[]> {
  const candidate = bundle.candidates[candidateIndex];
  const actorId = event.source?.userId ?? "ambient-group-member";
  if (!candidate) return [buildTextMessage("這筆待確認資料已失效，請重新開啟整理工作箱。")];
  const before = candidateWorkflowSummary(bundle);

  if (field === "farm") {
    const farm = await validAmbientFarm(env, row.organizationId, selectedId);
    if (!farm) return [buildTextMessage("這個雞場選項已失效，請重新開啟摘要工作箱。")];
    candidate.farmText = farm.name;
    candidate.resolution = {
      ...(candidate.resolution ?? { status: "resolved" as const }),
      status: "resolved",
      resolvedFarmId: farm.id,
      candidateFarmIds: [farm.id],
      candidateFarmNames: [farm.name],
    };
    candidate.userOverrides = {
      ...(candidate.userOverrides ?? {}),
      farm: { farmId: farm.id, status: "selected", at: new Date(event.timestamp ?? Date.now()).toISOString() },
      ...(candidate.caretakerText
        ? { caretaker: { status: "overridden" as const, at: new Date(event.timestamp ?? Date.now()).toISOString() } }
        : {}),
    };
  } else if (field === "house") {
    const farmId = candidate.resolution?.resolvedFarmId;
    if (!farmId) return [buildTextMessage("請先選擇雞場，再選雞舍。")];
    const house = await env.DB.prepare(
      `SELECT h.id, h.name
         FROM houses h JOIN farms f ON f.id = h.farm_id
        WHERE h.id = ? AND h.farm_id = ? AND f.organization_id = ? AND f.active = 1 AND h.active = 1
        LIMIT 1`,
    ).bind(selectedId, farmId, row.organizationId).first<{ id: string; name: string }>();
    if (!house) return [buildTextMessage("這個雞舍選項已失效，請重新開啟摘要工作箱。")];
    candidate.houseText = house.name;
    candidate.resolution = {
      ...(candidate.resolution ?? { status: "resolved" as const }),
      status: "resolved",
      resolvedHouseId: house.id,
      candidateHouseIds: [house.id],
      candidateHouseNames: [house.name],
    };
  } else {
    const farmId = candidate.resolution?.resolvedFarmId;
    const houseId = candidate.resolution?.resolvedHouseId;
    if (!farmId || !houseId) return [buildTextMessage("請先完成雞場與雞舍選擇。")];
    const flock = await env.DB.prepare(
      `SELECT fl.id, fl.batch_code AS batchCode
         FROM flocks fl JOIN farms f ON f.id = fl.farm_id
        WHERE fl.id = ? AND fl.farm_id = ? AND fl.house_id = ?
          AND fl.status = 'active' AND f.organization_id = ? AND f.active = 1
        LIMIT 1`,
    ).bind(selectedId, farmId, houseId, row.organizationId).first<{ id: string; batchCode: string }>();
    if (!flock) return [buildTextMessage("這個批次選項已失效，請重新開啟摘要工作箱。")];
    candidate.flockText = flock.batchCode;
    candidate.resolution = {
      ...(candidate.resolution ?? { status: "resolved" as const }),
      status: "resolved",
      resolvedFlockId: flock.id,
      candidateFlockIds: [flock.id],
    };
  }

  const sourceMessages = ambientCandidateSourceMessages(row, bundle, new Date(event.timestamp ?? Date.now()).toISOString());
  const reconciled = await resolveAndReconcileAmbientBundle(
    env,
    row.organizationId,
    bundle,
    sourceMessages,
    new Date(event.timestamp ?? Date.now()),
  );
  await updateAmbientCandidateBundle(env, row, reconciled.bundle, actorId);
  await appendCandidateWorkflowHistory(env, row, {
    action: "select_entity",
    actorId,
    field,
    before,
    after: candidateWorkflowSummary(reconciled.bundle),
  });
  const refreshed = await loadAmbientCandidate(env, row.lineGroupId, row.organizationId, row.id);
  if (!refreshed) {
    return [buildTextMessage("✅ 已完成資料比對；這筆待確認資料沒有重複建立正式紀錄。")];
  }
  const quickReply = await ambientDigestQuickReply(env, row.organizationId, row.id, refreshed.bundle);
  return [buildTextMessage(
    formatAmbientCandidate(refreshed.bundle, "✅ 已補充必要資訊，請確認下一步"),
    quickReply ?? undefined,
  )];
}

async function updateAmbientCandidateBundle(
  env: Env,
  row: AmbientCandidateRow,
  bundle: AmbientCandidateBundle,
  actorId: string,
): Promise<void> {
  const remaining = bundle.candidates.filter((candidate) => candidate.items.length > 0);
  const nextBundle = { ...bundle, candidates: remaining };
  if (!remaining.length) {
    await env.DB.prepare(
      `UPDATE ambient_digest_candidates
          SET status = 'confirmed', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP,
              review_user_id = NULL, review_kind = NULL,
              review_candidate_index = NULL, review_expires_at = NULL
        WHERE id = ? AND line_group_id = ? AND organization_id = ? AND status = 'pending'`,
    ).bind(actorId, row.id, row.lineGroupId, row.organizationId).run();
    return;
  }
  await env.DB.prepare(
    `UPDATE ambient_digest_candidates SET candidate_json = ?,
            review_user_id = NULL, review_kind = NULL,
            review_candidate_index = NULL, review_expires_at = NULL
      WHERE id = ? AND line_group_id = ? AND organization_id = ? AND status = 'pending'`,
  ).bind(JSON.stringify(nextBundle), row.id, row.lineGroupId, row.organizationId).run();
}

async function dismissAmbientCandidateClue(
  env: Env,
  event: LineEvent,
  entry: AmbientCandidateInboxEntry,
  field: "caretaker",
  rawText: string,
): Promise<LineReplyMessage[]> {
  const candidateIndex = entry.bundle.candidates.findIndex((candidate) => candidate.items.length > 0);
  const candidate = candidateIndex >= 0 ? entry.bundle.candidates[candidateIndex] : null;
  const actorId = event.source?.userId ?? "ambient-group-member";
  if (!candidate || field !== "caretaker") return [buildTextMessage("目前沒有可忽略的線索。")];
  const before = candidateWorkflowSummary(entry.bundle);
  candidate.userOverrides = {
    ...(candidate.userOverrides ?? {}),
    caretaker: { status: "dismissed", at: new Date(event.timestamp ?? Date.now()).toISOString() },
  };
  const sourceMessages = ambientCandidateSourceMessages(entry.row, entry.bundle, new Date(event.timestamp ?? Date.now()).toISOString());
  const reconciled = await resolveAndReconcileAmbientBundle(
    env,
    entry.row.organizationId,
    entry.bundle,
    sourceMessages,
    new Date(event.timestamp ?? Date.now()),
  );
  await updateAmbientCandidateBundle(env, entry.row, reconciled.bundle, actorId);
  await appendCandidateWorkflowHistory(env, entry.row, {
    action: "dismiss_clue",
    actorId,
    rawText,
    field,
    before,
    after: candidateWorkflowSummary(reconciled.bundle),
  });
  const refreshed = await loadAmbientCandidate(env, entry.row.lineGroupId, entry.row.organizationId, entry.row.id);
  if (!refreshed) return [buildTextMessage("✅ 已忽略這個飼養者線索，沒有新增正式資料。")];
  const quickReply = await ambientDigestQuickReply(env, entry.row.organizationId, entry.row.id, refreshed.bundle);
  return [buildTextMessage(
    formatAmbientCandidate(refreshed.bundle, "✅ 已忽略低權重飼養者線索；請確認下一步"),
    quickReply ?? undefined,
  )];
}

async function setAmbientCandidateReview(
  env: Env,
  row: AmbientCandidateRow,
  userId: string,
  kind: "item_modify" | "conflict_quantity",
  candidateIndex: number,
  eventTimestamp: number | undefined,
): Promise<void> {
  const reviewExpiresAt = new Date((eventTimestamp ?? Date.now()) + 5 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `UPDATE ambient_digest_candidates
        SET review_user_id = ?, review_kind = ?, review_candidate_index = ?, review_expires_at = ?
      WHERE id = ? AND line_group_id = ? AND organization_id = ? AND status = 'pending'`,
  ).bind(userId, kind, candidateIndex, reviewExpiresAt, row.id, row.lineGroupId, row.organizationId).run();
}

function candidateCorrectionQuantity(text: string, allowPlainQuantity = false): number | null {
  if (!allowPlainQuantity && !/(?:不是|改|改成|改為|改爲|其實|實際|正確)/u.test(text)) return null;
  const values = [...text.matchAll(/\d+(?:\.\d+)?/gu)].map((match) => Number(match[0]));
  const value = values.at(-1);
  return value !== undefined && Number.isInteger(value) && value > 0 && value <= 1_000_000 ? value : null;
}

function candidateCorrectionReplacement(text: string): string | null {
  const afterSeparator = /[，,；;]\s*(?:是|改(?:成|為|爲)?|其實是|實際是|正確是)?\s*([^，,。；;]+)/u.exec(text);
  const match = afterSeparator ?? /(?:改(?:成|為|爲)?|其實是|實際是|正確是)\s*([^，,。；;]+)/u.exec(text);
  const replacement = match?.[1]?.trim();
  return replacement && replacement.length <= 2000 ? replacement : null;
}

async function loadAmbientReview(
  env: Env,
  groupId: string,
  organizationId: string,
  userId: string,
  now: string,
): Promise<{ row: AmbientCandidateRow; bundle: AmbientCandidateBundle; candidateIndex: number; kind: "item_modify" | "conflict_quantity" } | null> {
  const review = await env.DB.prepare(
    `SELECT id, review_kind AS reviewKind, review_candidate_index AS reviewCandidateIndex
       FROM ambient_digest_candidates
      WHERE line_group_id = ? AND organization_id = ? AND review_user_id = ?
        AND status = 'pending' AND review_expires_at > ?
      ORDER BY review_expires_at DESC, id DESC LIMIT 1`,
  ).bind(groupId, organizationId, userId, now).first<{ id: string; reviewKind: "item_modify" | "conflict_quantity"; reviewCandidateIndex: number | null }>();
  if (!review || !review.reviewKind) return null;
  const loaded = await loadAmbientCandidate(env, groupId, organizationId, review.id);
  if (!loaded) return null;
  return {
    ...loaded,
    candidateIndex: Number.isInteger(review.reviewCandidateIndex) ? review.reviewCandidateIndex as number : 0,
    kind: review.reviewKind,
  };
}

async function renderAmbientCandidateSelection(
  entries: AmbientCandidateInboxEntry[],
): Promise<LineReplyMessage[]> {
  const quickReply = buildAmbientCandidateSelectReplies(
    entries.map((entry, index) => ({ id: entry.row.id, label: candidateDisplayLabel(entry, index) })),
  );
  const list = entries.map((entry, index) => candidateDisplayLabel(entry, index)).join("\n");
  return [buildTextMessage(
    `目前有多筆待確認資訊（${entries.length}筆），請選擇要處理哪一筆：\n${list}`,
    quickReply ?? undefined,
  )];
}

async function promptAmbientCandidateField(
  env: Env,
  entry: AmbientCandidateInboxEntry,
  field: CandidateRepairField,
  event: LineEvent,
): Promise<LineReplyMessage[]> {
  const candidateIndex = entry.bundle.candidates.findIndex((candidate) => candidate.items.length > 0);
  const candidate = candidateIndex >= 0 ? entry.bundle.candidates[candidateIndex] : null;
  if (!candidate) return [buildTextMessage("這筆待確認資料已沒有待處理項目。")];
  if (field === "farm") return ambientCandidateFarmQuickReply(env, entry.row.organizationId, entry.row.id, candidateIndex, candidate);
  if (field === "quantity") {
    if (!event.source?.userId) return [buildTextMessage("請直接輸入要修改的數量。")];
    await setAmbientCandidateReview(env, entry.row, event.source.userId, "conflict_quantity", candidateIndex, event.timestamp);
    const known = candidate.items.find((item) => item.type === "mortality" || item.type === "cull")?.quantity;
    return [buildTextMessage(`請只輸入新的數量${known !== null && known !== undefined ? `（目前是${known}）` : ""}，不需要重新輸入雞場或事件。`)];
  }
  if (field === "event") {
    if (!event.source?.userId) return [buildTextMessage("請直接輸入要修改的事件內容。")];
    await setAmbientCandidateReview(env, entry.row, event.source.userId, "item_modify", candidateIndex, event.timestamp);
    return [buildTextMessage("請只輸入新的事件內容，例如：白冠。其他已知資料會保留。")];
  }
  const farmId = candidate.resolution?.resolvedFarmId;
  if (!farmId) return [buildTextMessage("請先選擇雞場，再修改舍別或批次。")];
  if (field === "house") {
    const rows = await env.DB.prepare(
      `SELECT id, name FROM houses WHERE farm_id = ? AND active = 1 ORDER BY name, id`,
    ).bind(farmId).all<{ id: string; name: string }>();
    return [buildTextMessage("請選擇要修改成的雞舍。", addAmbientCandidateCancelReply(
      buildAmbientEntityQuickReply(
        "ambient_select_house",
        entry.row.id,
        candidateIndex,
        rows.results.map((row) => ({ id: row.id, label: row.name, displayText: row.name })),
      ),
      entry.row.id,
    ) ?? undefined)];
  }
  const houseId = candidate.resolution?.resolvedHouseId;
  if (!houseId) return [buildTextMessage("請先選擇雞舍，再修改批次。")];
  const rows = await env.DB.prepare(
    `SELECT id, batch_code AS batchCode FROM flocks
      WHERE farm_id = ? AND house_id = ? AND status = 'active' ORDER BY batch_code, id`,
  ).bind(farmId, houseId).all<{ id: string; batchCode: string }>();
  return [buildTextMessage("請選擇要修改成的批次。", addAmbientCandidateCancelReply(
    buildAmbientEntityQuickReply(
      "ambient_select_flock",
      entry.row.id,
      candidateIndex,
      rows.results.map((row) => ({ id: row.id, label: row.batchCode, displayText: row.batchCode })),
    ),
    entry.row.id,
  ) ?? undefined)];
}

async function applyAmbientCandidatePatch(
  env: Env,
  event: LineEvent,
  entry: AmbientCandidateInboxEntry,
  field: CandidateRepairField,
  value: string | null,
  rawText: string,
): Promise<LineReplyMessage[]> {
  const candidateIndex = entry.bundle.candidates.findIndex((candidate) => candidate.items.length > 0);
  const candidate = candidateIndex >= 0 ? entry.bundle.candidates[candidateIndex] : null;
  const actorId = event.source?.userId ?? "ambient-group-member";
  if (!candidate) return [buildTextMessage("這筆待確認資料已失效，請重新開啟整理工作箱。")];
  const before = candidateWorkflowSummary(entry.bundle);

  if (field === "farm") {
    if (value === null) {
      candidate.farmText = null;
      candidate.resolution = { ...(candidate.resolution ?? { status: "unresolved" as const }), status: "unresolved", resolvedFarmId: null, candidateFarmIds: [], candidateFarmNames: [] };
      candidate.userOverrides = { ...(candidate.userOverrides ?? {}), farm: undefined };
    } else {
      const resolver = await loadFarmResolver(env, entry.row.organizationId);
      const resolved = resolver.resolve(value);
      if (resolved.kind === "direct" && resolved.farm) {
        const farm = await validAmbientFarm(env, entry.row.organizationId, resolved.farm.id);
        if (farm) {
          candidate.farmText = farm.name;
          candidate.resolution = { ...(candidate.resolution ?? { status: "resolved" as const }), status: "resolved", resolvedFarmId: farm.id, candidateFarmIds: [farm.id], candidateFarmNames: [farm.name] };
          candidate.userOverrides = {
            ...(candidate.userOverrides ?? {}),
            farm: { farmId: farm.id, status: "selected", at: new Date(event.timestamp ?? Date.now()).toISOString() },
            ...(candidate.caretakerText
              ? { caretaker: { status: "overridden" as const, at: new Date(event.timestamp ?? Date.now()).toISOString() } }
              : {}),
          };
        }
      } else {
        candidate.farmText = value;
        candidate.resolution = {
          ...(candidate.resolution ?? { status: "ambiguous" as const }),
          status: resolved.kind === "candidates" ? "ambiguous" : "unresolved",
          resolvedFarmId: null,
          candidateFarmIds: resolved.kind === "candidates" ? resolved.candidates.map((item) => item.farmId) : [],
          candidateFarmNames: resolved.kind === "candidates" ? resolved.candidates.map((item) => item.farmName) : [],
        };
      }
    }
  } else if (field === "quantity") {
    const quantity = value ? Number(value) : null;
    if (quantity === null) {
      for (const item of candidate.items) {
        if (item.type === "mortality" || item.type === "cull") {
          item.quantity = null;
          item.confidence = "low";
        }
      }
      candidate.quantity = null;
      candidate.quantityConfidence = "unknown";
      candidate.conflict = false;
      candidate.conflictText = null;
    } else if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000) {
      return [buildTextMessage("請輸入正整數數量，例如：3。")];
    } else {
      for (const item of candidate.items) {
        if (item.type === "mortality" || item.type === "cull") {
          item.quantity = quantity;
          item.confidence = "high";
          item.raw = rawText;
        }
      }
      candidate.quantity = quantity;
      candidate.quantityConfidence = "high";
      candidate.conflict = false;
      candidate.conflictText = null;
    }
  } else if (field === "event") {
    const replacement = value?.trim();
    if (!replacement) return [buildTextMessage("請輸入新的事件內容，例如：白冠。")];
    const item = candidate.items.find((entryItem) => entryItem.type === "abnormal");
    if (!item) return [buildTextMessage("這筆待確認資料沒有可修改的事件內容。")];
    item.raw = replacement;
    item.confidence = "high";
    candidate.eventType = "abnormal";
    candidate.conflict = false;
    candidate.conflictText = null;
  } else if (field === "house") {
    const farmId = candidate.resolution?.resolvedFarmId;
    if (!farmId) return [buildTextMessage("請先確認雞場，再修改舍別。")];
    if (value === null) {
      candidate.houseText = null;
      candidate.flockText = null;
      candidate.resolution = {
        ...(candidate.resolution ?? { status: "resolved" as const }),
        resolvedHouseId: null,
        candidateHouseIds: [],
        candidateHouseNames: [],
        resolvedFlockId: null,
        candidateFlockIds: [],
      };
    } else {
      const houses = await env.DB.prepare(
        `SELECT id, name FROM houses WHERE farm_id = ? AND active = 1 ORDER BY normalized_name, id`,
      ).bind(farmId).all<{ id: string; name: string }>();
      const requested = normalize(value);
      const selected = houses.results.find((house) => {
        const name = normalize(house.name);
        return name === requested || name.includes(requested) || requested.includes(name);
      });
      if (!selected) return [buildTextMessage("找不到這個舍別，請從下方選項選擇。", await ambientDigestQuickReply(env, entry.row.organizationId, entry.row.id, entry.bundle) ?? undefined)];
      candidate.houseText = selected.name;
      candidate.flockText = null;
      candidate.resolution = {
        ...(candidate.resolution ?? { status: "resolved" as const }),
        resolvedHouseId: selected.id,
        candidateHouseIds: [selected.id],
        candidateHouseNames: [selected.name],
        resolvedFlockId: null,
        candidateFlockIds: [],
      };
    }
  } else if (field === "flock") {
    const farmId = candidate.resolution?.resolvedFarmId;
    if (!farmId) return [buildTextMessage("請先確認雞場，再修改批次。")];
    if (value === null) {
      candidate.flockText = null;
      candidate.resolution = {
        ...(candidate.resolution ?? { status: "resolved" as const }),
        resolvedFlockId: null,
        candidateFlockIds: [],
      };
    } else {
      const flocks = await env.DB.prepare(
        `SELECT id, batch_code AS batchCode FROM flocks
          WHERE farm_id = ? AND status = 'active'
          ORDER BY batch_code, id`,
      ).bind(farmId).all<{ id: string; batchCode: string }>();
      const requested = normalize(value);
      const selected = flocks.results.find((flock) => {
        const code = normalize(flock.batchCode);
        return code === requested || code.includes(requested) || requested.includes(code);
      });
      if (!selected) return [buildTextMessage("找不到這個批次，請從下方選項選擇。", await ambientDigestQuickReply(env, entry.row.organizationId, entry.row.id, entry.bundle) ?? undefined)];
      candidate.flockText = selected.batchCode;
      candidate.resolution = {
        ...(candidate.resolution ?? { status: "resolved" as const }),
        resolvedFlockId: selected.id,
        candidateFlockIds: [selected.id],
      };
    }
  }

  const sourceMessages = ambientCandidateSourceMessages(entry.row, entry.bundle, new Date(event.timestamp ?? Date.now()).toISOString());
  const reconciled = await resolveAndReconcileAmbientBundle(
    env,
    entry.row.organizationId,
    entry.bundle,
    sourceMessages,
    new Date(event.timestamp ?? Date.now()),
  );
  await updateAmbientCandidateBundle(env, entry.row, reconciled.bundle, actorId);
  await appendCandidateWorkflowHistory(env, entry.row, {
    action: value === null ? "clear_field" : "set_field",
    actorId,
    rawText,
    field,
    before,
    after: candidateWorkflowSummary(reconciled.bundle),
  });
  const refreshed = await loadAmbientCandidate(env, entry.row.lineGroupId, entry.row.organizationId, entry.row.id);
  if (!refreshed) return [buildTextMessage("✅ 待確認資料已完成更新，沒有新增正式資料。")];
  const quickReply = await ambientDigestQuickReply(env, entry.row.organizationId, entry.row.id, refreshed.bundle);
  return [buildTextMessage(formatAmbientCandidate(refreshed.bundle, "✅ 已更新待確認資料；請確認下一步"), quickReply ?? undefined)];
}

async function handleAmbientUniversalCandidateInput(
  env: Env,
  event: LineEvent,
  eventId: string,
  groupId: string,
  organizationId: string,
  accountName: string,
  text: string,
): Promise<LineReplyMessage[] | null> {
  const intent = parseCandidateRepairIntent(text);
  const repairLike = intent.kind !== "unknown" || /(?:候選|這筆|这笔|不對|不对|選錯|选错|改|取消|算了|不要記|不要记)/u.test(text);
  if (!repairLike) return null;
  const now = new Date(event.timestamp ?? Date.now()).toISOString();
  const loaded = await loadSingleAmbientCandidateForAction(env, groupId, organizationId, now);
  if (!loaded.entries.length) {
    if (intent.kind === "cancel" || intent.kind === "select_field" || intent.kind === "unknown") {
      return [buildTextMessage("目前沒有正在處理或待確認的紀錄。")];
    }
    return null;
  }
  if (intent.kind === "show") return renderAmbientCandidateInbox(env, organizationId, loaded.entries);
  if (!loaded.entry) return renderAmbientCandidateSelection(loaded.entries);
  const entry = loaded.entry;
  if (intent.kind === "cancel") return cancelAmbientCandidate(env, entry, event.source?.userId ?? "ambient-group-member", text);
  if (intent.kind === "dismiss_clue") return dismissAmbientCandidateClue(env, event, entry, intent.field, text);
  if (intent.kind === "ignore") return handleAmbientPostback(env, event, eventId, accountName, "ambient_ignore", new URLSearchParams({ candidate: entry.row.id }), organizationId, groupId);
  if (intent.kind === "snooze") return handleAmbientPostback(env, event, eventId, accountName, "ambient_snooze", new URLSearchParams({ candidate: entry.row.id }), organizationId, groupId);
  if (intent.kind === "confirm") return handleAmbientPostback(env, event, eventId, accountName, "ambient_confirm_all", new URLSearchParams({ candidate: entry.row.id }), organizationId, groupId);
  if (intent.kind === "select_field") {
    if (intent.field) return promptAmbientCandidateField(env, entry, intent.field, event);
    return renderCandidateEditMenu(entry);
  }
  if (intent.kind === "set_field") return applyAmbientCandidatePatch(env, event, entry, intent.field, intent.value, text);
  if (intent.kind === "clear_field") return applyAmbientCandidatePatch(env, event, entry, intent.field, null, text);
  return renderCandidateEditMenu(entry);
}

async function handleAmbientCandidateTextInput(
  env: Env,
  event: LineEvent,
  eventId: string,
  groupId: string,
  organizationId: string,
  accountName: string,
  text: string,
): Promise<LineReplyMessage[] | null> {
  const userId = event.source?.userId;
  if (!userId) return null;
  const reviewed = await loadAmbientReview(env, groupId, organizationId, userId, new Date(event.timestamp ?? Date.now()).toISOString());
  if (!reviewed) return null;
  const candidate = reviewed.bundle.candidates[reviewed.candidateIndex];
  if (!candidate || !candidate.items.length) return [buildTextMessage("這筆待確認項目已失效，請重新開啟整理工作箱。")];
  const item = candidate.items[0];
  const quantity = candidateCorrectionQuantity(text, reviewed.kind === "conflict_quantity");
  const replacement = candidateCorrectionReplacement(text);
  const cancel = /(?:不要|不記|取消|忽略)/u.test(text);
  const before = candidateWorkflowSummary(reviewed.bundle);
  if (cancel) {
    candidate.items.shift();
  } else if (quantity !== null && (item.type === "mortality" || item.type === "cull")) {
    item.quantity = quantity;
    item.confidence = "high";
    candidate.conflict = false;
    candidate.conflictText = null;
    item.raw = text.trim();
  } else if (replacement && item.type === "abnormal") {
    item.raw = replacement;
    item.confidence = "high";
    candidate.conflict = false;
    candidate.conflictText = null;
  } else {
    const farmLookup = await resolveFarmQuery(env, organizationId, text.replace(/^(?:其實是|實際是|正確是|改到|改為|改爲)\s*/u, ""), env.LINE_ACCOUNT_NAME);
    if (farmLookup.farm && /(?:場|雞場|鸡场)/u.test(text)) {
      candidate.farmText = farmLookup.farm.name;
      candidate.conflict = false;
      candidate.conflictText = null;
    } else {
      return [buildTextMessage(`${accountName ? `${botName(accountName)}\n` : ""}請直接輸入修正內容，例如：不是32，是20；或：不是臭腳，是白冠。` )];
    }
  }
  const sourceMessages = ambientCandidateSourceMessages(reviewed.row, reviewed.bundle, new Date(event.timestamp ?? Date.now()).toISOString());
  const reconciled = await resolveAndReconcileAmbientBundle(
    env,
    organizationId,
    reviewed.bundle,
    sourceMessages,
    new Date(event.timestamp ?? Date.now()),
  );
  await updateAmbientCandidateBundle(env, reviewed.row, reconciled.bundle, userId);
  await appendCandidateWorkflowHistory(env, reviewed.row, {
    action: cancel ? "item_ignore" : "text_patch",
    actorId: userId,
    rawText: text,
    field: quantity !== null ? "quantity" : replacement ? "event" : "farm",
    before,
    after: candidateWorkflowSummary(reconciled.bundle),
  });
  const refreshed = await loadAmbientCandidate(env, groupId, organizationId, reviewed.row.id);
  if (!refreshed) return [buildTextMessage(`✅ 待確認內容已更新${cancel ? "；這個項目已忽略" : ""}，目前沒有新增正式資料。`)];
  const quickReply = await ambientDigestQuickReply(env, organizationId, reviewed.row.id, refreshed.bundle);
  return [buildTextMessage(
    `✅ 待確認內容已更新${cancel ? "；這個項目已忽略" : ""}，尚未寫入正式資料。`,
    quickReply ?? undefined,
  )];
}

async function applyAmbientCandidateItems(
  env: Env,
  event: LineEvent,
  eventId: string,
  accountName: string,
  row: AmbientCandidateRow,
  bundle: AmbientCandidateBundle,
  candidateIndex: number,
  farm: MenuFarm,
): Promise<LineReplyMessage[]> {
  const candidate = bundle.candidates[candidateIndex];
  if (!candidate || candidate.conflict || !candidate.items.length) return [buildTextMessage("這筆待確認紀錄目前有衝突或已處理，沒有寫入。")];
  const before = candidateWorkflowSummary(bundle);
  const input = ambientCandidateInput(candidate, farm.name);
  const result = await handleQuickRecordInput(env, event, input, `${eventId}:ambient:${candidateIndex}`, row.lineGroupId, row.organizationId, accountName);
  if (!result.handled) return [buildTextMessage("這筆待確認紀錄無法安全解析，尚未寫入正式資料。")];
  if (result.quickReplyFarms?.length || result.quickReplyHouses?.length) return quickRecordReplyMessages(result, accountName);
  const replies = quickRecordReplyMessages(result, accountName);
  if (isRecordSuccessReply(result.reply)) {
    bundle.candidates.splice(candidateIndex, 1);
    await updateAmbientCandidateBundle(env, row, bundle, event.source?.userId ?? "ambient-group-member");
    await appendCandidateWorkflowHistory(env, row, {
      action: "confirm",
      actorId: event.source?.userId ?? "ambient-group-member",
      before,
      after: candidateWorkflowSummary(bundle),
      terminalReason: bundle.candidates.length ? undefined : "confirmed",
    });
  }
  return replies;
}

async function handleAmbientPostback(
  env: Env,
  event: LineEvent,
  eventId: string,
  accountName: string,
  action: string,
  params: URLSearchParams,
  organizationId: string,
  groupId: string,
): Promise<LineReplyMessage[]> {
  const candidateId = params.get("candidate");
  if (!candidateId) return [buildTextMessage("這組候選紀錄已失效，沒有寫入。")];
  const loaded = await loadAmbientCandidate(env, groupId, organizationId, candidateId);
  if (!loaded) return [buildTextMessage("這組候選紀錄已處理或已失效，沒有重複寫入。")];
  const { row, bundle } = loaded;

  if (action === "ambient_candidate_select") {
    const quickReply = await ambientDigestQuickReply(env, organizationId, row.id, bundle);
    return [buildTextMessage(formatAmbientCandidate(bundle, "📋 已開啟這筆待確認資訊"), quickReply ?? undefined)];
  }
  if (action === "ambient_candidate_edit") return renderCandidateEditMenu({ row, bundle });
  if (action === "ambient_candidate_cancel") {
    return cancelAmbientCandidate(env, { row, bundle }, event.source?.userId ?? "ambient-group-member", undefined);
  }
  if (action === "ambient_candidate_field") {
    const field = params.get("field") as CandidateRepairField | null;
    if (!field || !["farm", "house", "flock", "quantity", "event"].includes(field)) {
      return [buildTextMessage("這個修改欄位已失效，請重新選擇修改。")];
    }
    return promptAmbientCandidateField(env, { row, bundle }, field, event);
  }

  if (action === "ambient_select_farm" || action === "ambient_select_house" || action === "ambient_select_flock") {
    const candidateIndex = Number(params.get("item"));
    const selectedId = action === "ambient_select_farm"
      ? params.get("farm")
      : action === "ambient_select_house"
        ? params.get("house")
        : params.get("flock");
    if (!Number.isInteger(candidateIndex) || candidateIndex < 0 || !selectedId) {
      return [buildTextMessage("這個候選選項已失效，請重新開啟摘要工作箱。")];
    }
    return applyAmbientCandidateEntityChoice(
      env,
      event,
      row,
      bundle,
      candidateIndex,
      action === "ambient_select_farm" ? "farm" : action === "ambient_select_house" ? "house" : "flock",
      selectedId,
      accountName,
    );
  }

  if (action === "ambient_reconcile_view") {
    const possible = bundle.candidates.filter((candidate) => candidate.state === "possibly_recorded");
    const reasons = [...new Set(possible.flatMap((candidate) => candidate.reconciliation?.matchReasons ?? []))];
    return [buildTextMessage(
      `系統找到${possible.length || 1}筆相近的正式紀錄${reasons.length ? `（${reasons.join("、")}）` : ""}。請確認是否為同一筆；系統不會只因相似就自動略過。`,
      buildAmbientReconciliationReplies(row.id),
    )];
  }
  if (action === "ambient_reconcile_already") {
    const remaining = { ...bundle, candidates: bundle.candidates.filter((candidate) => candidate.state !== "possibly_recorded") };
    await updateAmbientCandidateBundle(env, row, remaining, event.source?.userId ?? "ambient-group-member");
    await appendCandidateWorkflowHistory(env, row, {
      action: "reconcile_already",
      actorId: event.source?.userId ?? "ambient-group-member",
      terminalReason: remaining.candidates.length ? undefined : "already_recorded",
    });
    return [buildTextMessage("✅ 已確認相近正式紀錄就是同一筆；沒有新增或修改正式資料。")];
  }
  let effectiveAction = action;
  if (action === "ambient_reconcile_new") {
    for (const candidate of bundle.candidates) {
      if (candidate.state !== "possibly_recorded") continue;
      candidate.state = candidate.resolution?.status === "resolved" ? "new" : "unresolved_entity";
      candidate.reconciliation = { status: "not_recorded", matchingOfficialRecordIds: [], matchReasons: [], matchConfidence: "low" };
    }
    await updateAmbientCandidateBundle(env, row, bundle, event.source?.userId ?? "ambient-group-member");
    effectiveAction = "ambient_confirm_all";
  }

  if (action === "ambient_ignore") {
    await env.DB.prepare(
      `UPDATE ambient_digest_candidates SET status = 'ignored', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP,
          review_user_id = NULL, review_kind = NULL, review_candidate_index = NULL, review_expires_at = NULL
        WHERE id = ? AND line_group_id = ? AND organization_id = ? AND status = 'pending'`,
    ).bind(event.source?.userId ?? "ambient-group-member", row.id, groupId, organizationId).run();
    await appendCandidateWorkflowHistory(env, row, {
      action: "ignore",
      actorId: event.source?.userId ?? "ambient-group-member",
      terminalReason: "ignored",
    });
    return [buildTextMessage("✅ 已忽略這次候選資訊；尚未建立正式營運紀錄。")];
  }
  if (action === "ambient_snooze") {
    const snoozedUntil = new Date((event.timestamp ?? Date.now()) + 60 * 60 * 1000).toISOString();
    await env.DB.prepare(
      `UPDATE ambient_digest_candidates SET status = 'snoozed', snoozed_until = ?,
          review_user_id = NULL, review_kind = NULL, review_candidate_index = NULL, review_expires_at = NULL
        WHERE id = ? AND line_group_id = ? AND organization_id = ? AND status = 'pending'`,
    ).bind(snoozedUntil, row.id, groupId, organizationId).run();
    await appendCandidateWorkflowHistory(env, row, {
      action: "snooze",
      actorId: event.source?.userId ?? "ambient-group-member",
    });
    return [buildTextMessage("⏰ 已暫緩到下一個整理時段；目前沒有寫入正式資料。")];
  }
  if (action === "ambient_conflict_quantity") {
    const candidateIndex = bundle.candidates.findIndex((candidate) => (candidate.conflict || candidate.state === "conflict" || candidate.state === "unresolved_quantity") && candidate.items.length > 0);
    if (candidateIndex < 0 || !event.source?.userId) return [buildTextMessage("這筆候選資訊已失效，請重新整理候選紀錄。")];
    await setAmbientCandidateReview(env, row, event.source.userId, "conflict_quantity", candidateIndex, event.timestamp);
    return [buildTextMessage("這筆候選資訊需要確認數量，尚未寫入。請只輸入正確數量，例如：死亡20；其他已知資料會保留。")];
  }
  if (action === "ambient_review") {
    const first = bundle.candidates.findIndex((candidate) => candidate.items.length > 0);
    if (first < 0) return [buildTextMessage("這組候選紀錄已沒有待確認項目。")];
    const candidate = bundle.candidates[first];
    const item = candidate.items[0];
    const blockingField = ambientCandidateBlockingField(candidate);
    const conflict = blockingField === "quantity"
      ? "\n⚠️ 這組資訊有衝突或數量未確認，請先確認。"
      : blockingField === "reconciliation"
        ? "\n📋 這筆資訊可能已經紀錄，請先確認是否為同一筆。"
        : blockingField === "farm"
          ? "\n請先確認雞場；目前不會重新詢問已知數量。"
          : "";
    const reviewReplies = await ambientDigestQuickReply(env, organizationId, row.id, bundle);
    return [buildTextMessage(
      `請逐項確認：${candidate.farmText ?? "尚未確定雞場"}\n• ${item.type === "mortality" ? `死亡 ${item.quantity ?? "?"}隻` : item.type === "cull" ? `淘汰 ${item.quantity ?? "?"}隻` : item.raw}${conflict}`,
      reviewReplies ?? buildAmbientItemReplies(row.id, first),
    )];
  }
  if (action === "ambient_item_ignore") {
    const candidateIndex = Number(params.get("item"));
    const candidate = bundle.candidates[candidateIndex];
    if (!candidate || !candidate.items.length) return [buildTextMessage("這個候選項目已失效。")];
    candidate.items.shift();
    await updateAmbientCandidateBundle(env, row, bundle, event.source?.userId ?? "ambient-group-member");
    return [buildTextMessage("✅ 已忽略這個候選項目；沒有寫入正式資料。")];
  }
  if (action === "ambient_item_modify") {
    const candidateIndex = Number(params.get("item"));
    const candidate = bundle.candidates[candidateIndex];
    if (!candidate || !candidate.items.length || !event.source?.userId) return [buildTextMessage("這個候選項目已失效。")];
    await setAmbientCandidateReview(env, row, event.source.userId, "item_modify", candidateIndex, event.timestamp);
    return [buildTextMessage("請直接輸入要修正的內容，例如：不是5，是3；或：不是臭腳，是白冠。")];
  }
  if (effectiveAction === "ambient_item_record" || effectiveAction === "ambient_select_farm" || effectiveAction === "ambient_confirm_all") {
    const possibleCandidate = bundle.candidates.find((candidate) => candidate.state === "possibly_recorded");
    if (possibleCandidate) {
      return [buildTextMessage("📋 這筆資訊可能已經紀錄，請先確認是否為同一筆。", buildAmbientReconciliationReplies(row.id))];
    }
    const unresolvedQuantity = bundle.candidates.find((candidate) => candidate.state === "unresolved_quantity");
    if (unresolvedQuantity) {
      return [buildTextMessage("⚠️ 數量尚未確認，請先選「確認數量」並直接輸入正確數量；確認後才會寫入。", buildAmbientConflictReplies(row.id))];
    }
    if (bundle.candidates.some((candidate) => candidate.conflict || candidate.state === "conflict")) {
      return [buildTextMessage("⚠️ 待確認資料有互相矛盾的內容，請先確認數量；目前沒有寫入。", buildAmbientConflictReplies(row.id))];
    }
    const requestedIndex = effectiveAction === "ambient_item_record" || effectiveAction === "ambient_select_farm"
      ? Number(params.get("item"))
      : -1;
    const replies: LineReplyMessage[] = [];
    const candidateIndexes = requestedIndex >= 0 && Number.isInteger(requestedIndex) ? [requestedIndex] : null;
    while (candidateIndexes ? candidateIndexes.length > 0 : bundle.candidates.length > 0) {
      const candidateIndex = candidateIndexes ? (candidateIndexes.shift() as number) : 0;
      const candidate = bundle.candidates[candidateIndex];
      if (!candidate || !candidate.items.length) continue;
      let farm = effectiveAction === "ambient_select_farm" && params.get("farm")
        ? await validAmbientFarm(env, organizationId, params.get("farm") ?? "")
        : await resolveAmbientCandidateFarm(env, organizationId, candidate);
      if (!farm) {
        return ambientCandidateFarmQuickReply(env, organizationId, row.id, candidateIndex, candidate);
      }
      replies.push(...await applyAmbientCandidateItems(env, event, eventId, accountName, row, bundle, candidateIndex, farm));
      if (replies.some((reply) => reply.type === "text" && /尚未寫入|已失效|無法安全解析/u.test(reply.text))) return replies;
    }
    return replies.length ? replies : [buildTextMessage("這組候選紀錄沒有可寫入項目。")];
  }
  return [buildTextMessage("這個候選操作已失效，沒有寫入。")];
}

async function handleCorrectionPostback(
  env: Env,
  event: LineEvent,
  eventId: string,
  groupId: string,
  organizationId: string,
  accountName: string,
  action: string,
  params: URLSearchParams,
): Promise<LineReplyMessage[]> {
  const userId = event.source?.userId;
  if (!userId) return [buildTextMessage("⚠️ 這個更正操作目前無法驗證使用者。")];
  if (action === "correction_action") {
    const type = params.get("type");
    if (type === "whole_cancel") return [buildTextMessage("⚠️ 這會反轉上一組紀錄，原始 Audit 仍會保留。要繼續嗎？", buildWholeCancelConfirmationReplies())];
    if (type === "quantity" || type === "cancel") {
      const targets = await listQuickCorrectionTargets(env, groupId, userId, organizationId, type);
      if (!targets.length) {
        return [buildTextMessage(type === "quantity" ? "目前沒有可更正的死亡紀錄。" : "目前沒有可取消的異常紀錄。")];
      }
      const quickReply = buildCorrectionTargetReplies(
        targets.map((target) => ({ itemId: target.itemId, label: `${target.farmName}｜${target.rawText}` })),
        type,
      );
      if (quickReply) return [buildTextMessage(type === "quantity" ? "請選擇要修改的死亡紀錄：" : "請選擇要取消的異常紀錄：", quickReply)];
      return [buildTextMessage([
        type === "quantity" ? "請選擇要修改的死亡紀錄：" : "請選擇要取消的異常紀錄：",
        ...targets.map((target, index) => `${index + 1}. ${target.farmName}｜${target.rawText}`),
        "請回覆編號。",
      ].join("\n"))];
    }
    if (type === "move") return [buildTextMessage("請直接輸入要移到哪一場，例如：剛剛全部是東勢場。")];
    return [buildTextMessage(MENU_CORRECTION_TEXT, buildCorrectionQuickReplies())];
  }
  if (action === "correction_target") {
    const kind = params.get("type");
    const itemId = params.get("item");
    if ((kind !== "quantity" && kind !== "cancel") || !itemId) return [buildTextMessage("⚠️ 這筆更正候選已失效，請重新輸入完整更正。")];
    const targets = await listQuickCorrectionTargets(env, groupId, userId, organizationId, kind);
    const target = targets.find((candidate) => candidate.itemId === itemId);
    if (!target) return [buildTextMessage("⚠️ 這筆更正候選已失效，請重新輸入完整更正。")];
    if (kind === "quantity") return [buildTextMessage(`目前選取：${target.farmName}｜${target.rawText}\n請選擇要改成幾隻：`, buildCorrectionQuantityReplies(itemId))];
    const result = await applyQuickCorrectionTarget(env, groupId, userId, organizationId, itemId, "cancel", eventId);
    return [buildTextMessage(result.reply ?? `${target.farmName}｜${target.rawText}：已取消`)];
  }
  if (action === "correction_quantity") {
    const itemId = params.get("item");
    const count = Number(params.get("count"));
    if (!itemId || ![1, 2, 3, 5, 10].includes(count)) return [buildTextMessage("⚠️ 這個更正數量無法辨識。")];
    const result = await applyQuickCorrectionTarget(env, groupId, userId, organizationId, itemId, "quantity", eventId, count);
    return [buildTextMessage(result.reply ?? "⚠️ 更正未完成，原始紀錄保持不變。")];
  }
  return [buildTextMessage("⚠️ 這個更正操作目前無法辨識。")];
}

function lineAdminDeniedReply(accountName: string): LineTextMessage {
  return buildTextMessage(`${botName(accountName)}\n這個功能只有管理者可以使用。`);
}

async function hasLineAdminSession(env: Env, event: LineEvent, groupId: string): Promise<boolean> {
  const userId = event.source?.userId;
  return Boolean(userId && await activeAdminSession(env, groupId, userId));
}

function taipeiLineTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value.slice(0, 16).replace("T", " ");
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function lineReliabilityStateLabel(status: string, acknowledged: string | null, resolutionStatus: string | null = null): string {
  if (status === "retained") {
    if (["manually_resolved", "manually_recorded", "force_closed"].includes(resolutionStatus ?? "")) return "已結案";
    return resolutionStatus === "acknowledged" || acknowledged ? "已查看，尚待決定" : "已保留待處理";
  }
  if (status === "received") return "已收到，等待處理";
  if (status === "queued") return "等待處理";
  if (status === "processing") return "正在處理";
  if (status === "reply_pending") return "資料完成，正在回覆";
  if (status === "retry_waiting") return "正在自動再試";
  return "需要查看";
}

async function lineUnfinishedMessagesReply(env: Env, groupId: string, accountName: string): Promise<LineReplyMessage[]> {
  const rows = await env.DB.prepare(
    `SELECT substr(event_id, -8) AS eventIdShort,
            lifecycle_status AS lifecycleStatus,
            received_at AS receivedAt,
            retained_acknowledged_at AS retainedAcknowledgedAt,
            COALESCE(resolution_status, 'unresolved') AS resolutionStatus,
            last_error_stage AS lastErrorStage
       FROM line_events
      WHERE group_id = ? AND lifecycle_status <> 'reply_completed'
        AND (lifecycle_status <> 'retained' OR COALESCE(resolution_status, 'unresolved') NOT IN ('manually_resolved', 'manually_recorded', 'force_closed'))
      ORDER BY received_at DESC, event_id DESC
      LIMIT 20`,
  ).bind(groupId).all<{ eventIdShort: string; lifecycleStatus: string; receivedAt: string; retainedAcknowledgedAt: string | null; resolutionStatus: string; lastErrorStage: string | null }>();
  if (!rows.results.length) {
    return [buildTextMessage(`${botName(accountName)}\n目前沒有尚未完成的訊息。\n\n這裡只查看，不會刪除或重新處理資料。`)];
  }
  const stageLabel: Record<string, string> = { enqueue: "接收後安排", processing: "資料處理", reply: "LINE 回覆" };
  const lines = [
    `${botName(accountName)}\n尚未完成的訊息：${rows.results.length} 筆`,
    "以下只顯示短編號與處理狀態，不顯示訊息內容。",
    ...rows.results.map((row, index) => [
      `${index + 1}. ${row.eventIdShort}｜${taipeiLineTime(row.receivedAt)}`,
      `狀態：${lineReliabilityStateLabel(row.lifecycleStatus, row.retainedAcknowledgedAt, row.resolutionStatus)}${row.lastErrorStage ? `｜最近問題：${stageLabel[row.lastErrorStage] ?? "處理"}` : ""}`,
    ].join("\n")),
    "",
    "這裡只查看，不會刪除或重新處理資料。",
  ];
  return [buildTextMessage(lines.join("\n"))];
}

async function linePendingCandidatesReply(
  env: Env,
  groupId: string,
  organizationId: string,
): Promise<LineReplyMessage[]> {
  const entries = await loadAmbientCandidateInbox(env, groupId, organizationId, new Date().toISOString());
  return entries.length
    ? renderAmbientCandidateInbox(env, organizationId, entries)
    : [buildTextMessage("目前沒有待確認資料。")];
}

function lineTechnicalInfoReply(env: Env, accountName: string): LineReplyMessage[] {
  return [buildTextMessage([
    `${botName(accountName)}\n技術資訊`,
    `服務：chicken-line-production`,
    `對話模式：${env.CONVERSATION_V2_MODE ?? "未設定"}`,
    `對話模型：${env.CONVERSATION_MODEL ?? PRODUCTION_AI_MODEL}`,
    `背景整理模型：${SEMANTIC_AI_MODEL}`,
    "排程：每天 06:00、09:00、12:00、15:00、18:00 整理；每天 21:00 營運總覽；每 2 分鐘自動恢復",
    "訊息處理：每批最多 10 筆，最多自動再試 3 次",
    "本頁不顯示密碼、權杖、完整使用者編號或原始訊息。",
  ].join("\n"))];
}

function lineReceiveSettingsReply(accountName: string): LineReplyMessage[] {
  return [buildTextMessage([
    `${botName(accountName)}\nLINE 接收設定`,
    "⚠️ 這項設定需要到 LINE Developers 網頁確認。",
    "目前程式沒有可驗證的人工設定結果。",
    "這裡不會自行猜測或修改外部設定。",
  ].join("\n"))];
}

async function handleMenuAction(
  env: Env,
  event: LineEvent,
  eventId: string,
  accountName: string,
  groupId: string,
  state: GroupState,
  action: string,
  params: URLSearchParams,
  trace?: RuntimeTrace,
): Promise<LineReplyMessage[]> {
  if (!state.organizationId) return [buildTextMessage(unboundReply(accountName))];
  if (action === "menu_home") return [buildMainMenuFlex()];
  if (action === "menu_quick_record") return [buildTextMessage(MENU_QUICK_RECORD_TEXT, buildQuickRecordCategoryReplies())];
  if (action === "menu_today_summary") return [buildTextMessage(await menuTodaySummaryReply(env, state.organizationId, accountName, trace), buildTodaySummaryFollowupReplies())];
  if (action === "menu_today_mortality") return [buildTextMessage(await todayMortalityReply(env, groupId, state.organizationId, undefined, accountName), buildTodaySummaryFollowupReplies())];
  if (action === "menu_recent_abnormal") return [buildTextMessage(await menuRecentAbnormalReply(env, state.organizationId, accountName), buildRecentAbnormalFollowupReplies())];
  if (action === "menu_recent_abnormal_range") {
    const days = Number(params.get("days"));
    if (![1, 7, 30].includes(days)) return [buildTextMessage("⚠️ 這個日期範圍無法辨識。")];
    return [buildTextMessage(await menuRecentAbnormalReply(env, state.organizationId, accountName, days), buildRecentAbnormalFollowupReplies())];
  }
  if (action === "menu_correction_help") return [buildTextMessage(MENU_CORRECTION_TEXT, buildCorrectionQuickReplies())];
  if (action === "menu_weather") return [buildTextMessage(await menuWeatherReply(env, accountName), buildWeatherFollowupReplies())];
  if (action === "menu_more") return [buildMoreMenuFlex()];
  if (action === "menu_pending_candidates") return linePendingCandidatesReply(env, groupId, state.organizationId);
  if (action === "menu_help") return [buildTextMessage(MENU_HELP_TEXT)];
  if (action === "menu_management") {
    if (!(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    return [buildManagementMenuFlex()];
  }
  if (action === "menu_web") {
    if (!(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    return [
      buildTextMessage("管理網頁\n請點下面按鈕開啟管理網頁。"),
      buildManagementWebLinkFlex(),
    ];
  }
  if (action === "menu_developer") {
    if (!(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    return [buildDeveloperMenuFlex()];
  }
  if (action === "menu_system_status") {
    if (!(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    const status = await getReliabilityStatus(env, state.organizationId);
    return [buildTextMessage(formatReliabilityStatusForLine(status), buildReliabilityStatusReplies(status))];
  }
  if (action === "menu_message_diagnostics") {
    if (!(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    return [buildMessageDiagnosticsMenuFlex()];
  }
  if (action === "menu_pending_diagnostics") {
    if (!(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    return [buildPendingDiagnosticsMenuFlex()];
  }
  if (action === "menu_pending_ambient_preview") {
    if (!(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    return runAmbientPreview(env, groupId, state.organizationId, new Date(event.timestamp ?? Date.now()));
  }
  if (action === "menu_unfinished_messages") {
    if (!(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    return lineUnfinishedMessagesReply(env, groupId, accountName);
  }
  if (action === "menu_test_tools") {
    if (!(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    return [buildTestToolsMenuFlex()];
  }
  if (action === "menu_settings") {
    if (!(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    return [buildSettingsMenuFlex()];
  }
  if (action === "menu_line_receive_settings") {
    if (!(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    return lineReceiveSettingsReply(accountName);
  }
  if (action === "menu_technical_info") {
    if (!(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    return lineTechnicalInfoReply(env, accountName);
  }
  if (action === "menu_finance") {
    if (!(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    return [buildTextMessage(await portfolioProfitReply(env, state.organizationId, accountName))];
  }
  if (action === "menu_audit") return [buildTextMessage(await menuAuditReply(env, state.organizationId, accountName))];
  if (action === "reliability_acknowledge") {
    const userId = event.source?.userId;
    if (!userId || !(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    const acknowledged = await acknowledgeRetainedLineEvents(env, userId, new Date(), state.organizationId, groupId, "line_admin");
    await writeAuditLog(env, {
      organizationId: state.organizationId,
      source: "line",
      actorType: "line_admin",
      actorId: userId,
      action: "acknowledge",
      entityType: "line_event_recovery",
      entityId: groupId,
      after: { acknowledged },
      reason: "line_admin_reviewed_retained_messages",
      requestId: eventId,
    });
    const status = await getReliabilityStatus(env, state.organizationId);
    return [buildTextMessage(
      acknowledged > 0 ? `✅ 已標記 ${acknowledged} 筆舊問題為已查看；不會刪除紀錄。` : "目前沒有新的待查看問題。",
      buildReliabilityStatusReplies(status),
    )];
  }
  if (action === "reliability_recover") {
    if (!(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    const status = await getReliabilityStatus(env, state.organizationId);
    if (status.actionableUnfinishedCount <= 0) {
      return [buildTextMessage("目前沒有可以安全重新處理的訊息；已過期內容不能重新處理。")];
    }
    return [buildTextMessage(
      "只會重新處理目前仍可恢復的訊息，不會重做已完成的紀錄。要繼續嗎？",
      buildReliabilityRecoveryConfirmationReplies(),
    )];
  }
  if (action === "reliability_recover_confirm") {
    const userId = event.source?.userId;
    if (!userId || !(await hasLineAdminSession(env, event, groupId))) return [lineAdminDeniedReply(accountName)];
    if (params.get("decision") !== "confirm") return [buildTextMessage("已返回，沒有重新處理任何訊息。")];
    const result = await manuallyRecoverLineEvents(env, userId, new Date(), 20, "line_admin");
    await writeAuditLog(env, {
      organizationId: state.organizationId,
      source: "line",
      actorType: "line_admin",
      actorId: userId,
      action: "manual_recovery",
      entityType: "line_event_recovery",
      entityId: result.eventIds.join(",").slice(0, 200) || "none",
      after: { scanned: result.scanned, requeued: result.requeued, failed: result.failed },
      reason: "line_manual_recovery",
      requestId: eventId,
    });
    return [buildTextMessage(
      result.requeued > 0 ? `✅ 已重新安排 ${result.requeued} 筆訊息處理；不會重做已完成的紀錄。` : "目前沒有可以重新處理的訊息。",
      buildReliabilityStatusReplies(await getReliabilityStatus(env, state.organizationId)),
    )];
  }
  if (action === "menu_farms") {
    const farms = await menuFarmList(env, state.organizationId);
    if (!farms.length) return [buildTextMessage(`${botName(accountName)}\n目前沒有可查詢的啟用雞場。`)];
    const lines = [`${botName(accountName)} 🐔 場次／批次`, "請選擇要查看的雞場：", ...farms.map((farm, index) => `${index + 1}. ${farmLabelForMenu(farm)}`)];
    const quickReply = buildFarmQuickReply(farms, "menu_farm_summary");
    return [buildTextMessage(lines.join("\n"), quickReply ?? undefined)];
  }
  if (action === "menu_farm_summary") {
    const farmId = params.get("farm");
    if (!farmId) return [buildTextMessage(`${botName(accountName)}\n⚠️ 找不到這個雞場。`)];
    const farm = await env.DB.prepare("SELECT id, name, environment FROM farms WHERE id = ? AND organization_id = ? AND active = 1 LIMIT 1").bind(farmId, state.organizationId).first<FarmRow>();
    if (!farm) return [buildTextMessage(`${botName(accountName)}\n⚠️ 找不到可查詢的雞場。`)];
    const houses = await activeHousesForFarm(env, farm.id);
    const houseReply = buildHouseQuickReply(farm, houses as MenuHouse[]);
    const flocks = await activeFlocks(env, state.organizationId, undefined, farm.id);
    const flockReply = buildFlockQuickReply(farm, flocks.map((flock) => ({ id: flock.id, batchCode: flock.batchCode, houseName: flock.houseName })) as MenuFlock[]);
    const followup = buildFarmSummaryFollowupReplies();
    const combined = [...(houseReply?.items ?? []), ...(flockReply?.items ?? []), ...followup.items];
    const quickReply = combined.length <= 13 ? { items: combined } : undefined;
    return [buildTextMessage(await menuFarmSummaryReply(env, state.organizationId, farmId, accountName), quickReply)];
  }
  if (action === "menu_house_summary") {
    const farmId = params.get("farm");
    const houseId = params.get("house");
    if (!farmId || !houseId) return [buildTextMessage(`${botName(accountName)}\n⚠️ 找不到這個雞舍。`)];
    return [buildTextMessage(await menuFarmSummaryReply(env, state.organizationId, farmId, accountName, houseId), buildFarmSummaryFollowupReplies())];
  }
  if (action === "menu_flock_summary") {
    const farmId = params.get("farm");
    const flockId = params.get("flock");
    if (!farmId || !flockId) return [buildTextMessage(`${botName(accountName)}\n⚠️ 找不到這個批次。`)];
    return [buildTextMessage(await menuFlockSummaryReply(env, state.organizationId, farmId, flockId, accountName), buildBatchSummaryFollowupReplies())];
  }
  if (action === "menu_current_farm_summary") {
    const userId = event.source?.userId;
    const context = userId
      ? await env.DB.prepare(
        `SELECT farm_id AS farmId FROM line_operational_contexts
          WHERE line_group_id = ? AND line_user_id = ? LIMIT 1`,
      ).bind(groupId, userId).first<{ farmId: string }>()
      : null;
    const farmId = context?.farmId ?? state.farmId;
    if (!farmId) return handleMenuAction(env, event, eventId, accountName, groupId, state, "menu_farms", params, trace);
    return handleMenuAction(env, event, eventId, accountName, groupId, state, "menu_farm_summary", new URLSearchParams({ farm: farmId }), trace);
  }
  if (action === "menu_ai") return [buildTextMessage("✨ AI 營運分析\n\n請選擇想分析的方向；選單本身不會立即呼叫 AI。", buildAiQuickReply())];
  if (action === "ai_custom") return [buildTextMessage("請直接輸入想分析的問題。\n例如：為什麼最近死亡增加？")];
  if (action === "ai_preset") {
    const preset = params.get("preset");
    if (!preset || !AI_PRESETS.has(preset)) return [buildTextMessage(`${botName(accountName)}\n⚠️ 這個分析選項無法辨識。`)];
    const questions: Record<string, string> = {
      recent_attention: "最近哪一場需要注意？",
      recent_abnormal: "最近有哪些異常？",
      compare_farms: "比較各場營運狀況。",
      batch_performance: "為什麼這一批表現較差？",
    };
    try {
      const scope = await lineAnalysisScope(env, groupId, event.source?.userId, state);
      const result = await runReadOnlyAnalysis(env, state.organizationId, scope, questions[preset]);
      return [buildTextMessage(analysisLineReply(accountName, result.report), buildAiFollowupReplies())];
    } catch {
      return [buildTextMessage(`${botName(accountName)}\n⚠️ 目前無法完成唯讀營運分析；資料沒有被修改。`)];
    }
  }
  return [buildTextMessage(`${botName(accountName)}\n⚠️ 這個操作目前尚未提供。`)];
}

async function runAmbientPreview(
  env: Env,
  groupId: string,
  organizationId: string,
  cutoffAt: Date,
  page = 0,
): Promise<LineReplyMessage[]> {
  const startedAt = Date.now();
  const result = await previewBufferedAmbientMessages(env, organizationId, groupId, cutoffAt, page, 10);
  console.log(JSON.stringify({
    event: "ambient_pending_preview",
    group_id_suffix: groupId.length <= 12 ? groupId : `${groupId.slice(0, 4)}…${groupId.slice(-4)}`,
    buffered_count: result.total,
    candidate_like_count: result.candidateLikeCount,
    excluded_count: result.excludedCount,
    open_candidate_count: result.openCandidateCount,
    expired_diagnostic_count: result.expiredDiagnosticCount,
    duration_ms: Date.now() - startedAt,
  }));
  return [buildTextMessage(formatAmbientPreview(result), buildAmbientPreviewReplies(result.page, result.totalPages))];
}

async function runManualAmbientDigest(
  env: Env,
  event: LineEvent,
  accountName: string,
  groupId: string,
  organizationId: string,
): Promise<LineReplyMessage[]> {
  const cutoffAt = new Date(event.timestamp ?? Date.now());
  const inboxNow = cutoffAt.toISOString();
  const loadInbox = () => loadAmbientCandidateInbox(env, groupId, organizationId, inboxNow);
  let result: Awaited<ReturnType<typeof runAmbientDigest>>;
  try {
    result = await runAmbientDigest(env, {
      trigger: "manual",
      now: cutoffAt,
      cutoffAt,
      targetGroupId: groupId,
      targetOrganizationId: organizationId,
      extract: (ambientEnv, messages) => extractAmbientCandidates(ambientEnv, messages, SEMANTIC_AI_MODEL),
    });
  } catch (error) {
    console.log(JSON.stringify({
      event: "ambient_digest_manual_error",
      trigger: "manual",
      group_id_suffix: groupId.length <= 12 ? groupId : `${groupId.slice(0, 4)}…${groupId.slice(-4)}`,
      error_stage: "run",
      error_class: error instanceof Error && error.name ? error.name : "unknown",
    }));
    const existing = await loadInbox();
    return [
      buildTextMessage("⚠️ 新訊息摘要暫時無法完成，原訊息仍保留，稍後可再次摘要。"),
      ...(existing.length ? await renderAmbientCandidateInbox(env, organizationId, existing) : []),
    ];
  }
  const outcome = result.outcomes.find((entry) => entry.groupId === groupId);
  const openCandidates = await loadInbox();
  const newCandidateIds = new Set(
    result.outcomes
      .filter((entry) => entry.groupId === groupId && entry.status === "candidate" && entry.candidateId)
      .map((entry) => entry.candidateId as string),
  );
  if (openCandidates.length) {
    const inbox = await renderAmbientCandidateInbox(env, organizationId, openCandidates, newCandidateIds);
    if (outcome?.status === "failed") return [buildTextMessage("⚠️ 新訊息摘要暫時無法完成，原訊息仍保留，稍後可再次摘要。"), ...inbox];
    if (outcome?.status === "busy") return [buildTextMessage("正在整理最新訊息；目前仍有待確認資訊："), ...inbox];
    return inbox;
  }
  if (!outcome || outcome.status === "no_pending") {
    return [buildTextMessage("目前沒有新的待摘要或待確認資訊。")];
  }
  if (outcome.status === "busy") {
    return [buildTextMessage("正在整理最新訊息，完成後即可查看。")];
  }
  if (outcome.status === "failed") {
    return [buildTextMessage("⚠️ 摘要暫時無法完成，原訊息仍保留，稍後可再次摘要。")];
  }
  if (outcome.status === "already_recorded") {
    return [buildTextMessage("目前沒有新的未紀錄營運資訊；已比對到相近的正式紀錄，沒有重複新增。")];
  }
  if (outcome.status === "no_candidate") {
    return [buildTextMessage("目前沒有發現需要確認的營運紀錄。")];
  }
  return [buildTextMessage("目前沒有新的待摘要或待確認資訊。")];
}

async function handleReliabilityRedisplay(
  env: Env,
  event: LineEvent,
  noticeId: string,
  groupId: string,
): Promise<LineReplyMessage[]> {
  const row = await env.DB.prepare(
    `SELECT event_id AS eventId, reply_payload_json AS replyPayloadJson,
            redisplay_expires_at AS redisplayExpiresAt
       FROM line_events
      WHERE group_id = ? AND reply_notice_id = ? AND reply_payload_json IS NOT NULL
        AND reply_status IN ('uncertain', 'failed')
      ORDER BY reply_uncertain_at DESC, event_id DESC LIMIT 1`,
  ).bind(groupId, noticeId).first<{ eventId: string; replyPayloadJson: string; redisplayExpiresAt: string | null }>();
  if (!row) return [buildTextMessage("這則回覆已經無法重新顯示，請重新提出問題。")];
  if (row.redisplayExpiresAt && Date.parse(row.redisplayExpiresAt) <= Date.now()) {
    return [buildTextMessage("這則回覆已超過保存時間，請重新提出問題。")];
  }
  let saved: LineReplyMessage[];
  try {
    const parsed = JSON.parse(row.replyPayloadJson) as unknown;
    if (!Array.isArray(parsed)) throw new Error("invalid_saved_reply");
    saved = parsed as LineReplyMessage[];
  } catch {
    return [buildTextMessage("目前找不到剛才的回覆內容，請重新提出問題。")];
  }
  const retryKey = await prepareRedisplayRetryKey(env, row.eventId);
  const claim = await claimReplyDelivery(env, row.eventId, "redisplay", new Date(), retryKey);
  if (!claim) return [buildTextMessage("這則回覆正在重新處理，請稍候再試。")];
  const receipt = await getLineEventReceipt(env.DB, row.eventId);
  const attemptId = await startDeliveryAttempt(
    env,
    row.eventId,
    receipt?.correlationId ?? row.eventId,
    "redisplay",
    "redisplay",
    claim.attempt,
    claim.owner,
  );
  try {
    const result = await pushLine(groupId, saved, env, claim.retryKey ?? retryKey);
    await finishDeliveryAttempt(env, attemptId, "sent", result.status, result.requestId);
  } catch (error) {
    const accepted = error instanceof LineApiError && error.accepted;
    const status = error instanceof LineApiError ? error.status : null;
    const requestId = error instanceof LineApiError ? error.requestId : null;
    await finishDeliveryAttempt(
      env,
      attemptId,
      accepted ? "accepted" : error instanceof LineApiError && error.ambiguous ? "uncertain" : "definite_not_sent",
      status,
      requestId,
      error instanceof LineApiError ? error.name : "redisplay_error",
    ).catch(() => undefined);
    if (!accepted) {
      if (error instanceof LineApiError && error.ambiguous) {
        await markReplyUncertain(env, row.eventId, error, new Date(), claim.owner, status, requestId);
      } else {
        await markReplyDefiniteNotSent(env, row.eventId, error, new Date(), claim.owner, status, requestId);
      }
      return [buildTextMessage("目前重新顯示失敗，系統會保留這筆內容，請稍後再試。")];
    }
  }
  await markRedisplayCompleted(env, row.eventId);
  return [buildTextMessage("✅ 已重新顯示剛才的回覆。")];
}

async function handleLinePostback(
  env: Env,
  event: LineEvent,
  eventId: string,
  accountName: string,
): Promise<LineReplyMessage[]> {
  const parsed = parseLinePostback(event.postback?.data ?? "");
  if (!parsed) return [buildTextMessage(`${botName(accountName)}\n⚠️ 這個操作無法辨識，請重新輸入「選單」。`)];
  const groupId = sourceGroupId(event);
  if (!groupId) return [buildTextMessage(`${botName(accountName)}\n目前互動選單以 LINE 群組為主。`)];
  await ensureGroup(env, groupId);
  const state = await groupState(env, groupId);
  const action = parsed.action;

  if (action === "reliability_redisplay") {
    return handleReliabilityRedisplay(env, event, parsed.params.get("notice") ?? "", groupId);
  }

  if (action === "ambient_preview_page" || action === "ambient_preview_digest") {
    if (!state.organizationId) return [buildTextMessage(unboundReply(accountName))];
    if (action === "ambient_preview_digest") {
      return runManualAmbientDigest(env, event, accountName, groupId, state.organizationId);
    }
    const page = Number(parsed.params.get("page") ?? "0");
    return runAmbientPreview(env, groupId, state.organizationId, new Date(event.timestamp ?? Date.now()), Number.isFinite(page) ? page : 0);
  }

  if (action.startsWith("ambient_")) {
    if (!state.organizationId) return [buildTextMessage(unboundReply(accountName))];
    return handleAmbientPostback(env, event, eventId, accountName, action, parsed.params, state.organizationId, groupId);
  }

  if (action === "daily_review_correction" || action === "daily_review_candidates" || action === "daily_review_detail") {
    if (!state.organizationId || !event.source?.userId) return [buildTextMessage("這份日結目前無法驗證操作權限。")];
    const now = new Date(event.timestamp ?? Date.now());
    if (action === "daily_review_correction") {
      const activated = await activateDailyReviewContext(
        env,
        state.organizationId,
        groupId,
        event.source.userId,
        parsed.params.get("review") ?? "",
        now,
      );
      return [buildTextMessage(activated
        ? "請直接說明要更正的內容，例如：二林場死亡不是5，是3。若有多筆相似紀錄，我會先請你選擇目標。"
        : "這份日結更正視窗已失效，請等待下一份日結或先查詢今日營運。")];
    }
    const entries = await loadAmbientCandidateInbox(env, groupId, state.organizationId, now.toISOString());
    if (action === "daily_review_candidates") {
      return entries.length
        ? renderAmbientCandidateInbox(env, state.organizationId, entries)
        : [buildTextMessage("目前沒有待確認資訊。")];
    }
    const latest = await env.DB.prepare(
      `SELECT payload_json AS payloadJson FROM daily_operations_reviews
        WHERE organization_id = ? AND line_group_id = ? AND delivery_status = 'sent'
        ORDER BY local_date DESC LIMIT 1`,
    ).bind(state.organizationId, groupId).first<{ payloadJson: string }>();
    if (!latest) return [buildTextMessage("目前找不到可查看的日結內容。")];
    try {
      return [buildTextMessage(formatDailyReview(JSON.parse(latest.payloadJson) as Parameters<typeof formatDailyReview>[0]))];
    } catch {
      return [buildTextMessage("目前找不到可查看的日結內容。")];
    }
  }

  if (action === "pending_select_farm") {
    if (!state.organizationId || !event.source?.userId) return [buildTextMessage(`${botName(accountName)}\n⚠️ 這組紀錄目前無法驗證操作權限。`)];
    const farmId = parsed.params.get("farm");
    if (!farmId) return [buildTextMessage("這組紀錄已完成或已逾時，請重新輸入紀錄。")];
    const result = await handlePendingFarmPostback(env, event, eventId, groupId, state.organizationId, farmId);
    return quickRecordReplyMessages(result, accountName);
  }

  if (action === "pending_select_house") {
    if (!state.organizationId || !event.source?.userId) return [buildTextMessage(`${botName(accountName)}\n⚠️ 這組紀錄目前無法驗證操作權限。`)];
    const farmId = parsed.params.get("farm");
    const houseId = parsed.params.get("house");
    if (!farmId || !houseId) return [buildTextMessage("這個雞舍選項已失效，請重新輸入紀錄。")];
    const result = await handlePendingHousePostback(env, event, eventId, groupId, state.organizationId, farmId, houseId);
    return quickRecordReplyMessages(result, accountName);
  }

  if (action === "quick_record_next") {
    return [buildTextMessage("請直接輸入下一筆紀錄；也可以按「快速紀錄」重新選擇類別。")];
  }

  if (["quick_record_category", "quick_record_count", "quick_record_abnormal", "quick_record_custom"].includes(action)) {
    if (!state.organizationId) return [buildTextMessage(unboundReply(accountName))];
    return handleQuickRecordPostback(env, event, eventId, groupId, state.organizationId, accountName, action, parsed.params);
  }

  if (action === "correction_confirm") {
    const decision = parsed.params.get("decision");
    if (decision === "cancel") return [buildTextMessage("✅ 已返回，原始紀錄沒有變更。")];
    if (decision === "confirm" && state.organizationId && event.source?.userId) {
      const correction = await handleQuickCorrectionInput(env, event, "剛剛全部取消", eventId, groupId, state.organizationId);
      return [buildTextMessage(correction.reply ?? "目前沒有可取消的上一組紀錄。")];
    }
    return [buildTextMessage("⚠️ 無法驗證這個更正操作。")];
  }

  if (action === "correction_action") {
    if (!state.organizationId) return [buildTextMessage(unboundReply(accountName))];
    return handleCorrectionPostback(env, event, eventId, groupId, state.organizationId, accountName, action, parsed.params);
  }

  if (action === "correction_target" || action === "correction_quantity") {
    if (!state.organizationId) return [buildTextMessage(unboundReply(accountName))];
    return handleCorrectionPostback(env, event, eventId, groupId, state.organizationId, accountName, action, parsed.params);
  }

  if (action === "ai_followup") {
    return [buildTextMessage("請直接輸入想繼續分析的問題；目前 AI 只讀取資料，不會修改紀錄。")];
  }

  return handleMenuAction(env, event, eventId, accountName, groupId, state, action, parsed.params);
}

function farmLabelForMenu(farm: MenuFarm): string {
  return `${farm.environment === "test" ? "🧪 " : "🐔 "}${farm.name}`;
}

async function handleCommand(
  env: Env,
  event: LineEvent,
  command: ParsedCommand,
  accountName: string,
  eventId: string,
  trace?: RuntimeTrace,
): Promise<string | LineReplyMessage[]> {
  if (command.kind === "ping") {
    return `${botName(accountName)}\n✅ Bot 正常運作中。`;
  }
  // Menu is a presentation-only control command. It intentionally returns
  // before pending/correction/quick-record routing so opening the menu never
  // clears or supersedes a user's active bundle.
  if (command.kind === "menu") {
    return [buildMainMenuFlex()];
  }

  const groupId = sourceGroupId(event);
  if (!groupId) {
    if (command.kind === "help") return helpReply(accountName);
    if (command.kind === "create_test_farm_usage") return testFarmCreateUsageReply(accountName);
    if (command.kind === "archive_test_farm_usage") return testFarmArchiveUsageReply(accountName);
    if (command.kind === "create_farm_usage") return farmAdminCreateUsageReply(accountName);
    if (command.kind === "archive_farm_usage") return farmAdminArchiveUsageReply(accountName);
    if (command.kind === "cancel") return `${botName(accountName)}\n目前沒有待確認的操作。`;
    return `${botName(accountName)}\n目前正式流程以私人群組為主，請將我邀請加入雞場群組。`;
  }

  await ensureGroup(env, groupId);
  const state = await groupState(env, groupId);

  // Navigation is a deterministic control-plane concern.  Resolve it after
  // the group/auth context is available, but before pending workflows or the
  // Conversation V2 planner.  An open candidate is context only and must not
  // turn `返回`/`更多功能` into a repair or explanation request.
  const navigationAction = navigationActionForText(event.message?.text ?? "");
  if (navigationAction) {
    return handleMenuAction(
      env,
      event,
      eventId,
      accountName,
      groupId,
      state,
      navigationAction,
      new URLSearchParams(),
      trace,
    );
  }

  if (command.kind === "cancel" && state.organizationId && event.source?.userId) {
    const entries = await loadAmbientCandidateInbox(
      env,
      groupId,
      state.organizationId,
      new Date(event.timestamp ?? Date.now()).toISOString(),
    );
    if (entries.length === 1) {
      return cancelAmbientCandidate(env, entries[0], event.source.userId, event.message?.text);
    }
    if (entries.length > 1) return renderAmbientCandidateSelection(entries);
  }
  if (command.kind === "system_status") {
    const lineUserId = event.source?.userId;
    const admin = lineUserId ? await activeAdminSession(env, groupId, lineUserId) : null;
    if (!admin) return `${botName(accountName)}\n這個功能只有管理者可以使用。`;
    return formatReliabilityStatusForLine(await getReliabilityStatus(env, state.organizationId));
  }
  if (command.kind === "pending_ambient_preview") {
    const lineUserId = event.source?.userId;
    if (!lineUserId || !(await activeAdminSession(env, groupId, lineUserId))) return `${botName(accountName)}\n這個功能只有管理者可以使用。`;
    if (!state.organizationId) return [buildTextMessage(unboundReply(accountName))];
    return runAmbientPreview(env, groupId, state.organizationId, new Date(event.timestamp ?? Date.now()));
  }
  if (command.kind === "ambient_digest_now") {
    if (!state.organizationId) return [buildTextMessage(unboundReply(accountName))];
    return runManualAmbientDigest(env, event, accountName, groupId, state.organizationId);
  }
  const exactMenuAction = menuActionForCommand(command);
  if (exactMenuAction) {
    // Exact Message Action text and manual text deliberately share this
    // handler. It runs before pending/correction/quick-record routing, so a
    // menu query never cancels or consumes an active quick-record bundle.
    return handleMenuAction(
      env,
      event,
      eventId,
      accountName,
      groupId,
      state,
      exactMenuAction,
      new URLSearchParams(),
      trace,
    );
  }
  const messageText = event.message?.text ?? (command.kind === "unknown" ? command.text : "");
  const lineUserId = event.source?.userId;
  const commandClass = classifyInput(messageText);
  const pendingResponse = commandClass === "UNKNOWN" || commandClass === "PENDING_RESPONSE";
  // A password prompt is a security boundary: do not send an unknown
  // password candidate to Workers AI. Known control or complete commands
  // continue through the normal supersede/cancel path below.
  const pendingAdminPassword = lineUserId && state.organizationId
    ? (await latestFarmAdminAction(env, groupId, lineUserId, ["waiting_password"]))
      ?? (await latestOperationalAdminAction(env, groupId, lineUserId, ["waiting_password"]))
    : null;
  if (state.organizationId && lineUserId) {
    const reviewNow = new Date(event.timestamp ?? Date.now());
    let reviewContext = await loadActiveDailyReviewContext(
      env,
      groupId,
      lineUserId,
      reviewNow.toISOString(),
    );
    // Daily Review is a group-level readout. A member should be able to
    // answer it in natural language without first tapping a helper button;
    // materialize the short-lived per-user context lazily on the first
    // correction-like message. Ordinary group chat remains quiet because
    // this branch is reached only after the Interaction Gate has woken the
    // event or an existing active state has admitted it.
    if (!reviewContext && correctionLooksRelevant(messageText)) {
      const activated = await activateDailyReviewContext(
        env,
        state.organizationId,
        groupId,
        lineUserId,
        "",
        reviewNow,
      );
      if (activated) {
        reviewContext = await loadActiveDailyReviewContext(env, groupId, lineUserId, reviewNow.toISOString());
      }
    }
    if (reviewContext && correctionLooksRelevant(messageText)) {
      const correction = await handleGroupCorrectionInput(env, event, messageText, eventId, groupId, state.organizationId);
      if (correction.handled) {
        await clearDailyReviewContext(env, groupId, lineUserId);
        return correction.reply ? [buildTextMessage(correction.reply)] : [buildTextMessage("✅ 已完成日結更正。")];
      }
      return [buildTextMessage("請補充要更正的雞場或紀錄；如果今天有多筆相似資料，我會先請你選擇目標。")];
    }
    const explicitSelfMention = hasSelfMention(event.message?.mention?.mentionees);
    // A true self-mention is a conversation request unless the parser has
    // already identified an exact control/admin command.  Query and record
    // shapes are deliberately allowed through V2: parseCommand() is a useful
    // deterministic fallback, but it must not preempt the Conversation V2
    // planner for explicit natural language.
    const explicitConversation = explicitSelfMention
      && commandClass !== "CONTROL"
      && commandClass !== "ADMIN";
    if (explicitConversation) {
      // Explicit @Bot natural language is routed through the context-first
      // V2 orchestrator before the legacy repair/explain fallback. Ordinary
      // group chat never reaches this branch because the Interaction Gate
      // keeps it in Ambient mode. Narrow active Quick/Pending state is still
      // guarded inside the orchestrator and falls back to its scoped handler.
      const conversationV2Reply = await handleConversationOrchestratorV2Input(
        env,
        event,
        groupId,
        state.organizationId,
        accountName,
        messageText,
        trace,
      );
      if (conversationV2Reply) return conversationV2Reply;
      if (trace && !trace.conversation_v2_fallback_origin) {
        trace.conversation_v2_fallback_origin = "legacy_conversation_fallback";
        trace.conversation_v2_fallback_reason = "v2_returned_no_response";
      }

      // V2 may be unavailable for a production-farm rollout or may fail its
      // model/schema attempt. A read-like explicit turn must not fall through
      // to the broad Quick Record or abnormal writers. This is the final
      // goal guard before all legacy candidate/record fallbacks.
      const fallbackNow = new Date(event.timestamp ?? Date.now());
      const fallbackNowIso = fallbackNow.toISOString();
      const fallbackEntries = await loadAmbientCandidateInbox(env, groupId, state.organizationId, fallbackNowIso);
      const fallbackSession = lineUserId
        ? await loadConversationV2Session(env, state.organizationId, groupId, lineUserId, fallbackNowIso)
        : null;
      const fallbackPending = lineUserId ? await hasScopedPendingState(env, groupId, lineUserId, fallbackNowIso) : false;
      const fallbackQuickActive = lineUserId
        ? await quickRecordHasActiveContext(env, groupId, lineUserId, fallbackNowIso)
        : false;
      const fallbackQuickPending = lineUserId
        ? await quickRecordHasPending(env, groupId, lineUserId, fallbackNowIso)
        : false;
      const fallbackEnvironment = await conversationV2FarmEnvironment(
        env,
        state.organizationId,
        fallbackEntries.length === 1
          ? fallbackEntries[0].bundle.candidates.find((candidate) => candidate.items.length > 0) ?? null
          : null,
      );
      const fallbackReferencedCandidate = fallbackEntries.length === 1
        && /(?:這筆|这笔|這個|这个|那筆|那笔|那個|那个|它|這件|这件)/u.test(messageText);
      const fallbackScoped = conversationV2CandidateContext(
        fallbackEntries,
        fallbackSession,
        fallbackEnvironment,
        fallbackPending,
        fallbackReferencedCandidate,
      );
      const fallbackSafetyContext = fallbackScoped.context;
      const fallbackSafety = classifyConversationSpeechAct(messageText, fallbackSafetyContext);
      const readLikeTurn = isReadOnlyConversationGoal(fallbackSafety.recommendedGoal)
        || ["QUERY", "EXPLAIN_REQUEST", "ADVICE_REQUEST", "META_CONVERSATION", "REFERENCE"].includes(fallbackSafety.speechAct);
      const fallbackDeterministic = routeConversationV2Deterministic(messageText, fallbackSafetyContext);
      const candidateActionLike = fallbackSafety.speechAct === "CORRECTION"
        || fallbackSafety.speechAct === "CANCEL"
        || fallbackSafety.speechAct === "CONFIRM"
        || (fallbackDeterministic.goal === "REPAIR" && Boolean(fallbackScoped.current));
      const narrowQuickAction = quickRecordLooksRelevant(messageText)
        || (fallbackQuickActive && (fallbackQuickPending || correctionLooksRelevant(messageText)));
      const provenAssertion = conversationOfficialRecordAllowed(fallbackSafety);
      if (!provenAssertion && !candidateActionLike && !readLikeTurn && !narrowQuickAction) {
        if (trace) trace.conversation_v2_fallback_origin = "conversation_read_only_fallback";
        return conversationReadOnlyFallback(env, event, groupId, state.organizationId, accountName, fallbackSafety);
      }
      if (readLikeTurn && !provenAssertion && !candidateActionLike) {
        if (trace) trace.conversation_v2_fallback_origin = "conversation_read_only_fallback";
        return conversationReadOnlyFallback(env, event, groupId, state.organizationId, accountName, fallbackSafety);
      }
    }
    // A field-specific review prompt is a deterministic fallback for an
    // explicit interaction that V2 did not consume, and remains the owner of
    // existing narrow postback/quantity workflows.
    const ambientCandidateReply = await handleAmbientCandidateTextInput(
      env,
      event,
      eventId,
      groupId,
      state.organizationId,
      accountName,
      messageText,
    );
    if (ambientCandidateReply) return ambientCandidateReply;
    if (command.kind === "unknown") {
      const conversationalReply = await handleConversationalAgentInput(
        env,
        event,
        groupId,
        state.organizationId,
        accountName,
        messageText,
      );
      if (conversationalReply) return conversationalReply;
    }
    const universalCandidateReply = await handleAmbientUniversalCandidateInput(
      env,
      event,
      eventId,
      groupId,
      state.organizationId,
      accountName,
      messageText,
    );
    if (universalCandidateReply) return universalCandidateReply;
  }
  if (pendingAdminPassword && command.kind === "unknown") {
    const adminPasswordReply = await handleFarmAdminPasswordInput(env, event, groupId, accountName);
    if (adminPasswordReply) return adminPasswordReply;
  }

  // Corrections must be classified before a new operational or abnormal
  // record. This keeps `死亡不是5，是3` from becoming a fresh death=3 row.
  if (state.organizationId && lineUserId && correctionLooksRelevant(messageText)) {
    const correction = await handleQuickCorrectionInput(env, event, messageText, eventId, groupId, state.organizationId);
    if (correction.handled) return correction.reply ?? safeRejectionReply(accountName);
  }

  // The quick-record layer owns only messages that contain a bounded,
  // concrete operational/observation phrase. It is deliberately placed
  // before the legacy one-message abnormal and pending handlers so a five-
  // minute bundle can append items without changing those older flows.
  const quickPending = state.organizationId && lineUserId
    ? await quickRecordHasPending(env, groupId, lineUserId, new Date(event.timestamp ?? Date.now()).toISOString())
    : false;
  if (state.organizationId && lineUserId && (quickRecordLooksRelevant(messageText) || quickPending)) {
    const quick = await handleQuickRecordInput(env, event, messageText, eventId, groupId, state.organizationId, accountName);
    if (quick.handled) {
      await cancelScopedPendingActions(env, groupId, lineUserId, "superseded_by_new_command");
      return quickRecordReplyMessages(quick, accountName);
    }
  }

  // Minimal abnormal records are deliberately handled before semantic AI. A
  // known line/user context is enough to write the raw observation; AI
  // classification is queued after the insert and can never block it.
  if (state.organizationId && looksLikeMinimalAbnormalText(messageText)) {
    if (lineUserId) await cancelScopedPendingActions(env, groupId, lineUserId);
    return handleLineAbnormalInput(
      env,
      event,
      messageText,
      eventId,
      groupId,
      state.organizationId,
      { farmId: state.farmId },
      accountName,
    );
  }

  // A candidate/house response belongs to the abnormal pending flow only if
  // there is an active abnormal action. Complete new commands continue below
  // and can supersede it.
  if (state.organizationId && lineUserId && command.kind === "unknown") {
    const abnormalPendingReply = await handleLineAbnormalPendingInput(env, event, messageText, eventId, groupId, accountName);
    if (abnormalPendingReply) return abnormalPendingReply;
  }

  if (state.organizationId && isReadOnlyAnalysisQuestion(messageText)) {
    if (lineUserId) await cancelScopedPendingActions(env, groupId, lineUserId);
    try {
      const scope = await lineAnalysisScope(env, groupId, lineUserId, state);
      const result = await runReadOnlyAnalysis(env, state.organizationId, scope, messageText);
      return [buildTextMessage(analysisLineReply(accountName, result.report), buildAiFollowupReplies())];
    } catch {
      return `${botName(accountName)}\n⚠️ 目前無法完成唯讀營運分析；原始資料與既有查詢不受影響。`;
    }
  }

  const deterministicIntent = command.kind === "unknown" ? null : deterministicToUnified(command);
  const preferAi = Boolean(
    deterministicIntent &&
    state.organizationId &&
    env.AI &&
    shouldPreferAiOverDeterministic(messageText, deterministicIntent),
  );
  const deterministicFallback = preferAi ? deterministicIntent : null;
  let unifiedIntent = preferAi ? null : deterministicIntent;
  let aiResult: SemanticAiResult | null = null;

  if (state.organizationId && (command.kind === "unknown" || preferAi)) {
    aiResult = await parseSemanticWithAi(env, messageText, state.organizationId, trace);
    if (aiResult.intent && aiResult.intent.intent !== "unknown") unifiedIntent = aiResult.intent;
  }

  const aiFailed = Boolean(aiResult?.attempted && !unifiedIntent);
  const semanticCommand = Boolean(unifiedIntent && unifiedIntent.intent !== "unknown");
  const shouldInterruptPending = !pendingResponse || semanticCommand;
  if (lineUserId && shouldInterruptPending) {
    if (command.kind === "cancel") {
      const cancelled = await cancelScopedPendingActions(env, groupId, lineUserId, "user_cancelled");
      return cancelled
        ? `${botName(accountName)}\n✅ 已取消上一筆待確認操作。`
        : `${botName(accountName)}\n目前沒有待確認的操作。`;
    }
    await cancelScopedPendingActions(env, groupId, lineUserId);
  }
  if (command.kind === "help") return helpReply(accountName);
  if (command.kind === "create_test_farm_usage") return testFarmCreateUsageReply(accountName);
  if (command.kind === "archive_test_farm_usage") return testFarmArchiveUsageReply(accountName);
  if (command.kind === "create_farm_usage") return farmAdminCreateUsageReply(accountName);
  if (command.kind === "archive_farm_usage") return farmAdminArchiveUsageReply(accountName);
  if (command.kind === "create_house_usage") return `${botName(accountName)} ⚠️ 請提供雞場與舍別名稱。\n例如：\n新增雞舍 金雞測試場 測試1舍`;
  if (command.kind === "create_flock_usage") return `${botName(accountName)} ⚠️ 請提供批次資料。\n例如：\n新增批次 金雞測試場 測試1舍 TEST-BATCH 入雛 2026-08-20 12000 出雞 2026-11-20`;

  // An AI-recognized semantic message is a new command, not a pending
  // candidate response. Only unknown messages that did not invoke/fail AI may
  // use the existing pending confirmation flow.
  if (!semanticCommand && !aiFailed && pendingResponse && state.organizationId && lineUserId) {
    const adminPasswordReply = await handleFarmAdminPasswordInput(env, event, groupId, accountName);
    if (adminPasswordReply) return adminPasswordReply;
    const farmAdminPendingReply = await handleFarmAdminPendingInput(env, event, messageText, groupId, accountName);
    if (farmAdminPendingReply) return farmAdminPendingReply;
    const testFarmPendingReply = await handleTestFarmPendingInput(
      env,
      event,
      messageText,
      eventId,
      groupId,
      accountName,
    );
    if (testFarmPendingReply) return testFarmPendingReply;
    const pendingReply = await handlePendingInput(
      env,
      event,
      messageText,
      eventId,
      groupId,
      state.organizationId,
      accountName,
    );
    if (pendingReply) return pendingReply;
  }

  if (!unifiedIntent && deterministicFallback) unifiedIntent = deterministicFallback;
  if (!unifiedIntent && aiFailed) return naturalLanguageFallbackReply(accountName);
  if (unifiedIntent && unifiedIntent.intent !== "unknown") {
    if (unifiedIntent.source === "deterministic") {
      logAiObservation(false, unifiedIntent, unifiedIntent.confidence, 0, "deterministic_fast_path", trace);
    }
  }

  if (command.kind === "create_test_farm") {
    if (!state.organizationId) return unboundReply(accountName);
    return startFarmAdminAction(
      env,
      event,
      eventId,
      groupId,
      state.organizationId,
      "create_test_farm",
      command.farmName,
      accountName,
    );
  }
  if (command.kind === "archive_test_farm") {
    if (!state.organizationId) return unboundReply(accountName);
    return startFarmAdminAction(
      env,
      event,
      eventId,
      groupId,
      state.organizationId,
      "archive_test_farm",
      command.farmName,
      accountName,
    );
  }
  if (command.kind === "create_farm") {
    if (!state.organizationId) return unboundReply(accountName);
    return startFarmAdminAction(
      env,
      event,
      eventId,
      groupId,
      state.organizationId,
      "create_farm",
      command.farmName,
      accountName,
    );
  }
  if (command.kind === "archive_farm") {
    if (!state.organizationId) return unboundReply(accountName);
    return startFarmAdminAction(
      env,
      event,
      eventId,
      groupId,
      state.organizationId,
      "archive_farm",
      command.farmName,
      accountName,
    );
  }
  if (command.kind === "create_house" || command.kind === "create_flock") {
    if (!state.organizationId) return unboundReply(accountName);
    return startOperationalAdminAction(env, event, eventId, groupId, state.organizationId, command, accountName);
  }
  if (command.kind === "test_farm_list") {
    if (!state.organizationId) return unboundReply(accountName);
    const lineUserId = event.source?.userId;
    if (!lineUserId || !(await activeAdminSession(env, groupId, lineUserId))) return `${botName(accountName)}\n這個功能只有管理者可以使用。`;
    return testFarmListReply(env, state.organizationId, accountName);
  }

  if (command.kind === "bind") {
    let farmId: string | null = null;
    if (state.organizationId) {
      const farm = await resolveFarm(env, state.organizationId, command.farmName);
      if (!farm) return safeRejectionReply(accountName);
      farmId = farm.id;
    }
    await env.DB.prepare(
      `UPDATE line_groups
          SET status = 'bound', farm_name = ?, farm_id = COALESCE(?, farm_id),
              bound_at = CURRENT_TIMESTAMP, left_at = NULL
        WHERE group_id = ?`,
    )
      .bind(command.farmName, farmId, groupId)
      .run();
    return `${botName(accountName)}\n✅ 已完成一次性雞場綁定：${command.farmName}`;
  }

  if (!unifiedIntent || unifiedIntent.intent === "unknown") return safeRejectionReply(accountName);
  return handleUnifiedIntent(env, event, eventId, groupId, state, unifiedIntent, accountName);
}

interface ProcessEventResult {
  eventId: string;
  alreadyProcessed: boolean;
}

function exactPendingAmbientPreviewText(event: LineEvent): string | null {
  if (event.type !== "message" || event.message?.type !== "text" || !event.message.text) return null;
  const mentionees = event.message.mention?.mentionees;
  const businessText = hasSelfMention(mentionees)
    ? stripSelfMention(event.message.text, mentionees)
    : event.message.text.trim();
  return normalize(businessText) === "顯示待摘要訊息" ? businessText : null;
}

async function processEvent(
  env: Env,
  event: LineEvent,
  receivedAt: string,
  replySender: ReplySender = replyLine,
  trace?: RuntimeTrace,
  correlationId?: string,
  touchIngress = true,
): Promise<ProcessEventResult> {
  if (trace) trace.correlation_id ??= correlationId ?? eventIdFor(event);
  if (trace) {
    trace.startedAtMs = Date.now();
    trace.timing = { webhook_received_ms: 0 };
  }
  // The developer diagnostic is deliberately a pure read. It is the one
  // explicit command that bypasses the normal event idempotency ledger so
  // repeated previews leave ambient/candidate/official D1 state untouched.
  if (exactPendingAmbientPreviewText(event)) {
    const eventId = eventIdFor(event);
    const groupId = sourceGroupId(event);
    const lineUserId = event.source?.userId;
    const authorized = Boolean(groupId && lineUserId && await activeAdminSession(env, groupId, lineUserId));
    const state = groupId ? await groupState(env, groupId) : { organizationId: null } as GroupState;
    const messages = !authorized
      ? [lineAdminDeniedReply(env.LINE_ACCOUNT_NAME)]
      : groupId && state.organizationId
        ? await runAmbientPreview(env, groupId, state.organizationId, new Date(event.timestamp ?? Date.now()))
        : [buildTextMessage(unboundReply(env.LINE_ACCOUNT_NAME))];
    traceMark(trace, "line_reply_start_ms");
    await replySender(event.replyToken, messages, env);
    traceMark(trace, "line_reply_complete_ms");
    traceMark(trace, "total_ms");
    return { eventId, alreadyProcessed: false };
  }

  const eventState = await recordEvent(env, event, receivedAt, touchIngress);
  if (eventState.replyOnlyMessages) {
    await deliverTrackedReply(env, eventState.eventId, event, eventState.replyOnlyMessages, replySender, trace);
    traceMark(trace, "total_ms");
    return eventState;
  }
  if (eventState.alreadyProcessed) {
    traceMark(trace, "total_ms");
    return eventState;
  }

  const groupId = sourceGroupId(event);
  if (event.type === "join" && groupId) {
    await ensureGroup(env, groupId);
    const state = await groupState(env, groupId);
    const messages = await persistBusinessResponse(env, eventState.eventId, [
      { type: "text", text: joinReply(env.LINE_ACCOUNT_NAME, Boolean(state.organizationId)) },
    ]);
    await deliverTrackedReply(env, eventState.eventId, event, messages, replySender, trace);
    return eventState;
  }

  if (event.type === "leave" && groupId) {
    await env.DB.prepare(
      "UPDATE line_groups SET status = 'left', left_at = CURRENT_TIMESTAMP WHERE group_id = ?",
    )
      .bind(groupId)
      .run();
    await markNoReplyCompleted(env, eventState.eventId);
    return eventState;
  }

  if (event.type === "postback") {
    const messages = await handleLinePostback(env, event, eventState.eventId, env.LINE_ACCOUNT_NAME);
    const finalMessages = await persistBusinessResponse(env, eventState.eventId, messages);
    await deliverTrackedReply(env, eventState.eventId, event, finalMessages, replySender, trace);
    traceMark(trace, "total_ms");
    return eventState;
  }

  if (event.type !== "message" || event.message?.type !== "text" || !event.message.text) {
    await markNoReplyCompleted(env, eventState.eventId);
    traceMark(trace, "total_ms");
    return eventState;
  }
  const rawMessageText = event.message.text;
  const mentionees = event.message.mention?.mentionees;
  const mentionedSelf = hasSelfMention(mentionees);
  const businessText = mentionedSelf ? stripSelfMention(rawMessageText, mentionees) : rawMessageText.trim();
  const routedEvent = mentionedSelf ? eventWithMessageText(event, businessText) : event;
  const command = parseCommand(businessText);
  const developmentCommand = parseDevelopmentAmbientCommand(businessText);
  if (developmentCommand) {
    // Development commands are a separate exact route. A bare command is
    // quiet (and is not buffered); a true self-mention is required before the
    // allowlist and organization checks are even considered.
    if (!mentionedSelf) {
      await redactQuietLineEventPayload(env, eventState.eventId, event);
      await markNoReplyCompleted(env, eventState.eventId);
      traceMark(trace, "total_ms");
      return eventState;
    }
    const devGroupId = sourceGroupId(event);
    const devActorId = event.source?.userId ?? null;
    if (!devGroupId || !devActorId) {
      await markNoReplyCompleted(env, eventState.eventId);
      traceMark(trace, "total_ms");
      return eventState;
    }
    const authorization = developmentAmbientAuthorization(env, devGroupId, devActorId);
    if (!authorization.authorized) {
      // Do not reveal the development command surface to ordinary users or
      // groups. The receipt is retained by the normal reliability layer, but
      // this command never enters Ambient and never produces an outbound.
      await redactQuietLineEventPayload(env, eventState.eventId, event);
      await markNoReplyCompleted(env, eventState.eventId);
      traceMark(trace, "total_ms");
      return eventState;
    }
    await ensureGroup(env, devGroupId);
    const devState = await groupState(env, devGroupId);
    const responseText = !devState.organizationId
      ? unboundReply(env.LINE_ACCOUNT_NAME)
      : await handleDevelopmentAmbientCommand(env, {
        organizationId: devState.organizationId,
        groupId: devGroupId,
        actorId: devActorId,
        now: new Date(event.timestamp ?? Date.now()),
        extract: developmentAmbientExtractor(env),
      }, developmentCommand);
    const finalMessages = await persistBusinessResponse(env, eventState.eventId, [buildTextMessage(responseText)]);
    await deliverTrackedReply(env, eventState.eventId, event, finalMessages, replySender, trace, { allowPushFallback: false });
    traceMark(trace, "total_ms");
    return eventState;
  }
  if (trace && mentionedSelf) {
    trace.conversation_v2_explicit_self_mention = true;
    trace.conversation_v2_dispatch_entered = false;
    trace.conversation_v2_skip_reason = classifyCommand(command) === "CONTROL" || classifyCommand(command) === "ADMIN"
      ? "unsupported_command_class"
      : "not_dispatched";
  }
  // A bare `摘要` is deliberately not an ambient-digest wake signal. Even
  // when a user happens to have an active record context, only the validated
  // LINE self-mention form may run the manual digest command.
  const bareAmbientDigest = command.kind === "ambient_digest_now" && !mentionedSelf;
  const gateGroupId = sourceGroupId(event);
  const gateUserId = event.source?.userId;
  let hasActiveSession = false;
  let hasPendingState = false;
  if (gateGroupId && gateUserId) {
    const now = new Date(event.timestamp ?? Date.now()).toISOString();
    hasActiveSession = !bareAmbientDigest && await quickRecordHasActiveContext(env, gateGroupId, gateUserId, now);
    hasPendingState = !bareAmbientDigest && await hasScopedPendingState(env, gateGroupId, gateUserId, now);
    if (!bareAmbientDigest && event.type === "message" && correctionLooksRelevant(businessText)) {
      hasPendingState = hasPendingState || await hasRecentSentDailyReview(env, gateGroupId, now);
    }
  }
  const gate = interactionGateDecision({
    eventType: event.type,
    hasMention: mentionedSelf,
    isSystemCommand: isExplicitWakeCommand(command, businessText),
    hasActiveSession,
    hasPendingState,
  });
    if (trace) {
      trace.interaction_gate = gate;
      trace.mention_stripped = mentionedSelf && businessText !== rawMessageText;
  }
  if (gate === "quiet") {
    const quietOrg = gateGroupId ? (await ensureGroup(env, gateGroupId), await groupState(env, gateGroupId)).organizationId : null;
    if (quietOrg && gateGroupId && gateUserId && event.message.id) {
      const buffered = await bufferAmbientMessage(env, {
        organizationId: quietOrg,
        lineGroupId: gateGroupId,
        lineUserId: gateUserId,
        lineMessageId: event.message.id,
        eventTimestamp: new Date(event.timestamp ?? Date.now()).toISOString(),
        text: rawMessageText,
      });
      if (trace) trace.ambient_buffered = buffered;
    }
    await redactQuietLineEventPayload(env, eventState.eventId, event);
    await markNoReplyCompleted(env, eventState.eventId);
    traceMark(trace, "total_ms");
    return eventState;
  }
  if (mentionedSelf && !businessText) {
    traceMark(trace, "command_resolved_ms");
    const messages = await persistBusinessResponse(env, eventState.eventId, [buildTextMessage("我在，請問要做什麼？"), buildMainMenuFlex()]);
    await deliverTrackedReply(env, eventState.eventId, event, messages, replySender, trace);
    traceMark(trace, "total_ms");
    return eventState;
  }
  traceMark(trace, "command_resolved_ms");
  const groupIdForDedupe = sourceGroupId(event);
  const lineUserIdForDedupe = event.source?.userId;
  const semanticAction = menuActionForCommand(command);
  let semanticLock: SemanticActionLock | null = null;
  if (semanticAction && groupIdForDedupe && lineUserIdForDedupe) {
    // The semantic lock has a foreign key to line_groups. A first-ever
    // Message Action in a newly seen group must create that context before
    // attempting the atomic lock acquisition.
    await ensureGroup(env, groupIdForDedupe);
    const key = semanticActionKey(groupIdForDedupe, lineUserIdForDedupe, semanticAction);
    if (trace) trace.semantic_action_key = key;
    const acquisition = await acquireSemanticAction(
      env,
      groupIdForDedupe,
      lineUserIdForDedupe,
      semanticAction,
      eventState.eventId,
    );
    if (!acquisition.acquired) {
      if (trace) trace.semantic_dedupe = "suppressed";
      await markNoReplyCompleted(env, eventState.eventId);
      traceMark(trace, "total_ms");
      return eventState;
    }
    semanticLock = acquisition.lock;
    if (trace) trace.semantic_dedupe = "acquired";
  } else if (trace) {
    trace.semantic_dedupe = "not_applicable";
  }

  const routingOrganizationId = trace?.conversation_v2_explicit_self_mention && groupId
    ? (await groupState(env, groupId)).organizationId
    : null;
  let businessFinalized = false;
  try {
    const response = await handleCommand(env, routedEvent, command, env.LINE_ACCOUNT_NAME, eventState.eventId, trace);
    const messages: LineReplyMessage[] = Array.isArray(response)
      ? response
      : [{ type: "text", text: response }];
    await persistConversationV2RoutingObservability(env, event, routingOrganizationId, groupId, trace);
    const finalMessages = await persistBusinessResponse(env, eventState.eventId, messages);
    businessFinalized = true;
    if (semanticLock) await completeSemanticAction(env, semanticLock);
    await deliverTrackedReply(env, eventState.eventId, event, finalMessages, replySender, trace);
  } catch (error) {
    await persistConversationV2RoutingObservability(env, event, routingOrganizationId, groupId, trace);
    if (semanticLock && !businessFinalized) await abortSemanticAction(env, semanticLock);
    throw error;
  }
  traceMark(trace, "total_ms");
  return eventState;
}

async function runtimeSignedWebhookBody(env: Env, rawBody: string): Promise<{ body: string; signature: string } | null> {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null || !Array.isArray((payload as { events?: unknown }).events)) return null;
  const source = payload as LineWebhookPayload & Record<string, unknown>;
  const events: LineEvent[] = [];
  for (const item of source.events) {
    if (typeof item !== "object" || item === null) return null;
    const event = await fillRuntimeTestEvent(env, item as LineEvent);
    if (!event) return null;
    events.push(event);
  }
  const body = JSON.stringify({ ...source, events });
  return { body, signature: await lineSignature(body, env.LINE_CHANNEL_SECRET) };
}

async function runtimeOrganizationId(env: Env): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT id FROM organizations WHERE active = 1 ORDER BY id LIMIT 1",
  ).first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * Production Ambient extraction seam. V1 remains the returned result; the
 * V2.2 branch is an explicit, default-off, read-only shadow side observation.
 */
interface ProductionAmbientExtractionObservabilityOptions {
  deferV1Terminal?: boolean;
  onCorrelationCreated?: (correlationId: string) => void;
}

export async function runProductionAmbientExtraction(
  env: Pick<Env, "AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST">,
  ambientEnv: AmbientEnv,
  messages: AmbientBufferedMessage[],
  v1Extractor?: NonNullable<AmbientDigestRunOptions["extract"]>,
  shadowTelemetryEmit?: (telemetry: AmbientV2_2ShadowTelemetry) => void,
  observabilityOptions: ProductionAmbientExtractionObservabilityOptions = {},
): Promise<AmbientExtractionResult> {
  const groupId = messages[0]?.lineGroupId ?? null;
  const allowlist = env.AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST;
  const shadowEnabled = ambientV2_2ShadowGroupMatches(groupId, allowlist);
  const correlationId = shadowEnabled ? createAmbientV2_2ShadowCorrelationId() : null;
  if (correlationId) {
    try {
      observabilityOptions.onCorrelationCreated?.(correlationId);
    } catch {
      // Correlation registration is observability-only and must not affect V1.
    }
    try {
      await runAmbientV2_2Shadow(ambientEnv, messages, {
        groupId,
        allowlist,
        correlationId,
        emit: shadowTelemetryEmit,
      });
    } catch {
      // The Shadow helper already contains its provider boundary. Keep this
      // outer guard so a future telemetry/runtime defect cannot reach V1.
    }
  }
  const extract = v1Extractor ?? ((serviceEnv: AmbientEnv, selectedMessages: AmbientBufferedMessage[]) =>
    extractAmbientCandidates(serviceEnv, selectedMessages, SEMANTIC_AI_MODEL));
  try {
    const result = await extract(ambientEnv, messages);
    if (correlationId && !observabilityOptions.deferV1Terminal) {
      emitAmbientV2_2V1TerminalTelemetry(correlationId, "COMPLETED", shadowTelemetryEmit);
    }
    return result;
  } catch (error) {
    if (correlationId && !observabilityOptions.deferV1Terminal) {
      emitAmbientV2_2V1TerminalTelemetry(correlationId, "FAILED", shadowTelemetryEmit);
    }
    throw error;
  }
}

async function runProductionAmbientDigest(env: Env, now: Date): Promise<void> {
  const shadowCorrelations = new Map<string, string>();
  const groupKey = (organizationId: string, groupId: string): string => `${organizationId}\u001f${groupId}`;
  const emitV1Terminal = ({ organizationId, groupId, status }: Parameters<NonNullable<AmbientDigestRunOptions["onGroupTerminal"]>>[0]): void => {
    const key = groupKey(organizationId, groupId);
    const correlationId = shadowCorrelations.get(key);
    if (!correlationId) return;
    emitAmbientV2_2V1TerminalTelemetry(correlationId, status === "completed" ? "COMPLETED" : "FAILED");
    shadowCorrelations.delete(key);
  };
  try {
    await runAmbientDigest(env, {
      trigger: "cron",
      now,
      onGroupTerminal: emitV1Terminal,
      extract: (ambientEnv, messages) => runProductionAmbientExtraction(
        env,
        ambientEnv,
        messages,
        undefined,
        undefined,
        {
          deferV1Terminal: true,
          onCorrelationCreated: (correlationId) => {
            const organizationId = messages[0]?.organizationId;
            const groupId = messages[0]?.lineGroupId;
            if (organizationId && groupId) shadowCorrelations.set(groupKey(organizationId, groupId), correlationId);
          },
        },
      ),
      push: async (groupId, candidateId, bundle) => {
        const group = await groupState(env, groupId);
        const quickReply = group.organizationId ? await ambientDigestQuickReply(env, group.organizationId, candidateId, bundle) : null;
        await pushLine(groupId, [buildTextMessage(formatAmbientCandidate(bundle), quickReply ?? undefined)], env);
      },
    });
  } catch (error) {
    for (const correlationId of shadowCorrelations.values()) {
      emitAmbientV2_2V1TerminalTelemetry(correlationId, "FAILED");
    }
    shadowCorrelations.clear();
    console.log(JSON.stringify({
      event: "ambient_digest_cron_error",
      trigger: "cron",
      error_stage: "run",
      error_class: error instanceof Error && error.name ? error.name : "unknown",
    }));
  }
}

async function runProductionDailyReview(env: Env, now: Date): Promise<void> {
  try {
    const result = await runDailyOperationsReview(
      env,
      now,
      async (groupId, message) => { await pushLine(groupId, [message], env); },
    );
    console.log(JSON.stringify({
      event: "daily_operations_review_complete",
      trigger: "cron",
      cron: dailyReviewCronExpression(),
      groups: result.groups,
      sent: result.sent,
      already_sent: result.alreadySent,
      busy: result.busy,
      failed: result.failed,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      event: "daily_operations_review_cron_error",
      trigger: "cron",
      error_stage: "run",
      error_class: error instanceof Error && error.name ? error.name : "unknown",
    }));
  }
}

/**
 * Keep scheduled routing explicit and testable. Cloudflare supplies the
 * configured cron expression in ScheduledController.cron; this dispatcher is
 * also used by the local runtime harness so a passing test proves the same
 * expression-to-job mapping used in production.
 */
async function executeScheduledJob(cron: string, scheduledAt: Date, env: Env): Promise<void> {
  try {
    await redactExpiredLineEventPayloads(env, scheduledAt);
    await env.DB.prepare(
      `DELETE FROM line_events
        WHERE received_at < datetime('now', '-90 days')
          AND lifecycle_status = 'reply_completed'`,
    ).run();
    await env.DB.prepare(
      `DELETE FROM line_events
        WHERE lifecycle_status = 'retained'
        AND retained_until IS NOT NULL
          AND julianday(retained_until) <= julianday(?)`,
    ).bind(new Date(scheduledAt.getTime()).toISOString()).run();
    await env.DB.prepare(
      `DELETE FROM line_event_recovery_audit
        WHERE created_at < datetime('now', '-7 days')`,
    ).run();
    await env.DB.prepare(
      `DELETE FROM line_event_delivery_attempts
        WHERE julianday(expires_at) <= julianday(?)`,
    ).bind(new Date(scheduledAt.getTime()).toISOString()).run();
  } catch (error) {
    console.log(JSON.stringify({
      event: "scheduled_cleanup_error",
      error_class: error instanceof Error && error.name ? error.name : "unknown",
    }));
  }

  const job = scheduledJobForCron(cron);
  if (job === "recovery") {
    try {
      const result = await recoverStalledLineEvents(env, scheduledAt, 20);
      console.log(JSON.stringify({
        event: "line_event_recovery_complete",
        cron,
        scanned: result.scanned,
        requeued: result.requeued,
        skipped: result.skipped,
        failed: result.failed,
      }));
    } catch (error) {
      console.error(JSON.stringify({
        event: "line_event_recovery_failure",
        cron,
        error_class: error instanceof Error && error.name ? error.name : "recovery_error",
      }));
    }
    return;
  }
  if (job === "daily_review") {
    await runProductionDailyReview(env, scheduledAt);
    return;
  }
  if (job === "ambient_digest") {
    await runProductionAmbientDigest(env, scheduledAt);
    return;
  }
  console.log(JSON.stringify({ event: "scheduled_unknown_cron", cron }));
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "chicken-line-production", account: env.LINE_ACCOUNT_ID });
    }

    if (request.method === "GET" && url.pathname === "/ready") {
      const readiness = await getReliabilityReadiness(env);
      return json({
        ok: readiness.ok,
        service: "chicken-line-production",
        checkedAt: readiness.checkedAt,
        checks: readiness.checks,
        status: readiness.status,
        errorClass: readiness.errorClass ?? null,
      }, readiness.ok ? 200 : 503);
    }

    if (url.pathname.startsWith("/api/")) {
      return handleWebApi(request, env);
    }

    if (url.pathname === "/__codex/runtime/sign" && request.method === "POST") {
      if (!runtimeTestAuthorized(request, env)) return json({ error: "not_found" }, 404);
      const signed = await runtimeSignedWebhookBody(env, await request.text());
      return signed ? json({ ok: true, ...signed }) : json({ error: "invalid_runtime_payload" }, 400);
    }

    if (url.pathname === "/__codex/runtime/dispatch" && request.method === "POST") {
      if (!runtimeTestAuthorized(request, env)) return json({ error: "not_found" }, 404);
      let event: LineEvent;
      try {
        event = JSON.parse(await request.text()) as LineEvent;
      } catch {
        return json({ error: "invalid_runtime_event" }, 400);
      }
      const filled = await fillRuntimeTestEvent(env, event);
      if (!filled) return json({ error: "runtime_group_unavailable" }, 409);
      const trace: RuntimeTrace = {};
      let capturedMessages: LineReplyMessage[] = [];
      const result = await processEvent(
        env,
        filled,
        new Date().toISOString(),
        async (_replyToken, messages) => {
          capturedMessages = messages;
        },
        trace,
      );
      traceMark(trace, "total_ms");
      delete trace.startedAtMs;
      return json({ ok: true, ...result, trace, reply: { messages: capturedMessages } });
    }

    if (url.pathname === "/__codex/runtime/fast-path" && request.method === "POST") {
      if (!runtimeTestAuthorized(request, env)) return json({ error: "not_found" }, 404);
      let event: LineEvent;
      try {
        event = JSON.parse(await request.text()) as LineEvent;
      } catch {
        return json({ error: "invalid_runtime_event" }, 400);
      }
      const filled = await fillRuntimeTestEvent(env, event);
      if (!filled) return json({ error: "runtime_group_unavailable" }, 409);
      const decision = classifyLineFastPath(filled);
      if (!decision.eligible) return json({ ok: false, decision }, 409);
      const receivedAt = new Date().toISOString();
      const storedEvent = await redactAdminPasswordEvent(env, filled);
      await ensureLineEventReceipt(env, filled, receivedAt, storedEvent, true);
      let capturedMessages: LineReplyMessage[] = [];
      await processFastPathEvent(
        env,
        filled,
        storedEvent,
        receivedAt,
        decision,
        async (_replyToken, messages) => {
          capturedMessages = messages;
          return { status: 200, requestId: "local-fast-path" };
        },
      );
      const receipt = await getLineEventReceipt(env.DB, eventIdFor(filled));
      return json({ ok: true, decision, reply: { messages: capturedMessages }, receipt });
    }

    if (url.pathname === "/__codex/runtime/ai" && request.method === "POST") {
      if (!runtimeTestAuthorized(request, env)) return json({ error: "not_found" }, 404);
      let body: { input?: unknown };
      try {
        body = JSON.parse(await request.text()) as { input?: unknown };
      } catch {
        return json({ error: "invalid_runtime_ai_request" }, 400);
      }
      if (typeof body.input !== "string" || !body.input.trim()) return json({ error: "invalid_runtime_ai_input" }, 400);
      const organizationId = await runtimeOrganizationId(env);
      if (!organizationId) return json({ error: "runtime_organization_unavailable" }, 409);
      const trace: RuntimeTrace = {};
      const result = await parseSemanticWithAi(env, body.input, organizationId, trace);
      return json({
        ok: result.attempted && Boolean(result.intent),
        model: SEMANTIC_AI_MODEL,
        trace,
        intent: result.intent,
      });
    }

    if (url.pathname === "/__codex/runtime/ambient" && request.method === "POST") {
      if (!runtimeTestAuthorized(request, env)) return json({ error: "not_found" }, 404);
      let body: {
        groupId?: unknown;
        now?: unknown;
        cutoffAt?: unknown;
        trigger?: unknown;
        candidate?: unknown;
        failure?: unknown;
        pushFail?: unknown;
        leaseOwner?: unknown;
        leaseTtlMs?: unknown;
      };
      try {
        body = JSON.parse(await request.text()) as {
          groupId?: unknown;
          now?: unknown;
          cutoffAt?: unknown;
          trigger?: unknown;
          candidate?: unknown;
          pushFail?: unknown;
          leaseOwner?: unknown;
          leaseTtlMs?: unknown;
        };
      } catch {
        return json({ error: "invalid_runtime_ambient_request" }, 400);
      }
      const groupId = typeof body.groupId === "string" && body.groupId ? body.groupId : await runtimeTestGroupId(env);
      if (!groupId) return json({ error: "runtime_group_unavailable" }, 409);
      await ensureGroup(env, groupId);
      const state = await groupState(env, groupId);
      if (!state.organizationId) return json({ error: "runtime_organization_unavailable" }, 409);
      const runtimeOrganizationId = state.organizationId;
      const now = typeof body.now === "string" && !Number.isNaN(Date.parse(body.now)) ? new Date(body.now) : new Date();
      const trigger = body.trigger === "manual" ? "manual" : "cron";
      const cutoffAt = typeof body.cutoffAt === "string" && !Number.isNaN(Date.parse(body.cutoffAt))
        ? new Date(body.cutoffAt)
        : now;
      const pushes: Array<{ groupId: string; candidateId: string; messages: LineReplyMessage[] }> = [];
      const mockBundle = body.candidate === undefined ? null : validateAmbientCandidateBundle(body.candidate);
      const result = await runAmbientDigest(env, {
        now,
        trigger,
        cutoffAt,
        targetGroupId: trigger === "manual" ? groupId : undefined,
        targetOrganizationId: trigger === "manual" ? state.organizationId : undefined,
        leaseOwner: typeof body.leaseOwner === "string" && body.leaseOwner ? body.leaseOwner : undefined,
        leaseTtlMs: typeof body.leaseTtlMs === "number" && Number.isFinite(body.leaseTtlMs) && body.leaseTtlMs > 0
          ? body.leaseTtlMs
          : undefined,
        extract: async () => mockBundle
          ? { attempted: true, bundle: mockBundle, validation: "schema_valid" as const }
          : body.failure === "ai"
            ? { attempted: true, bundle: null, validation: "ai_error" as const, errorClass: "timeout" }
            : body.failure === "validation"
              ? { attempted: true, bundle: null, validation: "schema_invalid" as const, errorClass: "schema_invalid" }
              : extractAmbientCandidates(env, []),
        push: async (targetGroupId, candidateId, bundle) => {
          if (body.pushFail === true) throw new Error("runtime_push_failure");
          pushes.push({
            groupId: targetGroupId,
            candidateId,
            messages: [buildTextMessage(formatAmbientCandidate(bundle), await ambientDigestQuickReply(env, runtimeOrganizationId, candidateId, bundle) ?? undefined)],
          });
        },
      });
      return json({ ok: true, result, pushes });
    }

    if (url.pathname === "/__codex/runtime/daily-review" && request.method === "POST") {
      if (!runtimeTestAuthorized(request, env)) return json({ error: "not_found" }, 404);
      let body: { groupId?: unknown; now?: unknown; pushFail?: unknown };
      try {
        body = JSON.parse(await request.text()) as { groupId?: unknown; now?: unknown; pushFail?: unknown };
      } catch {
        return json({ error: "invalid_runtime_daily_review_request" }, 400);
      }
      const groupId = typeof body.groupId === "string" && body.groupId ? body.groupId : await runtimeTestGroupId(env);
      if (!groupId) return json({ error: "runtime_group_unavailable" }, 409);
      await ensureGroup(env, groupId);
      const state = await groupState(env, groupId);
      if (!state.organizationId) return json({ error: "runtime_organization_unavailable" }, 409);
      const now = typeof body.now === "string" && !Number.isNaN(Date.parse(body.now)) ? new Date(body.now) : new Date();
      const pushes: LineReplyMessage[] = [];
      const result = await runDailyOperationsReview(
        env,
        now,
        async (_targetGroupId, message) => {
          if (body.pushFail === true) throw new Error("runtime_daily_review_push_failure");
          pushes.push(message);
        },
        groupId,
      );
      return json({ ok: true, result, pushes });
    }

    if (url.pathname === "/__codex/runtime/scheduled" && request.method === "POST") {
      if (!runtimeTestAuthorized(request, env)) return json({ error: "not_found" }, 404);
      let body: { cron?: unknown; now?: unknown };
      try {
        body = JSON.parse(await request.text()) as { cron?: unknown; now?: unknown };
      } catch {
        return json({ error: "invalid_runtime_scheduled_request" }, 400);
      }
      const cron = typeof body.cron === "string" && body.cron ? body.cron : "0 1,4,7,10,22 * * *";
      const now = typeof body.now === "string" && !Number.isNaN(Date.parse(body.now)) ? new Date(body.now) : new Date();
      await executeScheduledJob(cron, now, env);
      return json({ ok: true, cron, job: scheduledJobForCron(cron) });
    }

    if (url.pathname === "/__codex/runtime/benchmark-ai" && request.method === "POST") {
      if (!runtimeTestAuthorized(request, env)) return json({ error: "not_found" }, 404);
      let body: { input?: unknown; model?: unknown };
      try {
        body = JSON.parse(await request.text()) as { input?: unknown; model?: unknown };
      } catch {
        return json({ error: "invalid_runtime_benchmark_request" }, 400);
      }
      if (typeof body.input !== "string" || !body.input.trim() || typeof body.model !== "string" || !BENCHMARK_MODEL_ALLOWLIST.has(body.model)) {
        return json({ error: "invalid_runtime_benchmark_input" }, 400);
      }
      const organizationId = await runtimeOrganizationId(env);
      if (!organizationId) return json({ error: "runtime_organization_unavailable" }, 409);
      const trace: RuntimeTrace = {};
      const result = await parseSemanticWithAiModel(env, body.input, organizationId, body.model, trace, false);
      let farmResolution: { kind: string; farmName?: string; candidates: string[] } = { kind: "none", candidates: [] };
      let validatorPass = false;
      let wouldDirectWrite = false;
      if (result.intent && result.intent.farmText) {
        const resolver = await loadFarmResolver(env, organizationId);
        const resolution = resolver.resolve(result.intent.farmText);
        farmResolution = {
          kind: resolution.kind,
          farmName: resolution.farm?.name,
          candidates: resolution.candidates.map((candidate) => candidate.farmName),
        };
        const draft = operationalDraftFromUnified(result.intent);
        validatorPass = Boolean(draft && validOperationalDraft(draft));
        wouldDirectWrite = Boolean(
          isUnifiedRecordIntent(result.intent.intent) &&
          validatorPass &&
          result.intent.intent !== "record_inventory" &&
          !result.intent.needsConfirmation &&
          resolution.kind === "direct" &&
          resolution.farm,
        );
      } else if (result.intent && isUnifiedRecordIntent(result.intent.intent)) {
        const draft = operationalDraftFromUnified(result.intent);
        validatorPass = Boolean(draft && validOperationalDraft(draft));
        farmResolution = { kind: "waiting_farm", candidates: [] };
      }
      return json({
        ok: result.attempted && result.validationResult === "schema_valid",
        model: body.model,
        trace,
        intent: result.intent,
        validationResult: result.validationResult,
        errorKind: result.errorKind ?? null,
        usage: result.usage ?? null,
        farmResolution,
        validatorPass,
        wouldDirectWrite,
      });
    }

    /**
     * Explicit remote-dev-only transport for the Ambient semantic capability
     * matrix. It forwards the exact request assembled by ambient.ts to the
     * real AI binding and never touches D1, Queue, Candidate, or LINE APIs.
     * The second gate is intentionally absent from the Production manifest.
     */
    if (url.pathname === "/__codex/runtime/ambient-semantic-ai" && request.method === "POST") {
      if (env.RUNTIME_AMBIENT_SEMANTIC_EVAL_ENABLED !== "1" || !runtimeTestAuthorized(request, env)) {
        return json({ error: "not_found" }, 404);
      }
      let body: { model?: unknown; request?: unknown };
      try {
        body = JSON.parse(await request.text()) as { model?: unknown; request?: unknown };
      } catch {
        return json({ error: "invalid_runtime_ambient_semantic_request" }, 400);
      }
      const validation = validateAmbientV2_2WorkerParityRequest(body.model, body.request, SEMANTIC_AI_MODEL);
      if (!validation.ok) return json({ error: `invalid_runtime_ambient_semantic_${validation.error.toLowerCase()}` }, 400);
      try {
        const result = await runAmbientAiRequestInput(env, validation.model, validation.input);
        return json({ ok: true, model: validation.model, result });
      } catch {
        return json({ ok: false, error: "ambient_semantic_ai_error" }, 502);
      }
    }

    if (url.pathname === "/__codex/runtime/state" && request.method === "GET") {
      if (!runtimeTestAuthorized(request, env)) return json({ error: "not_found" }, 404);
      const prefix = url.searchParams.get("prefix") ?? "";
      if (!/^codex-runtime-[a-z0-9-]{8,80}$/u.test(prefix)) return json({ error: "invalid_runtime_prefix" }, 400);
      const events = await env.DB.prepare(
        `SELECT e.source_event_id AS sourceEventId, e.intent, e.quantity, e.unit,
                e.reversed_at AS reversedAt, e.reversal_reason AS reversalReason,
                f.name AS farmName
           FROM operational_events e
           JOIN farms f ON f.id = e.farm_id
          WHERE e.source_event_id LIKE ?
          ORDER BY e.source_event_id`,
      ).bind(`${prefix}%`).all<{ sourceEventId: string; intent: OperationalIntent; quantity: number; unit: string; reversedAt: string | null; reversalReason: string | null; farmName: string }>();
      const pending = await env.DB.prepare(
        `SELECT source_event_id AS sourceEventId, intent, quantity, status, cancel_reason AS cancelReason
           FROM pending_actions
          WHERE source_event_id LIKE ?
          ORDER BY source_event_id`,
      ).bind(`${prefix}%`).all<{ sourceEventId: string; intent: OperationalIntent; quantity: number; status: string; cancelReason: string | null }>();
      const quickItems = await env.DB.prepare(
        `SELECT i.id, i.bundle_id AS bundleId, i.item_type AS itemType, i.intent,
                i.raw_text AS rawText, i.quantity, i.unit, i.status,
                i.operational_event_id AS operationalEventId, i.abnormal_event_id AS abnormalEventId,
                i.source_event_id AS sourceEventId
           FROM quick_record_items i
          WHERE i.source_event_id LIKE ? OR i.source_event_id LIKE ?
          ORDER BY i.created_at, i.id`,
      ).bind(`${prefix}%`, `%${prefix}%`).all<Record<string, unknown>>();
      const abnormal = await env.DB.prepare(
        `SELECT a.id, a.farm_id AS farmId, f.name AS farmName, a.raw_text AS rawText,
                a.status, a.source_event_id AS sourceEventId, a.correction_of_id AS correctionOfId,
                a.reversal_of_id AS reversalOfId
           FROM abnormal_events a JOIN farms f ON f.id = a.farm_id
          WHERE a.source_event_id LIKE ? OR a.source_event_id LIKE ?
          ORDER BY a.created_at, a.id`,
      ).bind(`${prefix}%`, `%${prefix}%`).all<Record<string, unknown>>();
      const bundles = await env.DB.prepare(
        `SELECT id, farm_id AS farmId, status, opened_at AS openedAt,
                confirmed_at AS confirmedAt
           FROM quick_record_bundles
          WHERE id LIKE ? OR id LIKE ?
          ORDER BY created_at, id`,
      ).bind(`${prefix}%`, `%${prefix}%`).all<Record<string, unknown>>();
      const sessions = await env.DB.prepare(
          `SELECT line_group_id AS lineGroupId, line_user_id AS lineUserId,
                  pending_status AS pendingStatus, active_farm_id AS activeFarmId,
                  pending_items_json AS pendingItemsJson, expires_at AS expiresAt,
                  last_confirmed_bundle_id AS lastConfirmedBundleId
             FROM quick_record_sessions
          WHERE instr(id, ?) > 0 OR instr(line_user_id, ?) > 0
          ORDER BY updated_at, id`,
      ).bind(`quick-session-${prefix}`, prefix).all<Record<string, unknown>>();
      const audits = await env.DB.prepare(
        `SELECT action, entity_type AS entityType, entity_id AS entityId,
                before_json AS beforeJson, after_json AS afterJson, reason,
                request_id AS requestId
           FROM audit_logs
          WHERE request_id LIKE ? OR request_id LIKE ?
          ORDER BY created_at, id`,
      ).bind(`${prefix}%`, `%${prefix}%`).all<Record<string, unknown>>();
      const ambient = await env.DB.prepare(
        `SELECT id, line_group_id AS lineGroupId, line_user_id AS lineUserId,
                line_message_id AS lineMessageId, event_timestamp AS eventTimestamp,
                text, digest_hour AS digestHour, digest_status AS digestStatus,
                processing_failure_count AS processingFailureCount,
                last_processing_failure_stage AS lastProcessingFailureStage,
                failure_retained_until AS failureRetainedUntil
           FROM ambient_chat_buffer
          WHERE line_message_id LIKE ? OR text LIKE ?
          ORDER BY event_timestamp, id`,
      ).bind(`${prefix}%`, `%${prefix}%`).all<Record<string, unknown>>();
      const candidates = await env.DB.prepare(
      `SELECT id, line_group_id AS lineGroupId, hour_bucket AS hourBucket,
                status, source, candidate_json AS candidateJson
           FROM ambient_digest_candidates
          WHERE candidate_json LIKE ?
          ORDER BY created_at, id`,
      ).bind(`%${prefix}%`).all<Record<string, unknown>>();
      const conversationSessions = await env.DB.prepare(
        `SELECT id, active_object_type AS activeObjectType, active_object_id AS activeObjectId,
                last_goal AS lastGoal, last_topic AS lastTopic, last_action AS lastAction,
                turn_count AS turnCount, semantic_memory_json AS semanticMemoryJson,
                updated_at AS updatedAt, expires_at AS expiresAt
           FROM conversation_v2_sessions
          WHERE line_user_id LIKE ?
          ORDER BY updated_at, id`,
      ).bind(`${prefix}%`).all<Record<string, unknown>>();
      const conversationTraces = await env.DB.prepare(
        `SELECT trace_id AS traceId, correlation_id AS correlationId, event_ref AS eventRef, v2_eligibility AS v2Eligibility,
                planner_invoked AS plannerInvoked, planner_source AS plannerSource,
                plan_valid AS planValid, goal, topic, speech_act AS speechAct,
                object_type AS objectType, goal_guard AS goalGuard,
                requested_tools_json AS requestedToolsJson,
                executed_tools_json AS executedToolsJson, policy_level AS policyLevel,
                response_strategy AS responseStrategy, renderer, mutation_level AS mutationLevel,
                candidate_mutation_count AS candidateMutationCount,
                official_mutation_count AS officialMutationCount,
                audit_mutation_count AS auditMutationCount, created_at AS createdAt,
                expires_at AS expiresAt
           FROM conversation_v2_traces
          WHERE event_ref LIKE ?
          ORDER BY created_at, trace_id`,
      ).bind(`${prefix}%`).all<Record<string, unknown>>();
      const conversationRouting = await env.DB.prepare(
        `SELECT event_id AS eventId, correlation_id AS correlationId,
                conversation_routing_json AS conversationRoutingJson
           FROM line_events
          WHERE event_id LIKE ?
          ORDER BY received_at, event_id`,
      ).bind(`${prefix}%`).all<Record<string, unknown>>();
      let ambientDigestRuns: Record<string, unknown>[] = [];
      try {
        const runs = await env.DB.prepare(
          `SELECT run_id AS runId, organization_id AS organizationId, line_group_id AS lineGroupId,
                  scheduled_for AS scheduledFor, trigger_type AS triggerType,
                  CASE WHEN execution_mode = 'normal' THEN trigger_type ELSE execution_mode END AS effectiveTriggerType,
                  execution_mode AS executionMode, dev_session_id AS devSessionId, attempt_count AS attemptCount,
                  run_started_at AS runStartedAt, lease_status AS leaseStatus, lease_acquired_at AS leaseAcquiredAt,
                  source_status AS sourceStatus, source_selected_at AS sourceSelectedAt, source_count AS sourceCount,
                  prefilter_status AS prefilterStatus, prefilter_completed_at AS prefilterCompletedAt, prefilter_count AS prefilterCount,
                  ai_status AS aiStatus, ai_started_at AS aiStartedAt, ai_completed_at AS aiCompletedAt,
                  validation_status AS validationStatus, validation_completed_at AS validationCompletedAt, validation_count AS validationCount,
                  normalization_status AS normalizationStatus, enrichment_status AS enrichmentStatus,
                  resolve_status AS resolveStatus, first_bad_substage AS firstBadSubstage,
                  transport_diagnostics_json AS transportDiagnosticsJson,
                  dev_semantic_summary_json AS devSemanticSummaryJson,
                  reconcile_status AS reconcileStatus, reconcile_started_at AS reconcileStartedAt, reconcile_completed_at AS reconcileCompletedAt,
                  reconcile_count AS reconcileCount, candidate_write_status AS candidateWriteStatus,
                  candidate_write_started_at AS candidateWriteStartedAt, candidate_write_completed_at AS candidateWriteCompletedAt,
                  candidate_created_count AS candidateCreatedCount, buffer_consume_status AS bufferConsumeStatus,
                  buffer_consume_started_at AS bufferConsumeStartedAt, buffer_consume_completed_at AS bufferConsumeCompletedAt,
                  processed_count AS processedCount, delivery_status AS deliveryStatus, run_status AS runStatus,
                  error_stage AS errorStage, error_class AS errorClass, completed_at AS completedAt
             FROM ambient_digest_runs
            ORDER BY scheduled_for DESC, line_group_id
            LIMIT 50`,
        ).all<Record<string, unknown>>();
        ambientDigestRuns = runs.results;
      } catch {
        // Older local fixtures may not have the additive observability table.
      }
      let ambientDevSessions: Record<string, unknown>[] = [];
      try {
        const devSessions = await env.DB.prepare(
          `SELECT session_id AS sessionId, line_group_id AS lineGroupId,
                  authorized_actor_id AS authorizedActorId, status,
                  latest_run_id AS latestRunId, locked_at AS lockedAt,
                  expires_at AS expiresAt
             FROM ambient_dev_sessions
            WHERE authorized_actor_id LIKE ?
            ORDER BY updated_at, session_id`,
        ).bind(`${prefix}%`).all<Record<string, unknown>>();
        ambientDevSessions = devSessions.results;
      } catch {
        // Older local fixtures may not have development session metadata.
      }
      let ambientDigestInvocations: Record<string, unknown>[] = [];
      try {
        const invocations = await env.DB.prepare(
          `SELECT invocation_id AS invocationId, trigger_type AS triggerType,
                  CASE WHEN execution_mode = 'normal' THEN trigger_type ELSE execution_mode END AS effectiveTriggerType,
                  execution_mode AS executionMode, dev_session_id AS devSessionId,
                  scheduled_for AS scheduledFor, attempt_count AS attemptCount,
                  run_started_at AS runStartedAt,
                  expiry_cleanup_started_at AS expiryCleanupStartedAt,
                  expiry_cleanup_completed_at AS expiryCleanupCompletedAt,
                  expiry_rows_scanned AS expiryRowsScanned,
                  expiry_rows_deleted AS expiryRowsDeleted,
                  expiry_candidate_like_count AS expiryCandidateLikeCount,
                  expiry_prefilter_excluded_count AS expiryPrefilterExcludedCount,
                  expiry_failure_retained_skipped_count AS expiryFailureRetainedSkippedCount,
                  groups_before_cleanup AS groupsBeforeCleanup,
                  groups_after_cleanup AS groupsAfterCleanup,
                  per_group_runs_created AS perGroupRunsCreated,
                  failure_retention_candidates_considered AS failureRetentionCandidatesConsidered,
                  failure_retention_rows_extended AS failureRetentionRowsExtended,
                  failure_retention_rows_already_guarded AS failureRetentionRowsAlreadyGuarded,
                  failure_retention_rows_max_expired AS failureRetentionRowsMaxExpired,
                  invocation_status AS invocationStatus,
                  error_stage AS errorStage, error_class AS errorClass,
                  completed_at AS completedAt
             FROM ambient_digest_invocations
            ORDER BY scheduled_for DESC
            LIMIT 50`,
        ).all<Record<string, unknown>>();
        ambientDigestInvocations = invocations.results;
      } catch {
        // Older local fixtures may not have the additive invocation table.
      }
      let ambientExpiryDiagnostics: Record<string, unknown>[] = [];
      try {
        const diagnostics = await env.DB.prepare(
          `SELECT id, line_group_id AS lineGroupId,
                  original_event_timestamp AS originalEventTimestamp,
                  expired_at AS expiredAt, prefilter_result AS prefilterResult,
                  last_failure_stage AS lastFailureStage,
                  processing_failure_count AS processingFailureCount,
                  last_failure_at AS lastFailureAt,
                  final_expiry_reason AS finalExpiryReason
             FROM ambient_expiry_diagnostics
            ORDER BY expired_at DESC, id
            LIMIT 100`,
        ).all<Record<string, unknown>>();
        ambientExpiryDiagnostics = diagnostics.results;
      } catch {
        // Older local fixtures may not have the additive diagnostic columns.
      }
      return json({ ok: true, events: events.results, pending: pending.results, quickItems: quickItems.results, abnormal: abnormal.results, bundles: bundles.results, sessions: sessions.results, audits: audits.results, ambient: ambient.results, candidates: candidates.results, conversationSessions: conversationSessions.results, conversationTraces: conversationTraces.results, conversationRouting: conversationRouting.results, ambientDigestRuns, ambientDevSessions, ambientDigestInvocations, ambientExpiryDiagnostics });
    }

    if (request.method !== "POST" || url.pathname !== "/webhook/line") {
      return json({ error: "not_found" }, 404);
    }

    const body = await request.text();
    const valid = await verifyLineSignature(
      body,
      request.headers.get("x-line-signature"),
      env.LINE_CHANNEL_SECRET,
    );
    if (!valid) return json({ error: "invalid_signature" }, 401);

    let payload: LineWebhookPayload;
    try {
      payload = JSON.parse(body) as LineWebhookPayload;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!Array.isArray(payload.events)) return json({ error: "invalid_events" }, 400);

    const receivedAt = new Date().toISOString();
    const previewEvents = payload.events.filter((event) => exactPendingAmbientPreviewText(event));
    const durableEvents = payload.events.filter((event) => !exactPendingAmbientPreviewText(event));
    // The receipt is the durable hand-off boundary. We do not return success
    // until it exists; the potentially slow Queue send is supervised after
    // that boundary so a request cancellation cannot erase the event.
    let receiptEvents: Array<{
      event: LineEvent;
      storedEvent: LineEvent;
      containsPasswordInput: boolean;
      fastPath: FastPathDecision;
    }>;
    try {
      receiptEvents = await Promise.all(durableEvents.map(async (event) => {
        const storedEvent = await redactAdminPasswordEvent(env, event);
        await ensureLineEventReceipt(env, event, receivedAt, storedEvent, true);
        const containsPasswordInput = storedEvent !== event;
        return {
          event,
          storedEvent,
          containsPasswordInput,
          // A password continuation must remain on its supervised path even
          // if its plaintext happens to equal a public command.
          fastPath: containsPasswordInput ? {
            eligible: false,
            action: null,
            responseKind: null,
            reason: "admin_password_continuation",
            source: "none",
          } : classifyLineFastPath(event),
        };
      }));
    } catch (error) {
      console.error(JSON.stringify({
        event: "line_ingress_receipt_failure",
        error_class: error instanceof Error && error.name ? error.name : "receipt_error",
      }));
      // A receipt is the minimum durable acknowledgement. Returning non-2xx
      // lets LINE's configured redelivery policy decide whether to try again;
      // we never claim success when the receipt could not be written.
      return json({ error: "message_not_durably_received" }, 503);
    }
    const fastPathEvents = receiptEvents.filter(({ containsPasswordInput, fastPath }) => !containsPasswordInput && fastPath.eligible);
    const queueEvents = receiptEvents.filter(({ containsPasswordInput, fastPath }) => !containsPasswordInput && !fastPath.eligible);
    const passwordEvents = receiptEvents.filter(({ containsPasswordInput }) => containsPasswordInput);
    const fastPathProcessing = Promise.all(fastPathEvents.map(async ({ event, storedEvent, fastPath }) => {
      const selectedAt = new Date().toISOString();
      const eventId = eventIdFor(event);
      const correlationId = reliabilityCorrelationIdFor(event);
      console.log(JSON.stringify({
        event: "line_fast_path_selected",
        action: fastPath.action,
        response_kind: fastPath.responseKind,
        selection_reason: fastPath.reason,
        selected_at: selectedAt,
        received_at: receivedAt,
        event_id_suffix: eventId.slice(-12),
        correlation_id_suffix: correlationId.slice(-12),
      }));
      await processFastPathEvent(env, event, storedEvent, receivedAt, fastPath);
    }));
    const enqueue = Promise.all(queueEvents.map(async ({ event }) => {
      const eventId = eventIdFor(event);
      try {
        // Queue carries a reference envelope. The short-lived raw event copy
        // remains in line_events, so duplicate/recovery messages cannot carry
        // another independent reply token or diverge from the durable receipt.
        await enqueueLineEvent(env, event, "webhook");
      } catch (error) {
        const status = await markLineEventFailure(env, eventId, "enqueue", error).catch(() => "retry_waiting" as const);
        const correlationId = reliabilityCorrelationIdFor(event);
        console.error(JSON.stringify({
          event: "line_event_enqueue_failure",
          event_id_suffix: eventId.slice(-12),
          correlation_id_suffix: correlationId.slice(-12),
          lifecycle_status: status,
          error_class: error instanceof Error && error.name ? error.name : "enqueue_error",
        }));
      }
    }));
    // A password continuation must retain its plaintext only for the
    // supervised processing task. It is already redacted in line_events and
    // must not be copied into Queue or any recovery/diagnostic payload. If
    // this short-lived task fails, the durable receipt remains visible and
    // the administrator can enter the password again.
    const passwordProcessing = Promise.all(passwordEvents.map(async ({ event }) => {
      const eventId = eventIdFor(event);
      const correlationId = reliabilityCorrelationIdFor(event);
      try {
        await processEvent(env, event, receivedAt, replyLine, undefined, correlationId);
      } catch (error) {
        const current = await getLineEventReceipt(env.DB, eventId).catch(() => null);
        const status = current?.lastErrorStage === "reply"
          ? current.lifecycleStatus
          : await markLineEventFailure(env, eventId, "processing", error).catch(() => "retry_waiting" as const);
        console.error(JSON.stringify({
          event: "line_event_password_processing_failure",
          event_id_suffix: eventId.slice(-12),
          correlation_id_suffix: correlationId.slice(-12),
          lifecycle_status: status,
          error_class: error instanceof Error && error.name ? error.name : "processing_error",
        }));
      }
    }));
    // The diagnostic preview is intentionally not written to line_events or
    // Queue. It still needs an explicit supervised path so a real webhook
    // can receive its read-only reply; it must never be silently dropped by
    // the durable-event filter above.
    const previewProcessing = Promise.all(previewEvents.map(async (event) => {
      try {
        await processEvent(env, event, receivedAt, replyLine);
      } catch (error) {
        console.error(JSON.stringify({
          event: "ambient_preview_reply_failure",
          error_class: error instanceof Error && error.name ? error.name : "preview_reply_error",
        }));
      }
    }));
    const backgroundWork = Promise.all([fastPathProcessing, enqueue, passwordProcessing, previewProcessing]);
    if (ctx) ctx.waitUntil(backgroundWork);
    else await backgroundWork;
    return json({ ok: true, fastPath: fastPathEvents.length, queued: queueEvents.length, supervised: passwordEvents.length, preview: previewEvents.length });
  },

  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        if ("kind" in message.body && message.body.kind === "classify_abnormal") {
          await processAbnormalClassification(env, message.body.abnormalEventId);
        } else if ("eventId" in message.body || "event" in message.body) {
          const referencedEventId = message.body.eventId ?? (message.body.event ? eventIdFor(message.body.event) : null);
          if (!referencedEventId) throw new Error("queue_event_reference_missing");
          const receipt = await getLineEventReceipt(env.DB, referencedEventId);
          if (!receipt || receipt.payloadJson === '{"redacted":true}') throw new Error("queue_event_payload_unavailable");
          let queuedEvent: LineEvent;
          try {
            queuedEvent = message.body.event ?? JSON.parse(receipt.payloadJson) as LineEvent;
          } catch {
            throw new Error("queue_event_payload_invalid");
          }
          const eventId = referencedEventId;
          const correlationId = message.body.correlationId ?? receipt.correlationId ?? reliabilityCorrelationIdFor(queuedEvent);
          const trace: RuntimeTrace = { correlation_id: correlationId };
          await processEvent(env, queuedEvent, receipt.firstReceivedAt ?? receipt.receivedAt, replyLine, trace, correlationId, false);
          console.log(JSON.stringify({
            event: "line_event_processed",
            event_id_suffix: eventId.slice(-12),
            correlation_id_suffix: correlationId.slice(-12),
            lifecycle_status: "reply_completed",
          }));
        } else {
          throw new Error("unknown_queue_message");
        }
        message.ack();
      } catch (error) {
        const isLineEventMessage = "eventId" in message.body || "event" in message.body;
        if (isLineEventMessage) {
          const eventId = message.body.eventId ?? (message.body.event ? eventIdFor(message.body.event) : null);
          if (!eventId) {
            message.retry();
            continue;
          }
          const current = await getLineEventReceipt(env.DB, eventId).catch(() => null);
          const businessCompleted = current?.businessStatus === "completed";
          const replyKnownTerminal = ["sent", "not_required"].includes(current?.replyOutcome ?? "");
          const status = current?.lastErrorStage === "reply" || businessCompleted
            ? current?.lifecycleStatus ?? "retry_waiting"
            : await markLineEventFailure(env, eventId, "processing", error).catch(() => "retry_waiting" as const);
          console.error(JSON.stringify({
            event: "line_event_processing_failure",
            event_id_suffix: eventId.slice(-12),
            correlation_id_suffix: (message.body.correlationId ?? current?.correlationId ?? eventId).slice(-12),
            lifecycle_status: status,
            business_completed: businessCompleted,
            reply_outcome: current?.replyOutcome ?? null,
            error_class: error instanceof Error && error.name ? error.name : "processing_error",
          }));
          if (status === "retained" || businessCompleted && replyKnownTerminal) message.ack();
          else message.retry();
        } else {
          console.error("Queue message failed", error instanceof Error ? error.message : "unknown");
          message.retry();
        }
      }
    }
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    await executeScheduledJob(controller.cron, new Date(controller.scheduledTime), env);
  },
};
