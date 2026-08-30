import { PRODUCTION_AI_MODEL } from "./analysis";
import { normalize } from "./core";
import { FarmResolver, type FarmAliasRecord, type FarmRecord } from "./farm-resolver";
import { buildAmbientDevSemanticSummary, serializeAmbientDevSemanticSummary } from "./ambient-dev-semantic";
import type { AmbientV2ResponseFormat } from "./ambient-extraction-v2";

export interface AmbientEnv {
  DB: D1Database;
  AI?: Ai;
}

export interface AmbientMentionee {
  index?: number;
  length?: number;
  isSelf?: boolean;
}

export interface AmbientCandidateItem {
  type: "mortality" | "cull" | "abnormal";
  quantity: number | null;
  raw: string;
  confidence: "low" | "medium" | "high";
  mentionCount?: number;
  firstSeen?: string;
  lastSeen?: string;
}

/**
 * The deliberately small model-owned extraction contract. This is not the
 * persisted Candidate shape: source lineage, evidence, resolution,
 * reconciliation, lifecycle state, and user authority are rebuilt by the
 * system from the selected source rows and database facts.
 *
 * The model makes exactly one decision for each selected request-local source.
 * That keeps coverage deterministic and prevents a small model from silently
 * dropping a source while it is also trying to group a full Candidate bundle.
 */
export type AmbientAiDecisionKind = "event" | "support" | "ignore";

export interface AmbientAiEventDecision {
  ref: string;
  kind: "event";
  type: AmbientCandidateItem["type"];
  quantity: number | null;
  quantityConfidence: NonNullable<AmbientCandidate["quantityConfidence"]>;
  raw: string;
  confidence: AmbientCandidateItem["confidence"];
  farmText?: string | null;
  houseText?: string | null;
  flockText?: string | null;
  caretakerText?: string | null;
}

export interface AmbientAiSupportDecision {
  ref: string;
  kind: "support";
  targetRef: string;
}

export interface AmbientAiIgnoreDecision {
  ref: string;
  kind: "ignore";
}

export type AmbientAiDecision = AmbientAiEventDecision | AmbientAiSupportDecision | AmbientAiIgnoreDecision;

/** Safe, development-only projection of a validated decision. */
export interface AmbientAiDecisionSummary {
  sourceRef: string;
  kind: AmbientAiDecisionKind;
  targetRef?: string;
}

export interface AmbientAiExtraction {
  decisions: AmbientAiDecision[];
}

/** Decision keys accepted from the model; system-owned fields are absent. */
export const AMBIENT_AI_EXTRACTION_ALLOWED_KEYS = [
  "ref",
  "kind",
  "targetRef",
  "type",
  "quantity",
  "quantityConfidence",
  "raw",
  "confidence",
  "farmText",
  "houseText",
  "flockText",
  "caretakerText",
] as const;

export const AMBIENT_AI_EXTRACTION_TOP_LEVEL_ALLOWED_KEYS = ["decisions"] as const;

/** Kept as a named export for contract tests; model output has no item array. */
export const AMBIENT_AI_EXTRACTION_ITEM_ALLOWED_KEYS = AMBIENT_AI_EXTRACTION_ALLOWED_KEYS;

const AMBIENT_MAX_REQUEST_SOURCE_REFS = 100;
const AMBIENT_REQUEST_SOURCE_REF_PATTERN = /^m[1-9]\d{0,2}$/u;

/**
 * The provider-facing contract is intentionally smaller than
 * AMBIENT_CANDIDATE_JSON_SCHEMA below. The latter is the persisted review
 * object; this schema is only the model-owned semantic proposal. Lineage,
 * evidence, resolution, reconciliation, and lifecycle fields are added by
 * deterministic application code after this contract passes.
 */
export const AMBIENT_AI_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    decisions: {
      type: "array",
      maxItems: AMBIENT_MAX_REQUEST_SOURCE_REFS,
      items: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              ref: { type: "string", pattern: "^m[1-9]\\d{0,2}$", maxLength: 4 },
              kind: { const: "event" },
              type: { type: "string", enum: ["mortality", "cull", "abnormal"] },
              quantity: { type: ["number", "null"] },
              quantityConfidence: { type: "string", enum: ["unknown", "low", "medium", "high"] },
              raw: { type: "string", minLength: 1, maxLength: 160 },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
              farmText: { type: ["string", "null"], maxLength: 160 },
              houseText: { type: ["string", "null"], maxLength: 80 },
              flockText: { type: ["string", "null"], maxLength: 160 },
              caretakerText: { type: ["string", "null"], maxLength: 160 },
            },
            required: ["ref", "kind", "type", "quantity", "quantityConfidence", "raw", "confidence"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              ref: { type: "string", pattern: "^m[1-9]\\d{0,2}$", maxLength: 4 },
              kind: { const: "support" },
              targetRef: { type: "string", pattern: "^m[1-9]\\d{0,2}$", maxLength: 4 },
            },
            required: ["ref", "kind", "targetRef"],
          },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              ref: { type: "string", pattern: "^m[1-9]\\d{0,2}$", maxLength: 4 },
              kind: { const: "ignore" },
            },
            required: ["ref", "kind"],
          },
        ],
      },
    },
  },
  required: ["decisions"],
} as const;

export type AmbientCandidateState =
  | "new"
  | "unresolved_entity"
  | "unresolved_quantity"
  | "conflict"
  | "possibly_recorded"
  | "already_recorded"
  | "no_actionable_event"
  | "system_failure";

export type AmbientResolutionStatus = "resolved" | "ambiguous" | "unresolved";
export type AmbientReconciliationStatus = "not_recorded" | "possibly_recorded" | "already_recorded";

export interface AmbientCandidateResolution {
  status: AmbientResolutionStatus;
  caretakerId?: string | null;
  caretakerText?: string | null;
  resolvedFarmId?: string | null;
  candidateFarmIds?: string[];
  candidateFarmNames?: string[];
  resolvedHouseId?: string | null;
  candidateHouseIds?: string[];
  candidateHouseNames?: string[];
  resolvedFlockId?: string | null;
  candidateFlockIds?: string[];
}

export interface AmbientCandidateReconciliation {
  status: AmbientReconciliationStatus;
  matchingOfficialRecordIds: string[];
  matchReasons: string[];
  matchConfidence: "high" | "medium" | "low";
  matchingOfficialRecords?: Array<{
    farmName: string;
    eventType: string;
    quantity: number | null;
    occurredAt: string;
    recordKind: "operational" | "abnormal";
  }>;
}

export interface AmbientCandidateUserOverrides {
  farm?: { farmId: string; status: "selected"; at?: string };
  caretaker?: { status: "overridden" | "dismissed"; at?: string };
}

/**
 * Bounded provenance retained with an Ambient Candidate. This is deliberately
 * smaller than the source transcript: it keeps the fact, its origin, and the
 * confidence needed to explain a decision after the 24h source buffer is
 * cleaned up.
 */
export interface AmbientCandidateEvidence {
  evidenceType: "source_fact" | "caretaker_clue" | "farm_clue" | "house_clue" | "flock_clue" | "explicit_user_choice" | "resolver_fact" | "reconciliation_fact";
  field: string;
  normalizedValue: string | number | null;
  sourceRef?: string | null;
  sourceTimestamp?: string | null;
  sourceUser?: string | null;
  confidence?: "low" | "medium" | "high";
  extractionSource?: "ai" | "deterministic" | "explicit_user" | "resolver";
}

export interface AmbientCandidateConflictEvidence {
  type: string;
  evidenceRefs: string[];
  facts: {
    caretakerClues: string[];
    selectedFarm?: string | null;
  };
  dbFacts: {
    activeCaretakerAssignment?: boolean;
    assignedFarms?: string[];
  };
  businessRule: {
    caretakerRequiredForMortality: boolean;
  };
  blocking: boolean;
  overrideAllowed: boolean;
  resolutionStatus?: "unresolved" | "explicit_user_choice_wins" | "dismissed";
}

export interface AmbientCandidate {
  farmText: string | null;
  caretakerText?: string | null;
  caretakerClues?: string[];
  houseText?: string | null;
  flockText?: string | null;
  eventType?: "mortality" | "cull" | "abnormal";
  quantity?: number | null;
  quantityConfidence?: "unknown" | "low" | "medium" | "high";
  rawTexts?: string[];
  sourceMessageIds?: string[];
  sourceTimestamps?: string[];
  sourceUsers?: string[];
  uncertainties?: string[];
  conflicts?: string[];
  items: AmbientCandidateItem[];
  conflict: boolean;
  conflictText?: string | null;
  evidence?: AmbientCandidateEvidence[];
  conflictEvidence?: AmbientCandidateConflictEvidence[];
  resolution?: AmbientCandidateResolution;
  reconciliation?: AmbientCandidateReconciliation;
  /** Explicit human authority outranks inferred farm/caretaker clues. */
  userOverrides?: AmbientCandidateUserOverrides;
  state?: AmbientCandidateState;
}

export interface AmbientCandidateBundle {
  candidates: AmbientCandidate[];
  sourceMessageIds?: string[];
  sourceTimestamps?: string[];
  sourceUsers?: string[];
}

export type AmbientValidationRootKind = "object" | "array" | "string" | "number" | "boolean" | "null" | "unknown";
export type AmbientValidationEnvelopeKind = "decisions" | "candidates" | "events" | "top_level_array" | "other_object" | "unknown";
export type AmbientValidationActualType = "string" | "number" | "boolean" | "array" | "object" | "null" | "missing" | "unknown";
export type AmbientValidationIssueCode =
  | "JSON_PARSE_FAILED"
  | "ROOT_TYPE_INVALID"
  | "ENVELOPE_INVALID"
  | "CANDIDATES_NOT_ARRAY"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_ENUM"
  | "INVALID_FIELD_TYPE"
  | "NULL_NOT_ALLOWED"
  | "UNKNOWN_FIELD"
  | "EVENT_SCHEMA_INVALID"
  | "EMPTY_EVENT_SET"
  | "OTHER_SCHEMA_ERROR"
  | "DECISIONS_NOT_ARRAY"
  | "SELECTED_SOURCE_UNACCOUNTED"
  | "INVALID_SOURCE_REFERENCE"
  | "SOURCE_DECISION_MISSING"
  | "UNKNOWN_SOURCE_REFERENCE"
  | "DUPLICATE_SOURCE_DECISION"
  | "INVALID_SUPPORT_TARGET"
  | "INVALID_CONTEXT_DECISION_REF"
  | "INVALID_EVENT_SCHEMA";

/**
 * Safe, bounded validation evidence. It intentionally contains field names,
 * types, paths, and allowlisted technical enum tokens only; never values from
 * farm names, symptoms, notes, prompts, or LINE messages.
 */
export interface AmbientValidationDiagnostics {
  rootKind: AmbientValidationRootKind;
  envelopeKind: AmbientValidationEnvelopeKind;
  candidateCount: number | null;
  issueCount: number;
  firstIssueCode: AmbientValidationIssueCode | null;
  firstIssuePath: string | null;
  firstExpectedType: string | null;
  firstActualType: AmbientValidationActualType | null;
  failedCandidateIndex: number | null;
  structuralKeysJson: string;
  issueSummaryJson: string;
  safeEnumActual: string | null;
}

export type AmbientDecisionSchemaStatus = "VALID" | "INVALID" | "MISSING" | "NOT_APPLICABLE";
export type AmbientDecisionSchemaRawStatus = "PRESENT" | "MISSING" | "NULL" | "EMPTY" | "INVALID" | "NOT_APPLICABLE";
export type AmbientDecisionSchemaEnumStatus = "VALID" | "INVALID" | "MISSING" | "NOT_APPLICABLE";
export type AmbientDecisionSchemaFieldName = typeof AMBIENT_AI_EXTRACTION_ALLOWED_KEYS[number];

/**
 * Developer-only, value-free schema evidence for a parsed model decision.
 * This deliberately contains key names, type classes, and allowlisted status
 * values only; it never carries a model string, source text, or identifier.
 */
export interface AmbientDecisionSchemaDiagnostic {
  decisionOrdinal: number;
  safeRef: string | null;
  kind: AmbientAiDecisionKind | "unknown";
  presentKeys: AmbientDecisionSchemaFieldName[];
  missingRequiredKeys: AmbientDecisionSchemaFieldName[];
  unknownKeysPresent: boolean;
  fieldTypeClasses: Array<{ field: AmbientDecisionSchemaFieldName; type: AmbientValidationActualType }>;
  typeEnumStatus: AmbientDecisionSchemaEnumStatus;
  quantityKind: AmbientValidationActualType | "not_applicable";
  quantityNullabilityStatus: AmbientDecisionSchemaStatus;
  quantityConfidenceStatus: AmbientDecisionSchemaEnumStatus;
  confidenceStatus: AmbientDecisionSchemaEnumStatus;
  rawStatus: AmbientDecisionSchemaRawStatus;
  safeTargetRef: string | null;
  targetRefStatus: AmbientDecisionSchemaStatus;
  targetRefSelectedStatus: AmbientDecisionSchemaStatus;
}

export interface AmbientDecisionSchemaDiagnostics {
  rootKind: AmbientValidationRootKind;
  envelopeKind: AmbientValidationEnvelopeKind;
  decisionCount: number | null;
  unknownTopLevelKeys: boolean;
  decisions: AmbientDecisionSchemaDiagnostic[];
  issueCount: number;
  firstIssueCode: AmbientValidationIssueCode | null;
  firstIssuePath: string | null;
  firstExpectedType: string | null;
  firstActualType: AmbientValidationActualType | null;
}

export type AmbientTransportValueKind =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "null"
  | "missing"
  | "unknown"
  | "not_applicable";

export type AmbientTransportIssueCode =
  | "NONE"
  | "RESPONSE_FIELD_MISSING"
  | "EMPTY_COMPLETION"
  | "NON_JSON_COMPLETION"
  | "POSSIBLE_TRUNCATION"
  | "JSON_PARSE_FAILED";

export type AmbientJsonParseErrorCode =
  | "UNEXPECTED_END"
  | "UNEXPECTED_TOKEN"
  | "EXPECTED_PROPERTY_NAME"
  | "EXPECTED_COLON"
  | "EXPECTED_COMMA_OR_END"
  | "INVALID_ESCAPE"
  | "INVALID_NUMBER"
  | "INVALID_LITERAL"
  | "CONTROL_CHARACTER"
  | "OTHER_JSON_SYNTAX_ERROR";

export type AmbientJsonCharacterClass =
  | "quote"
  | "colon"
  | "comma"
  | "brace_open"
  | "brace_close"
  | "bracket_open"
  | "bracket_close"
  | "backslash"
  | "letter"
  | "digit"
  | "whitespace"
  | "other"
  | "end_of_input";

export type AmbientJsonParseErrorOffsetBucket = "0-99" | "100-199" | "200-399" | "400-799" | "800+";

/**
 * Bounded JSON syntax evidence. It deliberately contains no response text or
 * error message; the latter may include a provider response fragment.
 */
export interface AmbientJsonSyntaxDiagnostics {
  parseErrorCode: AmbientJsonParseErrorCode | null;
  parseErrorOffsetBucket: AmbientJsonParseErrorOffsetBucket | null;
  nearErrorCharClass: AmbientJsonCharacterClass | null;
  braceBalance: number;
  bracketBalance: number;
  braceMinBalance: number;
  bracketMinBalance: number;
  stringStateClosed: boolean;
  escapePendingAtEnd: boolean;
  newlineCount: number;
  colonCount: number;
  commaCount: number;
  doubleQuoteCount: number;
  firstNonWhitespaceClass: AmbientJsonCharacterClass | null;
  lastNonWhitespaceClass: AmbientJsonCharacterClass | null;
  markdownFenceOpenCount: number;
  markdownFenceCloseCount: number;
  hasUnbalancedBraces: boolean;
  hasUnbalancedBrackets: boolean;
  endsInsideString: boolean;
  endsAfterEscape: boolean;
  possibleTrailingCommaBeforeClose: boolean;
}

export type AmbientEffectiveOutputBudgetSource =
  | "explicit"
  | "cloudflare_default_256"
  | "unknown";

// Keep the Ambient output budget explicit and bounded. This is intentionally
// separate from parser behavior so a transport diagnosis cannot silently
// change the extraction contract.
export const AMBIENT_AI_MAX_TOKENS = 1536;

/**
 * Bounded provider-to-parser evidence. It deliberately contains no response
 * text, prompt, source message, token, or provider payload.
 */
export interface AmbientTransportDiagnostics {
  providerResultKind: AmbientTransportValueKind;
  responseFieldPresent: boolean;
  responseValueKind: AmbientTransportValueKind;
  completionLength: number;
  trimmedLength: number;
  startsWithBrace: boolean;
  startsWithBracket: boolean;
  endsWithBrace: boolean;
  endsWithBracket: boolean;
  markdownFenceDetected: boolean;
  jsonFenceDetected: boolean;
  leadingNonJsonDetected: boolean;
  trailingNonJsonDetected: boolean;
  possibleTruncation: boolean;
  finishReason: string | null;
  stopReason: string | null;
  issueCode: AmbientTransportIssueCode;
  requestedMaxTokens: number | null;
  usagePromptTokens: number | null;
  usageCompletionTokens: number | null;
  usageTotalTokens: number | null;
  effectiveOutputBudgetSource: AmbientEffectiveOutputBudgetSource;
  selectedSourceCount: number;
  parsedDecisionCount: number | null;
  parsedEventDecisionCount: number | null;
  parsedSupportDecisionCount: number | null;
  parsedIgnoreDecisionCount: number | null;
  parsedCandidateCount: number | null;
  parsedItemCount: number | null;
  outputSizeAnomaly: boolean;
  accountedSelectedSourceCount: number | null;
  unaccountedSelectedSourceCount: number | null;
  ignoredSelectedSourceCount: number | null;
  supportingSourceCount: number | null;
  selectedSourceCoverageStatus: "pass" | "failed" | "not_available";
  firstBadSemanticStage: string | null;
  ignoredSelectedSourceOrdinals: string[] | null;
  unaccountedSourceOrdinals: string[] | null;
  failureDetailClass: "json_parse_invalid" | null;
  jsonSyntax: AmbientJsonSyntaxDiagnostics;
}

export interface AmbientSourceCoverageDiagnostics {
  selectedSourceCount: number;
  accountedSelectedSourceCount: number;
  unaccountedSelectedSourceCount: number;
  ignoredSelectedSourceCount: number;
  supportingSourceCount: number;
  decisionCount?: number;
  eventDecisionCount?: number;
  supportDecisionCount?: number;
  ignoreDecisionCount?: number;
  missingDecisionRefs?: string[];
  unknownDecisionRefs?: string[];
  duplicateDecisionRefs?: string[];
  selectedSourceCoverageStatus: "pass" | "failed";
  /** Request-local refs only; never durable LINE/D1 identifiers. */
  unaccountedSourceRefs: string[];
  ignoredSelectedSourceRefs?: string[];
  /** Safe cohort ordinals for development-only rendering. */
  ignoredSelectedSourceOrdinals?: string[];
  unaccountedSourceOrdinals?: string[];
}

export interface AmbientBufferedMessage {
  id: string;
  organizationId: string;
  lineGroupId: string;
  lineUserId: string;
  lineMessageId: string;
  eventTimestamp: string;
  text: string;
  digestHour: string;
}

/**
 * The exact provider request used by the Production Ambient extraction path.
 * A remote development adapter may forward this request to a temporary
 * Wrangler dev session, but it must not create a second prompt or parameter
 * contract.
 */
export interface AmbientAiRequestInput {
  messages: Array<{ role: "system" | "user"; content: string }>;
  max_tokens: number;
  temperature: number;
  /** Developer-only structured request fields; absent from Production V1 requests. */
  response_format?: AmbientV2ResponseFormat;
  stream?: boolean;
}

export interface AmbientExtractionResult {
  attempted: boolean;
  bundle: AmbientCandidateBundle | null;
  validation: "not_invoked" | "schema_valid" | "schema_invalid" | "ai_error";
  errorClass?: string;
  validationDiagnostics?: AmbientValidationDiagnostics;
  /** Developer-only value-free schema fingerprint for eval/debug evidence. */
  decisionSchemaDiagnostics?: AmbientDecisionSchemaDiagnostics;
  transportDiagnostics?: AmbientTransportDiagnostics;
  sourceCoverage?: AmbientSourceCoverageDiagnostics;
  /** Safe source-ordinal projection for development observability only. */
  decisionSummaries?: AmbientAiDecisionSummary[];
}

const AMBIENT_TERMS = [
  "死亡", "死", "死雞", "死鸡", "掛了", "挂了", "淘汰", "咳嗽", "咳", "喘", "臭腳", "臭脚", "白冠",
  "拉肚子", "腹瀉", "腹泻", "跛腳", "跛脚", "精神差", "採食下降", "采食下降", "飲水異常", "饮水异常",
  "停電", "停电", "風扇", "风扇", "水簾", "水帘", "飲水線", "饮水线", "飼料線", "饲料线", "發電機", "发电机",
  "照明", "通風", "通风", "異味", "异味", "積水", "积水", "風災", "风灾", "淹水", "屋頂", "屋顶",
  "受損", "受损", "氣溫", "气温", "高溫", "高温", "低溫", "低温", "熱", "热", "雞場", "鸡场", "場", "场", "舍",
];

const OPERATIONAL_OR_ABNORMAL_PATTERN = /(?:死亡|死(?:雞|鸡)?|掛了|挂了|淘汰|咳嗽|咳|喘|臭腳|臭脚|白冠|拉肚子|腹瀉|腹泻|跛腳|跛脚|精神差|採食下降|采食下降|飲水異常|饮水异常|停電|停电|風扇|风扇|水簾|水帘|飲水線|饮水线|飼料線|饲料线|發電機|发电机|照明|通風|通风|異味|异味|積水|积水|風災|风灾|淹水|屋頂|屋顶|受損|受损|氣溫|气温|高溫|高温|低溫|低温)/u;
const FARM_OR_FLOCK_CONTEXT = /(?:雞場|鸡场|場|场|雞舍|鸡舍|舍|批次|入雛|入雏|隻|只|雞|鸡)/u;
const HUMAN_ONLY_PREFIX = /^(?:我|我一直|我在|自己|家人|小孩|孩子)(?:一直|在)?/u;

export function hasSelfMention(mentionees: AmbientMentionee[] | undefined): boolean {
  return Boolean(mentionees?.some((mentionee) => mentionee.isSelf === true));
}

/**
 * LINE mention indexes are metadata, not user text. Remove only validated
 * self-mention ranges; never guess a display name from the visible text.
 */
export function stripSelfMention(text: string, mentionees: AmbientMentionee[] | undefined): string {
  if (!text || !mentionees?.length) return text.trim();
  const ranges = mentionees
    .filter((mentionee) => mentionee.isSelf === true)
    .flatMap((mentionee) => Number.isInteger(mentionee.index) && Number.isInteger(mentionee.length)
      ? [{ index: mentionee.index as number, length: mentionee.length as number }]
      : [])
    .filter((range) => range.index >= 0 && range.length > 0 && range.index + range.length <= text.length)
    .sort((left, right) => right.index - left.index);
  let result = text;
  for (const range of ranges) result = `${result.slice(0, range.index)} ${result.slice(range.index + range.length)}`;
  return result.replace(/\s+/gu, " ").trim();
}

export type InteractionGateDecision = "explicit" | "active" | "quiet";

export function interactionGateDecision(input: {
  eventType: string;
  hasMention?: boolean;
  isSystemCommand?: boolean;
  hasActiveSession?: boolean;
  hasPendingState?: boolean;
}): InteractionGateDecision {
  if (input.eventType === "postback") return "explicit";
  if (input.eventType !== "message") return "quiet";
  if (input.hasMention || input.isSystemCommand) return "explicit";
  if (input.hasActiveSession || input.hasPendingState) return "active";
  return "quiet";
}

export function ambientHourBucket(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:00:00+08:00`;
}

export function previousAmbientHourBucket(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  return ambientHourBucket(new Date(date.getTime() - 60 * 60 * 1000));
}

export function ambientMessageMayBeRelevant(text: string): boolean {
  const normalized = text.normalize("NFKC").trim();
  if (!normalized || normalized.length > 2000) return false;
  if (!AMBIENT_TERMS.some((term) => normalized.includes(term))) return false;
  // Do not turn a person's ordinary self-report into a chicken candidate on
  // a keyword alone. A surrounding chicken/farm cue or explicit operation is
  // required; the AI still makes the final candidate decision.
  if (HUMAN_ONLY_PREFIX.test(normalized) && !FARM_OR_FLOCK_CONTEXT.test(normalized)) return false;
  if (/^(?:今天真的很熱|今天真的很热|好熱|好热|很熱|很热)$/u.test(normalized)) return false;
  const contextualHeat = /(?:熱|热)/u.test(normalized) && FARM_OR_FLOCK_CONTEXT.test(normalized);
  return OPERATIONAL_OR_ABNORMAL_PATTERN.test(normalized) || contextualHeat;
}

export function ambientNormalExpiryAt(eventTimestamp: string): string {
  return new Date(Date.parse(eventTimestamp) + 24 * 60 * 60 * 1000).toISOString();
}

export function ambientPrefilter(messages: AmbientBufferedMessage[]): AmbientBufferedMessage[] {
  return messages.filter((message) => ambientMessageMayBeRelevant(message.text));
}

function aiResponseText(result: unknown): string {
  if (typeof result === "string") return result;
  if (typeof result !== "object" || result === null) return "";
  const response = (result as { response?: unknown }).response;
  if (typeof response === "string") return response;
  return response && typeof response === "object" ? JSON.stringify(response) : "";
}

const AMBIENT_TRANSPORT_REASON_ALLOWLIST = new Set([
  "stop", "length", "max_tokens", "token_limit", "eos", "completed", "error", "unknown",
]);

function ambientTransportValueKind(value: unknown, missing = false): AmbientTransportValueKind {
  if (missing) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return "unknown";
}

function ambientSafeTransportReason(result: unknown, keys: string[]): string | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") continue;
    const normalized = value.trim().toLowerCase();
    if (AMBIENT_TRANSPORT_REASON_ALLOWLIST.has(normalized)) return normalized;
  }
  return null;
}

function ambientSafeUsageNumber(result: unknown, key: "prompt_tokens" | "completion_tokens" | "total_tokens"): number | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return null;
  const usage = (result as Record<string, unknown>).usage;
  if (typeof usage !== "object" || usage === null || Array.isArray(usage)) return null;
  const value = (usage as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000 ? value : null;
}

interface AmbientJsonScanResult extends Omit<AmbientJsonSyntaxDiagnostics, "parseErrorCode" | "parseErrorOffsetBucket" | "nearErrorCharClass"> {
  invalidEscapeDetected: boolean;
}

function ambientJsonCharacterClass(value: string | undefined): AmbientJsonCharacterClass {
  if (!value) return "end_of_input";
  if (value === '"') return "quote";
  if (value === ":") return "colon";
  if (value === ",") return "comma";
  if (value === "{") return "brace_open";
  if (value === "}") return "brace_close";
  if (value === "[") return "bracket_open";
  if (value === "]") return "bracket_close";
  if (value === "\\") return "backslash";
  if (/\s/u.test(value)) return "whitespace";
  if (/\p{L}/u.test(value)) return "letter";
  if (/\p{N}/u.test(value)) return "digit";
  return "other";
}

function emptyAmbientJsonSyntaxDiagnostics(): AmbientJsonSyntaxDiagnostics {
  return {
    parseErrorCode: null,
    parseErrorOffsetBucket: null,
    nearErrorCharClass: null,
    braceBalance: 0,
    bracketBalance: 0,
    braceMinBalance: 0,
    bracketMinBalance: 0,
    stringStateClosed: true,
    escapePendingAtEnd: false,
    newlineCount: 0,
    colonCount: 0,
    commaCount: 0,
    doubleQuoteCount: 0,
    firstNonWhitespaceClass: null,
    lastNonWhitespaceClass: null,
    markdownFenceOpenCount: 0,
    markdownFenceCloseCount: 0,
    hasUnbalancedBraces: false,
    hasUnbalancedBrackets: false,
    endsInsideString: false,
    endsAfterEscape: false,
    possibleTrailingCommaBeforeClose: false,
  };
}

function scanAmbientJsonStructure(input: string): AmbientJsonScanResult {
  const bounded = input.slice(0, 100_000);
  let braceBalance = 0;
  let bracketBalance = 0;
  let braceMinBalance = 0;
  let bracketMinBalance = 0;
  let inString = false;
  let escapePending = false;
  let invalidEscapeDetected = false;
  let newlineCount = 0;
  let colonCount = 0;
  let commaCount = 0;
  let doubleQuoteCount = 0;
  let possibleTrailingCommaBeforeClose = false;
  let lastStructuralToken: string | null = null;

  for (let index = 0; index < bounded.length; index += 1) {
    const character = bounded[index];
    if (character === "\n") newlineCount = Math.min(newlineCount + 1, 100_000);
    if (inString) {
      if (escapePending) {
        if (!(character === '"' || character === "\\" || character === "/" || character === "b" || character === "f" || character === "n" || character === "r" || character === "t" || character === "u")) {
          invalidEscapeDetected = true;
        } else if (character === "u") {
          const unicodeDigits = bounded.slice(index + 1, index + 5);
          if (unicodeDigits.length === 4 && !/^[0-9a-f]{4}$/iu.test(unicodeDigits)) invalidEscapeDetected = true;
        }
        escapePending = false;
        continue;
      }
      if (character === "\\") {
        escapePending = true;
        continue;
      }
      if (character === '"') {
        inString = false;
        doubleQuoteCount = Math.min(doubleQuoteCount + 1, 100_000);
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      doubleQuoteCount = Math.min(doubleQuoteCount + 1, 100_000);
      continue;
    }
    if (character === "{") {
      braceBalance += 1;
      braceMinBalance = Math.min(braceMinBalance, braceBalance);
      lastStructuralToken = character;
      continue;
    }
    if (character === "}") {
      if (lastStructuralToken === ",") possibleTrailingCommaBeforeClose = true;
      braceBalance -= 1;
      braceMinBalance = Math.min(braceMinBalance, braceBalance);
      lastStructuralToken = character;
      continue;
    }
    if (character === "[") {
      bracketBalance += 1;
      bracketMinBalance = Math.min(bracketMinBalance, bracketBalance);
      lastStructuralToken = character;
      continue;
    }
    if (character === "]") {
      if (lastStructuralToken === ",") possibleTrailingCommaBeforeClose = true;
      bracketBalance -= 1;
      bracketMinBalance = Math.min(bracketMinBalance, bracketBalance);
      lastStructuralToken = character;
      continue;
    }
    if (character === ":") {
      colonCount = Math.min(colonCount + 1, 100_000);
      lastStructuralToken = character;
      continue;
    }
    if (character === ",") {
      commaCount = Math.min(commaCount + 1, 100_000);
      lastStructuralToken = character;
    }
  }

  const nonWhitespace = bounded.trim();
  let markdownFenceOpenCount = 0;
  let markdownFenceCloseCount = 0;
  let fenceOffset = nonWhitespace.indexOf("```");
  let fenceOccurrence = 0;
  while (fenceOffset >= 0 && fenceOccurrence < 32) {
    if (fenceOccurrence % 2 === 0) markdownFenceOpenCount += 1;
    else markdownFenceCloseCount += 1;
    fenceOccurrence += 1;
    const nextOffset = nonWhitespace.indexOf("```", fenceOffset + 3);
    fenceOffset = nextOffset;
  }

  return {
    braceBalance,
    bracketBalance,
    braceMinBalance,
    bracketMinBalance,
    stringStateClosed: !inString,
    escapePendingAtEnd: escapePending,
    newlineCount,
    colonCount,
    commaCount,
    doubleQuoteCount,
    firstNonWhitespaceClass: nonWhitespace ? ambientJsonCharacterClass(nonWhitespace[0]) : null,
    lastNonWhitespaceClass: nonWhitespace ? ambientJsonCharacterClass(nonWhitespace[nonWhitespace.length - 1]) : null,
    markdownFenceOpenCount,
    markdownFenceCloseCount,
    hasUnbalancedBraces: braceBalance !== 0 || braceMinBalance < 0,
    hasUnbalancedBrackets: bracketBalance !== 0 || bracketMinBalance < 0,
    endsInsideString: inString,
    endsAfterEscape: inString && escapePending,
    possibleTrailingCommaBeforeClose,
    invalidEscapeDetected,
  };
}

function ambientSyntaxErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

/**
 * Classify a runtime SyntaxError without retaining its message. Runtime
 * messages may contain a response fragment, so only this allowlisted enum is
 * allowed to cross the diagnostics boundary.
 */
export function classifyAmbientJsonSyntaxError(error: unknown): AmbientJsonParseErrorCode {
  const message = ambientSyntaxErrorMessage(error).toLowerCase();
  if (/unexpected\s+end|unterminated\s+string|end\s+of\s+(?:json|input)/u.test(message)) return "UNEXPECTED_END";
  if (/bad\s+(?:escaped?\s+character|escape)|invalid\s+escape/u.test(message)) return "INVALID_ESCAPE";
  if (/control\s+character/u.test(message)) return "CONTROL_CHARACTER";
  if (/unexpected\s+number|invalid\s+number|leading\s+zero/u.test(message)) return "INVALID_NUMBER";
  if (/expected\s+(?:double-quoted\s+)?property\s+name|expected\s+property\s+name\s+or/u.test(message)) return "EXPECTED_PROPERTY_NAME";
  if (/expected\s+(?::|colon)/u.test(message)) return "EXPECTED_COLON";
  if (/expected\s+comma|expected\s+['"]?,['"]?\s+or/u.test(message)) return "EXPECTED_COMMA_OR_END";
  if (/unexpected\s+(?:keyword|identifier)|invalid\s+(?:literal|value)/u.test(message)) return "INVALID_LITERAL";
  if (/unexpected\s+(?:token|character)/u.test(message)) return "UNEXPECTED_TOKEN";
  return "OTHER_JSON_SYNTAX_ERROR";
}

function ambientParseErrorOffset(error: unknown): number | null {
  const message = ambientSyntaxErrorMessage(error);
  const match = message.match(/\bposition\s+(\d+)\b/iu);
  if (!match) return null;
  const offset = Number(match[1]);
  return Number.isSafeInteger(offset) && offset >= 0 && offset <= 100_000 ? offset : null;
}

function ambientParseErrorOffsetBucket(offset: number | null): AmbientJsonParseErrorOffsetBucket | null {
  if (offset === null) return null;
  if (offset < 100) return "0-99";
  if (offset < 200) return "100-199";
  if (offset < 400) return "200-399";
  if (offset < 800) return "400-799";
  return "800+";
}

function ambientJsonSyntaxFromScan(scan: AmbientJsonScanResult): AmbientJsonSyntaxDiagnostics {
  const { invalidEscapeDetected, ...boundedScan } = scan;
  void invalidEscapeDetected;
  return {
    ...boundedScan,
    parseErrorCode: null,
    parseErrorOffsetBucket: null,
    nearErrorCharClass: null,
  };
}

function ambientJsonSyntaxDiagnostics(
  scan: AmbientJsonScanResult,
  error: unknown,
  parseCandidate: string,
): AmbientJsonSyntaxDiagnostics {
  const offset = ambientParseErrorOffset(error);
  const parseErrorCode: AmbientJsonParseErrorCode = scan.invalidEscapeDetected
    ? "INVALID_ESCAPE"
    : classifyAmbientJsonSyntaxError(error);
  return {
    ...ambientJsonSyntaxFromScan(scan),
    parseErrorCode,
    parseErrorOffsetBucket: ambientParseErrorOffsetBucket(offset),
    nearErrorCharClass: offset === null ? null : ambientJsonCharacterClass(parseCandidate[offset]),
  };
}

interface AmbientParsedJson {
  value: unknown;
  syntax: AmbientJsonSyntaxDiagnostics;
}

function ambientTransportDiagnostics(
  result: unknown,
  completion: string,
  parseFailed: boolean,
  requestedMaxTokens: number | null,
  selectedSourceCount = 0,
  parsedValue: unknown = null,
  sourceCoverage: AmbientSourceCoverageDiagnostics | null = null,
  jsonSyntax: AmbientJsonSyntaxDiagnostics | null = null,
): AmbientTransportDiagnostics {
  const providerResultKind = ambientTransportValueKind(result);
  const isStructuredProviderResult = typeof result === "object" && result !== null && !Array.isArray(result);
  const responseFieldPresent = isStructuredProviderResult && Object.prototype.hasOwnProperty.call(result, "response");
  const responseValueKind = typeof result === "string"
    ? "not_applicable"
    : isStructuredProviderResult
      ? ambientTransportValueKind(
        (result as Record<string, unknown>).response,
        !responseFieldPresent || (result as Record<string, unknown>).response === undefined,
      )
      : "not_applicable";
  const trimmed = completion.trim();
  const cappedLength = Math.min(completion.length, 100_000);
  const cappedTrimmedLength = Math.min(trimmed.length, 100_000);
  const startsWithBrace = trimmed.startsWith("{");
  const startsWithBracket = trimmed.startsWith("[");
  const endsWithBrace = trimmed.endsWith("}");
  const endsWithBracket = trimmed.endsWith("]");
  const markdownFenceDetected = /^```(?:[A-Za-z0-9_-]+)?/u.test(trimmed);
  const jsonFenceDetected = /^```json(?:\s|$)/iu.test(trimmed);
  const leadingNonJsonDetected = Boolean(trimmed) && !startsWithBrace && !startsWithBracket && !markdownFenceDetected;
  const trailingNonJsonDetected = Boolean(trimmed) && !endsWithBrace && !endsWithBracket && !/```\s*$/u.test(trimmed);
  const firstJsonStart = [trimmed.indexOf("{"), trimmed.indexOf("[")]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? -1;
  const unclosedJson = firstJsonStart >= 0
    && ((trimmed[firstJsonStart] === "{" && trimmed.lastIndexOf("}") < firstJsonStart)
      || (trimmed[firstJsonStart] === "[" && trimmed.lastIndexOf("]") < firstJsonStart));
  const possibleTruncation = ambientSafeTransportReason(result, ["finish_reason", "finishReason", "stop_reason", "stopReason"]) === "length"
    || unclosedJson
    || (markdownFenceDetected && !/```\s*$/u.test(trimmed));
  const finishReason = ambientSafeTransportReason(result, ["finish_reason", "finishReason"]);
  const stopReason = ambientSafeTransportReason(result, ["stop_reason", "stopReason"]);
  const issueCode: AmbientTransportIssueCode = !responseFieldPresent && isStructuredProviderResult
    ? "RESPONSE_FIELD_MISSING"
    : !trimmed
      ? "EMPTY_COMPLETION"
      : possibleTruncation
        ? "POSSIBLE_TRUNCATION"
        : parseFailed
          ? "JSON_PARSE_FAILED"
          : leadingNonJsonDetected || trailingNonJsonDetected
            ? "NON_JSON_COMPLETION"
            : "NONE";
  const parsedCandidates = Array.isArray(parsedValue)
    ? parsedValue
    : typeof parsedValue === "object" && parsedValue !== null && !Array.isArray(parsedValue)
      ? Array.isArray((parsedValue as Record<string, unknown>).candidates)
        ? (parsedValue as Record<string, unknown>).candidates as unknown[]
        : null
      : null;
  const parsedRecord = typeof parsedValue === "object" && parsedValue !== null && !Array.isArray(parsedValue)
    ? parsedValue as Record<string, unknown>
    : null;
  const parsedDecisions = parsedRecord && Array.isArray(parsedRecord.decisions)
    ? parsedRecord.decisions
    : null;
  const decisionCount = parsedDecisions?.length ?? null;
  const eventDecisionCount = parsedDecisions
    ? parsedDecisions.filter((decision) => typeof decision === "object" && decision !== null && !Array.isArray(decision) && (decision as Record<string, unknown>).kind === "event").length
    : null;
  const supportDecisionCount = parsedDecisions
    ? parsedDecisions.filter((decision) => typeof decision === "object" && decision !== null && !Array.isArray(decision) && (decision as Record<string, unknown>).kind === "support").length
    : null;
  const ignoreDecisionCount = parsedDecisions
    ? parsedDecisions.filter((decision) => typeof decision === "object" && decision !== null && !Array.isArray(decision) && (decision as Record<string, unknown>).kind === "ignore").length
    : null;
  // In the current decision contract, an event decision is the closest
  // bounded equivalent to an extracted candidate/item count. Keep the old
  // field populated for existing dashboards while exposing the exact new
  // decision counts alongside it.
  const parsedCandidateCount = parsedDecisions ? eventDecisionCount : parsedCandidates ? parsedCandidates.length : null;
  const parsedItemCount = parsedDecisions
    ? eventDecisionCount
    : parsedCandidates
    ? parsedCandidates.reduce((total, candidate) => total + (
      typeof candidate === "object" && candidate !== null && Array.isArray((candidate as Record<string, unknown>).items)
        ? ((candidate as Record<string, unknown>).items as unknown[]).length
        : 0
    ), 0)
    : null;
  const usageCompletionTokens = ambientSafeUsageNumber(result, "completion_tokens");
  const outputSizeAnomaly = usageCompletionTokens !== null
    && requestedMaxTokens !== null
    && usageCompletionTokens >= requestedMaxTokens * 0.9
    && selectedSourceCount <= 8
    && (parsedCandidateCount === null || parsedCandidateCount <= 2)
    && (parsedItemCount === null || parsedItemCount <= 6);
  return {
    providerResultKind,
    responseFieldPresent,
    responseValueKind,
    completionLength: cappedLength,
    trimmedLength: cappedTrimmedLength,
    startsWithBrace,
    startsWithBracket,
    endsWithBrace,
    endsWithBracket,
    markdownFenceDetected,
    jsonFenceDetected,
    leadingNonJsonDetected,
    trailingNonJsonDetected,
    possibleTruncation,
    finishReason,
    stopReason,
    issueCode,
    requestedMaxTokens,
    usagePromptTokens: ambientSafeUsageNumber(result, "prompt_tokens"),
    usageCompletionTokens,
    usageTotalTokens: ambientSafeUsageNumber(result, "total_tokens"),
    effectiveOutputBudgetSource: requestedMaxTokens === null ? "unknown" : "explicit",
    selectedSourceCount,
    parsedDecisionCount: decisionCount,
    parsedEventDecisionCount: eventDecisionCount,
    parsedSupportDecisionCount: supportDecisionCount,
    parsedIgnoreDecisionCount: ignoreDecisionCount,
    parsedCandidateCount,
    parsedItemCount,
    outputSizeAnomaly,
    accountedSelectedSourceCount: sourceCoverage?.accountedSelectedSourceCount ?? null,
    unaccountedSelectedSourceCount: sourceCoverage?.unaccountedSelectedSourceCount ?? null,
    ignoredSelectedSourceCount: sourceCoverage?.ignoredSelectedSourceCount ?? null,
    supportingSourceCount: sourceCoverage?.supportingSourceCount ?? null,
    selectedSourceCoverageStatus: sourceCoverage?.selectedSourceCoverageStatus ?? "not_available",
    firstBadSemanticStage: sourceCoverage?.selectedSourceCoverageStatus === "failed" ? "AI_EXTRACTION_COVERAGE" : null,
    ignoredSelectedSourceOrdinals: sourceCoverage?.ignoredSelectedSourceOrdinals ?? null,
    unaccountedSourceOrdinals: sourceCoverage?.unaccountedSourceOrdinals ?? null,
    failureDetailClass: parseFailed ? "json_parse_invalid" : null,
    jsonSyntax: jsonSyntax ?? emptyAmbientJsonSyntaxDiagnostics(),
  };
}

function parseJson(raw: string): AmbientParsedJson {
  const trimmed = raw.trim();
  const scan = scanAmbientJsonStructure(trimmed);
  if (!trimmed) return { value: null, syntax: ambientJsonSyntaxFromScan(scan) };

  // Ambient output is intentionally strict: accept a bare JSON value or one
  // complete fence, but never salvage an arbitrary JSON-looking substring
  // from prose or a partial/multiple-block response.
  const fenced = trimmed.match(/^```(?:json)?[ \t]*(?:\r?\n)?([\s\S]*?)(?:\r?\n)?```$/iu);
  const candidate = fenced ? fenced[1]?.trim() : trimmed;
  if (!candidate || (!fenced && trimmed.startsWith("```"))) {
    return { value: null, syntax: ambientJsonSyntaxFromScan(scan) };
  }
  try {
    return { value: JSON.parse(candidate), syntax: ambientJsonSyntaxFromScan(scan) };
  } catch (error) {
    return { value: null, syntax: ambientJsonSyntaxDiagnostics(scan, error, candidate) };
  }
}

/**
 * Normalize only deterministic formatting differences in the model-owned
 * decision contract. This is not a legacy candidate-envelope compatibility
 * path: the production extraction contract has exactly one `decisions` root.
 */
export function normalizeAmbientAiExtraction(value: unknown): unknown {
  const normalizeConfidence = (candidateValue: unknown): unknown => {
    if (validConfidence(candidateValue)) return candidateValue;
    if (typeof candidateValue !== "number" || !Number.isFinite(candidateValue) || candidateValue < 0 || candidateValue > 1) return candidateValue;
    return candidateValue >= 0.8 ? "high" : candidateValue >= 0.5 ? "medium" : "low";
  };
  const normalizeType = (candidateValue: unknown): unknown => {
    if (candidateValue === "死亡" || candidateValue === "死") return "mortality";
    if (candidateValue === "淘汰") return "cull";
    if (candidateValue === "健康異常") return "abnormal";
    return candidateValue;
  };
  const normalizeDecision = (decision: unknown): unknown => {
    if (typeof decision !== "object" || decision === null || Array.isArray(decision)) return decision;
    const record = decision as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(record, "ref")) {
      normalized.ref = typeof record.ref === "string" ? record.ref.trim() : record.ref;
    }
    if (Object.prototype.hasOwnProperty.call(record, "kind")) normalized.kind = record.kind;
    if (Object.prototype.hasOwnProperty.call(record, "targetRef")) {
      normalized.targetRef = typeof record.targetRef === "string" ? record.targetRef.trim() : record.targetRef;
    }
    if (record.kind === "event") {
      if (Object.prototype.hasOwnProperty.call(record, "type")) normalized.type = normalizeType(record.type);
      for (const key of ["quantity", "quantityConfidence", "raw"] as const) {
        if (Object.prototype.hasOwnProperty.call(record, key)) normalized[key] = record[key];
      }
      if (Object.prototype.hasOwnProperty.call(record, "confidence")) normalized.confidence = normalizeConfidence(record.confidence);
      for (const key of ["farmText", "houseText", "flockText", "caretakerText"] as const) {
        if (Object.prototype.hasOwnProperty.call(record, key)) normalized[key] = record[key];
      }
    }
    return normalized;
  };
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.decisions)) return value;
  return { decisions: record.decisions.map(normalizeDecision) };
}

/**
 * Build the persisted Candidate shape only after the per-source decision
 * contract has passed. Request-local refs are resolved here and never become
 * persisted lineage. A support decision contributes a source to its target
 * event; it never creates another semantic item.
 */
function buildAmbientCandidateBundleFromDecisions(value: unknown, context: AmbientPromptContext): AmbientCandidateBundle | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.decisions)) return null;
  const decisions = record.decisions as AmbientAiDecision[];
  const eventDecisions = decisions.filter((decision): decision is AmbientAiEventDecision => decision.kind === "event");
  const supports = decisions.filter((decision): decision is AmbientAiSupportDecision => decision.kind === "support");
  const supportRefsByTarget = new Map<string, string[]>();
  for (const support of supports) {
    supportRefsByTarget.set(support.targetRef, [...(supportRefsByTarget.get(support.targetRef) ?? []), support.ref]);
  }

  const sourceEntryFor = (ref: string): AmbientPromptSourceEntry | null => context.byRef.get(ref) ?? null;
  const mappedSourceMessages = (refs: string[]): AmbientBufferedMessage[] => refs
    .map(sourceEntryFor)
    .filter((entry): entry is AmbientPromptSourceEntry => Boolean(entry))
    .map((entry) => entry.message);
  const sourceIdsFor = (refs: string[]): string[] => [...new Set(mappedSourceMessages(refs).map((message) => message.lineMessageId))].slice(0, 100);
  const sourceFactsFor = (decision: AmbientAiEventDecision, refs: string[]): AmbientCandidateEvidence[] => {
    const entries = refs
      .map(sourceEntryFor)
      .filter((entry): entry is AmbientPromptSourceEntry => Boolean(entry));
    const field = decision.type === "mortality" ? "mortality" : decision.type === "cull" ? "cull" : "event";
    const normalizedValue = decision.type === "abnormal" ? decision.raw : decision.quantity;
    return entries.slice(0, 48).map((entry) => ({
      evidenceType: "source_fact",
      field,
      normalizedValue,
      sourceRef: entry.message.lineMessageId,
      sourceTimestamp: entry.message.eventTimestamp,
      sourceUser: entry.message.lineUserId,
      confidence: decision.confidence,
      extractionSource: "ai",
    }));
  };

  // Grouping is deterministic and deliberately conservative: only identical
  // semantic entity clues share a Candidate. Event identity remains one item
  // per event decision, so same-farm events with different quantities stay
  // distinct.
  const groups = new Map<string, {
    events: Array<{ decision: AmbientAiEventDecision; refs: string[] }>;
    farmText: string | null;
    houseText: string | null;
    flockText: string | null;
    caretakerText?: string | null;
  }>();
  for (const decision of eventDecisions) {
    const supportRefs = supportRefsByTarget.get(decision.ref) ?? [];
    const refs = [decision.ref, ...supportRefs];
    const key = [
      ambientKey(decision.farmText),
      ambientKey(decision.houseText),
      ambientKey(decision.flockText),
      ambientKey(decision.caretakerText),
    ].join("\u001e");
    const group = groups.get(key) ?? {
      events: [],
      farmText: decision.farmText ?? null,
      houseText: decision.houseText ?? null,
      flockText: decision.flockText ?? null,
      ...(decision.caretakerText !== undefined ? { caretakerText: decision.caretakerText } : {}),
    };
    group.events.push({ decision, refs });
    groups.set(key, group);
  }

  const candidates: AmbientCandidate[] = [];
  for (const group of groups.values()) {
    const events = group.events;
    const first = events[0]?.decision;
    if (!first) continue;
    const items = events.map(({ decision }) => ({
      type: decision.type,
      quantity: decision.type === "abnormal" ? null : decision.quantity,
      raw: decision.raw,
      confidence: decision.confidence,
    } satisfies AmbientCandidateItem));
    const lineageRefs = events.flatMap((event) => event.refs);
    const sourceMessageIds = sourceIdsFor(lineageRefs);
    const evidence = events.flatMap(({ decision, refs }) => sourceFactsFor(decision, refs)).slice(0, 48);
    const sourceMessages = mappedSourceMessages(lineageRefs);
    candidates.push({
      farmText: group.farmText,
      houseText: group.houseText,
      flockText: group.flockText,
      ...(group.caretakerText !== undefined ? { caretakerText: group.caretakerText } : {}),
      eventType: first.type,
      quantity: first.type === "abnormal" ? null : first.quantity,
      quantityConfidence: first.quantityConfidence,
      rawTexts: events.map(({ decision }) => decision.raw).slice(0, 24),
      sourceMessageIds,
      sourceTimestamps: sourceMessages.map((message) => message.eventTimestamp).slice(0, 100),
      sourceUsers: [...new Set(sourceMessages.map((message) => message.lineUserId))].slice(0, 100),
      items,
      conflict: false,
      ...(evidence.length ? { evidence } : {}),
    });
  }
  const lineage = candidates.flatMap((candidate) => candidate.sourceMessageIds ?? []);
  const lineageMessages = [...new Set(lineage)]
    .map((id) => context.entries.find((entry) => entry.message.lineMessageId === id)?.message)
    .filter((message): message is AmbientBufferedMessage => Boolean(message));
  return {
    candidates,
    sourceMessageIds: [...new Set(lineage)].slice(0, 100),
    sourceTimestamps: lineageMessages.map((message) => message.eventTimestamp).slice(0, 100),
    sourceUsers: [...new Set(lineageMessages.map((message) => message.lineUserId))].slice(0, 100),
  };
}

interface AmbientValidationIssue {
  code: AmbientValidationIssueCode;
  path: string;
  expected: string;
  actual: AmbientValidationActualType;
  candidateIndex?: number;
  safeEnumActual?: string | null;
}

function ambientActualType(value: unknown, missing = false): AmbientValidationActualType {
  if (missing) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return "unknown";
}

function ambientRootKind(value: unknown, parseFailed: boolean): AmbientValidationRootKind {
  if (parseFailed) return "unknown";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return "unknown";
}

function hasAmbientKey(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function boundedStructuralKeys(value: unknown, maxKeys = 32): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>)
    .map((key) => key.replace(/[\u0000-\u001f]/gu, "").slice(0, 64))
    .filter(Boolean)
    .slice(0, maxKeys);
}

function safeAmbientEnumToken(path: string, value: unknown): string | null {
  const technicalEnumPath = /(?:eventType|quantityConfidence|state|evidenceType|extractionSource|resolutionStatus|matchConfidence|\.type|\.confidence|\.status)$/u;
  if (!technicalEnumPath.test(path) || typeof value !== "string" || value.length < 1 || value.length > 64) return null;
  if (/[\u0000-\u001f\u007f\s]/u.test(value)) return null;
  return /^[\p{L}\p{N}_.:-]+$/u.test(value) ? value : null;
}

function boundedDiagnosticJson(value: unknown, maxLength: number): string {
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxLength) return serialized;
  return JSON.stringify({ truncated: true });
}

function pushAmbientValidationIssue(issues: AmbientValidationIssue[], issue: AmbientValidationIssue): void {
  if (issues.length < 32) issues.push(issue);
}

function issueForValue(
  issues: AmbientValidationIssue[],
  code: AmbientValidationIssueCode,
  path: string,
  expected: string,
  value: unknown,
  candidateIndex?: number,
  missing = false,
): void {
  pushAmbientValidationIssue(issues, {
    code,
    path,
    expected,
    actual: ambientActualType(value, missing),
    ...(candidateIndex === undefined ? {} : { candidateIndex }),
    safeEnumActual: safeAmbientEnumToken(path, value),
  });
}

function inspectStringArrayField(
  issues: AmbientValidationIssue[],
  record: Record<string, unknown>,
  key: string,
  path: string,
  maxItems: number,
  maxLength: number,
  candidateIndex: number,
): void {
  if (!hasAmbientKey(record, key)) return;
  const value = record[key];
  if (value === null) {
    issueForValue(issues, "NULL_NOT_ALLOWED", path, "array", value, candidateIndex);
    return;
  }
  if (!Array.isArray(value)) {
    issueForValue(issues, "INVALID_FIELD_TYPE", path, "array", value, candidateIndex);
    return;
  }
  if (value.length > maxItems) {
    issueForValue(issues, "OTHER_SCHEMA_ERROR", path, `array(maxItems=${maxItems})`, value, candidateIndex);
    return;
  }
  const invalidIndex = value.findIndex((item) => typeof item !== "string" || item.length > maxLength);
  if (invalidIndex >= 0) issueForValue(issues, "INVALID_FIELD_TYPE", `${path}[${invalidIndex}]`, "string", value[invalidIndex], candidateIndex);
}

function inspectAmbientEvidence(issues: AmbientValidationIssue[], value: unknown, path: string, candidateIndex: number): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    issueForValue(issues, "INVALID_FIELD_TYPE", path, "array", value, candidateIndex);
    return;
  }
  if (value.length > 48) {
    issueForValue(issues, "OTHER_SCHEMA_ERROR", path, "array(maxItems=48)", value, candidateIndex);
    return;
  }
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const itemPath = `${path}[${index}]`;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      issueForValue(issues, "EVENT_SCHEMA_INVALID", itemPath, "object", item, candidateIndex);
      continue;
    }
    const record = item as Record<string, unknown>;
    if (!hasAmbientKey(record, "evidenceType")) issueForValue(issues, "MISSING_REQUIRED_FIELD", `${itemPath}.evidenceType`, "enum", undefined, candidateIndex, true);
    else if (!AMBIENT_EVIDENCE_TYPES.has(record.evidenceType as AmbientCandidateEvidence["evidenceType"])) issueForValue(issues, "INVALID_ENUM", `${itemPath}.evidenceType`, "enum", record.evidenceType, candidateIndex);
    if (typeof record.field !== "string" || record.field.trim().length < 1 || record.field.length > 80) issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.field`, "string", record.field, candidateIndex, !hasAmbientKey(record, "field"));
    const normalizedValue = record.normalizedValue;
    if (normalizedValue !== null && typeof normalizedValue !== "string" && typeof normalizedValue !== "number") issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.normalizedValue`, "string|number|null", normalizedValue, candidateIndex, !hasAmbientKey(record, "normalizedValue"));
    for (const key of ["sourceRef", "sourceTimestamp", "sourceUser"]) {
      if (record[key] !== undefined && record[key] !== null && (typeof record[key] !== "string" || (key === "sourceRef" && record[key].length > 200) || (key === "sourceTimestamp" && record[key].length > 80) || (key === "sourceUser" && record[key].length > 200))) issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.${key}`, "string|null", record[key], candidateIndex);
    }
    if (record.confidence !== undefined && record.confidence !== "low" && record.confidence !== "medium" && record.confidence !== "high") issueForValue(issues, "INVALID_ENUM", `${itemPath}.confidence`, "enum", record.confidence, candidateIndex);
    if (record.extractionSource !== undefined && !AMBIENT_EVIDENCE_SOURCES.has(record.extractionSource as NonNullable<AmbientCandidateEvidence["extractionSource"]>)) issueForValue(issues, "INVALID_ENUM", `${itemPath}.extractionSource`, "enum", record.extractionSource, candidateIndex);
    if (issues.length >= 32) return;
  }
}

function inspectAmbientConflictEvidence(issues: AmbientValidationIssue[], value: unknown, path: string, candidateIndex: number): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    issueForValue(issues, "INVALID_FIELD_TYPE", path, "array", value, candidateIndex);
    return;
  }
  if (value.length > 12) {
    issueForValue(issues, "OTHER_SCHEMA_ERROR", path, "array(maxItems=12)", value, candidateIndex);
    return;
  }
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const itemPath = `${path}[${index}]`;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      issueForValue(issues, "EVENT_SCHEMA_INVALID", itemPath, "object", item, candidateIndex);
      continue;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.type !== "string" || record.type.length < 1 || record.type.length > 120) issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.type`, "string", record.type, candidateIndex, !hasAmbientKey(record, "type"));
    const evidenceRefs = record.evidenceRefs;
    if (!Array.isArray(evidenceRefs)) issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.evidenceRefs`, "array", evidenceRefs, candidateIndex, !hasAmbientKey(record, "evidenceRefs"));
    else if (evidenceRefs.length > 48 || evidenceRefs.some((ref) => typeof ref !== "string" || ref.length > 200)) issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.evidenceRefs`, "array<string>", evidenceRefs, candidateIndex);
    for (const key of ["facts", "dbFacts", "businessRule"]) {
      if (typeof record[key] !== "object" || record[key] === null || Array.isArray(record[key])) issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.${key}`, "object", record[key], candidateIndex, !hasAmbientKey(record, key));
    }
    const facts = typeof record.facts === "object" && record.facts !== null && !Array.isArray(record.facts) ? record.facts as Record<string, unknown> : null;
    const dbFacts = typeof record.dbFacts === "object" && record.dbFacts !== null && !Array.isArray(record.dbFacts) ? record.dbFacts as Record<string, unknown> : null;
    const businessRule = typeof record.businessRule === "object" && record.businessRule !== null && !Array.isArray(record.businessRule) ? record.businessRule as Record<string, unknown> : null;
    if (facts) inspectStringArrayField(issues, facts, "caretakerClues", `${itemPath}.facts.caretakerClues`, 12, 160, candidateIndex);
    if (facts && facts.selectedFarm !== undefined && facts.selectedFarm !== null && (typeof facts.selectedFarm !== "string" || facts.selectedFarm.length > 160)) issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.facts.selectedFarm`, "string|null", facts.selectedFarm, candidateIndex);
    if (dbFacts) {
      if (dbFacts.activeCaretakerAssignment !== undefined && typeof dbFacts.activeCaretakerAssignment !== "boolean") issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.dbFacts.activeCaretakerAssignment`, "boolean", dbFacts.activeCaretakerAssignment, candidateIndex);
      inspectStringArrayField(issues, dbFacts, "assignedFarms", `${itemPath}.dbFacts.assignedFarms`, 13, 160, candidateIndex);
    }
    if (businessRule && typeof businessRule.caretakerRequiredForMortality !== "boolean") issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.businessRule.caretakerRequiredForMortality`, "boolean", businessRule.caretakerRequiredForMortality, candidateIndex, !hasAmbientKey(businessRule, "caretakerRequiredForMortality"));
    for (const key of ["blocking", "overrideAllowed"]) {
      if (typeof record[key] !== "boolean") issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.${key}`, "boolean", record[key], candidateIndex, !hasAmbientKey(record, key));
    }
    if (record.resolutionStatus !== undefined && record.resolutionStatus !== "unresolved" && record.resolutionStatus !== "explicit_user_choice_wins" && record.resolutionStatus !== "dismissed") issueForValue(issues, "INVALID_ENUM", `${itemPath}.resolutionStatus`, "enum", record.resolutionStatus, candidateIndex);
    if (issues.length >= 32) return;
  }
}

function inspectAmbientCandidate(issues: AmbientValidationIssue[], value: unknown, index: number): void {
  const path = `candidates[${index}]`;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issueForValue(issues, "EVENT_SCHEMA_INVALID", path, "object", value, index);
    return;
  }
  const record = value as Record<string, unknown>;
  const stringFields: Array<[string, number]> = [["farmText", 160], ["caretakerText", 160], ["houseText", 80], ["flockText", 160]];
  for (const [key, maxLength] of stringFields) {
    if (record[key] !== undefined && record[key] !== null && (typeof record[key] !== "string" || record[key].length > maxLength)) issueForValue(issues, "INVALID_FIELD_TYPE", `${path}.${key}`, "string|null", record[key], index);
  }
  inspectStringArrayField(issues, record, "caretakerClues", `${path}.caretakerClues`, 12, 160, index);
  inspectStringArrayField(issues, record, "conflicts", `${path}.conflicts`, 12, 500, index);
  inspectStringArrayField(issues, record, "uncertainties", `${path}.uncertainties`, 12, 160, index);
  inspectStringArrayField(issues, record, "rawTexts", `${path}.rawTexts`, 24, 2000, index);
  inspectStringArrayField(issues, record, "sourceMessageIds", `${path}.sourceMessageIds`, 100, 200, index);
  inspectStringArrayField(issues, record, "sourceTimestamps", `${path}.sourceTimestamps`, 100, 80, index);
  inspectStringArrayField(issues, record, "sourceUsers", `${path}.sourceUsers`, 100, 200, index);

  const eventType = record.eventType;
  if (eventType !== undefined && eventType !== null && eventType !== "mortality" && eventType !== "cull" && eventType !== "abnormal") issueForValue(issues, "INVALID_ENUM", `${path}.eventType`, "enum", eventType, index);
  const quantityConfidence = record.quantityConfidence;
  if (quantityConfidence !== undefined && quantityConfidence !== null && !validQuantityConfidence(quantityConfidence)) issueForValue(issues, "INVALID_ENUM", `${path}.quantityConfidence`, "enum", quantityConfidence, index);
  if (record.quantity !== undefined && record.quantity !== null && (typeof record.quantity !== "number" || !Number.isFinite(record.quantity) || record.quantity <= 0 || record.quantity > 1_000_000)) issueForValue(issues, "INVALID_FIELD_TYPE", `${path}.quantity`, "number|null", record.quantity, index);

  const rawItems = record.items;
  if (Array.isArray(rawItems)) {
    if (rawItems.length === 0) issueForValue(issues, "EMPTY_EVENT_SET", `${path}.items`, "non-empty array", rawItems, index);
    if (rawItems.length > 12) issueForValue(issues, "OTHER_SCHEMA_ERROR", `${path}.items`, "array(maxItems=12)", rawItems, index);
    const allowUnresolvedQuantity = quantityConfidence === "unknown" || record.quantity === null || record.quantity === undefined || record.conflict === true || (Array.isArray(record.uncertainties) && record.uncertainties.some((item) => typeof item === "string" && /quantity|數量/u.test(item)));
    for (let itemIndex = 0; itemIndex < Math.min(rawItems.length, 12); itemIndex += 1) {
      const item = rawItems[itemIndex];
      const itemPath = `${path}.items[${itemIndex}]`;
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        issueForValue(issues, "EVENT_SCHEMA_INVALID", itemPath, "object", item, index);
        continue;
      }
      const itemRecord = item as Record<string, unknown>;
      if (itemRecord.type !== "mortality" && itemRecord.type !== "cull" && itemRecord.type !== "abnormal") issueForValue(issues, "INVALID_ENUM", `${itemPath}.type`, "enum", itemRecord.type, index, !hasAmbientKey(itemRecord, "type"));
      if (typeof itemRecord.raw !== "string" || itemRecord.raw.trim().length < 1 || itemRecord.raw.length > 2000) issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.raw`, "string", itemRecord.raw, index, !hasAmbientKey(itemRecord, "raw"));
      if (!validConfidence(itemRecord.confidence)) issueForValue(issues, "INVALID_ENUM", `${itemPath}.confidence`, "enum", itemRecord.confidence, index, !hasAmbientKey(itemRecord, "confidence"));
      if (itemRecord.type === "abnormal" && itemRecord.quantity !== null) issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.quantity`, "null", itemRecord.quantity, index, !hasAmbientKey(itemRecord, "quantity"));
      if (itemRecord.type !== "abnormal" && itemRecord.quantity === null && !allowUnresolvedQuantity) issueForValue(issues, "NULL_NOT_ALLOWED", `${itemPath}.quantity`, "number", itemRecord.quantity, index);
      if (itemRecord.type !== "abnormal" && itemRecord.quantity !== null && (typeof itemRecord.quantity !== "number" || !Number.isFinite(itemRecord.quantity) || itemRecord.quantity <= 0 || itemRecord.quantity > 1_000_000)) issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.quantity`, "number|null", itemRecord.quantity, index, !hasAmbientKey(itemRecord, "quantity"));
      if (itemRecord.mentionCount !== undefined && (typeof itemRecord.mentionCount !== "number" || !Number.isInteger(itemRecord.mentionCount) || itemRecord.mentionCount < 1 || itemRecord.mentionCount > 1000)) issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.mentionCount`, "number", itemRecord.mentionCount, index);
      if (itemRecord.firstSeen !== undefined && (typeof itemRecord.firstSeen !== "string" || itemRecord.firstSeen.length > 80)) issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.firstSeen`, "string", itemRecord.firstSeen, index);
      if (itemRecord.lastSeen !== undefined && (typeof itemRecord.lastSeen !== "string" || itemRecord.lastSeen.length > 80)) issueForValue(issues, "INVALID_FIELD_TYPE", `${itemPath}.lastSeen`, "string", itemRecord.lastSeen, index);
    }
  } else if (eventType === undefined || eventType === null) {
    issueForValue(issues, "MISSING_REQUIRED_FIELD", `${path}.items`, "array", rawItems, index, true);
  }

  inspectAmbientEvidence(issues, record.evidence, `${path}.evidence`, index);
  inspectAmbientConflictEvidence(issues, record.conflictEvidence, `${path}.conflictEvidence`, index);
  if (record.state !== undefined && record.state !== null && !["new", "unresolved_entity", "unresolved_quantity", "conflict", "possibly_recorded", "already_recorded", "no_actionable_event", "system_failure"].includes(String(record.state))) issueForValue(issues, "INVALID_ENUM", `${path}.state`, "enum", record.state, index);
}

