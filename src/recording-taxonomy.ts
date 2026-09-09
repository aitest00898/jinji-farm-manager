/**
 * Canonical recording vocabulary shared by the Production domain, LINE
 * extraction, Ambient candidates, Web Lab alignment, and future analytics.
 *
 * This module is deliberately side-effect free. It never writes D1, enqueues
 * a Queue message, calls Workers AI, or authorizes an official record.
 */

export const RECORDING_FAMILIES = [
  "operational_event",
  "operational_observation",
  "operational_action",
] as const;
export type RecordingFamily = (typeof RECORDING_FAMILIES)[number];

export const RECORDING_SOURCE_CHANNELS = ["line", "web", "ambient", "system"] as const;
export type RecordingSourceChannel = (typeof RECORDING_SOURCE_CHANNELS)[number];

export const TAXONOMY_IDS = [
  "O1", "O2", "O3", "O4", "O5", "O6", "O7", "O8", "O9",
  "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8",
  "A9", "A10", "A11", "A12", "A13", "A14", "A15", "A16",
] as const;
export type TaxonomyId = (typeof TAXONOMY_IDS)[number];

export const RECORDING_SEXES = ["male", "female", "mixed", "unspecified"] as const;
export type RecordingSex = (typeof RECORDING_SEXES)[number];

export const OBSERVATION_EXTENTS = ["small", "medium", "large"] as const;
export type ObservationExtent = (typeof OBSERVATION_EXTENTS)[number];

export const O6_STATUSES = ["waiting_result", "completed"] as const;
export type O6Status = (typeof O6_STATUSES)[number];

export const ACTION_COMPLETION_STATUSES = ["pending", "completed"] as const;
export type ActionCompletionStatus = (typeof ACTION_COMPLETION_STATUSES)[number];

export const RECORD_LIFECYCLE_STATES = ["active", "reversed", "corrected", "replacement"] as const;
export type RecordLifecycleState = (typeof RECORD_LIFECYCLE_STATES)[number];

export const ACTION_WORKFLOW_STATES = ["pending", "waiting_result", "completed"] as const;
export type ActionWorkflowState = (typeof ACTION_WORKFLOW_STATES)[number];

