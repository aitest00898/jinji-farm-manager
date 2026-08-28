import { parseCommand } from "./core";

export const AMBIENT_V2_EVENT_TYPES = ["mortality", "cull", "abnormal"] as const;
export type AmbientV2EventType = (typeof AMBIENT_V2_EVENT_TYPES)[number];

export const AMBIENT_V2_DETAIL_MAX_CODE_POINTS = 12;
const AMBIENT_V2_MAX_EVENTS_PER_MESSAGE = 32;
const AMBIENT_V2_MAX_QUANTITY = 1_000_000;

export type AmbientV2ExtractionMode = "deterministic" | "ai" | "relation" | "none";
export type AmbientV2MessageRoute = "RELATION_ONLY" | "MIXED_EVENT_AND_RELATION" | "EVENT_ONLY" | "NONE" | "ROUTING_UNRESOLVED";
export type AmbientV2StructuralStatus = "pass" | "fail" | "not_applicable";
export type AmbientV2SemanticStatus = "resolved" | "partial" | "unresolved" | "none";
export type AmbientV2TechnicalStatus = "not_attempted" | "success" | "failure";
export type AmbientV2ContextStatus = "resolved" | "unresolved" | "not_requested";

export interface AmbientV2MessageInput {
  safeRef: string;
  sourceIdentity: string;
  text: string;
  selected?: boolean;
  groupKey?: string;
  contextKey?: string;
  farmText?: string | null;
  contextFarmCandidates?: readonly string[];
  sourceTimestamp?: string;
  sourceUser?: string;
}

export interface AmbientV2AiEventProposal {
  event: AmbientV2EventType;
  quantity: number | null;
  detail?: string;
}

export interface AmbientV2AiRequest {
  messages: Array<{ role: "system" | "user"; content: string }>;
  /** Developer-only opt-in; Production V1 does not use this V2 request type. */
  response_format?: AmbientV2ResponseFormat;
}

export interface AmbientV2ResponseFormat {
  type: "json_schema";
  json_schema: Record<string, unknown>;
}

export interface AmbientV2AiAdapter {
  readonly name: string;
  readonly lastCall?: AmbientV2TransportMetadata;
  run(request: AmbientV2AiRequest, context: { safeRef: string }): Promise<unknown>;
}

export interface AmbientV2TransportMetadata {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  latencyMs?: number | null;
}

export interface AmbientV2FarmResolverLike {
  resolve(rawFarmText: string): {
    kind: "direct" | "candidates" | "none";
    farm?: unknown;
    candidates?: readonly unknown[];
  };
}

export interface AmbientV2ContextResolution {
  status: AmbientV2ContextStatus;
  candidateCount: number;
}

export interface AmbientV2SystemEvent extends AmbientV2AiEventProposal {
  kind: "event";
  sourceRef: string;
  sourceIdentity: string;
  eventOrdinal: number;
  quantityConfidence: "unknown" | "observed";
  contextResolution: AmbientV2ContextResolution;
  lineageRefs: string[];
  sourceTimestamp?: string;
  sourceUser?: string;
}

export interface AmbientV2RelationCandidate {
  sourceRef: string;
  sourceIdentity: string;
  event: AmbientV2EventType;
  quantity: number | null;
  groupKey?: string;
  contextKey?: string;
  pending?: boolean;
  isOfficial?: boolean;
}

export interface AmbientV2RelationIntent {
  type: "explicit_duplicate_reference";
  status: "resolved" | "unresolved";
  targetRef?: string;
  candidateCount: number;
}

export type AmbientV2StructuralFailureCode =
  | "PROVIDER_RESPONSE_NOT_TEXT"
  | "EMPTY_RESPONSE"
  | "INVALID_JSON"
  | "TOP_LEVEL_NOT_OBJECT"
  | "TOP_LEVEL_KEYS_INVALID"
  | "EVENTS_NOT_ARRAY"
  | "EVENT_COUNT_EXCEEDED";

/** Bounded, value-free subtype names used for structural forensic evidence. */
export type AmbientV2StructuralSubtype =
  | "INVALID_JSON"
  | "TRUNCATED_JSON"
  | "TOP_LEVEL_NOT_OBJECT"
  | "TOP_LEVEL_UNKNOWN_KEY"
  | "EVENTS_MISSING"
  | "EVENTS_NOT_ARRAY"
  | "EVENT_ITEM_NOT_OBJECT"
  | "EVENT_ITEM_UNKNOWN_KEY"
  | "EVENT_MISSING_EVENT"
  | "EVENT_INVALID_EVENT_ENUM"
  | "EVENT_MISSING_QUANTITY"
  | "EVENT_MISSING_DETAIL"
  | "EVENT_ABNORMAL_DETAIL_NULL"
  | "EVENT_INVALID_QUANTITY_TYPE"
  | "EVENT_INVALID_DETAIL_TYPE"
  | "EVENT_DETAIL_NOT_ALLOWED"
  | "EVENT_DETAIL_TOO_LONG"
  | "UNEXPECTED_OLD_DECISIONS_SHAPE"
  | "UNEXPECTED_PROVIDER_ENVELOPE"
  | "EMPTY_MODEL_TEXT"
  | "OTHER"
  | "UNKNOWN";

export type AmbientV2SemanticFailureCode =
  | "UNKNOWN_EVENT_KEY"
  | "MISSING_EVENT_FIELD"
  | "INVALID_EVENT_TYPE"
  | "INVALID_QUANTITY"
  | "MISSING_DETAIL_FIELD"
  | "ABNORMAL_DETAIL_REQUIRED"
  | "INVALID_DETAIL"
  | "DETAIL_NOT_ALLOWED"
  | "MULTIPLE_EVENT_SCHEMA_ERRORS";

export type AmbientV2SafeValueType = "object" | "array" | "string" | "number" | "boolean" | "null" | "missing" | "unknown";
export type AmbientV2JsonParseStatus = "pass" | "fail" | "not_run";
export type AmbientV2ResponseInputClass = "MODEL_TEXT" | "RESULT_RESPONSE" | "PROVIDER_ENVELOPE" | "OTHER";
export type AmbientV2ResponseBoundaryClass = "PROMPT_TEXT_RESPONSE" | "STRUCTURED_OBJECT_RESPONSE" | "PROVIDER_JSON_MODE_ERROR" | "OTHER";

export type AmbientV2EventEnumStatus = "VALID_CANONICAL" | "INVALID_NON_CANONICAL" | "MISSING";
export type AmbientV2QuantityKind = "number" | "null" | "string" | "boolean" | "array" | "object" | "missing" | "unknown";
export type AmbientV2QuantityStatus = "VALID_POSITIVE" | "VALID_UNKNOWN" | "INVALID" | "MISSING";
export type AmbientV2DetailStatus = "ABSENT" | "VALID_SHORT" | "NULL_ALLOWED" | "REQUIRED" | "INVALID" | "NOT_ALLOWED";
export type AmbientV2DetailKind = "string" | "null" | "missing" | "other";

export interface AmbientV2EventDiagnostic {
  eventOrdinal: number;
  eventType: AmbientV2EventType | "unknown";
  presentKeys: Array<"event" | "quantity" | "detail">;
  missingKeys: Array<"event" | "quantity" | "detail">;
  unknownKeysPresent: boolean;
  unknownKeyNames: string[];
  eventEnumStatus: AmbientV2EventEnumStatus;
  quantityKind: AmbientV2QuantityKind;
  quantityStatus: AmbientV2QuantityStatus;
  detailStatus: AmbientV2DetailStatus;
  detailKind: AmbientV2DetailKind;
  failureSubtype: AmbientV2StructuralSubtype | null;
  firstInvalidField: "event" | "quantity" | "detail" | null;
  detailCodePointCount: number | null;
  valid: boolean;
}

