import { extractJsonValue, aiResponseText } from "./ai-json";
import { PRODUCTION_AI_MODEL } from "./analysis";
import { parseCandidateRepairIntent, type CandidateRepairField, type CandidateRepairIntent } from "./candidate-workflow";
import type { AmbientCandidateConflictEvidence, AmbientCandidateEvidence } from "./ambient";

export type ConversationV2Goal =
  | "EXPLAIN"
  | "QUERY"
  | "SHOW_STATE"
  | "ADVISE"
  | "REPAIR"
  | "RECORD"
  | "CANCEL"
  | "CONFIRM"
  | "NAVIGATE"
  | "CLARIFY"
  | "HELP"
  | "COMPARE"
  | "ANALYZE";

export type ConversationV2Target =
  | "candidate"
  | "open_candidates"
  | "caretaker_farms"
  | "farm_caretakers"
  | "farm"
  | "operational_event"
  | "abnormal_event"
  | "pending_action"
  | "query_result"
  | "daily_review"
  | "current_context"
  | "none";

export type ConversationV2Topic =
  | "caretaker_conflict"
  | "candidate_conflict"
  | "candidate_consequence"
  | "candidate_state"
  | "candidate_blockers"
  | "candidate_cancel"
  | "candidate_farm"
  | "candidate_quantity"
  | "caretaker_farms"
  | "farm_caretakers"
  | "open_candidates"
  | "today_attention"
  | "today_mortality"
  | "today_abnormal"
  | "recent_event"
  | "event_abnormality"
  | "pending_status"
  | "meta_conversation"
  | "capability"
  | "advice_options"
  | "unknown";

export type ConversationV2OutcomeKind =
  | "rendered"
  | "clarified"
  | "no_data"
  | "refused"
  | "business_handoff"
  | "deterministic_handoff"
  | "safe_unknown_fallback";

export type ConversationAnswerMode =
  | "default"
  | "examples"
  | "summary"
  | "comparison"
  | "consequence"
  | "options"
  | "capability"
  | "capability_limits";

/**
 * The renderer is the final owner of answer shape. A model or deterministic
 * plan may start with a default contract and still select a bounded renderer
 * such as the class-level advice response. Keep the durable trace aligned
 * with that final, user-visible semantic contract.
 */
export function finalConversationAnswerModeForRenderer(input: {
  renderer?: string | null;
  rendererVariant?: string | null;
  fallbackMode: ConversationAnswerMode;
}): ConversationAnswerMode {
  const renderer = input.renderer ?? "";
  const variant = input.rendererVariant ?? "";

  if (renderer === "renderPendingAdvice" || renderer === "conversationV2AdviceReply"
    || variant === "options" || variant === "class_options_subject_exists" || variant === "class_options_no_subject") {
    return "options";
  }
  if (renderer === "renderCandidateClassConsequence"
    || variant === "consequence" || variant === "class_consequence") {
    return "consequence";
  }
  if (renderer === "renderTodayAttentionSummary" || variant === "today_attention") return "summary";
  if (renderer === "renderConversationV2Capability") {
    if (variant === "capability_examples") return "examples";
    if (variant === "capability_limits") return "capability_limits";
    return "capability";
  }
  return input.fallbackMode;
}

export interface ConversationAnswerContract {
  mode: ConversationAnswerMode;
  requestedCount?: number;
  exampleCount?: number;
  capabilityCount?: number;
  limitationCount?: number;
  wantsExamples: boolean;
  wantsCapabilities: boolean;
  wantsLimitations: boolean;
  wantsSummary: boolean;
  wantsReasons: boolean;
  wantsConsequences: boolean;
  wantsOptions: boolean;
  brevity: "short" | "normal" | "detailed";
  readOnlyExplicit: boolean;
}

/**
 * Distinguishes a rule about a kind of record from a question about one
 * particular record.  This is deliberately object-agnostic so the same
 * boundary can later be used for events, farms, flocks, and corrections.
 */
export type ConversationReferenceScope = "class" | "instance" | "none";

export type ConversationReferentSource = "explicit_marker" | "active_candidate" | "memory" | "none";

export interface ConversationReferenceAnalysis {
  referenceScope: ConversationReferenceScope;
  referentRequired: boolean;
  referentResolved: boolean;
  referentSource: ConversationReferentSource;
  genericRuleUsed: boolean;
}

export type ConversationV2ToolName =
  | "get_current_candidate"
  | "get_candidate_details"
  | "get_candidate_evidence"
  | "get_candidate_conflicts"
  | "get_candidate_resolution"
  | "show_candidate"
  | "list_open_candidates"
  | "list_farms"
  | "get_farm"
  | "get_farm_houses"
  | "get_farm_flocks"
  | "get_caretaker"
  | "get_caretaker_farms"
  | "get_farm_caretakers"
  | "get_today_effective_records"
  | "get_recent_effective_records"
  | "get_today_mortality"
  | "get_today_abnormal"
  | "get_recent_operational_events"
  | "get_event_abnormality"
  | "get_pending_actions"
  | "get_conversation_context"
  | "get_daily_review"
  | "get_weather_summary"
  | "set_candidate_field"
  | "clear_candidate_field"
  | "select_candidate_entity"
  | "dismiss_candidate_clue"
  | "cancel_candidate"
  | "snooze_candidate"
  | "confirm_candidate";

export type ConversationV2ProposedAction =
  | { type: "set_field"; field: CandidateRepairField; value: string }
  | { type: "clear_field"; field: CandidateRepairField }
  | { type: "dismiss_clue"; field: "caretaker" }
  | { type: "cancel_candidate" }
  | { type: "snooze_candidate" }
  | { type: "confirm_candidate" };

export interface ConversationV2Plan {
  goal: ConversationV2Goal;
  target: ConversationV2Target;
  topic: ConversationV2Topic | null;
  requestedTools: ConversationV2ToolName[];
  proposedAction: ConversationV2ProposedAction | null;
  needsClarification: boolean;
  clarificationReason?: string;
  confidence: number;
  answerContract?: ConversationAnswerContract;
  referenceScope?: ConversationReferenceScope;
  referentRequired?: boolean;
  referentResolved?: boolean;
  referentSource?: ConversationReferentSource;
  genericRuleUsed?: boolean;
}

export interface ConversationV2Context {
  openCandidateCount: number;
  hasCurrentCandidate: boolean;
  currentCandidateId?: string | null;
  currentCandidateFarm?: string | null;
  currentCandidateHouse?: string | null;
  currentCandidateFlock?: string | null;
  currentCandidateEvent?: string | null;
  currentCandidateQuantity?: number | null;
  currentCandidateCaretaker?: string | null;
  currentCandidateConflictText?: string | null;
  currentCandidateConflictCodes?: string[];
  currentCandidateSourceEvidence?: string[];
  currentCandidateEvidence?: AmbientCandidateEvidence[];
  currentCandidateConflictEvidence?: AmbientCandidateConflictEvidence[];
  currentCandidateReconciliation?: string | null;
  currentCandidateCaretakerOverride?: "overridden" | "dismissed" | null;
  currentCandidateEnvironment?: "production" | "test" | null;
  currentCandidateState?: string | null;
  currentCandidateBlockingField?: string | null;
  activeObjectType?: ConversationObjectType | null;
  activeObjectId?: string | null;
  activeObjectSummary?: string | null;
  lastGoal?: ConversationV2Goal | null;
  lastTopic?: ConversationV2Topic | null;
  lastResponseType?: string | null;
  lastExplainedIssue?: string | null;
  lastExplainedObjectType?: ConversationObjectType | null;
  lastExplainedObjectId?: string | null;
  semanticMemory?: ConversationV2SemanticMemory | null;
}

/** Bounded semantic working memory for explicit @AI turns only. */
export interface ConversationV2SemanticMemory {
  activeObjectType?: ConversationObjectType | null;
  activeObjectId?: string | null;
  activeObjectSummary?: string | null;
  lastGoal?: ConversationV2Goal | null;
  lastTopic?: ConversationV2Topic | null;
  lastReferenceScope?: ConversationReferenceScope | null;
  lastAction?: string | null;
  lastQueryResult?: string | null;
  lastQueryResultType?: ConversationObjectType | null;
  lastReferencedObject?: string | null;
  lastReferencedObjectType?: ConversationObjectType | null;
  lastReferencedField?: string | null;
  lastExplainedIssue?: string | null;
  lastExplainedObjectType?: ConversationObjectType | null;
  lastExplainedObjectId?: string | null;
  lastConclusion?: string | null;
  lastEvidenceRefs?: string[];
  lastBlockingStatus?: "blocking" | "non_blocking" | "unknown" | null;
  lastRecommendedOptions?: string[];
  lastActionProposal?: string | null;
  lastUserExplicitDecision?: string | null;
  lastUserQuestionType?: ConversationSpeechAct | null;
  lastPendingObjectType?: ConversationObjectType | null;
  lastPendingObjectId?: string | null;
  lastAssistantResponseSummary?: string | null;
  updatedAt?: string | null;
}

/**
 * Speech acts are intentionally separate from the product goal enum. A
 * question can mention a farm, a quantity, or an event without asserting a
 * new fact. Keeping that distinction outside the record parser is the final
 * protection against turning a read into a write.
 */
export type ConversationSpeechAct =
  | "ASSERT"
  | "QUERY"
  | "EXPLAIN_REQUEST"
  | "ADVICE_REQUEST"
  | "REFERENCE"
  | "CORRECTION"
  | "CANCEL"
  | "CONFIRM"
  | "NAVIGATION"
  | "META_CONVERSATION"
  | "UNKNOWN";