export const WEIGHT_UNITS = ["kg", "bag"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export type StockEffect = -1 | 0 | 1;
export type TodoEffect = "none" | "follow_up";
export type CalendarEffect = "none" | "show" | "reminder";

export interface TaxonomyDefinition {
  id: TaxonomyId;
  label: string;
  family: RecordingFamily;
  canonicalType: string;
  canonicalSubtypes: readonly string[];
  requiredFields: readonly string[];
  optionalFields: readonly string[];
  derivedFields: readonly string[];
  stockEffect: StockEffect;
  todoEffect: TodoEffect;
  calendarEffect: CalendarEffect;
  webTarget: string;
  lineTarget: string;
  ambientTarget: string;
}

const definition = (
  id: TaxonomyId,
  label: string,
  family: RecordingFamily,
  canonicalType: string,
  canonicalSubtypes: readonly string[],
  requiredFields: readonly string[],
  optionalFields: readonly string[],
  derivedFields: readonly string[],
  stockEffect: StockEffect,
  todoEffect: TodoEffect,
  calendarEffect: CalendarEffect,
  webTarget: string,
  lineTarget: string,
  ambientTarget: string,
): TaxonomyDefinition => Object.freeze({
  id,
  label,
  family,
  canonicalType,
  canonicalSubtypes: Object.freeze([...canonicalSubtypes]),
  requiredFields: Object.freeze([...requiredFields]),
  optionalFields: Object.freeze([...optionalFields]),
  derivedFields: Object.freeze([...derivedFields]),
  stockEffect,
  todoEffect,
  calendarEffect,
  webTarget,
  lineTarget,
  ambientTarget,
});

export const RECORDING_TAXONOMY: readonly TaxonomyDefinition[] = Object.freeze([
  definition("O1", "入雛", "operational_event", "event", ["chick_in"], ["houseId", "flockId", "maleCount", "femaleCount", "condition"], [], ["totalCount"], 1, "none", "show", "flock_guided", "manual_candidate", "future_bounded"),
  definition("O2", "疫苗／用藥／補充品", "operational_action", "action", ["vaccination", "medication", "supplement"], ["content"], ["houseId", "flockId"], [], 0, "none", "show", "guided_action", "manual_candidate", "future_bounded"),
  definition("O3", "出雞", "operational_event", "event", ["shipment"], ["quantity", "sex"], ["houseId", "flockId", "totalWeight"], ["averageWeight"], -1, "none", "show", "shipment", "manual_candidate", "future_bounded"),
  definition("O4", "磅重", "operational_event", "event", ["weigh"], ["houseId", "flockId", "averageWeight", "sex"], ["chickInDate"], ["ageDays"], 0, "none", "show", "weighing", "manual_candidate", "future_bounded"),
  definition("O5", "叫飼料", "operational_action", "action", ["feed_order"], ["vendor", "weight", "weightUnit"], ["houseId"], [], 0, "none", "show", "feed_order", "manual_candidate", "future_bounded"),
  definition("O6", "送驗", "operational_action", "action", ["lab_test"], ["submittedAt", "content", "workflowStatus"], ["houseId", "flockId", "result", "completedAt"], ["reminderDueAt"], 0, "follow_up", "reminder", "lab_test", "manual_candidate", "future_bounded"),
  definition("O7", "清消", "operational_action", "action", ["disinfection"], ["workflowStatus"], ["houseId", "flockId"], [], 0, "follow_up", "show", "disinfection", "manual_candidate", "future_bounded"),
  definition("O8", "設備維護", "operational_action", "action", ["maintenance"], ["maintenanceContent"], ["houseId"], [], 0, "follow_up", "show", "maintenance", "manual_candidate", "future_bounded"),
  definition("O9", "死亡／淘汰", "operational_event", "event", ["mortality", "cull"], ["quantity"], ["houseId", "flockId", "sex"], [], -1, "none", "show", "existing_quick_record", "existing_manual_candidate", "current_v1"),
  definition("A1", "死亡異常", "operational_observation", "observation", ["mortality_abnormality"], ["extent", "linkedMortalityEventId"], ["houseId", "flockId", "detail"], [], 0, "follow_up", "show", "observation", "observation_candidate", "current_coarse"),
  definition("A2", "咳嗽", "operational_observation", "observation", ["cough"], ["extent"], ["houseId", "flockId", "detail"], [], 0, "follow_up", "show", "observation", "observation_candidate", "current_coarse"),
  definition("A3", "喘／呼吸困難", "operational_observation", "observation", ["respiratory_distress"], ["extent"], ["houseId", "flockId", "detail"], [], 0, "follow_up", "show", "observation", "observation_candidate", "current_coarse"),
  definition("A4", "精神不振／活動下降", "operational_observation", "observation", ["activity_down"], ["extent"], ["houseId", "flockId", "detail"], [], 0, "follow_up", "show", "observation", "observation_candidate", "current_coarse"),
  definition("A5", "外觀", "operational_observation", "observation", ["eye_swelling", "white_crown", "purple_crown", "black_crown"], ["extent"], ["houseId", "flockId", "detail"], [], 0, "follow_up", "show", "observation", "observation_candidate", "future_subtype"),
  definition("A6", "下痢", "operational_observation", "observation", ["watery", "white", "green", "bloody"], ["extent"], ["houseId", "flockId", "detail"], [], 0, "follow_up", "show", "observation", "observation_candidate", "future_subtype"),
  definition("A7", "生長遲緩", "operational_observation", "observation", ["growth_delay"], ["extent"], ["houseId", "flockId", "detail"], [], 0, "follow_up", "show", "observation", "observation_candidate", "future_bounded"),
  definition("A8", "臭腳", "operational_observation", "observation", ["foot_odor"], ["extent"], ["houseId", "flockId", "detail"], [], 0, "follow_up", "show", "observation", "observation_candidate", "current_coarse"),
  definition("A9", "發燒", "operational_observation", "observation", ["fever"], ["extent"], ["houseId", "flockId", "measuredTemperature", "detail"], [], 0, "follow_up", "show", "observation", "observation_candidate", "future_bounded"),
  definition("A10", "緊迫", "operational_observation", "observation", ["heat_stress", "catching_stress"], ["extent"], ["houseId", "flockId", "detail"], [], 0, "follow_up", "show", "observation", "observation_candidate", "future_subtype"),
  definition("A11", "採食／飲水異常", "operational_observation", "observation", ["feeding_abnormality", "water_abnormality"], ["extent"], ["houseId", "flockId", "measurement", "detail"], [], 0, "follow_up", "show", "observation", "observation_candidate", "current_coarse"),
  definition("A12", "設備異常", "operational_observation", "observation", ["feed", "water", "electricity", "fan", "cooling", "heating", "other"], ["extent"], ["houseId", "flockId", "detail"], [], 0, "follow_up", "show", "observation", "observation_candidate", "current_coarse"),
  definition("A13", "天候異常", "operational_observation", "observation", ["high_temperature", "low_temperature", "heavy_rain"], ["extent"], ["houseId", "flockId", "measurement"], [], 0, "follow_up", "show", "observation", "observation_candidate", "current_coarse"),
  definition("A14", "淹水", "operational_observation", "observation", ["flooding"], ["extent"], ["houseId", "flockId", "detail"], [], 0, "follow_up", "show", "observation", "observation_candidate", "current_coarse"),
  definition("A15", "異味", "operational_observation", "observation", ["odor"], ["extent"], ["houseId", "flockId", "detail"], [], 0, "follow_up", "show", "observation", "observation_candidate", "current_coarse"),
  definition("A16", "場地事件", "operational_observation", "observation", ["attack", "infection", "spread"], ["extent"], ["houseId", "flockId", "detail", "evidence"], [], 0, "follow_up", "show", "observation", "observation_candidate", "future_subtype"),
]);

const TAXONOMY_BY_ID = new Map<TaxonomyId, TaxonomyDefinition>(
  RECORDING_TAXONOMY.map((item) => [item.id, item]),
);

export interface RecordingTaxonomyContractRow {
  id: TaxonomyId;
  family: RecordingFamily;
  canonicalType: string;
  canonicalSubtypes: readonly string[];
  requiredFields: readonly string[];
  optionalFields: readonly string[];
  derivedFields: readonly string[];
  stockEffect: StockEffect;
  todoEffect: TodoEffect;
  calendarEffect: CalendarEffect;
  webTarget: string;
  lineTarget: string;
  ambientTarget: string;
}

export function recordingTaxonomyContractSnapshot(): readonly RecordingTaxonomyContractRow[] {
  return Object.freeze(RECORDING_TAXONOMY.map((item) => Object.freeze({
    id: item.id,
    family: item.family,
    canonicalType: item.canonicalType,
    canonicalSubtypes: [...item.canonicalSubtypes],
    requiredFields: [...item.requiredFields],
    optionalFields: [...item.optionalFields],
    derivedFields: [...item.derivedFields],
    stockEffect: item.stockEffect,
    todoEffect: item.todoEffect,
    calendarEffect: item.calendarEffect,
    webTarget: item.webTarget,
    lineTarget: item.lineTarget,
    ambientTarget: item.ambientTarget,
  })));
}

export interface RecordingDraft {
  id?: unknown;
  taxonomyId?: unknown;
  family?: unknown;
  type?: unknown;
  subtype?: unknown;
  occurredAt?: unknown;
  createdAt?: unknown;
  farmId?: unknown;
  houseId?: unknown;
  flockId?: unknown;
  sourceChannel?: unknown;
  sourceMessageId?: unknown;
  sourceCandidateId?: unknown;
  rawText?: unknown;
  actorId?: unknown;
  confirmedBy?: unknown;
  clientOperationId?: unknown;
  workflowStatus?: unknown;
  lifecycleStatus?: unknown;
  correctionOfId?: unknown;
  reversalOfId?: unknown;
  replacementOfId?: unknown;
  [key: string]: unknown;
}

export class RecordingContractError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, field?: string) {
    super(field ? code + ":" + field : code);
    this.name = "RecordingContractError";
    this.code = code;
    this.field = field;
  }
}

function fail(code: string, field?: string): never {
  throw new RecordingContractError(code, field);
}

