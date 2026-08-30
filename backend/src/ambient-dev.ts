import { normalize } from "./core";
import {
  extractAmbientCandidates,
  runAmbientDigest,
  type AmbientDigestExecutionMode,
  type AmbientDigestRunOptions,
  type AmbientDigestRunResult,
  type AmbientEnv,
} from "./ambient";
import { parseAmbientDevSemanticSummary, type AmbientDevSemanticSummary, type AmbientDevSemanticItemSummary } from "./ambient-dev-semantic";

/**
 * Development-only command surface. The caller must have already stripped a
 * validated LINE self-mention; these values are intentionally not accepted
 * from ordinary text or fuzzy matching.
 */
export type DevelopmentAmbientCommand =
  | "help"
  | "start"
  | "lock"
  | "status"
  | "dry_run"
  | "rerun"
  | "result"
  | "full_flow"
  | "confirm_full_flow"
  | "end";

const DEVELOPMENT_COMMANDS: Readonly<Record<string, DevelopmentAmbientCommand>> = {
  "開發指令": "help",
  "開發摘要 開始": "start",
  "開發摘要 鎖定": "lock",
  "開發摘要 狀態": "status",
  "開發摘要 試跑": "dry_run",
  "開發摘要 重跑": "rerun",
  "開發摘要 結果": "result",
  "開發摘要 全流程": "full_flow",
  "確認開發摘要全流程": "confirm_full_flow",
  "開發摘要 結束": "end",
};

export function parseDevelopmentAmbientCommand(input: string): DevelopmentAmbientCommand | null {
  return DEVELOPMENT_COMMANDS[normalize(input)] ?? null;
}

export interface AmbientDevelopmentEnv extends AmbientEnv {
  DEV_COMMANDS_ENABLED?: string;
  DEV_AMBIENT_GROUP_ALLOWLIST?: string;
  DEV_AMBIENT_ACTOR_ALLOWLIST?: string;
  /** Local-only harness seam; never configured in the production manifest. */
  RUNTIME_TEST_TOKEN?: string;
  RUNTIME_DEV_AMBIENT_AI_STUB_JSON?: string;
}

export interface DevelopmentAuthorization {
  enabled: boolean;
  authorized: boolean;
  reason: "enabled" | "disabled" | "group_not_allowed" | "actor_not_allowed" | "incomplete_allowlist";
}

function allowlist(value: string | undefined): Set<string> {
  return new Set((value ?? "")
    .split(/[\s,]+/u)
    .map((entry) => entry.trim())
    .filter(Boolean));
}

export function developmentAmbientAuthorization(
  env: AmbientDevelopmentEnv,
  groupId: string | null | undefined,
  actorId: string | null | undefined,
): DevelopmentAuthorization {
  const enabled = normalize(env.DEV_COMMANDS_ENABLED ?? "").toLowerCase() === "true";
  if (!enabled) return { enabled: false, authorized: false, reason: "disabled" };
  const groups = allowlist(env.DEV_AMBIENT_GROUP_ALLOWLIST);
  const actors = allowlist(env.DEV_AMBIENT_ACTOR_ALLOWLIST);
  if (!groups.size || !actors.size) return { enabled: true, authorized: false, reason: "incomplete_allowlist" };
  if (!groupId || !groups.has(groupId)) return { enabled: true, authorized: false, reason: "group_not_allowed" };
  if (!actorId || !actors.has(actorId)) return { enabled: true, authorized: false, reason: "actor_not_allowed" };
  return { enabled: true, authorized: true, reason: "enabled" };
}