function inspectAmbientDecision(issues: AmbientValidationIssue[], value: unknown, index: number): void {
  const path = `decisions[${index}]`;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issueForValue(issues, "INVALID_EVENT_SCHEMA", path, "object", value, index);
    return;
  }
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (kind !== "event" && kind !== "support" && kind !== "ignore") {
    issueForValue(issues, "INVALID_EVENT_SCHEMA", `${path}.kind`, "event|support|ignore", kind, index, !hasAmbientKey(record, "kind"));
    return;
  }
  if (kind === "support") {
    if (typeof record.targetRef !== "string" || !AMBIENT_REQUEST_SOURCE_REF_PATTERN.test(record.targetRef)) {
      issueForValue(issues, "INVALID_SUPPORT_TARGET", `${path}.targetRef`, "request-local source ref", record.targetRef, index, !hasAmbientKey(record, "targetRef"));
    }
    return;
  }
  if (kind === "ignore") return;

  if (record.type !== "mortality" && record.type !== "cull" && record.type !== "abnormal") {
    issueForValue(issues, "INVALID_ENUM", `${path}.type`, "mortality|cull|abnormal", record.type, index, !hasAmbientKey(record, "type"));
  }
  if (record.quantity === undefined) issueForValue(issues, "MISSING_REQUIRED_FIELD", `${path}.quantity`, "number|null", undefined, index, true);
  else if (record.quantity !== null && (typeof record.quantity !== "number" || !Number.isFinite(record.quantity) || record.quantity <= 0 || record.quantity > 1_000_000)) {
    issueForValue(issues, "INVALID_FIELD_TYPE", `${path}.quantity`, "number|null", record.quantity, index);
  } else if (record.type === "abnormal" && record.quantity !== null) {
    issueForValue(issues, "INVALID_FIELD_TYPE", `${path}.quantity`, "null", record.quantity, index);
  }
  if (!validQuantityConfidence(record.quantityConfidence)) issueForValue(issues, "INVALID_ENUM", `${path}.quantityConfidence`, "unknown|low|medium|high", record.quantityConfidence, index, !hasAmbientKey(record, "quantityConfidence"));
  if (typeof record.raw !== "string" || record.raw.trim().length < 1 || record.raw.length > 160) issueForValue(issues, "INVALID_FIELD_TYPE", `${path}.raw`, "non-empty string(maxLength=160)", record.raw, index, !hasAmbientKey(record, "raw"));
  if (!validConfidence(record.confidence)) issueForValue(issues, "INVALID_ENUM", `${path}.confidence`, "low|medium|high", record.confidence, index, !hasAmbientKey(record, "confidence"));
  for (const [key, maxLength] of [["farmText", 160], ["houseText", 80], ["flockText", 160], ["caretakerText", 160]] as const) {
    const candidate = record[key];
    if (candidate !== undefined && candidate !== null && (typeof candidate !== "string" || candidate.length > maxLength)) {
      issueForValue(issues, "INVALID_FIELD_TYPE", `${path}.${key}`, "string|null", candidate, index);
    }
  }
}

function ambientValidationDiagnostics(
  rawValue: unknown,
  normalizedValue: unknown,
  parseFailed: boolean,
  validatedBundle: AmbientCandidateBundle | null,
  sourceCoverage?: AmbientSourceCoverageDiagnostics,
  sourceCoverageErrorClass?: AmbientSourceCoverageCheck["errorClass"],
): AmbientValidationDiagnostics {
  const rootKind = ambientRootKind(rawValue, parseFailed);
  const rawRecord = typeof rawValue === "object" && rawValue !== null && !Array.isArray(rawValue) ? rawValue as Record<string, unknown> : null;
  const envelopeKind: AmbientValidationEnvelopeKind = Array.isArray(rawValue)
    ? "top_level_array"
    : rawRecord && hasAmbientKey(rawRecord, "decisions")
      ? "decisions"
      : rawRecord && hasAmbientKey(rawRecord, "candidates")
      ? "candidates"
      : rawRecord && hasAmbientKey(rawRecord, "events")
        ? "events"
        : rawRecord
          ? "other_object"
          : "unknown";
  const rawCandidates = Array.isArray(rawValue)
    ? rawValue
    : rawRecord && Array.isArray(rawRecord.candidates)
      ? rawRecord.candidates
      : rawRecord && Array.isArray(rawRecord.events)
        ? rawRecord.events
        : null;
  const rawDecisions = rawRecord && Array.isArray(rawRecord.decisions) ? rawRecord.decisions : null;
  const normalizedRecord = typeof normalizedValue === "object" && normalizedValue !== null && !Array.isArray(normalizedValue) ? normalizedValue as Record<string, unknown> : null;
  const inspectionCandidates = Array.isArray(normalizedValue)
    ? normalizedValue
    : normalizedRecord && Array.isArray(normalizedRecord.candidates)
      ? normalizedRecord.candidates
      : rawCandidates;
  const inspectionDecisions = normalizedRecord && Array.isArray(normalizedRecord.decisions)
    ? normalizedRecord.decisions
    : rawDecisions;
  const candidateCount = validatedBundle
    ? validatedBundle.candidates.length
    : rawDecisions
      ? rawDecisions.length
      : rawCandidates ? rawCandidates.length : normalizedRecord && Array.isArray(normalizedRecord.candidates) ? normalizedRecord.candidates.length : null;
  const structuralKeys = {
    rootKeys: boundedStructuralKeys(rawValue),
    decisionKeys: (rawDecisions ?? []).slice(0, AMBIENT_MAX_REQUEST_SOURCE_REFS).map((decision) => boundedStructuralKeys(decision, 16)),
    candidateKeys: (rawCandidates ?? (normalizedRecord && Array.isArray(normalizedRecord.candidates) ? normalizedRecord.candidates : [])).slice(0, 8).map((candidate) => boundedStructuralKeys(candidate, 24)),
  };
  const issues: AmbientValidationIssue[] = [];
  if (parseFailed) {
    issueForValue(issues, "JSON_PARSE_FAILED", "", "JSON object or array", undefined);
  } else if (rawValue === null || (!Array.isArray(rawValue) && (typeof rawValue !== "object"))) {
    issueForValue(issues, "ROOT_TYPE_INVALID", "", "object", rawValue);
  } else if (rawRecord && !hasAmbientKey(rawRecord, "decisions")) {
    issueForValue(issues, "ENVELOPE_INVALID", "", "object with decisions array", rawValue);
  } else if (rawRecord && hasAmbientKey(rawRecord, "decisions") && !Array.isArray(rawRecord.decisions)) {
    issueForValue(issues, "DECISIONS_NOT_ARRAY", "decisions", "array", rawRecord.decisions);
  } else if (Array.isArray(rawValue)) {
    issueForValue(issues, "ENVELOPE_INVALID", "", "object with decisions array", rawValue);
  } else if (!rawDecisions) {
    issueForValue(issues, "DECISIONS_NOT_ARRAY", "decisions", "array", normalizedRecord?.decisions);
  } else if (rawDecisions.length > AMBIENT_MAX_REQUEST_SOURCE_REFS) {
    issueForValue(issues, "OTHER_SCHEMA_ERROR", "decisions", `array(maxItems=${AMBIENT_MAX_REQUEST_SOURCE_REFS})`, rawDecisions);
  } else if (sourceCoverageErrorClass === "invalid_event_schema") {
    inspectionDecisions?.forEach((decision, index) => inspectAmbientDecision(issues, decision, index));
    if (!issues.length) issueForValue(issues, "INVALID_EVENT_SCHEMA", "decisions", "valid decision objects", rawDecisions, undefined);
  } else if (sourceCoverageErrorClass) {
    const issueCode: AmbientValidationIssueCode = sourceCoverageErrorClass === "source_decision_missing"
      ? "SOURCE_DECISION_MISSING"
      : sourceCoverageErrorClass === "unknown_source_reference"
        ? "UNKNOWN_SOURCE_REFERENCE"
        : sourceCoverageErrorClass === "duplicate_source_decision"
          ? "DUPLICATE_SOURCE_DECISION"
          : sourceCoverageErrorClass === "invalid_support_target"
            ? "INVALID_SUPPORT_TARGET"
            : sourceCoverageErrorClass === "invalid_context_decision_ref"
              ? "INVALID_CONTEXT_DECISION_REF"
              : "INVALID_EVENT_SCHEMA";
    issueForValue(issues, issueCode, "decisions", "one decision for every selected ref", rawDecisions);
  } else if (rawCandidates && rawCandidates.length > 8) {
    issueForValue(issues, "OTHER_SCHEMA_ERROR", "candidates", "array(maxItems=8)", rawCandidates);
  } else {
    inspectionCandidates?.forEach((candidate, index) => inspectAmbientCandidate(issues, candidate, index));
  }
  if (!issues.length && !validatedBundle) issueForValue(issues, "OTHER_SCHEMA_ERROR", "candidates", "validated candidate bundle", normalizedValue);
  const first = issues[0] ?? null;
  const issueSummary = issues.slice(0, 8).map((issue) => ({
    code: issue.code,
    path: issue.path,
    expected: issue.expected,
    actual: issue.actual,
    ...(issue.candidateIndex === undefined ? {} : { candidateIndex: issue.candidateIndex }),
    ...(issue.safeEnumActual ? { safeEnumActual: issue.safeEnumActual } : {}),
  }));
  return {
    rootKind,
    envelopeKind,
    candidateCount,
    issueCount: issues.length,
    firstIssueCode: first?.code ?? null,
    firstIssuePath: first?.path ?? null,
    firstExpectedType: first?.expected ?? null,
    firstActualType: first?.actual ?? null,
    failedCandidateIndex: first?.candidateIndex ?? null,
    structuralKeysJson: boundedDiagnosticJson(structuralKeys, 4096),
    issueSummaryJson: boundedDiagnosticJson(issueSummary, 4096),
    safeEnumActual: first?.safeEnumActual ?? null,
  };
}

function errorClass(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "unknown";
}

function validConfidence(value: unknown): value is "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high";
}

function validQuantityConfidence(value: unknown): value is NonNullable<AmbientCandidate["quantityConfidence"]> {
  return value === "unknown" || value === "low" || value === "medium" || value === "high";
}

const AMBIENT_DECISION_SCHEMA_ALLOWED_FIELDS = new Set<string>(AMBIENT_AI_EXTRACTION_ALLOWED_KEYS);
const AMBIENT_DECISION_SCHEMA_EVENT_REQUIRED_FIELDS: AmbientDecisionSchemaFieldName[] = [
  "ref", "kind", "type", "quantity", "quantityConfidence", "raw", "confidence",
];
const AMBIENT_DECISION_SCHEMA_SUPPORT_REQUIRED_FIELDS: AmbientDecisionSchemaFieldName[] = ["ref", "kind", "targetRef"];
const AMBIENT_DECISION_SCHEMA_IGNORE_REQUIRED_FIELDS: AmbientDecisionSchemaFieldName[] = ["ref", "kind"];

function ambientDecisionSchemaFieldStatus(
  present: boolean,
  valid: boolean,
): AmbientDecisionSchemaEnumStatus {
  if (!present) return "MISSING";
  return valid ? "VALID" : "INVALID";
}

function ambientDecisionSchemaRawStatus(record: Record<string, unknown>, key: string): AmbientDecisionSchemaRawStatus {
  if (!hasAmbientKey(record, key)) return "MISSING";
  const value = record[key];
  if (value === null) return "NULL";
  if (typeof value === "string") return value.trim().length ? "PRESENT" : "EMPTY";
  return "INVALID";
}

function ambientDecisionSchemaRequiredFields(kind: AmbientAiDecisionKind | "unknown"): AmbientDecisionSchemaFieldName[] {
  if (kind === "event") return AMBIENT_DECISION_SCHEMA_EVENT_REQUIRED_FIELDS;
  if (kind === "support") return AMBIENT_DECISION_SCHEMA_SUPPORT_REQUIRED_FIELDS;
  return AMBIENT_DECISION_SCHEMA_IGNORE_REQUIRED_FIELDS;
}

function ambientDecisionSchemaEnumStatus(
  rawRecord: Record<string, unknown>,
  normalizedRecord: Record<string, unknown> | null,
  key: "type" | "quantityConfidence" | "confidence",
  valid: (value: unknown) => boolean,
): AmbientDecisionSchemaEnumStatus {
  const present = hasAmbientKey(rawRecord, key);
  const effectiveValue = normalizedRecord && hasAmbientKey(normalizedRecord, key)
    ? normalizedRecord[key]
    : rawRecord[key];
  return ambientDecisionSchemaFieldStatus(present, valid(effectiveValue));
}

function ambientDecisionSchemaDiagnosticFor(
  rawDecision: unknown,
  normalizedDecision: unknown,
  decisionOrdinal: number,
  selectedRefs: ReadonlySet<string>,
): AmbientDecisionSchemaDiagnostic {
  const rawRecord = typeof rawDecision === "object" && rawDecision !== null && !Array.isArray(rawDecision)
    ? rawDecision as Record<string, unknown>
    : {};
  const normalizedRecord = typeof normalizedDecision === "object" && normalizedDecision !== null && !Array.isArray(normalizedDecision)
    ? normalizedDecision as Record<string, unknown>
    : null;
  const kind: AmbientDecisionSchemaDiagnostic["kind"] = rawRecord.kind === "event"
    || rawRecord.kind === "support"
    || rawRecord.kind === "ignore"
    ? rawRecord.kind
    : "unknown";
  const presentKeys = Object.keys(rawRecord)
    .filter((key): key is AmbientDecisionSchemaFieldName => AMBIENT_DECISION_SCHEMA_ALLOWED_FIELDS.has(key))
    .slice(0, AMBIENT_AI_EXTRACTION_ALLOWED_KEYS.length);
  const requiredFields = ambientDecisionSchemaRequiredFields(kind);
  const missingRequiredKeys = requiredFields.filter((key) => !hasAmbientKey(rawRecord, key));
  const fieldTypeClasses = presentKeys.map((field) => ({ field, type: ambientActualType(rawRecord[field]) }));
  const event = kind === "event";
  const rawQuantityPresent = hasAmbientKey(rawRecord, "quantity");
  const rawQuantity = rawRecord.quantity;
  const effectiveQuantity = normalizedRecord && hasAmbientKey(normalizedRecord, "quantity")
    ? normalizedRecord.quantity
    : rawQuantity;
  const quantityKind: AmbientDecisionSchemaDiagnostic["quantityKind"] = event
    ? rawQuantityPresent ? ambientActualType(rawQuantity) : "missing"
    : "not_applicable";
  const quantityNullabilityStatus: AmbientDecisionSchemaStatus = !event
    ? "NOT_APPLICABLE"
    : !rawQuantityPresent
      ? "MISSING"
      : kind === "event" && rawRecord.type === "abnormal"
        ? effectiveQuantity === null ? "VALID" : "INVALID"
        : effectiveQuantity === null
          || (typeof effectiveQuantity === "number" && Number.isFinite(effectiveQuantity) && effectiveQuantity > 0 && effectiveQuantity <= 1_000_000)
          ? "VALID"
          : "INVALID";
  const typeEnumStatus = !event
    ? "NOT_APPLICABLE"
    : ambientDecisionSchemaEnumStatus(rawRecord, normalizedRecord, "type", (value) => value === "mortality" || value === "cull" || value === "abnormal");
  const quantityConfidenceStatus = !event
    ? "NOT_APPLICABLE"
    : ambientDecisionSchemaEnumStatus(rawRecord, normalizedRecord, "quantityConfidence", validQuantityConfidence);
  const confidenceStatus = !event
    ? "NOT_APPLICABLE"
    : ambientDecisionSchemaEnumStatus(rawRecord, normalizedRecord, "confidence", validConfidence);
  const targetRefPresent = hasAmbientKey(rawRecord, "targetRef");
  const targetRef = rawRecord.targetRef;
  const targetRefFormatValid = typeof targetRef === "string" && AMBIENT_REQUEST_SOURCE_REF_PATTERN.test(targetRef);
  const safeRef = typeof rawRecord.ref === "string" && AMBIENT_REQUEST_SOURCE_REF_PATTERN.test(rawRecord.ref)
    ? rawRecord.ref
    : null;
  const safeTargetRef = kind === "support" && targetRefFormatValid ? targetRef as string : null;
  return {
    decisionOrdinal,
    safeRef,
    kind,
    presentKeys,
    missingRequiredKeys,
    unknownKeysPresent: Object.keys(rawRecord).some((key) => !AMBIENT_DECISION_SCHEMA_ALLOWED_FIELDS.has(key)),
    fieldTypeClasses,
    typeEnumStatus,
    quantityKind,
    quantityNullabilityStatus,
    quantityConfidenceStatus,
    confidenceStatus,
    rawStatus: event ? ambientDecisionSchemaRawStatus(rawRecord, "raw") : "NOT_APPLICABLE",
    safeTargetRef,
    targetRefStatus: kind === "support"
      ? !targetRefPresent ? "MISSING" : targetRefFormatValid ? "VALID" : "INVALID"
      : "NOT_APPLICABLE",
    targetRefSelectedStatus: kind === "support"
      ? targetRefFormatValid && selectedRefs.has(targetRef as string) ? "VALID" : "INVALID"
      : "NOT_APPLICABLE",
  };
}

/**
 * Project a parsed decision envelope into bounded, value-free schema evidence.
 * This is intentionally diagnostic-only: it never repairs or changes the
 * value that the strict validator receives.
 */
export function buildAmbientDecisionSchemaDiagnostics(
  rawValue: unknown,
  normalizedValue: unknown,
  validationDiagnostics?: AmbientValidationDiagnostics,
  selectedRefs: readonly string[] = [],
): AmbientDecisionSchemaDiagnostics {
  const rawRecord = typeof rawValue === "object" && rawValue !== null && !Array.isArray(rawValue)
    ? rawValue as Record<string, unknown>
    : null;
  const normalizedRecord = typeof normalizedValue === "object" && normalizedValue !== null && !Array.isArray(normalizedValue)
    ? normalizedValue as Record<string, unknown>
    : null;
  const rawDecisions = rawRecord && Array.isArray(rawRecord.decisions) ? rawRecord.decisions : null;
  const normalizedDecisions = normalizedRecord && Array.isArray(normalizedRecord.decisions) ? normalizedRecord.decisions : [];
  const decisions = (rawDecisions ?? []).slice(0, 16).map((decision, index) =>
    ambientDecisionSchemaDiagnosticFor(decision, normalizedDecisions[index], index + 1, new Set(selectedRefs)));
  return {
    rootKind: validationDiagnostics?.rootKind ?? ambientRootKind(rawValue, false),
    envelopeKind: validationDiagnostics?.envelopeKind ?? (rawRecord && hasAmbientKey(rawRecord, "decisions") ? "decisions" : rawRecord ? "other_object" : ambientRootKind(rawValue, false) === "array" ? "top_level_array" : "unknown"),
    decisionCount: rawDecisions ? rawDecisions.length : null,
    unknownTopLevelKeys: rawRecord ? Object.keys(rawRecord).some((key) => key !== "decisions") : false,
    decisions,
    issueCount: validationDiagnostics?.issueCount ?? 0,
    firstIssueCode: validationDiagnostics?.firstIssueCode ?? null,
    firstIssuePath: validationDiagnostics?.firstIssuePath ?? null,
    firstExpectedType: validationDiagnostics?.firstExpectedType ?? null,
    firstActualType: validationDiagnostics?.firstActualType ?? null,
  };
}

function validItem(value: unknown, allowUnresolvedQuantity = false): value is AmbientCandidateItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (item.type !== "mortality" && item.type !== "cull" && item.type !== "abnormal") return false;
  if (typeof item.raw !== "string" || item.raw.trim().length < 1 || item.raw.length > 2000) return false;
  if (!validConfidence(item.confidence)) return false;
  if (item.type === "abnormal" && item.quantity !== null) return false;
  if (item.type !== "abnormal" && item.quantity !== null && (typeof item.quantity !== "number" || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 1000000)) return false;
  if (item.type !== "abnormal" && item.quantity === null && !allowUnresolvedQuantity) return false;
  if (item.mentionCount !== undefined && (typeof item.mentionCount !== "number" || !Number.isInteger(item.mentionCount) || item.mentionCount < 1 || item.mentionCount > 1000)) return false;
  if (item.firstSeen !== undefined && (typeof item.firstSeen !== "string" || item.firstSeen.length > 80)) return false;
  if (item.lastSeen !== undefined && (typeof item.lastSeen !== "string" || item.lastSeen.length > 80)) return false;
  return true;
}

function boundedStringArray(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems || !value.every((item) => typeof item === "string" && item.trim().length <= maxLength)) return null;
  return value.map((item) => item.trim()).filter(Boolean).slice(0, maxItems);
}

const AMBIENT_EVIDENCE_TYPES = new Set<AmbientCandidateEvidence["evidenceType"]>([
  "source_fact", "caretaker_clue", "farm_clue", "house_clue", "flock_clue",
  "explicit_user_choice", "resolver_fact", "reconciliation_fact",
]);
const AMBIENT_EVIDENCE_SOURCES = new Set<NonNullable<AmbientCandidateEvidence["extractionSource"]>>([
  "ai", "deterministic", "explicit_user", "resolver",
]);

function normalizeCandidateEvidence(value: unknown): AmbientCandidateEvidence[] | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 48) return null;
  const normalized: AmbientCandidateEvidence[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    if (!AMBIENT_EVIDENCE_TYPES.has(record.evidenceType as AmbientCandidateEvidence["evidenceType"])) return null;
    if (typeof record.field !== "string" || record.field.trim().length < 1 || record.field.length > 80) return null;
    const normalizedValue = record.normalizedValue;
    if (normalizedValue !== null && typeof normalizedValue !== "string" && typeof normalizedValue !== "number") return null;
    if (typeof normalizedValue === "string" && normalizedValue.length > 240) return null;
    const optionalString = (key: string, maxLength: number): string | null | undefined => {
      const raw = record[key];
      if (raw === undefined) return undefined;
      if (raw === null) return null;
      return typeof raw === "string" && raw.length <= maxLength ? raw : "__invalid__";
    };
    const sourceRef = optionalString("sourceRef", 200);
    const sourceTimestamp = optionalString("sourceTimestamp", 80);
    const sourceUser = optionalString("sourceUser", 200);
    if (sourceRef === "__invalid__" || sourceTimestamp === "__invalid__" || sourceUser === "__invalid__") return null;
    const confidence = record.confidence === undefined ? undefined : record.confidence;
    if (confidence !== undefined && confidence !== "low" && confidence !== "medium" && confidence !== "high") return null;
    const extractionSource = record.extractionSource === undefined ? undefined : record.extractionSource;
    if (extractionSource !== undefined && !AMBIENT_EVIDENCE_SOURCES.has(extractionSource as NonNullable<AmbientCandidateEvidence["extractionSource"]>)) return null;
    normalized.push({
      evidenceType: record.evidenceType as AmbientCandidateEvidence["evidenceType"],
      field: record.field.trim().slice(0, 80),
      normalizedValue: normalizedValue as string | number | null,
      ...(sourceRef !== undefined ? { sourceRef } : {}),
      ...(sourceTimestamp !== undefined ? { sourceTimestamp } : {}),
      ...(sourceUser !== undefined ? { sourceUser } : {}),
      ...(confidence !== undefined ? { confidence: confidence as AmbientCandidateEvidence["confidence"] } : {}),
      ...(extractionSource !== undefined ? { extractionSource: extractionSource as AmbientCandidateEvidence["extractionSource"] } : {}),
    });
  }
  return normalized.length ? normalized : undefined;
}

function normalizeCandidateConflictEvidence(value: unknown): AmbientCandidateConflictEvidence[] | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 12) return null;
  const normalized: AmbientCandidateConflictEvidence[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const facts = record.facts;
    const dbFacts = record.dbFacts;
    const businessRule = record.businessRule;
    if (typeof record.type !== "string" || record.type.length < 1 || record.type.length > 120
      || !Array.isArray(record.evidenceRefs) || record.evidenceRefs.length > 48
      || !record.evidenceRefs.every((ref) => typeof ref === "string" && ref.length <= 200)
      || typeof facts !== "object" || facts === null || Array.isArray(facts)
      || typeof dbFacts !== "object" || dbFacts === null || Array.isArray(dbFacts)
      || typeof businessRule !== "object" || businessRule === null || Array.isArray(businessRule)) return null;
    const factsRecord = facts as Record<string, unknown>;
    const dbRecord = dbFacts as Record<string, unknown>;
    const ruleRecord = businessRule as Record<string, unknown>;
    const caretakerClues = boundedStringArray(factsRecord.caretakerClues ?? [], 12, 160);
    const assignedFarms = dbRecord.assignedFarms === undefined ? undefined : boundedStringArray(dbRecord.assignedFarms, 13, 160);
    if (caretakerClues === null || assignedFarms === null) return null;
    const selectedFarm = factsRecord.selectedFarm;
    if (selectedFarm !== undefined && selectedFarm !== null && (typeof selectedFarm !== "string" || selectedFarm.length > 160)) return null;
    if (dbRecord.activeCaretakerAssignment !== undefined && typeof dbRecord.activeCaretakerAssignment !== "boolean") return null;
    if (typeof ruleRecord.caretakerRequiredForMortality !== "boolean") return null;
    if (typeof record.blocking !== "boolean" || typeof record.overrideAllowed !== "boolean") return null;
    const resolutionStatus = record.resolutionStatus;
    if (resolutionStatus !== undefined && resolutionStatus !== "unresolved" && resolutionStatus !== "explicit_user_choice_wins" && resolutionStatus !== "dismissed") return null;
    normalized.push({
      type: record.type,
      evidenceRefs: (record.evidenceRefs as string[]).slice(0, 48),
      facts: {
        caretakerClues: caretakerClues ?? [],
        ...(selectedFarm !== undefined ? { selectedFarm: selectedFarm as string | null } : {}),
      },
      dbFacts: {
        ...(dbRecord.activeCaretakerAssignment !== undefined ? { activeCaretakerAssignment: dbRecord.activeCaretakerAssignment as boolean } : {}),
        ...(assignedFarms ? { assignedFarms } : {}),
      },
      businessRule: { caretakerRequiredForMortality: ruleRecord.caretakerRequiredForMortality as boolean },
      blocking: record.blocking as boolean,
      overrideAllowed: record.overrideAllowed as boolean,
      ...(resolutionStatus !== undefined ? { resolutionStatus: resolutionStatus as AmbientCandidateConflictEvidence["resolutionStatus"] } : {}),
    });
  }
  return normalized.length ? normalized : undefined;
}