function nonEmptyText(value: unknown, field: string, maxLength = 240): string {
  if (typeof value !== "string") fail("RECORDING_TEXT_INVALID", field);
  const text = value.trim();
  if (!text || text.length > maxLength || /[\u0000-\u001F\u007F]/u.test(text)) fail("RECORDING_TEXT_INVALID", field);
  return text;
}

function finiteNumber(value: unknown, field: string, positive = false): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(number) || (positive ? number <= 0 : number < 0)) fail("RECORDING_NUMBER_INVALID", field);
  return number;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const number = finiteNumber(value, field);
  if (!Number.isSafeInteger(number)) fail("RECORDING_INTEGER_INVALID", field);
  return number;
}

function positiveInteger(value: unknown, field: string): number {
  const number = finiteNumber(value, field, true);
  if (!Number.isSafeInteger(number)) fail("RECORDING_INTEGER_INVALID", field);
  return number;
}

function requiredValue(record: RecordingDraft, field: string): unknown {
  const value = record[field];
  if (value === undefined || value === null || value === "") fail("RECORDING_REQUIRED_FIELD", field);
  return value;
}

function isoTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || !Number.isFinite(Date.parse(value))) {
    fail("RECORDING_TIMESTAMP_INVALID", field);
  }
  return value;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, field: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) fail("RECORDING_ENUM_INVALID", field);
  return value as T[number];
}

function definitionForInput(record: RecordingDraft): TaxonomyDefinition {
  const family = record.family;
  const type = record.type;
  const subtype = record.subtype;
  if (typeof family !== "string" || !RECORDING_FAMILIES.includes(family as RecordingFamily)) fail("RECORDING_FAMILY_INVALID", "family");
  if (typeof type !== "string") fail("RECORDING_TYPE_REQUIRED", "type");
  if (typeof subtype !== "string") fail("RECORDING_SUBTYPE_REQUIRED", "subtype");
  const match = RECORDING_TAXONOMY.find((item) =>
    item.family === family && item.canonicalType === type && item.canonicalSubtypes.includes(subtype),
  );
  if (!match) fail("RECORDING_TAXONOMY_UNSUPPORTED", "subtype");
  return match;
}

export function taxonomyDefinitionFor(id: TaxonomyId): TaxonomyDefinition {
  const value = TAXONOMY_BY_ID.get(id);
  if (!value) fail("RECORDING_TAXONOMY_ID_INVALID", "taxonomyId");
  return value;
}

export function taxonomyDefinitionForRecord(record: RecordingDraft): TaxonomyDefinition {
  return definitionForInput(record);
}

