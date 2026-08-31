import { isLocalAuditMode, localAuditRequest } from "./local-audit";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?? "";

export interface ApiError extends Error { status: number; code?: string }

export type AiFailureLayer = "context" | "provider" | "response_validation" | "persistence" | "unknown";

export interface AiFailurePresentation {
  layer: AiFailureLayer;
  label: string;
  message: string;
}

const AI_FAILURE_PRESENTATIONS: Record<string, AiFailurePresentation> = {
  ai_context_unavailable: { layer: "context", label: "分析資料讀取", message: "分析資料暫時無法讀取。" },
  ai_provider_unavailable: { layer: "provider", label: "AI 服務", message: "AI 服務暫時無法使用。" },
  ai_response_invalid: { layer: "response_validation", label: "AI 回覆格式", message: "AI 回覆格式不符合系統要求。" },
  ai_cache_unavailable: { layer: "persistence", label: "分析結果儲存", message: "分析結果暫時無法儲存。" },
  ai_report_persistence_failed: { layer: "persistence", label: "分析結果儲存", message: "分析結果暫時無法儲存。" },
  ai_analysis_unavailable: { layer: "unknown", label: "AI 分析", message: "AI 分析目前無法使用。" },
};

const AI_RESPONSE_VALIDATION_CODES = new Set([
  "ai_response_text_missing",
  "ai_response_json_extraction_failed",
  "ai_response_json_no_object_candidate",
  "ai_response_json_object_unterminated",
  "ai_response_json_object_candidate_invalid",
  "ai_response_json_object_candidate_ambiguous",
  "ai_response_schema_top_level_invalid",
  "ai_response_schema_required_field_missing",
  "ai_response_schema_field_type_invalid",
  "ai_response_schema_possible_causes_invalid",
  "ai_response_schema_evidence_enum_invalid",
  "ai_response_schema_constraint_invalid",
]);

export function aiFailurePresentation(error: unknown): AiFailurePresentation | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  const code = (error as { code?: unknown }).code;
  if (status !== 503 || typeof code !== "string") return null;
  if (AI_RESPONSE_VALIDATION_CODES.has(code)) return AI_FAILURE_PRESENTATIONS.ai_response_invalid;
  return AI_FAILURE_PRESENTATIONS[code] ?? AI_FAILURE_PRESENTATIONS.ai_analysis_unavailable;
}

export interface Farm {
  id: string; name: string; siteName: string | null; active: boolean; environment: "production" | "test";
  structureMode: "whole_farm" | "multi_house"; note: string | null; version: number;
  playerGroupEquityFraction: number; createdAt: string; updatedAt: string;
}