function normalizeCandidateResolution(value: unknown): AmbientCandidateResolution | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.status !== "resolved" && record.status !== "ambiguous" && record.status !== "unresolved") return null;
  const stringValue = (key: string, maxLength: number): { valid: boolean; value?: string | null } => {
    const raw = record[key];
    if (raw === undefined) return { valid: true, value: undefined };
    if (raw === null) return { valid: true, value: null };
    return typeof raw === "string" && raw.length <= maxLength ? { valid: true, value: raw } : { valid: false };
  };
  const arrayValue = (key: string, maxItems: number, maxLength: number): string[] | undefined | null => {
    if (record[key] === undefined) return undefined;
    return boundedStringArray(record[key], maxItems, maxLength);
  };
  const caretakerId = stringValue("caretakerId", 200);
  const caretakerText = stringValue("caretakerText", 160);
  const resolvedFarmId = stringValue("resolvedFarmId", 200);
  const candidateFarmIds = arrayValue("candidateFarmIds", 13, 200);
  const candidateFarmNames = arrayValue("candidateFarmNames", 13, 160);
  const resolvedHouseId = stringValue("resolvedHouseId", 200);
  const candidateHouseIds = arrayValue("candidateHouseIds", 13, 200);
  const candidateHouseNames = arrayValue("candidateHouseNames", 13, 80);
  const resolvedFlockId = stringValue("resolvedFlockId", 200);
  const candidateFlockIds = arrayValue("candidateFlockIds", 13, 200);
  if ([caretakerId, caretakerText, resolvedFarmId, resolvedHouseId, resolvedFlockId].some((item) => !item.valid)) return null;
  if ([candidateFarmIds, candidateFarmNames, candidateHouseIds, candidateHouseNames, candidateFlockIds].some((item) => item === null)) return null;
  return {
    status: record.status,
    caretakerId: caretakerId.value,
    caretakerText: caretakerText.value,
    resolvedFarmId: resolvedFarmId.value,
    candidateFarmIds: candidateFarmIds ?? undefined,
    candidateFarmNames: candidateFarmNames ?? undefined,
    resolvedHouseId: resolvedHouseId.value,
    candidateHouseIds: candidateHouseIds ?? undefined,
    candidateHouseNames: candidateHouseNames ?? undefined,
    resolvedFlockId: resolvedFlockId.value,
    candidateFlockIds: candidateFlockIds ?? undefined,
  };
}

function normalizeCandidateReconciliation(value: unknown): AmbientCandidateReconciliation | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.status !== "not_recorded" && record.status !== "possibly_recorded" && record.status !== "already_recorded") return null;
  if (record.matchConfidence !== "high" && record.matchConfidence !== "medium" && record.matchConfidence !== "low") return null;
  const matchConfidence = record.matchConfidence as "high" | "medium" | "low";
  const matchingOfficialRecordIds = boundedStringArray(record.matchingOfficialRecordIds, 100, 200);
  const matchReasons = boundedStringArray(record.matchReasons, 12, 500);
  if (!matchingOfficialRecordIds || !matchReasons) return null;
  let matchingOfficialRecords: AmbientCandidateReconciliation["matchingOfficialRecords"];
  if (record.matchingOfficialRecords !== undefined) {
    if (!Array.isArray(record.matchingOfficialRecords) || record.matchingOfficialRecords.length > 8) return null;
    const summaries = record.matchingOfficialRecords.map((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
      const summary = item as Record<string, unknown>;
      if (typeof summary.farmName !== "string" || summary.farmName.length > 160) return null;
      if (typeof summary.eventType !== "string" || summary.eventType.length > 80) return null;
      if (summary.quantity !== null && (typeof summary.quantity !== "number" || !Number.isFinite(summary.quantity))) return null;
      if (typeof summary.occurredAt !== "string" || summary.occurredAt.length > 80) return null;
      if (summary.recordKind !== "operational" && summary.recordKind !== "abnormal") return null;
      return {
        farmName: summary.farmName,
        eventType: summary.eventType,
        quantity: summary.quantity as number | null,
        occurredAt: summary.occurredAt,
        recordKind: summary.recordKind,
      };
    });
    if (summaries.some((item) => item === null)) return null;
    matchingOfficialRecords = summaries as NonNullable<AmbientCandidateReconciliation["matchingOfficialRecords"]>;
  }
  return { status: record.status, matchingOfficialRecordIds, matchReasons, matchConfidence, matchingOfficialRecords };
}

function normalizeCandidateUserOverrides(value: unknown): AmbientCandidateUserOverrides | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const farmValue = record.farm;
  const caretakerValue = record.caretaker;
  const farm = farmValue === undefined || farmValue === null
    ? undefined
    : typeof farmValue === "object" && farmValue !== null && !Array.isArray(farmValue)
      ? farmValue as Record<string, unknown>
      : null;
  const caretaker = caretakerValue === undefined || caretakerValue === null
    ? undefined
    : typeof caretakerValue === "object" && caretakerValue !== null && !Array.isArray(caretakerValue)
      ? caretakerValue as Record<string, unknown>
      : null;
  if (farm === null || caretaker === null) return null;
  const farmId = farm?.farmId;
  if (farm && (typeof farmId !== "string" || farmId.length < 1 || farmId.length > 200 || farm.status !== "selected")) return null;
  if (caretaker && caretaker.status !== "overridden" && caretaker.status !== "dismissed") return null;
  return {
    ...(farm ? { farm: { farmId: farmId as string, status: "selected" as const, at: typeof farm.at === "string" ? farm.at.slice(0, 80) : undefined } } : {}),
    ...(caretaker ? { caretaker: { status: caretaker.status as "overridden" | "dismissed", at: typeof caretaker.at === "string" ? caretaker.at.slice(0, 80) : undefined } } : {}),
  };
}

function normalizeAmbientCandidate(value: Record<string, unknown>): AmbientCandidate | null {
  const rawFarmText = value.farmText;
  if (rawFarmText !== undefined && rawFarmText !== null && (typeof rawFarmText !== "string" || rawFarmText.length > 160)) return null;
  const rawCaretakerText = value.caretakerText;
  if (rawCaretakerText !== undefined && rawCaretakerText !== null && (typeof rawCaretakerText !== "string" || rawCaretakerText.length > 160)) return null;
  const caretakerClues = value.caretakerClues === undefined
    ? undefined
    : boundedStringArray(value.caretakerClues, 12, 160);
  if (caretakerClues === null) return null;
  const rawHouseText = value.houseText;
  if (rawHouseText !== undefined && rawHouseText !== null && (typeof rawHouseText !== "string" || rawHouseText.length > 80)) return null;
  const rawFlockText = value.flockText;
  if (rawFlockText !== undefined && rawFlockText !== null && (typeof rawFlockText !== "string" || rawFlockText.length > 160)) return null;

  const rawConflicts = value.conflicts === undefined ? [] : boundedStringArray(value.conflicts, 12, 500);
  const rawUncertainties = value.uncertainties === undefined ? [] : boundedStringArray(value.uncertainties, 12, 160);
  const rawTexts = value.rawTexts === undefined ? [] : boundedStringArray(value.rawTexts, 24, 2000);
  const sourceMessageIds = value.sourceMessageIds === undefined ? [] : boundedStringArray(value.sourceMessageIds, 100, 200);
  const sourceTimestamps = value.sourceTimestamps === undefined ? [] : boundedStringArray(value.sourceTimestamps, 100, 80);
  const sourceUsers = value.sourceUsers === undefined ? [] : boundedStringArray(value.sourceUsers, 100, 200);
  if (rawConflicts === null || rawUncertainties === null || rawTexts === null || sourceMessageIds === null || sourceTimestamps === null || sourceUsers === null) return null;

  const eventType = value.eventType === undefined || value.eventType === null
    ? undefined
    : value.eventType === "mortality" || value.eventType === "cull" || value.eventType === "abnormal" ? value.eventType : null;
  if (eventType === null) return null;
  const quantityConfidence = value.quantityConfidence === undefined || value.quantityConfidence === null
    ? undefined
    : validQuantityConfidence(value.quantityConfidence) ? value.quantityConfidence : null;
  if (quantityConfidence === null) return null;
  const quantity = value.quantity === undefined || value.quantity === null
    ? null
    : typeof value.quantity === "number" && Number.isFinite(value.quantity) && value.quantity > 0 && value.quantity <= 1_000_000 ? value.quantity : null;
  if (value.quantity !== undefined && value.quantity !== null && quantity === null) return null;

  const conflict = value.conflict === true || rawConflicts.length > 0;
  const rawItems = value.items;
  let items: AmbientCandidateItem[];
  if (Array.isArray(rawItems)) {
    if (rawItems.length > 12) return null;
    const allowUnresolvedQuantity = quantityConfidence === "unknown" || quantity === null || conflict || rawUncertainties.some((item) => /quantity|數量/u.test(item));
    if (!rawItems.every((item) => validItem(item, allowUnresolvedQuantity))) return null;
    items = rawItems as AmbientCandidateItem[];
  } else if (eventType) {
    const raw = rawTexts[0] ?? (eventType === "mortality" ? `死亡${quantity ?? ""}` : eventType === "cull" ? `淘汰${quantity ?? ""}` : "異常");
    const unresolved = eventType !== "abnormal" && quantity === null;
    items = [{
      type: eventType,
      quantity: eventType === "abnormal" ? null : quantity,
      raw,
      confidence: quantityConfidence === "high" && !unresolved ? "high" : unresolved ? "low" : quantityConfidence === "medium" ? "medium" : "high",
    }];
  } else {
    return null;
  }
  if (!items.length) return null;
  const firstItem = items[0];
  const normalizedEventType = eventType ?? firstItem.type;
  const normalizedQuantity = quantity ?? firstItem.quantity;
  const resolution = normalizeCandidateResolution(value.resolution);
  const reconciliation = normalizeCandidateReconciliation(value.reconciliation);
  const userOverrides = normalizeCandidateUserOverrides(value.userOverrides);
  const evidence = normalizeCandidateEvidence(value.evidence);
  const conflictEvidence = normalizeCandidateConflictEvidence(value.conflictEvidence);
  if (resolution === null || reconciliation === null || userOverrides === null || evidence === null || conflictEvidence === null) return null;
  const state = value.state === undefined || value.state === null
    ? undefined
    : ["new", "unresolved_entity", "unresolved_quantity", "conflict", "possibly_recorded", "already_recorded", "no_actionable_event", "system_failure"].includes(String(value.state))
      ? value.state as AmbientCandidateState
      : null;
  if (state === null) return null;
  return {
    farmText: typeof rawFarmText === "string" ? rawFarmText.trim() || null : null,
    caretakerText: typeof rawCaretakerText === "string" ? rawCaretakerText.trim() || null : null,
    caretakerClues: caretakerClues?.length ? caretakerClues : (typeof rawCaretakerText === "string" && rawCaretakerText.trim() ? [rawCaretakerText.trim()] : undefined),
    houseText: typeof rawHouseText === "string" ? rawHouseText.trim() || null : null,
    flockText: typeof rawFlockText === "string" ? rawFlockText.trim() || null : null,
    eventType: normalizedEventType,
    quantity: normalizedQuantity,
    quantityConfidence: quantityConfidence ?? (normalizedEventType === "abnormal" ? firstItem.confidence : normalizedQuantity === null ? "unknown" : firstItem.confidence),
    rawTexts: rawTexts.length ? rawTexts : items.map((item) => item.raw),
    sourceMessageIds: sourceMessageIds.length ? sourceMessageIds : undefined,
    sourceTimestamps: sourceTimestamps.length ? sourceTimestamps : undefined,
    sourceUsers: sourceUsers.length ? sourceUsers : undefined,
    uncertainties: rawUncertainties.length ? rawUncertainties : undefined,
    conflicts: rawConflicts.length ? rawConflicts : undefined,
    items,
    conflict,
    conflictText: typeof value.conflictText === "string" ? value.conflictText.slice(0, 500) : rawConflicts[0] ?? null,
    evidence,
    conflictEvidence,
    resolution,
    reconciliation,
    userOverrides,
    state,
  };
}

export function validateAmbientCandidateBundle(value: unknown): AmbientCandidateBundle | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.candidates) || record.candidates.length > 8) return null;
  const candidates: AmbientCandidate[] = [];
  for (const candidateValue of record.candidates) {
    if (typeof candidateValue !== "object" || candidateValue === null || Array.isArray(candidateValue)) return null;
    const normalized = normalizeAmbientCandidate(candidateValue as Record<string, unknown>);
    if (!normalized) return null;
    candidates.push(normalized);
  }
  const sourceMessageIds = record.sourceMessageIds === undefined
    ? undefined
    : Array.isArray(record.sourceMessageIds) && record.sourceMessageIds.every((item) => typeof item === "string")
      ? record.sourceMessageIds.slice(0, 100) as string[]
      : null;
  if (sourceMessageIds === null) return null;
  const sourceTimestamps = record.sourceTimestamps === undefined ? undefined : boundedStringArray(record.sourceTimestamps, 100, 80);
  const sourceUsers = record.sourceUsers === undefined ? undefined : boundedStringArray(record.sourceUsers, 100, 200);
  if (sourceTimestamps === null || sourceUsers === null) return null;
  return { candidates, sourceMessageIds, sourceTimestamps: sourceTimestamps ?? undefined, sourceUsers: sourceUsers ?? undefined };
}

export const AMBIENT_CANDIDATE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          farmText: { type: ["string", "null"] },
          caretakerText: { type: ["string", "null"] },
          caretakerClues: { type: "array", maxItems: 12, items: { type: "string" } },
          houseText: { type: ["string", "null"] },
          flockText: { type: ["string", "null"] },
          eventType: { type: "string", enum: ["mortality", "cull", "abnormal"] },
          quantity: { type: ["number", "null"] },
          quantityConfidence: { type: "string", enum: ["unknown", "low", "medium", "high"] },
          rawTexts: { type: "array", items: { type: "string" } },
          sourceMessageIds: { type: "array", items: { type: "string" } },
          sourceTimestamps: { type: "array", items: { type: "string" } },
          sourceUsers: { type: "array", items: { type: "string" } },
          uncertainties: { type: "array", items: { type: "string" } },
          conflicts: { type: "array", items: { type: "string" } },
          conflict: { type: "boolean" },
          conflictText: { type: ["string", "null"] },
          evidence: { type: "array", maxItems: 48, items: { type: "object" } },
          conflictEvidence: { type: "array", maxItems: 12, items: { type: "object" } },
          resolution: { type: ["object", "null"] },
          reconciliation: { type: ["object", "null"] },
          userOverrides: { type: ["object", "null"] },
          state: { type: "string", enum: ["new", "unresolved_entity", "unresolved_quantity", "conflict", "possibly_recorded", "already_recorded", "no_actionable_event", "system_failure"] },
          items: {
            type: "array",
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                type: { type: "string", enum: ["mortality", "cull", "abnormal"] },
                quantity: { type: ["number", "null"] },
                raw: { type: "string" },
                confidence: { type: "string", enum: ["low", "medium", "high"] },
                mentionCount: { type: ["number", "null"] },
              },
              required: ["type", "quantity", "raw", "confidence"],
            },
          },
        },
        required: ["farmText", "houseText", "flockText", "items", "conflict"],
      },
    },
    sourceMessageIds: { type: "array", items: { type: "string" } },
  },
  required: ["candidates"],
} as const;

interface AmbientPromptSourceEntry {
  ref: string;
  selected: boolean;
  message: AmbientBufferedMessage;
}

interface AmbientPromptContext {
  entries: AmbientPromptSourceEntry[];
  selectedRefs: string[];
  byRef: Map<string, AmbientPromptSourceEntry>;
}

function ambientContextMessages(messages: AmbientBufferedMessage[]): AmbientBufferedMessage[] {
  const focused = ambientPrefilter(messages);
  if (!focused.length) return [];
  const focusedIds = new Set(focused.map((message) => message.lineMessageId));
  const indexes = focused
    .map((message) => messages.findIndex((candidate) => candidate.lineMessageId === message.lineMessageId))
    .filter((index) => index >= 0);
  const selectedIndexes = new Set<number>();
  for (const index of indexes) {
    // Keep a small surrounding window so a clue-only follow-up such as
    // "林志騰" stays attached to the preceding "死亡5" without sending an
    // entire hour of unrelated conversation to the model.
    for (let offset = -2; offset <= 2; offset += 1) {
      const next = index + offset;
      if (next >= 0 && next < messages.length) selectedIndexes.add(next);
    }
  }
  return [...selectedIndexes]
    .sort((left, right) => left - right)
    .map((index) => messages[index])
    .filter((message) => focusedIds.has(message.lineMessageId) || message.text.trim().length > 0);
}

function ambientPromptContext(messages: AmbientBufferedMessage[]): AmbientPromptContext {
  const focusedIds = new Set(ambientPrefilter(messages).map((message) => message.lineMessageId));
  const entries = ambientContextMessages(messages).map((message, index) => ({
    ref: `m${index + 1}`,
    selected: focusedIds.has(message.lineMessageId),
    message,
  }));
  return {
    entries,
    selectedRefs: entries.filter((entry) => entry.selected).map((entry) => entry.ref),
    byRef: new Map(entries.map((entry) => [entry.ref, entry])),
  };
}

/** Safe prompt trace for contract tests; it never returns message text or IDs. */
export function ambientPromptSourceRefsForTest(messages: AmbientBufferedMessage[]): Array<{ ref: string; selected: boolean }> {
  return ambientPromptContext(messages).entries.map(({ ref, selected }) => ({ ref, selected }));
}

interface AmbientSourceCoverageCheck {
  diagnostics: AmbientSourceCoverageDiagnostics;
  valid: boolean;
  errorClass:
    | "source_decision_missing"
    | "unknown_source_reference"
    | "duplicate_source_decision"
    | "invalid_support_target"
    | "invalid_context_decision_ref"
    | "invalid_event_schema"
    | null;
}

function checkAmbientSelectedSourceCoverage(value: unknown, context: AmbientPromptContext): AmbientSourceCoverageCheck {
  const selectedRefs = context.selectedRefs;
  const allRefs = new Set(context.entries.map((entry) => entry.ref));
  const selectedSet = new Set(selectedRefs);
  const decisionRefs: string[] = [];
  const accounted = new Set<string>();
  const ignored = new Set<string>();
  const supportDecisions: AmbientAiSupportDecision[] = [];
  const eventDecisions: AmbientAiEventDecision[] = [];
  const unknownRefs = new Set<string>();
  const duplicateRefs = new Set<string>();
  const contextRefs = new Set<string>();
  let invalidSupportTarget = false;
  let malformedDecision = false;
  const record = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const decisions = record?.decisions;
  if (!record || Object.keys(record).some((key) => key !== "decisions") || !Array.isArray(decisions) || decisions.length > AMBIENT_MAX_REQUEST_SOURCE_REFS) {
    malformedDecision = true;
  } else {
    for (const decisionValue of decisions) {
      if (typeof decisionValue !== "object" || decisionValue === null || Array.isArray(decisionValue)) {
        malformedDecision = true;
        continue;
      }
      const decision = decisionValue as Record<string, unknown>;
      const ref = decision.ref;
      if (typeof ref !== "string" || !AMBIENT_REQUEST_SOURCE_REF_PATTERN.test(ref)) {
        unknownRefs.add(typeof ref === "string" ? ref : "decision.ref");
        continue;
      }
      decisionRefs.push(ref);
      if (decisionRefs.filter((candidate) => candidate === ref).length > 1) duplicateRefs.add(ref);
      if (!allRefs.has(ref)) {
        unknownRefs.add(ref);
        continue;
      }
      if (!selectedSet.has(ref)) {
        contextRefs.add(ref);
        continue;
      }
      accounted.add(ref);
      if (decision.kind === "event") {
        const validEventType = decision.type === "mortality" || decision.type === "cull" || decision.type === "abnormal";
        const validEvent = validEventType
          && typeof decision.raw === "string"
          && decision.raw.trim().length > 0
          && decision.raw.length <= 160
          && validConfidence(decision.confidence)
          && validQuantityConfidence(decision.quantityConfidence);
        const quantityValid = decision.type === "abnormal"
          ? decision.quantity === null
          : decision.quantity === null || (typeof decision.quantity === "number" && Number.isFinite(decision.quantity) && decision.quantity > 0 && decision.quantity <= 1_000_000);
        const optionalTextValid = ([
          ["farmText", 160],
          ["houseText", 80],
          ["flockText", 160],
          ["caretakerText", 160],
        ] as const).every(([key, maxLength]) => {
          const value = decision[key];
          return value === undefined || value === null || (typeof value === "string" && value.length <= maxLength);
        });
        if (!validEvent || !quantityValid || !optionalTextValid) malformedDecision = true;
        else eventDecisions.push(decision as unknown as AmbientAiEventDecision);
      } else if (decision.kind === "support") {
        if (typeof decision.targetRef !== "string" || !AMBIENT_REQUEST_SOURCE_REF_PATTERN.test(decision.targetRef)) {
          malformedDecision = true;
          invalidSupportTarget = true;
        }
        else supportDecisions.push(decision as unknown as AmbientAiSupportDecision);
      } else if (decision.kind === "ignore") {
        ignored.add(ref);
      } else {
        malformedDecision = true;
      }
    }
  }
  const eventRefs = new Set(eventDecisions.map((decision) => decision.ref));
  for (const support of supportDecisions) {
    if (!selectedSet.has(support.targetRef) || !eventRefs.has(support.targetRef)) {
      malformedDecision = true;
      invalidSupportTarget = true;
    }
  }
  const unaccountedSourceRefs = selectedRefs.filter((ref) => !accounted.has(ref));
  const hasCoverageGap = unaccountedSourceRefs.length > 0 || decisionRefs.length !== selectedRefs.length;
  const firstErrorClass = malformedDecision
    ? invalidSupportTarget
      ? "invalid_support_target"
      : "invalid_event_schema"
    : duplicateRefs.size > 0
      ? "duplicate_source_decision"
      : contextRefs.size > 0
        ? "invalid_context_decision_ref"
        : unknownRefs.size > 0
          ? "unknown_source_reference"
          : hasCoverageGap
            ? "source_decision_missing"
            : null;
  const valid = !hasCoverageGap && !malformedDecision && !unknownRefs.size && !duplicateRefs.size && !contextRefs.size;
  return {
    diagnostics: {
      selectedSourceCount: selectedRefs.length,
      accountedSelectedSourceCount: selectedRefs.filter((ref) => accounted.has(ref)).length,
      unaccountedSelectedSourceCount: unaccountedSourceRefs.length,
      ignoredSelectedSourceCount: ignored.size,
      supportingSourceCount: supportDecisions.length,
      decisionCount: decisionRefs.length,
      eventDecisionCount: eventDecisions.length,
      supportDecisionCount: supportDecisions.length,
      ignoreDecisionCount: ignored.size,
      missingDecisionRefs: unaccountedSourceRefs.slice(0, AMBIENT_MAX_REQUEST_SOURCE_REFS),
      unknownDecisionRefs: [...new Set([...unknownRefs, ...contextRefs])].slice(0, AMBIENT_MAX_REQUEST_SOURCE_REFS),
      duplicateDecisionRefs: [...duplicateRefs].slice(0, AMBIENT_MAX_REQUEST_SOURCE_REFS),
      selectedSourceCoverageStatus: valid ? "pass" : "failed",
      unaccountedSourceRefs: unaccountedSourceRefs.slice(0, AMBIENT_MAX_REQUEST_SOURCE_REFS),
      ignoredSelectedSourceRefs: [...ignored].slice(0, AMBIENT_MAX_REQUEST_SOURCE_REFS),
    },
    valid,
    errorClass: firstErrorClass,
  };
}

export function ambientPrompt(messages: AmbientBufferedMessage[]): string {
  const context = ambientPromptContext(messages);
  return [
    "只做逐則雞場語意判斷，不建構正式紀錄。只輸出一個 compact 合法 JSON object；唯一 top-level key 是 decisions；不可輸出 Markdown、code fence、解釋、註解或其他文字。",
    "逐一處理所有 selected 訊息；每個 selected=true ref 必須且只能有一個 decision；ref 只能使用 selected ref，context=false 不可成為 decision。輸出前確認 decisions 的 ref 集合與所有 selected ref 完全相同。",
    "每個 decision 的 kind 必填；只能是 event、support、ignore，不得省略。",
    "event：ref、kind=event、type、quantity、quantityConfidence、raw、confidence；可選 farmText、houseText、flockText、caretakerText。type 只能 mortality、cull、abnormal；abnormal quantity 必須 null；quantityConfidence 可為 unknown；confidence 只能 low、medium、high。",
    "canonical event JSON 例：{\"ref\":\"m1\",\"kind\":\"event\",\"type\":\"mortality\",\"quantity\":3,\"quantityConfidence\":\"high\",\"raw\":\"死3隻\",\"confidence\":\"high\"}。",
    "support：ref、kind=support、targetRef；只有明確表示不是新增一筆、同一件事或就是剛才那件時使用，targetRef 必須指向原 event，不得建立新事件。ignore：ref、kind=ignore；只在 selected 訊息沒有營運事實時使用。",
    "同一農場同一 event type 但不同數量或時間仍是不同事件；混合閒聊與營運事實時只擷取營運部分。raw 是最短、非空、足以辨識事件的單一原文片段，最多160字，不可複製完整對話、改寫或加解釋。不要輸出任何系統欄位。",
    "輸出格式只能是 {\"decisions\":[...]}；完成輸出前確認所有 [] 與 {} 都已關閉；最後一個字元必須是 }。",
    `source_messages=${JSON.stringify(context.entries.map(({ ref, selected, message }) => ({ ref, selected, text: message.text })))}`,
  ].join("\n");
}

/** Build the exact current Production Ambient AI request without invoking AI. */
export function ambientAiRequestFor(messages: AmbientBufferedMessage[]): AmbientAiRequestInput {
  return {
    messages: [
      { role: "system", content: "只輸出 compact Ambient semantic JSON；不要輸出系統欄位。這是提案，不是正式紀錄。" },
      { role: "user", content: ambientPrompt(messages) },
    ],
    max_tokens: AMBIENT_AI_MAX_TOKENS,
    temperature: 0,
  };
}

/**
 * Single provider transport seam shared by Production extraction and the
 * explicitly gated remote-model evaluation adapter.
 */
export async function runAmbientAiRequestInput(
  env: AmbientEnv,
  model: string,
  input: AmbientAiRequestInput,
): Promise<unknown> {
  if (!env.AI) throw new Error("ambient_ai_unavailable");
  return env.AI.run(model, input as unknown as Record<string, unknown>);
}

export interface AmbientAiExtractionSizeEstimate {
  candidateCount: number;
  itemCount: number;
  sourceRelationshipCount: number;
  minChars: number;
  typicalChars: number;
  safeUpperChars: number;
  estimatedTypicalTokens: number;
  estimatedSafeTokens: number;
}

/**
 * Estimate the size of the model-owned contract without calling a provider.
 * Source lineage and resolver evidence are intentionally absent: those fields
 * belong to the deterministic system-enrichment phase.
 */
export function estimateAmbientAiExtractionSize(options: {
  candidateCount?: number;
  itemCount?: number;
  sourceRelationshipCount?: number;
} = {}): AmbientAiExtractionSizeEstimate {
  const candidateCount = Math.max(1, Math.min(8, Math.floor(options.candidateCount ?? 1)));
  const itemCount = Math.max(1, Math.min(12, Math.floor(options.itemCount ?? 3)));
  const sourceRelationshipCount = Math.max(0, Math.min(100, Math.floor(options.sourceRelationshipCount ?? 6)));
  // The decision contract has one entry per selected source. Preserve the
  // existing estimate API for callers, but use sourceRelationshipCount as the
  // selected-source/decision count when supplied. This keeps the estimate
  // useful for the real six-selected-source smoke cohort without reintroducing
  // the old candidate envelope.
  const decisionCount = Math.max(1, Math.min(AMBIENT_MAX_REQUEST_SOURCE_REFS, sourceRelationshipCount || itemCount));
  const eventCount = Math.min(itemCount, decisionCount);
  const build = (rawLength: number, withOptionalClues: boolean): number => JSON.stringify({
    decisions: Array.from({ length: decisionCount }, (_, index) => index < eventCount
      ? {
        ref: `m${index + 1}`,
        kind: "event",
        type: index % 3 === 0 ? "mortality" : index % 3 === 1 ? "cull" : "abnormal",
        quantity: index % 3 === 2 ? null : index + 1,
        quantityConfidence: index % 3 === 2 ? "unknown" : "high",
        raw: "來源片段".repeat(Math.max(1, Math.ceil(rawLength / 4))).slice(0, rawLength),
        confidence: index % 3 === 0 ? "high" : "low",
        ...(withOptionalClues ? {
          farmText: "金雞測試場".slice(0, 24),
          houseText: "第一舍",
          flockText: "2026-A",
          caretakerText: "飼養者線索",
        } : {}),
      }
      : index === eventCount && eventCount > 0
        ? { ref: `m${index + 1}`, kind: "support", targetRef: `m${eventCount}` }
        : { ref: `m${index + 1}`, kind: "ignore" }),
  }).length;
  const minChars = build(4, false);
  const typicalChars = build(28, false);
  const safeUpperChars = build(160, true);
  return {
    candidateCount,
    itemCount,
    sourceRelationshipCount,
    minChars,
    typicalChars,
    safeUpperChars,
    estimatedTypicalTokens: Math.ceil(typicalChars / 4),
    estimatedSafeTokens: Math.ceil(safeUpperChars / 4),
  };
}