export function validateRecordingDraft(input: unknown): asserts input is RecordingDraft {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("RECORDING_OBJECT_INVALID");
  const record = input as RecordingDraft;
  nonEmptyText(requiredValue(record, "id"), "id", 160);
  const taxonomyId = nonEmptyText(requiredValue(record, "taxonomyId"), "taxonomyId", 20);
  const definition = definitionForInput(record);
  if (taxonomyId !== definition.id) fail("RECORDING_TAXONOMY_MISMATCH", "taxonomyId");
  isoTimestamp(requiredValue(record, "occurredAt"), "occurredAt");
  isoTimestamp(requiredValue(record, "createdAt"), "createdAt");
  nonEmptyText(requiredValue(record, "farmId"), "farmId", 160);
  enumValue(requiredValue(record, "sourceChannel"), RECORDING_SOURCE_CHANNELS, "sourceChannel");
  nonEmptyText(requiredValue(record, "rawText"), "rawText", 2000);
  nonEmptyText(requiredValue(record, "clientOperationId"), "clientOperationId", 200);
  if (record.houseId !== undefined && record.houseId !== null) nonEmptyText(record.houseId, "houseId", 160);
  if (record.flockId !== undefined && record.flockId !== null) nonEmptyText(record.flockId, "flockId", 160);
  if (record.clientOperationId !== undefined && record.clientOperationId !== null) nonEmptyText(record.clientOperationId, "clientOperationId", 200);
  if (record.sourceMessageId !== undefined && record.sourceMessageId !== null) nonEmptyText(record.sourceMessageId, "sourceMessageId", 200);
  if (record.sourceCandidateId !== undefined && record.sourceCandidateId !== null) nonEmptyText(record.sourceCandidateId, "sourceCandidateId", 200);
  if (record.workflowStatus !== undefined && record.workflowStatus !== null) enumValue(record.workflowStatus, ACTION_WORKFLOW_STATES, "workflowStatus");
  if (record.lifecycleStatus !== undefined && record.lifecycleStatus !== null) enumValue(record.lifecycleStatus, RECORD_LIFECYCLE_STATES, "lifecycleStatus");
  if (record.workflowStatus !== undefined && record.workflowStatus !== null && definition.id !== "O6" && definition.id !== "O7") {
    fail("RECORDING_UNSUPPORTED_FIELD", "workflowStatus");
  }
  for (const field of ["correctionOfId", "reversalOfId", "replacementOfId"] as const) {
    if (record[field] !== undefined && record[field] !== null) {
      const reference = nonEmptyText(record[field], field, 200);
      if (reference === String(record.id)) fail("RECORDING_LINEAGE_SELF_REFERENCE", field);
    }
  }
  for (const field of ["detail", "measurement", "evidence"] as const) {
    if (record[field] !== undefined && record[field] !== null) nonEmptyText(record[field], field, 240);
  }

  for (const field of definition.requiredFields) requiredValue(record, field);

  if (definition.id === "O1") {
    nonNegativeInteger(record.maleCount, "maleCount");
    nonNegativeInteger(record.femaleCount, "femaleCount");
    enumValue(record.condition, ["good", "fair", "poor"] as const, "condition");
    if (Object.prototype.hasOwnProperty.call(record, "quantity") && record.quantity !== undefined && record.quantity !== null) fail("RECORDING_UNSUPPORTED_FIELD", "quantity");
    const total = nonNegativeInteger(record.maleCount, "maleCount") + nonNegativeInteger(record.femaleCount, "femaleCount");
    if (record.totalCount !== undefined && nonNegativeInteger(record.totalCount, "totalCount") !== total) fail("RECORDING_DERIVED_FIELD_MISMATCH", "totalCount");
    if (record.unit !== undefined && record.unit !== null && record.unit !== "birds" && record.unit !== "隻") fail("RECORDING_UNIT_INVALID", "unit");
  }

  if (definition.id === "O2") nonEmptyText(record.content, "content");

  if (definition.id === "O3") {
    positiveInteger(record.quantity, "quantity");
    enumValue(record.sex, RECORDING_SEXES, "sex");
    if (record.totalWeight !== undefined && record.totalWeight !== null) finiteNumber(record.totalWeight, "totalWeight", true);
    if (record.weightUnit !== undefined && record.weightUnit !== null) enumValue(record.weightUnit, ["kg"] as const, "weightUnit");
    if (record.averageWeight !== undefined && record.averageWeight !== null) {
      const totalWeight = finiteNumber(record.totalWeight, "totalWeight", true);
      const averageWeight = finiteNumber(record.averageWeight, "averageWeight", true);
      if (Math.abs(averageWeight - totalWeight / Number(record.quantity)) > 1e-9) fail("RECORDING_DERIVED_FIELD_MISMATCH", "averageWeight");
    }
  }

  if (definition.id === "O4") {
    nonEmptyText(record.houseId, "houseId", 160);
    nonEmptyText(record.flockId, "flockId", 160);
    finiteNumber(record.averageWeight, "averageWeight", true);
    enumValue(record.sex, RECORDING_SEXES, "sex");
    if (record.weightUnit !== undefined && record.weightUnit !== null) enumValue(record.weightUnit, ["kg"] as const, "weightUnit");
      if (record.chickInDate !== undefined && record.chickInDate !== null) {
        if (typeof record.chickInDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(record.chickInDate)) fail("RECORDING_DATE_INVALID", "chickInDate");
        if (!isoDate(record.chickInDate)) fail("RECORDING_DATE_INVALID", "chickInDate");
        if (record.ageDays !== undefined && record.ageDays !== null) {
          const ageDays = nonNegativeInteger(record.ageDays, "ageDays");
          const expectedAgeDays = (Date.parse(String(record.occurredAt).slice(0, 10) + "T00:00:00Z") - Date.parse(record.chickInDate + "T00:00:00Z")) / 86_400_000;
          if (!Number.isInteger(expectedAgeDays) || expectedAgeDays < 0 || ageDays !== expectedAgeDays) fail("RECORDING_DERIVED_FIELD_MISMATCH", "ageDays");
        }
      } else if (record.ageDays !== undefined && record.ageDays !== null) {
        fail("RECORDING_DERIVED_FIELD_MISMATCH", "ageDays");
      }
  }

  if (definition.id === "O5") {
    nonEmptyText(record.vendor, "vendor");
    finiteNumber(record.weight, "weight", true);
    enumValue(record.weightUnit, WEIGHT_UNITS, "weightUnit");
  }

  if (definition.id === "O6") {
    isoTimestamp(record.submittedAt, "submittedAt");
    nonEmptyText(record.content, "content");
    enumValue(record.workflowStatus, O6_STATUSES, "workflowStatus");
    if (record.workflowStatus === "completed") {
      nonEmptyText(requiredValue(record, "result"), "result");
      isoTimestamp(record.completedAt, "completedAt");
    }
    if (record.reminderDueAt !== undefined && record.reminderDueAt !== null) {
      isoTimestamp(record.reminderDueAt, "reminderDueAt");
      const expectedReminder = Date.parse(String(record.submittedAt)) + 3 * 86_400_000;
      if (Date.parse(String(record.reminderDueAt)) !== expectedReminder) fail("RECORDING_DERIVED_FIELD_MISMATCH", "reminderDueAt");
    }
  }

  if (definition.id === "O7") enumValue(record.workflowStatus, ACTION_COMPLETION_STATUSES, "workflowStatus");
  if (definition.id === "O8") nonEmptyText(record.maintenanceContent, "maintenanceContent");

  if (definition.family === "operational_event" && definition.id === "O9") {
    positiveInteger(record.quantity, "quantity");
    if (record.sex !== undefined && record.sex !== null) enumValue(record.sex, RECORDING_SEXES, "sex");
    if (record.unit !== undefined && record.unit !== null && record.unit !== "birds" && record.unit !== "隻") fail("RECORDING_UNIT_INVALID", "unit");
    if (record.totalCount !== undefined && record.totalCount !== null) fail("RECORDING_UNSUPPORTED_FIELD", "totalCount");
  }

  if (definition.family === "operational_observation") {
    enumValue(record.extent, OBSERVATION_EXTENTS, "extent");
    if (Object.prototype.hasOwnProperty.call(record, "quantity") && record.quantity !== undefined && record.quantity !== null) fail("OBSERVATION_QUANTITY_FORBIDDEN", "quantity");
    if (definition.id === "A1") nonEmptyText(record.linkedMortalityEventId, "linkedMortalityEventId", 200);
    if (definition.id === "A12" && record.subtype === "other") nonEmptyText(requiredValue(record, "detail"), "detail");
    if (record.measuredTemperature !== undefined && record.measuredTemperature !== null) finiteNumber(record.measuredTemperature, "measuredTemperature");
  }
}

function isoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

function dateParts(value: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) fail("RECORDING_DATE_INVALID", "date");
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function addDays(value: string, days: number): string {
  const parts = dateParts(value);
  const result = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return result.toISOString().slice(0, 10);
}

export function taipeiDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return String(values.year) + "-" + String(values.month) + "-" + String(values.day);
}

export function resolveTaipeiDate(value: string, now = new Date()): string | null {
  const normalized = value.normalize("NFKC").trim();
  const today = taipeiDate(now);
  if (normalized === "today" || normalized === "今天" || normalized === "今日") return today;
  if (normalized === "yesterday" || normalized === "昨天" || normalized === "昨晚") return addDays(today, -1);
  return isoDate(normalized) ? normalized : null;
}

function timestampForDate(value: string, now: Date): string | null {
  if (/^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value))) return value;
  const date = resolveTaipeiDate(value, now);
  return date ? date + "T00:00:00+08:00" : null;
}