export type ConversationObjectType =
  | "operational_event"
  | "abnormal_event"
  | "candidate"
  | "pending_action"
  | "farm"
  | "house"
  | "flock"
  | "daily_review"
  | "query_result"
  | "quick_record";

export interface ConversationSpeechAnalysis {
  speechAct: ConversationSpeechAct;
  recommendedGoal: ConversationV2Goal | null;
  target: ConversationV2Target;
  topic: ConversationV2Topic | null;
  objectType: ConversationObjectType | null;
  question: boolean;
  conditional: boolean;
  quoted: boolean;
  historical: boolean;
  hypothetical: boolean;
  negated: boolean;
  referential: boolean;
  safeToRecord: boolean;
  reason: string;
}

export interface ConversationV2AiResult {
  attempted: boolean;
  plan: ConversationV2Plan | null;
  validation: "not_invoked" | "schema_valid" | "schema_invalid" | "ai_error";
  errorClass?: string;
}

export const CONVERSATION_V2_TOOL_ALLOWLIST = {
  read: [
    "get_current_candidate",
    "get_candidate_details",
    "get_candidate_evidence",
    "get_candidate_conflicts",
    "get_candidate_resolution",
    "show_candidate",
    "list_open_candidates",
    "list_farms",
    "get_farm",
    "get_farm_houses",
    "get_farm_flocks",
    "get_caretaker",
    "get_caretaker_farms",
    "get_farm_caretakers",
    "get_today_effective_records",
    "get_recent_effective_records",
    "get_today_mortality",
    "get_today_abnormal",
    "get_recent_operational_events",
    "get_event_abnormality",
    "get_pending_actions",
    "get_conversation_context",
    "get_daily_review",
    "get_weather_summary",
  ] as const satisfies readonly ConversationV2ToolName[],
  candidate: [
    "set_candidate_field",
    "clear_candidate_field",
    "select_candidate_entity",
    "dismiss_candidate_clue",
    "cancel_candidate",
    "snooze_candidate",
    "confirm_candidate",
  ] as const satisfies readonly ConversationV2ToolName[],
  official: [] as const,
} as const;

const GOALS = new Set<ConversationV2Goal>([
  "EXPLAIN", "QUERY", "SHOW_STATE", "ADVISE", "REPAIR", "RECORD", "CANCEL", "CONFIRM",
  "NAVIGATE", "CLARIFY", "HELP", "COMPARE", "ANALYZE",
]);
const TARGETS = new Set<ConversationV2Target>([
  "candidate", "open_candidates", "caretaker_farms", "farm_caretakers", "farm", "operational_event", "abnormal_event", "pending_action", "query_result", "daily_review", "current_context", "none",
]);
const TOPICS = new Set<ConversationV2Topic>([
  "caretaker_conflict", "candidate_conflict", "candidate_consequence", "candidate_state", "candidate_blockers", "candidate_cancel",
  "candidate_farm", "candidate_quantity", "caretaker_farms", "farm_caretakers", "open_candidates", "today_mortality", "today_abnormal",
  "today_attention", "recent_event", "event_abnormality", "pending_status", "meta_conversation", "capability", "advice_options", "unknown",
]);
const TOOLS = new Set<ConversationV2ToolName>([
  ...CONVERSATION_V2_TOOL_ALLOWLIST.read,
  ...CONVERSATION_V2_TOOL_ALLOWLIST.candidate,
]);
const FIELDS = new Set<CandidateRepairField>(["farm", "house", "flock", "quantity", "event"]);