export interface AmbientV2SchemaDiagnostics {
  structuralFailureCode: AmbientV2StructuralFailureCode | null;
  structuralSubtype: AmbientV2StructuralSubtype | null;
  semanticFailureCode: AmbientV2SemanticFailureCode | null;
  semanticSubtype: AmbientV2StructuralSubtype | null;
  jsonParseStatus: AmbientV2JsonParseStatus;
  topLevelType: AmbientV2SafeValueType;
  topLevelKeys: string[];
  eventsKeyPresent: boolean;
  eventsValueType: AmbientV2SafeValueType;
  eventItemCount: number | null;
  firstInvalidEventIndex: number | null;
  firstInvalidField: "event" | "quantity" | "detail" | null;
  unknownKeyNames: string[];
  detailCodePointCount: number | null;
  topLevelKeysValid: boolean;
  eventsIsArray: boolean;
  eventCount: number;
  validEventCount: number;
  invalidEventCount: number;
  invalidEventOrdinals: number[];
  unknownKeysPresent: boolean;
  eventDiagnostics: AmbientV2EventDiagnostic[];
}

export interface AmbientV2ParsedResponse {
  structuralStatus: AmbientV2StructuralStatus;
  semanticStatus: AmbientV2SemanticStatus;
  proposals: AmbientV2AiEventProposal[];
  diagnostics: AmbientV2SchemaDiagnostics;
}

export interface AmbientV2ResponseInputDiagnostics {
  inputClass: AmbientV2ResponseInputClass;
  modelTextPresent: boolean;
  failureSubtype: AmbientV2StructuralSubtype | null;
}

export interface AmbientV2ResponseBoundaryResult {
  responseClass: AmbientV2ResponseBoundaryClass;
  parsed: AmbientV2ParsedResponse;
}

export interface AmbientV2PromptContractAudit {
  fingerprint: string;
  charCount: number;
  canonicalPositiveEventExampleCount: number;
  v2ContractMarkers: "PASS" | "FAIL";
  oldPromptMarkersPresent: boolean;
  topLevelEvents: boolean;
  requiresKind: boolean;
  requiresRef: boolean;
  requiresTargetRef: boolean;
  requiresConfidence: boolean;
  requiresRaw: boolean;
}

export interface AmbientV2MessageDiagnostics {
  extractionMode: AmbientV2ExtractionMode;
  route: AmbientV2MessageRoute;
  technicalStatus: AmbientV2TechnicalStatus;
  schema: AmbientV2SchemaDiagnostics;
  relationCueDetected: boolean;
  invalidEventCount: number;
}

export interface AmbientV2MessageResult {
  safeRef: string;
  route: AmbientV2MessageRoute;
  extractionMode: AmbientV2ExtractionMode;
  structuralStatus: AmbientV2StructuralStatus;
  semanticStatus: AmbientV2SemanticStatus;
  technicalStatus: AmbientV2TechnicalStatus;
  events: AmbientV2SystemEvent[];
  contextResolution: AmbientV2ContextResolution;
  relationIntent: AmbientV2RelationIntent | null;
  diagnostics: AmbientV2MessageDiagnostics;
}

export interface AmbientV2BatchMetrics {
  messagesTotal: number;
  deterministicResolved: number;
  aiRequired: number;
  aiCalls: number;
  relationResolverCalls: number;
  eventsExtracted: number;
  messagesUnresolved: number;
  eventsUnresolved: number;
  technicalFailures: number;
  technicalIdempotencyCollapsed: number;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
}

export interface AmbientV2BatchResult {
  messages: AmbientV2MessageResult[];
  stagedEvents: AmbientV2SystemEvent[];
  relationIntents: Array<{ safeRef: string; targetRef?: string; status: "resolved" | "unresolved" }>;
  metrics: AmbientV2BatchMetrics;
  systemBuildStatus: "pass" | "fail";
  sideEffectFree: true;
}

export interface AmbientV2BatchOptions {
  messages: readonly AmbientV2MessageInput[];
  selectedRefs?: ReadonlySet<string> | readonly string[];
  adapter?: AmbientV2AiAdapter;
  requestBuilder?: (message: AmbientV2MessageInput) => AmbientV2AiRequest;
  responseParser?: (value: unknown) => AmbientV2ParsedResponse;
  deterministicResolver?: (message: AmbientV2MessageInput) => readonly AmbientV2AiEventProposal[] | null;
  contextResolver?: (message: AmbientV2MessageInput) => AmbientV2ContextResolution;
}

export interface AmbientV2ExecutionPlan {
  messagesTotal: number;
  selectedCount: number;
  deterministicResolved: number;
  aiExtractionRequired: number;
  relationDeterministic: number;
  relationAiRequired: number;
  noEventFastPath: number;
  expectedProviderCalls: number;
}

export interface AmbientV2ExpectedEvent {
  event: AmbientV2EventType;
  quantity: number | null;
  detail?: string;
}

export interface AmbientV2ExpectedMessage {
  safeRef: string;
  events: readonly AmbientV2ExpectedEvent[];
  relationTargetRef?: string | null;
  contextResolution?: AmbientV2ContextStatus;
}

export type AmbientV2Accuracy = "PASS" | "PARTIAL" | "FAIL";

export interface AmbientV2EvaluationReport {
  messagesTotal: number;
  deterministicResolved: number;
  aiRequired: number;
  aiCalls: number;
  relationResolverCalls: number;
  eventsExtracted: number;
  messagesUnresolved: number;
  eventsUnresolved: number;
  decisionCoverage: string;
  missingRefCount: number;
  unknownRefCount: number;
  duplicateRefCount: number;
  eventCount: number;
  relationCount: number;
  ignoreCount: number;
  eventTypeAccuracy: AmbientV2Accuracy;
  quantityAccuracy: AmbientV2Accuracy;
  unknownQuantityAccuracy: AmbientV2Accuracy;
  supportRelationAccuracy: AmbientV2Accuracy;
  hallucinationCount: number;
  contextLineageContaminationCount: number;
  duplicateEventCount: number;
  jsonPass: boolean;
  normalizationPass: boolean;
  validationPass: boolean;
  systemBuildPass: boolean;
  evalSideEffectFree: true;
  overallPass: boolean;
  result: AmbientV2BatchResult;
}