export function maskedDevelopmentReference(value: string | null | undefined): string {
  if (!value) return "未設定";
  if (value.length <= 10) return `${value.slice(0, 2)}…${value.slice(-2)}`;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

interface DevSessionRow {
  sessionId: string;
  organizationId: string;
  groupId: string;
  actorId: string;
  status: "capturing" | "locked" | "ended" | "expired";
  captureStartedAt: string;
  lockedAt: string | null;
  expiresAt: string;
  commitArmedAt: string | null;
  latestRunId: string | null;
}

interface DevCohortSourceRow {
  sourceMessageId: string;
  sourceEventTimestamp: string;
  expiresAt: string;
}

interface DevRunRow {
  runId: string;
  triggerType: "manual" | "dev_dry_run" | "dev_commit" | string;
  executionMode: AmbientDigestExecutionMode;
  sourceCount: number;
  prefilterCount: number;
  aiStatus: string;
  normalizationStatus: string;
  validationStatus: string;
  validationCount: number;
  enrichmentStatus: string;
  resolveStatus: string;
  reconcileStatus: string;
  reconcileCount: number;
  candidateWriteStatus: string;
  candidateCreatedCount: number;
  bufferConsumeStatus: string;
  processedCount: number;
  runStatus: string;
  errorStage: string | null;
  errorClass: string | null;
  firstBadSubstage: string | null;
  transportDiagnosticsJson: string | null;
  devSemanticSummaryJson: string | null;
  completedAt: string | null;
}

export interface AmbientDevelopmentCommandContext {
  organizationId: string;
  groupId: string;
  actorId: string;
  now?: Date;
  /** Optional local test seam; production development runs use the real AI binding. */
  extract?: AmbientDigestRunOptions["extract"];
}

function count(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function nowFor(context: AmbientDevelopmentCommandContext): Date {
  return context.now ?? new Date();
}

async function loadLatestSession(
  env: AmbientDevelopmentEnv,
  context: AmbientDevelopmentCommandContext,
): Promise<DevSessionRow | null> {
  const row = await env.DB.prepare(
    `SELECT session_id AS sessionId, organization_id AS organizationId,
            line_group_id AS groupId, authorized_actor_id AS actorId,
            status, capture_started_at AS captureStartedAt,
            locked_at AS lockedAt, expires_at AS expiresAt,
            commit_armed_at AS commitArmedAt, latest_run_id AS latestRunId
       FROM ambient_dev_sessions
      WHERE organization_id = ? AND line_group_id = ? AND authorized_actor_id = ?
        AND status IN ('capturing', 'locked')
      ORDER BY created_at DESC, session_id DESC LIMIT 1`,
  ).bind(context.organizationId, context.groupId, context.actorId).first<DevSessionRow>();
  if (!row) return null;
  const now = nowFor(context);
  if (Date.parse(row.expiresAt) <= now.getTime()) {
    await env.DB.prepare(
      `UPDATE ambient_dev_sessions
          SET status = 'expired', commit_armed_at = NULL, updated_at = ?
        WHERE session_id = ? AND status IN ('capturing', 'locked')`,
    ).bind(now.toISOString(), row.sessionId).run();
    return null;
  }
  return row;
}

async function countCohortSources(env: AmbientDevelopmentEnv, sessionId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM ambient_dev_cohort_sources WHERE session_id = ?`,
  ).bind(sessionId).first<{ count: number }>();
  return count(row?.count);
}

async function loadAvailableCohortSources(
  env: AmbientDevelopmentEnv,
  session: DevSessionRow,
  now: Date,
): Promise<{ expected: number; rows: DevCohortSourceRow[]; complete: boolean }> {
  const expected = await countCohortSources(env, session.sessionId);
  const rows = await env.DB.prepare(
    `SELECT c.source_message_id AS sourceMessageId,
            c.source_event_timestamp AS sourceEventTimestamp,
            b.expires_at AS expiresAt
       FROM ambient_dev_cohort_sources c
       JOIN ambient_chat_buffer b
         ON b.line_message_id = c.source_message_id
        AND b.organization_id = ?
        AND b.line_group_id = ?
      WHERE c.session_id = ?
        AND b.digest_status = 'buffered'
        AND julianday(b.expires_at) > julianday(?)
      ORDER BY c.source_event_timestamp, c.source_message_id`,
  ).bind(session.organizationId, session.groupId, session.sessionId, now.toISOString()).all<DevCohortSourceRow>();
  return { expected, rows: rows.results, complete: expected > 0 && rows.results.length === expected };
}

async function markSessionExpired(env: AmbientDevelopmentEnv, sessionId: string, now: Date): Promise<void> {
  await env.DB.prepare(
    `UPDATE ambient_dev_sessions
        SET status = 'expired', commit_armed_at = NULL, updated_at = ?
      WHERE session_id = ? AND status IN ('capturing', 'locked')`,
  ).bind(now.toISOString(), sessionId).run();
}

function expiryBoundary(session: DevSessionRow, rows: Array<{ expiresAt: string }>, now: Date): string {
  const sessionBoundary = Date.parse(session.expiresAt);
  const sourceBoundaries = rows.map((row) => Date.parse(row.expiresAt)).filter(Number.isFinite);
  const boundary = Math.min(
    Number.isFinite(sessionBoundary) ? sessionBoundary : now.getTime() + 24 * 60 * 60 * 1000,
    ...(sourceBoundaries.length ? sourceBoundaries : [now.getTime() + 24 * 60 * 60 * 1000]),
  );
  return new Date(boundary).toISOString();
}

const DEV_RUN_SELECT = `SELECT run_id AS runId,
            CASE WHEN execution_mode = 'normal' THEN trigger_type ELSE execution_mode END AS triggerType,
            execution_mode AS executionMode,
            source_count AS sourceCount, prefilter_count AS prefilterCount,
            ai_status AS aiStatus, normalization_status AS normalizationStatus,
            validation_status AS validationStatus,
            validation_count AS validationCount,
            enrichment_status AS enrichmentStatus, resolve_status AS resolveStatus,
            reconcile_status AS reconcileStatus, reconcile_count AS reconcileCount,
            candidate_write_status AS candidateWriteStatus,
            candidate_created_count AS candidateCreatedCount,
            buffer_consume_status AS bufferConsumeStatus,
            processed_count AS processedCount, run_status AS runStatus,
            error_stage AS errorStage, error_class AS errorClass,
            first_bad_substage AS firstBadSubstage,
            transport_diagnostics_json AS transportDiagnosticsJson,
            dev_semantic_summary_json AS devSemanticSummaryJson,
            completed_at AS completedAt
       FROM ambient_digest_runs`;

async function loadLatestRun(env: AmbientDevelopmentEnv, sessionId: string): Promise<DevRunRow | null> {
  return env.DB.prepare(
    `${DEV_RUN_SELECT}
      WHERE dev_session_id = ?
      ORDER BY run_started_at DESC, run_id DESC LIMIT 1`,
  ).bind(sessionId).first<DevRunRow>();
}

async function loadRunById(env: AmbientDevelopmentEnv, sessionId: string, runId: string): Promise<DevRunRow | null> {
  return env.DB.prepare(
    `${DEV_RUN_SELECT}
      WHERE dev_session_id = ? AND run_id = ? LIMIT 1`,
  ).bind(sessionId, runId).first<DevRunRow>();
}

interface SafeTransportSummary {
  maxTokens: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  issueCode: string | null;
  failureDetailClass: string | null;
  outputSizeAnomaly: boolean | null;
  selectedSourceCount: number | null;
  parsedDecisionCount: number | null;
  parsedEventDecisionCount: number | null;
  parsedSupportDecisionCount: number | null;
  parsedIgnoreDecisionCount: number | null;
  accountedSelectedSourceCount: number | null;
  unaccountedSelectedSourceCount: number | null;
  ignoredSelectedSourceCount: number | null;
  supportingSourceCount: number | null;
  unaccountedSourceOrdinals: string[];
  parseErrorCode: string | null;
  parseErrorOffsetBucket: string | null;
  nearErrorCharClass: string | null;
  braceBalance: number | null;
  bracketBalance: number | null;
  braceMinBalance: number | null;
  bracketMinBalance: number | null;
  stringStateClosed: boolean | null;
  escapePendingAtEnd: boolean | null;
  newlineCount: number | null;
  colonCount: number | null;
  commaCount: number | null;
  doubleQuoteCount: number | null;
  firstNonWhitespaceClass: string | null;
  lastNonWhitespaceClass: string | null;
  markdownFenceOpenCount: number | null;
  markdownFenceCloseCount: number | null;
  hasUnbalancedBraces: boolean | null;
  hasUnbalancedBrackets: boolean | null;
  endsInsideString: boolean | null;
  endsAfterEscape: boolean | null;
  possibleTrailingCommaBeforeClose: boolean | null;
}

const JSON_PARSE_ERROR_CODES = new Set([
  "UNEXPECTED_END",
  "UNEXPECTED_TOKEN",
  "EXPECTED_PROPERTY_NAME",
  "EXPECTED_COLON",
  "EXPECTED_COMMA_OR_END",
  "INVALID_ESCAPE",
  "INVALID_NUMBER",
  "INVALID_LITERAL",
  "CONTROL_CHARACTER",
  "OTHER_JSON_SYNTAX_ERROR",
]);
const JSON_CHARACTER_CLASSES = new Set([
  "quote",
  "colon",
  "comma",
  "brace_open",
  "brace_close",
  "bracket_open",
  "bracket_close",
  "backslash",
  "letter",
  "digit",
  "whitespace",
  "other",
  "end_of_input",
]);
const JSON_OFFSET_BUCKETS = new Set(["0-99", "100-199", "200-399", "400-799", "800+"]);

function emptySafeTransportSummary(): SafeTransportSummary {
  return {
    maxTokens: null,
    promptTokens: null,
    completionTokens: null,
    issueCode: null,
    failureDetailClass: null,
    outputSizeAnomaly: null,
    selectedSourceCount: null,
    parsedDecisionCount: null,
    parsedEventDecisionCount: null,
    parsedSupportDecisionCount: null,
    parsedIgnoreDecisionCount: null,
    accountedSelectedSourceCount: null,
    unaccountedSelectedSourceCount: null,
    ignoredSelectedSourceCount: null,
    supportingSourceCount: null,
    unaccountedSourceOrdinals: [],
    parseErrorCode: null,
    parseErrorOffsetBucket: null,
    nearErrorCharClass: null,
    braceBalance: null,
    bracketBalance: null,
    braceMinBalance: null,
    bracketMinBalance: null,
    stringStateClosed: null,
    escapePendingAtEnd: null,
    newlineCount: null,
    colonCount: null,
    commaCount: null,
    doubleQuoteCount: null,
    firstNonWhitespaceClass: null,
    lastNonWhitespaceClass: null,
    markdownFenceOpenCount: null,
    markdownFenceCloseCount: null,
    hasUnbalancedBraces: null,
    hasUnbalancedBrackets: null,
    endsInsideString: null,
    endsAfterEscape: null,
    possibleTrailingCommaBeforeClose: null,
  };
}

function safeTransportSummary(json: string | null): SafeTransportSummary {
  if (!json) return emptySafeTransportSummary();
  try {
    const value = JSON.parse(json) as Record<string, unknown>;
    const numberOrNull = (candidate: unknown): number | null => typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
    const allowlistedString = (candidate: unknown, allowed: Set<string>): string | null => typeof candidate === "string" && allowed.has(candidate) ? candidate : null;
    const booleanOrNull = (candidate: unknown): boolean | null => typeof candidate === "boolean" ? candidate : null;
    const syntax = typeof value.json_syntax === "object" && value.json_syntax !== null && !Array.isArray(value.json_syntax)
      ? value.json_syntax as Record<string, unknown>
      : {};
    return {
      maxTokens: numberOrNull(value.requested_max_tokens),
      promptTokens: numberOrNull(value.usage_prompt_tokens),
      completionTokens: numberOrNull(value.usage_completion_tokens),
      issueCode: typeof value.issue_code === "string" ? value.issue_code.slice(0, 64) : null,
      failureDetailClass: value.failure_detail_class === "json_parse_invalid" ? "json_parse_invalid" : null,
      outputSizeAnomaly: typeof value.output_size_anomaly === "boolean" ? value.output_size_anomaly : null,
      selectedSourceCount: numberOrNull(value.selected_source_count),
      parsedDecisionCount: numberOrNull(value.parsed_decision_count),
      parsedEventDecisionCount: numberOrNull(value.parsed_event_decision_count),
      parsedSupportDecisionCount: numberOrNull(value.parsed_support_decision_count),
      parsedIgnoreDecisionCount: numberOrNull(value.parsed_ignore_decision_count),
      accountedSelectedSourceCount: numberOrNull(value.accounted_selected_source_count),
      unaccountedSelectedSourceCount: numberOrNull(value.unaccounted_selected_source_count),
      ignoredSelectedSourceCount: numberOrNull(value.ignored_selected_source_count),
      supportingSourceCount: numberOrNull(value.supporting_source_count),
      unaccountedSourceOrdinals: Array.isArray(value.unaccounted_source_ordinals)
        ? value.unaccounted_source_ordinals.filter((item): item is string => typeof item === "string").slice(0, 16)
        : [],
      parseErrorCode: allowlistedString(syntax.parseErrorCode, JSON_PARSE_ERROR_CODES),
      parseErrorOffsetBucket: allowlistedString(syntax.parseErrorOffsetBucket, JSON_OFFSET_BUCKETS),
      nearErrorCharClass: allowlistedString(syntax.nearErrorCharClass, JSON_CHARACTER_CLASSES),
      braceBalance: numberOrNull(syntax.braceBalance),
      bracketBalance: numberOrNull(syntax.bracketBalance),
      braceMinBalance: numberOrNull(syntax.braceMinBalance),
      bracketMinBalance: numberOrNull(syntax.bracketMinBalance),
      stringStateClosed: booleanOrNull(syntax.stringStateClosed),
      escapePendingAtEnd: booleanOrNull(syntax.escapePendingAtEnd),
      newlineCount: numberOrNull(syntax.newlineCount),
      colonCount: numberOrNull(syntax.colonCount),
      commaCount: numberOrNull(syntax.commaCount),
      doubleQuoteCount: numberOrNull(syntax.doubleQuoteCount),
      firstNonWhitespaceClass: allowlistedString(syntax.firstNonWhitespaceClass, JSON_CHARACTER_CLASSES),
      lastNonWhitespaceClass: allowlistedString(syntax.lastNonWhitespaceClass, JSON_CHARACTER_CLASSES),
      markdownFenceOpenCount: numberOrNull(syntax.markdownFenceOpenCount),
      markdownFenceCloseCount: numberOrNull(syntax.markdownFenceCloseCount),
      hasUnbalancedBraces: booleanOrNull(syntax.hasUnbalancedBraces),
      hasUnbalancedBrackets: booleanOrNull(syntax.hasUnbalancedBrackets),
      endsInsideString: booleanOrNull(syntax.endsInsideString),
      endsAfterEscape: booleanOrNull(syntax.endsAfterEscape),
      possibleTrailingCommaBeforeClose: booleanOrNull(syntax.possibleTrailingCommaBeforeClose),
    };
  } catch {
    return emptySafeTransportSummary();
  }
}

function semanticTypeLabel(value: AmbientDevSemanticItemSummary["eventType"]): string {
  return value === "mortality" ? "死亡" : value === "cull" ? "淘汰" : "異常";
}

function semanticReconcileLabel(value: AmbientDevSemanticItemSummary["reconcileState"]): string {
  if (value === "not_recorded") return "未記錄";
  if (value === "possibly_recorded") return "可能已記錄";
  if (value === "already_recorded") return "已記錄";
  if (value === "not_available") return "未判定";
  return value;
}

const JSON_SYNTAX_LABELS: Readonly<Record<string, string>> = {
  UNEXPECTED_END: "JSON內容提早結束",
  UNEXPECTED_TOKEN: "JSON出現不預期符號",
  EXPECTED_PROPERTY_NAME: "JSON欄位名稱格式錯誤",
  EXPECTED_COLON: "JSON欄位後缺少冒號",
  EXPECTED_COMMA_OR_END: "JSON欄位或陣列分隔格式錯誤",
  INVALID_ESCAPE: "JSON字串跳脫格式錯誤",
  INVALID_NUMBER: "JSON數字格式錯誤",
  INVALID_LITERAL: "JSON常值格式錯誤",
  CONTROL_CHARACTER: "JSON字串含控制字元",
  OTHER_JSON_SYNTAX_ERROR: "JSON語法錯誤（未分類）",
};

function jsonSyntaxLabel(code: string | null): string {
  return code ? JSON_SYNTAX_LABELS[code] ?? "JSON語法錯誤（未分類）" : "JSON語法錯誤（未取得細分類）";
}

function formatJsonSyntaxDiagnostics(transport: SafeTransportSummary): string[] {
  if (transport.issueCode !== "JSON_PARSE_FAILED") return [];
  const syntax = [
    `JSON語法診斷：${jsonSyntaxLabel(transport.parseErrorCode)}｜位置區段：${transport.parseErrorOffsetBucket ?? "未取得"}｜鄰近字元類型：${transport.nearErrorCharClass ?? "未取得"}`,
    `JSON結構診斷：大括號平衡=${transport.braceBalance ?? "未記錄"}（最小=${transport.braceMinBalance ?? "未記錄"}）｜方括號平衡=${transport.bracketBalance ?? "未記錄"}（最小=${transport.bracketMinBalance ?? "未記錄"}）｜字串已閉合=${transport.stringStateClosed === null ? "未記錄" : transport.stringStateClosed ? "是" : "否"}｜結尾跳脫=${transport.escapePendingAtEnd === null ? "未記錄" : transport.escapePendingAtEnd ? "是" : "否"}`,
    `JSON掃描計數：換行=${transport.newlineCount ?? "未記錄"}｜冒號=${transport.colonCount ?? "未記錄"}｜逗號=${transport.commaCount ?? "未記錄"}｜雙引號=${transport.doubleQuoteCount ?? "未記錄"}｜Fence=${transport.markdownFenceOpenCount ?? "未記錄"}/${transport.markdownFenceCloseCount ?? "未記錄"}`,
  ];
  return syntax;
}

function formatSemanticItems(summary: AmbientDevSemanticSummary): string[] {
  if (!summary.candidates.length) return ["【辨識內容】\n目前沒有可顯示的候選項目。"];
  const lines = ["【辨識內容】"];
  for (const candidate of summary.candidates) {
    const candidateSources = candidate.sourceRefs.length ? candidate.sourceRefs.join("、") : "未細分";
    lines.push(`候選 ${candidate.candidateOrdinal}｜來源 ${candidateSources}｜整理：${semanticReconcileLabel(candidate.reconcileState)}`);
    for (const item of candidate.items) {
      const quantity = item.quantity === null ? "數量未確認" : `${item.quantity}隻`;
      const itemSources = item.sourceRefs.length ? `｜來源 ${item.sourceRefs.join("、")}` : "";
      lines.push(`${item.itemOrdinal}. ${semanticTypeLabel(item.eventType)}｜${quantity}${itemSources}｜信心 ${item.confidence}`);
    }
  }
  lines.push(`合併狀態：${summary.duplicateCollapseCount === null ? "未判定" : `已合併 ${summary.duplicateCollapseCount} 項`}`);
  return lines;
}

function formatDecisionSummary(summary: AmbientDevSemanticSummary): string[] {
  if (!summary.decisions?.length) return ["【來源決策】\n目前沒有可顯示的來源決策。"];
  const lines = ["【來源決策】"];
  for (const decision of summary.decisions) {
    const target = decision.kind === "support" && decision.targetRef ? `→${decision.targetRef}` : "";
    lines.push(`${decision.sourceRef} → ${decision.kind}${target}`);
  }
  return lines;
}

function formatRunResult(row: DevRunRow | null): string {
  if (!row) return "🧪 目前還沒有開發摘要試跑結果。";
  const transport = safeTransportSummary(row.transportDiagnosticsJson);
  const semantic = parseAmbientDevSemanticSummary(row.devSemanticSummaryJson);
  const firstBadStage = row.errorStage ?? "無";
  const firstBadSubstage = row.firstBadSubstage ?? "無";
  const error = row.errorClass ? `\n錯誤：${row.errorClass}` : "";
  const failureDetail = transport.failureDetailClass ? `\n錯誤細節：${transport.failureDetailClass}` : "";
  const candidateWrite = row.executionMode === "dev_dry_run" ? "未執行（試跑模式）" : row.candidateWriteStatus;
  const consume = row.executionMode === "dev_dry_run" ? "未執行（試跑模式）" : row.bufferConsumeStatus;
  const selectedSourceCount = semantic?.selectedSourceCount ?? transport.selectedSourceCount;
  const decisionCount = semantic?.decisions?.length ?? transport.parsedDecisionCount;
  const eventDecisionCount = semantic
    ? semantic.decisions?.filter((decision) => decision.kind === "event").length ?? 0
    : transport.parsedEventDecisionCount;
  const supportDecisionCount = semantic
    ? semantic.decisions?.filter((decision) => decision.kind === "support").length ?? 0
    : transport.parsedSupportDecisionCount;
  const ignoreDecisionCount = semantic
    ? semantic.decisions?.filter((decision) => decision.kind === "ignore").length ?? 0
    : transport.parsedIgnoreDecisionCount;
  const resultLines = [
    "🧪 開發摘要結果",
    `執行識別：${maskedDevelopmentReference(row.runId)}`,
    `觸發：${row.triggerType}`,
    `來源：${row.sourceCount}｜預篩後：${row.prefilterCount}`,
    `AI：${row.aiStatus}｜JSON：${transport.issueCode === "JSON_PARSE_FAILED" ? "失敗" : row.aiStatus === "success" ? "通過／已解析" : row.validationStatus}`,
    ...formatJsonSyntaxDiagnostics(transport),
    `Normalization：${row.normalizationStatus}｜Validation：${row.validationStatus}`,
    `Enrichment：${row.enrichmentStatus}｜Resolve：${row.resolveStatus}`,
    `Reconcile：${row.reconcileStatus}｜Candidate Write：${candidateWrite}`,
    `Buffer Consume：${consume}｜處理來源：${row.processedCount}`,
    `第一個問題：stage=${firstBadStage}｜substage=${firstBadSubstage}${error}${failureDetail}`,
    `輸出量：${transport.completionTokens ?? "未記錄"} / ${transport.maxTokens ?? "未記錄"} tokens`,
    `輸出大小異常：${transport.outputSizeAnomaly === null ? "未記錄" : transport.outputSizeAnomaly ? "是（僅診斷）" : "否"}`,
    `AI候選：${semantic?.extractedCandidateCount ?? "未記錄"}`,
    `驗證後：${semantic?.validatedCandidateCount ?? row.validationCount}`,
    `整理後：${semantic?.reconciledCandidateCount ?? row.reconcileCount}`,
    `辨識項目：${semantic?.itemCount ?? "未記錄"}`,
    `可處理：${semantic?.readyCandidateCount === null ? "不適用" : semantic?.readyCandidateCount ?? "未記錄"}`,
    `正式寫入：${semantic?.committedCandidateCount ?? row.candidateCreatedCount}${row.executionMode === "dev_dry_run" ? "（試跑模式）" : ""}`,
    `來源決策：${semantic?.decisions?.length ?? "未記錄"}`,
    `決策覆蓋：${decisionCount ?? "未記錄"}/${selectedSourceCount ?? "未記錄"}`,
    `決策類型：event ${eventDecisionCount ?? "未記錄"}｜support ${supportDecisionCount ?? "未記錄"}｜ignore ${ignoreDecisionCount ?? "未記錄"}`,
    `來源覆蓋：${semantic?.accountedSelectedSourceCount ?? transport.accountedSelectedSourceCount ?? "未記錄"}/${selectedSourceCount ?? "未記錄"}`,
    `未處理 selected：${semantic?.unaccountedSelectedSourceCount ?? transport.unaccountedSelectedSourceCount ?? "未記錄"}${transport.unaccountedSourceOrdinals.length ? `（來源 ${transport.unaccountedSourceOrdinals.join("、")}）` : ""}`,
    `忽略 selected：${semantic?.ignoredSelectedSourceCount ?? transport.ignoredSelectedSourceCount ?? "未記錄"}`,
    `支援來源：${semantic?.supportingSourceCount ?? transport.supportingSourceCount ?? "未記錄"}`,
    `Run：${row.runStatus}`,
    "本開發流程不建立正式營運紀錄。",
  ];
  if (semantic) resultLines.push(...formatDecisionSummary(semantic), ...formatSemanticItems(semantic));
  else resultLines.push("【辨識內容】\n語意快照尚未保存；請重新執行開發摘要試跑。\n合併狀態：未判定");
  return resultLines.join("\n");
}

function formatRerunSummary(row: DevRunRow | null): string {
  if (!row) return "⚠️ 開發摘要重跑未留下可查詢結果；來源仍保留，請查看「開發摘要 結果」。";
  const transport = safeTransportSummary(row.transportDiagnosticsJson);
  const semantic = parseAmbientDevSemanticSummary(row.devSemanticSummaryJson);
  const succeeded = row.runStatus === "completed" && !row.errorStage;
  const problem = transport.issueCode === "JSON_PARSE_FAILED"
    ? `JSON格式（${jsonSyntaxLabel(transport.parseErrorCode)}）`
    : row.errorStage
      ? `${row.errorStage}${row.firstBadSubstage ? `/${row.firstBadSubstage}` : ""}`
      : "無";
  const lines = [
    "🧪 開發摘要重跑完成",
    `執行識別：${maskedDevelopmentReference(row.runId)}`,
    `結果：${succeeded ? "成功" : "失敗"}`,
    `來源：${row.sourceCount}｜預篩後：${row.prefilterCount}`,
    `第一個問題：${problem}`,
    `輸出量：${transport.completionTokens ?? "未記錄"} / ${transport.maxTokens ?? "未記錄"} tokens`,
  ];
  if (succeeded && semantic) {
    lines.push(`辨識項目：${semantic.itemCount}｜來源覆蓋：${semantic.accountedSelectedSourceCount ?? "未記錄"}/${semantic.selectedSourceCount ?? "未記錄"}`);
  }
  lines.push(
    "沒有建立候選、沒有消耗訊息、沒有寫入正式資料。",
    "查看完整診斷：@Bot 開發摘要 結果",
  );
  return lines.join("\n");
}

async function createSession(
  env: AmbientDevelopmentEnv,
  context: AmbientDevelopmentCommandContext,
): Promise<string> {
  const now = nowFor(context);
  const sessionId = `ambient-dev-${crypto.randomUUID()}`;
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO ambient_dev_sessions
      (session_id, organization_id, line_group_id, authorized_actor_id,
       status, capture_started_at, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'capturing', ?, ?, ?, ?)`,
  ).bind(sessionId, context.organizationId, context.groupId, context.actorId, now.toISOString(), expiresAt, now.toISOString(), now.toISOString()).run();
  return sessionId;
}

async function lockSession(
  env: AmbientDevelopmentEnv,
  context: AmbientDevelopmentCommandContext,
  session: DevSessionRow,
): Promise<string> {
  const now = nowFor(context);
  const rows = await env.DB.prepare(
    `SELECT line_message_id AS sourceMessageId,
            event_timestamp AS sourceEventTimestamp, expires_at AS expiresAt
       FROM ambient_chat_buffer
      WHERE organization_id = ? AND line_group_id = ?
        AND digest_status = 'buffered'
        AND event_timestamp >= ? AND event_timestamp <= ?
        AND julianday(expires_at) > julianday(?)
      ORDER BY event_timestamp, id`,
  ).bind(context.organizationId, context.groupId, session.captureStartedAt, now.toISOString(), now.toISOString()).all<DevCohortSourceRow>();
  if (!rows.results.length) return "🧪 目前沒有可鎖定的測試訊息；來源沒有被修改。";
  const inserts = rows.results.map((row) => env.DB.prepare(
    `INSERT OR IGNORE INTO ambient_dev_cohort_sources
      (session_id, source_message_id, source_event_timestamp)
     VALUES (?, ?, ?)`,
  ).bind(session.sessionId, row.sourceMessageId, row.sourceEventTimestamp));
  await env.DB.batch(inserts);
  const expiresAt = expiryBoundary(session, rows.results, now);
  await env.DB.prepare(
    `UPDATE ambient_dev_sessions
        SET status = 'locked', locked_at = ?, expires_at = ?, updated_at = ?
      WHERE session_id = ? AND status = 'capturing'`,
  ).bind(now.toISOString(), expiresAt, now.toISOString(), session.sessionId).run();
  return `🧪 已鎖定 ${rows.results.length} 則測試訊息。\n這批訊息之後可以反覆試跑，直到來源正常過期或你結束測試。`;
}

async function runLockedCohort(
  env: AmbientDevelopmentEnv,
  context: AmbientDevelopmentCommandContext,
  session: DevSessionRow,
  executionMode: "dev_dry_run" | "dev_commit",
  responseStyle: "full" | "short" = "full",
): Promise<string> {
  const now = nowFor(context);
  const cohort = await loadAvailableCohortSources(env, session, now);
  if (!cohort.complete) {
    await markSessionExpired(env, session.sessionId, now);
    return "⚠️ 這批測試資料已過期或不再完整，請重新開始一批新的測試。";
  }
  const sourceMessageIds = cohort.rows.map((row) => row.sourceMessageId);
  let result: AmbientDigestRunResult;
  try {
    result = await runAmbientDigest(env, {
      trigger: "manual",
      executionMode,
      devSessionId: session.sessionId,
      sourceMessageIds,
      now,
      cutoffAt: now,
      targetGroupId: context.groupId,
      targetOrganizationId: context.organizationId,
      extract: context.extract ?? ((ambientEnv, messages) => extractAmbientCandidates(ambientEnv, messages)),
    });
  } catch {
    return "⚠️ 開發摘要執行發生技術錯誤；來源仍保留，請稍後查看「開發摘要 結果」。";
  }
  const row = await loadRunById(env, session.sessionId, result.runId) ?? await loadLatestRun(env, session.sessionId);
  await env.DB.prepare(
    `UPDATE ambient_dev_sessions SET latest_run_id = ?, updated_at = ? WHERE session_id = ?`,
  ).bind(row?.runId ?? result.runId, now.toISOString(), session.sessionId).run();
  return responseStyle === "short" ? formatRerunSummary(row) : formatRunResult(row);
}

function formatStatus(session: DevSessionRow, expected: number, available: number, row: DevRunRow | null): string {
  const transport = safeTransportSummary(row?.transportDiagnosticsJson ?? null);
  const semantic = parseAmbientDevSemanticSummary(row?.devSemanticSummaryJson ?? null);
  return [
    "🧪 開發摘要狀態",
    `Session：${maskedDevelopmentReference(session.sessionId)}`,
    `狀態：${session.status}`,
    `已鎖定來源：${expected}｜目前可用：${available}`,
    `最新 Run：${maskedDevelopmentReference(row?.runId ?? session.latestRunId)}`,
    `觸發：${row?.triggerType ?? "尚無"}`,
    `最新狀態：${row?.runStatus ?? "尚無試跑"}`,
    `第一個問題：stage=${row?.errorStage ?? "無"}｜substage=${row?.firstBadSubstage ?? "無"}`,
    `階段：${row ? `Normalization=${row.normalizationStatus}｜Enrichment=${row.enrichmentStatus}｜Resolve=${row.resolveStatus}｜Reconcile=${row.reconcileStatus}` : "尚無"}`,
    `Token：${transport.completionTokens ?? "未記錄"} / ${transport.maxTokens ?? "未記錄"}`,
    `語意快照：${semantic ? "已保存" : "未保存"}`,
    `AI候選：${semantic?.extractedCandidateCount ?? "未記錄"}｜正式寫入：${semantic?.committedCandidateCount ?? row?.candidateCreatedCount ?? 0}`,
    `來源覆蓋：${semantic?.accountedSelectedSourceCount ?? transport.accountedSelectedSourceCount ?? "未記錄"}/${semantic?.selectedSourceCount ?? transport.selectedSourceCount ?? "未記錄"}`,
    `處理來源：${row?.processedCount ?? 0}`,
  ].join("\n");
}

async function statusCommand(env: AmbientDevelopmentEnv, context: AmbientDevelopmentCommandContext, session: DevSessionRow | null): Promise<string> {
  if (!session) return "🧪 目前沒有進行中的開發摘要測試。";
  const cohort = await loadAvailableCohortSources(env, session, nowFor(context));
  return formatStatus(session, cohort.expected, cohort.rows.length, await loadLatestRun(env, session.sessionId));
}

async function armFullFlow(env: AmbientDevelopmentEnv, context: AmbientDevelopmentCommandContext, session: DevSessionRow): Promise<string> {
  const latest = await loadLatestRun(env, session.sessionId);
  if (!latest || latest.executionMode !== "dev_dry_run" || latest.runStatus !== "completed" || !["success", "empty"].includes(latest.reconcileStatus) || latest.errorStage) {
    return "⚠️ 必須先完成成功的「開發摘要 試跑」，確認 Reconcile 通過後，才能進入全流程。";
  }
  const now = nowFor(context);
  await env.DB.prepare(
    `UPDATE ambient_dev_sessions SET commit_armed_at = ?, updated_at = ? WHERE session_id = ? AND status = 'locked'`,
  ).bind(now.toISOString(), now.toISOString(), session.sessionId).run();
  return "⚠️ 這會真正建立待確認候選，並把成功處理的測試訊息標成已處理。\n不會建立正式營運紀錄。\n\n若要繼續，請輸入：\n@Bot 確認開發摘要全流程";
}

async function confirmFullFlow(env: AmbientDevelopmentEnv, context: AmbientDevelopmentCommandContext, session: DevSessionRow): Promise<string> {
  const now = nowFor(context);
  const armedAt = session.commitArmedAt ? Date.parse(session.commitArmedAt) : NaN;
  if (!Number.isFinite(armedAt) || now.getTime() - armedAt > 10 * 60 * 1000) {
    return "⚠️ 全流程確認已逾時；請先重新完成「開發摘要 全流程」。";
  }
  await env.DB.prepare(
    `UPDATE ambient_dev_sessions SET commit_armed_at = NULL, updated_at = ? WHERE session_id = ?`,
  ).bind(now.toISOString(), session.sessionId).run();
  return runLockedCohort(env, context, session, "dev_commit");
}

export async function handleDevelopmentAmbientCommand(
  env: AmbientDevelopmentEnv,
  context: AmbientDevelopmentCommandContext,
  command: DevelopmentAmbientCommand,
): Promise<string> {
  if (command === "help") {
    return [
      "🧪 開發摘要指令",
      "開發摘要 開始：開始捕捉新的測試批次",
      "開發摘要 鎖定：鎖定目前測試訊息",
      "開發摘要 狀態：查看批次與最新狀態",
      "開發摘要 試跑：執行不寫入的完整前段流程",
      "開發摘要 重跑：用同一批 source 再試跑",
      "開發摘要 結果：查看最新 bounded 結果",
      "開發摘要 全流程：準備建立待確認候選",
      "確認開發摘要全流程：第二次明確確認後才寫入候選並消耗成功來源",
      "開發摘要 結束：結束本次測試",
    ].join("\n");
  }

  const session = await loadLatestSession(env, context);
  if (command === "start") {
    if (session) return `🧪 已有進行中的開發摘要測試（${session.status}）；請先鎖定、重跑或結束。`;
    const sessionId = await createSession(env, context);
    return `🧪 開發摘要測試已開始。\n現在請傳送測試訊息；傳完後輸入：\n@Bot 開發摘要 鎖定\n\n測試識別：${maskedDevelopmentReference(sessionId)}`;
  }
  if (command === "lock") {
    if (!session) return "⚠️ 目前沒有可鎖定的開發摘要測試，請先輸入「開發摘要 開始」。";
    if (session.status !== "capturing") return "🧪 這批測試訊息已經鎖定，可以輸入「開發摘要 試跑」。";
    return lockSession(env, context, session);
  }
  if (command === "status") return statusCommand(env, context, session);
  if (command === "end") {
    if (!session) return "🧪 目前沒有進行中的開發摘要測試。";
    await env.DB.prepare(
      `UPDATE ambient_dev_sessions SET status = 'ended', commit_armed_at = NULL, updated_at = ? WHERE session_id = ? AND status IN ('capturing', 'locked')`,
    ).bind(nowFor(context).toISOString(), session.sessionId).run();
    return "🧪 開發摘要測試已結束；未刪除正式資料，也未恢復或消耗未處理來源。";
  }
  if (command === "result") return formatRunResult(session ? await loadLatestRun(env, session.sessionId) : null);
  if (command === "dry_run" || command === "rerun") {
    if (!session || session.status !== "locked") return "⚠️ 請先開始並鎖定一批測試訊息。";
    return runLockedCohort(env, context, session, "dev_dry_run", command === "rerun" ? "short" : "full");
  }
  if (command === "full_flow") {
    if (!session || session.status !== "locked") return "⚠️ 請先開始並鎖定一批測試訊息。";
    return armFullFlow(env, context, session);
  }
  if (command === "confirm_full_flow") {
    if (!session || session.status !== "locked") return "⚠️ 目前沒有可確認的開發摘要批次。";
    return confirmFullFlow(env, context, session);
  }
  return "⚠️ 無法辨識開發摘要指令。";
}
