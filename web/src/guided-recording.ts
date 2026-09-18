import { deriveRecordingFields, recordingDefinition, type TaxonomyId } from "./recording-taxonomy";

export type GuidedArea = "operational" | "abnormal";

export interface GuidedScope {
  farmId: string;
  houseId?: string;
  flockId?: string;
  wholeFarmConfirmed?: boolean;
}

export interface GuidedDraft {
  area: GuidedArea;
  taxonomyId: TaxonomyId;
  subtype: string;
  date: string;
  scope: GuidedScope;
  values: Record<string, unknown>;
}

export interface GuidedRecordMeta {
  id: string;
  clientOperationId: string;
  createdAt?: string;
  rawText?: string;
}

export const GUIDED_AREAS = Object.freeze({
  operational: { label: "營運資料", ids: ["O1","O2","O3","O4","O5","O6","O7","O8","O9"] as TaxonomyId[] },
  abnormal: { label: "異常登錄", ids: ["A1","A2","A3","A4","A5","A6","A7","A8","A9","A10","A11","A12","A13","A14","A15","A16"] as TaxonomyId[] },
});

const LABELS: Record<string, string> = {
  maleCount: "公雞數量",
  femaleCount: "母雞數量",
  condition: "雞況",
  content: "內容",
  quantity: "數量",
  sex: "性別／類別",
  totalWeight: "總重量",
  averageWeight: "平均重量",
  chickInDate: "入雛日期",
  vendor: "供應商",
  weight: "重量",
  weightUnit: "重量單位",
  workflowStatus: "處理狀態",
  result: "檢驗結果",
  completedAt: "完成日期",
  maintenanceContent: "維護內容",
  extent: "影響範圍",
  linkedMortalityEventId: "關聯死亡紀錄",
  detail: "補充說明",
  measuredTemperature: "量測溫度",
  measurement: "量測／觀察值",
  evidence: "證據備註",
};

const SCOPE_FIELDS = new Set(["houseId", "flockId"]);
const SERVER_DERIVED_FIELDS = new Set(["submittedAt"]);

export function fieldLabel(field: string): string {
  return LABELS[field] ?? field;
}

export function scopeRequirements(id: TaxonomyId): { houseRequired: boolean; flockRequired: boolean; wholeFarmAllowed: boolean } {
  const definition = recordingDefinition(id);
  const houseRequired = definition.required.includes("houseId");
  const flockRequired = definition.required.includes("flockId");
  return { houseRequired, flockRequired, wholeFarmAllowed: !houseRequired };
}

export function guidedFields(id: TaxonomyId, values: Record<string, unknown> = {}): string[] {
  const definition = recordingDefinition(id);
  const fields: string[] = [];
  for (const field of [...definition.required, ...definition.optional]) {
    if (SCOPE_FIELDS.has(field) || SERVER_DERIVED_FIELDS.has(field)) continue;
    if ((field === "result" || field === "completedAt") && id === "O6" && values.workflowStatus !== "completed") continue;
    if (!fields.includes(field)) fields.push(field);
  }
  return fields;
}

function nonEmpty(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function buildGuidedRecord(draft: GuidedDraft, meta: GuidedRecordMeta): Record<string, unknown> {
  const definition = recordingDefinition(draft.taxonomyId);
  if (!definition.subtypes.includes(draft.subtype)) throw new Error("GUIDED_SUBTYPE_INVALID");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(draft.date)) throw new Error("GUIDED_DATE_REQUIRED");
  if (!draft.scope.farmId.trim()) throw new Error("GUIDED_FARM_REQUIRED");

  const scope = scopeRequirements(draft.taxonomyId);
  if (draft.scope.flockId && !draft.scope.houseId) throw new Error("GUIDED_FLOCK_REQUIRES_HOUSE");
  if (scope.houseRequired && !draft.scope.houseId) throw new Error("GUIDED_HOUSE_REQUIRED");
  if (scope.flockRequired && !draft.scope.flockId) throw new Error("GUIDED_FLOCK_REQUIRED");
  if (scope.wholeFarmAllowed && !draft.scope.houseId && !draft.scope.wholeFarmConfirmed) throw new Error("GUIDED_WHOLE_FARM_CONFIRM_REQUIRED");

  for (const field of definition.required) {
    if (SCOPE_FIELDS.has(field) || field === "submittedAt") continue;
    if (!nonEmpty(draft.values[field])) throw new Error(`GUIDED_REQUIRED_FIELD:${field}`);
  }
  if (draft.taxonomyId === "O6" && draft.values.workflowStatus === "completed") {
    if (!nonEmpty(draft.values.result)) throw new Error("GUIDED_REQUIRED_FIELD:result");
    if (!nonEmpty(draft.values.completedAt)) throw new Error("GUIDED_REQUIRED_FIELD:completedAt");
  }

  const occurredAt = `${draft.date}T09:30:00+08:00`;
  const record: Record<string, unknown> = {
    id: meta.id,
    taxonomyId: definition.id,
    family: definition.family,
    type: definition.canonicalType,
    subtype: draft.subtype,
    occurredAt,
    createdAt: meta.createdAt ?? new Date().toISOString(),
    farmId: draft.scope.farmId,
    ...(draft.scope.houseId ? { houseId: draft.scope.houseId } : {}),
    ...(draft.scope.flockId ? { flockId: draft.scope.flockId } : {}),
    sourceChannel: "web",
    clientOperationId: meta.clientOperationId,
    rawText: meta.rawText ?? `[Web guided] ${definition.id} ${draft.subtype} ${draft.scope.farmId} ${draft.date}`,
    scopeSelection: draft.scope.flockId ? "flock" : draft.scope.houseId ? "house" : "farm",
    scopeConfirmed: Boolean(draft.scope.houseId || draft.scope.wholeFarmConfirmed),
  };

  for (const field of guidedFields(draft.taxonomyId, draft.values)) {
    if (nonEmpty(draft.values[field])) record[field] = draft.values[field];
  }

  if (definition.id === "O6") record.submittedAt = occurredAt;
  if (definition.id === "O1") record.unit = "birds";
  if (definition.id === "O3" && nonEmpty(record.totalWeight)) record.weightUnit = "kg";
  if (definition.id === "O4" && nonEmpty(record.averageWeight)) record.weightUnit = "kg";
  Object.assign(record, deriveRecordingFields(record));
  return record;
}

export function fieldOptions(field: string): readonly string[] | null {
  const values: Record<string, readonly string[]> = {
    condition: ["good", "fair", "poor"],
    sex: ["male", "female", "mixed", "unspecified"],
    weightUnit: ["kg", "bag"],
    workflowStatus: ["pending", "waiting_result", "completed"],
    extent: ["small", "medium", "large"],
  };
  return values[field] ?? null;
}

export function numericField(field: string): boolean {
  return new Set(["maleCount","femaleCount","quantity","totalWeight","averageWeight","weight","measuredTemperature"]).has(field);
}

export function dateField(field: string): boolean {
  return field === "chickInDate" || field === "completedAt";
}