function occurredAtFromText(text: string, now: Date): string | undefined {
  const explicit = /(\d{4}-\d{2}-\d{2})/u.exec(text);
  if (explicit) return timestampForDate(explicit[1], now) || undefined;
  const relative = /今天|今日|昨天|昨晚/u.exec(text);
  if (relative) return timestampForDate(relative[0], now) || undefined;
  return undefined;
}

export function deriveRecordingFields(input: RecordingDraft): Record<string, unknown> {
  const derived: Record<string, unknown> = {};
  if (input.subtype === "chick_in" && Number.isSafeInteger(Number(input.maleCount)) && Number.isSafeInteger(Number(input.femaleCount))) {
    derived.totalCount = Number(input.maleCount) + Number(input.femaleCount);
  }
  if (input.subtype === "shipment" && Number(input.quantity) > 0 && Number.isFinite(Number(input.totalWeight))) {
    derived.averageWeight = Number(input.totalWeight) / Number(input.quantity);
  }
  if (input.subtype === "weigh" && typeof input.chickInDate === "string" && typeof input.occurredAt === "string") {
    const occurredDate = input.occurredAt.slice(0, 10);
    if (isoDate(occurredDate) && isoDate(input.chickInDate)) {
      const elapsed = (Date.parse(occurredDate + "T00:00:00Z") - Date.parse(input.chickInDate + "T00:00:00Z")) / 86_400_000;
      if (Number.isInteger(elapsed) && elapsed >= 0) derived.ageDays = elapsed;
    }
  }
  if (input.subtype === "lab_test" && typeof input.submittedAt === "string") {
    const submitted = Date.parse(input.submittedAt);
    if (Number.isFinite(submitted)) derived.reminderDueAt = new Date(submitted + 3 * 86_400_000).toISOString();
  }
  return derived;
}

export function normalizeRecordingDraft(input: RecordingDraft, now = new Date()): RecordingDraft {
  const normalized: RecordingDraft = { ...input };
  for (const key of ["rawText", "content", "maintenanceContent", "vendor", "detail", "result"] as const) {
    if (typeof normalized[key] === "string") normalized[key] = normalized[key].trim();
  }
  for (const key of ["occurredAt", "createdAt", "submittedAt", "completedAt"] as const) {
    if (typeof normalized[key] === "string") {
      const timestamp = timestampForDate(normalized[key] as string, now);
      if (timestamp) normalized[key] = timestamp;
    }
  }
  for (const key of ["maleCount", "femaleCount", "totalCount", "quantity", "weight", "totalWeight", "averageWeight", "measuredTemperature"] as const) {
    if (typeof normalized[key] === "string" && normalized[key].trim() && Number.isFinite(Number(normalized[key]))) normalized[key] = Number(normalized[key]);
  }
  if (normalized.sex === "公雞" || normalized.sex === "雄") normalized.sex = "male";
  if (normalized.sex === "母雞" || normalized.sex === "雌") normalized.sex = "female";
  if (normalized.sex === "混合") normalized.sex = "mixed";
  if (normalized.extent === "小範圍") normalized.extent = "small";
  if (normalized.extent === "中範圍") normalized.extent = "medium";
  if (normalized.extent === "大範圍") normalized.extent = "large";
  return { ...normalized, ...deriveRecordingFields(normalized) };
}

export function stockEffectForRecord(input: RecordingDraft): StockEffect {
  const definition = definitionForInput(input);
  return definition.stockEffect;
}

export interface CanonicalTextParse {
  recordWorthiness: "record" | "candidate" | "ignore";
  taxonomyId: TaxonomyId | null;
  family: RecordingFamily | null;
  type: string | null;
  subtype: string | null;
  fields: Record<string, unknown>;
  missingFields: string[];
  clarificationQuestion: string | null;
  uncertainty: "none" | "low" | "high";
  candidateRequired: boolean;
  officialWriteAllowed: false;
  reason: string;
}

function scopeFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const flock = /(?:批次|批|flock\s*)[:：]?\s*([\p{L}\p{N}_-]{1,40})/iu.exec(text);
  if (flock) fields.flockText = flock[1];
  const house = /([\p{L}\p{N}_-]{1,18}\s*舍)/u.exec(text);
  if (house) {
    fields.houseText = house[1].replace(/\s+/gu, "");
    const before = text.slice(0, house.index);
    const farm = /([\p{L}\p{N}_-]{2,40}(?:雞場|鸡场|場|场))/u.exec(before);
    if (farm) fields.farmText = farm[1];
  } else {
    const farm = /([\p{L}\p{N}_-]{2,40}(?:雞場|鸡场|場|场))/u.exec(text);
    if (farm) fields.farmText = farm[1];
  }
  return fields;
}

function numberAfter(text: string, expression: RegExp): number | undefined {
  const match = expression.exec(text);
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/gu, ""));
  return Number.isFinite(value) ? value : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function questionFor(fields: Record<string, unknown>, missing: readonly string[]): string | null {
  if (!missing.length) return null;
  if (!fields.farmText) return "請問是哪一個雞場？";
  const first = missing[0];
  const questions: Record<string, string> = {
    houseId: "請問要記在哪一舍？",
    flockId: "請問是哪一批？",
    maleCount: "請補充公雞數量。",
    femaleCount: "請補充母雞數量。",
    condition: "請說明入雛狀況：良好、普通或較差？",
    content: "請補充疫苗、用藥、補充品或檢驗內容。",
    quantity: "請補充數量。",
    averageWeight: "請補充平均體重。",
    vendor: "請補充飼料供應商。",
    weight: "請補充訂購重量。",
    extent: "請選擇小範圍、中範圍或大範圍。",
    subtype: "請補充更明確的異常類型。",
    detail: "請補充其他設備異常內容。",
    linkedMortalityEventId: "請指出對應的正式死亡紀錄。",
  };
  if (missing.includes("result") && missing.includes("completedAt")) return "請補充檢驗結果與完成時間。";
  if (first === "result") return "請補充檢驗結果。";
  if (first === "completedAt") return "請補充完成時間。";
  return questions[first] || "請補充「" + first + "」。";
}

