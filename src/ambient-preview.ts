import { ambientPrefilter, type AmbientBufferedMessage, type AmbientEnv } from "./ambient";

export interface AmbientPreviewRow extends AmbientBufferedMessage {
  expiresAt: string;
  candidateLike: boolean;
}

export interface AmbientExpiredDiagnostic {
  id: string;
  originalEventTimestamp: string;
  expiredAt: string;
  sourceFingerprint: string;
  prefilterResult: "candidate_like" | "prefilter_excluded";
  lastFailureStage: string | null;
}

export interface AmbientPreviewResult {
  cutoffAt: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  candidateLikeCount: number;
  excludedCount: number;
  openCandidateCount: number;
  processed24hCount: number;
  expiredDiagnosticCount: number;
  expiredDiagnostics: AmbientExpiredDiagnostic[];
  rows: AmbientPreviewRow[];
}

function taipeiTimestamp(value: string): string {
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

export function formatAmbientPreviewTimestamp(value: string): string {
  return taipeiTimestamp(value);
}

export async function previewBufferedAmbientMessages(
  env: AmbientEnv,
  organizationId: string,
  groupId: string,
  cutoffAt: Date,
  page = 0,
  pageSize = 10,
): Promise<AmbientPreviewResult> {
  const cutoffIso = cutoffAt.toISOString();
  const boundedPageSize = Math.max(1, Math.min(20, Math.floor(pageSize)));
  const boundedPage = Math.max(0, Math.floor(page));
  const [rowsResult, openCandidates, processed24h, expiredDiagnosticsResult] = await Promise.all([
    env.DB.prepare(
      `SELECT id, organization_id AS organizationId, line_group_id AS lineGroupId,
              line_user_id AS lineUserId, line_message_id AS lineMessageId,
              event_timestamp AS eventTimestamp, text, digest_hour AS digestHour,
              expires_at AS expiresAt
         FROM ambient_chat_buffer
        WHERE organization_id = ? AND line_group_id = ?
          AND digest_status = 'buffered'
          AND julianday(expires_at) > julianday(?)
          AND julianday(event_timestamp) <= julianday(?)
        ORDER BY event_timestamp, id`,
    ).bind(organizationId, groupId, cutoffIso, cutoffIso).all<{
      id: string;
      organizationId: string;
      lineGroupId: string;
      lineUserId: string;
      lineMessageId: string;
      eventTimestamp: string;
      text: string;
      digestHour: string;
      expiresAt: string;
    }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count
         FROM ambient_digest_candidates
        WHERE organization_id = ? AND line_group_id = ?
          AND (status = 'pending' OR (status = 'snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= ?))`,
    ).bind(organizationId, groupId, cutoffIso).first<{ count: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count
         FROM ambient_chat_buffer
        WHERE organization_id = ? AND line_group_id = ?
          AND digest_status = 'processed'
          AND event_timestamp >= ? AND event_timestamp <= ?`,
    ).bind(organizationId, groupId, new Date(cutoffAt.getTime() - 24 * 60 * 60 * 1000).toISOString(), cutoffIso).first<{ count: number }>(),
    env.DB.prepare(
      `SELECT id, original_event_timestamp AS originalEventTimestamp,
              expired_at AS expiredAt, source_fingerprint AS sourceFingerprint,
              prefilter_result AS prefilterResult,
              last_failure_stage AS lastFailureStage
         FROM ambient_expiry_diagnostics
        WHERE organization_id = ? AND line_group_id = ?
          AND julianday(expired_at) <= julianday(?) AND julianday(retain_until) > julianday(?)
        ORDER BY expired_at DESC, id DESC
        LIMIT 50`,
    ).bind(organizationId, groupId, cutoffIso, cutoffIso).all<AmbientExpiredDiagnostic>(),
  ]);
  const rawRows = rowsResult.results.map((row) => ({ ...row, candidateLike: false }));
  const candidateLikeIds = new Set(ambientPrefilter(rawRows).map((row) => row.id));
  const classified = rawRows.map((row) => ({ ...row, candidateLike: candidateLikeIds.has(row.id) }));
  const totalPages = Math.max(1, Math.ceil(classified.length / boundedPageSize));
  const pageIndex = Math.min(boundedPage, totalPages - 1);
  return {
    cutoffAt: cutoffIso,
    page: pageIndex,
    pageSize: boundedPageSize,
    total: classified.length,
    totalPages,
    candidateLikeCount: classified.filter((row) => row.candidateLike).length,
    excludedCount: classified.filter((row) => !row.candidateLike).length,
    openCandidateCount: Number(openCandidates?.count ?? 0),
    processed24hCount: Number(processed24h?.count ?? 0),
    expiredDiagnosticCount: expiredDiagnosticsResult.results.length,
    expiredDiagnostics: expiredDiagnosticsResult.results,
    rows: classified.slice(pageIndex * boundedPageSize, (pageIndex + 1) * boundedPageSize),
  };
}

function previewRowText(row: AmbientPreviewRow): string {
  const label = row.candidateLike ? "可能與營運有關" : "目前判定與營運無關";
  const text = row.text.replace(/\s+/gu, " ").trim().slice(0, 180);
  return `${formatAmbientPreviewTimestamp(row.eventTimestamp)}｜${text}\n判定：${label}`;
}

export function formatAmbientPreview(result: AmbientPreviewResult): string {
  if (!result.total) {
    const lines = [
      "🧪 目前沒有尚待整理的群組訊息。",
      `待確認資料：${result.openCandidateCount}`,
      `最近24小時已完成整理：${result.processed24hCount}`,
    ];
    if (result.expiredDiagnostics.length) {
      lines.push("", "【⚠️ 已過期但未成功完成摘要】", ...result.expiredDiagnostics.map(formatExpiredDiagnostic));
      lines.push(`已過期但未完成：${result.expiredDiagnosticCount} 筆`);
    }
    return lines.join("\n");
  }
  const candidateRows = result.rows.filter((row) => row.candidateLike);
  const excludedRows = result.rows.filter((row) => !row.candidateLike);
  const lines = [
    "🧪 尚待整理訊息檢查",
    `範圍截止：${formatAmbientPreviewTimestamp(result.cutoffAt)}（台灣時間）`,
    `尚待整理訊息：${result.total} 筆｜第 ${result.page + 1}/${result.totalPages} 頁`,
  ];
  if (candidateRows.length) lines.push("", "【可能營運資訊】", ...candidateRows.map(previewRowText));
  if (excludedRows.length) lines.push("", "【目前判定與營運無關】", ...excludedRows.map(previewRowText));
  if (result.expiredDiagnostics.length) lines.push("", "【⚠️ 已過期但未成功完成摘要】", ...result.expiredDiagnostics.map(formatExpiredDiagnostic));
  lines.push(
    "",
    `尚待整理訊息：${result.total}`,
    `可能與營運有關：${result.candidateLikeCount}`,
    `目前判定與營運無關：${result.excludedCount}`,
    `待確認資料：${result.openCandidateCount}`,
    `最近24小時已完成整理：${result.processed24hCount}`,
    `已過期但未完成：${result.expiredDiagnosticCount}`,
    "本頁只查看，不會修改任何資料。",
  );
  return lines.join("\n");
}

function formatExpiredDiagnostic(row: AmbientExpiredDiagnostic): string {
  const shortId = row.sourceFingerprint.slice(-10);
  const failureLabel = row.lastFailureStage === "extract"
    ? "資料整理"
    : row.lastFailureStage === "resolve"
      ? "資料比對"
      : row.lastFailureStage === "reconcile"
        ? "資料確認"
        : row.lastFailureStage === "push"
          ? "回覆傳送"
          : row.lastFailureStage === "expiry_cleanup"
            ? "保存期限已到"
            : row.lastFailureStage
              ? "發生問題"
              : null;
  const failure = failureLabel ? `｜最後問題：${failureLabel}` : "";
  return `${formatAmbientPreviewTimestamp(row.originalEventTimestamp)}｜短編號：${shortId}\n判定：${row.prefilterResult === "candidate_like" ? "可能與營運有關" : "目前判定與營運無關"}${failure}`;
}