const EVENT_KEYS = ["event", "quantity", "detail"] as const;
const EVENT_KEY_SET = new Set<string>(EVENT_KEYS);
const EVENT_TYPE_SET = new Set<string>(AMBIENT_V2_EVENT_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueKind(value: unknown, missing = false): AmbientV2QuantityKind {
  if (missing) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return "unknown";
}

function safeValueType(value: unknown, missing = false): AmbientV2SafeValueType {
  if (missing) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return "unknown";
}

const SAFE_DIAGNOSTIC_KEYS = new Set([
  "events",
  "decisions",
  "event",
  "quantity",
  "detail",
  "kind",
  "ref",
  "sourceRef",
  "targetRef",
  "confidence",
  "quantityConfidence",
  "raw",
  "farm",
  "farmId",
  "house",
  "houseId",
  "timestamp",
  "user",
  "evidence",
  "reason",
  "notes",
]);

function safeDiagnosticKeys(keys: readonly string[]): string[] {
  return [...new Set(keys.map((key) => SAFE_DIAGNOSTIC_KEYS.has(key) ? key : "UNKNOWN"))];
}

function likelyTruncatedJson(error: unknown, text: string): boolean {
  if (!(error instanceof SyntaxError) || !/unexpected end of JSON input/iu.test(error.message)) return false;
  let inString = false;
  let escapePending = false;
  let braceBalance = 0;
  let bracketBalance = 0;
  for (const character of text) {
    if (inString) {
      if (escapePending) {
        escapePending = false;
      } else if (character === "\\") {
        escapePending = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      braceBalance += 1;
    } else if (character === "}") {
      braceBalance -= 1;
    } else if (character === "[") {
      bracketBalance += 1;
    } else if (character === "]") {
      bracketBalance -= 1;
    }
    if (braceBalance < 0 || bracketBalance < 0) return false;
  }
  return inString || escapePending || braceBalance > 0 || bracketBalance > 0;
}

function emptySchemaDiagnostics(): AmbientV2SchemaDiagnostics {
  return {
    structuralFailureCode: null,
    structuralSubtype: null,
    semanticFailureCode: null,
    semanticSubtype: null,
    jsonParseStatus: "not_run",
    topLevelType: "unknown",
    topLevelKeys: [],
    eventsKeyPresent: false,
    eventsValueType: "missing",
    eventItemCount: null,
    firstInvalidEventIndex: null,
    firstInvalidField: null,
    unknownKeyNames: [],
    detailCodePointCount: null,
    topLevelKeysValid: false,
    eventsIsArray: false,
    eventCount: 0,
    validEventCount: 0,
    invalidEventCount: 0,
    invalidEventOrdinals: [],
    unknownKeysPresent: false,
    eventDiagnostics: [],
  };
}

function structuralFailure(
  code: AmbientV2StructuralFailureCode,
  subtype: AmbientV2StructuralSubtype,
  details: Partial<AmbientV2SchemaDiagnostics> = {},
): AmbientV2ParsedResponse {
  return {
    structuralStatus: "fail",
    semanticStatus: "unresolved",
    proposals: [],
    diagnostics: {
      ...emptySchemaDiagnostics(),
      ...details,
      structuralFailureCode: code,
      structuralSubtype: subtype,
    },
  };
}

function semanticStatusFor(eventCount: number, validEventCount: number): AmbientV2SemanticStatus {
  if (eventCount === 0) return "none";
  if (validEventCount === eventCount) return "resolved";
  return validEventCount > 0 ? "partial" : "unresolved";
}

function validQuantity(value: unknown): value is number | null {
  return value === null
    || (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= AMBIENT_V2_MAX_QUANTITY);
}

function validDetail(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) return false;
  const codePoints = Array.from(value).length;
  if (codePoints > AMBIENT_V2_DETAIL_MAX_CODE_POINTS) return false;
  // Keep the field a short symptom label, not a sentence or generated prose.
  return !/[\s。！？?!，,；;:：]/u.test(value);
}

export function inspectAmbientV2ResponseInput(value: unknown): AmbientV2ResponseInputDiagnostics {
  if (typeof value === "string") {
    return {
      inputClass: "MODEL_TEXT",
      modelTextPresent: value.trim().length > 0,
      failureSubtype: value.trim().length > 0 ? null : "EMPTY_MODEL_TEXT",
    };
  }
  if (isRecord(value) && typeof value.response === "string") {
    return {
      inputClass: "RESULT_RESPONSE",
      modelTextPresent: value.response.trim().length > 0,
      failureSubtype: value.response.trim().length > 0 ? null : "EMPTY_MODEL_TEXT",
    };
  }
  if (isRecord(value) && (Object.prototype.hasOwnProperty.call(value, "success")
    || Object.prototype.hasOwnProperty.call(value, "result")
    || Object.prototype.hasOwnProperty.call(value, "errors"))) {
    return {
      inputClass: "PROVIDER_ENVELOPE",
      modelTextPresent: false,
      failureSubtype: "UNEXPECTED_PROVIDER_ENVELOPE",
    };
  }
  return {
    inputClass: "OTHER",
    modelTextPresent: false,
    failureSubtype: "UNKNOWN",
  };
}

function parseResponseText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  return typeof value.response === "string" ? value.response : null;
}

/**
 * Parse the V2 AI response with no compatibility extraction. A response is
 * either one complete JSON document or it is structurally rejected.
 */
export function parseAmbientV2Response(value: unknown): AmbientV2ParsedResponse {
  const inputDiagnostics = inspectAmbientV2ResponseInput(value);
  const text = parseResponseText(value);
  if (text === null) {
    return structuralFailure(
      "PROVIDER_RESPONSE_NOT_TEXT",
      inputDiagnostics.failureSubtype ?? "UNKNOWN",
    );
  }
  if (!text.trim()) return structuralFailure("EMPTY_RESPONSE", "EMPTY_MODEL_TEXT");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch (error) {
    return structuralFailure("INVALID_JSON", likelyTruncatedJson(error, text.trim()) ? "TRUNCATED_JSON" : "INVALID_JSON", {
      jsonParseStatus: "fail",
    });
  }
  return parseAmbientV2JsonDocument(parsed);
}