function parseResult(
  id: TaxonomyId,
  subtype: string,
  fields: Record<string, unknown>,
  missingFields: string[],
  reason: string,
): CanonicalTextParse {
  const definition = taxonomyDefinitionFor(id);
  const missing = unique(missingFields);
  const candidate = missing.length > 0 || !fields.farmText;
  return {
    recordWorthiness: candidate ? "candidate" : "record",
    taxonomyId: id,
    family: definition.family,
    type: definition.canonicalType,
    subtype,
    fields,
    missingFields: missing,
    clarificationQuestion: questionFor(fields, missing),
    uncertainty: candidate ? "low" : "none",
    candidateRequired: candidate,
    officialWriteAllowed: false,
    reason,
  };
}

function ignored(reason: string): CanonicalTextParse {
  return {
    recordWorthiness: "ignore",
    taxonomyId: null,
    family: null,
    type: null,
    subtype: null,
    fields: {},
    missingFields: [],
    clarificationQuestion: null,
    uncertainty: "none",
    candidateRequired: false,
    officialWriteAllowed: false,
    reason,
  };
}

function unknownCandidate(text: string, reason = "unknown_semantics"): CanonicalTextParse {
  return {
    recordWorthiness: "candidate",
    taxonomyId: null,
    family: null,
    type: null,
    subtype: null,
    fields: { rawText: text.slice(0, 2000) },
    missingFields: ["type"],
    clarificationQuestion: "這是要記錄哪一種營運或現場觀察？",
    uncertainty: "high",
    candidateRequired: true,
    officialWriteAllowed: false,
    reason,
  };
}

function abnormalMatch(text: string): { id: TaxonomyId; subtype: string } | null {
  if (/死亡異常|死亡率異常/u.test(text)) return { id: "A1", subtype: "mortality_abnormality" };
  if (/設備|设备|風扇|风扇|水簾|水帘|發電機|发电机|照明|飼料線|饲料线|飲水線|饮水线/u.test(text)) {
    if (/其他|其它/u.test(text)) return { id: "A12", subtype: "other" };
    if (/電|电|停電|停电/u.test(text)) return { id: "A12", subtype: "electricity" };
    if (/風扇|风扇/u.test(text)) return { id: "A12", subtype: "fan" };
    if (/水簾|水帘|冷卻|冷却/u.test(text)) return { id: "A12", subtype: "cooling" };
    if (/加熱|加热|暖氣|暖气/u.test(text)) return { id: "A12", subtype: "heating" };
    if (/飼料線|饲料线|飼料設備|饲料设备|料線|料线/u.test(text)) return { id: "A12", subtype: "feed" };
    if (/飲水線|饮水线|水線|水线|水泵|水泵|供水/u.test(text)) return { id: "A12", subtype: "water" };
  }
  if (/攻擊|攻击/u.test(text)) return { id: "A16", subtype: "attack" };
  if (/感染/u.test(text)) return { id: "A16", subtype: "infection" };
  if (/擴散|扩散|傳播|传播/u.test(text)) return { id: "A16", subtype: "spread" };
  if (/淹水|積水|积水|淹/u.test(text)) return { id: "A14", subtype: "flooding" };
  if (/高溫|高温|氣溫高|气温高/u.test(text)) return { id: "A13", subtype: "high_temperature" };
  if (/低溫|低温|氣溫低|气温低/u.test(text)) return { id: "A13", subtype: "low_temperature" };
  if (/大雨|豪雨|暴雨|雨勢/u.test(text)) return { id: "A13", subtype: "heavy_rain" };
  if (/異味|异味|臭味/u.test(text)) return { id: "A15", subtype: "odor" };
  if (/採食|采食|吃料|食慾|食欲/u.test(text)) return { id: "A11", subtype: "feeding_abnormality" };
  if (/飲水|饮水|喝水/u.test(text)) return { id: "A11", subtype: "water_abnormality" };
  if (/熱緊迫|热紧迫/u.test(text)) return { id: "A10", subtype: "heat_stress" };
  if (/抓雞緊迫|抓鸡紧迫|抓雞|抓鸡/u.test(text)) return { id: "A10", subtype: "catching_stress" };
  if (/發燒|发烧/u.test(text)) return { id: "A9", subtype: "fever" };
  if (/臭腳|臭脚/u.test(text)) return { id: "A8", subtype: "foot_odor" };
  if (/生長遲緩|生长迟缓|長不大|长不大/u.test(text)) return { id: "A7", subtype: "growth_delay" };
  if (/下痢|拉稀|腹瀉|腹泻|水便|白便|綠便|绿便|血便/u.test(text)) {
    if (/血便/u.test(text)) return { id: "A6", subtype: "bloody" };
    if (/白便/u.test(text)) return { id: "A6", subtype: "white" };
    if (/綠便|绿便/u.test(text)) return { id: "A6", subtype: "green" };
    if (/水便/u.test(text)) return { id: "A6", subtype: "watery" };
  }
  if (/眼睛腫|眼腫|眼肿/u.test(text)) return { id: "A5", subtype: "eye_swelling" };
  if (/白冠/u.test(text)) return { id: "A5", subtype: "white_crown" };
  if (/紫冠/u.test(text)) return { id: "A5", subtype: "purple_crown" };
  if (/黑冠/u.test(text)) return { id: "A5", subtype: "black_crown" };
  if (/精神不振|沒精神|没精神|活動力下降|活动力下降/u.test(text)) return { id: "A4", subtype: "activity_down" };
  if (/呼吸困難|呼吸困难|呼吸急促|喘/u.test(text)) return { id: "A3", subtype: "respiratory_distress" };
  if (/咳嗽|咳/u.test(text)) return { id: "A2", subtype: "cough" };
  return null;
}

function abnormalCategoryHint(text: string): TaxonomyId | null {
  if (/外觀|外观/u.test(text)) return "A5";
  if (/下痢|拉稀|腹瀉|腹泻/u.test(text)) return "A6";
  if (/緊迫|紧迫/u.test(text)) return "A10";
  if (/設備|设备/u.test(text)) return "A12";
  if (/天候|天氣|天气/u.test(text)) return "A13";
  if (/場地事件|场地事件/u.test(text)) return "A16";
  return null;
}

