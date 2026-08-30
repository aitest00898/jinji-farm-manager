import { ambientMessageMayBeRelevant } from "./ambient";
import { parseQuickItems, type QuickItemDraft } from "./quick-record";
import {
  classifyAmbientV2MessageRoute,
  collapseAmbientV2TechnicalDuplicates,
  detectAmbientV2RelationCue,
  resolveAmbientV2Context,
  resolveAmbientV2Relation,
  type AmbientV2AiRequest,
  type AmbientV2ContextResolution,
  type AmbientV2MessageInput,
  type AmbientV2MessageRoute,
  type AmbientV2RelationCandidate,
  type AmbientV2RelationIntent,
  type AmbientV2SystemEvent,
  type AmbientV2QuantityKind,
} from "./ambient-extraction-v2";

/**
 * V2.2 fact wire. Production V1 remains the controlling path; only the
 * explicit, default-off Shadow may import these pure planner/validation
 * helpers. This module itself does not perform provider calls.
 */
export const AMBIENT_V2_2_WIRE_CONTRACT_VERSION = "2.2" as const;
export const AMBIENT_V2_2_OPERATION_TYPES = ["mortality", "cull"] as const;
export type AmbientV2_2OperationType = (typeof AMBIENT_V2_2_OPERATION_TYPES)[number];

export interface AmbientV2_2OperationProposal {
  type: AmbientV2_2OperationType;
  quantity: number | null;
}

export interface AmbientV2_2AbnormalityProposal {
  detail: string;
  quantity: number | null;
}

export interface AmbientV2_2WireDocument {
  operations: AmbientV2_2OperationProposal[];
  abnormalities: AmbientV2_2AbnormalityProposal[];
}

export type AmbientV2_2StructuralStatus = "pass" | "fail";
export type AmbientV2_2SemanticStatus = "resolved" | "partial" | "unresolved" | "none";
export type AmbientV2_2ResponseClass =
  | "STRUCTURED_OBJECT_RESPONSE"
  | "PROMPT_TEXT_RESPONSE"
  | "PROVIDER_JSON_MODE_ERROR"
  | "OTHER";
export type AmbientV2_2JsonParseStatus = "pass" | "fail" | "not_run";
export type AmbientV2_2ValueType = "object" | "array" | "string" | "number" | "boolean" | "null" | "missing" | "unknown";
export type AmbientV2_2Collection = "operations" | "abnormalities";
export type AmbientV2_2InvalidField = "type" | "quantity" | "detail" | null;

export type AmbientV2_2StructuralSubtype =
  | "INVALID_JSON"
  | "TRUNCATED_JSON"
  | "TOP_LEVEL_NOT_OBJECT"
  | "TOP_LEVEL_UNKNOWN_KEY"
  | "UNEXPECTED_OLD_DECISIONS_SHAPE"
  | "OPERATIONS_MISSING"
  | "OPERATIONS_NOT_ARRAY"
  | "OPERATION_ITEM_NOT_OBJECT"
  | "OPERATION_ITEM_UNKNOWN_KEY"
  | "OPERATION_MISSING_TYPE"
  | "OPERATION_MISSING_QUANTITY"
  | "ABNORMALITIES_MISSING"
  | "ABNORMALITIES_NOT_ARRAY"
  | "ABNORMALITY_ITEM_NOT_OBJECT"
  | "ABNORMALITY_ITEM_UNKNOWN_KEY"
  | "ABNORMALITY_MISSING_DETAIL"
  | "ABNORMALITY_MISSING_QUANTITY"
  | "ABNORMALITY_INVALID_DETAIL_TYPE"
  | "UNEXPECTED_PROVIDER_ENVELOPE"
  | "EMPTY_MODEL_TEXT"
  | "OTHER"
  | "UNKNOWN";

export type AmbientV2_2SemanticFailureCode =
  | "INVALID_OPERATION_TYPE"
  | "INVALID_OPERATION_QUANTITY"
  | "INVALID_ABNORMALITY_QUANTITY"
  | "ABNORMALITY_DETAIL_INVALID"
  | "ABNORMALITY_DETAIL_EMPTY"
  | "ABNORMALITY_DETAIL_NOT_TRIMMED"
  | "ABNORMALITY_DETAIL_TOO_LONG"
  | "MULTIPLE_FACT_ERRORS";

export interface AmbientV2_2FactItemDiagnostic {
  collection: AmbientV2_2Collection;
  ordinal: number;
  eventType: AmbientV2_2OperationType | "abnormality" | "unknown";
  quantityKind: AmbientV2QuantityKind;
  quantityValid: boolean;
  detailPresent: boolean;
  detailValidShort: boolean | null;
  detailCodePointCount: number | null;
  valid: boolean;
  failureSubtype: AmbientV2_2StructuralSubtype | null;
  semanticFailureCode: AmbientV2_2SemanticFailureCode | null;
  firstInvalidField: AmbientV2_2InvalidField;
}

export interface AmbientV2_2SchemaDiagnostics {
  structuralStatus: AmbientV2_2StructuralStatus;
  structuralSubtype: AmbientV2_2StructuralSubtype | null;
  semanticFailureCode: AmbientV2_2SemanticFailureCode | null;
  jsonParseStatus: AmbientV2_2JsonParseStatus;
  topLevelType: AmbientV2_2ValueType;
  topLevelKeys: string[];
  operationsKeyPresent: boolean;
  operationsValueType: AmbientV2_2ValueType;
  abnormalitiesKeyPresent: boolean;
  abnormalitiesValueType: AmbientV2_2ValueType;
  operationItemCount: number | null;
  abnormalityItemCount: number | null;
  firstInvalidCollection: AmbientV2_2Collection | null;
  firstInvalidItemIndex: number | null;
  firstInvalidField: AmbientV2_2InvalidField;
  unknownKeyNames: string[];
  detailCodePointCount: number | null;
  operationValidCount: number;
  abnormalityValidCount: number;
  operationInvalidCount: number;
  abnormalityInvalidCount: number;
  factCount: number;
  validFactCount: number;
  itemDiagnostics: AmbientV2_2FactItemDiagnostic[];
}