export async function extractAmbientCandidates(
  env: AmbientEnv,
  messages: AmbientBufferedMessage[],
  model = PRODUCTION_AI_MODEL,
): Promise<AmbientExtractionResult> {
  const focused = ambientPrefilter(messages);
  if (!focused.length || !env.AI) return { attempted: false, bundle: null, validation: "not_invoked" };
  try {
    const result = await runAmbientAiRequestInput(env, model, ambientAiRequestFor(messages));
    const aiText = aiResponseText(result);
    const parsedJson = parseJson(aiText);
    const rawParsed = parsedJson.value;
    const parseFailed = rawParsed === null && aiText.trim() !== "null";
    const parsed = normalizeAmbientAiExtraction(rawParsed);
    const promptContext = ambientPromptContext(messages);
    const sourceCoverageCheck = parseFailed || rawParsed === null
      ? null
      : checkAmbientSelectedSourceCoverage(parsed, promptContext);
    const safeOrdinalForPromptRef = (ref: string): string | null => {
      const messageId = promptContext.byRef.get(ref)?.message.lineMessageId;
      const index = messageId ? messages.findIndex((message) => message.lineMessageId === messageId) : -1;
      return index >= 0 ? String(index + 1).padStart(2, "0") : null;
    };
    const sourceCoverage = sourceCoverageCheck
      ? {
        ...sourceCoverageCheck.diagnostics,
        ignoredSelectedSourceOrdinals: (sourceCoverageCheck.diagnostics.ignoredSelectedSourceRefs ?? [])
          .map(safeOrdinalForPromptRef)
          .filter((value): value is string => Boolean(value)),
        unaccountedSourceOrdinals: sourceCoverageCheck.diagnostics.unaccountedSourceRefs
          .map(safeOrdinalForPromptRef)
          .filter((value): value is string => Boolean(value)),
      }
      : undefined;
    const transportDiagnostics = ambientTransportDiagnostics(
      result,
      aiText,
      parseFailed,
      AMBIENT_AI_MAX_TOKENS,
      focused.length,
      rawParsed,
      sourceCoverage ?? null,
      parsedJson.syntax,
    );
    const validationDiagnostics = ambientValidationDiagnostics(
      rawParsed,
      parsed,
      parseFailed,
      null,
      sourceCoverage,
      sourceCoverageCheck?.errorClass ?? undefined,
    );
    const decisionSchemaDiagnostics = buildAmbientDecisionSchemaDiagnostics(
      rawParsed,
      parsed,
      sourceCoverageCheck?.valid === false ? validationDiagnostics : undefined,
      promptContext.selectedRefs,
    );
    if (sourceCoverageCheck && !sourceCoverageCheck.valid) {
      return {
        attempted: true,
        bundle: null,
        validation: "schema_invalid",
        errorClass: sourceCoverageCheck.errorClass ?? "source_decision_missing",
        validationDiagnostics,
        decisionSchemaDiagnostics,
        transportDiagnostics,
        sourceCoverage,
      };
    }
    const systemEnriched = buildAmbientCandidateBundleFromDecisions(parsed, promptContext);
    const bundle = validateAmbientCandidateBundle(systemEnriched);
    const finalValidationDiagnostics = ambientValidationDiagnostics(rawParsed, parsed, parseFailed, bundle, sourceCoverage);
    const decisionSummaries = sourceCoverageCheck?.valid && typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      && Array.isArray((parsed as Record<string, unknown>).decisions)
      ? ((parsed as Record<string, unknown>).decisions as unknown[]).flatMap((decision): AmbientAiDecisionSummary[] => {
        if (typeof decision !== "object" || decision === null || Array.isArray(decision)) return [];
        const record = decision as Record<string, unknown>;
        if ((record.kind !== "event" && record.kind !== "support" && record.kind !== "ignore") || typeof record.ref !== "string") return [];
        const sourceRef = safeOrdinalForPromptRef(record.ref);
        if (!sourceRef) return [];
        const targetRef = record.kind === "support" && typeof record.targetRef === "string"
          ? safeOrdinalForPromptRef(record.targetRef)
          : null;
        return [{
          sourceRef,
          kind: record.kind,
          ...(targetRef ? { targetRef } : {}),
        }];
      })
      : undefined;
    if (bundle) return {
      attempted: true,
      bundle,
      validation: "schema_valid",
      validationDiagnostics: finalValidationDiagnostics,
      decisionSchemaDiagnostics,
      transportDiagnostics,
      sourceCoverage,
      decisionSummaries,
    };
    // A failed JSON parse is a technical extraction failure.  Never substitute
    // a second source-text parser here: it would bypass the provider contract,
    // selected-source accounting, strict JSON policy, and the model-owned
    // semantic boundary.  The caller retains the retryable sources.
    return {
      attempted: true,
      bundle,
      validation: bundle ? "schema_valid" : "schema_invalid",
      ...(bundle ? {} : { errorClass: "invalid_ambient_candidate_json" }),
      validationDiagnostics: finalValidationDiagnostics,
      decisionSchemaDiagnostics,
      transportDiagnostics,
      sourceCoverage,
    };
  } catch (error) {
    return { attempted: true, bundle: null, validation: "ai_error", errorClass: errorClass(error) };
  }
}

export interface AmbientOfficialRecord {
  id: string;
  recordKind: "operational" | "abnormal";
  eventType: string;
  quantity: number | null;
  farmId: string;
  farmName: string;
  houseId: string | null;
  flockId: string | null;
  rawText: string;
  actorId: string | null;
  lineGroupId: string | null;
  source: string;
  occurredAt: string;
  createdAt: string;
}

export interface AmbientReconciliationSummary {
  extractedCandidateCount: number;
  resolvedCount: number;
  ambiguousEntityCount: number;
  unresolvedQuantityCount: number;
  conflictCount: number;
  reconcileAlreadyRecorded: number;
  reconcilePossible: number;
  reconcileNew: number;
  noActionableCount: number;
  officialRecordsLoaded: number;
  reconciliationDurationMs: number;
}

const AMBIENT_RECONCILIATION_MARGIN_MS = 15 * 60 * 1000;
const AMBIENT_CONTINUATION_WINDOW_MS = 6 * 60 * 60 * 1000;
const AMBIENT_CONTINUATION_PATTERN = /(?:還在|还在|沒改善|没改善|未改善|持續|持续|仍然|又在)/u;

