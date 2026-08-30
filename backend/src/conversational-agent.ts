import { PRODUCTION_AI_MODEL } from "./analysis";
import { extractJsonValue, aiResponseText } from "./ai-json";
import { parseCandidateRepairIntent, type CandidateRepairField, type CandidateRepairIntent } from "./candidate-workflow";

export type ConversationalGoal =
  | "EXPLAIN"
  | "QUERY"
  | "SHOW_STATE"
  | "REPAIR"
  | "RECORD"
  | "CANCEL"
  | "NAVIGATE"
  | "CLARIFY"
  | "HELP"
  | "UNKNOWN";

export type ConversationalReadTarget =
  | "candidate"
  | "candidate_caretaker_clue"
  | "open_candidates"
  | "caretaker_farms"
  | "farm_caretakers";

export interface ConversationalContext {
  openCandidateCount: number;
  hasCurrentCandidate: boolean;
}

export interface ConversationalRoute {
  goal: ConversationalGoal;
  target?: ConversationalReadTarget;
  repair?: CandidateRepairIntent;
  field?: CandidateRepairField;
  clarificationReason?: string;
}

export interface ConversationalAiResult {
  attempted: boolean;
  route: ConversationalRoute | null;
  validation: "not_invoked" | "schema_valid" | "schema_invalid" | "ai_error";
  errorClass?: string;
}

/**
 * Static allowlist for the bounded conversational layer. The model never
 * receives arbitrary SQL or a D1 handle; these names document the only
 * application-level capabilities the router may select.
 */
export const CONVERSATIONAL_TOOL_ALLOWLIST = {
  read: [
    "loadAmbientCandidateInbox",
    "explainAmbientCandidate",
    "queryCaretakerFarms",
    "queryFarmCaretakers",
    "previewBufferedAmbientMessages",
  ],
  candidate: [
    "applyAmbientCandidatePatch",
    "applyAmbientCandidateEntityChoice",
    "dismissAmbientCandidateClue",
    "cancelAmbientCandidate",
    "setAmbientCandidateReview",
  ],
  official: [],
} as const;

const GOALS = new Set<ConversationalGoal>([
  "EXPLAIN", "QUERY", "SHOW_STATE", "REPAIR", "RECORD", "CANCEL", "NAVIGATE", "CLARIFY", "HELP", "UNKNOWN",
]);
const TARGETS = new Set<ConversationalReadTarget>([
  "candidate", "candidate_caretaker_clue", "open_candidates", "caretaker_farms", "farm_caretakers",
]);
const FIELDS = new Set<CandidateRepairField>(["farm", "house", "flock", "quantity", "event"]);