function parseAmbientV2JsonDocument(parsed: unknown): AmbientV2ParsedResponse {
  if (!isRecord(parsed)) {
    return structuralFailure("TOP_LEVEL_NOT_OBJECT", "TOP_LEVEL_NOT_OBJECT", {
      jsonParseStatus: "pass",
      topLevelType: safeValueType(parsed),
    });
  }

  const topLevelKeys = Object.keys(parsed);
  const eventsKeyPresent = Object.prototype.hasOwnProperty.call(parsed, "events");
  const topLevelKeysSafe = safeDiagnosticKeys(topLevelKeys);
  const topLevelUnknownKeys = topLevelKeys.filter((key) => !SAFE_DIAGNOSTIC_KEYS.has(key));
  const topLevelKeysValid = topLevelKeys.length === 1 && topLevelKeys[0] === "events";
  if (!topLevelKeysValid) {
    const oldDecisionsShape = Object.prototype.hasOwnProperty.call(parsed, "decisions") && !eventsKeyPresent;
    return structuralFailure("TOP_LEVEL_KEYS_INVALID", oldDecisionsShape ? "UNEXPECTED_OLD_DECISIONS_SHAPE" : eventsKeyPresent ? "TOP_LEVEL_UNKNOWN_KEY" : "EVENTS_MISSING", {
      jsonParseStatus: "pass",
      topLevelType: "object",
      topLevelKeys: topLevelKeysSafe,
      eventsKeyPresent,
      eventsValueType: eventsKeyPresent ? safeValueType(parsed.events) : "missing",
      topLevelKeysValid: false,
      unknownKeyNames: topLevelUnknownKeys.length > 0 ? safeDiagnosticKeys(topLevelUnknownKeys) : [],
    });
  }
  if (!Array.isArray(parsed.events)) {
    return structuralFailure("EVENTS_NOT_ARRAY", "EVENTS_NOT_ARRAY", {
      jsonParseStatus: "pass",
      topLevelType: "object",
      topLevelKeys: topLevelKeysSafe,
      eventsKeyPresent: true,
      eventsValueType: safeValueType(parsed.events),
      topLevelKeysValid: true,
      eventsIsArray: false,
    });
  }
  if (parsed.events.length > AMBIENT_V2_MAX_EVENTS_PER_MESSAGE) {
    return structuralFailure("EVENT_COUNT_EXCEEDED", "OTHER", {
      jsonParseStatus: "pass",
      topLevelType: "object",
      topLevelKeys: topLevelKeysSafe,
      eventsKeyPresent: true,
      eventsValueType: "array",
      eventItemCount: parsed.events.length,
      topLevelKeysValid: true,
      eventsIsArray: true,
      eventCount: parsed.events.length,
    });
  }

  const diagnostics: AmbientV2SchemaDiagnostics = {
    ...emptySchemaDiagnostics(),
    jsonParseStatus: "pass",
    topLevelType: "object",
    topLevelKeys: topLevelKeysSafe,
    eventsKeyPresent: true,
    eventsValueType: "array",
    eventItemCount: parsed.events.length,
    topLevelKeysValid: true,
    eventsIsArray: true,
    eventCount: parsed.events.length,
  };
  const proposals: AmbientV2AiEventProposal[] = [];

  parsed.events.forEach((value, index) => {
    const ordinal = index + 1;
    if (!isRecord(value)) {
      diagnostics.invalidEventCount += 1;
      diagnostics.invalidEventOrdinals.push(ordinal);
      diagnostics.semanticSubtype ||= "EVENT_ITEM_NOT_OBJECT";
      diagnostics.firstInvalidEventIndex ||= ordinal;
      diagnostics.eventDiagnostics.push({
        eventOrdinal: ordinal,
        eventType: "unknown",
        presentKeys: [],
        missingKeys: ["event", "quantity", "detail"],
        unknownKeysPresent: false,
        unknownKeyNames: [],
        eventEnumStatus: "MISSING",
        quantityKind: valueKind(value),
        quantityStatus: "INVALID",
        detailStatus: "INVALID",
        detailKind: "other",
        failureSubtype: "EVENT_ITEM_NOT_OBJECT",
        firstInvalidField: null,
        detailCodePointCount: null,
        valid: false,
      });
      return;
    }
    const keys = Object.keys(value);
    const presentKeys = keys.filter((key): key is (typeof EVENT_KEYS)[number] => EVENT_KEY_SET.has(key));
    const unknownKeyNames = safeDiagnosticKeys(keys.filter((key) => !EVENT_KEY_SET.has(key)));
    const missingKeys = (EVENT_KEYS as readonly ("event" | "quantity" | "detail")[]).filter(
      (key) => !Object.prototype.hasOwnProperty.call(value, key),
    );
    const unknownKeysPresent = keys.some((key) => !EVENT_KEY_SET.has(key));
    const eventValue = value.event;
    const eventEnumStatus: AmbientV2EventEnumStatus = !Object.prototype.hasOwnProperty.call(value, "event")
      ? "MISSING"
      : EVENT_TYPE_SET.has(String(eventValue))
        ? "VALID_CANONICAL"
        : "INVALID_NON_CANONICAL";
    const eventType: AmbientV2EventType | "unknown" = eventEnumStatus === "VALID_CANONICAL"
      ? eventValue as AmbientV2EventType
      : "unknown";
    const quantityPresent = Object.prototype.hasOwnProperty.call(value, "quantity");
    const quantity = value.quantity;
    const quantityKind = valueKind(quantity, !quantityPresent);
    const quantityStatus: AmbientV2QuantityStatus = !quantityPresent
      ? "MISSING"
      : quantity === null
        ? "VALID_UNKNOWN"
        : validQuantity(quantity)
          ? "VALID_POSITIVE"
          : "INVALID";
    const detailPresent = Object.prototype.hasOwnProperty.call(value, "detail");
    const detailStatus: AmbientV2DetailStatus = !detailPresent
      ? "ABSENT"
      : eventValue === "abnormal"
        ? value.detail === null
          ? "REQUIRED"
          : validDetail(value.detail)
            ? "VALID_SHORT"
            : "INVALID"
        : value.detail === null
          ? "NULL_ALLOWED"
          : "NOT_ALLOWED";
    const detailCodePointCount = typeof value.detail === "string" ? Array.from(value.detail).length : null;
    const detailKind: AmbientV2DetailKind = !detailPresent
      ? "missing"
      : value.detail === null
        ? "null"
        : typeof value.detail === "string"
          ? "string"
          : "other";
    const firstInvalidField: "event" | "quantity" | "detail" | null = unknownKeysPresent
      ? null
      : missingKeys.includes("event") || eventEnumStatus === "INVALID_NON_CANONICAL"
      ? "event"
        : missingKeys.includes("quantity") || quantityStatus === "INVALID"
          ? "quantity"
        : missingKeys.includes("detail") || (detailStatus !== "NULL_ALLOWED" && detailStatus !== "VALID_SHORT")
          ? "detail"
          : null;
    const failureSubtype: AmbientV2StructuralSubtype | null = unknownKeysPresent
      ? "EVENT_ITEM_UNKNOWN_KEY"
      : missingKeys.includes("event")
        ? "EVENT_MISSING_EVENT"
        : eventEnumStatus === "INVALID_NON_CANONICAL"
          ? "EVENT_INVALID_EVENT_ENUM"
          : missingKeys.includes("quantity")
            ? "EVENT_MISSING_QUANTITY"
            : quantityStatus === "INVALID"
              ? "EVENT_INVALID_QUANTITY_TYPE"
              : missingKeys.includes("detail")
                ? "EVENT_MISSING_DETAIL"
                : detailStatus === "REQUIRED"
                  ? "EVENT_ABNORMAL_DETAIL_NULL"
                : detailStatus === "NOT_ALLOWED"
                  ? "EVENT_DETAIL_NOT_ALLOWED"
                  : detailStatus === "INVALID" && typeof value.detail !== "string"
                    ? "EVENT_INVALID_DETAIL_TYPE"
                    : detailStatus === "INVALID" && detailCodePointCount !== null && detailCodePointCount > AMBIENT_V2_DETAIL_MAX_CODE_POINTS
                      ? "EVENT_DETAIL_TOO_LONG"
                      : detailStatus === "INVALID"
                        ? "OTHER"
                        : null;
    const valid = !unknownKeysPresent
      && missingKeys.length === 0
      && eventEnumStatus === "VALID_CANONICAL"
      && quantityStatus !== "INVALID"
      && quantityStatus !== "MISSING"
      && (eventValue === "abnormal" ? detailStatus === "VALID_SHORT" : detailStatus === "NULL_ALLOWED");
    diagnostics.eventDiagnostics.push({
      eventOrdinal: ordinal,
      eventType,
      presentKeys,
      missingKeys,
      unknownKeysPresent,
      unknownKeyNames,
      eventEnumStatus,
      quantityKind,
      quantityStatus,
      detailStatus,
      detailKind,
      failureSubtype,
      firstInvalidField,
      detailCodePointCount,
      valid,
    });
    diagnostics.unknownKeysPresent ||= unknownKeysPresent;
    diagnostics.unknownKeyNames = [...new Set([...diagnostics.unknownKeyNames, ...unknownKeyNames])];
    diagnostics.detailCodePointCount ??= detailCodePointCount;
    if (!valid) {
      diagnostics.invalidEventCount += 1;
      diagnostics.invalidEventOrdinals.push(ordinal);
      diagnostics.semanticSubtype ||= failureSubtype ?? "UNKNOWN";
      diagnostics.firstInvalidEventIndex ||= ordinal;
      diagnostics.firstInvalidField ||= firstInvalidField;
      return;
    }
    diagnostics.validEventCount += 1;
    proposals.push({
      event: eventValue as AmbientV2EventType,
      quantity: quantity as number | null,
      ...(eventValue === "abnormal" ? { detail: value.detail as string } : {}),
    });
  });

  diagnostics.semanticFailureCode = diagnostics.invalidEventCount === 0
    ? null
    : diagnostics.unknownKeysPresent
      ? "UNKNOWN_EVENT_KEY"
      : diagnostics.invalidEventCount > 1
        ? "MULTIPLE_EVENT_SCHEMA_ERRORS"
        : diagnostics.eventDiagnostics.find((item) => !item.valid)?.missingKeys.includes("event")
          || diagnostics.eventDiagnostics.find((item) => !item.valid)?.missingKeys.includes("quantity")
          ? "MISSING_EVENT_FIELD"
          : diagnostics.eventDiagnostics.find((item) => !item.valid)?.missingKeys.includes("detail")
            ? "MISSING_DETAIL_FIELD"
            : diagnostics.eventDiagnostics.find((item) => !item.valid)?.eventEnumStatus === "INVALID_NON_CANONICAL"
              ? "INVALID_EVENT_TYPE"
              : diagnostics.eventDiagnostics.find((item) => !item.valid)?.quantityStatus === "INVALID"
                ? "INVALID_QUANTITY"
                : diagnostics.eventDiagnostics.find((item) => !item.valid)?.detailStatus === "REQUIRED"
                  ? "ABNORMAL_DETAIL_REQUIRED"
                  : diagnostics.eventDiagnostics.find((item) => !item.valid)?.detailStatus === "NOT_ALLOWED"
                    ? "DETAIL_NOT_ALLOWED"
                    : "INVALID_DETAIL";
  return {
    structuralStatus: "pass",
    semanticStatus: semanticStatusFor(diagnostics.eventCount, diagnostics.validEventCount),
    proposals,
    diagnostics,
  };
}