export interface House { id: string; farmId: string; name: string; normalizedName: string; capacity: number | null; active: boolean; note: string | null; version: number; createdAt: string; updatedAt: string; farmName?: string; farmEnvironment?: string }
export interface Flock { id: string; farmId: string; houseId: string; batchCode: string; breed: string | null; chickInDate: string; initialCount: number; expectedShipmentDate: string | null; actualShipmentDate: string | null; status: "active" | "closed" | "cancelled"; note: string | null; version: number; ageDays: number | null; shipmentReminder: string | null; farmName?: string; houseName?: string }
export interface CaretakerAssignment { id?: string; farmId: string; farmName: string; effectiveFrom: string; effectiveTo: string | null; isPrimary: boolean }
export interface Caretaker { id: string; name: string; active: boolean; note: string | null; version: number; assignments?: CaretakerAssignment[] }
export interface Dashboard { asOf: string; counts: { farms: number; productionFarms: number; testFarms: number; caretakers: number; activeFlocks: number }; stock: number; today: Record<string, number>; upcomingShipments: number; finance: { net: number }; dataHealth: { warnings: string[] } }
export interface OperationalEvent { id: string; farmId: string; farmName: string; environment: string; houseId: string | null; house: string | null; flockId: string | null; intent: string; quantity: number; unit: string; eventDate: string; note: string | null; reversedAt: string | null; reversalReason: string | null; reversalOfEventId?: string | null; correctionOfEventId?: string | null; source?: string; sourceEventId: string; createdAt: string }
export interface ChartPoint { date: string; value: number }
export interface ChartResponse { metric: string; from: string; to: string; granularity: "daily" | "weekly" | "monthly"; unit: string; definition: string; status: "ok" | "insufficient-data"; series: ChartPoint[]; denominator?: number; derived?: boolean }
export interface AbnormalEvent { id: string; farmId: string; farmName: string; environment: string; houseId: string | null; houseName: string | null; flockId: string | null; occurredAt: string | null; occurredDate: string; approximatePeriod: string | null; reportedAt: string; rawText: string; source: string; category: string | null; tags: string[]; confidence: number | null; classificationStatus: string; weatherDate: string | null; maxTemperatureC?: number | null; maxTemperatureAt?: string | null; status: string; correctionOfId: string | null; reversalOfId: string | null; reason: string | null; createdAt: string }
export interface WeatherDaily { id: string; farmId: string | null; farmName: string; environment: string; weatherScope?: string; weatherDate: string; condition: string | null; maxTemperatureC: number | null; maxTemperatureAt: string | null; minTemperatureC: number | null; minTemperatureAt: string | null; provider: string; fetchStatus: string; errorCode: string | null; fetchedAt: string | null }
export interface TimelineItem { id: string; itemType: "operational" | "abnormal"; farmId: string; farmName: string; environment: string; houseId: string | null; houseName: string | null; flockId: string | null; occurredDate: string; sortAt: string; eventType: string | null; quantity: number | null; unit: string | null; rawText: string | null; status: string; weatherCondition: string | null; maxTemperatureC: number | null; maxTemperatureAt: string | null; minTemperatureC: number | null; minTemperatureAt: string | null; weatherStatus: string | null }
export interface AnalysisReport { currentStatus: string; findings: string[]; possibleCauses: Array<{ text: string; evidence: "strong" | "medium" | "weak" }>; risks: string[]; recommendations: string[]; limitations: string[] }
export interface AnalysisResult { report: AnalysisReport; cached: boolean; contextHash: string; model: string; createdAt: string }
export interface AuditRow { id: string; source: "line" | "web" | "system" | "migration"; actorType: string; actorId: string | null; action: string; entityType: string; entityId: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; changedFields: string[]; reason: string | null; requestId: string; createdAt: string }
export interface DataHealthCheck { code: string; count: number; label: string }
export interface DataHealth { warnings: string[]; checks?: DataHealthCheck[]; checkedAt: string }
export interface FinanceData { totals: Record<string, number>; investors: Array<Record<string, unknown>>; farms: Array<Record<string, unknown>>; distributions: Array<Record<string, unknown>>; allocations: Array<Record<string, unknown>>; farmInvestorEquity: Array<Record<string, unknown>> }
export interface Alias { id: string; farmId: string; farmName: string; alias: string; normalizedAlias: string; aliasType: string; status: string; confirmationCount: number; lastConfirmedAt: string | null; createdAt: string; updatedAt: string }

export interface SystemStatus {
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
  checks: { receive: string; process: string; storage: string; reply: string };
}

export interface ReliabilityEvent {
  eventId: string;
  eventIdShort: string;
  correlationIdShort: string;
  lifecycleStatus: string;
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
  lastErrorAt: string | null;
  nextRetryAt: string | null;
  resolutionStatus: string;
  retainedAcknowledgedAt: string | null;
  retainedAcknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionReason: string | null;
  resolutionNote: string | null;
  manualRecordReference: string | null;
  payloadAvailable: boolean;
  payloadExpiresAt: string | null;
}

export interface AmbientPreviewRow {
  idShort: string;
  groupIdShort: string;
  sourceIdShort: string;
  eventTimestamp: string;
  eventTimeTaipei: string;
  expiresAt: string;
  text: string;
  candidateLike: boolean;
}

export interface AmbientExpiredDiagnostic {
  sourceIdShort: string;
  originalEventTimestamp: string;
  eventTimeTaipei: string;
  expiredAt: string;
  expiredTimeTaipei: string;
  prefilterResult: string;
  lastFailureStage: string | null;
}

export interface AmbientPreview {
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
  truncated: boolean;
  readOnly: boolean;
}

export interface PendingCandidateEntry {
  event: string;
  quantity: number | null;
  farm: string;
  house: string;
  batch: string;
  state: string;
  conflict: boolean;
  conflictText: string | null;
  blocking: boolean;
  caretakerClues: string[];
  reconciliation: string;
  evidenceCount: number;
  sourceTimestamps: string[];
}

export interface PendingCandidate {
  idShort: string;
  groupIdShort: string;
  status: string;
  hourBucket: string;
  createdTimeTaipei: string;
  expiresAt: string;
  source: string;
  sourceMessageCount: number;
  sourceIdsShort: string[];
  sourceTimestamps: string[];
  workflowHistoryAvailable: boolean;
  entries: PendingCandidateEntry[];
}

export interface TestToolsData {
  farms: Array<Record<string, unknown>>;
  houses: Array<Record<string, unknown>>;
  flocks: Array<Record<string, unknown>>;
  warning: string;
  readOnly: boolean;
}

export interface LineGroup {
  groupId: string;
  groupIdShort: string;
  status: string;
  farmName: string | null;
  farmId: string | null;
  conversationV2Enabled: boolean;
}