function ambientKey(value: string | null | undefined): string {
  return normalize(value ?? "").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function appendAmbientUnique(values: string[] | undefined, value: string): string[] {
  return values?.includes(value) ? values : [...(values ?? []), value];
}

interface AmbientFarmClue extends FarmRecord {
  structureMode?: "whole_farm" | "multi_house";
}

interface AmbientFarmClues {
  farms: AmbientFarmClue[];
  aliases: FarmAliasRecord[];
  caretakerAssignments: Array<{ caretakerId: string; caretakerName: string; farmId: string }>;
}

async function loadAmbientFarmClues(
  env: AmbientEnv,
  organizationId: string,
  referenceAt: string,
): Promise<AmbientFarmClues> {
  const [farmRows, aliasRows, caretakerRows] = await Promise.all([
    env.DB.prepare(
      `SELECT id, name, active, environment, site_name AS siteName,
              farm_structure_mode AS structureMode, note
         FROM farms
        WHERE organization_id = ? AND active = 1
        ORDER BY name, id`,
    ).bind(organizationId).all<AmbientFarmClue>(),
    env.DB.prepare(
      `SELECT a.farm_id AS farmId, a.alias, a.normalized_alias AS normalizedAlias,
              a.alias_type AS aliasType, a.status
         FROM farm_aliases a
         JOIN farms f ON f.id = a.farm_id
        WHERE f.organization_id = ? AND f.active = 1
        ORDER BY LENGTH(a.alias) DESC, a.id`,
    ).bind(organizationId).all<FarmAliasRecord>(),
    env.DB.prepare(
      `SELECT c.id AS caretakerId, c.name AS caretakerName, a.farm_id AS farmId
         FROM caretakers c
         JOIN farm_caretaker_assignments a ON a.caretaker_id = c.id
         JOIN farms f ON f.id = a.farm_id
        WHERE c.organization_id = ? AND c.active = 1 AND f.organization_id = ? AND f.active = 1
          AND a.effective_from <= ? AND (a.effective_to IS NULL OR a.effective_to >= ?)
        ORDER BY c.name, a.farm_id`,
    ).bind(organizationId, organizationId, referenceAt, referenceAt.slice(0, 10)).all<{ caretakerId: string; caretakerName: string; farmId: string }>(),
  ]);
  return { farms: farmRows.results, aliases: aliasRows.results, caretakerAssignments: caretakerRows.results };
}

function candidateSourceMessages(candidate: AmbientCandidate, messages: AmbientBufferedMessage[], fallbackIds: Set<string>): AmbientBufferedMessage[] {
  const explicitIds = new Set(candidate.sourceMessageIds ?? []);
  const caretakerClues = candidate.caretakerClues ?? (candidate.caretakerText ? [candidate.caretakerText] : []);
  const selected = explicitIds.size
    ? messages.filter((message) => explicitIds.has(message.lineMessageId))
    : messages.filter((message) => {
      const textKey = ambientKey(message.text);
      return (candidate.rawTexts ?? []).some((raw) => {
        const rawKey = ambientKey(raw);
        return rawKey.length >= 2 && (textKey.includes(rawKey) || rawKey.includes(textKey));
      }) || (candidate.caretakerText ? textKey.includes(ambientKey(candidate.caretakerText)) : false)
        || caretakerClues.some((clue) => textKey.includes(ambientKey(clue)))
        || (candidate.farmText ? textKey.includes(ambientKey(candidate.farmText)) : false);
    });
  if (selected.length) return selected;
  return messages.filter((message) => fallbackIds.has(message.lineMessageId));
}

function enrichAmbientCandidateEvidence(
  candidate: AmbientCandidate,
  sourceMessages: AmbientBufferedMessage[],
): AmbientCandidateEvidence[] {
  const evidence = [...(candidate.evidence ?? [])];
  const seen = new Set(evidence.map((item) => [item.evidenceType, item.field, String(item.normalizedValue), item.sourceRef ?? ""].join("\u001f")));
  const add = (item: AmbientCandidateEvidence): void => {
    const key = [item.evidenceType, item.field, String(item.normalizedValue), item.sourceRef ?? ""].join("\u001f");
    if (seen.has(key) || evidence.length >= 48) return;
    seen.add(key);
    evidence.push(item);
  };
  const sourceFor = (value: string): AmbientBufferedMessage[] => {
    const valueKey = ambientKey(value);
    const matched = sourceMessages.filter((message) => {
      const messageKey = ambientKey(message.text);
      return valueKey.length >= 2 && (messageKey.includes(valueKey) || valueKey.includes(messageKey));
    });
    return matched.length ? matched.slice(0, 4) : sourceMessages.slice(0, 1);
  };
  const addSourceEvidence = (
    evidenceType: AmbientCandidateEvidence["evidenceType"],
    field: string,
    value: string | number,
    sourceValue: string,
  ): void => {
    for (const message of sourceFor(sourceValue)) {
      add({
        evidenceType,
        field,
        normalizedValue: value,
        sourceRef: message.lineMessageId,
        sourceTimestamp: message.eventTimestamp,
        sourceUser: message.lineUserId,
        confidence: "medium",
        extractionSource: "ai",
      });
    }
  };

  for (const item of candidate.items) {
    addSourceEvidence(
      "source_fact",
      item.type === "mortality" ? "mortality" : item.type === "cull" ? "cull" : "event",
      item.quantity ?? item.raw,
      item.raw,
    );
  }
  if (candidate.farmText) addSourceEvidence("farm_clue", "farm", candidate.farmText, candidate.farmText);
  for (const clue of candidate.caretakerClues ?? (candidate.caretakerText ? [candidate.caretakerText] : [])) {
    addSourceEvidence("caretaker_clue", "caretaker", clue, clue);
  }
  if (candidate.houseText) addSourceEvidence("house_clue", "house", candidate.houseText, candidate.houseText);
  if (candidate.flockText) addSourceEvidence("flock_clue", "flock", candidate.flockText, candidate.flockText);
  if (candidate.userOverrides?.farm?.status === "selected") {
    add({
      evidenceType: "explicit_user_choice",
      field: "farm",
      normalizedValue: candidate.farmText ?? candidate.userOverrides.farm.farmId,
      sourceRef: null,
      sourceTimestamp: null,
      sourceUser: null,
      confidence: "high",
      extractionSource: "explicit_user",
    });
  }
  return evidence;
}

async function resolveAmbientCandidateEntity(
  env: AmbientEnv,
  organizationId: string,
  candidate: AmbientCandidate,
  referenceAt: string,
  preloadedClues?: AmbientFarmClues,
  sourceMessages: AmbientBufferedMessage[] = [],
): Promise<AmbientCandidate> {
  const clues = preloadedClues ?? await loadAmbientFarmClues(env, organizationId, referenceAt);
  const resolver = new FarmResolver(clues.farms, clues.aliases);
  const farmById = new Map(clues.farms.map((farm) => [farm.id, farm]));
  const rawFarmResolution = candidate.farmText ? resolver.resolve(candidate.farmText) : null;
  const farmTextIds = rawFarmResolution?.kind === "direct" && rawFarmResolution.farm
    ? [rawFarmResolution.farm.id]
    : rawFarmResolution?.candidates.map((farm) => farm.farmId) ?? [];
  const caretakerClues = [...new Set((candidate.caretakerClues?.length
    ? candidate.caretakerClues
    : candidate.caretakerText
      ? [candidate.caretakerText]
      : []).map((value) => value.trim()).filter(Boolean))];
  const caretakerText = caretakerClues.length === 1 ? caretakerClues[0] : candidate.caretakerText?.trim() || null;
  const matchingCaretakerAssignments = caretakerClues.flatMap((clue) => {
    const caretakerKey = ambientKey(clue);
    return clues.caretakerAssignments.filter((assignment) => {
      const key = ambientKey(assignment.caretakerName);
      return key === caretakerKey || key.includes(caretakerKey) || caretakerKey.includes(key);
    });
  });
  const matchingCaretakers = [...new Set(matchingCaretakerAssignments.map((assignment) => assignment.caretakerId))];
  const caretakerFarmIds = [...new Set(matchingCaretakerAssignments.map((assignment) => assignment.farmId))];
  const caretakerNameFarmIds = caretakerClues.flatMap((clue) => resolver.resolve(clue).candidates.map((farm) => farm.farmId));
  const caretakerClueDismissed = candidate.userOverrides?.caretaker?.status === "dismissed";
  const caretakerClueOverridden = candidate.userOverrides?.caretaker?.status === "overridden";
  const activeCaretakerFarmIds = caretakerClueDismissed || caretakerClueOverridden ? [] : caretakerFarmIds;
  const activeCaretakerNameFarmIds = caretakerClueDismissed || caretakerClueOverridden ? [] : caretakerNameFarmIds;
  const clueFarmIds = [...new Set([...farmTextIds, ...activeCaretakerFarmIds, ...activeCaretakerNameFarmIds])]
    .filter((id) => farmById.has(id));
  const intersection = farmTextIds.length && activeCaretakerFarmIds.length
    ? farmTextIds.filter((id) => activeCaretakerFarmIds.includes(id))
    : [];
  // A Farm selected from the Candidate Inbox is an explicit human decision.
  // Keep the caretaker clue for audit/reconciliation, but do not let the
  // earlier ambiguous clue overwrite the Farm the user just selected.
  const explicitFarmId = candidate.userOverrides?.farm?.status === "selected"
    && farmById.has(candidate.userOverrides.farm.farmId)
    ? candidate.userOverrides.farm.farmId
    : null;
  const resolvedIds = explicitFarmId
    ? [explicitFarmId]
    : intersection.length
      ? intersection
      : clueFarmIds;
  const clueConflict = !explicitFarmId && !caretakerClueDismissed && !caretakerClueOverridden
    && Boolean(farmTextIds.length && activeCaretakerFarmIds.length && !intersection.length);
  const next: AmbientCandidate = {
    ...candidate,
    caretakerText,
    caretakerClues: caretakerClues.length ? caretakerClues : undefined,
    uncertainties: candidate.uncertainties,
  };
  // Enrich model output before constructing conflict objects so every
  // structured conflict can point back to the retained minimum evidence.
  next.evidence = enrichAmbientCandidateEvidence(next, sourceMessages);
  const clueConflictKeys = new Set(["farm_and_caretaker_clues_disagree", "multiple_caretaker_clues"]);
  const retainedConflicts = (candidate.conflicts ?? []).filter((conflict) =>
    !(explicitFarmId || caretakerClueDismissed || caretakerClueOverridden) || !clueConflictKeys.has(conflict));
  next.conflicts = retainedConflicts.length ? retainedConflicts : undefined;
  if (clueConflict) {
    next.conflict = true;
    next.conflicts = appendAmbientUnique(next.conflicts, "farm_and_caretaker_clues_disagree");
    next.conflictText = next.conflictText ?? "雞場與飼養者線索不一致";
  } else if (explicitFarmId || caretakerClueDismissed || caretakerClueOverridden) {
    const hasOtherConflict = retainedConflicts.length > 0 && retainedConflicts.some((conflict) => !clueConflictKeys.has(conflict));
    if (!hasOtherConflict && /雞場與飼養者|飼養者線索|caretaker/u.test(candidate.conflictText ?? "")) {
      next.conflict = false;
      next.conflictText = null;
    } else if (!hasOtherConflict && candidate.conflict && (candidate.conflicts ?? []).length === 0) {
      next.conflict = false;
    }
  }

  const resolution: AmbientCandidateResolution = {
    status: resolvedIds.length === 1 ? "resolved" : resolvedIds.length > 1 ? "ambiguous" : "unresolved",
    caretakerId: matchingCaretakers.length === 1 ? matchingCaretakers[0] : null,
    caretakerText,
    resolvedFarmId: resolvedIds.length === 1 ? resolvedIds[0] : null,
    candidateFarmIds: resolvedIds,
    candidateFarmNames: resolvedIds.map((id) => farmById.get(id)?.name).filter((name): name is string => Boolean(name)),
  };
  const selectedFarm = resolvedIds.length === 1 ? farmById.get(resolvedIds[0]) : null;
  if (selectedFarm) {
    next.farmText = selectedFarm.name;
    const houses = await env.DB.prepare(
      `SELECT id, name FROM houses WHERE farm_id = ? AND active = 1 ORDER BY normalized_name, id`,
    ).bind(selectedFarm.id).all<{ id: string; name: string }>();
    const requestedHouse = candidate.houseText ? ambientKey(candidate.houseText) : "";
    const selectedHouse = requestedHouse
      ? houses.results.find((house) => ambientKey(house.name) === requestedHouse || ambientKey(house.name).includes(requestedHouse) || requestedHouse.includes(ambientKey(house.name)))
      : null;
    if (selectedHouse) {
      resolution.resolvedHouseId = selectedHouse.id;
      next.houseText = selectedHouse.name;
    } else if (candidate.houseText) {
      resolution.status = "unresolved";
      resolution.candidateHouseIds = [];
      resolution.candidateHouseNames = [];
      next.uncertainties = appendAmbientUnique(next.uncertainties, "house_not_resolved");
    } else if (selectedFarm.structureMode === "multi_house" && houses.results.length > 1) {
      resolution.status = "ambiguous";
      resolution.candidateHouseIds = houses.results.map((house) => house.id);
      resolution.candidateHouseNames = houses.results.map((house) => house.name);
      next.uncertainties = appendAmbientUnique(next.uncertainties, "house_not_uniquely_resolved");
    } else if (houses.results.length === 1) {
      resolution.resolvedHouseId = houses.results[0].id;
      next.houseText = houses.results[0].name;
    }
    if (resolution.resolvedHouseId) {
      const flocks = await env.DB.prepare(
        `SELECT id, batch_code AS batchCode FROM flocks WHERE farm_id = ? AND house_id = ? AND status = 'active' ORDER BY id`,
      ).bind(selectedFarm.id, resolution.resolvedHouseId).all<{ id: string; batchCode: string }>();
      const requestedFlock = candidate.flockText ? ambientKey(candidate.flockText) : "";
      const selectedFlock = requestedFlock
        ? flocks.results.find((flock) => ambientKey(flock.batchCode) === requestedFlock || ambientKey(flock.batchCode).includes(requestedFlock) || requestedFlock.includes(ambientKey(flock.batchCode)))
        : null;
      if (selectedFlock) {
        resolution.resolvedFlockId = selectedFlock.id;
        next.flockText = selectedFlock.batchCode;
      } else if (candidate.flockText) {
        resolution.status = "unresolved";
        resolution.candidateFlockIds = [];
        next.uncertainties = appendAmbientUnique(next.uncertainties, "flock_not_resolved");
      } else if (flocks.results.length > 1) {
        resolution.status = "ambiguous";
        resolution.candidateFlockIds = flocks.results.map((flock) => flock.id);
        next.uncertainties = appendAmbientUnique(next.uncertainties, "flock_not_uniquely_resolved");
      } else if (flocks.results.length === 1) {
        resolution.resolvedFlockId = flocks.results[0].id;
        next.flockText = flocks.results[0].batchCode;
      }
    }
  } else if (resolution.status === "unresolved") {
    next.uncertainties = appendAmbientUnique(next.uncertainties, "farm_not_resolved");
  } else if (resolution.status === "ambiguous") {
    next.uncertainties = appendAmbientUnique(next.uncertainties, "farm_not_uniquely_resolved");
  }
  const caretakerConflict = caretakerClues.length > 1
    || (candidate.conflicts ?? []).some((value) => /caretaker|飼養者|饲养者/u.test(value))
    || /飼養者|饲养者/u.test(candidate.conflictText ?? "");
  if (caretakerConflict || caretakerClues.length) {
    const assignedFarms = [...new Set(matchingCaretakerAssignments.map((assignment) => assignment.farmId))]
      .map((farmId) => farmById.get(farmId)?.name ?? farmId);
    const evidenceRefs = (candidate.evidence ?? [])
      .filter((evidence) => evidence.field === "caretaker")
      .map((evidence) => evidence.sourceRef)
      .filter((value): value is string => Boolean(value));
    next.conflictEvidence = [
      ...(candidate.conflictEvidence ?? []).filter((evidence) => evidence.type !== "caretaker_farm_mismatch"),
      {
        type: "caretaker_farm_mismatch",
        evidenceRefs: evidenceRefs.slice(0, 48),
        facts: {
          caretakerClues,
          selectedFarm: selectedFarm?.name ?? candidate.farmText ?? null,
        },
        dbFacts: {
          activeCaretakerAssignment: Boolean(assignedFarms.length),
          assignedFarms: assignedFarms.slice(0, 13),
        },
        businessRule: { caretakerRequiredForMortality: false },
        blocking: !resolvedIds.length,
        overrideAllowed: true,
        resolutionStatus: explicitFarmId
          ? "explicit_user_choice_wins"
          : caretakerClueDismissed || caretakerClueOverridden
            ? "dismissed"
            : "unresolved",
      },
    ];
  }
  next.resolution = resolution;
  return next;
}

async function loadEffectiveAmbientOfficialRecords(
  env: AmbientEnv,
  organizationId: string,
  startAt: string,
  endAt: string,
): Promise<AmbientOfficialRecord[]> {
  const [operational, abnormal] = await Promise.all([
    env.DB.prepare(
      `SELECT e.id, e.intent AS eventType, e.quantity, e.farm_id AS farmId, f.name AS farmName,
              e.house_id AS houseId, e.flock_id AS flockId, e.raw_message AS rawText,
              e.line_user_id AS actorId, e.line_group_id AS lineGroupId,
              COALESCE(q.occurredAt, e.created_at) AS occurredAt,
              e.created_at AS createdAt
         FROM operational_events e
         JOIN farms f ON f.id = e.farm_id
         LEFT JOIN (
           SELECT operational_event_id, MIN(occurred_at) AS occurredAt
             FROM quick_record_items
            WHERE operational_event_id IS NOT NULL
            GROUP BY operational_event_id
         ) q ON q.operational_event_id = e.id
        WHERE e.organization_id = ? AND e.reversed_at IS NULL
          AND COALESCE(q.occurredAt, e.created_at) >= ?
          AND COALESCE(q.occurredAt, e.created_at) <= ?
        ORDER BY occurredAt, e.created_at, e.id`,
    ).bind(organizationId, startAt, endAt).all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT a.id, 'abnormal' AS eventType, NULL AS quantity, a.farm_id AS farmId,
              f.name AS farmName, a.house_id AS houseId, a.flock_id AS flockId,
              a.raw_text AS rawText, a.actor_id AS actorId, NULL AS lineGroupId,
              COALESCE(a.occurred_at, a.reported_at, a.created_at) AS occurredAt,
              a.created_at AS createdAt
         FROM abnormal_events a
         JOIN farms f ON f.id = a.farm_id
        WHERE a.organization_id = ? AND a.status = 'active'
          AND COALESCE(a.occurred_at, a.reported_at, a.created_at) >= ?
          AND COALESCE(a.occurred_at, a.reported_at, a.created_at) <= ?
        ORDER BY occurredAt, a.created_at, a.id`,
    ).bind(organizationId, startAt, endAt).all<Record<string, unknown>>(),
  ]);
  const toRecord = (row: Record<string, unknown>, recordKind: "operational" | "abnormal"): AmbientOfficialRecord => ({
    id: String(row.id),
    recordKind,
    eventType: String(row.eventType),
    quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    farmId: String(row.farmId),
    farmName: String(row.farmName),
    houseId: row.houseId ? String(row.houseId) : null,
    flockId: row.flockId ? String(row.flockId) : null,
    rawText: String(row.rawText ?? ""),
    actorId: row.actorId ? String(row.actorId) : null,
    lineGroupId: row.lineGroupId ? String(row.lineGroupId) : null,
    source: recordKind,
    occurredAt: String(row.occurredAt),
    createdAt: String(row.createdAt),
  });
  return [
    ...operational.results.map((row) => toRecord(row, "operational")),
    ...abnormal.results.map((row) => toRecord(row, "abnormal")),
  ];
}

function candidateItemEventType(item: AmbientCandidateItem): string {
  return item.type === "mortality" ? "mortality" : item.type === "cull" ? "cull" : "abnormal";
}

function minAmbientTimeDistance(candidateTimes: string[], officialAt: string): number {
  const official = Date.parse(officialAt);
  if (!Number.isFinite(official) || !candidateTimes.length) return Number.POSITIVE_INFINITY;
  return Math.min(...candidateTimes.map((value) => Math.abs(official - Date.parse(value))).filter(Number.isFinite));
}

function ambientRawOverlap(candidate: AmbientCandidate, official: AmbientOfficialRecord): boolean {
  const officialKey = ambientKey(official.rawText);
  return (candidate.rawTexts ?? candidate.items.map((item) => item.raw)).some((raw) => {
    const key = ambientKey(raw);
    return key.length >= 2 && (officialKey.includes(key) || key.includes(officialKey) || (official.recordKind === "abnormal" && key.includes("咳") && officialKey.includes("咳")));
  });
}

export function reconcileAmbientCandidate(
  candidate: AmbientCandidate,
  officialRecords: AmbientOfficialRecord[],
  sourceMessages: AmbientBufferedMessage[] = [],
): AmbientCandidate {
  const sourceTimes = (candidate.sourceTimestamps ?? sourceMessages.map((message) => message.eventTimestamp)).filter((value) => Number.isFinite(Date.parse(value)));
  const sourceUsers = new Set(candidate.sourceUsers ?? sourceMessages.map((message) => message.lineUserId));
  const sourceGroups = new Set(sourceMessages.map((message) => message.lineGroupId));
  const farmIds = candidate.resolution?.resolvedFarmId
    ? [candidate.resolution.resolvedFarmId]
    : candidate.resolution?.candidateFarmIds ?? [];
  const matchingIds: string[] = [];
  const reasons = new Set<string>();
  let strongest: "high" | "medium" | "low" = "low";
  for (const item of candidate.items) {
    const type = candidateItemEventType(item);
    const quantity = item.quantity;
    for (const record of officialRecords) {
      if (record.eventType !== type) continue;
      if (record.lineGroupId && sourceGroups.size && !sourceGroups.has(record.lineGroupId)) continue;
      if (farmIds.length && !farmIds.includes(record.farmId)) continue;
      const timeDistance = minAmbientTimeDistance(sourceTimes, record.occurredAt);
      const continuation = type === "abnormal" && AMBIENT_CONTINUATION_PATTERN.test(item.raw);
      if (timeDistance > (continuation ? AMBIENT_CONTINUATION_WINDOW_MS : AMBIENT_RECONCILIATION_MARGIN_MS)) continue;
      const quantityMatches = quantity !== null && record.quantity !== null && quantity === record.quantity;
      const quantityDiffers = quantity !== null && record.quantity !== null && quantity !== record.quantity;
      const actorMatches = Boolean(record.actorId && sourceUsers.has(record.actorId));
      const rawMatches = ambientRawOverlap(candidate, record);
      const timeClose = timeDistance <= 5 * 60 * 1000;
      const farmResolved = candidate.resolution?.status === "resolved" && farmIds.length === 1;
      const sameGroupEvidence = record.recordKind === "operational" && Boolean(record.lineGroupId && sourceGroups.has(record.lineGroupId));
      let score = 1;
      if (farmResolved) score += 2;
      if (quantityMatches || (type === "abnormal" && rawMatches)) score += 3;
      if (actorMatches) score += 2;
      if (rawMatches) score += 1;
      if (timeClose) score += 2;
      if (record.createdAt >= (sourceTimes[0] ?? record.createdAt)) score += 1;
      if (quantityDiffers) reasons.add(`數量不同：群組提到${quantity}，正式紀錄為${record.quantity}`);
      if (rawMatches) reasons.add("原文語意相符");
      if (actorMatches) reasons.add("來源使用者相同");
      if (timeClose) reasons.add("時間接近");
      if (continuation) reasons.add("可能是既有異常持續");
      if (farmResolved) reasons.add("雞場已唯一解析");
      matchingIds.push(record.id);
      const strong = farmResolved && !quantityDiffers && (type === "abnormal" ? rawMatches : quantityMatches)
        && timeDistance <= AMBIENT_RECONCILIATION_MARGIN_MS
        && !continuation
        && sameGroupEvidence
        && (actorMatches || rawMatches || record.createdAt >= (sourceTimes[0] ?? record.createdAt));
      if (strong) strongest = "high";
      else if (score >= 5 && strongest !== "high") strongest = "medium";
    }
  }
  const uniqueIds = [...new Set(matchingIds)];
  let status: AmbientReconciliationStatus = "not_recorded";
  if (strongest === "high") status = "already_recorded";
  else if (uniqueIds.length) status = "possibly_recorded";
  const matchingOfficialRecords = officialRecords
    .filter((record) => uniqueIds.includes(record.id))
    .slice(0, 4)
    .map((record) => ({
      farmName: record.farmName,
      eventType: record.eventType,
      quantity: record.quantity,
      occurredAt: record.occurredAt,
      recordKind: record.recordKind,
    }));
  const reconciliation: AmbientCandidateReconciliation = {
    status,
    matchingOfficialRecordIds: uniqueIds,
    matchReasons: [...reasons].slice(0, 8),
    matchConfidence: uniqueIds.length ? strongest : "low",
    matchingOfficialRecords: matchingOfficialRecords.length ? matchingOfficialRecords : undefined,
  };
  let state: AmbientCandidateState = "new";
  const quantityUnresolved = candidate.items.some((item) => item.type !== "abnormal" && item.quantity === null)
    || (candidate.eventType !== "abnormal" && candidate.quantityConfidence === "unknown")
    || (candidate.eventType !== "abnormal" && (candidate.uncertainties ?? []).some((uncertainty) => /quantity|數量/u.test(uncertainty)));
  if (candidate.conflict || (candidate.conflicts?.length ?? 0) > 0) state = "conflict";
  else if (status === "already_recorded") state = "already_recorded";
  else if (status === "possibly_recorded") state = "possibly_recorded";
  else if (quantityUnresolved) state = "unresolved_quantity";
  else if (candidate.resolution?.status !== "resolved") state = "unresolved_entity";
  return { ...candidate, reconciliation, state };
}

export type AmbientReconcileStage = "enrichment" | "resolve";
export type AmbientReconcileStageStatus = "started" | "completed" | "failed";
export type AmbientReconcileStageObserver = (
  stage: AmbientReconcileStage,
  status: AmbientReconcileStageStatus,
) => void | Promise<void>;

export async function resolveAndReconcileAmbientBundle(
  env: AmbientEnv,
  organizationId: string,
  bundle: AmbientCandidateBundle,
  messages: AmbientBufferedMessage[],
  cutoffAt: Date,
  observeStage?: AmbientReconcileStageObserver,
): Promise<{ bundle: AmbientCandidateBundle; summary: AmbientReconciliationSummary }> {
  const observe = async (stage: AmbientReconcileStage, status: AmbientReconcileStageStatus): Promise<void> => {
    try {
      await observeStage?.(stage, status);
    } catch {
      // Stage observability is deliberately non-authoritative. A failed
      // diagnostic write must never change reconciliation/business control
      // flow.
    }
  };
  const startedAt = Date.now();
  const allSourceTimestamps = messages.map((message) => message.eventTimestamp);
  // A legacy/custom bundle without explicit lineage may fall back only to
  // prefilter-selected rows. Prompt context must never become Candidate
  // lineage merely because it was sent to the model.
  const fallbackIds = new Set(ambientPrefilter(messages).map((message) => message.lineMessageId));
  await observe("enrichment", "started");
  const hydrated = bundle.candidates.map((candidate) => {
    const sourceMessages = candidateSourceMessages(candidate, messages, fallbackIds);
    return {
      candidate,
      sourceMessages,
    };
  });
  await observe("enrichment", "completed");
  const sourceTimes = allSourceTimestamps.map((value) => Date.parse(value)).filter(Number.isFinite);
  const earliest = sourceTimes.length ? Math.min(...sourceTimes) : cutoffAt.getTime();
  const latest = Math.max(cutoffAt.getTime(), sourceTimes.length ? Math.max(...sourceTimes) : cutoffAt.getTime());
  const officialRecords = await loadEffectiveAmbientOfficialRecords(
    env,
    organizationId,
    new Date(earliest - AMBIENT_RECONCILIATION_MARGIN_MS).toISOString(),
    new Date(latest + AMBIENT_RECONCILIATION_MARGIN_MS).toISOString(),
  );
  const candidates = [] as AmbientCandidate[];
  await observe("resolve", "started");
  const clueCache = new Map<string, Promise<AmbientFarmClues>>();
  const cluesFor = (referenceAt: string): Promise<AmbientFarmClues> => {
    const cacheKey = referenceAt.slice(0, 10);
    const cached = clueCache.get(cacheKey);
    if (cached) return cached;
    const loaded = loadAmbientFarmClues(env, organizationId, referenceAt);
    clueCache.set(cacheKey, loaded);
    return loaded;
  };
  for (const entry of hydrated) {
    const sourceMessages = entry.sourceMessages.length
      ? entry.sourceMessages
      : messages.filter((message) => fallbackIds.has(message.lineMessageId));
    const referenceAt = sourceMessages[0]?.eventTimestamp ?? cutoffAt.toISOString();
    const resolved = await resolveAmbientCandidateEntity(
      env,
      organizationId,
      {
        ...entry.candidate,
        sourceMessageIds: sourceMessages.map((message) => message.lineMessageId),
        sourceTimestamps: sourceMessages.map((message) => message.eventTimestamp),
        sourceUsers: [...new Set(sourceMessages.map((message) => message.lineUserId))],
      },
      referenceAt,
      await cluesFor(referenceAt),
      sourceMessages,
    );
    candidates.push(reconcileAmbientCandidate(resolved, officialRecords, sourceMessages));
  }
  await observe("resolve", "completed");
  const summary: AmbientReconciliationSummary = {
    extractedCandidateCount: candidates.length,
    resolvedCount: candidates.filter((candidate) => candidate.resolution?.status === "resolved").length,
    ambiguousEntityCount: candidates.filter((candidate) => candidate.resolution?.status === "ambiguous" || candidate.resolution?.status === "unresolved").length,
    unresolvedQuantityCount: candidates.filter((candidate) => candidate.state === "unresolved_quantity").length,
    conflictCount: candidates.filter((candidate) => candidate.state === "conflict").length,
    reconcileAlreadyRecorded: candidates.filter((candidate) => candidate.state === "already_recorded").length,
    reconcilePossible: candidates.filter((candidate) => candidate.state === "possibly_recorded").length,
    reconcileNew: candidates.filter((candidate) => candidate.state === "new" || candidate.state === "unresolved_entity" || candidate.state === "unresolved_quantity" || candidate.state === "conflict").length,
    noActionableCount: candidates.filter((candidate) => candidate.state === "already_recorded").length,
    officialRecordsLoaded: officialRecords.length,
    reconciliationDurationMs: Date.now() - startedAt,
  };
  const actionableCandidates = candidates.filter((candidate) => candidate.state !== "already_recorded");
  const finalSourceMessageIds = [...new Set(candidates.flatMap((candidate) => candidate.sourceMessageIds ?? []))].slice(0, 100);
  const finalSourceMessages = finalSourceMessageIds
    .map((id) => messages.find((message) => message.lineMessageId === id))
    .filter((message): message is AmbientBufferedMessage => Boolean(message));
  return {
    bundle: {
      ...bundle,
      candidates: actionableCandidates,
      sourceMessageIds: finalSourceMessageIds,
      sourceTimestamps: finalSourceMessages.map((message) => message.eventTimestamp).slice(0, 100),
      sourceUsers: [...new Set(finalSourceMessages.map((message) => message.lineUserId))].slice(0, 100),
    },
    summary,
  };
}

export function candidateBundleHasOfficiallyWritableItems(bundle: AmbientCandidateBundle): boolean {
  return bundle.candidates.some((candidate) => !candidate.conflict && candidate.items.length > 0);
}

function candidateBundleHasItems(bundle: AmbientCandidateBundle): boolean {
  // Conflicted candidates are still useful and must be shown to a human so
  // they can choose "確認數量" or "忽略". This predicate is deliberately
  // broader than the official-write predicate above.
  return bundle.candidates.some((candidate) => candidate.items.length > 0);
}

export interface AmbientDigestRunOptions {
  now?: Date;
  trigger?: "cron" | "manual";
  /**
   * `normal` is the existing Cron/manual lifecycle. Development runs retain
   * the same extraction and reconciliation code but make their side-effect
   * boundary explicit in durable observability.
   */
  executionMode?: AmbientDigestExecutionMode;
  devSessionId?: string;
  /** Restrict a development run to the exact locked source cohort. */
  sourceMessageIds?: string[];
  /** Internal correlation set by runAmbientDigest; not a business input. */
  invocationId?: string;
  targetGroupId?: string;
  targetOrganizationId?: string;
  cutoffAt?: Date;
  leaseOwner?: string;
  leaseTtlMs?: number;
  /** Best-effort notification after an individual Ambient group reaches its existing terminal boundary. */
  onGroupTerminal?: (context: AmbientDigestGroupTerminalContext) => void;
  extract?: (env: AmbientEnv, messages: AmbientBufferedMessage[]) => Promise<AmbientExtractionResult>;
  push?: (groupId: string, candidateId: string, bundle: AmbientCandidateBundle) => Promise<void>;
  reconcile?: (
    env: AmbientEnv,
    organizationId: string,
    bundle: AmbientCandidateBundle,
    messages: AmbientBufferedMessage[],
    cutoffAt: Date,
    observeStage?: AmbientReconcileStageObserver,
  ) => Promise<{ bundle: AmbientCandidateBundle; summary: AmbientReconciliationSummary }>;
}

export interface AmbientDigestGroupTerminalContext {
  organizationId: string;
  groupId: string;
  status: "completed" | "busy" | "failed";
}

export type AmbientDigestExecutionMode = "normal" | "dev_dry_run" | "dev_commit";

interface AmbientDigestDiagnostic {
  run_id: string;
  trigger: "cron" | "manual";
  execution_mode: AmbientDigestExecutionMode;
  group_id_suffix: string;
  cutoff: string;
  source_count: number;
  lease_result: "not_attempted" | "acquired" | "busy" | "error";
  prefilter_result: "not_run" | "rejected" | "candidate_like";
  ai_called: boolean;
  ai_duration_ms?: number;
  validation_result: "not_run" | "not_invoked" | "schema_valid" | "schema_invalid" | "ai_error";
  candidate_count: number;
  extracted_candidate_count: number;
  resolved_count: number;
  ambiguous_entity_count: number;
  unresolved_quantity_count: number;
  conflict_count: number;
  reconcile_already_recorded: number;
  reconcile_possible: number;
  reconcile_new: number;
  official_records_loaded: number;
  reconciliation_duration_ms: number;
  consume_result: "not_attempted" | "none" | "processed" | "error";
  delivery_result: "not_attempted" | "not_requested" | "sent" | "failed";
  final_status: AmbientDigestGroupOutcome["status"];
  error_stage?: AmbientDigestGroupOutcome["failureStage"];
  error_class?: string;
  duration_ms: number;
}

function safeGroupIdSuffix(groupId: string): string {
  return groupId.length <= 12 ? groupId : `${groupId.slice(0, 4)}…${groupId.slice(-4)}`;
}

function emitAmbientDigestDiagnostic(diagnostic: AmbientDigestDiagnostic): void {
  console.log(JSON.stringify({ event: "ambient_digest", ...diagnostic }));
}

type AmbientDigestRunStage =
  | "RUN_CREATED"
  | "LEASE_ACQUIRED"
  | "SOURCE_SELECTED"
  | "PREFILTER_COMPLETED"
  | "AI_STARTED"
  | "AI_COMPLETED"
  | "AI_FAILED"
  | "NORMALIZATION_COMPLETED"
  | "NORMALIZATION_FAILED"
  | "VALIDATION_COMPLETED"
  | "VALIDATION_FAILED"
  | "ENRICHMENT_COMPLETED"
  | "ENRICHMENT_FAILED"
  | "RESOLVE_COMPLETED"
  | "RESOLVE_FAILED"
  | "RECONCILE_COMPLETED"
  | "RECONCILE_FAILED"
  | "CANDIDATE_WRITE_STARTED"
  | "CANDIDATE_WRITE_COMPLETED"
  | "CANDIDATE_WRITE_FAILED"
  | "BUFFER_CONSUME_STARTED"
  | "BUFFER_CONSUME_COMPLETED"
  | "BUFFER_CONSUME_FAILED"
  | "RUN_COMPLETED"
  | "RUN_FAILED";

interface AmbientDigestRunObservabilityPatch {
  execution_mode?: AmbientDigestExecutionMode;
  dev_session_id?: string | null;
  invocation_id?: string | null;
  lease_status?: string;
  lease_acquired_at?: string | null;
  source_status?: string;
  source_selected_at?: string | null;
  source_count?: number;
  prefilter_status?: string;
  prefilter_completed_at?: string | null;
  prefilter_count?: number;
  ai_status?: string;
  ai_started_at?: string | null;
  ai_completed_at?: string | null;
  validation_status?: string;
  validation_completed_at?: string | null;
  validation_count?: number;
  validation_root_kind?: string | null;
  validation_envelope_kind?: string | null;
  validation_candidate_count?: number | null;
  validation_issue_count?: number | null;
  validation_first_issue_code?: string | null;
  validation_first_issue_path?: string | null;
  validation_first_expected_type?: string | null;
  validation_first_actual_type?: string | null;
  validation_failed_candidate_index?: number | null;
  validation_structural_keys_json?: string | null;
  validation_issue_summary_json?: string | null;
  validation_safe_enum_actual?: string | null;
  transport_diagnostics_json?: string | null;
  dev_semantic_summary_json?: string | null;
  normalization_status?: string;
  enrichment_status?: string;
  resolve_status?: string;
  first_bad_substage?: string | null;
  reconcile_status?: string;
  reconcile_started_at?: string | null;
  reconcile_completed_at?: string | null;
  reconcile_count?: number;
  candidate_write_status?: string;
  candidate_write_started_at?: string | null;
  candidate_write_completed_at?: string | null;
  candidate_created_count?: number;
  buffer_consume_status?: string;
  buffer_consume_started_at?: string | null;
  buffer_consume_completed_at?: string | null;
  processed_count?: number;
  delivery_status?: string;
  run_status?: string;
  error_stage?: string | null;
  error_class?: string | null;
  completed_at?: string | null;
  failure_retention_candidates_considered?: number;
  failure_retention_rows_extended?: number;
  failure_retention_rows_already_guarded?: number;
  failure_retention_rows_max_expired?: number;
}

const AMBIENT_RUN_OBSERVABILITY_COLUMNS = new Set([
  "execution_mode", "dev_session_id", "invocation_id", "lease_status", "lease_acquired_at", "source_status", "source_selected_at", "source_count",
  "prefilter_status", "prefilter_completed_at", "prefilter_count", "ai_status", "ai_started_at",
  "ai_completed_at", "validation_status", "validation_completed_at", "validation_count",
  "validation_root_kind", "validation_envelope_kind", "validation_candidate_count", "validation_issue_count",
  "validation_first_issue_code", "validation_first_issue_path", "validation_first_expected_type",
  "validation_first_actual_type", "validation_failed_candidate_index", "validation_structural_keys_json",
  "validation_issue_summary_json", "validation_safe_enum_actual", "transport_diagnostics_json",
  "dev_semantic_summary_json",
  "normalization_status", "enrichment_status", "resolve_status", "first_bad_substage",
  "reconcile_status", "reconcile_started_at", "reconcile_completed_at", "reconcile_count",
  "candidate_write_status", "candidate_write_started_at", "candidate_write_completed_at",
  "candidate_created_count", "buffer_consume_status", "buffer_consume_started_at",
  "buffer_consume_completed_at", "processed_count", "delivery_status", "run_status", "error_stage",
  "error_class", "completed_at", "failure_retention_candidates_considered",
  "failure_retention_rows_extended", "failure_retention_rows_already_guarded",
  "failure_retention_rows_max_expired",
]);

interface AmbientDigestInvocationPatch {
  execution_mode?: AmbientDigestExecutionMode;
  dev_session_id?: string | null;
  invocation_status?: "started" | "cleanup_running" | "group_discovery" | "processing_groups" | "completed" | "failed";
  expiry_cleanup_started_at?: string | null;
  expiry_cleanup_completed_at?: string | null;
  expiry_rows_scanned?: number;
  expiry_rows_deleted?: number;
  expiry_candidate_like_count?: number;
  expiry_prefilter_excluded_count?: number;
  expiry_failure_retained_skipped_count?: number;
  expiry_expired_after_failure_retention_count?: number;
  groups_before_cleanup?: number;
  groups_after_cleanup?: number;
  per_group_runs_created?: number;
  failure_retention_candidates_considered?: number;
  failure_retention_rows_extended?: number;
  failure_retention_rows_already_guarded?: number;
  failure_retention_rows_max_expired?: number;
  error_stage?: string | null;
  error_class?: string | null;
  completed_at?: string | null;
}

const AMBIENT_INVOCATION_COLUMNS = new Set([
  "execution_mode", "dev_session_id", "invocation_status", "expiry_cleanup_started_at", "expiry_cleanup_completed_at",
  "expiry_rows_scanned", "expiry_rows_deleted", "expiry_candidate_like_count",
  "expiry_prefilter_excluded_count", "expiry_failure_retained_skipped_count",
  "expiry_expired_after_failure_retention_count", "groups_before_cleanup",
  "groups_after_cleanup", "per_group_runs_created", "failure_retention_candidates_considered",
  "failure_retention_rows_extended", "failure_retention_rows_already_guarded",
  "failure_retention_rows_max_expired", "error_stage", "error_class", "completed_at",
]);

function ambientValidationDiagnosticPatch(diagnostics: AmbientValidationDiagnostics | undefined): AmbientDigestRunObservabilityPatch {
  if (!diagnostics) return {};
  return {
    validation_root_kind: diagnostics.rootKind,
    validation_envelope_kind: diagnostics.envelopeKind,
    validation_candidate_count: diagnostics.candidateCount,
    validation_issue_count: diagnostics.issueCount,
    validation_first_issue_code: diagnostics.firstIssueCode,
    validation_first_issue_path: diagnostics.firstIssuePath,
    validation_first_expected_type: diagnostics.firstExpectedType,
    validation_first_actual_type: diagnostics.firstActualType,
    validation_failed_candidate_index: diagnostics.failedCandidateIndex,
    validation_structural_keys_json: diagnostics.structuralKeysJson,
    validation_issue_summary_json: diagnostics.issueSummaryJson,
    validation_safe_enum_actual: diagnostics.safeEnumActual,
  };
}

function ambientTransportDiagnosticPatch(diagnostics: AmbientTransportDiagnostics | undefined): AmbientDigestRunObservabilityPatch {
  if (!diagnostics) return {};
  return {
    transport_diagnostics_json: boundedDiagnosticJson({
      provider_result_kind: diagnostics.providerResultKind,
      response_field_present: diagnostics.responseFieldPresent,
      response_value_kind: diagnostics.responseValueKind,
      completion_length: diagnostics.completionLength,
      trimmed_length: diagnostics.trimmedLength,
      starts_with_brace: diagnostics.startsWithBrace,
      starts_with_bracket: diagnostics.startsWithBracket,
      ends_with_brace: diagnostics.endsWithBrace,
      ends_with_bracket: diagnostics.endsWithBracket,
      markdown_fence_detected: diagnostics.markdownFenceDetected,
      json_fence_detected: diagnostics.jsonFenceDetected,
      leading_non_json_detected: diagnostics.leadingNonJsonDetected,
      trailing_non_json_detected: diagnostics.trailingNonJsonDetected,
      possible_truncation: diagnostics.possibleTruncation,
      finish_reason: diagnostics.finishReason,
      stop_reason: diagnostics.stopReason,
      issue_code: diagnostics.issueCode,
      requested_max_tokens: diagnostics.requestedMaxTokens,
      usage_prompt_tokens: diagnostics.usagePromptTokens,
      usage_completion_tokens: diagnostics.usageCompletionTokens,
      usage_total_tokens: diagnostics.usageTotalTokens,
      effective_output_budget_source: diagnostics.effectiveOutputBudgetSource,
      selected_source_count: diagnostics.selectedSourceCount,
      parsed_decision_count: diagnostics.parsedDecisionCount,
      parsed_event_decision_count: diagnostics.parsedEventDecisionCount,
      parsed_support_decision_count: diagnostics.parsedSupportDecisionCount,
      parsed_ignore_decision_count: diagnostics.parsedIgnoreDecisionCount,
      parsed_candidate_count: diagnostics.parsedCandidateCount,
      parsed_item_count: diagnostics.parsedItemCount,
      output_size_anomaly: diagnostics.outputSizeAnomaly,
      accounted_selected_source_count: diagnostics.accountedSelectedSourceCount,
      unaccounted_selected_source_count: diagnostics.unaccountedSelectedSourceCount,
      ignored_selected_source_count: diagnostics.ignoredSelectedSourceCount,
      supporting_source_count: diagnostics.supportingSourceCount,
      selected_source_coverage_status: diagnostics.selectedSourceCoverageStatus,
      first_bad_semantic_stage: diagnostics.firstBadSemanticStage,
      ignored_selected_source_ordinals: diagnostics.ignoredSelectedSourceOrdinals,
      unaccounted_source_ordinals: diagnostics.unaccountedSourceOrdinals,
      failure_detail_class: diagnostics.failureDetailClass,
      json_syntax: diagnostics.jsonSyntax,
    }, 2048),
  };
}

function ambientDigestRunIdentity(
  organizationId: string,
  groupId: string,
  trigger: "cron" | "manual",
  scheduledFor: string,
): string {
  // The identity is deterministic for one scheduled invocation and group. The
  // hash keeps opaque LINE identifiers out of the visible run id while the
  // durable row still stores the normal scoped group reference.
  return `ambient-run-${scheduledFor.replace(/[^0-9]/gu, "")}-${ambientSourceFingerprint([organizationId, groupId, trigger, scheduledFor])}`;
}

function ambientSafeErrorClass(error: unknown): string {
  const raw = (typeof error === "string" ? error : errorClass(error)).toLowerCase();
  if (raw === "selected_source_unaccounted" || raw === "invalid_source_reference") return raw;
  if (raw.includes("timeout")) return "timeout";
  if (raw.includes("network")) return "network_error";
  if (raw.includes("schema") || raw.includes("json")) return "schema_invalid";
  if (raw.includes("validation")) return "validation_failed";
  if (raw.includes("provider")) return "provider_error";
  if (/^[a-z0-9_.-]{1,64}$/u.test(raw)) return raw;
  return "unknown";
}

function ambientDigestInvocationIdentity(trigger: "cron" | "manual", scheduledFor: string): string {
  return `ambient-invocation-${scheduledFor.replace(/[^0-9]/gu, "")}-${ambientSourceFingerprint([trigger, scheduledFor])}`;
}

async function createAmbientDigestInvocation(
  env: AmbientEnv,
  invocationId: string,
  trigger: "cron" | "manual",
  scheduledFor: string,
  startedAt: string,
  expiresAt: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO ambient_digest_invocations
        (invocation_id, trigger_type, scheduled_for, attempt_count, run_started_at,
         invocation_status, expires_at)
       VALUES (?, ?, ?, 1, ?, 'started', ?)
       ON CONFLICT(trigger_type, scheduled_for) DO UPDATE SET
         attempt_count = ambient_digest_invocations.attempt_count + 1,
         run_started_at = excluded.run_started_at,
         expiry_cleanup_started_at = NULL,
         expiry_cleanup_completed_at = NULL,
         expiry_rows_scanned = 0,
         expiry_rows_deleted = 0,
         expiry_candidate_like_count = 0,
         expiry_prefilter_excluded_count = 0,
         expiry_failure_retained_skipped_count = 0,
         expiry_expired_after_failure_retention_count = 0,
         groups_before_cleanup = 0,
         groups_after_cleanup = 0,
         per_group_runs_created = 0,
         failure_retention_candidates_considered = 0,
         failure_retention_rows_extended = 0,
         failure_retention_rows_already_guarded = 0,
         failure_retention_rows_max_expired = 0,
         invocation_status = 'started',
         error_stage = NULL,
         error_class = NULL,
         completed_at = NULL,
         expires_at = excluded.expires_at,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(invocationId, trigger, scheduledFor, startedAt, expiresAt).run();
  } catch (error) {
    console.log(JSON.stringify({
      event: "ambient_invocation_observability_write_failed",
      invocation_id: invocationId,
      stage: "RUN_CREATED",
      error_class: ambientSafeErrorClass(error),
    }));
  }
}

async function updateAmbientDigestInvocation(
  env: AmbientEnv,
  invocationId: string,
  patch: AmbientDigestInvocationPatch,
): Promise<void> {
  const entries = Object.entries(patch).filter(([key]) => AMBIENT_INVOCATION_COLUMNS.has(key));
  if (!entries.length) return;
  try {
    const now = new Date().toISOString();
    const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
    await env.DB.prepare(
      `UPDATE ambient_digest_invocations SET ${assignments}, updated_at = ? WHERE invocation_id = ?`,
    ).bind(...entries.map(([, value]) => value), now, invocationId).run();
  } catch (error) {
    console.log(JSON.stringify({
      event: "ambient_invocation_observability_write_failed",
      invocation_id: invocationId,
      stage: "UPDATE",
      error_class: ambientSafeErrorClass(error),
    }));
  }
}

async function incrementAmbientDigestInvocation(
  env: AmbientEnv,
  invocationId: string,
  field: "per_group_runs_created" | "failure_retention_candidates_considered" | "failure_retention_rows_extended" | "failure_retention_rows_already_guarded" | "failure_retention_rows_max_expired",
  amount: number,
): Promise<void> {
  if (!amount) return;
  try {
    await env.DB.prepare(
      `UPDATE ambient_digest_invocations
          SET ${field} = COALESCE(${field}, 0) + ?, updated_at = ?
        WHERE invocation_id = ?`,
    ).bind(amount, new Date().toISOString(), invocationId).run();
  } catch (error) {
    console.log(JSON.stringify({
      event: "ambient_invocation_observability_write_failed",
      invocation_id: invocationId,
      stage: field,
      error_class: ambientSafeErrorClass(error),
    }));
  }
}

async function cleanupExpiredAmbientDigestInvocations(env: AmbientEnv, now: Date): Promise<void> {
  try {
    await env.DB.prepare(
      `DELETE FROM ambient_digest_invocations WHERE julianday(expires_at) <= julianday(?)`,
    ).bind(now.toISOString()).run();
  } catch (error) {
    console.log(JSON.stringify({
      event: "ambient_invocation_observability_cleanup_failed",
      stage: "retention",
      error_class: ambientSafeErrorClass(error),
    }));
  }
}

async function createAmbientDigestRunObservability(
  env: AmbientEnv,
  runId: string,
  organizationId: string,
  groupId: string,
  trigger: "cron" | "manual",
  scheduledFor: string,
  startedAt: string,
  expiresAt: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO ambient_digest_runs
        (run_id, organization_id, line_group_id, scheduled_for, trigger_type,
         attempt_count, run_started_at, run_status, expires_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, 'running', ?)
       ON CONFLICT(run_id) DO UPDATE SET
         scheduled_for = excluded.scheduled_for,
         trigger_type = excluded.trigger_type,
         attempt_count = ambient_digest_runs.attempt_count + 1,
         run_started_at = excluded.run_started_at,
         lease_status = 'not_attempted',
         lease_acquired_at = NULL,
         source_status = 'not_started',
         source_selected_at = NULL,
         source_count = 0,
         prefilter_status = 'not_started',
         prefilter_completed_at = NULL,
         prefilter_count = 0,
         ai_status = 'not_started',
         ai_started_at = NULL,
         ai_completed_at = NULL,
         validation_status = 'not_started',
         validation_completed_at = NULL,
         validation_count = 0,
         validation_root_kind = NULL,
         validation_envelope_kind = NULL,
         validation_candidate_count = NULL,
         validation_issue_count = NULL,
         validation_first_issue_code = NULL,
         validation_first_issue_path = NULL,
         validation_first_expected_type = NULL,
         validation_first_actual_type = NULL,
         validation_failed_candidate_index = NULL,
         validation_structural_keys_json = NULL,
         validation_issue_summary_json = NULL,
         validation_safe_enum_actual = NULL,
         transport_diagnostics_json = NULL,
         dev_semantic_summary_json = NULL,
         normalization_status = 'not_started',
         enrichment_status = 'not_started',
         resolve_status = 'not_started',
         first_bad_substage = NULL,
         reconcile_status = 'not_started',
         reconcile_started_at = NULL,
         reconcile_completed_at = NULL,
         reconcile_count = 0,
         candidate_write_status = 'not_started',
         candidate_write_started_at = NULL,
         candidate_write_completed_at = NULL,
         candidate_created_count = 0,
         buffer_consume_status = 'not_started',
         buffer_consume_started_at = NULL,
         buffer_consume_completed_at = NULL,
         processed_count = 0,
         delivery_status = 'not_requested',
         run_status = 'running',
         error_stage = NULL,
         error_class = NULL,
         completed_at = NULL,
         expires_at = excluded.expires_at,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(runId, organizationId, groupId, scheduledFor, trigger, startedAt, expiresAt).run();
  } catch (error) {
    console.log(JSON.stringify({
      event: "ambient_digest_observability_write_failed",
      run_id: runId,
      stage: "RUN_CREATED",
      error_class: ambientSafeErrorClass(error),
    }));
  }
}

async function updateAmbientDigestRunObservability(
  env: AmbientEnv,
  runId: string,
  stage: AmbientDigestRunStage,
  patch: AmbientDigestRunObservabilityPatch,
): Promise<void> {
  const entries = Object.entries(patch).filter(([key]) => AMBIENT_RUN_OBSERVABILITY_COLUMNS.has(key));
  if (!entries.length) return;
  try {
    const now = new Date().toISOString();
    const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
    await env.DB.prepare(
      `UPDATE ambient_digest_runs SET ${assignments}, updated_at = ? WHERE run_id = ?`,
    ).bind(...entries.map(([, value]) => value), now, runId).run();
  } catch (error) {
    // Observability must never change Ambient business control flow. Keep the
    // failure visible without recording source text, prompts, or payloads.
    console.log(JSON.stringify({
      event: "ambient_digest_observability_write_failed",
      run_id: runId,
      stage,
      error_class: ambientSafeErrorClass(error),
    }));
  }
}

async function cleanupExpiredAmbientDigestRuns(env: AmbientEnv, now: Date): Promise<void> {
  try {
    await env.DB.prepare(
      `DELETE FROM ambient_digest_runs WHERE julianday(expires_at) <= julianday(?)`,
    ).bind(now.toISOString()).run();
  } catch (error) {
    console.log(JSON.stringify({
      event: "ambient_digest_observability_cleanup_failed",
      stage: "retention",
      error_class: ambientSafeErrorClass(error),
    }));
  }
}

export interface AmbientDigestGroupOutcome {
  organizationId: string;
  groupId: string;
  status: "no_pending" | "no_candidate" | "already_recorded" | "candidate" | "dry_run" | "busy" | "failed";
  failureStage?: "lease" | "selection" | "prefilter" | "ai" | "validation" | "resolve" | "reconcile" | "candidate_write" | "source_consume" | "delivery" | "unexpected";
  errorClass?: string;
  candidateId?: string;
  bundle?: AmbientCandidateBundle;
  sourceMessageIds: string[];
  consumedMessageCount: number;
}

export interface AmbientDigestRunResult {
  runId: string;
  hourBucket: string;
  trigger: "cron" | "manual";
  executionMode: AmbientDigestExecutionMode;
  cutoffAt: string;
  groupsScanned: number;
  groupsWithChat: number;
  prefilterGroups: number;
  aiCalls: number;
  candidatesCreated: number;
  messagesPushed: number;
  expiredBuffers: number;
  snoozedCandidatesRequeued: number;
  busyGroups: number;
  failedGroups: number;
  deliveryFailures: number;
  extractedCandidateCount: number;
  resolvedCount: number;
  ambiguousEntityCount: number;
  unresolvedQuantityCount: number;
  conflictCount: number;
  reconcileAlreadyRecorded: number;
  reconcilePossible: number;
  reconcileNew: number;
  officialRecordsLoaded: number;
  reconciliationDurationMs: number;
  outcomes: AmbientDigestGroupOutcome[];
}

function ambientSourceFingerprint(sourceMessageIds: string[]): string {
  const source = [...new Set(sourceMessageIds)].sort().join("\u001f");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${sourceMessageIds.length}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export interface AmbientExpiryDiagnosticRow {
  id: string;
  organizationId: string;
  lineGroupId: string;
  sourceFingerprint: string;
  originalEventTimestamp: string;
  expiredAt: string;
  lastDigestStatus: string;
  prefilterResult: "candidate_like" | "prefilter_excluded";
  lastFailureStage: string | null;
  candidateCreated: boolean;
  processed: boolean;
  retainUntil: string;
  processingFailureCount: number;
  lastFailureAt: string | null;
  finalExpiryReason: string | null;
}

function expiryDiagnosticId(organizationId: string, groupId: string, sourceFingerprint: string): string {
  return `ambient-expiry-${organizationId}-${groupId}-${sourceFingerprint}`.replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 240);
}

/**
 * Preserve a metadata-only tombstone before the 24h raw Ambient source is
 * removed. The tombstone is intentionally not a second transcript store.
 */
interface AmbientExpiryCleanupStats {
  rowsScanned: number;
  rowsDeleted: number;
  candidateLikeCount: number;
  prefilterExcludedCount: number;
  failureRetainedSkippedCount: number;
  expiredAfterFailureRetentionCount: number;
  failed: boolean;
  errorClass?: string;
}

async function cleanupExpiredAmbientSource(env: AmbientEnv, now: Date): Promise<AmbientExpiryCleanupStats> {
  const empty: AmbientExpiryCleanupStats = {
    rowsScanned: 0,
    rowsDeleted: 0,
    candidateLikeCount: 0,
    prefilterExcludedCount: 0,
    failureRetainedSkippedCount: 0,
    expiredAfterFailureRetentionCount: 0,
    failed: false,
  };
  try {
    const nowIso = now.toISOString();
    const rows = await env.DB.prepare(
      `SELECT id, organization_id AS organizationId, line_group_id AS lineGroupId,
              line_message_id AS lineMessageId, event_timestamp AS eventTimestamp,
              digest_status AS digestStatus, expires_at AS expiresAt, text,
              processing_failure_count AS processingFailureCount,
              last_processing_failure_stage AS lastFailureStage,
              last_processing_failure_at AS lastFailureAt,
              failure_retained_until AS failureRetainedUntil
         FROM ambient_chat_buffer
        WHERE digest_status = 'buffered' AND julianday(expires_at) <= julianday(?)
        ORDER BY expires_at, id`,
    ).bind(nowIso).all<{
      id: string;
      organizationId: string;
      lineGroupId: string;
      lineMessageId: string;
      eventTimestamp: string;
      digestStatus: string;
      expiresAt: string;
      text: string;
      processingFailureCount: number;
      lastFailureStage: string | null;
      lastFailureAt: string | null;
      failureRetainedUntil: string | null;
    }>();
    if (!rows.results.length) return empty;
    const deletable = rows.results.filter((row) =>
      !row.failureRetainedUntil || Date.parse(row.failureRetainedUntil) <= now.getTime(),
    );
    const failureRetainedSkippedCount = rows.results.filter((row) => {
      const guardUntil = row.failureRetainedUntil;
      return guardUntil !== null && Date.parse(guardUntil) > now.getTime();
    }).length;
    const retainUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const statements = deletable.map((row) => {
      const fingerprint = ambientSourceFingerprint([row.lineMessageId]);
      const candidateLike = ambientMessageMayBeRelevant(row.text);
      const failureExpired = Boolean(row.failureRetainedUntil);
      return env.DB.prepare(
        `INSERT OR IGNORE INTO ambient_expiry_diagnostics
          (id, organization_id, line_group_id, source_fingerprint,
           original_event_timestamp, expired_at, last_digest_status,
           prefilter_result, last_failure_stage, candidate_created,
           processed, retain_until, processing_failure_count,
           last_failure_at, final_expiry_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
      ).bind(
        expiryDiagnosticId(row.organizationId, row.lineGroupId, fingerprint),
        row.organizationId,
        row.lineGroupId,
        fingerprint,
        row.eventTimestamp,
        row.expiresAt,
        row.digestStatus,
        candidateLike ? "candidate_like" : "prefilter_excluded",
        row.lastFailureStage ?? "expiry_cleanup",
        retainUntil,
        row.processingFailureCount ?? 0,
        row.lastFailureAt,
        failureExpired ? "failure_retention_expired" : "normal_expiry",
      );
    });
    if (statements.length) await env.DB.batch(statements);
    const candidateLikeCount = rows.results.filter((row) => ambientMessageMayBeRelevant(row.text)).length;
    const result = await env.DB.prepare(
      `DELETE FROM ambient_chat_buffer
        WHERE digest_status = 'buffered'
          AND julianday(expires_at) <= julianday(?)
          AND (failure_retained_until IS NULL OR julianday(failure_retained_until) <= julianday(?))`,
    ).bind(nowIso, nowIso).run();
    return {
      rowsScanned: rows.results.length,
      rowsDeleted: Number(result.meta?.changes ?? 0),
      candidateLikeCount,
      prefilterExcludedCount: rows.results.length - candidateLikeCount,
      failureRetainedSkippedCount,
      expiredAfterFailureRetentionCount: deletable.filter((row) => Boolean(row.failureRetainedUntil)).length,
      failed: false,
    };
  } catch (error) {
    // If the additive protection schema is unavailable or the cleanup query
    // fails, retain the raw source. Silent deletion is the unsafe fallback;
    // the next scheduled invocation can retry after the error is visible.
    console.log(JSON.stringify({ event: "ambient_expiry_diagnostic_error", error_class: ambientSafeErrorClass(error) }));
    return { ...empty, failed: true, errorClass: ambientSafeErrorClass(error) };
  }
}

