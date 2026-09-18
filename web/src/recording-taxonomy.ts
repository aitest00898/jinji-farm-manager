export type TaxonomyId =
  | "O1" | "O2" | "O3" | "O4" | "O5" | "O6" | "O7" | "O8" | "O9"
  | "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7" | "A8"
  | "A9" | "A10" | "A11" | "A12" | "A13" | "A14" | "A15" | "A16";

export type CanonicalDestination =
  | "recording_events"
  | "operational_actions"
  | "operational_events"
  | "abnormal_events";

export type RecordingFamily = "operational_event" | "operational_action" | "operational_observation";

export interface RecordingDefinition {
  id: TaxonomyId;
  label: string;
  family: RecordingFamily;
  canonicalType: "event" | "action" | "observation";
  subtypes: readonly string[];
  required: readonly string[];
  optional: readonly string[];
  derived: readonly string[];
  destination: CanonicalDestination;
  stockEffect: -1 | 0 | 1;
}

const d = (
  id: TaxonomyId, label: string, family: RecordingFamily, canonicalType: RecordingDefinition["canonicalType"],
  subtypes: string[], required: string[], optional: string[], derived: string[],
  destination: CanonicalDestination, stockEffect: -1 | 0 | 1,
): RecordingDefinition => Object.freeze({ id, label, family, canonicalType, subtypes: Object.freeze(subtypes), required: Object.freeze(required), optional: Object.freeze(optional), derived: Object.freeze(derived), destination, stockEffect });

export const RECORDING_TAXONOMY: readonly RecordingDefinition[] = Object.freeze([
  d("O1", "入雛", "operational_event", "event", ["chick_in"], ["houseId", "flockId", "maleCount", "femaleCount", "condition"], [], ["totalCount"], "recording_events", 1),
  d("O2", "疫苗／用藥／補充品", "operational_action", "action", ["vaccination", "medication", "supplement"], ["content"], ["houseId", "flockId"], [], "operational_actions", 0),
  d("O3", "出雞", "operational_event", "event", ["shipment"], ["quantity", "sex"], ["houseId", "flockId", "totalWeight"], ["averageWeight"], "operational_events", -1),
  d("O4", "磅重", "operational_event", "event", ["weigh"], ["houseId", "flockId", "averageWeight", "sex"], ["chickInDate"], ["ageDays"], "recording_events", 0),
  d("O5", "叫飼料", "operational_action", "action", ["feed_order"], ["vendor", "weight", "weightUnit"], ["houseId"], [], "operational_actions", 0),
  d("O6", "送驗", "operational_action", "action", ["lab_test"], ["submittedAt", "content", "workflowStatus"], ["houseId", "flockId", "result", "completedAt"], ["reminderDueAt"], "operational_actions", 0),
  d("O7", "清消", "operational_action", "action", ["disinfection"], ["workflowStatus"], ["houseId", "flockId"], [], "operational_actions", 0),
  d("O8", "設備維護", "operational_action", "action", ["maintenance"], ["maintenanceContent"], ["houseId"], [], "operational_actions", 0),
  d("O9", "死亡／淘汰", "operational_event", "event", ["mortality", "cull"], ["quantity"], ["houseId", "flockId", "sex"], [], "operational_events", -1),
  d("A1", "死亡異常", "operational_observation", "observation", ["mortality_abnormality"], ["extent", "linkedMortalityEventId"], ["houseId", "flockId", "detail"], [], "abnormal_events", 0),
  d("A2", "咳嗽", "operational_observation", "observation", ["cough"], ["extent"], ["houseId", "flockId", "detail"], [], "abnormal_events", 0),
  d("A3", "喘／呼吸困難", "operational_observation", "observation", ["respiratory_distress"], ["extent"], ["houseId", "flockId", "detail"], [], "abnormal_events", 0),
  d("A4", "精神不振／活動下降", "operational_observation", "observation", ["activity_down"], ["extent"], ["houseId", "flockId", "detail"], [], "abnormal_events", 0),
  d("A5", "外觀", "operational_observation", "observation", ["eye_swelling", "white_crown", "purple_crown", "black_crown"], ["extent"], ["houseId", "flockId", "detail"], [], "abnormal_events", 0),
  d("A6", "下痢", "operational_observation", "observation", ["watery", "white", "green", "bloody"], ["extent"], ["houseId", "flockId", "detail"], [], "abnormal_events", 0),
  d("A7", "生長遲緩", "operational_observation", "observation", ["growth_delay"], ["extent"], ["houseId", "flockId", "detail"], [], "abnormal_events", 0),
  d("A8", "臭腳", "operational_observation", "observation", ["foot_odor"], ["extent"], ["houseId", "flockId", "detail"], [], "abnormal_events", 0),
  d("A9", "發燒", "operational_observation", "observation", ["fever"], ["extent"], ["houseId", "flockId", "measuredTemperature", "detail"], [], "abnormal_events", 0),
  d("A10", "緊迫", "operational_observation", "observation", ["heat_stress", "catching_stress"], ["extent"], ["houseId", "flockId", "detail"], [], "abnormal_events", 0),
  d("A11", "採食／飲水異常", "operational_observation", "observation", ["feeding_abnormality", "water_abnormality"], ["extent"], ["houseId", "flockId", "measurement", "detail"], [], "abnormal_events", 0),
  d("A12", "設備異常", "operational_observation", "observation", ["feed", "water", "electricity", "fan", "cooling", "heating", "other"], ["extent"], ["houseId", "flockId", "detail"], [], "abnormal_events", 0),
  d("A13", "天候異常", "operational_observation", "observation", ["high_temperature", "low_temperature", "heavy_rain"], ["extent"], ["houseId", "flockId", "measurement"], [], "abnormal_events", 0),
  d("A14", "淹水", "operational_observation", "observation", ["flooding"], ["extent"], ["houseId", "flockId", "detail"], [], "abnormal_events", 0),
  d("A15", "異味", "operational_observation", "observation", ["odor"], ["extent"], ["houseId", "flockId", "detail"], [], "abnormal_events", 0),
  d("A16", "場地事件", "operational_observation", "observation", ["attack", "infection", "spread"], ["extent"], ["houseId", "flockId", "detail", "evidence"], [], "abnormal_events", 0),
]);