export interface TechnicalInfo {
  service: string;
  accountName: string;
  conversationMode: string;
  conversationModel: string;
  ambientModel: string;
  queue: { name: string; batchSize: number; timeoutSeconds: number; maxRetries: number };
  schedules: string[];
  migration: string;
  secretsIncluded: boolean;
  rawPayloadIncluded: boolean;
  note: string;
}

export function queryString(values: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export class ApiClient {
  private token: string | null = null;
  setToken(token: string | null): void { this.token = token; }
  hasToken(): boolean { return Boolean(this.token); }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (isLocalAuditMode()) return localAuditRequest<T>(path, init);
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (this.token) headers.set("authorization", `Bearer ${this.token}`);
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const error = new Error(typeof payload.message === "string" ? payload.message : "伺服器操作失敗。") as ApiError;
      error.status = response.status;
      error.code = typeof payload.error === "string" ? payload.error : undefined;
      throw error;
    }
    return payload as T;
  }
  login(password: string) { return this.request<{ authenticated: boolean; token: string; expiresAt: string; organization: { id: string; name: string } }>("/api/web/auth/login", { method: "POST", body: JSON.stringify({ password }) }); }
  session() { return this.request<{ authenticated: boolean; expiresAt?: string }>("/api/web/auth/session"); }
  logout() { return this.request<{ authenticated: boolean }>("/api/web/auth/logout", { method: "POST" }); }
  dashboard() { return this.request<Dashboard>("/api/dashboard"); }
  organizations() { return this.request<{ organizations: Array<{ id: string; name: string; active: boolean } | null> }>("/api/organizations"); }
  farms(environment?: string) { return this.request<{ farms: Farm[] }>(`/api/farms${queryString({ environment })}`); }
  createFarm(body: Record<string, unknown>) { return this.request<{ farm: Farm }>("/api/farms", { method: "POST", body: JSON.stringify(body) }); }
  updateFarm(id: string, body: Record<string, unknown>) { return this.request<{ farm: Farm }>(`/api/farms/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
  caretakers(history = false) { return this.request<{ caretakers: Caretaker[]; history: boolean }>(`/api/caretakers${history ? "?history=1" : ""}`); }
  createCaretaker(body: Record<string, unknown>) { return this.request<{ caretaker: Caretaker }>("/api/caretakers", { method: "POST", body: JSON.stringify(body) }); }
  updateCaretaker(id: string, body: Record<string, unknown>) { return this.request<{ caretaker: Caretaker }>(`/api/caretakers/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
  assignCaretaker(farmId: string, body: Record<string, unknown>) { return this.request(`/api/farms/${encodeURIComponent(farmId)}/caretakers`, { method: "POST", body: JSON.stringify(body) }); }
  houses(farmId?: string) { return this.request<{ houses: House[] }>(`/api/houses${queryString({ farmId })}`); }
  createHouse(body: Record<string, unknown>) { return this.request<{ house: House }>("/api/houses", { method: "POST", body: JSON.stringify(body) }); }
  updateHouse(id: string, body: Record<string, unknown>) { return this.request<{ house: House }>(`/api/houses/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
  flocks(farmId?: string) { return this.request<{ flocks: Flock[] }>(`/api/flocks${queryString({ farmId })}`); }
  createFlock(body: Record<string, unknown>) { return this.request<{ flock: Flock }>("/api/flocks", { method: "POST", body: JSON.stringify(body) }); }
  updateFlock(id: string, body: Record<string, unknown>) { return this.request<{ flock: Flock }>(`/api/flocks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
  events(params: Record<string, string | number | null | undefined> = {}) { return this.request<{ events: OperationalEvent[]; nextCursor: string | null }>(`/api/operational-events${queryString(params)}`); }
  createEvent(body: Record<string, unknown>) { return this.request("/api/operational-events", { method: "POST", body: JSON.stringify(body) }); }
  reverseEvent(id: string, reason?: string) { return this.request(`/api/operational-events/${encodeURIComponent(id)}/reverse`, { method: "POST", body: JSON.stringify({ reason: reason?.trim() || null }) }); }
  correctEvent(id: string, body: Record<string, unknown>) { return this.request(`/api/operational-events/${encodeURIComponent(id)}/correct`, { method: "POST", body: JSON.stringify(body) }); }
  finance() { return this.request<FinanceData>("/api/finance"); }
  chart(metric: string, filters: Record<string, string | number | null | undefined> = {}) { return this.request<ChartResponse>(`/api/charts/${encodeURIComponent(metric)}${queryString(filters)}`); }
  audit(params: Record<string, string | number | null | undefined> = {}) { return this.request<{ auditLogs: AuditRow[]; nextCursor: string | null }>(`/api/audit${queryString({ limit: 50, ...params })}`); }
  aliases() { return this.request<{ aliases: Alias[] }>("/api/farm-aliases"); }
  dataHealth() { return this.request<DataHealth>("/api/data-health"); }
  abnormalEvents(params: Record<string, string | number | null | undefined> = {}) { return this.request<{ abnormalEvents: AbnormalEvent[]; nextCursor: string | null }>(`/api/abnormal-events${queryString(params)}`); }
  createAbnormalEvent(body: Record<string, unknown>) { return this.request<{ created: boolean; id: string; rawText: string }>("/api/abnormal-events", { method: "POST", body: JSON.stringify(body) }); }
  reverseAbnormalEvent(id: string, reason?: string) { return this.request(`/api/abnormal-events/${encodeURIComponent(id)}/reverse`, { method: "POST", body: JSON.stringify({ reason: reason?.trim() || null }) }); }
  correctAbnormalEvent(id: string, body: Record<string, unknown>) { return this.request(`/api/abnormal-events/${encodeURIComponent(id)}/correct`, { method: "POST", body: JSON.stringify(body) }); }
  weather(params: Record<string, string | number | null | undefined> = {}) { return this.request<{ weather: WeatherDaily[] }>(`/api/weather${queryString(params)}`); }
  timeline(params: Record<string, string | number | null | undefined> = {}) { return this.request<{ timeline: TimelineItem[]; nextCursor: string | null }>(`/api/timeline${queryString(params)}`); }
  aiAnalyze(question: string, scope?: Record<string, string>, force = false) { return this.request<{ result: AnalysisResult; readOnly: boolean }>("/api/ai/analyze", { method: "POST", body: JSON.stringify({ question, scope, force }) }); }
  aiLiveStatus(scopeType = "organization", scopeId = "organization") { return this.request<{ context: Record<string, unknown>; aiInvoked: boolean }>(`/api/ai/live-status${queryString({ scopeType, scopeId })}`); }
  aiBrief() { return this.request<{ brief: AnalysisResult | null; liveStatus: Record<string, number>; aiInvoked: boolean }>("/api/ai/brief"); }
  systemStatus() { return this.request<{ status: SystemStatus }>("/api/system-status"); }
  reliabilityEvents() { return this.request<{ events: ReliabilityEvent[] }>("/api/reliability/events"); }
  ambientPreview(params: Record<string, string | number | null | undefined> = {}) { return this.request<AmbientPreview>(`/api/ambient/preview${queryString(params)}`); }
  pendingCandidates(params: Record<string, string | number | null | undefined> = {}) { return this.request<{ page: number; pageSize: number; total: number; totalPages: number; candidates: PendingCandidate[]; invalidCount: number; truncated: boolean; readOnly: boolean }>(`/api/pending-candidates${queryString(params)}`); }
  lineGroups() { return this.request<{ groups: LineGroup[] }>("/api/line-groups"); }
  setLineGroupAiConversation(groupId: string, enabled: boolean) { return this.request<{ ok: boolean; changed: boolean; enabled: boolean; message: string }>(`/api/line-groups/${encodeURIComponent(groupId)}/ai-conversation`, { method: "PATCH", body: JSON.stringify({ enabled }) }); }
  testTools() { return this.request<TestToolsData>("/api/test-tools"); }
  technicalInfo() { return this.request<TechnicalInfo>("/api/technical-info"); }
  recoverUnfinished() { return this.request<{ ok: boolean; message: string; result: Record<string, unknown> }>("/api/reliability/recover", { method: "POST", body: "{}" }); }
  acknowledgeRetained() { return this.request<{ ok: boolean; message: string; acknowledged: number }>("/api/reliability/acknowledge", { method: "POST", body: "{}" }); }
  recoverRetained(eventId: string) { return this.request<{ ok: boolean; message: string; result: Record<string, unknown> }>(`/api/reliability/events/${encodeURIComponent(eventId)}/recover`, { method: "POST", body: "{}" }); }
  resolveRetained(eventId: string, action: "manual_resolve" | "force_close", reason?: string, note?: string, confirm = false) { return this.request<{ ok: boolean; changed: boolean; message: string }>(`/api/reliability/events/${encodeURIComponent(eventId)}/resolve`, { method: "POST", body: JSON.stringify({ action, reason: reason?.trim() || null, note: note?.trim() || null, confirm }) }); }
  recordRetained(eventId: string, body: Record<string, unknown>) { return this.request<{ ok: boolean; changed: boolean; message: string; record: Record<string, unknown> }>(`/api/reliability/events/${encodeURIComponent(eventId)}/record`, { method: "POST", body: JSON.stringify(body) }); }
}