export async function cleanupExpiredAmbientDiagnostics(env: AmbientEnv, now = new Date()): Promise<number> {
  try {
    const result = await env.DB.prepare(
      `DELETE FROM ambient_expiry_diagnostics WHERE julianday(retain_until) <= julianday(?)`,
    ).bind(now.toISOString()).run();
    return Number(result.meta?.changes ?? 0);
  } catch {
    return 0;
  }
}

interface AmbientFailureRetentionStats {
  candidatesConsidered: number;
  rowsExtended: number;
  rowsAlreadyGuarded: number;
  rowsMaxExpired: number;
}

const AMBIENT_FAILURE_RETENTION_STAGES = new Set([
  "ai",
  "validation",
  "reconcile",
  "candidate_write",
  "buffer_consume",
  "unexpected",
]);

export function ambientFailureRetentionUntil(eventTimestamp: string, now: Date): string | null {
  const eventAt = Date.parse(eventTimestamp);
  if (!Number.isFinite(eventAt)) return null;
  const absoluteCap = eventAt + 72 * 60 * 60 * 1000;
  return absoluteCap > now.getTime() ? new Date(absoluteCap).toISOString() : null;
}

async function incrementAmbientDigestRunFailureRetention(
  env: AmbientEnv,
  runId: string,
  stats: AmbientFailureRetentionStats,
): Promise<void> {
  if (!stats.candidatesConsidered && !stats.rowsExtended && !stats.rowsAlreadyGuarded && !stats.rowsMaxExpired) return;
  try {
    await env.DB.prepare(
      `UPDATE ambient_digest_runs
          SET failure_retention_candidates_considered = COALESCE(failure_retention_candidates_considered, 0) + ?,
              failure_retention_rows_extended = COALESCE(failure_retention_rows_extended, 0) + ?,
              failure_retention_rows_already_guarded = COALESCE(failure_retention_rows_already_guarded, 0) + ?,
              failure_retention_rows_max_expired = COALESCE(failure_retention_rows_max_expired, 0) + ?,
              updated_at = ?
        WHERE run_id = ?`,
    ).bind(
      stats.candidatesConsidered,
      stats.rowsExtended,
      stats.rowsAlreadyGuarded,
      stats.rowsMaxExpired,
      new Date().toISOString(),
      runId,
    ).run();
  } catch (error) {
    console.log(JSON.stringify({
      event: "ambient_digest_observability_write_failed",
      run_id: runId,
      stage: "FAILURE_RETENTION",
      error_class: ambientSafeErrorClass(error),
    }));
  }
}

async function retainAmbientFailureSources(
  env: AmbientEnv,
  messages: AmbientBufferedMessage[],
  failureStage: string,
  now: Date,
  invocationId: string,
  observabilityRunId: string,
): Promise<AmbientFailureRetentionStats> {
  const empty: AmbientFailureRetentionStats = {
    candidatesConsidered: 0,
    rowsExtended: 0,
    rowsAlreadyGuarded: 0,
    rowsMaxExpired: 0,
  };
  const normalizedStage = failureStage === "source_consume" ? "buffer_consume" : failureStage;
  if (!AMBIENT_FAILURE_RETENTION_STAGES.has(normalizedStage) || !messages.length) return empty;
  try {
    const rows: Array<{
      id: string;
      eventTimestamp: string;
      failureRetainedUntil: string | null;
      lastFailureInvocationId: string | null;
    }> = [];
    for (let index = 0; index < messages.length; index += 50) {
      const chunk = messages.slice(index, index + 50);
      const placeholders = chunk.map(() => "?").join(", ");
      const found = await env.DB.prepare(
        `SELECT id, event_timestamp AS eventTimestamp,
                failure_retained_until AS failureRetainedUntil,
                last_processing_failure_invocation_id AS lastFailureInvocationId
           FROM ambient_chat_buffer
          WHERE digest_status = 'buffered'
            AND line_message_id IN (${placeholders})`,
      ).bind(...chunk.map((message) => message.lineMessageId)).all<{
        id: string;
        eventTimestamp: string;
        failureRetainedUntil: string | null;
        lastFailureInvocationId: string | null;
      }>();
      rows.push(...found.results);
    }
    const stats: AmbientFailureRetentionStats = {
      candidatesConsidered: rows.length,
      rowsExtended: 0,
      rowsAlreadyGuarded: 0,
      rowsMaxExpired: 0,
    };
    const statements: D1PreparedStatement[] = [];
    for (const row of rows) {
      const retainedUntil = ambientFailureRetentionUntil(row.eventTimestamp, now);
      if (!retainedUntil) {
        stats.rowsMaxExpired += 1;
        continue;
      }
      const guardUntil = row.failureRetainedUntil;
      const guardActive = guardUntil !== null && Date.parse(guardUntil) > now.getTime();
      if (guardActive) stats.rowsAlreadyGuarded += 1;
      if (row.lastFailureInvocationId === invocationId) continue;
      if (!guardActive) stats.rowsExtended += 1;
      statements.push(
        env.DB.prepare(
          `UPDATE ambient_chat_buffer
              SET processing_failure_count = COALESCE(processing_failure_count, 0) + 1,
                  last_processing_failure_stage = ?,
                  last_processing_failure_at = ?,
                  last_processing_failure_invocation_id = ?,
                  failure_retained_until = CASE
                    WHEN failure_retained_until IS NULL
                      OR julianday(failure_retained_until) < julianday(?)
                    THEN ?
                    ELSE failure_retained_until
                  END
            WHERE id = ? AND digest_status = 'buffered'`,
        ).bind(normalizedStage, now.toISOString(), invocationId, retainedUntil, retainedUntil, row.id),
      );
    }
    if (statements.length) await env.DB.batch(statements);
    await incrementAmbientDigestRunFailureRetention(env, observabilityRunId, stats);
    await incrementAmbientDigestInvocation(env, invocationId, "failure_retention_candidates_considered", stats.candidatesConsidered);
    await incrementAmbientDigestInvocation(env, invocationId, "failure_retention_rows_extended", stats.rowsExtended);
    await incrementAmbientDigestInvocation(env, invocationId, "failure_retention_rows_already_guarded", stats.rowsAlreadyGuarded);
    await incrementAmbientDigestInvocation(env, invocationId, "failure_retention_rows_max_expired", stats.rowsMaxExpired);
    return stats;
  } catch (error) {
    // Failure protection is additive retention metadata. If unavailable, do
    // not retry or duplicate the business path.
    console.log(JSON.stringify({
      event: "ambient_failure_retention_write_failed",
      invocation_id: invocationId,
      stage: normalizedStage,
      error_class: ambientSafeErrorClass(error),
    }));
    return empty;
  }
}

function ambientCandidateId(groupId: string, hourBucket: string, sourceMessageIds: string[] = []): string {
  const sourceSuffix = sourceMessageIds.length ? `-${ambientSourceFingerprint(sourceMessageIds)}` : "";
  return `ambient-candidate-${groupId.replace(/[^A-Za-z0-9_-]/gu, "_")}-${hourBucket.replace(/[^A-Za-z0-9]/gu, "")}${sourceSuffix}`;
}

function ambientCandidateHourKey(hourBucket: string, sourceMessageIds: string[]): string {
  return sourceMessageIds.length ? `${hourBucket}:${ambientSourceFingerprint(sourceMessageIds)}` : hourBucket;
}

const AMBIENT_DIGEST_LEASE_MS = 30_000;

function ambientDigestOwner(options: AmbientDigestRunOptions, now: Date): string {
  return options.leaseOwner ?? `ambient-digest-${now.getTime()}-${crypto.randomUUID()}`;
}

async function acquireAmbientDigestLease(
  env: AmbientEnv,
  organizationId: string,
  groupId: string,
  ownerId: string,
  now: Date,
  leaseTtlMs: number,
): Promise<boolean> {
  const nowIso = now.toISOString();
  const leaseUntil = new Date(now.getTime() + leaseTtlMs).toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO ambient_digest_leases
       (organization_id, line_group_id, owner_id, lease_until, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (organization_id, line_group_id) DO UPDATE SET
       owner_id = excluded.owner_id,
       lease_until = excluded.lease_until,
       updated_at = excluded.updated_at
      WHERE ambient_digest_leases.lease_until <= ?`,
  ).bind(organizationId, groupId, ownerId, leaseUntil, nowIso, nowIso).run();
  return Number(result.meta?.changes ?? 0) === 1;
}

async function releaseAmbientDigestLease(
  env: AmbientEnv,
  organizationId: string,
  groupId: string,
  ownerId: string,
  now: Date,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE ambient_digest_leases
        SET lease_until = ?, updated_at = ?
      WHERE organization_id = ? AND line_group_id = ? AND owner_id = ?`,
  ).bind(now.toISOString(), now.toISOString(), organizationId, groupId, ownerId).run();
}

export interface AmbientSelection {
  where: string;
  bindings: string[];
}

function ambientSelection(
  options: AmbientDigestRunOptions,
  cutoffIso: string,
  _hourBucket: string,
  group?: { organizationId: string; groupId: string },
): AmbientSelection {
  const clauses = ["digest_status = 'buffered'", "event_timestamp <= ?"];
  const bindings = [cutoffIso];
  const organizationId = group?.organizationId ?? options.targetOrganizationId;
  const groupId = group?.groupId ?? options.targetGroupId;
  if (organizationId) {
    clauses.push("organization_id = ?");
    bindings.push(organizationId);
  }
  if (groupId) {
    clauses.push("line_group_id = ?");
    bindings.push(groupId);
  }
  // A locked development cohort is a stable, rerunnable test fixture. Normal
  // Cron/manual extraction must not claim it while the Dev workflow owns it;
  // Dev dry-run/commit pass an explicit non-normal execution mode and retain
  // access to the exact cohort.
  if ((options.executionMode ?? "normal") === "normal") {
    clauses.push(`NOT EXISTS (
      SELECT 1
        FROM ambient_dev_cohort_sources AS dev_source
        JOIN ambient_dev_sessions AS dev_session
          ON dev_session.session_id = dev_source.session_id
       WHERE dev_source.source_message_id = ambient_chat_buffer.line_message_id
         AND dev_session.organization_id = ambient_chat_buffer.organization_id
         AND dev_session.line_group_id = ambient_chat_buffer.line_group_id
         AND dev_session.status = 'locked'
         AND julianday(dev_session.expires_at) > julianday(?)
    )`);
    bindings.push(cutoffIso);
  }
  const sourceMessageIds = [...new Set(options.sourceMessageIds ?? [])].filter((value) => value.length > 0).slice(0, 100);
  if (sourceMessageIds.length) {
    clauses.push(`line_message_id IN (${sourceMessageIds.map(() => "?").join(", ")})`);
    bindings.push(...sourceMessageIds);
  }
  return { where: clauses.join(" AND "), bindings };
}

/** Read-only test seam for the normal-vs-development source boundary. */
export function ambientSelectionForTest(
  options: AmbientDigestRunOptions,
  cutoffIso: string,
  hourBucket = "test",
  group?: { organizationId: string; groupId: string },
): AmbientSelection {
  return ambientSelection(options, cutoffIso, hourBucket, group);
}

async function consumeAmbientSource(
  env: AmbientEnv,
  selection: AmbientSelection,
): Promise<number> {
  const consumed = await env.DB.prepare(
    `UPDATE ambient_chat_buffer
        SET digest_status = 'processed'
      WHERE ${selection.where}`,
  ).bind(...selection.bindings).run();
  return Number(consumed.meta?.changes ?? 0);
}