function unresolvedObservationCandidate(
  id: TaxonomyId,
  fields: Record<string, unknown>,
  missingFields: string[],
  reason: string,
): CanonicalTextParse {
  const definition = taxonomyDefinitionFor(id);
  const missing = unique(missingFields);
  return {
    recordWorthiness: "candidate",
    taxonomyId: id,
    family: definition.family,
    type: definition.canonicalType,
    subtype: null,
    fields,
    missingFields: missing,
    clarificationQuestion: questionFor(fields, missing),
    uncertainty: "high",
    candidateRequired: true,
    officialWriteAllowed: false,
    reason,
  };
}

export function parseCanonicalRecordingText(rawText: string, now = new Date()): CanonicalTextParse {
  if (typeof rawText !== "string") return unknownCandidate(String(rawText ?? ""), "raw_text_invalid");
  const text = rawText.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!text) return ignored("empty");
  if (/[?？]/u.test(text) && /(?:請問|查詢|查询|目前|多少|幾|几|哪|是否|嗎|吗)/u.test(text)) return ignored("question_or_query");
  if (/^(?:請問|查詢|查询|目前|多少|哪裡|哪裡|哪裡有|怎麼|怎么|為什麼|为什么)/u.test(text) && !/(?:死亡|淘汰|入雛|入雏|疫苗|用藥|用药|送驗|送验|清消|消毒|維護|维护|叫飼料|叫饲料|出雞|出鸡|磅重|稱重|咳嗽|喘|異常|异常)/u.test(text)) return ignored("question_or_query");
  if (/(?:如果|假設|假设|打算|預計|预计|明天|下週|下周|以後|以后)/u.test(text)) return ignored("future_or_hypothetical");
  if (/(?:沒有|没有|沒|未|不是|並非|并非)\s*(?:死亡|淘汰|出雞|出鸡|入雛|入雏)/u.test(text)) return ignored("negated_record");
  if (/(?:更正|修正|改成|記錯|记错|撤銷|撤销|取消|回滾|回滚)/u.test(text)) return unknownCandidate(text, "correction_candidate");
  if (/(?:可能|好像|好似|疑似|不確定|不确定|似乎)/u.test(text)) return unknownCandidate(text, "uncertain_candidate");
  if (/(?:重複|重复|同一筆|同一笔|不是新增|剛才那筆|刚才那笔)/u.test(text)) return unknownCandidate(text, "duplicate_or_relation_candidate");
  if (/(?:還是|还是|或者|或是)/u.test(text) && /\d/u.test(text)) return unknownCandidate(text, "conflicting_values_candidate");
  if (/(?:第一則|第一则|第二則|第二则|多則|多则|多筆|多笔|兩則|两则|兩筆|两笔|同時|同时)/u.test(text) && /(?:死亡|淘汰|咳|喘|異常|异常|臭)/u.test(text)) return unknownCandidate(text, "multi_message_candidate");
  if (/(?:甲|乙|A|B)\s*(?:說|说|表示)/u.test(text)) return unknownCandidate(text, "multi_user_ambiguity_candidate");
  if (/(?:笑話|哈哈|開玩笑|开玩笑|晚安|早安|謝謝|谢谢)/u.test(text)) return ignored("irrelevant_chatter");

  const scope = scopeFields(text);
  const occurredAt = occurredAtFromText(text, now);
  const dateFields: Record<string, unknown> = occurredAt ? { occurredAt } : {};
  const baseMissing = (): string[] => (scope.farmText ? [] : ["farmScope"]);

  if (/入雛|入雏|進雛|进雏/u.test(text)) {
    const fields: Record<string, unknown> = { ...scope, ...dateFields };
    const male = numberAfter(text, /(?:公雞|公鸡|雄)\s*(\d+)/u);
    const female = numberAfter(text, /(?:母雞|母鸡|雌)\s*(\d+)/u);
    if (male !== undefined) fields.maleCount = male;
    if (female !== undefined) fields.femaleCount = female;
    if (/良好|正常|好/u.test(text)) fields.condition = "good";
    else if (/較差|较差|差/u.test(text)) fields.condition = "poor";
    else if (/普通|一般/u.test(text)) fields.condition = "fair";
    return parseResult("O1", "chick_in", fields, baseMissing().concat(
      male === undefined ? ["maleCount"] : [],
      female === undefined ? ["femaleCount"] : [],
      fields.condition === undefined ? ["condition"] : [],
      !fields.houseText ? ["houseId"] : [],
      !fields.flockText ? ["flockId"] : [],
    ), "known_chick_in");
  }

  if (/疫苗|接種|接种|用藥|用药|補充品|补充品|維生素|维生素/u.test(text)) {
    const fields: Record<string, unknown> = { ...scope, ...dateFields };
    const content = text.replace(/.*?(疫苗|接種|接种|用藥|用药|補充品|补充品|維生素|维生素)/u, "").trim();
    if (content) fields.content = content;
    const subtype = /用藥|用药/u.test(text) ? "medication" : /補充品|补充品|維生素|维生素/u.test(text) ? "supplement" : "vaccination";
    return parseResult("O2", subtype, fields, baseMissing().concat(content ? [] : ["content"]), "known_action");
  }

  if (/出雞|出鸡|出欄|出栏|出貨|出货/u.test(text)) {
    const fields: Record<string, unknown> = { ...scope, ...dateFields };
    const quantity = numberAfter(text, /(?:出雞|出鸡|出欄|出栏|出貨|出货)\s*(\d+)/u);
    if (quantity !== undefined) fields.quantity = quantity;
    fields.sex = /公雞|公鸡|雄/u.test(text) ? "male" : /母雞|母鸡|雌/u.test(text) ? "female" : /混合/u.test(text) ? "mixed" : "unspecified";
    const totalWeight = numberAfter(text, /(?:總重|总重)\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤)?/u);
    if (totalWeight !== undefined) fields.totalWeight = totalWeight;
    return parseResult("O3", "shipment", fields, baseMissing().concat(
      quantity === undefined ? ["quantity"] : [],
      !fields.houseText ? ["houseId"] : [],
    ), "known_shipment");
  }

  if (/磅重|稱重|称重|平均體重|平均体重/u.test(text)) {
    const fields: Record<string, unknown> = { ...scope, ...dateFields };
    const weight = numberAfter(text, /(?:磅重|稱重|称重|平均體重|平均体重)\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤)?/u);
    if (weight !== undefined) fields.averageWeight = weight;
    fields.sex = /公雞|公鸡|雄/u.test(text) ? "male" : /母雞|母鸡|雌/u.test(text) ? "female" : "unspecified";
    return parseResult("O4", "weigh", fields, baseMissing().concat(
      weight === undefined ? ["averageWeight"] : [],
      !fields.houseText ? ["houseId"] : [],
      !fields.flockText ? ["flockId"] : [],
    ), "known_weigh");
  }

  if (/叫飼料|叫饲料|叫料|訂飼料|订饲料|訂料|订料|訂購飼料|订购饲料/u.test(text)) {
    const fields: Record<string, unknown> = { ...scope, ...dateFields };
    const weight = numberAfter(text, /(\d+(?:\.\d+)?)\s*(?:kg|公斤|包)/u);
    if (weight !== undefined) {
      fields.weight = weight;
      fields.weightUnit = /包/u.test(text) ? "bag" : "kg";
    }
    const vendorMatch = text.match(/(?:廠商|厂商|向|跟|叫飼料|叫饲料|叫料)\s*([\p{L}\p{N}_-]{2,24})/u);
    if (vendorMatch && !/^\d+(?:\.\d+)?(?:kg|公斤|包)$/iu.test(vendorMatch[1])) fields.vendor = vendorMatch[1];
    return parseResult("O5", "feed_order", fields, baseMissing().concat(
      fields.vendor ? [] : ["vendor"],
      weight === undefined ? ["weight"] : [],
    ), "known_feed_order");
  }

  if (/送驗|送验|檢驗|检验|化驗|化验/u.test(text)) {
    const submittedAt = occurredAt || now.toISOString();
    const completed = /結果|结果|完成/u.test(text);
    const fields: Record<string, unknown> = { ...scope, occurredAt: submittedAt, submittedAt, workflowStatus: completed ? "completed" : "waiting_result" };
    const content = text.replace(/.*?(送驗|送验|檢驗|检验|化驗|化验)/u, "").replace(/結果|结果|完成/u, "").trim();
    if (content) fields.content = content;
    const missing = baseMissing().concat(content ? [] : ["content"]);
    if (completed) missing.push("result", "completedAt");
    return parseResult("O6", "lab_test", fields, missing, "known_lab_test");
  }

  if (/清消|消毒/u.test(text)) {
    const fields: Record<string, unknown> = { ...scope, ...dateFields, workflowStatus: /完成|做完/u.test(text) ? "completed" : "pending" };
    return parseResult("O7", "disinfection", fields, baseMissing(), "known_disinfection");
  }

  if (/設備維護|設備保養|設備保养|維修|维修|保養|保养/u.test(text)) {
    const fields: Record<string, unknown> = { ...scope, ...dateFields };
    const content = text.replace(/.*?(設備維護|設備保養|設備保养|維修|维修|保養|保养)/u, "").trim();
    if (content) fields.maintenanceContent = content;
    return parseResult("O8", "maintenance", fields, baseMissing().concat(content ? [] : ["maintenanceContent"]), "known_maintenance");
  }

  if (/(?:死亡|死雞|死鸡|淘汰|掛了|挂了)/u.test(text) && !/死亡異常|死亡率異常/u.test(text)) {
    const fields: Record<string, unknown> = { ...scope, ...dateFields };
    const mortality = numberAfter(text, /(?:死亡|死雞|死鸡)\s*(\d+)/u);
    const cull = numberAfter(text, /(?:淘汰|掛了|挂了)\s*(\d+)/u);
    const isCull = cull !== undefined && mortality === undefined;
    const quantity = mortality ?? cull;
    if (quantity !== undefined) fields.quantity = quantity;
    if (isCull) return parseResult("O9", "cull", fields, baseMissing().concat(quantity === undefined ? ["quantity"] : []), "known_cull");
    return parseResult("O9", "mortality", fields, baseMissing().concat(quantity === undefined ? ["quantity"] : []), "known_mortality");
  }

  const abnormal = abnormalMatch(text);
  if (abnormal) {
    const fields: Record<string, unknown> = { ...scope, ...dateFields };
    const extent = /小範圍|小范围/u.test(text) ? "small" : /中範圍|中范围/u.test(text) ? "medium" : /大範圍|大范围/u.test(text) ? "large" : undefined;
    if (extent) fields.extent = extent;
    const missing = baseMissing().concat(extent ? [] : ["extent"]);
    if (abnormal.id === "A1") missing.push("linkedMortalityEventId");
    if (abnormal.id === "A5" && !taxonomyDefinitionFor("A5").canonicalSubtypes.includes(abnormal.subtype)) missing.push("subtype");
    if (abnormal.id === "A12" && abnormal.subtype === "other") {
      const detail = text.replace(/.*?其他/u, "").replace(/小範圍|小范围|中範圍|中范围|大範圍|大范围/gu, "").trim();
      if (detail) fields.detail = detail;
      else missing.push("detail");
    }
    return parseResult(abnormal.id, abnormal.subtype, fields, missing, "known_observation");
  }

  const hintedAbnormalId = abnormalCategoryHint(text);
  if (hintedAbnormalId) {
    const fields: Record<string, unknown> = { ...scope, ...dateFields };
    const extent = /小範圍|小范围/u.test(text) ? "small" : /中範圍|中范围/u.test(text) ? "medium" : /大範圍|大范围/u.test(text) ? "large" : undefined;
    if (extent) fields.extent = extent;
    return unresolvedObservationCandidate(
      hintedAbnormalId,
      fields,
      baseMissing().concat(["subtype"], extent ? [] : ["extent"]),
      "known_observation_subtype_unresolved",
    );
  }

  if (scope.farmText) return unknownCandidate(text, "scoped_unknown");

  if (/(?:死亡|淘汰|入雛|入雏|疫苗|用藥|用药|送驗|送验|清消|消毒|設備|设备|異常|异常|咳|喘|臭)/u.test(text)) {
    return unknownCandidate(text, "known_keyword_unresolved");
  }
  return ignored("ordinary_chat");
}