export interface AmbientV2_2ParsedResponse {
  structuralStatus: AmbientV2_2StructuralStatus;
  semanticStatus: AmbientV2_2SemanticStatus;
  operations: AmbientV2_2OperationProposal[];
  abnormalities: AmbientV2_2AbnormalityProposal[];
  diagnostics: AmbientV2_2SchemaDiagnostics;
}

export interface AmbientV2_2ResponseBoundaryResult {
  responseClass: AmbientV2_2ResponseClass;
  parsed: AmbientV2_2ParsedResponse;
}

export interface AmbientV2_2PromptAudit {
  fingerprint: string;
  charCount: number;
  canonicalExampleCount: number;
  contractMarkers: "PASS" | "FAIL";
  oldContractMarkersPresent: boolean;
  orthogonalityRulePresent: boolean;
  quantityInheritanceRulePresent: boolean;
  ontologyAlignmentRulePresent: boolean;
}

export interface AmbientV2_2FactSet {
  operations: readonly AmbientV2_2OperationProposal[];
  abnormalities: readonly AmbientV2_2AbnormalityProposal[];
}

export type AmbientV2_2QuantityAttributionStatus = "UNRESOLVED" | "PASS" | "FAIL" | "NOT_EVALUATED";

export interface AmbientV2_2FactEvaluation {
  operationPass: boolean;
  abnormalityPass: boolean;
  factExtractionPass: boolean;
  actualFactCount: number;
  expectedFactCount: number;
  quantityAttributionStatus: AmbientV2_2QuantityAttributionStatus;
}

export interface AmbientV2_2AttributionExpectation {
  /** Quantities are matched to abnormality identities, not array positions. */
  abnormalityQuantities: readonly (number | null)[];
}

export interface AmbientV2_2MessageResult {
  safeRef: string;
  route: AmbientV2MessageRoute;
  semanticStatus: AmbientV2_2SemanticStatus;
  structuralStatus: AmbientV2_2StructuralStatus;
  facts: AmbientV2_2FactSet;
  relationIntent: AmbientV2RelationIntent | null;
  contextResolution: AmbientV2ContextResolution;
}

export interface AmbientV2_2AggregatedFixtureResult {
  messagesTotal: number;
  messagesResolved: number;
  messagesUnresolved: number;
  factsExtracted: number;
  relationCount: number;
  facts: AmbientV2_2FactSet;
  sideEffectFree: true;
}

export interface AmbientV2_2ExecutionPlan {
  messagesTotal: number;
  deterministicResolved: number;
  deterministicClaimed: number;
  aiRequired: number;
  relationOnlyMessages: number;
  relationResolverCalls: number;
  noEventFastPath: number;
  expectedProviderCalls: number;
}

export interface AmbientV2_2DeterministicClaim {
  route: AmbientV2MessageRoute;
  operations: AmbientV2_2OperationProposal[];
  residualMessage: string;
  residualRequiresAi: boolean;
}

export const AMBIENT_V2_2_STRUCTURED_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    operations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: {
            type: "string",
            enum: ["mortality", "cull"],
          },
          quantity: {
            anyOf: [
              { type: "number", exclusiveMinimum: 0 },
              { type: "null" },
            ],
          },
        },
        required: ["type", "quantity"],
      },
    },
    abnormalities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          detail: { type: "string" },
          quantity: {
            anyOf: [
              { type: "number", exclusiveMinimum: 0 },
              { type: "null" },
            ],
          },
        },
        required: ["detail", "quantity"],
      },
    },
  },
  required: ["operations", "abnormalities"],
} as const;

export const AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: AMBIENT_V2_2_STRUCTURED_JSON_SCHEMA,
};

export const AMBIENT_V2_2_ORTHOGONALITY_RULE =
  "同一則訊息若同時包含營運結果與異常狀況，兩者都要保留，分別放入 operations 與 abnormalities，不要合併成同一項。";
export const AMBIENT_V2_2_QUANTITY_INHERITANCE_RULE =
  "abnormality 的 quantity 只有來源訊息直接提供該異常數量時才填數字；不要只因同一則訊息有 operation 數量就自動沿用，否則填 null。";
export const AMBIENT_V2_2_ONTOLOGY_ALIGNMENT_RULE =
  "分類原則：operations 只放已發生的死亡或淘汰結果；明確的「死／死亡／死掉」歸為 mortality，「淘汰」歸為 cull；abnormalities 只放症狀或異常狀況，不要把死亡或淘汰放入 abnormalities；與雞場營運無關的聊天忽略。";

/** This is a new developer-only V2.2 prompt, not a modification of V2.1. */
export const AMBIENT_V2_2_SYSTEM_PROMPT = [
  "只判斷這一則來源訊息的雞場營運事實。",
  "只輸出一個完整 JSON object，唯一 top-level keys 是 operations 與 abnormalities；沒有事實時兩個都輸出空 array。",
  "operations 每項只能有 type 與 quantity；type 只能是 mortality 或 cull；quantity 是正數或 null。",
  "abnormalities 每項只能有 detail 與 quantity；detail 是非空、去除前後空白、12 個 Unicode code points 以內的短症狀名稱；quantity 是正數或 null。",
  AMBIENT_V2_2_ORTHOGONALITY_RULE,
  AMBIENT_V2_2_QUANTITY_INHERITANCE_RULE,
  AMBIENT_V2_2_ONTOLOGY_ALIGNMENT_RULE,
  "不要輸出解釋文字或其他 key。",
].join("\n");