function safeCandidateBundle(raw: string): AmbientCandidateBundle | null {
  try {
    return validateAmbientCandidateBundle(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function formatAmbientCandidate(
  bundle: AmbientCandidateBundle,
  title = "📋 過去一小時發現可能需要紀錄的資訊",
): string {
  const lines = [title];
  bundle.candidates.forEach((candidate, candidateIndex) => {
    lines.push("", `🐔 ${candidate.farmText ?? "尚未確定雞場"}`);
    if (candidate.caretakerText) lines.push(`飼養者線索：${candidate.caretakerText}`);
    if (candidate.resolution?.candidateFarmNames?.length && candidate.resolution.status !== "resolved") {
      lines.push(`可能雞場：${candidate.resolution.candidateFarmNames.join("、")}`);
    }
    if (candidate.houseText) lines.push(`舍別：${candidate.houseText}`);
    if (candidate.state === "possibly_recorded") {
      lines.push("📋 這筆資訊可能已經存在正式紀錄，請確認是否為同一筆。");
      for (const record of candidate.reconciliation?.matchingOfficialRecords ?? []) {
        const quantity = record.quantity === null ? "" : ` ${record.quantity}`;
        const when = record.occurredAt.length >= 16 ? record.occurredAt.slice(0, 16).replace("T", " ") : record.occurredAt;
        const eventLabel = record.eventType === "mortality" ? "死亡" : record.eventType === "cull" ? "淘汰" : record.eventType;
        lines.push(`系統已有：${record.farmName}｜${eventLabel}${quantity}${when ? `｜${when}` : ""}`);
      }
    } else if (candidate.state === "unresolved_entity") {
      lines.push("請先確認雞場／舍別，尚未寫入正式資料。");
    } else if (candidate.state === "unresolved_quantity") {
      lines.push("⚠️ 數量尚未確認，尚未寫入正式資料。");
    } else if (candidate.conflict || candidate.state === "conflict") {
      lines.push(`⚠️ ${candidate.conflictText ?? "資訊不一致，尚未確定"}`);
    }
    candidate.items.forEach((item) => {
      const quantity = item.quantity === null ? "" : ` ${item.quantity}`;
      const uncertain = item.quantity === null || item.confidence === "low" || item.confidence === "medium" ? "（待確認）" : "";
      const repeat = item.mentionCount && item.mentionCount > 1 ? `（本時段提及${item.mentionCount}次）` : "";
      lines.push(`• ${item.type === "mortality" ? "死亡" : item.type === "cull" ? "淘汰" : item.raw}${quantity}${item.type === "mortality" ? "隻" : item.type === "cull" ? "隻" : ""}${uncertain}${repeat}`);
    });
    if (!candidate.items.length) lines.push(`• 候選 ${candidateIndex + 1} 尚無可確認項目`);
  });
  return lines.join("\n");
}

export async function bufferAmbientMessage(
  env: AmbientEnv,
  message: Omit<AmbientBufferedMessage, "id" | "digestHour">,
): Promise<boolean> {
  if (!message.organizationId || !message.lineGroupId || !message.lineUserId || !message.lineMessageId || !message.text.trim()) return false;
  const digestHour = ambientHourBucket(message.eventTimestamp);
  const id = `ambient-message-${message.lineMessageId}`;
  const expiresAt = ambientNormalExpiryAt(message.eventTimestamp);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO ambient_chat_buffer
      (id, organization_id, line_group_id, line_user_id, line_message_id,
       event_timestamp, text, expires_at, digest_hour, digest_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'buffered')`,
  ).bind(id, message.organizationId, message.lineGroupId, message.lineUserId, message.lineMessageId, message.eventTimestamp, message.text.trim(), expiresAt, digestHour).run();
  return true;
}

export async function runAmbientDigest(env: AmbientEnv, options: AmbientDigestRunOptions = {}): Promise<AmbientDigestRunResult> {
  const now = options.now ?? new Date();
  const trigger = options.trigger ?? "cron";
  const executionMode = options.executionMode ?? "normal";
  const scheduledFor = now.toISOString();
  const invocationId = ambientDigestInvocationIdentity(trigger, scheduledFor);
  const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  await createAmbientDigestInvocation(env, invocationId, trigger, scheduledFor, now.toISOString(), expiresAt);
  if (executionMode !== "normal" || options.devSessionId) {
    await updateAmbientDigestInvocation(env, invocationId, {
      execution_mode: executionMode,
      dev_session_id: options.devSessionId ?? null,
    });
  }
  if (executionMode === "normal") await cleanupExpiredAmbientDigestInvocations(env, now);
  try {
    const result = await runAmbientDigestCore(env, { ...options, now, trigger, invocationId });
    await updateAmbientDigestInvocation(env, invocationId, {
      invocation_status: "completed",
      completed_at: new Date().toISOString(),
      error_stage: null,
      error_class: null,
    });
    return result;
  } catch (error) {
    const failureStage = error && typeof error === "object" && "ambientStage" in error && typeof error.ambientStage === "string"
      ? error.ambientStage
      : "unexpected";
    const failureClass = error && typeof error === "object" && "ambientErrorClass" in error && typeof error.ambientErrorClass === "string"
      ? error.ambientErrorClass
      : ambientSafeErrorClass(error);
    await updateAmbientDigestInvocation(env, invocationId, {
      invocation_status: "failed",
      error_stage: failureStage,
      error_class: failureClass,
      completed_at: new Date().toISOString(),
    });
    throw error;
  }
}

async function runAmbientDigestCore(env: AmbientEnv, options: AmbientDigestRunOptions = {}): Promise<AmbientDigestRunResult> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const trigger = options.trigger ?? "cron";
  const executionMode = options.executionMode ?? "normal";
  const isDevelopmentExecution = executionMode !== "normal";
  const isDevDryRun = executionMode === "dev_dry_run";
  const cutoffAt = options.cutoffAt ?? now;
  const cutoffIso = cutoffAt.toISOString();
  const hourBucket = trigger === "cron"
    ? previousAmbientHourBucket(now)
    : options.devSessionId
      ? `dev-${options.devSessionId}`
      : `manual-${cutoffIso}`;
  const runId = `ambient-digest-${now.getTime()}-${crypto.randomUUID()}`;
  const leaseOwner = ambientDigestOwner(options, now);
  const leaseTtlMs = options.leaseTtlMs ?? AMBIENT_DIGEST_LEASE_MS;
  const invocationId = options.invocationId;
  const preCleanupSelection = ambientSelection(options, cutoffIso, hourBucket);
  let groupsBeforeCleanup = 0;
  try {
    const before = await env.DB.prepare(
      `SELECT COUNT(DISTINCT line_group_id || ':' || organization_id) AS count
         FROM ambient_chat_buffer
        WHERE ${preCleanupSelection.where}`,
    ).bind(...preCleanupSelection.bindings).first<{ count: number }>();
    groupsBeforeCleanup = Number(before?.count ?? 0);
  } catch {
    groupsBeforeCleanup = 0;
  }
  if (invocationId) {
    await updateAmbientDigestInvocation(env, invocationId, {
      invocation_status: "cleanup_running",
      expiry_cleanup_started_at: new Date().toISOString(),
      groups_before_cleanup: groupsBeforeCleanup,
    });
  }
  const emptyExpiry: AmbientExpiryCleanupStats = {
    rowsScanned: 0,
    rowsDeleted: 0,
    candidateLikeCount: 0,
    prefilterExcludedCount: 0,
    failureRetainedSkippedCount: 0,
    expiredAfterFailureRetentionCount: 0,
    failed: false,
  };
  if (!isDevelopmentExecution) {
    await cleanupExpiredAmbientDiagnostics(env, now);
    await cleanupExpiredAmbientDigestRuns(env, now);
  }
  const expiry = isDevelopmentExecution ? emptyExpiry : await cleanupExpiredAmbientSource(env, now);
  if (expiry.failed) {
    const error = new Error("ambient_expiry_cleanup_failed") as Error & {
      ambientStage?: string;
      ambientErrorClass?: string;
    };
    error.ambientStage = "expiry_cleanup";
    error.ambientErrorClass = expiry.errorClass ?? "unknown";
    throw error;
  }
  if (invocationId) {
    await updateAmbientDigestInvocation(env, invocationId, {
      invocation_status: "group_discovery",
      expiry_cleanup_completed_at: new Date().toISOString(),
      expiry_rows_scanned: expiry.rowsScanned,
      expiry_rows_deleted: expiry.rowsDeleted,
      expiry_candidate_like_count: expiry.candidateLikeCount,
      expiry_prefilter_excluded_count: expiry.prefilterExcludedCount,
      expiry_failure_retained_skipped_count: expiry.failureRetainedSkippedCount,
      expiry_expired_after_failure_retention_count: expiry.expiredAfterFailureRetentionCount,
    });
  }
  if (!isDevelopmentExecution) {
    await env.DB.prepare(
      `DELETE FROM ambient_digest_candidates
        WHERE expires_at <= ? AND status IN ('confirmed', 'ignored', 'expired')`,
    ).bind(nowIso).run();
  }

  const result: AmbientDigestRunResult = {
    runId,
    hourBucket,
    trigger,
    executionMode,
    cutoffAt: cutoffIso,
    groupsScanned: 0,
    groupsWithChat: 0,
    prefilterGroups: 0,
    aiCalls: 0,
    candidatesCreated: 0,
    messagesPushed: 0,
    expiredBuffers: expiry.rowsDeleted,
    snoozedCandidatesRequeued: 0,
    busyGroups: 0,
    failedGroups: 0,
    deliveryFailures: 0,
    extractedCandidateCount: 0,
    resolvedCount: 0,
    ambiguousEntityCount: 0,
    unresolvedQuantityCount: 0,
    conflictCount: 0,
    reconcileAlreadyRecorded: 0,
    reconcilePossible: 0,
    reconcileNew: 0,
    officialRecordsLoaded: 0,
    reconciliationDurationMs: 0,
    outcomes: [],
  };

  // Snooze belongs to the Candidate lifecycle. Cron can deliver a due
  // reminder; manual digest requeues it so the Candidate Inbox can render it.
  // Neither path reopens or re-extracts the original Ambient source.
  const dueSnoozed: { results: Array<{ id: string; lineGroupId: string; candidateJson: string }> } =
    // A manual digest also opens the Candidate Inbox, so due snoozes must be
    // made actionable before the inbox query. This changes only Candidate
    // state; the original Ambient source is never reopened.
    !isDevelopmentExecution && (trigger === "cron" || trigger === "manual")
    ? await env.DB.prepare(
      `SELECT id, line_group_id AS lineGroupId, candidate_json AS candidateJson
         FROM ambient_digest_candidates
        WHERE status = 'snoozed' AND snoozed_until IS NOT NULL
          AND snoozed_until <= ?
        ORDER BY snoozed_until, id`,
    ).bind(nowIso).all<{ id: string; lineGroupId: string; candidateJson: string }>()
    : { results: [] };
  for (const row of dueSnoozed.results) {
    const bundle = safeCandidateBundle(row.candidateJson);
    if (!bundle || !candidateBundleHasItems(bundle)) {
      await env.DB.prepare(
        `UPDATE ambient_digest_candidates SET status = 'expired', snoozed_until = NULL
          WHERE id = ? AND status = 'snoozed'`,
      ).bind(row.id).run();
      continue;
    }
    const claimed = await env.DB.prepare(
      `UPDATE ambient_digest_candidates SET status = 'pending', snoozed_until = NULL
        WHERE id = ? AND status = 'snoozed'`,
    ).bind(row.id).run();
    if (Number(claimed.meta?.changes ?? 0) !== 1) continue;
    result.snoozedCandidatesRequeued += 1;
    if (options.push) {
      try {
        await options.push(row.lineGroupId, row.id, bundle);
        result.messagesPushed += 1;
      } catch {
        result.deliveryFailures += 1;
      }
    }
  }

  const groupSelection = ambientSelection(options, cutoffIso, hourBucket);
  const groups = await env.DB.prepare(
    `SELECT line_group_id AS lineGroupId, organization_id AS organizationId
       FROM ambient_chat_buffer
      WHERE ${groupSelection.where}
      GROUP BY line_group_id, organization_id`,
  ).bind(...groupSelection.bindings).all<{ lineGroupId: string; organizationId: string }>();
  result.groupsScanned = groups.results.length;
  result.groupsWithChat = groups.results.length;
  if (invocationId) {
    await updateAmbientDigestInvocation(env, invocationId, {
      invocation_status: "processing_groups",
      groups_after_cleanup: groups.results.length,
    });
  }
  const extractor = options.extract ?? ((serviceEnv: AmbientEnv, messages: AmbientBufferedMessage[]) => extractAmbientCandidates(serviceEnv, messages));
  const emptyFailureRetention: AmbientFailureRetentionStats = {
    candidatesConsidered: 0,
    rowsExtended: 0,
    rowsAlreadyGuarded: 0,
    rowsMaxExpired: 0,
  };
  const retainFailureSources = async (...args: Parameters<typeof retainAmbientFailureSources>): Promise<AmbientFailureRetentionStats> => {
    // A dry run is explicitly allowed to write run/diagnostic metadata but may
    // not alter source retention metadata. The real commit path keeps the
    // existing bounded failure-retention behavior.
    if (isDevDryRun) return emptyFailureRetention;
    return retainAmbientFailureSources(...args);
  };

  if (trigger === "manual" && options.targetGroupId && groups.results.length === 0) {
    result.outcomes.push({
      organizationId: options.targetOrganizationId ?? "",
      groupId: options.targetGroupId,
      status: "no_pending",
      sourceMessageIds: [],
      consumedMessageCount: 0,
    });
  }

  for (const group of groups.results) {
    const startedAt = Date.now();
    const groupScope = { organizationId: group.organizationId, groupId: group.lineGroupId };
    const outcomeBase = { organizationId: group.organizationId, groupId: group.lineGroupId };
    const sourceMessageIds: string[] = [];
    const observabilityRunId = ambientDigestRunIdentity(group.organizationId, group.lineGroupId, trigger, nowIso);
    const runStartedAt = new Date(startedAt).toISOString();
    const runExpiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    await createAmbientDigestRunObservability(
      env,
      observabilityRunId,
      group.organizationId,
      group.lineGroupId,
      trigger,
      nowIso,
      runStartedAt,
      runExpiresAt,
    );
    if (executionMode !== "normal" || options.devSessionId) {
      await updateAmbientDigestRunObservability(env, observabilityRunId, "RUN_CREATED", {
        execution_mode: executionMode,
        dev_session_id: options.devSessionId ?? null,
      });
    }
    if (invocationId) {
      await updateAmbientDigestRunObservability(env, observabilityRunId, "RUN_CREATED", {
        invocation_id: invocationId,
      });
      await incrementAmbientDigestInvocation(env, invocationId, "per_group_runs_created", 1);
    }
    let groupTerminalNotified = false;
    const finishRun = async (
      status: "completed" | "busy" | "failed",
      errorStage: string | null = null,
      errorClassValue: string | null = null,
    ): Promise<void> => {
      await updateAmbientDigestRunObservability(env, observabilityRunId, status === "failed" ? "RUN_FAILED" : "RUN_COMPLETED", {
        run_status: status,
        error_stage: errorStage,
        error_class: errorClassValue,
        completed_at: new Date().toISOString(),
      });
      if (!groupTerminalNotified) {
        groupTerminalNotified = true;
        try {
          options.onGroupTerminal?.({
            organizationId: group.organizationId,
            groupId: group.lineGroupId,
            status,
          });
        } catch {
          // Terminal telemetry must never become a Production Ambient failure boundary.
        }
      }
    };
    const diagnostic: AmbientDigestDiagnostic = {
      run_id: runId,
      trigger,
      execution_mode: executionMode,
      group_id_suffix: safeGroupIdSuffix(group.lineGroupId),
      cutoff: cutoffIso,
      source_count: 0,
      lease_result: "not_attempted",
      prefilter_result: "not_run",
      ai_called: false,
      validation_result: "not_run",
      candidate_count: 0,
      extracted_candidate_count: 0,
      resolved_count: 0,
      ambiguous_entity_count: 0,
      unresolved_quantity_count: 0,
      conflict_count: 0,
      reconcile_already_recorded: 0,
      reconcile_possible: 0,
      reconcile_new: 0,
      official_records_loaded: 0,
      reconciliation_duration_ms: 0,
      consume_result: "not_attempted",
      delivery_result: options.push ? "not_requested" : "not_attempted",
      final_status: "failed",
      duration_ms: 0,
    };
    const completeDryRun = async (bundle: AmbientCandidateBundle | null = null): Promise<void> => {
      if (!isDevDryRun) return;
      diagnostic.final_status = "dry_run";
      diagnostic.consume_result = "not_attempted";
      diagnostic.candidate_count = bundle?.candidates.length ?? 0;
      await updateAmbientDigestRunObservability(env, observabilityRunId, "CANDIDATE_WRITE_COMPLETED", {
        candidate_write_status: "none_required",
        candidate_write_completed_at: new Date().toISOString(),
        candidate_created_count: 0,
      });
      await updateAmbientDigestRunObservability(env, observabilityRunId, "BUFFER_CONSUME_COMPLETED", {
        buffer_consume_status: "not_reached",
        buffer_consume_completed_at: new Date().toISOString(),
        processed_count: 0,
      });
      await finishRun("completed");
    };
    let acquired = false;
    let focused: AmbientBufferedMessage[] = [];
    let stage: AmbientDigestGroupOutcome["failureStage"] = "selection";
    try {
      stage = "lease";
      acquired = await acquireAmbientDigestLease(
        env,
        group.organizationId,
        group.lineGroupId,
        leaseOwner,
        now,
        leaseTtlMs,
      );
      diagnostic.lease_result = acquired ? "acquired" : "busy";
      if (!acquired) {
        await finishRun("busy");
        await updateAmbientDigestRunObservability(env, observabilityRunId, "RUN_COMPLETED", { lease_status: "busy" });
        result.busyGroups += 1;
        diagnostic.final_status = "busy";
        result.outcomes.push({ ...outcomeBase, status: "busy", sourceMessageIds: [], consumedMessageCount: 0 });
        continue;
      }
      await updateAmbientDigestRunObservability(env, observabilityRunId, "LEASE_ACQUIRED", {
        lease_status: "acquired",
        lease_acquired_at: new Date().toISOString(),
      });

      stage = "selection";
      const selection = ambientSelection(options, cutoffIso, hourBucket, groupScope);
      const rows = await env.DB.prepare(
        `SELECT id, organization_id AS organizationId, line_group_id AS lineGroupId,
                line_user_id AS lineUserId, line_message_id AS lineMessageId,
                event_timestamp AS eventTimestamp, text, digest_hour AS digestHour
           FROM ambient_chat_buffer
          WHERE ${selection.where}
          ORDER BY event_timestamp, id`,
      ).bind(...selection.bindings).all<AmbientBufferedMessage>();
      const messages = rows.results;
      sourceMessageIds.push(...messages.map((message) => message.lineMessageId));
      diagnostic.source_count = messages.length;
      await updateAmbientDigestRunObservability(env, observabilityRunId, "SOURCE_SELECTED", {
        source_status: messages.length ? "success" : "empty",
        source_selected_at: new Date().toISOString(),
        source_count: messages.length,
      });
      if (!messages.length) {
        await finishRun("completed");
        diagnostic.final_status = "no_pending";
        result.outcomes.push({ ...outcomeBase, status: "no_pending", sourceMessageIds: [], consumedMessageCount: 0 });
        continue;
      }

      stage = "prefilter";
      focused = ambientPrefilter(messages);
      diagnostic.prefilter_result = focused.length ? "candidate_like" : "rejected";
      await updateAmbientDigestRunObservability(env, observabilityRunId, "PREFILTER_COMPLETED", {
        prefilter_status: focused.length ? "candidate_like" : "zero",
        prefilter_completed_at: new Date().toISOString(),
        prefilter_count: focused.length,
      });
      if (!focused.length) {
        if (isDevDryRun) {
          await completeDryRun();
          result.outcomes.push({ ...outcomeBase, status: "dry_run", sourceMessageIds, consumedMessageCount: 0 });
          continue;
        }
        stage = "source_consume";
        await updateAmbientDigestRunObservability(env, observabilityRunId, "BUFFER_CONSUME_STARTED", {
          buffer_consume_status: "running",
          buffer_consume_started_at: new Date().toISOString(),
        });
        try {
          const consumedMessageCount = await consumeAmbientSource(env, selection);
          diagnostic.consume_result = consumedMessageCount > 0 ? "processed" : "none";
          await updateAmbientDigestRunObservability(env, observabilityRunId, "BUFFER_CONSUME_COMPLETED", {
            buffer_consume_status: consumedMessageCount === messages.length ? "success" : consumedMessageCount > 0 ? "partial" : "failed",
            buffer_consume_completed_at: new Date().toISOString(),
            processed_count: consumedMessageCount,
          });
          await finishRun(consumedMessageCount === messages.length ? "completed" : "failed", consumedMessageCount === messages.length ? null : "source_consume", consumedMessageCount === messages.length ? null : "no_rows_updated");
          diagnostic.final_status = "no_candidate";
          result.outcomes.push({ ...outcomeBase, status: "no_candidate", sourceMessageIds, consumedMessageCount });
        } catch (error) {
          diagnostic.error_stage = "source_consume";
          diagnostic.error_class = errorClass(error);
          diagnostic.consume_result = "error";
          await retainFailureSources(env, focused, "buffer_consume", now, invocationId ?? runId, observabilityRunId);
          await updateAmbientDigestRunObservability(env, observabilityRunId, "BUFFER_CONSUME_FAILED", {
            buffer_consume_status: "failed",
            buffer_consume_completed_at: new Date().toISOString(),
            error_stage: "buffer_consume",
            error_class: ambientSafeErrorClass(error),
          });
          await finishRun("failed", "buffer_consume", ambientSafeErrorClass(error));
          result.failedGroups += 1;
          result.outcomes.push({ ...outcomeBase, status: "failed", failureStage: "source_consume", errorClass: errorClass(error), sourceMessageIds, consumedMessageCount: 0 });
        }
        continue;
      }
      result.prefilterGroups += 1;

      stage = "candidate_write";
      const candidateSourceIds = messages.map((message) => message.lineMessageId);
      const candidateId = ambientCandidateId(group.lineGroupId, hourBucket, candidateSourceIds);
      const candidateHourKey = ambientCandidateHourKey(hourBucket, candidateSourceIds);
      const existing = await env.DB.prepare(
        `SELECT candidate_json AS candidateJson
           FROM ambient_digest_candidates
          WHERE id = ? LIMIT 1`,
      ).bind(candidateId).first<{ candidateJson: string }>();
      if (existing && !isDevDryRun) {
        const existingBundle = safeCandidateBundle(existing.candidateJson);
        if (existingBundle) {
          stage = "source_consume";
          await updateAmbientDigestRunObservability(env, observabilityRunId, "CANDIDATE_WRITE_COMPLETED", {
            candidate_write_status: "none_required",
            candidate_write_completed_at: new Date().toISOString(),
            candidate_created_count: 0,
          });
          await updateAmbientDigestRunObservability(env, observabilityRunId, "BUFFER_CONSUME_STARTED", {
            buffer_consume_status: "running",
            buffer_consume_started_at: new Date().toISOString(),
          });
          const consumedMessageCount = await consumeAmbientSource(env, selection);
          diagnostic.candidate_count = 1;
          diagnostic.consume_result = consumedMessageCount > 0 ? "processed" : "none";
          await updateAmbientDigestRunObservability(env, observabilityRunId, "BUFFER_CONSUME_COMPLETED", {
            buffer_consume_status: consumedMessageCount === messages.length ? "success" : consumedMessageCount > 0 ? "partial" : "failed",
            buffer_consume_completed_at: new Date().toISOString(),
            processed_count: consumedMessageCount,
          });
          await finishRun(consumedMessageCount === messages.length ? "completed" : "failed", consumedMessageCount === messages.length ? null : "source_consume", consumedMessageCount === messages.length ? null : "no_rows_updated");
          diagnostic.final_status = "candidate";
          result.outcomes.push({ ...outcomeBase, status: "candidate", candidateId, bundle: existingBundle, sourceMessageIds, consumedMessageCount });
          continue;
        }
        diagnostic.error_stage = "candidate_write";
        diagnostic.error_class = "invalid_existing_candidate_json";
        await updateAmbientDigestRunObservability(env, observabilityRunId, "CANDIDATE_WRITE_FAILED", {
          candidate_write_status: "failed",
          candidate_write_completed_at: new Date().toISOString(),
          error_stage: "candidate_write",
          error_class: "invalid_existing_candidate_json",
        });
        await retainFailureSources(env, focused, "candidate_write", now, invocationId ?? runId, observabilityRunId);
        await finishRun("failed", "candidate_write", "invalid_existing_candidate_json");
        result.failedGroups += 1;
        result.outcomes.push({ ...outcomeBase, status: "failed", failureStage: "candidate_write", errorClass: "invalid_existing_candidate_json", sourceMessageIds, consumedMessageCount: 0 });
        continue;
      }

      stage = "ai";
      const aiStartedAt = Date.now();
      await updateAmbientDigestRunObservability(env, observabilityRunId, "AI_STARTED", {
        ai_status: "not_started",
        ai_started_at: new Date(aiStartedAt).toISOString(),
      });
      let extraction: AmbientExtractionResult;
      try {
        extraction = await extractor(env, messages);
      } catch (error) {
        extraction = { attempted: true, bundle: null, validation: "ai_error", errorClass: errorClass(error) };
      }
      diagnostic.ai_duration_ms = Date.now() - aiStartedAt;
      diagnostic.ai_called = extraction.attempted;
      diagnostic.validation_result = extraction.validation;
      if (extraction.attempted) result.aiCalls += 1;
      const aiStatus = !extraction.attempted
        ? "not_started"
        : extraction.validation === "ai_error"
          ? (ambientSafeErrorClass(extraction.errorClass ?? "unknown") === "timeout" ? "timeout" : "failed")
          // A schema-invalid result still proves the provider returned. The
          // rejection belongs to validation, not to the transport/AI stage.
          : "success";
      const validationStatus = extraction.validation === "schema_valid"
        ? "success"
        : extraction.validation === "schema_invalid" ? "rejected" : "not_started";
      const validationCount = extraction.bundle?.candidates.length ?? 0;
      const aiErrorClass = extraction.validation === "ai_error"
        ? ambientSafeErrorClass(extraction.errorClass ?? "unknown")
        : extraction.validation === "schema_invalid" ? ambientSafeErrorClass(extraction.errorClass ?? "schema_invalid") : null;
      const validationCompletedAt = extraction.validation === "schema_valid" || extraction.validation === "schema_invalid"
        ? new Date().toISOString()
        : null;
      const transportIssue = extraction.transportDiagnostics?.issueCode ?? null;
      const normalizationStatus = extraction.validation === "ai_error" || extraction.validation === "not_invoked"
        ? "not_reached"
        : transportIssue === "JSON_PARSE_FAILED" || transportIssue === "EMPTY_COMPLETION" || transportIssue === "RESPONSE_FIELD_MISSING"
          ? "not_reached"
          : "success";
      const firstBadSubstage = extraction.validation === "ai_error"
        ? "AI_CALL"
        : extraction.validation === "schema_invalid"
          ? transportIssue === "JSON_PARSE_FAILED" ? "JSON_PARSE" : extraction.sourceCoverage?.selectedSourceCoverageStatus === "failed" ? "SOURCE_COVERAGE" : "CANDIDATE_SCHEMA"
          : null;
      await updateAmbientDigestRunObservability(env, observabilityRunId, extraction.validation === "ai_error" ? "AI_FAILED" : "AI_COMPLETED", {
        ai_status: aiStatus,
        ai_completed_at: new Date().toISOString(),
        validation_status: validationStatus,
        validation_completed_at: validationCompletedAt,
        validation_count: validationCount,
        error_stage: extraction.validation === "ai_error" ? "ai" : extraction.validation === "schema_invalid" ? "validation" : null,
        error_class: aiErrorClass,
        normalization_status: normalizationStatus,
        first_bad_substage: firstBadSubstage,
        ...ambientValidationDiagnosticPatch(extraction.validationDiagnostics),
        ...ambientTransportDiagnosticPatch(extraction.transportDiagnostics),
      });
      if (extraction.validation === "schema_valid") {
        await updateAmbientDigestRunObservability(env, observabilityRunId, "VALIDATION_COMPLETED", {
          validation_status: "success",
          validation_completed_at: validationCompletedAt,
          validation_count: validationCount,
        });
      } else if (extraction.validation === "schema_invalid") {
        await updateAmbientDigestRunObservability(env, observabilityRunId, "VALIDATION_FAILED", {
          validation_status: "rejected",
          validation_completed_at: validationCompletedAt,
          validation_count: validationCount,
          error_stage: "validation",
          error_class: ambientSafeErrorClass(extraction.errorClass ?? "schema_invalid"),
        });
      }
      // Only a schema-valid empty bundle means "analysed and nothing to
      // record". AI errors, missing AI, and invalid JSON remain retryable.
      if (extraction.validation !== "schema_valid" || !extraction.bundle) {
        const failureStage = extraction.validation === "ai_error" || extraction.validation === "not_invoked" ? "ai" : "validation";
        diagnostic.error_stage = failureStage;
        diagnostic.error_class = extraction.errorClass ?? extraction.validation;
        await retainFailureSources(env, focused, failureStage, now, invocationId ?? runId, observabilityRunId);
        await finishRun("failed", failureStage, ambientSafeErrorClass(diagnostic.error_class));
        result.failedGroups += 1;
        result.outcomes.push({ ...outcomeBase, status: "failed", failureStage, errorClass: diagnostic.error_class, sourceMessageIds, consumedMessageCount: 0 });
        continue;
      }
      if (!candidateBundleHasItems(extraction.bundle)) {
        if (isDevDryRun) {
          await completeDryRun(extraction.bundle);
          result.outcomes.push({ ...outcomeBase, status: "dry_run", bundle: extraction.bundle, sourceMessageIds, consumedMessageCount: 0 });
          continue;
        }
        stage = "source_consume";
        await updateAmbientDigestRunObservability(env, observabilityRunId, "CANDIDATE_WRITE_COMPLETED", {
          candidate_write_status: "none_required",
          candidate_write_completed_at: new Date().toISOString(),
          candidate_created_count: 0,
        });
        await updateAmbientDigestRunObservability(env, observabilityRunId, "BUFFER_CONSUME_STARTED", {
          buffer_consume_status: "running",
          buffer_consume_started_at: new Date().toISOString(),
        });
        try {
          const consumedMessageCount = await consumeAmbientSource(env, selection);
          diagnostic.consume_result = consumedMessageCount > 0 ? "processed" : "none";
          await updateAmbientDigestRunObservability(env, observabilityRunId, "BUFFER_CONSUME_COMPLETED", {
            buffer_consume_status: consumedMessageCount === messages.length ? "success" : consumedMessageCount > 0 ? "partial" : "failed",
            buffer_consume_completed_at: new Date().toISOString(),
            processed_count: consumedMessageCount,
          });
          await finishRun(consumedMessageCount === messages.length ? "completed" : "failed", consumedMessageCount === messages.length ? null : "source_consume", consumedMessageCount === messages.length ? null : "no_rows_updated");
          diagnostic.final_status = "no_candidate";
          result.outcomes.push({ ...outcomeBase, status: "no_candidate", sourceMessageIds, consumedMessageCount });
        } catch (error) {
          diagnostic.error_stage = "source_consume";
          diagnostic.error_class = errorClass(error);
          diagnostic.consume_result = "error";
          await updateAmbientDigestRunObservability(env, observabilityRunId, "BUFFER_CONSUME_FAILED", {
            buffer_consume_status: "failed",
            buffer_consume_completed_at: new Date().toISOString(),
            error_stage: "buffer_consume",
            error_class: ambientSafeErrorClass(error),
          });
          await finishRun("failed", "buffer_consume", ambientSafeErrorClass(error));
          result.failedGroups += 1;
          result.outcomes.push({ ...outcomeBase, status: "failed", failureStage: "source_consume", errorClass: errorClass(error), sourceMessageIds, consumedMessageCount: 0 });
        }
        continue;
      }

      stage = "resolve";
      let reconciled: { bundle: AmbientCandidateBundle; summary: AmbientReconciliationSummary };
      let reconcileSubstage: "ENRICHMENT" | "RESOLVE" | "RECONCILE" = "RECONCILE";
      const observeReconcileStage: AmbientReconcileStageObserver = async (substage, status) => {
        reconcileSubstage = substage === "enrichment" ? "ENRICHMENT" : "RESOLVE";
        if (substage === "enrichment") {
          await updateAmbientDigestRunObservability(
            env,
            observabilityRunId,
            status === "failed" ? "ENRICHMENT_FAILED" : "ENRICHMENT_COMPLETED",
            {
              enrichment_status: status === "started" ? "running" : status === "completed" ? "success" : "failed",
              ...(status === "failed" ? { first_bad_substage: "ENRICHMENT" } : {}),
            },
          );
        } else {
          await updateAmbientDigestRunObservability(
            env,
            observabilityRunId,
            status === "failed" ? "RESOLVE_FAILED" : "RESOLVE_COMPLETED",
            {
              resolve_status: status === "started" ? "running" : status === "completed" ? "success" : "failed",
              ...(status === "failed" ? { first_bad_substage: "RESOLVE" } : {}),
            },
          );
        }
      };
      await updateAmbientDigestRunObservability(env, observabilityRunId, "RECONCILE_COMPLETED", {
        reconcile_status: "running",
        reconcile_started_at: new Date().toISOString(),
      });
      try {
        const reconcile = options.reconcile ?? resolveAndReconcileAmbientBundle;
        reconciled = await reconcile(env, group.organizationId, extraction.bundle, messages, cutoffAt, observeReconcileStage);
      } catch (error) {
        diagnostic.error_stage = "reconcile";
        diagnostic.error_class = errorClass(error);
        const failedSubstage: string = reconcileSubstage;
        await retainFailureSources(env, focused, "reconcile", now, invocationId ?? runId, observabilityRunId);
        await updateAmbientDigestRunObservability(env, observabilityRunId, "RECONCILE_FAILED", {
          reconcile_status: "failed",
          reconcile_completed_at: new Date().toISOString(),
          first_bad_substage: failedSubstage,
          ...(failedSubstage === "ENRICHMENT"
            ? { enrichment_status: "failed" }
            : failedSubstage === "RESOLVE" ? { resolve_status: "failed" } : {}),
          error_stage: "reconcile",
          error_class: ambientSafeErrorClass(error),
        });
        await finishRun("failed", "reconcile", ambientSafeErrorClass(error));
        result.failedGroups += 1;
        result.outcomes.push({ ...outcomeBase, status: "failed", failureStage: "reconcile", errorClass: errorClass(error), sourceMessageIds, consumedMessageCount: 0 });
        continue;
      }
      const reconciliation = reconciled.summary;
      diagnostic.extracted_candidate_count = reconciliation.extractedCandidateCount;
      diagnostic.resolved_count = reconciliation.resolvedCount;
      diagnostic.ambiguous_entity_count = reconciliation.ambiguousEntityCount;
      diagnostic.unresolved_quantity_count = reconciliation.unresolvedQuantityCount;
      diagnostic.conflict_count = reconciliation.conflictCount;
      diagnostic.reconcile_already_recorded = reconciliation.reconcileAlreadyRecorded;
      diagnostic.reconcile_possible = reconciliation.reconcilePossible;
      diagnostic.reconcile_new = reconciliation.reconcileNew;
      diagnostic.official_records_loaded = reconciliation.officialRecordsLoaded;
      diagnostic.reconciliation_duration_ms = reconciliation.reconciliationDurationMs;
      result.extractedCandidateCount += reconciliation.extractedCandidateCount;
      result.resolvedCount += reconciliation.resolvedCount;
      result.ambiguousEntityCount += reconciliation.ambiguousEntityCount;
      result.unresolvedQuantityCount += reconciliation.unresolvedQuantityCount;
      result.conflictCount += reconciliation.conflictCount;
      result.reconcileAlreadyRecorded += reconciliation.reconcileAlreadyRecorded;
      result.reconcilePossible += reconciliation.reconcilePossible;
      result.reconcileNew += reconciliation.reconcileNew;
      result.officialRecordsLoaded += reconciliation.officialRecordsLoaded;
      result.reconciliationDurationMs += reconciliation.reconciliationDurationMs;
      const reconciledBundle = reconciled.bundle;
      const devSemanticSummary = isDevelopmentExecution
        ? buildAmbientDevSemanticSummary({
          validatedBundle: extraction.bundle,
          reconciledBundle,
          reconciliation,
          messages,
          extractedCandidateCount: extraction.validationDiagnostics?.candidateCount,
          committedCandidateCount: 0,
          sourceCoverage: extraction.sourceCoverage,
          decisionSummaries: extraction.decisionSummaries,
        })
        : null;
      await updateAmbientDigestRunObservability(env, observabilityRunId, "RECONCILE_COMPLETED", {
        reconcile_status: candidateBundleHasItems(reconciled.bundle) ? "success" : "empty",
        reconcile_completed_at: new Date().toISOString(),
        reconcile_count: reconciliation.extractedCandidateCount,
        ...(devSemanticSummary ? { dev_semantic_summary_json: serializeAmbientDevSemanticSummary(devSemanticSummary) } : {}),
      });
      if (isDevDryRun) {
        await completeDryRun(reconciledBundle);
        result.outcomes.push({ ...outcomeBase, status: "dry_run", bundle: reconciledBundle, sourceMessageIds, consumedMessageCount: 0 });
        continue;
      }
      if (!candidateBundleHasItems(reconciledBundle)) {
        stage = "source_consume";
        await updateAmbientDigestRunObservability(env, observabilityRunId, "CANDIDATE_WRITE_COMPLETED", {
          candidate_write_status: "none_required",
          candidate_write_completed_at: new Date().toISOString(),
          candidate_created_count: 0,
        });
        await updateAmbientDigestRunObservability(env, observabilityRunId, "BUFFER_CONSUME_STARTED", {
          buffer_consume_status: "running",
          buffer_consume_started_at: new Date().toISOString(),
        });
        try {
          const consumedMessageCount = await consumeAmbientSource(env, selection);
          diagnostic.consume_result = consumedMessageCount > 0 ? "processed" : "none";
          await updateAmbientDigestRunObservability(env, observabilityRunId, "BUFFER_CONSUME_COMPLETED", {
            buffer_consume_status: consumedMessageCount === messages.length ? "success" : consumedMessageCount > 0 ? "partial" : "failed",
            buffer_consume_completed_at: new Date().toISOString(),
            processed_count: consumedMessageCount,
          });
          await finishRun(consumedMessageCount === messages.length ? "completed" : "failed", consumedMessageCount === messages.length ? null : "source_consume", consumedMessageCount === messages.length ? null : "no_rows_updated");
          diagnostic.final_status = reconciliation.reconcileAlreadyRecorded > 0 ? "already_recorded" : "no_candidate";
          result.outcomes.push({
            ...outcomeBase,
            status: diagnostic.final_status,
            sourceMessageIds,
            consumedMessageCount,
          });
        } catch (error) {
          diagnostic.error_stage = "source_consume";
          diagnostic.error_class = errorClass(error);
          diagnostic.consume_result = "error";
          await retainFailureSources(env, focused, "buffer_consume", now, invocationId ?? runId, observabilityRunId);
          await updateAmbientDigestRunObservability(env, observabilityRunId, "BUFFER_CONSUME_FAILED", {
            buffer_consume_status: "failed",
            buffer_consume_completed_at: new Date().toISOString(),
            error_stage: "buffer_consume",
            error_class: ambientSafeErrorClass(error),
          });
          await finishRun("failed", "buffer_consume", ambientSafeErrorClass(error));
          result.failedGroups += 1;
          result.outcomes.push({ ...outcomeBase, status: "failed", failureStage: "source_consume", errorClass: errorClass(error), sourceMessageIds, consumedMessageCount: 0 });
        }
        continue;
      }

      stage = "candidate_write";
      const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
      const bundle = reconciledBundle;
      if (!bundle.sourceMessageIds?.length) bundle.sourceMessageIds = focused.map((message) => message.lineMessageId);
      const candidateWriteStartedAt = new Date().toISOString();
      await updateAmbientDigestRunObservability(env, observabilityRunId, "CANDIDATE_WRITE_STARTED", {
        candidate_write_status: "running",
        candidate_write_started_at: candidateWriteStartedAt,
      });
      await updateAmbientDigestRunObservability(env, observabilityRunId, "BUFFER_CONSUME_STARTED", {
        buffer_consume_status: "running",
        buffer_consume_started_at: candidateWriteStartedAt,
      });
      const [candidateInsert, sourceConsume] = await env.DB.batch([
        env.DB.prepare(
          `INSERT OR IGNORE INTO ambient_digest_candidates
            (id, organization_id, line_group_id, hour_bucket, candidate_json, status, expires_at, source)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, 'ambient_digest')`,
        ).bind(candidateId, group.organizationId, group.lineGroupId, candidateHourKey, JSON.stringify(bundle), expiresAt),
        env.DB.prepare(
          `UPDATE ambient_chat_buffer SET digest_status = 'processed'
            WHERE ${selection.where}`,
        ).bind(...selection.bindings),
      ]);
      if (Number(candidateInsert.meta?.changes ?? 0) !== 1) {
        diagnostic.error_stage = "candidate_write";
        diagnostic.error_class = "candidate_insert_not_applied";
        await updateAmbientDigestRunObservability(env, observabilityRunId, "CANDIDATE_WRITE_FAILED", {
          candidate_write_status: "failed",
          candidate_write_completed_at: new Date().toISOString(),
          buffer_consume_status: "not_reached",
          error_stage: "candidate_write",
          error_class: "candidate_insert_not_applied",
        });
        await retainFailureSources(env, focused, "candidate_write", now, invocationId ?? runId, observabilityRunId);
        await finishRun("failed", "candidate_write", "candidate_insert_not_applied");
        result.failedGroups += 1;
        result.outcomes.push({ ...outcomeBase, status: "failed", failureStage: "candidate_write", errorClass: "candidate_insert_not_applied", sourceMessageIds, consumedMessageCount: 0 });
        continue;
      }
      const consumedMessageCount = Number(sourceConsume.meta?.changes ?? 0);
      diagnostic.candidate_count = 1;
      diagnostic.consume_result = consumedMessageCount > 0 ? "processed" : "none";
      const consumeStatus = consumedMessageCount === messages.length ? "success" : consumedMessageCount > 0 ? "partial" : "failed";
      await updateAmbientDigestRunObservability(env, observabilityRunId, "CANDIDATE_WRITE_COMPLETED", {
        candidate_write_status: "success",
        candidate_write_completed_at: new Date().toISOString(),
        candidate_created_count: 1,
        ...(devSemanticSummary && executionMode === "dev_commit"
          ? { dev_semantic_summary_json: serializeAmbientDevSemanticSummary({ ...devSemanticSummary, committedCandidateCount: 1 }) }
          : {}),
      });
      await updateAmbientDigestRunObservability(env, observabilityRunId, consumeStatus === "success" ? "BUFFER_CONSUME_COMPLETED" : "BUFFER_CONSUME_FAILED", {
        buffer_consume_status: consumeStatus,
        buffer_consume_completed_at: new Date().toISOString(),
        processed_count: consumedMessageCount,
        error_stage: consumeStatus === "success" ? null : "buffer_consume",
        error_class: consumeStatus === "success" ? null : "no_rows_updated",
      });
      if (consumeStatus !== "success") {
        await retainFailureSources(env, focused, "buffer_consume", now, invocationId ?? runId, observabilityRunId);
      }
      diagnostic.final_status = "candidate";
      result.candidatesCreated += 1;
      result.outcomes.push({ ...outcomeBase, status: "candidate", candidateId, bundle, sourceMessageIds, consumedMessageCount });
      if (options.push) {
        stage = "delivery";
        try {
          await options.push(group.lineGroupId, candidateId, bundle);
          diagnostic.delivery_result = "sent";
          await updateAmbientDigestRunObservability(env, observabilityRunId, "RUN_COMPLETED", { delivery_status: "sent" });
          result.messagesPushed += 1;
        } catch (error) {
          diagnostic.delivery_result = "failed";
          diagnostic.error_stage = "delivery";
          diagnostic.error_class = errorClass(error);
          await updateAmbientDigestRunObservability(env, observabilityRunId, "RUN_FAILED", {
            delivery_status: "failed",
            error_stage: "delivery",
            error_class: ambientSafeErrorClass(error),
          });
          result.deliveryFailures += 1;
        }
      }
      await finishRun(
        consumeStatus === "success" && diagnostic.delivery_result !== "failed" ? "completed" : "failed",
        consumeStatus === "success" ? diagnostic.delivery_result === "failed" ? "delivery" : null : "buffer_consume",
        consumeStatus === "success" ? diagnostic.delivery_result === "failed" ? ambientSafeErrorClass(diagnostic.error_class ?? "delivery_failed") : null : "no_rows_updated",
      );
    } catch (error) {
      const failureStage = stage ?? "unexpected";
      if (failureStage === "lease") diagnostic.lease_result = "error";
      diagnostic.error_stage = failureStage;
      diagnostic.error_class = errorClass(error);
      const observabilityFailureStage = failureStage === "resolve"
        ? "reconcile"
        : failureStage === "source_consume" ? "buffer_consume" : failureStage;
      await retainFailureSources(
        env,
        focused,
        observabilityFailureStage,
        now,
        invocationId ?? runId,
        observabilityRunId,
      );
      const stageFailurePatch: AmbientDigestRunObservabilityPatch = observabilityFailureStage === "lease"
        ? { lease_status: "failed" }
        : observabilityFailureStage === "selection"
          ? { source_status: "failed" }
          : observabilityFailureStage === "prefilter"
            ? { prefilter_status: "failed" }
            : observabilityFailureStage === "ai"
              ? { ai_status: "failed", ai_completed_at: new Date().toISOString() }
              : observabilityFailureStage === "reconcile"
                ? { reconcile_status: "failed", reconcile_completed_at: new Date().toISOString() }
                : observabilityFailureStage === "candidate_write"
                  ? { candidate_write_status: "failed", candidate_write_completed_at: new Date().toISOString(), buffer_consume_status: "not_reached" }
                  : observabilityFailureStage === "buffer_consume"
                    ? { buffer_consume_status: "failed", buffer_consume_completed_at: new Date().toISOString() }
                    : {};
      await updateAmbientDigestRunObservability(env, observabilityRunId, "RUN_FAILED", {
        ...stageFailurePatch,
        run_status: "failed",
        error_stage: observabilityFailureStage,
        error_class: ambientSafeErrorClass(error),
        completed_at: new Date().toISOString(),
      });
      result.failedGroups += 1;
      result.outcomes.push({ ...outcomeBase, status: "failed", failureStage, errorClass: errorClass(error), sourceMessageIds, consumedMessageCount: 0 });
    } finally {
      if (acquired) {
        try {
          await releaseAmbientDigestLease(env, group.organizationId, group.lineGroupId, leaseOwner, now);
          await updateAmbientDigestRunObservability(env, observabilityRunId, "RUN_COMPLETED", { lease_status: "released" });
        } catch (error) {
          diagnostic.error_stage = "lease";
          diagnostic.error_class = errorClass(error);
          await updateAmbientDigestRunObservability(env, observabilityRunId, "RUN_FAILED", {
            lease_status: "failed",
            run_status: "failed",
            error_stage: "lease",
            error_class: ambientSafeErrorClass(error),
            completed_at: new Date().toISOString(),
          });
        }
      }
      diagnostic.duration_ms = Date.now() - startedAt;
      emitAmbientDigestDiagnostic(diagnostic);
    }
  }
  console.log(JSON.stringify({
    event: "ambient_digest_run",
    run_id: runId,
    trigger,
    cutoff: cutoffIso,
    groups_scanned: result.groupsScanned,
    ai_calls: result.aiCalls,
    candidates_created: result.candidatesCreated,
    messages_pushed: result.messagesPushed,
    failed_groups: result.failedGroups,
    busy_groups: result.busyGroups,
    delivery_failures: result.deliveryFailures,
    extracted_candidate_count: result.extractedCandidateCount,
    resolved_count: result.resolvedCount,
    ambiguous_entity_count: result.ambiguousEntityCount,
    unresolved_quantity_count: result.unresolvedQuantityCount,
    conflict_count: result.conflictCount,
    reconcile_already_recorded: result.reconcileAlreadyRecorded,
    reconcile_possible: result.reconcilePossible,
    reconcile_new: result.reconcileNew,
    official_records_loaded: result.officialRecordsLoaded,
    reconciliation_duration_ms: result.reconciliationDurationMs,
  }));
  return result;
}

export function ambientCandidateIdForTest(groupId: string, hourBucket: string, sourceMessageIds: string[] = []): string {
  return ambientCandidateId(groupId, hourBucket, sourceMessageIds);
}

export function ambientDigestRunIdForTest(
  organizationId: string,
  groupId: string,
  trigger: "cron" | "manual",
  scheduledFor: string,
): string {
  return ambientDigestRunIdentity(organizationId, groupId, trigger, scheduledFor);
}

export function ambientDigestInvocationIdForTest(
  trigger: "cron" | "manual",
  scheduledFor: string,
): string {
  return ambientDigestInvocationIdentity(trigger, scheduledFor);
}