function clean(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function repairRoute(repair: CandidateRepairIntent): ConversationalRoute | null {
  if (repair.kind === "unknown") return null;
  if (repair.kind === "show") return { goal: "SHOW_STATE", target: "candidate", repair };
  if (repair.kind === "cancel") return { goal: "CANCEL", repair };
  if (repair.kind === "ignore" || repair.kind === "snooze" || repair.kind === "confirm") return { goal: "REPAIR", repair };
  if (repair.kind === "dismiss_clue") return { goal: "REPAIR", repair };
  if (repair.kind === "select_field" && !repair.field) return { goal: "CLARIFY", clarificationReason: "candidate_field_unspecified" };
  return { goal: "REPAIR", repair, field: repair.field };
}

/**
 * Deterministic-first bounded goal router. It is intentionally called only
 * after the Interaction Gate has admitted an explicit/active event; ordinary
 * group chat never reaches this function.
 */
export function routeConversationalGoal(input: string, context: ConversationalContext): ConversationalRoute {
  const text = clean(input);
  const repair = repairRoute(parseCandidateRepairIntent(text));
  if (repair) return repair;

  if (/(?:目前有哪些|有幾筆|有几笔|幾筆|几笔).*(?:待確認|待确认)/u.test(text)) {
    return { goal: "QUERY", target: "open_candidates" };
  }
  if (/(?:飼養者|饲养者).*(?:對應|对应|哪些|哪幾|哪几).*(?:雞場|鸡场|場|场)/u.test(text)) {
    return { goal: "QUERY", target: "caretaker_farms" };
  }
  if (/(?:雞場|鸡场|場|场).*(?:飼養者|饲养者)/u.test(text)) {
    return { goal: "QUERY", target: "farm_caretakers" };
  }
  if (/(?:對應|对应|哪些).*(?:雞場|鸡场|場|场)/u.test(text)) {
    return { goal: "QUERY", target: "caretaker_farms" };
  }
  if (/(?:有什麼不同|有什么不同|不一致|哪裡有問題|哪里有问题|為什麼|为什么|為何|为何|怎麼回事|怎么回事|知道哪些資料|知道哪些资料|目前.*(?:狀態|状态|資料|资料)|這筆.*(?:問題|怪|狀態)|这笔.*(?:问题|怪|状态))/u.test(text)) {
    return {
      goal: "EXPLAIN",
      target: /(?:飼養者|饲养者).*(?:不同|不一致)|(?:不同|不一致).*(?:飼養者|饲养者)/u.test(text)
        ? "candidate_caretaker_clue"
        : "candidate",
    };
  }
  if (/(?:幫助|帮助|怎麼用|怎么用|可以做什麼|可以做什么)/u.test(text)) return { goal: "HELP" };

  // A concrete operational/abnormal sentence belongs to the existing
  // record pipeline even when an unrelated Candidate is open in the group.
  // This prevents the conversational clarifier from stealing an explicit
  // `@Bot 金雞測試場咳嗽` or a plain quantity response.
  if (/^\d+(?:\.\d+)?$/u.test(text) || /(?:死亡|淘汰|咳嗽|咳|臭腳|白冠|風扇|水簾|飼料|飲水|出雞|設備|環境|災損)/u.test(text)) {
    return { goal: "UNKNOWN" };
  }

  // With an open Candidate, a vague explicit message is a bounded
  // clarification opportunity rather than a parser failure. Without one,
  // leave the existing record/query semantic router in charge.
  if (context.openCandidateCount > 0) {
    return { goal: "CLARIFY", clarificationReason: "candidate_goal_or_field_unspecified" };
  }
  return { goal: "UNKNOWN" };
}

const CONVERSATIONAL_SYSTEM_PROMPT = `你是金雞協會助理Ai的受限對話意圖解析器。只能輸出 JSON，不得輸出 Markdown、SQL、資料庫操作或任何正式寫入結果。
goal 只能是 EXPLAIN、QUERY、SHOW_STATE、REPAIR、RECORD、CANCEL、NAVIGATE、CLARIFY、HELP、UNKNOWN。
target 只能是 candidate、candidate_caretaker_clue、open_candidates、caretaker_farms、farm_caretakers 或 null。
field 只能是 farm、house、flock、quantity、event 或 null。value 只能是使用者明確提供的修正值，不能創造 ID。
READ/EXPLAIN/QUERY 不得產生 mutation。REPAIR/CANCEL 只能提出候選草稿修改意圖，真正驗證與寫入由應用程式完成。
輸出格式：{"goal":"...","target":null,"field":null,"value":null,"confidence":0}`;

function aiErrorClass(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "ai_error";
}

function parseConversationalAiOutput(raw: string): ConversationalRoute | null {
  const value = extractJsonValue(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.goal !== "string" || !GOALS.has(record.goal as ConversationalGoal)) return null;
  if (record.target !== null && record.target !== undefined && (typeof record.target !== "string" || !TARGETS.has(record.target as ConversationalReadTarget))) return null;
  if (record.field !== null && record.field !== undefined && (typeof record.field !== "string" || !FIELDS.has(record.field as CandidateRepairField))) return null;
  if (record.value !== null && record.value !== undefined && (typeof record.value !== "string" || record.value.length > 200)) return null;
  if (typeof record.confidence !== "number" || record.confidence < 0 || record.confidence > 1) return null;
  const goal = record.goal as ConversationalGoal;
  if (goal === "UNKNOWN") return { goal };
  if (record.value && !record.field) return null;
  if (goal === "REPAIR" && record.value && record.field) {
    return {
      goal,
      field: record.field as CandidateRepairField,
      repair: { kind: "set_field", field: record.field as CandidateRepairField, value: record.value, rawText: record.value },
    };
  }
  if (goal === "REPAIR" && !record.value) return { goal: "CLARIFY", clarificationReason: "ai_repair_field_unspecified" };
  return {
    goal,
    ...(record.target ? { target: record.target as ConversationalReadTarget } : {}),
    ...(record.field ? { field: record.field as CandidateRepairField } : {}),
    ...(goal === "CLARIFY" ? { clarificationReason: "ai_goal_or_field_unspecified" } : {}),
  };
}

export async function classifyConversationalGoalWithAi(
  ai: Ai | undefined,
  input: string,
  context: ConversationalContext,
): Promise<ConversationalAiResult> {
  if (!ai) return { attempted: false, route: null, validation: "not_invoked" };
  try {
    const result = await ai.run(PRODUCTION_AI_MODEL, {
      messages: [
        { role: "system", content: CONVERSATIONAL_SYSTEM_PROMPT },
        { role: "user", content: `currentContext=${JSON.stringify(context)}\nuserText=${clean(input)}` },
      ],
      // This model path deliberately uses prompt-constrained JSON and local
      // validation; it does not use response_format/json_schema.
      max_tokens: 220,
      temperature: 0,
    });
    const route = parseConversationalAiOutput(aiResponseText(result));
    return { attempted: true, route, validation: route ? "schema_valid" : "schema_invalid" };
  } catch (error) {
    return { attempted: true, route: null, validation: "ai_error", errorClass: aiErrorClass(error) };
  }
}

export function parseConversationalAiForTest(raw: string): ConversationalRoute | null {
  return parseConversationalAiOutput(raw);
}