const BY_ID = new Map(RECORDING_TAXONOMY.map((definition) => [definition.id, definition]));

export function recordingDefinition(id: TaxonomyId): RecordingDefinition {
  const definition = BY_ID.get(id);
  if (!definition) throw new Error("unknown_recording_taxonomy");
  return definition;
}

export function destinationForTaxonomy(id: TaxonomyId): CanonicalDestination {
  return recordingDefinition(id).destination;
}

export function deriveRecordingFields(input: Record<string, unknown>): Record<string, unknown> {
  const derived: Record<string, unknown> = {};
  if (input.subtype === "chick_in" && Number.isSafeInteger(Number(input.maleCount)) && Number.isSafeInteger(Number(input.femaleCount))) {
    derived.totalCount = Number(input.maleCount) + Number(input.femaleCount);
  }
  if (input.subtype === "shipment" && Number(input.quantity) > 0 && Number.isFinite(Number(input.totalWeight))) {
    derived.averageWeight = Number(input.totalWeight) / Number(input.quantity);
  }
  if (input.subtype === "weigh" && typeof input.chickInDate === "string" && typeof input.occurredAt === "string") {
    const occurred = Date.parse(input.occurredAt.slice(0, 10) + "T00:00:00Z");
    const chickIn = Date.parse(input.chickInDate + "T00:00:00Z");
    const elapsed = (occurred - chickIn) / 86400000;
    if (Number.isInteger(elapsed) && elapsed >= 0) derived.ageDays = elapsed;
  }
  if (input.subtype === "lab_test" && typeof input.submittedAt === "string" && Number.isFinite(Date.parse(input.submittedAt))) {
    derived.reminderDueAt = new Date(Date.parse(input.submittedAt) + 3 * 86400000).toISOString();
  }
  return derived;
}