const TOP_LEVEL_KEYS = ["operations", "abnormalities"] as const;
const OPERATION_KEYS = ["type", "quantity"] as const;
const ABNORMALITY_KEYS = ["detail", "quantity"] as const;
const OPERATION_TYPE_SET = new Set<string>(AMBIENT_V2_2_OPERATION_TYPES);
const MAX_QUANTITY = 1_000_000;
const MAX_FACTS_PER_MESSAGE = 32;
const SAFE_KEYS = new Set([
  "operations",
  "abnormalities",
  "events",
  "decisions",
  "type",
  "quantity",
  "detail",
  "kind",
  "ref",
  "targetRef",
  "sourceRef",
  "confidence",
  "quantityConfidence",
  "raw",
  "farm",
  "farmId",
  "house",
  "houseId",
  "flock",
  "flockId",
  "reason",
  "notes",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueType(value: unknown, missing = false): AmbientV2_2ValueType {
  if (missing) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return "unknown";
}

function quantityKind(value: unknown, missing = false): AmbientV2QuantityKind {
  if (missing) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return "unknown";
}

function safeKeys(keys: readonly string[]): string[] {
  return [...new Set(keys.map((key) => SAFE_KEYS.has(key) ? key : "UNKNOWN"))];
}

function validQuantity(value: unknown): value is number | null {
  return value === null
    || (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_QUANTITY);
}

function validDetail(value: string): boolean {
  if (value.length === 0 || value !== value.trim()) return false;
  if (Array.from(value).length > 12) return false;
  return !/[\s。！？?!，,；;:：]/u.test(value);
}

function detailFailureCode(value: string): AmbientV2_2SemanticFailureCode {
  if (value.length === 0) return "ABNORMALITY_DETAIL_EMPTY";
  if (value !== value.trim()) return "ABNORMALITY_DETAIL_NOT_TRIMMED";
  if (Array.from(value).length > 12) return "ABNORMALITY_DETAIL_TOO_LONG";
  return "ABNORMALITY_DETAIL_INVALID";
}

function likelyTruncatedJson(error: unknown, text: string): boolean {
  if (!(error instanceof SyntaxError) || !/unexpected end of JSON input/iu.test(error.message)) return false;
  let inString = false;
  let escaping = false;
  let braces = 0;
  let brackets = 0;
  for (const character of text) {
    if (inString) {
      if (escaping) escaping = false;
      else if (character === "\\") escaping = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") braces += 1;
    else if (character === "}") braces -= 1;
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets -= 1;
    if (braces < 0 || brackets < 0) return false;
  }
  return inString || escaping || braces > 0 || brackets > 0;
}

function emptyDiagnostics(): AmbientV2_2SchemaDiagnostics {
  return {
    structuralStatus: "fail",
    structuralSubtype: null,
    semanticFailureCode: null,
    jsonParseStatus: "not_run",
    topLevelType: "unknown",
    topLevelKeys: [],
    operationsKeyPresent: false,
    operationsValueType: "missing",
    abnormalitiesKeyPresent: false,
    abnormalitiesValueType: "missing",
    operationItemCount: null,
    abnormalityItemCount: null,
    firstInvalidCollection: null,
    firstInvalidItemIndex: null,
    firstInvalidField: null,
    unknownKeyNames: [],
    detailCodePointCount: null,
    operationValidCount: 0,
    abnormalityValidCount: 0,
    operationInvalidCount: 0,
    abnormalityInvalidCount: 0,
    factCount: 0,
    validFactCount: 0,
    itemDiagnostics: [],
  };
}

function structuralFailure(
  subtype: AmbientV2_2StructuralSubtype,
  details: Partial<AmbientV2_2SchemaDiagnostics> = {},
): AmbientV2_2ParsedResponse {
  return {
    structuralStatus: "fail",
    semanticStatus: "unresolved",
    operations: [],
    abnormalities: [],
    diagnostics: {
      ...emptyDiagnostics(),
      ...details,
      structuralStatus: "fail",
      structuralSubtype: subtype,
    },
  };
}

function semanticStatusFor(factCount: number, validFactCount: number): AmbientV2_2SemanticStatus {
  if (factCount === 0) return "none";
  if (validFactCount === factCount) return "resolved";
  return validFactCount > 0 ? "partial" : "unresolved";
}

function exactKeys(keys: readonly string[], allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return keys.every((key) => allowedSet.has(key));
}

function firstMissing(keys: Record<string, unknown>, required: readonly string[]): string | null {
  return required.find((key) => !Object.prototype.hasOwnProperty.call(keys, key)) ?? null;
}

function structuralCheckItems(
  collection: AmbientV2_2Collection,
  values: readonly unknown[],
): { subtype: AmbientV2_2StructuralSubtype; index: number; field: AmbientV2_2InvalidField; unknownKeyNames: string[] } | null {
  const allowed = collection === "operations" ? OPERATION_KEYS : ABNORMALITY_KEYS;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!isRecord(value)) {
      return {
        subtype: collection === "operations" ? "OPERATION_ITEM_NOT_OBJECT" : "ABNORMALITY_ITEM_NOT_OBJECT",
        index,
        field: null,
        unknownKeyNames: [],
      };
    }
    const keys = Object.keys(value);
    const unknownKeyNames = safeKeys(keys.filter((key) => !allowed.includes(key as never)));
    if (!exactKeys(keys, allowed)) {
      return {
        subtype: collection === "operations" ? "OPERATION_ITEM_UNKNOWN_KEY" : "ABNORMALITY_ITEM_UNKNOWN_KEY",
        index,
        field: null,
        unknownKeyNames,
      };
    }
    const missing = firstMissing(value, allowed);
    if (missing === "type") {
      return { subtype: "OPERATION_MISSING_TYPE", index, field: "type", unknownKeyNames: [] };
    }
    if (missing === "detail") {
      return { subtype: "ABNORMALITY_MISSING_DETAIL", index, field: "detail", unknownKeyNames: [] };
    }
    if (missing === "quantity") {
      return {
        subtype: collection === "operations" ? "OPERATION_MISSING_QUANTITY" : "ABNORMALITY_MISSING_QUANTITY",
        index,
        field: "quantity",
        unknownKeyNames: [],
      };
    }
    if (collection === "abnormalities" && typeof value.detail !== "string") {
      return { subtype: "ABNORMALITY_INVALID_DETAIL_TYPE", index, field: "detail", unknownKeyNames: [] };
    }
  }
  return null;
}

function parseAmbientV2_2JsonDocument(parsed: unknown): AmbientV2_2ParsedResponse {
  if (!isRecord(parsed)) {
    return structuralFailure("TOP_LEVEL_NOT_OBJECT", {
      jsonParseStatus: "pass",
      topLevelType: valueType(parsed),
    });
  }

  const topLevelKeys = Object.keys(parsed);
  const topLevelKeysSafe = safeKeys(topLevelKeys);
  const operationsPresent = Object.prototype.hasOwnProperty.call(parsed, "operations");
  const abnormalitiesPresent = Object.prototype.hasOwnProperty.call(parsed, "abnormalities");
  const common = {
    jsonParseStatus: "pass" as const,
    topLevelType: "object" as const,
    topLevelKeys: topLevelKeysSafe,
    operationsKeyPresent: operationsPresent,
    operationsValueType: operationsPresent ? valueType(parsed.operations) : "missing" as const,
    abnormalitiesKeyPresent: abnormalitiesPresent,
    abnormalitiesValueType: abnormalitiesPresent ? valueType(parsed.abnormalities) : "missing" as const,
  };

  const unknownTopLevel = topLevelKeys.filter((key) => !TOP_LEVEL_KEYS.includes(key as (typeof TOP_LEVEL_KEYS)[number]));
  if (unknownTopLevel.length > 0) {
    return structuralFailure(
      Object.prototype.hasOwnProperty.call(parsed, "decisions") && !operationsPresent && !abnormalitiesPresent
        ? "UNEXPECTED_OLD_DECISIONS_SHAPE"
        : "TOP_LEVEL_UNKNOWN_KEY",
      { ...common, unknownKeyNames: safeKeys(unknownTopLevel) },
    );
  }
  if (!operationsPresent) return structuralFailure("OPERATIONS_MISSING", common);
  if (!abnormalitiesPresent) return structuralFailure("ABNORMALITIES_MISSING", common);
  if (!Array.isArray(parsed.operations)) return structuralFailure("OPERATIONS_NOT_ARRAY", common);
  if (!Array.isArray(parsed.abnormalities)) return structuralFailure("ABNORMALITIES_NOT_ARRAY", common);
  if (parsed.operations.length + parsed.abnormalities.length > MAX_FACTS_PER_MESSAGE) {
    return structuralFailure("OTHER", {
      ...common,
      operationItemCount: parsed.operations.length,
      abnormalityItemCount: parsed.abnormalities.length,
      factCount: parsed.operations.length + parsed.abnormalities.length,
    });
  }

  const operationShapeFailure = structuralCheckItems("operations", parsed.operations);
  if (operationShapeFailure) {
    return structuralFailure(operationShapeFailure.subtype, {
      ...common,
      operationItemCount: parsed.operations.length,
      abnormalityItemCount: parsed.abnormalities.length,
      firstInvalidCollection: "operations",
      firstInvalidItemIndex: operationShapeFailure.index,
      firstInvalidField: operationShapeFailure.field,
      unknownKeyNames: operationShapeFailure.unknownKeyNames,
    });
  }
  const abnormalityShapeFailure = structuralCheckItems("abnormalities", parsed.abnormalities);
  if (abnormalityShapeFailure) {
    return structuralFailure(abnormalityShapeFailure.subtype, {
      ...common,
      operationItemCount: parsed.operations.length,
      abnormalityItemCount: parsed.abnormalities.length,
      firstInvalidCollection: "abnormalities",
      firstInvalidItemIndex: abnormalityShapeFailure.index,
      firstInvalidField: abnormalityShapeFailure.field,
      unknownKeyNames: abnormalityShapeFailure.unknownKeyNames,
    });
  }

  const diagnostics: AmbientV2_2SchemaDiagnostics = {
    ...emptyDiagnostics(),
    ...common,
    structuralStatus: "pass",
    structuralSubtype: null,
    operationItemCount: parsed.operations.length,
    abnormalityItemCount: parsed.abnormalities.length,
    factCount: parsed.operations.length + parsed.abnormalities.length,
  };
  const operations: AmbientV2_2OperationProposal[] = [];
  const abnormalities: AmbientV2_2AbnormalityProposal[] = [];

  parsed.operations.forEach((value, index) => {
    const type = value.type;
    const quantity = value.quantity;
    const typeValid = typeof type === "string" && OPERATION_TYPE_SET.has(type);
    const quantityValid = validQuantity(quantity);
    const valid = typeValid && quantityValid;
    const failureCode: AmbientV2_2SemanticFailureCode | null = !typeValid
      ? "INVALID_OPERATION_TYPE"
      : !quantityValid
        ? "INVALID_OPERATION_QUANTITY"
        : null;
    const diagnostic: AmbientV2_2FactItemDiagnostic = {
      collection: "operations",
      ordinal: index + 1,
      eventType: typeValid ? type as AmbientV2_2OperationType : "unknown",
      quantityKind: quantityKind(quantity),
      quantityValid,
      detailPresent: false,
      detailValidShort: null,
      detailCodePointCount: null,
      valid,
      failureSubtype: null,
      semanticFailureCode: failureCode,
      firstInvalidField: !typeValid ? "type" : !quantityValid ? "quantity" : null,
    };
    diagnostics.itemDiagnostics.push(diagnostic);
    if (valid) {
      diagnostics.operationValidCount += 1;
      operations.push({ type: type as AmbientV2_2OperationType, quantity: quantity as number | null });
    } else {
      diagnostics.operationInvalidCount += 1;
      diagnostics.firstInvalidCollection ??= "operations";
      diagnostics.firstInvalidItemIndex ??= index;
      diagnostics.firstInvalidField ??= diagnostic.firstInvalidField;
    }
  });

  parsed.abnormalities.forEach((value, index) => {
    const detail = value.detail as string;
    const quantity = value.quantity;
    const detailCodePointCount = Array.from(detail).length;
    const detailValidShort = validDetail(detail);
    const quantityValid = validQuantity(quantity);
    const valid = detailValidShort && quantityValid;
    const failureCode: AmbientV2_2SemanticFailureCode | null = !quantityValid
      ? "INVALID_ABNORMALITY_QUANTITY"
      : !detailValidShort
        ? detailFailureCode(detail)
        : null;
    const diagnostic: AmbientV2_2FactItemDiagnostic = {
      collection: "abnormalities",
      ordinal: index + 1,
      eventType: "abnormality",
      quantityKind: quantityKind(quantity),
      quantityValid,
      detailPresent: true,
      detailValidShort,
      detailCodePointCount,
      valid,
      failureSubtype: null,
      semanticFailureCode: failureCode,
      firstInvalidField: !quantityValid ? "quantity" : !detailValidShort ? "detail" : null,
    };
    diagnostics.itemDiagnostics.push(diagnostic);
    diagnostics.detailCodePointCount ??= detailCodePointCount;
    if (valid) {
      diagnostics.abnormalityValidCount += 1;
      abnormalities.push({ detail, quantity: quantity as number | null });
    } else {
      diagnostics.abnormalityInvalidCount += 1;
      diagnostics.firstInvalidCollection ??= "abnormalities";
      diagnostics.firstInvalidItemIndex ??= index;
      diagnostics.firstInvalidField ??= diagnostic.firstInvalidField;
    }
  });

  diagnostics.validFactCount = diagnostics.operationValidCount + diagnostics.abnormalityValidCount;
  const invalidCodes = diagnostics.itemDiagnostics
    .filter((item) => item.semanticFailureCode !== null)
    .map((item) => item.semanticFailureCode as AmbientV2_2SemanticFailureCode);
  diagnostics.semanticFailureCode = invalidCodes.length === 0
    ? null
    : invalidCodes.length > 1
      ? "MULTIPLE_FACT_ERRORS"
      : invalidCodes[0];
  return {
    structuralStatus: "pass",
    semanticStatus: semanticStatusFor(diagnostics.factCount, diagnostics.validFactCount),
    operations,
    abnormalities,
    diagnostics,
  };
}

function parseTextResponse(text: string): AmbientV2_2ParsedResponse {
  if (!text.trim()) return structuralFailure("EMPTY_MODEL_TEXT", { jsonParseStatus: "fail" });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch (error) {
    return structuralFailure(likelyTruncatedJson(error, text.trim()) ? "TRUNCATED_JSON" : "INVALID_JSON", {
      jsonParseStatus: "fail",
    });
  }
  return parseAmbientV2_2JsonDocument(parsed);
}

/** Strict text parser. It never repairs, closes, strips, or salvages JSON. */
export function parseAmbientV2_2Response(value: unknown): AmbientV2_2ParsedResponse {
  if (typeof value === "string") return parseTextResponse(value);
  if (isRecord(value) && typeof value.response === "string") return parseTextResponse(value.response);
  return structuralFailure("UNEXPECTED_PROVIDER_ENVELOPE");
}

/**
 * Provider boundary for V2.2. A structured object is validated as an object;
 * it is never stringified and sent through the text parser.
 */
export function parseAmbientV2_2ResponseBoundary(value: unknown): AmbientV2_2ResponseBoundaryResult {
  if (isRecord(value) && (value.success === false || Array.isArray(value.errors))) {
    return {
      responseClass: "PROVIDER_JSON_MODE_ERROR",
      parsed: structuralFailure("UNEXPECTED_PROVIDER_ENVELOPE"),
    };
  }

  const nestedResponsePresent = isRecord(value) && (
    (isRecord(value.result) && Object.prototype.hasOwnProperty.call(value.result, "response"))
    || Object.prototype.hasOwnProperty.call(value, "response")
  );
  const candidate = isRecord(value) && isRecord(value.result) && Object.prototype.hasOwnProperty.call(value.result, "response")
    ? value.result.response
    : isRecord(value) && Object.prototype.hasOwnProperty.call(value, "response")
      ? value.response
      : value;
  if (typeof candidate === "string") {
    return { responseClass: "PROMPT_TEXT_RESPONSE", parsed: parseTextResponse(candidate) };
  }
  if (isRecord(candidate) && (nestedResponsePresent
    || Object.prototype.hasOwnProperty.call(candidate, "operations")
    || Object.prototype.hasOwnProperty.call(candidate, "abnormalities")
    || Object.prototype.hasOwnProperty.call(candidate, "decisions"))) {
    return { responseClass: "STRUCTURED_OBJECT_RESPONSE", parsed: parseAmbientV2_2JsonDocument(candidate) };
  }
  if (isRecord(value) && (Object.prototype.hasOwnProperty.call(value, "result")
    || Object.prototype.hasOwnProperty.call(value, "response"))) {
    return {
      responseClass: "OTHER",
      parsed: structuralFailure("UNEXPECTED_PROVIDER_ENVELOPE"),
    };
  }
  return { responseClass: "OTHER", parsed: structuralFailure("UNKNOWN") };
}

/** Safe request metadata builder for a future developer-only provider gate. */
export function buildAmbientV2_2StructuredRequest(message: AmbientV2MessageInput): AmbientV2AiRequest {
  return {
    messages: [
      { role: "system", content: AMBIENT_V2_2_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({ source: message.text }) },
    ],
    response_format: AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT,
  };
}

function promptFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** Returns only bounded metadata; it never returns prompt content. */
export function auditAmbientV2_2PromptContract(prompt = AMBIENT_V2_2_SYSTEM_PROMPT): AmbientV2_2PromptAudit {
  const oldContractMarkersPresent = /(?:decisions|events|kind|targetRef|sourceRef|confidence|raw)/u.test(prompt);
  const orthogonalityRulePresent = prompt.includes(AMBIENT_V2_2_ORTHOGONALITY_RULE);
  const quantityInheritanceRulePresent = prompt.includes(AMBIENT_V2_2_QUANTITY_INHERITANCE_RULE);
  const ontologyAlignmentRulePresent = prompt.includes(AMBIENT_V2_2_ONTOLOGY_ALIGNMENT_RULE);
  const contractMarkers = prompt.includes("operations")
    && prompt.includes("abnormalities")
    && prompt.includes("type")
    && prompt.includes("quantity")
    && prompt.includes("detail")
    && orthogonalityRulePresent
    && quantityInheritanceRulePresent
    && ontologyAlignmentRulePresent
    && !oldContractMarkersPresent;
  return {
    fingerprint: promptFingerprint(prompt),
    charCount: prompt.length,
    canonicalExampleCount: 0,
    contractMarkers: contractMarkers ? "PASS" : "FAIL",
    oldContractMarkersPresent,
    orthogonalityRulePresent,
    quantityInheritanceRulePresent,
    ontologyAlignmentRulePresent,
  };
}

/** Convert validated V2.2 facts into the existing internal system event shape. */
export function canonicalizeAmbientV2_2Facts(
  message: AmbientV2MessageInput,
  parsed: AmbientV2_2ParsedResponse,
  contextResolution: AmbientV2ContextResolution = resolveAmbientV2Context({
    farmText: message.farmText,
    contextFarmCandidates: message.contextFarmCandidates,
  }),
): AmbientV2SystemEvent[] {
  if (parsed.structuralStatus !== "pass") return [];
  const proposals = [
    ...parsed.operations.map((operation) => ({ event: operation.type, quantity: operation.quantity })),
    ...parsed.abnormalities.map((abnormality) => ({ event: "abnormal" as const, quantity: abnormality.quantity, detail: abnormality.detail })),
  ];
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

function operationEqual(left: AmbientV2_2OperationProposal, right: AmbientV2_2OperationProposal): boolean {
  return left.type === right.type && left.quantity === right.quantity;
}

function abnormalityIdentityEqual(left: AmbientV2_2AbnormalityProposal, right: AmbientV2_2AbnormalityProposal): boolean {
  return left.detail === right.detail;
}

function multisetEqual<T>(actual: readonly T[], expected: readonly T[], equal: (left: T, right: T) => boolean): boolean {
  if (actual.length !== expected.length) return false;
  const remaining = [...actual];
  for (const expectedItem of expected) {
    const matchIndex = remaining.findIndex((actualItem) => equal(actualItem, expectedItem));
    if (matchIndex < 0) return false;
    remaining.splice(matchIndex, 1);
  }
  return remaining.length === 0;
}

export function factsFromAmbientV2_2Parsed(parsed: AmbientV2_2ParsedResponse): AmbientV2_2FactSet {
  return { operations: parsed.operations, abnormalities: parsed.abnormalities };
}

export function evaluateAmbientV2_2Facts(
  actual: AmbientV2_2FactSet | AmbientV2_2ParsedResponse,
  expected: AmbientV2_2FactSet,
  attribution: AmbientV2_2AttributionExpectation | AmbientV2_2QuantityAttributionStatus = "UNRESOLVED",
): AmbientV2_2FactEvaluation {
  const actualFacts = "diagnostics" in actual ? factsFromAmbientV2_2Parsed(actual) : actual;
  const operationPass = multisetEqual(actualFacts.operations, expected.operations, operationEqual);
  const abnormalityPass = multisetEqual(actualFacts.abnormalities, expected.abnormalities, abnormalityIdentityEqual);
  const actualFactCount = actualFacts.operations.length + actualFacts.abnormalities.length;
  const expectedFactCount = expected.operations.length + expected.abnormalities.length;
  const factExtractionPass = operationPass && abnormalityPass;
  const quantityAttributionStatus = typeof attribution === "string"
    ? attribution
    : evaluateAmbientV2_2QuantityAttribution(actualFacts, expected, attribution, factExtractionPass);
  return {
    operationPass,
    abnormalityPass,
    factExtractionPass,
    actualFactCount,
    expectedFactCount,
    quantityAttributionStatus,
  };
}

function matchAbnormalityByIdentity(
  actual: readonly AmbientV2_2AbnormalityProposal[],
  expected: readonly AmbientV2_2AbnormalityProposal[],
): AmbientV2_2AbnormalityProposal[] | null {
  const remaining = [...actual];
  const matched: AmbientV2_2AbnormalityProposal[] = [];
  for (const expectedItem of expected) {
    const index = remaining.findIndex((actualItem) => actualItem.detail === expectedItem.detail);
    if (index < 0) return null;
    matched.push(remaining[index]);
    remaining.splice(index, 1);
  }
  return remaining.length === 0 ? matched : null;
}

/** Compare cross-fact quantity only when a caller supplies that policy. */
export function evaluateAmbientV2_2QuantityAttribution(
  actual: AmbientV2_2FactSet,
  expectedFacts: AmbientV2_2FactSet,
  expectation: AmbientV2_2AttributionExpectation,
  factExtractionPass = true,
): AmbientV2_2QuantityAttributionStatus {
  if (!factExtractionPass) return "NOT_EVALUATED";
  if (expectation.abnormalityQuantities.length !== expectedFacts.abnormalities.length) return "FAIL";
  const matched = matchAbnormalityByIdentity(actual.abnormalities, expectedFacts.abnormalities);
  if (matched === null) return "NOT_EVALUATED";
  if (expectation.abnormalityQuantities.some((quantity) => quantity === null)) return "UNRESOLVED";
  if (matched.some((abnormality, index) => abnormality.quantity === null)) return "UNRESOLVED";
  return matched.every((abnormality, index) => abnormality.quantity === expectation.abnormalityQuantities[index])
    ? "PASS"
    : "FAIL";
}

export function classifyAmbientV2_2MessageRoute(
  message: AmbientV2MessageInput,
  isSelected = message.selected !== false,
): AmbientV2MessageRoute {
  return classifyAmbientV2MessageRoute(message, isSelected);
}

export function shouldUseAmbientV2_2FactExtraction(route: AmbientV2MessageRoute): boolean {
  return route === "EVENT_ONLY" || route === "MIXED_EVENT_AND_RELATION";
}

const AMBIENT_V2_2_SAFE_CLAUSE_BOUNDARY = /[，,。\n]/u;
const AMBIENT_V2_2_EXPLICIT_NEGATION = /(?:沒有|沒|不是|非|不要|不用)/u;

function operationVerbPattern(intent: "mortality" | "cull"): string {
  return intent === "mortality"
    ? "(?:死亡|死了|死掉|死|掛了|掛)"
    : "(?:淘汰|抓掉|抓走)";
}

/**
 * Narrow safety guard for the existing quick-record parser. The production
 * parser already rejects negated mortality, but its cull matcher is broader;
 * V2.2 must not claim an explicitly negated cull as a new event.
 */
function isExplicitlyNegatedOperation(clause: string, intent: "mortality" | "cull"): boolean {
  if (!AMBIENT_V2_2_EXPLICIT_NEGATION.test(clause)) return false;
  const verb = operationVerbPattern(intent);
  return new RegExp(`(?:沒有|沒|不是|非|不要|不用)[^，,。\\n]{0,12}${verb}`, "u").test(clause);
}

function claimableOperation(item: QuickItemDraft): item is QuickItemDraft & {
  intent: "mortality" | "cull";
  quantity: number;
} {
  return item.itemType === "operational"
    && (item.intent === "mortality" || item.intent === "cull")
    && typeof item.quantity === "number"
    && Number.isInteger(item.quantity)
    && item.quantity > 0;
}

function residualTextFrom(parts: readonly string[]): string {
  return parts
    .map((part) => part.normalize("NFKC").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

function isContextOnlyClause(value: string): boolean {
  const compact = value.normalize("NFKC").replace(/\s+/gu, "").trim();
  return /^(?:[\p{Script=Han}A-Za-z0-9_-]{1,24}(?:場|场|舍)(?:今天|今日|昨天|昨晚|早上|上午|下午|晚上|剛剛|刚刚|又|有|了|那邊|那边|這邊|这边)*)$/u.test(compact);
}

/**
 * Reuse the existing high-confidence quick-record parser at safe clause
 * granularity. This only claims mortality/cull operation items. Non-operation
 * parser output and residual text remain in memory as the bounded AI fallback
 * input; no source text is persisted by this helper.
 */
export function claimAmbientV2_2DeterministicOperations(
  message: AmbientV2MessageInput,
): AmbientV2_2DeterministicClaim {
  const route = classifyAmbientV2MessageRoute(message, message.selected !== false);
  if (route === "NONE" || route === "RELATION_ONLY") {
    return { route, operations: [], residualMessage: "", residualRequiresAi: false };
  }
  if (route === "ROUTING_UNRESOLVED") {
    // A zero-claim fallback must preserve the exact trusted source text for
    // the model-visible input. Normalization belongs to routing, not to an
    // AI fallback payload when deterministic extraction claimed nothing.
    const residualMessage = message.text;
    return {
      route,
      operations: [],
      residualMessage,
      residualRequiresAi: Boolean(residualMessage.trim()) && ambientMessageMayBeRelevant(residualMessage),
    };
  }

  const receivedAt = message.sourceTimestamp ?? "1970-01-01T00:00:00.000Z";
  const operations: AmbientV2_2OperationProposal[] = [];
  const residualParts: string[] = [];
  const residualChunks: Array<{ text: string; clauseIndex: number }> = [];
  const clauses = message.text
    .normalize("NFKC")
    .split(AMBIENT_V2_2_SAFE_CLAUSE_BOUNDARY)
    .map((clause) => clause.trim())
    .filter(Boolean);

  clauses.forEach((clause, clauseIndex) => {
    const parsed = parseQuickItems(clause, receivedAt);
    const relationBearingClause = detectAmbientV2RelationCue(clause);
    const claimedItems = new Set<QuickItemDraft>();
    if (!relationBearingClause) {
      for (const item of parsed.items) {
        if (!claimableOperation(item)) continue;
        if (isExplicitlyNegatedOperation(clause, item.intent)) continue;
        operations.push({ type: item.intent, quantity: item.quantity });
        claimedItems.add(item);
      }
    }

    if (relationBearingClause) {
      // Preserve relation wording for the existing relation path; never claim
      // a referenced operation as a fresh deterministic event.
      residualParts.push(clause);
      residualChunks.push({ text: clause, clauseIndex });
      return;
    }
    for (const item of parsed.items) {
      if (!claimedItems.has(item)) {
        residualParts.push(item.rawText);
        residualChunks.push({ text: item.rawText, clauseIndex });
      }
    }
    if (parsed.remainder.trim()) {
      residualParts.push(parsed.remainder);
      residualChunks.push({ text: parsed.remainder, clauseIndex });
    }
  });

  const residualMessage = residualTextFrom(residualParts);
  const firstClaimedClauseIndex = clauses.findIndex((clause) => {
    const parsed = parseQuickItems(clause, receivedAt);
    if (detectAmbientV2RelationCue(clause)) return false;
    return parsed.items.some((item) => claimableOperation(item) && !isExplicitlyNegatedOperation(clause, item.intent));
  });
  const residualRequiresAi = residualChunks.some((chunk) =>
    ambientMessageMayBeRelevant(chunk.text)
    || (firstClaimedClauseIndex >= 0
      && chunk.clauseIndex > firstClaimedClauseIndex
      && !isContextOnlyClause(chunk.text)),
  );
  if (operations.length === 0) {
    // Do not send a clause-split/reconstructed residual when the deterministic
    // layer made no claim. The AI fallback sees the original full message.
    return {
      route,
      operations,
      residualMessage: message.text,
      residualRequiresAi: Boolean(message.text.trim()) && ambientMessageMayBeRelevant(message.text),
    };
  }
  return {
    route,
    operations,
    residualMessage,
    residualRequiresAi: Boolean(residualMessage) && residualRequiresAi,
  };
}

export function planAmbientExtractionV2_2(
  messages: readonly AmbientV2MessageInput[],
  selectedRefs?: ReadonlySet<string> | readonly string[],
): AmbientV2_2ExecutionPlan {
  const selected = selectedRefs instanceof Set
    ? selectedRefs
    : new Set(selectedRefs ?? messages.filter((message) => message.selected !== false).map((message) => message.safeRef));
  let deterministicResolved = 0;
  let deterministicClaimed = 0;
  let aiRequired = 0;
  let relationOnlyMessages = 0;
  let relationResolverCalls = 0;
  let noEventFastPath = 0;
  for (const message of messages) {
    if (!selected.has(message.safeRef)) continue;
    const route = classifyAmbientV2_2MessageRoute(message, true);
    if (route === "RELATION_ONLY") {
      relationOnlyMessages += 1;
      relationResolverCalls += 1;
      continue;
    }
    const claim = claimAmbientV2_2DeterministicOperations(message);
    if (claim.operations.length > 0) deterministicClaimed += 1;
    if (claim.residualRequiresAi) {
      aiRequired += 1;
    } else {
      deterministicResolved += 1;
      if (claim.operations.length === 0) noEventFastPath += 1;
    }
    if (detectAmbientV2RelationCue(message.text)) relationResolverCalls += 1;
  }
  return {
    messagesTotal: messages.length,
    deterministicResolved,
    deterministicClaimed,
    aiRequired,
    relationOnlyMessages,
    relationResolverCalls,
    noEventFastPath,
    expectedProviderCalls: aiRequired,
  };
}

export function resolveAmbientV2_2Relation(
  text: string,
  candidates: readonly AmbientV2RelationCandidate[],
  scope: { groupKey?: string; contextKey?: string } = {},
): AmbientV2RelationIntent | null {
  return resolveAmbientV2Relation(text, candidates, scope);
}

export function resolveAmbientV2_2Context(input: {
  farmText?: string | null;
  contextFarmCandidates?: readonly string[];
  resolver?: Parameters<typeof resolveAmbientV2Context>[0]["resolver"];
}): AmbientV2ContextResolution {
  return resolveAmbientV2Context(input);
}

export function collapseAmbientV2_2TechnicalDuplicates(events: readonly AmbientV2SystemEvent[]): {
  events: AmbientV2SystemEvent[];
  collapsedCount: number;
} {
  return collapseAmbientV2TechnicalDuplicates(events);
}

export function aggregateAmbientV2_2MessageResults(
  results: readonly AmbientV2_2MessageResult[],
): AmbientV2_2AggregatedFixtureResult {
  const resolved = results.filter((result) => result.semanticStatus === "resolved" || result.semanticStatus === "none");
  const unresolved = results.length - resolved.length;
  const facts: AmbientV2_2FactSet = {
    operations: results.flatMap((result) => [...result.facts.operations]),
    abnormalities: results.flatMap((result) => [...result.facts.abnormalities]),
  };
  return {
    messagesTotal: results.length,
    messagesResolved: resolved.length,
    messagesUnresolved: unresolved,
    factsExtracted: facts.operations.length + facts.abnormalities.length,
    relationCount: results.filter((result) => result.relationIntent?.status === "resolved").length,
    facts,
    sideEffectFree: true,
  };
}