/**
 * Classify the provider result before validation. Structured JSON objects are
 * validated as objects directly; they are never stringified into the text
 * parser. Provider error envelopes are kept separate from malformed JSON.
 */
export function parseAmbientV2ResponseBoundary(value: unknown): AmbientV2ResponseBoundaryResult {
  if (typeof value === "string") {
    return { responseClass: "PROMPT_TEXT_RESPONSE", parsed: parseAmbientV2Response(value) };
  }
  if (isRecord(value) && typeof value.response === "string") {
    return { responseClass: "PROMPT_TEXT_RESPONSE", parsed: parseAmbientV2Response(value) };
  }
  if (isRecord(value) && isRecord(value.response)) {
    return { responseClass: "STRUCTURED_OBJECT_RESPONSE", parsed: parseAmbientV2JsonDocument(value.response) };
  }
  if (isRecord(value) && (value.success === false || Array.isArray(value.errors))) {
    return {
      responseClass: "PROVIDER_JSON_MODE_ERROR",
      parsed: structuralFailure("PROVIDER_RESPONSE_NOT_TEXT", "UNEXPECTED_PROVIDER_ENVELOPE"),
    };
  }
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, "events")) {
    return { responseClass: "STRUCTURED_OBJECT_RESPONSE", parsed: parseAmbientV2JsonDocument(value) };
  }
  return {
    responseClass: "OTHER",
    parsed: structuralFailure("PROVIDER_RESPONSE_NOT_TEXT", "UNKNOWN"),
  };
}

export const AMBIENT_V2_CANONICAL_EVENT_EXAMPLE = '{"events":[{"event":"abnormal","quantity":null,"detail":"咳嗽"}]}';
export const AMBIENT_V2_CANONICAL_MULTI_EVENT_EXAMPLE = '{"events":[{"event":"mortality","quantity":2,"detail":null},{"event":"abnormal","quantity":2,"detail":"咳嗽"}]}';

export const AMBIENT_V2_SYSTEM_PROMPT = [
  "只判斷這一則來源訊息的雞場營運事件。",
  "只輸出一個完整合法 JSON object，唯一 top-level key 是 events；沒有事件時輸出 {\"events\":[]}。",
  "每個事件只能有 event、quantity、detail 三種 key；event 只能是 mortality、cull、abnormal；quantity 是正數或 null。",
  "每個事件都必須輸出 detail；abnormal 使用 12 個 Unicode 字元以內的短症狀名稱；mortality/cull 的 detail 必須是 null。",
  `canonical event 範例（單一症狀）：${AMBIENT_V2_CANONICAL_EVENT_EXAMPLE}`,
  `canonical multi-event 範例（同一則來源可有多個事件；來源：「死亡2隻，這2隻都有咳嗽」）：${AMBIENT_V2_CANONICAL_MULTI_EVENT_EXAMPLE}`,
  "不要輸出 kind、confidence、raw、source、farm、target、解釋或其他文字。不要猜未知數量。",
].join("\n");

function countOccurrences(value: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = value.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}

function stablePromptFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function positiveRequirement(prompt: string, field: string): boolean {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`${escaped}.{0,32}(?:必填|必須|required|must|只能|only)`, "iu").test(prompt)
    && !new RegExp(`不要\\s*輸出[^\\n]{0,24}${escaped}`, "iu").test(prompt);
}

/** Safe source-level contract audit; it returns no prompt content. */
export function auditAmbientV2PromptContract(prompt = AMBIENT_V2_SYSTEM_PROMPT): AmbientV2PromptContractAudit {
  const topLevelEvents = prompt.includes("唯一 top-level key 是 events") && prompt.includes('{"events":[]}');
  const requiresKind = positiveRequirement(prompt, "kind");
  const requiresRef = positiveRequirement(prompt, "ref");
  const requiresTargetRef = positiveRequirement(prompt, "targetRef");
  const requiresConfidence = positiveRequirement(prompt, "confidence") || positiveRequirement(prompt, "quantityConfidence");
  const requiresRaw = positiveRequirement(prompt, "raw");
  const oldPromptMarkersPresent = prompt.includes("decisions")
    || prompt.includes("ignoredSelectedRefs")
    || prompt.includes("source coverage")
    || requiresKind
    || requiresRef
    || requiresTargetRef
    || requiresConfidence
    || requiresRaw;
  const v2ContractMarkers = topLevelEvents
    && prompt.includes("每個事件只能有 event、quantity、detail 三種 key")
    && prompt.includes("event 只能是 mortality、cull、abnormal")
    && prompt.includes("quantity 是正數或 null")
    && prompt.includes("每個事件都必須輸出 detail")
    && prompt.includes("mortality/cull 的 detail 必須是 null")
    && !oldPromptMarkersPresent;
  return {
    fingerprint: stablePromptFingerprint(prompt),
    charCount: prompt.length,
    canonicalPositiveEventExampleCount: countOccurrences(prompt, AMBIENT_V2_CANONICAL_EVENT_EXAMPLE)
      + countOccurrences(prompt, AMBIENT_V2_CANONICAL_MULTI_EVENT_EXAMPLE),
    v2ContractMarkers: v2ContractMarkers ? "PASS" : "FAIL",
    oldPromptMarkersPresent,
    topLevelEvents,
    requiresKind,
    requiresRef,
    requiresTargetRef,
    requiresConfidence,
    requiresRaw,
  };
}

export function ambientV2RequestPromptFingerprint(request: AmbientV2AiRequest): string {
  return stablePromptFingerprint(request.messages.find((message) => message.role === "system")?.content ?? "");
}

export function buildAmbientV2Request(message: AmbientV2MessageInput): AmbientV2AiRequest {
  return {
    messages: [
      { role: "system", content: AMBIENT_V2_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({ source: message.text }) },
    ],
  };
}

/**
 * Conservative bridge to the existing deterministic operational parser. It
 * only accepts a single already-supported mortality/cull command and refuses
 * relation, negation, abnormal, or multi-event wording. It never infers a
 * quantity and never resolves a farm.
 */
export function existingAmbientV2DeterministicFastPath(text: string): AmbientV2AiEventProposal[] | null {
  const normalized = text.normalize("NFKC").trim();
  if (!normalized || /(?:沒有|没|不是新增|不是新|同一|前面那|剛才那|刚才那|咳|喘|腳傷|脚伤|臭腳|臭脚|跛腳|跛脚|和|與|及|，|,)/u.test(normalized)) return null;
  const parsed = parseCommand(normalized);
  if (parsed.kind !== "record_operational" || (parsed.draft.intent !== "mortality" && parsed.draft.intent !== "cull")) return null;
  return [{ event: parsed.draft.intent, quantity: parsed.draft.quantity }];
}