function clean(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

const CHINESE_COUNTS: Record<string, number> = {
  一: 1,
  二: 2,
  兩: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function clampAnswerCount(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return Math.min(10, Math.max(1, Math.trunc(value as number)));
}

function answerCountMatches(text: string): Array<{ value: number; index: number }> {
  const matches: Array<{ value: number; index: number }> = [];
  const pattern = /(?:(\d{1,2})|([一二兩两三四五六七八九十]))\s*(?:個|件|項|例|種|條|則|個問題|個例子|件事)/gu;
  for (const match of text.matchAll(pattern)) {
    const numeric = match[1] ? Number(match[1]) : CHINESE_COUNTS[match[2] ?? ""];
    const value = clampAnswerCount(numeric);
    if (value !== undefined && match.index !== undefined) matches.push({ value, index: match.index });
  }
  return matches;
}

function plan(
  goal: ConversationV2Goal,
  context: ConversationV2Context,
  options: Partial<Omit<ConversationV2Plan, "goal">> = {},
): ConversationV2Plan {
  return {
    goal,
    target: options.target ?? (context.hasCurrentCandidate ? "candidate" : "none"),
    topic: options.topic ?? null,
    requestedTools: options.requestedTools ?? [],
    proposedAction: options.proposedAction ?? null,
    needsClarification: options.needsClarification ?? false,
    ...(options.clarificationReason ? { clarificationReason: options.clarificationReason } : {}),
    confidence: options.confidence ?? 0.7,
    ...(options.referenceScope ? { referenceScope: options.referenceScope } : {}),
    ...(options.referentRequired !== undefined ? { referentRequired: options.referentRequired } : {}),
    ...(options.referentResolved !== undefined ? { referentResolved: options.referentResolved } : {}),
    ...(options.referentSource ? { referentSource: options.referentSource } : {}),
    ...(options.genericRuleUsed !== undefined ? { genericRuleUsed: options.genericRuleUsed } : {}),
  };
}

/**
 * Apply the deterministic reference boundary after either the local policy or
 * the model has proposed a plan.  The model may help with wording, but it
 * cannot promote a generic class question to a concrete Candidate.
 */
export function normalizeConversationV2ReferencePlan(
  selected: ConversationV2Plan,
  input: string,
  context: ConversationV2Context,
): ConversationV2Plan {
  const reference = inferConversationReferenceScope(input, context);
  const readGoal = selected.goal === "EXPLAIN"
    || selected.goal === "QUERY"
    || selected.goal === "SHOW_STATE"
    || selected.goal === "ADVISE"
    || selected.goal === "COMPARE"
    || selected.goal === "ANALYZE";
  const genericCandidateRead = reference.referenceScope === "class"
    && readGoal
    && (selected.topic === "candidate_consequence" || selected.topic === "candidate_cancel" || selected.topic === "advice_options");
  const instanceMissing = reference.referenceScope === "instance"
    && reference.referentRequired
    && !reference.referentResolved
    && readGoal;
  return {
    ...selected,
    ...(genericCandidateRead ? { target: "current_context" as ConversationV2Target } : {}),
    referenceScope: reference.referenceScope,
    referentRequired: reference.referentRequired,
    referentResolved: reference.referentResolved,
    referentSource: reference.referentSource,
    genericRuleUsed: reference.genericRuleUsed,
    needsClarification: selected.needsClarification || instanceMissing,
    ...(instanceMissing && !selected.clarificationReason
      ? { clarificationReason: "instance_reference_missing" }
      : {}),
  };
}

function hasAny(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

/**
 * Recognize a request about the assistant's capabilities, not a request for
 * one particular farm record. This intentionally combines broad language
 * roles (ability + help/query/analyze + open scope) instead of matching a
 * benchmark utterance.
 */
export function isConversationV2CapabilityRequest(input: string): boolean {
  const text = clean(input);
  const ability = /(?:你|助理|可以|能|會|会).{0,18}(?:幫|帮|協助|协助|查|查詢|查询|分析|處理|处理|做|提供)/u.test(text);
  const openScope = /(?:哪些|哪類|哪类|哪一類|哪一类|什麼|什么|事情|資料|资料|功能|能力)/u.test(text);
  const capabilityNoun = /(?:有哪些功能|有什麼能力|有什么能力|能做什麼|能做什么|可以做什麼|可以做什么)/u.test(text);
  return capabilityNoun || (ability && openScope);
}

/**
 * Extract the requested answer shape without tying production behavior to a
 * complete benchmark sentence. Counts are bounded and only affect rendering;
 * they never grant a tool or mutation permission.
 */
export function inferConversationAnswerContract(input: string): ConversationAnswerContract {
  const text = clean(input);
  const counts = answerCountMatches(text);
  const limitationIndex = text.search(/(?:不會|不会|不能|不直接|不替|不幫|不帮|限制|不自行)/u);
  const beforeLimit = limitationIndex >= 0 ? counts.filter((item) => item.index < limitationIndex) : counts;
  const afterLimit = limitationIndex >= 0 ? counts.filter((item) => item.index >= limitationIndex) : [];
  const wantsExamples = /(?:例子|例題|實際問題|实际问题|直接問|直接问|可以問|可以问|拿來問|拿来问|問法|问法|提問|提问|舉|举)/u.test(text);
  const wantsLimitations = /(?:不會|不会|不能|不直接|不替|不幫|不帮|限制|不自行|不可以直接)/u.test(text);
  const wantsCapabilities = isConversationV2CapabilityRequest(text)
    || /(?:能做|可以做|能幫|能帮|可以幫|可以帮|協助|协助|能處理|能处理|可以處理|可以处理|可以查|可以分析|可以說明|可以说明)/u.test(text);
  const wantsConsequences = /(?:影響|影响|後果|后果|會造成|会造成|會發生|会发生|會怎樣|会怎样|一直.*(?:放著|放着|不處理|不处理|不確認|不确认)|(?:不處理|不处理|不確認|不确认).{0,10}(?:結果|结果))/u.test(text);
  const wantsOptions = /(?:怎麼辦|怎么办|怎麼處理|怎么处理|怎麼做|怎么做|選擇|选择|選項|选项|建議|建议|該怎麼|该怎么|下一步|可以先|保留|放著|放着|哪個方式|哪个方式|哪種|哪种|哪一種|哪一种|選哪|选哪)/u.test(text);
  const wantsReasons = /(?:為什麼|为什么|為何|为何|原因|依據|依据|根據|根据)/u.test(text);
  const wantsSummary = /(?:簡單|简单|簡要|简要|摘要|短一點|短一点|不要落落長|不要落落长|重點|重点)/u.test(text);
  const wantsDetailed = /(?:詳細|详细|完整|多說|多说|深入)/u.test(text);
  const readOnlyExplicit = /(?:只查|只說明|只说明|不要修改|不修改|不要新增|不新增|不要寫入|不要写入|不寫入|不写入|不要改|不改|不要操作|不操作)/u.test(text);
  const exampleCount = clampAnswerCount(beforeLimit[0]?.value ?? (wantsExamples ? counts[0]?.value : undefined));
  const capabilityCount = clampAnswerCount(wantsCapabilities ? beforeLimit[0]?.value : undefined);
  const limitationCount = clampAnswerCount(wantsLimitations ? (afterLimit[0]?.value ?? (beforeLimit.length > 1 ? beforeLimit[1]?.value : undefined)) : undefined);
  const wantsComparison = /比較|比较|差異|差异|相同|一樣|一样/u.test(text);
  const mode: ConversationAnswerMode = wantsExamples && wantsLimitations
    ? "capability_limits"
    : wantsExamples
      ? "examples"
      : wantsCapabilities && wantsLimitations
        ? "capability_limits"
        : wantsComparison
          ? "comparison"
          : wantsConsequences
            ? "consequence"
            : wantsOptions
              ? "options"
              : wantsCapabilities
                ? "capability"
                : wantsSummary || isBroadOperationalReadRequest(text)
                  ? "summary"
                  : "default";
  return {
    mode,
    ...(exampleCount !== undefined ? { requestedCount: exampleCount, exampleCount } : {}),
    ...(capabilityCount !== undefined ? { capabilityCount } : {}),
    ...(limitationCount !== undefined ? { limitationCount } : {}),
    wantsExamples,
    wantsCapabilities,
    wantsLimitations,
    wantsSummary,
    wantsReasons,
    wantsConsequences,
    wantsOptions,
    brevity: wantsDetailed ? "detailed" : wantsSummary ? "short" : "normal",
    readOnlyExplicit,
  };
}

/** A safe boundary between referential follow-up and a new independent turn. */
export function isConversationMemoryRelevant(input: string, context: ConversationV2Context): boolean {
  if (!context.lastTopic && !context.semanticMemory?.lastTopic) return false;
  const text = clean(input);
  return /(?:剛才|刚才|剛剛|刚刚|上一輪|上一轮|上個|上个|那個|那个|這個|这个|那筆|那笔|這筆|这笔|它|你剛說|你刚说|你剛才|你刚才|為什麼|为什么|為何|为何|為啥|为啥|現在呢|现在呢|那呢|第[一二兩两三四五六七八九十\d]+個|第[一二兩两三四五六七八九十\d]+項|什麼(?:衝突|冲突|問題|问题))/u.test(text);
}

const INSTANCE_REFERENCE_MARKERS = /(?:這筆|这笔|那筆|那笔|這一筆|这一笔|剛才那筆|刚才那笔|剛剛那筆|刚刚那笔|上一筆|上一笔|前面那筆|前面那笔|第\s*[一二兩两三四五六七八九十\d]+\s*(?:筆|笔|個|个|項|项)|這個|这个|那個|那个|它|該筆|该笔|剛才說的|刚才说的|前面說的|前面说的|指定(?:的)?(?:紀錄|记录|資料|资料|事件)|編號|编号)/u;

const CLASS_REFERENCE_MARKERS = /(?:待確認|待确认|候選|候选|死亡(?:紀錄|记录|資料|资料)?|異常(?:紀錄|记录|資料|资料)?|更正(?:紀錄|记录|流程)?|批次(?:資料|资料|紀錄|记录)?|一般|通常|一般來說|一般来说|這類|这类|一類|一类|制度|規則|规则)/u;

/**
 * Resolve reference scope before the model plan is trusted.  "有一筆待確認
 * 資料" is intentionally not an instance marker: it describes a possible
 * member of a class, while "這筆" / "那筆" points to a concrete object.
 */
export function inferConversationReferenceScope(
  input: string,
  context: ConversationV2Context,
): ConversationReferenceAnalysis {
  const text = clean(input);
  const explicitInstance = INSTANCE_REFERENCE_MARKERS.test(text);
  const classSubject = CLASS_REFERENCE_MARKERS.test(text);
  const lastTopic = context.semanticMemory?.lastTopic ?? context.lastTopic ?? null;
  const lastScope = context.semanticMemory?.lastReferenceScope ?? null;
  const classFollowUp = !explicitInstance
    && (lastScope === "class" || (lastScope === null && lastTopic === "candidate_consequence"))
    && (lastTopic === "candidate_consequence" || lastTopic === "advice_options" || lastTopic === "candidate_cancel")
    && /(?:那|所以|接著|接着|接下來|接下来|處理|处理|選擇|选择|方式|辦法|办法|怎麼|怎么|如何)/u.test(text);
  const resolvedActiveCandidate = Boolean(context.hasCurrentCandidate && context.currentCandidateId);
  const memory = context.semanticMemory;
  const resolvedMemoryObject = Boolean(
    (context.activeObjectId && context.activeObjectType)
      || (memory?.activeObjectId && memory.activeObjectType),
  );
  const resolved = resolvedActiveCandidate || resolvedMemoryObject;

  if (explicitInstance) {
    return {
      referenceScope: "instance",
      referentRequired: true,
      referentResolved: resolved,
      referentSource: resolvedActiveCandidate
        ? "active_candidate"
        : resolvedMemoryObject ? "memory" : "explicit_marker",
      genericRuleUsed: false,
    };
  }
  if (classSubject || classFollowUp) {
    return {
      referenceScope: "class",
      referentRequired: false,
      referentResolved: false,
      referentSource: "none",
      genericRuleUsed: true,
    };
  }
  return {
    referenceScope: "none",
    referentRequired: false,
    referentResolved: false,
    referentSource: "none",
    genericRuleUsed: false,
  };
}

/**
 * Broad operational analysis has no single object type. It is still bounded
 * to the current organization and local-day read tools by the caller.
 */
export function isBroadOperationalReadRequest(input: string): boolean {
  const text = clean(input);
  const timeOrCurrent = /(?:今天|今日|目前|現在|现在|最近|依目前|依現有|依现有)/u.test(text);
  const attention = /(?:注意|值得|優先|优先|整體|整体|狀況|状况|情況|情况|風險|风险|先處理|先处理|留意|不太正常|明顯問題|明显问题|問題最多|问题最多)/u.test(text);
  const directSpecificQuery = /(?:死亡幾|死亡几|死了多少|幾隻死亡|几只死亡|幾筆異常|几笔异常|有哪些異常|有哪些异常|待確認有幾|待确认有几|天氣|天气|財務|财务)/u.test(text);
  const broadScope = /(?:有沒有|有没有|什麼|什么|哪一場|哪一场|目前資料|目前资料|整體|整体|哪件事|哪一件|哪些事情)/u.test(text);
  return attention && (timeOrCurrent || broadScope) && !directSpecificQuery;
}

function conversationObjectType(text: string, context: ConversationV2Context): ConversationObjectType | null {
  const memoryType = context.activeObjectType ?? context.semanticMemory?.activeObjectType ?? context.semanticMemory?.lastQueryResultType ?? null;
  if (/(?:異常|异常|咳嗽|咳|故障|停電|停电|缺料|缺水)/u.test(text)) return "abnormal_event";
  if (/(?:待確認|待确认|候選|候选|這筆資料|这笔资料)/u.test(text)) return "candidate";
  if (/(?:雞舍|鸡舍|舍別|舍别)/u.test(text)) return "house";
  if (/(?:批次|群|flock)/iu.test(text)) return "flock";
  if (/(?:雞場|鸡场|場|场)/u.test(text)) return "farm";
  if (/(?:死亡|死|淘汰|飼料|饲料|飲水|饮水|出雞|出鸡|紀錄|记录|記了|记了)/u.test(text)) return "operational_event";
  return memoryType;
}

function conversationTopic(
  text: string,
  context: ConversationV2Context,
  speechAct: ConversationSpeechAct,
): ConversationV2Topic | null {
  const lastTopic = context.semanticMemory?.lastTopic ?? context.lastTopic ?? null;
  if (isConversationV2CapabilityRequest(text)) return "capability";
  if (speechAct === "META_CONVERSATION") return "meta_conversation";
  if (speechAct === "EXPLAIN_REQUEST" && /(?:影響|影响|後果|后果|會造成|会造成|會怎樣|会怎样|結果|结果)/u.test(text)) return "candidate_consequence";
  if (speechAct === "ADVICE_REQUEST") {
    return /(?:取消|不想|不要|不需要|不處理|不处理|不記|不记|不存|不留|不保留|先放著|先放着)/u.test(text)
      ? "candidate_cancel"
      : "advice_options";
  }
  if (/(?:飼養者|饲养者|照顧者|照顾者|照顧|照顾)/u.test(text)
    && /(?:雞場|鸡场|場|场)/u.test(text)) {
    return /(?:有沒有|有没有|有誰|有谁|誰照顧|谁照顾|設定|设定)/u.test(text)
      ? "farm_caretakers"
      : "caretaker_farms";
  }
  if (/(?:對應|对应)/u.test(text) && /(?:雞場|鸡场|場|场)/u.test(text)) return "caretaker_farms";
  if (/(?:哪些|哪幾|哪几)/u.test(text) && /(?:場|场)/u.test(text) && /(?:人|誰|谁|飼養|饲养|照顧|照顾|林志騰)/u.test(text)) return "caretaker_farms";
  if (/(?:待確認|待确认|候選|候选|還沒處理|还没处理|未處理|未处理|沒處理|没处理)/u.test(text)) return "pending_status";
  if (/(?:哪個雞場|哪個场|哪個場|哪家雞場|哪家场|哪家場)/u.test(text)
    && (context.activeObjectType === "operational_event" || context.semanticMemory?.activeObjectType === "operational_event" || context.semanticMemory?.lastReferencedObjectType === "operational_event")) return "recent_event";
  if (/(?:異常|异常)/u.test(text) && /(?:這筆|这笔|那筆|那笔|它|該筆|该笔)/u.test(text)) return "event_abnormality";
  if (/(?:異常|异常)/u.test(text)) return "today_abnormal";
  if (/(?:死亡|死)/u.test(text) && /(?:今天|今日|昨天|總共|总共|多少|幾隻|几只|記了|记了)/u.test(text)) return "today_mortality";
  if (/(?:最後|最后|剛才|刚才|最近|上一筆|上一笔|記了|记了)/u.test(text)) return "recent_event";
  if (/(?:影響|影响|後果|后果)/u.test(text)) return "candidate_consequence";
  if (/(?:卡住|阻擋|阻挡|還缺|还缺|缺什麼|缺什么|等我|回答)/u.test(text)) return "candidate_blockers";
  if (lastTopic && lastTopic !== "open_candidates" && isConversationMemoryRelevant(text, context)) return lastTopic;
  if (/(?:衝突|冲突|不一致|怪|問題|问题|原因|哪裡|哪里|為什麼|为什么)/u.test(text)) return "candidate_conflict";
  if (context.hasCurrentCandidate) return "candidate_state";
  return null;
}

/**
 * Generic speech-act gate. It deliberately describes linguistic roles rather
 * than enumerating user sentences. The result is used both by V2 routing and
 * immediately before legacy record handlers, so a failed V2 attempt cannot
 * silently become an official write.
 */
export function classifyConversationSpeechAct(input: string, context: ConversationV2Context): ConversationSpeechAnalysis {
  const text = clean(input);
  const question = /[?？]|(?:嗎|吗|呢|是不是|是否|可不可以|能不能|行不行|什麼|什么|哪裡|哪里|哪個|哪个|為什麼|为什么|為何|为何|為啥|为啥|怎麼|怎么|如何|有沒有|有没有|多少|幾筆|几笔|哪些|哪一)/u.test(text);
  const conditional = /(?:如果|假如|要是|若是|能不能|可以不可以|該不該|要不要|的話|的话|先放著|先放着|不回答|不處理|不处理)/u.test(text);
  const quoted = /[「」『』“”"']/u.test(text) || /(?:原話|原文|那句|這句|这句|你剛才說|你刚才说|聊天內容|聊天内容)/u.test(text);
  const historical = /(?:剛才|刚才|剛剛|刚刚|之前|上次|最後|最后|上一筆|上一笔|那筆|那笔|那句|這句|这句|昨天)/u.test(text);
  const referential = /(?:這筆|这笔|那筆|那笔|這個|这个|那個|那个|它|那場|那场|剛才|刚才|現在呢|现在呢|那昨天|那今天|為什麼|为什么|為何|为何|為啥|为啥)/u.test(text);
  const hypothetical = conditional && /(?:會|会|怎樣|怎样|怎麼辦|怎么办|影響|影响|後果|后果|選擇|选择|重要|需要)/u.test(text);
  const negated = /(?:不是要|不是說|不是说|我不是|沒有要|没有要|只是問|只是问|不是真的|並非|并非|無意|无意)/u.test(text);
  const explicitCancel = /(?:取消|算了|不要了|不要記了|不要记了|不記了|不记了|不存了|放棄|放弃|先別記|先别记)/u.test(text)
    && !question && !conditional && !quoted;
  const explicitConfirm = /(?:確認|確定|就這樣|就这样|這樣可以|这样可以|記吧|记吧|照你說的|照你说的)/u.test(text)
    && !question && !conditional && !quoted;
  const correction = /(?:不是.+(?:是|改成|改為|改为)|選錯|选错|更正|改成|改為|改为|修正)/u.test(text);
  const meta = /(?:你|系統|系统|助理|機器|机器|我剛才那句|我刚才那句|剛才那句|刚才那句).*(?:為什麼|为什么|怎麼|怎么|怎樣|怎样|判|理解|以為|以为|叫我|要求|等我|回答|回覆|回复|記成|记成)/u.test(text)
    || /(?:剛才|刚才).*(?:叫我|要我|讓我|让我)/u.test(text)
    || /(?:你現在|你现在|你目前).*(?:等|需要我|要我)/u.test(text)
    || /(?:剛才|刚才).*(?:回答的是|回覆的是|回复的是|哪一筆|哪一笔)/u.test(text)
    || /(?:我剛才那句|我刚才那句).*(?:記錄|记录|讓|让|以為|以为)/u.test(text);
  const consequence = /(?:影響|影响|後果|后果|會造成|会造成|會發生|会发生|會怎樣|会怎样|結果|结果|一直.*(?:放著|放着|不處理|不处理|不確認|不确认))/u.test(text);
  const advice = !consequence && ((conditional && /(?:怎麼辦|怎么办|怎樣|怎样|如何|選擇|选择|選項|选项|要不要|需要|怎麼|怎么|建議|建议|處理|处理|方式|辦法|办法|哪個方式|哪个方式|哪種|哪种|哪一種|哪一种|選哪|选哪)/u.test(text))
    || (question && /(?:取消|不回答|先放著|先放着|重要|需要處理|需要处理|一定要.{0,4}確認|需要確認|需要确认|確認這筆|确认这笔|晚點|晚点|稍後|稍后|選擇|选择|選項|选项|怎麼辦|怎么办|不要算|不要管|不算|不管|建議|建议|方式|哪個方式|哪个方式|哪種|哪种|哪一種|哪一种|選哪|选哪|路線|路线|辦法|办法)/u.test(text))
    || /(?:可以|能|該|该).{0,8}(?:選擇|选择|選項|选项|處理|处理|方式|辦法|办法|保留|放著|放着|取消)/u.test(text));
  const notRight = /(?:不對|不对|不正確|不正确)/u.test(text);
  const priorReadGoal = ["EXPLAIN", "QUERY", "SHOW_STATE", "ADVISE", "COMPARE", "ANALYZE"].includes(context.lastGoal ?? "")
    && context.lastTopic !== "candidate_cancel";
  const explain = /(?:為什麼|为什么|為何|为何|為啥|为啥|原因|哪裡|哪里|哪邊|哪边|怪|問題|问题|衝突|冲突|不一致|矛盾|卡住|真正|白話|白话|影響|影响|後果|后果|重要|怎麼會|怎么会|怎麼判|怎么判)/u.test(text)
    || (notRight && priorReadGoal);
  const analyze = /(?:分析|評估|评估|判斷|判断)/u.test(text);
  const state = /(?:目前|現在|现在|知道|狀況|状况|狀態|状态|進度|进度|還缺|还缺|缺什麼|缺什么|等我|回答什麼|回答什么)/u.test(text);
  const stateDetail = /(?:知道|哪些資料|哪些资料|什麼資料|什么资料|狀況|状况|狀態|状态|進度|进度|還缺|还缺|缺什麼|缺什么|回答什麼|回答什么)/u.test(text);
  const query = /(?:今天|今日|目前|現在|现在|昨天|最近|最後|最后|總共|总共|幾筆|几笔|幾隻|几只|多少|有哪些|有沒有|有没有|哪一|哪個|哪个|記了|记了|紀錄|记录|查詢|查询|統計|统计|待確認|待确认|異常|异常|對應|对应)/u.test(text);
  const help = /(?:幫助|帮助|怎麼用|怎么用|怎麼使用|怎么使用|有哪些功能|可以做什麼|可以做什么|操作|使用)/u.test(text);
  const capability = isConversationV2CapabilityRequest(text);
  const broadRead = isBroadOperationalReadRequest(text);
  const compare = /(?:差別|差异|差異|比較|比较|一樣嗎|一样吗|相同嗎|相同吗)/u.test(text);
  const uncertain = /(?:不知道|不曉得|不晓得|不明白|不確定|不确定)/u.test(text);
  const eventWord = /(?:死亡|死|掛|挂|淘汰|飼料|饲料|飲水|饮水|出雞|出鸡|出欄|出栏|存欄|存栏)/u.test(text);
  const hasQuantity = /(?:\d|零|一|二|兩|两|三|四|五|六|七|八|九|十|百|千)/u.test(text);
  const pastFactAssertion = historical && /(?:死了|死掉|發生|发生|發現|发现|今天|今日)/u.test(text);
  const assertion = eventWord && hasQuantity && !question && !conditional && !quoted && (!historical || pastFactAssertion) && !negated && !explain && !meta;
  const objectType = conversationObjectType(text, context);
  const topic = conversationTopic(text, context, meta ? "META_CONVERSATION" : advice ? "ADVICE_REQUEST" : explain ? "EXPLAIN_REQUEST" : query ? "QUERY" : "UNKNOWN");

  if (explicitCancel) return { speechAct: "CANCEL", recommendedGoal: "CANCEL", target: "candidate", topic: "candidate_cancel", objectType: "candidate", question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "explicit_cancel_action" };
  if (explicitConfirm) return { speechAct: "CONFIRM", recommendedGoal: "CONFIRM", target: "candidate", topic: "candidate_state", objectType: "candidate", question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "explicit_confirm_action" };
  if (correction && !question && !conditional) return { speechAct: "CORRECTION", recommendedGoal: "REPAIR", target: "candidate", topic: conversationTopic(text, context, "CORRECTION"), objectType: objectType ?? "candidate", question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "correction_or_repair" };
  if (uncertain) return { speechAct: "UNKNOWN", recommendedGoal: "CLARIFY", target: context.hasCurrentCandidate ? "candidate" : "current_context", topic: null, objectType: objectType ?? (context.hasCurrentCandidate ? "candidate" : null), question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "uncertain_user_goal" };
  if (broadRead) return { speechAct: "QUERY", recommendedGoal: "ANALYZE", target: "query_result", topic: "today_attention", objectType: "query_result", question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "broad_operational_read" };
  if (consequence && (question || conditional || /(?:先說明|先说明|只說明|只说明)/u.test(text))) {
    const activeObjectType = context.activeObjectType ?? context.semanticMemory?.activeObjectType ?? null;
    return { speechAct: "EXPLAIN_REQUEST", recommendedGoal: "EXPLAIN", target: context.hasCurrentCandidate ? "candidate" : activeObjectType === "candidate" ? "candidate" : "current_context", topic: "candidate_consequence", objectType: objectType ?? (context.hasCurrentCandidate ? "candidate" : activeObjectType), question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "consequence_question" };
  }
  if (advice) {
    const activeObjectType = context.activeObjectType ?? context.semanticMemory?.activeObjectType ?? null;
    const adviceTarget: ConversationV2Target = activeObjectType === "operational_event"
      ? "operational_event"
      : activeObjectType === "abnormal_event"
        ? "abnormal_event"
        : context.hasCurrentCandidate ? "candidate" : "current_context";
    return { speechAct: "ADVICE_REQUEST", recommendedGoal: "ADVISE", target: adviceTarget, topic: topic ?? "advice_options", objectType: objectType ?? (context.hasCurrentCandidate ? "candidate" : activeObjectType), question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "conditional_or_consequence_question" };
  }
  if (meta) return { speechAct: "META_CONVERSATION", recommendedGoal: "EXPLAIN", target: "current_context", topic: "meta_conversation", objectType: objectType ?? "pending_action", question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "question_about_assistant_behavior" };
  if (quoted && question) return { speechAct: "META_CONVERSATION", recommendedGoal: "EXPLAIN", target: "current_context", topic: "meta_conversation", objectType: objectType ?? "query_result", question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "quoted_text_question" };
  if (negated && eventWord) return { speechAct: "META_CONVERSATION", recommendedGoal: "EXPLAIN", target: "current_context", topic: "meta_conversation", objectType: objectType ?? "query_result", question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "negated_domain_reference" };
  if (capability) return { speechAct: "META_CONVERSATION", recommendedGoal: "HELP", target: "none", topic: "capability", objectType: null, question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "capability_request" };
  if (help && !question) return { speechAct: "NAVIGATION", recommendedGoal: "HELP", target: "none", topic: null, objectType: null, question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "help_request" };
  if (explain && (question || referential || isConversationMemoryRelevant(text, context))) return { speechAct: "EXPLAIN_REQUEST", recommendedGoal: "EXPLAIN", target: context.hasCurrentCandidate ? "candidate" : "current_context", topic: topic ?? "candidate_conflict", objectType: objectType ?? (context.hasCurrentCandidate ? "candidate" : null), question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "explanation_request" };
  if (referential && context.lastTopic && /^(?:現在呢|现在呢|那現在呢|那现在呢|這筆現在呢|这笔现在呢|那呢|那昨天呢|那今天呢|為什麼|为什么|為何|为何|為啥|为啥|那個衝突|那个冲突)[?？。！!]?$/u.test(text)) {
    const inheritedGoal = /那昨天|那今天/u.test(text) && context.lastGoal === "QUERY" ? "QUERY" : "EXPLAIN";
    const activeObjectType = context.activeObjectType ?? context.semanticMemory?.activeObjectType ?? null;
    return { speechAct: "REFERENCE", recommendedGoal: inheritedGoal, target: activeObjectType === "operational_event" ? "operational_event" : context.hasCurrentCandidate ? "candidate" : "current_context", topic: context.lastTopic, objectType: objectType ?? activeObjectType, question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "follow_up_reference" };
  }
  if (compare && question) {
    const compareTarget: ConversationV2Target = context.activeObjectType === "operational_event"
      ? "operational_event"
      : context.activeObjectType === "candidate"
        ? "candidate"
        : "query_result";
    return { speechAct: "QUERY", recommendedGoal: "COMPARE", target: compareTarget, topic: "candidate_conflict", objectType: objectType ?? "query_result", question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "comparison_question" };
  }
  if (state && stateDetail && !explain && (question || referential)) {
    const stateTarget: ConversationV2Target = context.activeObjectType === "operational_event"
      ? "operational_event"
      : context.activeObjectType === "abnormal_event"
        ? "abnormal_event"
        : objectType === "pending_action"
          ? "pending_action"
          : context.hasCurrentCandidate ? "candidate" : "current_context";
    return { speechAct: "QUERY", recommendedGoal: "SHOW_STATE", target: stateTarget, topic: topic ?? "candidate_state", objectType: objectType ?? context.activeObjectType ?? (context.hasCurrentCandidate ? "candidate" : null), question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "state_question" };
  }
  if (question && eventWord) return { speechAct: "QUERY", recommendedGoal: "QUERY", target: "operational_event", topic: historical ? "recent_event" : "today_mortality", objectType: "operational_event", question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "event_question" };
  if (query && (question || historical || referential)
    && topic !== "candidate_state"
    && topic !== "candidate_blockers") {
    const queryTarget: ConversationV2Target = topic === "today_abnormal" || topic === "event_abnormality"
      ? "abnormal_event"
      : topic === "recent_event" || topic === "today_mortality"
        ? "operational_event"
        : topic === "pending_status"
          ? "open_candidates"
          : topic === "farm_caretakers" || topic === "caretaker_farms"
            ? topic
            : objectType === "candidate"
              ? "candidate"
              : objectType === "farm"
                ? "farm"
                : objectType === "operational_event"
                  ? "operational_event"
                  : objectType === "abnormal_event"
                    ? "abnormal_event"
                    : "query_result";
    return { speechAct: "QUERY", recommendedGoal: "QUERY", target: queryTarget, topic: topic ?? "unknown", objectType: objectType ?? "query_result", question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "read_query" };
  }
  if (state && !explain && !/不知道|不晓得|不明白/u.test(text) && (question || referential)) return { speechAct: "QUERY", recommendedGoal: "SHOW_STATE", target: objectType === "pending_action" ? "pending_action" : context.hasCurrentCandidate ? "candidate" : "current_context", topic: topic ?? "candidate_state", objectType: objectType ?? (context.hasCurrentCandidate ? "candidate" : null), question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "state_question" };
  if (analyze && (question || referential || context.hasCurrentCandidate)) return { speechAct: "QUERY", recommendedGoal: "ANALYZE", target: context.hasCurrentCandidate ? "candidate" : "current_context", topic: topic ?? "candidate_state", objectType: objectType ?? (context.hasCurrentCandidate ? "candidate" : null), question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "analysis_request" };
  if (assertion) return { speechAct: "ASSERT", recommendedGoal: "RECORD", target: "none", topic: null, objectType: objectType ?? "operational_event", question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: true, reason: "new_fact_assertion" };
  if (referential && isConversationMemoryRelevant(text, context)) return { speechAct: "REFERENCE", recommendedGoal: /為什麼|为什么|為何|为何|為啥|为啥/.test(text) ? "EXPLAIN" : context.lastGoal ?? "SHOW_STATE", target: context.hasCurrentCandidate ? "candidate" : "current_context", topic: topic ?? context.lastTopic ?? null, objectType: objectType ?? (context.semanticMemory?.activeObjectType ?? null), question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "contextual_reference" };
  if (text.length > 0 && !assertion) return { speechAct: "UNKNOWN", recommendedGoal: null, target: context.hasCurrentCandidate ? "candidate" : "current_context", topic: topic, objectType, question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "insufficient_intent_evidence" };
  return { speechAct: "UNKNOWN", recommendedGoal: "CLARIFY", target: "current_context", topic: null, objectType: null, question, conditional, quoted, historical, hypothetical, negated, referential, safeToRecord: false, reason: "empty_or_unknown" };
}

export function isReadOnlyConversationGoal(goal: ConversationV2Goal | null | undefined): boolean {
  return goal === "EXPLAIN" || goal === "QUERY" || goal === "SHOW_STATE" || goal === "ADVISE"
    || goal === "COMPARE" || goal === "ANALYZE" || goal === "HELP" || goal === "NAVIGATE" || goal === "CLARIFY";
}

export function conversationOfficialRecordAllowed(analysis: ConversationSpeechAnalysis): boolean {
  return analysis.speechAct === "ASSERT" && analysis.recommendedGoal === "RECORD" && analysis.safeToRecord
    && !analysis.question && !analysis.conditional && !analysis.quoted
    && !analysis.hypothetical && !analysis.negated && !analysis.referential;
}

function issueTopic(text: string, context: ConversationV2Context): ConversationV2Topic {
  if (hasAny(text, /飼養者|饲养者|照顧者|照顾者/u)) return "caretaker_conflict";
  if (hasAny(text, /影響|影响|後果|后果|會不會|会不会|能不能存|能不能記|能不能记/u)) return "candidate_consequence";
  if (hasAny(text, /還缺|还缺|缺什麼|缺什么|需要確認|需要确认|阻擋|阻挡|卡住|卡在哪|卡在哪裡|卡在哪里/u)) return "candidate_blockers";
  if (hasAny(text, /衝突|冲突|不一致|矛盾/u)) {
    return context.lastTopic === "caretaker_conflict" ? "caretaker_conflict" : "candidate_conflict";
  }
  if (hasAny(text, /數量|数量|幾隻|几只/u)) return "candidate_quantity";
  if (hasAny(text, /雞場|鸡场|場|场/u)) return "candidate_farm";
  if (context.lastTopic && context.lastTopic !== "open_candidates") return context.lastTopic;
  return hasAny(text, /問題|问题|不對|不对|怪|原因|哪裡|哪里|不同|為什麼|为什么|為啥|为啥/u)
    ? "candidate_conflict"
    : "candidate_state";
}

function repairPlanFromIntent(intent: CandidateRepairIntent, context: ConversationV2Context): ConversationV2Plan | null {
  if (intent.kind === "set_field") {
    return plan("REPAIR", context, {
      target: "candidate",
      topic: intent.field === "farm" ? "candidate_farm" : intent.field === "quantity" ? "candidate_quantity" : "candidate_state",
      requestedTools: ["set_candidate_field"],
      proposedAction: { type: "set_field", field: intent.field, value: intent.value },
      confidence: 0.96,
    });
  }
  if (intent.kind === "clear_field") {
    return plan("REPAIR", context, {
      target: "candidate",
      requestedTools: ["clear_candidate_field"],
      proposedAction: { type: "clear_field", field: intent.field },
      confidence: 0.96,
    });
  }
  if (intent.kind === "dismiss_clue") {
    return plan("REPAIR", context, {
      target: "candidate",
      topic: "caretaker_conflict",
      requestedTools: ["dismiss_candidate_clue"],
      proposedAction: { type: "dismiss_clue", field: "caretaker" },
      confidence: 0.97,
    });
  }
  if (intent.kind === "cancel") {
    return plan("CANCEL", context, {
      target: "candidate",
      topic: "candidate_cancel",
      requestedTools: ["cancel_candidate"],
      proposedAction: { type: "cancel_candidate" },
      confidence: 0.98,
    });
  }
  if (intent.kind === "confirm") {
    return plan("CONFIRM", context, {
      target: "candidate",
      requestedTools: ["confirm_candidate"],
      proposedAction: { type: "confirm_candidate" },
      confidence: 0.98,
    });
  }
  if (intent.kind === "snooze") {
    return plan("REPAIR", context, {
      target: "candidate",
      requestedTools: ["snooze_candidate"],
      proposedAction: { type: "snooze_candidate" },
      confidence: 0.98,
    });
  }
  if (intent.kind === "select_field") {
    return plan("REPAIR", context, {
      target: "candidate",
      requestedTools: [],
      needsClarification: true,
      clarificationReason: intent.field ? "candidate_field_value_missing" : "candidate_field_unspecified",
      confidence: 0.84,
    });
  }
  return null;
}

function concreteRecord(text: string): boolean {
  return /(?:死亡|死雞|死鸡|淘汰|飼料|饲料|飲水|饮水|出雞|出鸡|咳嗽|咳|臭腳|臭脚|白冠|風扇|风扇|水簾|水帘|災損|灾损|設備|设备|環境|环境)/u.test(text)
    && /\d/u.test(text);
}

/**
 * Context-first deterministic safety classifier. It uses broad linguistic
 * features and the previous topic, not a list of benchmark sentences. The
 * model can refine the plan, but these precedence rules protect read/advice
 * intent from being hijacked by an open Candidate.
 */
function routeConversationV2DeterministicInternal(input: string, context: ConversationV2Context): ConversationV2Plan {
  const text = clean(input);
  if (!text) return plan("CLARIFY", context, { needsClarification: true, clarificationReason: "empty_input", confidence: 0.99 });

  // Speech-act resolution is intentionally before the historical repair
  // heuristics. It keeps read, advice, and meta turns from becoming records
  // just because they mention an operational word or an open Candidate.
  const speech = classifyConversationSpeechAct(text, context);
  const answerContract = inferConversationAnswerContract(text);
  if (answerContract.mode === "examples" || answerContract.mode === "capability_limits"
    || (answerContract.mode === "capability" && answerContract.wantsCapabilities)) {
    return plan("HELP", context, {
      target: "none",
      topic: "capability",
      confidence: 0.96,
      answerContract,
    });
  }
  if (isBroadOperationalReadRequest(text)) {
    return plan("ANALYZE", context, {
      target: "query_result",
      topic: "today_attention",
      requestedTools: ["get_today_effective_records", "get_today_mortality", "get_today_abnormal", "get_pending_actions", "get_recent_effective_records"],
      confidence: 0.96,
      answerContract,
    });
  }
  const safeReferenceRoute = speech.speechAct !== "REFERENCE"
    || (speech.reason === "follow_up_reference" && speech.recommendedGoal !== null);
  if (speech.recommendedGoal && speech.speechAct !== "CORRECTION" && safeReferenceRoute) {
    const requestedTools: ConversationV2ToolName[] = speech.recommendedGoal === "QUERY"
      ? speech.topic === "today_mortality" ? ["get_today_mortality"]
        : speech.topic === "today_abnormal" ? ["get_today_abnormal"]
          : speech.topic === "recent_event" ? ["get_recent_operational_events"]
            : speech.topic === "event_abnormality" ? ["get_event_abnormality"]
              : speech.topic === "pending_status" ? ["list_open_candidates"]
                : ["get_conversation_context"]
      : speech.recommendedGoal === "SHOW_STATE"
        ? [speech.target === "pending_action" ? "get_pending_actions" : speech.target === "operational_event" ? "get_recent_operational_events" : speech.target === "abnormal_event" ? "get_event_abnormality" : "get_conversation_context"]
      : speech.recommendedGoal === "EXPLAIN"
          ? ["get_conversation_context", "get_candidate_evidence", "get_candidate_conflicts"]
          : speech.recommendedGoal === "ADVISE" ? ["get_conversation_context"]
            : speech.recommendedGoal === "HELP" ? [] : [];
    const proposedAction: ConversationV2ProposedAction | null = speech.speechAct === "CANCEL"
      ? { type: "cancel_candidate" }
      : speech.speechAct === "CONFIRM"
        ? { type: "confirm_candidate" }
        : null;
    return plan(speech.recommendedGoal, context, {
      target: speech.target,
      topic: speech.topic,
      requestedTools,
      proposedAction,
      confidence: speech.speechAct === "ASSERT" ? 0.98 : 0.96,
      answerContract,
    });
  }

  const question = /[?？]|什麼|什么|哪裡|哪里|哪個|哪个|為什麼|为什么|為何|为何|為啥|为啥|怎麼|怎么|怎樣|怎样|如何|可以嗎|可以吗|有沒有|有没有|是不是|影響|影响|後果|后果/u.test(text);
  const cancellationDomain = /取消|記|记|存|候選|候选|資料|资料|這筆|这笔|保留|保存|不留|處理|处理|選擇|选择|選項|选项/u.test(text);
  const conditional = /如果|要是|若|想不想|能不能|可以|怎麼|怎么|如何|該怎麼|该怎么|的話|的话/u.test(text);
  const explicitCancel = /取消|算了|不要了|先別記|先别记|不要記|不要记|不記|不记|不存|不要保留|不要保存|放棄|放弃/u.test(text);
  const issue = /衝突|冲突|不一致|矛盾|問題|问题|不對|不对|怪|原因|不能記|不能记|哪裡|哪里|為啥|为啥|不同|卡住|阻擋|阻挡/u.test(text);
  const state = /目前|現在|现在|知道|哪些資料|哪些资料|什麼資料|什么资料|狀態|状态|進度|进度|還缺|还缺|需要什麼|需要什么|下一步/u.test(text);
  const mutation = /改|換|换|選錯|选错|修正|調整|调整|設定|设定|指定|保留|不要動|不要动|不動|不动/u.test(text);
  const repairIntent = parseCandidateRepairIntent(text);
  const concreteRepair = repairIntent.kind === "set_field"
    || repairIntent.kind === "clear_field"
    || repairIntent.kind === "dismiss_clue";
  const openCandidateQuery = /目前有哪些|有幾筆|有几笔|待確認|待确认|有哪些[^。！？!?]{0,8}(?:候選|候选)/u.test(text)
    && /哪些|有幾筆|几笔|待確認|待确认|候選|候选|目前/u.test(text);
  const relationshipQuery = (/飼養者|饲养者|照顧者|照顾者|照顧|照顾|對應|对应|有關|有关/u.test(text))
    && /雞場|鸡场|場|场|對應|对应|哪些|哪幾|哪几/u.test(text);
  const referentialFollowUp = context.lastTopic !== null && /現在呢|现在呢|那呢|呢$/u.test(text);
  const directRecord = concreteRecord(text)
    && !/(?:不是|改成|改為|改为|換成|换成|應該|应该|清除|移除|選錯|选错|修正)/u.test(text);
  const bareCandidateIssue = context.hasCurrentCandidate
    && !question
    && /(?:不對|不对|有問題|有问题|怪怪|不一致)$/u.test(text);
  const adviceIntent = conditional
    && cancellationDomain
    && /(?:怎麼|怎么|怎樣|怎样|如何|可以|選擇|选择|選項|选项|後果|后果|辦法|办法|呢$|[?？])/u.test(text)
    && /(?:取消|不想|不需要|不記|不记|不存|不留|不保留|不保存|不處理|不处理|先放著|先放着|選擇|选择|選項|选项)/u.test(text);

  // Advice is deliberately checked before the repair parser: a conditional
  // question about cancelling is not an action and must not mutate state.
  if (adviceIntent) {
    return plan("ADVISE", context, {
      target: "candidate",
      topic: "candidate_cancel",
      requestedTools: ["get_candidate_details"],
      confidence: 0.97,
    });
  }
  if (explicitCancel && !question && !conditional) {
    return plan("CANCEL", context, {
      target: "candidate",
      topic: "candidate_cancel",
      requestedTools: ["cancel_candidate"],
      proposedAction: { type: "cancel_candidate" },
      confidence: 0.94,
    });
  }
  if (directRecord) return plan("RECORD", context, { target: "none", confidence: 0.96 });
  if (bareCandidateIssue) {
    return plan("REPAIR", context, {
      target: "candidate",
      needsClarification: true,
      clarificationReason: "candidate_issue_field_unspecified",
      confidence: 0.78,
    });
  }
  if (state && !issue && !adviceIntent && !referentialFollowUp
    && !(context.lastTopic && question && !/還缺|还缺|需要|下一步|資料|资料|狀態|状态|知道|目前|現在|现在/u.test(text))
    && !/不知道|不晓得/u.test(text)
    && !openCandidateQuery && !relationshipQuery
    && (context.hasCurrentCandidate || /這筆|这笔|這個|这个|剛才|刚才|目前/u.test(text))) {
    return plan("SHOW_STATE", context, {
      target: "candidate",
      topic: issueTopic(text, context),
      requestedTools: ["get_candidate_details", "get_candidate_resolution"],
      confidence: 0.94,
    });
  }
  if (openCandidateQuery) {
    return plan("QUERY", context, {
      target: "open_candidates",
      topic: "open_candidates",
      requestedTools: ["list_open_candidates"],
      confidence: 0.96,
    });
  }
  if (relationshipQuery) {
    const target = hasAny(text, /有沒有|有没有|設定|设定/u) ? "farm_caretakers" : "caretaker_farms";
    return plan("QUERY", context, {
      target,
      topic: target,
      requestedTools: [target === "farm_caretakers" ? "get_farm_caretakers" : "get_caretaker_farms"],
      confidence: 0.94,
    });
  }
  if (/比較|比较|差異|差异|是否相同|一樣嗎|一样吗/u.test(text)) {
    return plan("COMPARE", context, {
      target: context.hasCurrentCandidate ? "candidate" : "current_context",
      topic: issueTopic(text, context),
      requestedTools: ["get_candidate_details", "get_candidate_evidence"],
      confidence: 0.84,
    });
  }
  if (/分析|評估|评估|判斷|判断/u.test(text)) {
    return plan("ANALYZE", context, {
      target: context.hasCurrentCandidate ? "candidate" : "current_context",
      topic: issueTopic(text, context),
      requestedTools: ["get_candidate_details", "get_candidate_evidence", "get_candidate_resolution"],
      confidence: 0.82,
    });
  }
  if ((issue && !concreteRepair) || (question && context.lastTopic) || referentialFollowUp) {
    return plan("EXPLAIN", context, {
      target: "candidate",
      topic: issueTopic(text, context),
      requestedTools: ["get_candidate_details", "get_candidate_evidence", "get_candidate_conflicts", "get_candidate_resolution"],
      confidence: 0.93,
    });
  }

  // The prior turn supplies the field being dismissed; the user does not
  // need to repeat the caretaker wording in a follow-up.
  if (context.lastTopic === "caretaker_conflict" && /不要管|不管|先不管|忽略/u.test(text)) {
    return plan("REPAIR", context, {
      target: "candidate",
      topic: "caretaker_conflict",
      requestedTools: ["dismiss_candidate_clue"],
      proposedAction: { type: "dismiss_clue", field: "caretaker" },
      confidence: 0.92,
    });
  }

  if (mutation || repairIntent.kind === "set_field" || repairIntent.kind === "clear_field" || repairIntent.kind === "dismiss_clue") {
    const parsedRepair = repairPlanFromIntent(repairIntent, context);
    if (parsedRepair && (parsedRepair.goal !== "REPAIR" || mutation || parsedRepair.proposedAction)) return parsedRepair;
    return plan("REPAIR", context, {
      target: "candidate",
      needsClarification: true,
      clarificationReason: "candidate_field_value_missing",
      confidence: 0.82,
    });
  }
  if (concreteRecord(text)) return plan("RECORD", context, { target: "none", confidence: 0.96 });
  if (hasAny(text, /幫助|帮助|怎麼用|怎么用|怎麼使用|怎么使用|可以做什麼|可以做什么|有哪些功能|操作|使用/u)) return plan("HELP", context, { target: "none", confidence: 0.95 });

  // A short follow-up inherits the last topic only when it is genuinely
  // referential; unrelated text falls through to the existing V1 path.
  if (context.lastTopic && text.length <= 18 && hasAny(text, /那個|那个|這個|这个|剛才|刚才|現在呢|现在呢|為什麼|为什么|什麼|什么|怎麼|怎么/u)) {
    return plan("EXPLAIN", context, {
      target: "candidate",
      topic: context.lastTopic,
      requestedTools: ["get_candidate_details", "get_candidate_evidence", "get_candidate_conflicts"],
      confidence: 0.88,
    });
  }
  if (context.hasCurrentCandidate) {
    return plan("CLARIFY", context, {
      target: "candidate",
      needsClarification: true,
      clarificationReason: "goal_or_object_unclear",
      confidence: 0.62,
    });
  }
  return plan("CLARIFY", context, {
    target: "current_context",
    needsClarification: true,
    clarificationReason: "goal_or_object_unclear",
    confidence: 0.5,
  });
}

export function routeConversationV2Deterministic(input: string, context: ConversationV2Context): ConversationV2Plan {
  const routed = routeConversationV2DeterministicInternal(input, context);
  return normalizeConversationV2ReferencePlan({
    ...routed,
    answerContract: routed.answerContract ?? inferConversationAnswerContract(input),
  }, input, context);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProposedAction(value: unknown): ConversationV2ProposedAction | null | undefined {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "set_field" && typeof value.field === "string" && FIELDS.has(value.field as CandidateRepairField) && typeof value.value === "string" && value.value.length <= 200) {
    return { type: "set_field", field: value.field as CandidateRepairField, value: value.value.trim() };
  }
  if (value.type === "clear_field" && typeof value.field === "string" && FIELDS.has(value.field as CandidateRepairField)) {
    return { type: "clear_field", field: value.field as CandidateRepairField };
  }
  if (value.type === "dismiss_clue" && value.field === "caretaker") return { type: "dismiss_clue", field: "caretaker" };
  if (value.type === "cancel_candidate") return { type: "cancel_candidate" };
  if (value.type === "snooze_candidate") return { type: "snooze_candidate" };
  if (value.type === "confirm_candidate") return { type: "confirm_candidate" };
  return undefined;
}

function parseAnswerContract(value: unknown): ConversationAnswerContract | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const modes = new Set<ConversationAnswerMode>([
    "default", "examples", "summary", "comparison", "consequence", "options", "capability", "capability_limits",
  ]);
  if (typeof value.mode !== "string" || !modes.has(value.mode as ConversationAnswerMode)) return undefined;
  const count = (key: string): number | undefined => {
    const raw = value[key];
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
    return clampAnswerCount(raw);
  };
  const bool = (key: string): boolean => value[key] === true;
  const requestedCount = count("requestedCount");
  const exampleCount = count("exampleCount");
  const capabilityCount = count("capabilityCount");
  const limitationCount = count("limitationCount");
  const rawBrevity = value.brevity;
  if (rawBrevity !== "short" && rawBrevity !== "normal" && rawBrevity !== "detailed") return undefined;
  return {
    mode: value.mode as ConversationAnswerMode,
    ...(requestedCount !== undefined ? { requestedCount } : {}),
    ...(exampleCount !== undefined ? { exampleCount } : {}),
    ...(capabilityCount !== undefined ? { capabilityCount } : {}),
    ...(limitationCount !== undefined ? { limitationCount } : {}),
    wantsExamples: bool("wantsExamples"),
    wantsCapabilities: bool("wantsCapabilities"),
    wantsLimitations: bool("wantsLimitations"),
    wantsSummary: bool("wantsSummary"),
    wantsReasons: bool("wantsReasons"),
    wantsConsequences: bool("wantsConsequences"),
    wantsOptions: bool("wantsOptions"),
    brevity: rawBrevity,
    readOnlyExplicit: bool("readOnlyExplicit"),
  };
}

export function parseConversationV2Plan(raw: string): ConversationV2Plan | null {
  const value = extractJsonValue(raw);
  if (!isRecord(value)) return null;
  if (typeof value.goal !== "string" || !GOALS.has(value.goal as ConversationV2Goal)) return null;
  const target = value.target === null || value.target === undefined ? "none" : value.target;
  if (typeof target !== "string" || !TARGETS.has(target as ConversationV2Target)) return null;
  const topic = value.topic === null || value.topic === undefined ? null : value.topic;
  if (topic !== null && (typeof topic !== "string" || !TOPICS.has(topic as ConversationV2Topic))) return null;
  const tools = value.requestedTools === undefined ? [] : value.requestedTools;
  if (!Array.isArray(tools) || tools.length > 8 || tools.some((tool) => typeof tool !== "string" || !TOOLS.has(tool as ConversationV2ToolName))) return null;
  const proposedAction = parseProposedAction(value.proposedAction);
  if (proposedAction === undefined) return null;
  const confidence = value.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  const needsClarification = value.needsClarification === true;
  const readGoal = value.goal === "EXPLAIN" || value.goal === "QUERY" || value.goal === "SHOW_STATE"
    || value.goal === "ADVISE" || value.goal === "COMPARE" || value.goal === "ANALYZE";
  if (readGoal && proposedAction !== null) return null;
  if (value.goal === "REPAIR" && proposedAction === null && !needsClarification) return null;
  if (value.goal === "CANCEL" && proposedAction?.type !== "cancel_candidate") return null;
  if (value.goal === "CONFIRM" && proposedAction?.type !== "confirm_candidate") return null;
  if (typeof value.clarificationReason !== "undefined" && (typeof value.clarificationReason !== "string" || value.clarificationReason.length > 160)) return null;
  const answerContract = parseAnswerContract(value.answerContract);
  if (value.answerContract !== undefined && !answerContract) return null;
  const rawReferenceScope = value.referenceScope;
  if (rawReferenceScope !== undefined && rawReferenceScope !== "class" && rawReferenceScope !== "instance" && rawReferenceScope !== "none") return null;
  const rawReferentSource = value.referentSource;
  if (rawReferentSource !== undefined
    && rawReferentSource !== "explicit_marker"
    && rawReferentSource !== "active_candidate"
    && rawReferentSource !== "memory"
    && rawReferentSource !== "none") return null;
  return {
    goal: value.goal as ConversationV2Goal,
    target: target as ConversationV2Target,
    topic: topic as ConversationV2Topic | null,
    requestedTools: tools as ConversationV2ToolName[],
    proposedAction,
    needsClarification,
    ...(typeof value.clarificationReason === "string" ? { clarificationReason: value.clarificationReason } : {}),
    confidence,
    ...(answerContract ? { answerContract } : {}),
    ...(rawReferenceScope ? { referenceScope: rawReferenceScope } : {}),
    ...(typeof value.referentRequired === "boolean" ? { referentRequired: value.referentRequired } : {}),
    ...(typeof value.referentResolved === "boolean" ? { referentResolved: value.referentResolved } : {}),
    ...(rawReferentSource ? { referentSource: rawReferentSource } : {}),
    ...(typeof value.genericRuleUsed === "boolean" ? { genericRuleUsed: value.genericRuleUsed } : {}),
  };
}

const CONVERSATION_V2_SYSTEM_PROMPT = `你是金雞協會助理Ai的受限對話控制器。你只理解使用者目標並提出安全的 Conversation Plan，不輸出 SQL，不輸出正式資料 ID，不直接寫資料庫，不輸出思考過程。
允許 goal：EXPLAIN、QUERY、SHOW_STATE、ADVISE、REPAIR、RECORD、CANCEL、CONFIRM、NAVIGATE、CLARIFY、HELP、COMPARE、ANALYZE。
允許 target：candidate、open_candidates、caretaker_farms、farm_caretakers、farm、operational_event、abnormal_event、pending_action、query_result、daily_review、current_context、none。
topic 可用：caretaker_conflict、candidate_conflict、candidate_consequence、candidate_state、candidate_blockers、candidate_cancel、candidate_farm、candidate_quantity、caretaker_farms、farm_caretakers、open_candidates、today_attention、today_mortality、today_abnormal、recent_event、event_abnormality、pending_status、meta_conversation、capability、advice_options、unknown。
requestedTools 只能使用 allowlist；REPAIR 只能提出 candidate draft patch；CANCEL 只能在使用者明確要求時提出；ADVISE 只是回答如何處理，不能執行取消；EXPLAIN、QUERY、SHOW_STATE、ADVISE 絕對不能 mutation。
answerContract 只能描述回答形式，可使用 mode=default/examples/summary/comparison/consequence/options/capability/capability_limits；requestedCount、exampleCount、capabilityCount、limitationCount 必須是 1 到 10；readOnlyExplicit 只能收緊權限，不能放寬。referenceScope 只能是 class、instance 或 none；「待確認資料通常如何處理」是 class，「這筆待確認資料怎麼辦」才是 instance；instance 沒有可靠對象時要 needsClarification=true，不能猜最近一筆。
先判斷語氣是查詢、解釋、建議、明確記錄、修改或取消；問題句、假設句、回顧句、引用上一輪內容都不是新的正式紀錄。若使用者是在詢問原因、目前狀態或衝突，即使有 open candidate，也不要自動改判 REPAIR；只有明確修改或取消意圖才可提出 candidate action。EXPLAIN 要根據提供的證據、資料關係與規則回答，資料不足就明說不足。
輸出 JSON：{"goal":"EXPLAIN","target":"candidate","topic":"candidate_conflict","requestedTools":["get_candidate_details"],"proposedAction":null,"needsClarification":false,"clarificationReason":null,"confidence":0.0}`;

function errorClass(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "ai_error";
}

export async function classifyConversationV2WithAi(
  ai: Ai | undefined,
  model: string | undefined,
  input: string,
  context: ConversationV2Context,
): Promise<ConversationV2AiResult> {
  if (!ai) return { attempted: false, plan: null, validation: "not_invoked" };
  try {
    const memoryRelevant = isConversationMemoryRelevant(input, context);
    const modelContext: ConversationV2Context = memoryRelevant
      ? context
      : {
        ...context,
        lastGoal: null,
        lastTopic: null,
        lastResponseType: null,
        lastExplainedIssue: null,
        lastExplainedObjectType: null,
        lastExplainedObjectId: null,
        semanticMemory: null,
      };
    const result = await ai.run(model ?? PRODUCTION_AI_MODEL, {
      messages: [
        { role: "system", content: CONVERSATION_V2_SYSTEM_PROMPT },
        { role: "user", content: `currentContext=${JSON.stringify(modelContext)}\nsemanticWorkingMemory=${JSON.stringify(modelContext.semanticMemory ?? null)}\nuserText=${clean(input)}` },
      ],
      max_tokens: 260,
      temperature: 0,
    });
    const parsed = parseConversationV2Plan(aiResponseText(result));
    return { attempted: true, plan: parsed, validation: parsed ? "schema_valid" : "schema_invalid" };
  } catch (error) {
    return { attempted: true, plan: null, validation: "ai_error", errorClass: errorClass(error) };
  }
}

function protectedReadGoal(goal: ConversationV2Goal): boolean {
  return goal === "EXPLAIN" || goal === "SHOW_STATE" || goal === "ADVISE" || goal === "QUERY";
}

/**
 * Merge an AI-first interpretation with deterministic policy guards.
 * The caller invokes the model before this function. High-confidence narrow
 * reads remain authoritative when a small model collapses distinct goals
 * into a generic read plan.
 */
export function chooseSafeConversationV2Plan(
  deterministic: ConversationV2Plan,
  modelPlan: ConversationV2Plan | null,
): ConversationV2Plan {
  if (!modelPlan) return deterministic;
  if (deterministic.topic === "today_attention") {
    return {
      ...deterministic,
      answerContract: deterministic.answerContract ?? modelPlan.answerContract,
    };
  }
  if (deterministic.goal === "RECORD" && modelPlan.goal !== "RECORD") return deterministic;
  if (protectedReadGoal(deterministic.goal) && !protectedReadGoal(modelPlan.goal)) return deterministic;
  if (deterministic.confidence >= 0.9 && protectedReadGoal(deterministic.goal) && modelPlan.goal !== deterministic.goal) return deterministic;
  if (deterministic.goal === "ADVISE" && modelPlan.goal !== "ADVISE") return deterministic;
  if (deterministic.goal === "CANCEL" && modelPlan.goal !== "CANCEL") return deterministic;
  if (deterministic.goal === "REPAIR" && deterministic.proposedAction && modelPlan.goal !== "REPAIR") return deterministic;
  if (modelPlan.confidence < 0.55 && deterministic.confidence >= modelPlan.confidence) return deterministic;
  return {
    ...modelPlan,
    target: modelPlan.target === "none" ? deterministic.target : modelPlan.target,
    topic: modelPlan.topic ?? deterministic.topic,
    requestedTools: modelPlan.requestedTools.length ? modelPlan.requestedTools : deterministic.requestedTools,
    answerContract: deterministic.answerContract ?? modelPlan.answerContract,
  };
}

export function buildConversationV2Plan(input: string, context: ConversationV2Context): ConversationV2Plan {
  return routeConversationV2Deterministic(input, context);
}