export function resolveAmbientV2Context(input: {
  farmText?: string | null;
  contextFarmCandidates?: readonly string[];
  resolver?: AmbientV2FarmResolverLike;
}): AmbientV2ContextResolution {
  const explicitCandidates = input.contextFarmCandidates ?? [];
  if (explicitCandidates.length > 1) return { status: "unresolved", candidateCount: explicitCandidates.length };
  if (explicitCandidates.length === 1) return { status: "resolved", candidateCount: 1 };
  if (!input.farmText) return { status: "not_requested", candidateCount: 0 };
  if (!input.resolver) return { status: "unresolved", candidateCount: 0 };
  const resolved = input.resolver.resolve(input.farmText);
  if (resolved.kind === "direct") return { status: "resolved", candidateCount: 1 };
  return { status: resolved.kind === "candidates" ? "unresolved" : "unresolved", candidateCount: resolved.candidates?.length ?? 0 };
}

function chineseQuantity(value: string): number | null {
  const simple: Record<string, number> = { 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (/^\d+$/u.test(value)) return Number(value);
  return simple[value] ?? null;
}

function relationQuantityHint(text: string): number | null {
  // A mixed message may mention a new event before the relation target. Read
  // the bounded target phrase first so `又死1隻，前面淘汰兩隻...` resolves to
  // the referenced cull-2 event rather than the new mortality-1 event.
  const marker = text.match(/(?:前面|前一|剛才|刚才|那個|那個|那件|那筆|那笔|同一|不是新增|不是新)/u);
  const targetText = marker?.index === undefined ? text : text.slice(marker.index);
  const match = targetText.match(/(\d+|一|二|兩|两|三|四|五|六|七|八|九|十)\s*(?:隻|只|羽)/u);
  return match ? chineseQuantity(match[1]) : null;
}

function relationEventHint(text: string): AmbientV2EventType | null {
  if (/淘汰/u.test(text)) return "cull";
  if (/(?:死亡|死|少了|少\s*)/u.test(text)) return "mortality";
  return null;
}

export function detectAmbientV2RelationCue(text: string): boolean {
  return /(?:不是新增|不是新的一筆|不是新的一件|不是新一筆|同一(?:筆|件)|前面那筆|前面那件|剛才那筆|剛才那件|重複了|不用再記)/u.test(text);
}

const AMBIENT_V2_RELATION_ONLY_LEAD = /^(?:那個|那筆|那件|前面那|剛才那|刚才那|同一(?:筆|件)|這筆|這件)/u;
const AMBIENT_V2_NEW_EVENT_BEFORE_RELATION = /(?:又|再|另外|新增|多了|少了)[^，,。；;]{0,20}(?:死|死亡|淘汰|少|咳|喘|異常|臭腳|臭脚|腳傷|脚伤)/u;

/**
 * Route before any provider call. This intentionally recognizes only the
 * frozen, explicit relation-only lead and the already frozen mixed-event
 * shape. An unrecognized relation-bearing message remains routable but is
 * not guessed as relation-only.
 */
export function classifyAmbientV2MessageRoute(
  message: AmbientV2MessageInput,
  isSelected = message.selected !== false,
): AmbientV2MessageRoute {
  if (!isSelected) return "NONE";
  const normalized = message.text.normalize("NFKC").trim();
  if (!normalized) return "ROUTING_UNRESOLVED";
  const relationCue = detectAmbientV2RelationCue(normalized);
  if (!relationCue) return "EVENT_ONLY";
  if (AMBIENT_V2_RELATION_ONLY_LEAD.test(normalized)) return "RELATION_ONLY";
  const firstRelationCue = normalized.search(/(?:不是新增|不是新|同一(?:筆|件)|前面那筆|前面那件|剛才那筆|剛才那件|重複了|不用再記)/u);
  const beforeRelation = firstRelationCue >= 0 ? normalized.slice(0, firstRelationCue) : normalized;
  if (AMBIENT_V2_NEW_EVENT_BEFORE_RELATION.test(beforeRelation)) return "MIXED_EVENT_AND_RELATION";
  return "ROUTING_UNRESOLVED";
}

export function resolveAmbientV2Relation(
  text: string,
  candidates: readonly AmbientV2RelationCandidate[],
  scope: { groupKey?: string; contextKey?: string } = {},
): AmbientV2RelationIntent | null {
  if (!detectAmbientV2RelationCue(text)) return null;
  const scoped = candidates.filter((candidate) => {
    if (candidate.pending === false) return false;
    if (candidate.isOfficial) return false;
    if (scope.groupKey && candidate.groupKey !== scope.groupKey) return false;
    if (scope.contextKey && candidate.contextKey !== scope.contextKey) return false;
    return true;
  });
  const quantity = relationQuantityHint(text);
  const event = relationEventHint(text);
  const matching = scoped.filter((candidate) =>
    (quantity === null || candidate.quantity === quantity)
    && (event === null || candidate.event === event),
  );
  // Apply explicit event/quantity cues before the bounded-pool guard. A
  // caller may provide several pending events, while the source itself can
  // safely narrow the relation to one candidate without opening an unbounded
  // historical search.
  const narrowed = quantity !== null || event !== null ? matching : scoped;
  if (narrowed.length === 0 || narrowed.length > 3) {
    return { type: "explicit_duplicate_reference", status: "unresolved", candidateCount: narrowed.length };
  }
  const target = narrowed.length === 1
    ? narrowed[0]
      : null;
  return target
    ? { type: "explicit_duplicate_reference", status: "resolved", targetRef: target.sourceRef, candidateCount: narrowed.length }
    : { type: "explicit_duplicate_reference", status: "unresolved", candidateCount: narrowed.length };
}

export function collapseAmbientV2TechnicalDuplicates(events: readonly AmbientV2SystemEvent[]): {
  events: AmbientV2SystemEvent[];
  collapsedCount: number;
} {
  const seen = new Set<string>();
  const result: AmbientV2SystemEvent[] = [];
  for (const event of events) {
    const key = `${event.sourceIdentity}\u001f${event.eventOrdinal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }
  return { events: result, collapsedCount: events.length - result.length };
}

function emptySchemaForNonAI(): AmbientV2SchemaDiagnostics {
  return {
    ...emptySchemaDiagnostics(),
    structuralFailureCode: null,
    topLevelKeysValid: true,
    eventsIsArray: true,
  };
}

function validateDeterministicProposals(proposals: readonly AmbientV2AiEventProposal[]): AmbientV2ParsedResponse {
  return parseAmbientV2Response(JSON.stringify({
    events: proposals.map((proposal) => ({
      event: proposal.event,
      quantity: proposal.quantity,
      detail: proposal.event === "abnormal" ? proposal.detail ?? null : null,
    })),
  }));
}

function systemEventsFor(
  message: AmbientV2MessageInput,
  proposals: readonly AmbientV2AiEventProposal[],
  contextResolution: AmbientV2ContextResolution,
): AmbientV2SystemEvent[] {
  return proposals.map((proposal, index) => ({
    ...proposal,
    kind: "event" as const,
    sourceRef: message.safeRef,
    sourceIdentity: message.sourceIdentity,
    eventOrdinal: index + 1,
    quantityConfidence: proposal.quantity === null ? "unknown" as const : "observed" as const,
    contextResolution,
    lineageRefs: [message.safeRef],
    ...(message.sourceTimestamp ? { sourceTimestamp: message.sourceTimestamp } : {}),
    ...(message.sourceUser ? { sourceUser: message.sourceUser } : {}),
  }));
}

function selectedSetFor(value: AmbientV2BatchOptions["selectedRefs"], messages: readonly AmbientV2MessageInput[]): Set<string> {
  if (value instanceof Set) return new Set(value);
  if (Array.isArray(value)) return new Set(value);
  return new Set(messages.filter((message) => message.selected !== false).map((message) => message.safeRef));
}

/**
 * Calculate the provider-call shape without invoking an adapter. This is used
 * by the real-smoke gate so its hard budget is derived from the same message
 * selection and deterministic resolver that the execution path will use.
 */
export function planAmbientExtractionV2Batch(options: AmbientV2BatchOptions): AmbientV2ExecutionPlan {
  const selected = selectedSetFor(options.selectedRefs, options.messages);
  const deterministicResolver = options.deterministicResolver ?? ((message: AmbientV2MessageInput) => existingAmbientV2DeterministicFastPath(message.text));
  let deterministicResolved = 0;
  let aiExtractionRequired = 0;
  let noEventFastPath = 0;
  let relationDeterministic = 0;
  for (const message of options.messages) {
    if (!selected.has(message.safeRef)) continue;
    const route = classifyAmbientV2MessageRoute(message, true);
    if (route === "RELATION_ONLY") {
      relationDeterministic += 1;
      continue;
    }
    const deterministic = deterministicResolver(message);
    if (deterministic !== null) {
      deterministicResolved += 1;
      if (deterministic.length === 0) noEventFastPath += 1;
    } else {
      aiExtractionRequired += 1;
    }
    if (detectAmbientV2RelationCue(message.text)) relationDeterministic += 1;
  }
  return {
    messagesTotal: options.messages.length,
    selectedCount: selected.size,
    deterministicResolved,
    aiExtractionRequired,
    relationDeterministic,
    relationAiRequired: 0,
    noEventFastPath,
    expectedProviderCalls: aiExtractionRequired,
  };
}

function technicalFailureResult(
  message: AmbientV2MessageInput,
  contextResolution: AmbientV2ContextResolution,
  relationCueDetected: boolean,
  route: AmbientV2MessageRoute,
): AmbientV2MessageResult {
  const schema = emptySchemaForNonAI();
  return {
    safeRef: message.safeRef,
    route,
    extractionMode: "ai",
    structuralStatus: "fail",
    semanticStatus: "unresolved",
    technicalStatus: "failure",
    events: [],
    contextResolution,
    relationIntent: null,
    diagnostics: {
      extractionMode: "ai",
      route,
      technicalStatus: "failure",
      schema,
      relationCueDetected,
      invalidEventCount: 0,
    },
  };
}

export async function runAmbientExtractionV2Batch(options: AmbientV2BatchOptions): Promise<AmbientV2BatchResult> {
  const selected = selectedSetFor(options.selectedRefs, options.messages);
  const deterministicResolver = options.deterministicResolver ?? ((message: AmbientV2MessageInput) => existingAmbientV2DeterministicFastPath(message.text));
  const messages: AmbientV2MessageResult[] = [];
  const relationIntents: AmbientV2BatchResult["relationIntents"] = [];
  const pending: AmbientV2RelationCandidate[] = [];
  const allEvents: AmbientV2SystemEvent[] = [];
  const metrics: AmbientV2BatchMetrics = {
    messagesTotal: options.messages.length,
    deterministicResolved: 0,
    aiRequired: 0,
    aiCalls: 0,
    relationResolverCalls: 0,
    eventsExtracted: 0,
    messagesUnresolved: 0,
    eventsUnresolved: 0,
    technicalFailures: 0,
    technicalIdempotencyCollapsed: 0,
    tokensIn: null,
    tokensOut: null,
    latencyMs: null,
  };

  for (const message of options.messages) {
    const isSelected = selected.has(message.safeRef);
    const route = classifyAmbientV2MessageRoute(message, isSelected);
    const contextResolution = options.contextResolver?.(message) ?? resolveAmbientV2Context({
      farmText: message.farmText,
      contextFarmCandidates: message.contextFarmCandidates,
    });
    if (!isSelected) {
      messages.push({
        safeRef: message.safeRef,
        route,
        extractionMode: "none",
        structuralStatus: "not_applicable",
        semanticStatus: "none",
        technicalStatus: "not_attempted",
        events: [],
        contextResolution,
        relationIntent: null,
        diagnostics: {
          extractionMode: "none",
          route,
          technicalStatus: "not_attempted",
          schema: emptySchemaForNonAI(),
          relationCueDetected: false,
          invalidEventCount: 0,
        },
      });
      continue;
    }

    const relationCueDetected = detectAmbientV2RelationCue(message.text);
    if (route === "RELATION_ONLY") {
      const relation = resolveAmbientV2Relation(message.text, pending, { groupKey: message.groupKey, contextKey: message.contextKey });
      metrics.relationResolverCalls += 1;
      if (relation) {
        relationIntents.push({ safeRef: message.safeRef, ...(relation.targetRef ? { targetRef: relation.targetRef } : {}), status: relation.status });
      }
      const relationSemanticStatus: AmbientV2SemanticStatus = relation?.status === "resolved" ? "resolved" : "unresolved";
      if (relationSemanticStatus === "unresolved") metrics.messagesUnresolved += 1;
      const schema = emptySchemaForNonAI();
      messages.push({
        safeRef: message.safeRef,
        route,
        extractionMode: "relation",
        structuralStatus: "pass",
        semanticStatus: relationSemanticStatus,
        technicalStatus: "not_attempted",
        events: [],
        contextResolution,
        relationIntent: relation,
        diagnostics: {
          extractionMode: "relation",
          route,
          technicalStatus: "not_attempted",
          schema,
          relationCueDetected: true,
          invalidEventCount: 0,
        },
      });
      continue;
    }
    const deterministic = deterministicResolver(message);
    let parsed: AmbientV2ParsedResponse;
    let extractionMode: AmbientV2ExtractionMode;
    let technicalStatus: AmbientV2TechnicalStatus = "success";
    if (deterministic !== null) {
      metrics.deterministicResolved += 1;
      extractionMode = "deterministic";
      parsed = validateDeterministicProposals(deterministic);
    } else {
      extractionMode = "ai";
      metrics.aiRequired += 1;
      metrics.aiCalls += 1;
      if (!options.adapter) {
        technicalStatus = "failure";
        metrics.technicalFailures += 1;
        const failed = technicalFailureResult(message, contextResolution, relationCueDetected, route);
        messages.push(failed);
        metrics.messagesUnresolved += 1;
        continue;
      }
      try {
        const request = (options.requestBuilder ?? buildAmbientV2Request)(message);
        const response = await options.adapter.run(request, { safeRef: message.safeRef });
        const transport = options.adapter.lastCall;
        if (transport?.promptTokens !== undefined && transport.promptTokens !== null) {
          metrics.tokensIn = (metrics.tokensIn ?? 0) + transport.promptTokens;
        }
        if (transport?.completionTokens !== undefined && transport.completionTokens !== null) {
          metrics.tokensOut = (metrics.tokensOut ?? 0) + transport.completionTokens;
        }
        if (transport?.latencyMs !== undefined && transport.latencyMs !== null) {
          metrics.latencyMs = (metrics.latencyMs ?? 0) + transport.latencyMs;
        }
        parsed = (options.responseParser ?? parseAmbientV2Response)(response);
      } catch {
        technicalStatus = "failure";
        metrics.technicalFailures += 1;
        const failed = technicalFailureResult(message, contextResolution, relationCueDetected, route);
        messages.push(failed);
        metrics.messagesUnresolved += 1;
        continue;
      }
    }

    const events = systemEventsFor(message, parsed.proposals, contextResolution);
    metrics.eventsExtracted += events.length;
    metrics.eventsUnresolved += parsed.diagnostics.invalidEventCount;
    if (parsed.semanticStatus === "unresolved" || parsed.semanticStatus === "partial") metrics.messagesUnresolved += 1;
    const relation = relationCueDetected
      ? resolveAmbientV2Relation(message.text, pending, { groupKey: message.groupKey, contextKey: message.contextKey })
      : null;
    if (relationCueDetected) metrics.relationResolverCalls += 1;
    if (relation) {
      relationIntents.push({ safeRef: message.safeRef, ...(relation.targetRef ? { targetRef: relation.targetRef } : {}), status: relation.status });
    }
    const result: AmbientV2MessageResult = {
      safeRef: message.safeRef,
      route,
      extractionMode,
      structuralStatus: parsed.structuralStatus,
      semanticStatus: parsed.semanticStatus,
      technicalStatus,
      events,
      contextResolution,
      relationIntent: relation,
      diagnostics: {
        extractionMode,
        route,
        technicalStatus,
        schema: parsed.diagnostics,
        relationCueDetected,
        invalidEventCount: parsed.diagnostics.invalidEventCount,
      },
    };
    messages.push(result);
    allEvents.push(...events);
    for (const event of events) {
      pending.push({
        sourceRef: event.sourceRef,
        sourceIdentity: event.sourceIdentity,
        event: event.event,
        quantity: event.quantity,
        ...(message.groupKey ? { groupKey: message.groupKey } : {}),
        ...(message.contextKey ? { contextKey: message.contextKey } : {}),
        pending: true,
        isOfficial: false,
      });
    }
  }

  const collapsed = collapseAmbientV2TechnicalDuplicates(allEvents);
  metrics.technicalIdempotencyCollapsed = collapsed.collapsedCount;
  return {
    messages,
    stagedEvents: collapsed.events,
    relationIntents,
    metrics,
    systemBuildStatus: "pass",
    sideEffectFree: true,
  };
}

function eventSignature(event: AmbientV2AiEventProposal): string {
  return JSON.stringify([event.event, event.quantity, event.detail ?? null]);
}

function accuracy(value: number, expected: number): AmbientV2Accuracy {
  if (expected === 0) return value === 0 ? "PASS" : "FAIL";
  if (value === expected) return "PASS";
  return value > 0 ? "PARTIAL" : "FAIL";
}

function matchingCount(
  actual: readonly AmbientV2AiEventProposal[],
  expected: readonly AmbientV2ExpectedEvent[],
  matcher: (actual: AmbientV2AiEventProposal, expected: AmbientV2ExpectedEvent) => boolean,
): number {
  const remaining = [...actual];
  let count = 0;
  for (const expectedEvent of expected) {
    const index = remaining.findIndex((candidate) => matcher(candidate, expectedEvent));
    if (index < 0) continue;
    count += 1;
    remaining.splice(index, 1);
  }
  return count;
}

export function evaluateAmbientExtractionV2(
  result: AmbientV2BatchResult,
  expectedMessages: readonly AmbientV2ExpectedMessage[],
  selectedRefs: ReadonlySet<string> | readonly string[],
): AmbientV2EvaluationReport {
  const selected = selectedRefs instanceof Set ? selectedRefs : new Set(selectedRefs);
  const byRef = new Map(result.messages.map((message) => [message.safeRef, message]));
  const expectedByRef = new Map(expectedMessages.map((message) => [message.safeRef, message]));
  const actualEvents = result.stagedEvents;
  const expectedEvents = expectedMessages.flatMap((message) => message.events);
  const actualProposals = actualEvents.map(({ event, quantity, detail }) => ({ event, quantity, ...(detail !== undefined ? { detail } : {}) }));
  const typeMatches = matchingCount(actualProposals, expectedEvents, (actual, expected) => actual.event === expected.event);
  const quantityMatches = matchingCount(actualProposals, expectedEvents, (actual, expected) => actual.quantity === expected.quantity);
  const exactMatches = matchingCount(actualProposals, expectedEvents, (actual, expected) => eventSignature(actual) === eventSignature(expected));
  const unknownExpected = expectedEvents.filter((event) => event.quantity === null);
  const unknownMatches = matchingCount(actualProposals, unknownExpected, (actual, expected) => actual.event === expected.event && actual.quantity === null);
  let relationMatches = 0;
  let expectedRelationCount = 0;
  let relationUnexpected = 0;
  for (const expected of expectedMessages) {
    if (expected.relationTargetRef !== undefined && expected.relationTargetRef !== null) {
      expectedRelationCount += 1;
      const actual = byRef.get(expected.safeRef)?.relationIntent;
      if (actual?.status === "resolved" && actual.targetRef === expected.relationTargetRef) relationMatches += 1;
    } else if (byRef.get(expected.safeRef)?.relationIntent) {
      relationUnexpected += 1;
    }
  }
  const missingRefs = expectedMessages.filter((expected) => !byRef.has(expected.safeRef)).length;
  const contextLineageContaminationCount = actualEvents.filter((event) => !selected.has(event.sourceRef)).length;
  const hallucinationCount = Math.max(0, actualProposals.length - exactMatches) + relationUnexpected;
  const expectedDedupeGroups = new Set(expectedMessages
    .filter((message) => message.relationTargetRef)
    .map((message) => message.relationTargetRef));
  const duplicateEventCount = [...expectedDedupeGroups].reduce((count, targetRef) => {
    const target = actualEvents.find((event) => event.sourceRef === targetRef);
    if (!target) return count;
    return count + actualEvents.filter((event) => event.event === target.event && event.quantity === target.quantity && event.sourceRef !== targetRef).length;
  }, 0);
  const selectedResults = result.messages.filter((message) => selected.has(message.safeRef));
  const jsonPass = selectedResults.every((message) => message.structuralStatus === "pass");
  const normalizationPass = jsonPass && selectedResults.every((message) => message.technicalStatus !== "failure");
  const validationPass = normalizationPass && selectedResults.every((message) => message.semanticStatus !== "unresolved" && message.diagnostics.invalidEventCount === 0);
  const expectedContextPass = expectedMessages.every((expected) => {
    if (!expected.contextResolution) return true;
    return byRef.get(expected.safeRef)?.contextResolution.status === expected.contextResolution;
  });
  const systemBuildPass = result.systemBuildStatus === "pass" && result.sideEffectFree && contextLineageContaminationCount === 0;
  const allExpectedEventsMatched = exactMatches === expectedEvents.length && actualProposals.length === expectedEvents.length;
  const allRelationsMatched = relationMatches === expectedRelationCount && result.relationIntents.length === expectedRelationCount;
  const overallPass = jsonPass
    && normalizationPass
    && validationPass
    && systemBuildPass
    && expectedContextPass
    && missingRefs === 0
    && allExpectedEventsMatched
    && allRelationsMatched
    && relationUnexpected === 0
    && duplicateEventCount === 0;
  const decisionCoverage = `${selectedResults.filter((message) => message.semanticStatus === "resolved" || message.semanticStatus === "none").length}/${selected.size}`;
  return {
    messagesTotal: result.metrics.messagesTotal,
    deterministicResolved: result.metrics.deterministicResolved,
    aiRequired: result.metrics.aiRequired,
    aiCalls: result.metrics.aiCalls,
    relationResolverCalls: result.metrics.relationResolverCalls,
    eventsExtracted: result.metrics.eventsExtracted,
    messagesUnresolved: result.metrics.messagesUnresolved,
    eventsUnresolved: result.metrics.eventsUnresolved,
    decisionCoverage,
    missingRefCount: missingRefs,
    unknownRefCount: 0,
    duplicateRefCount: 0,
    eventCount: actualEvents.length,
    relationCount: result.relationIntents.filter((relation) => relation.status === "resolved").length,
    ignoreCount: 0,
    eventTypeAccuracy: accuracy(typeMatches, expectedEvents.length),
    quantityAccuracy: accuracy(quantityMatches, expectedEvents.length),
    unknownQuantityAccuracy: accuracy(unknownMatches, unknownExpected.length),
    supportRelationAccuracy: accuracy(relationMatches, expectedRelationCount),
    hallucinationCount,
    contextLineageContaminationCount,
    duplicateEventCount,
    jsonPass,
    normalizationPass,
    validationPass,
    systemBuildPass,
    evalSideEffectFree: true,
    overallPass,
    result,
  };
}
