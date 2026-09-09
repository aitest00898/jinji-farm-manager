import {
  normalizeRecordingDraft,
  validateRecordingDraft,
  type RecordingDraft,
  type TaxonomyId,
} from "./recording-taxonomy";
import {
  readLegacyAbnormalEvent,
  readLegacyOperationalAction,
  readLegacyOperationalEvent,
  type LegacyAbnormalEventRow,
  type LegacyOperationalActionRow,
  type LegacyOperationalEventRow,
} from "./recording-runtime-bridge";
import {
  canonicalDestinationForTaxonomy,
  createRecordCommand,
} from "./record-command";
import type { CanonicalPersistenceDestination } from "./recording-runtime-bridge";

/**
 * The read-side counterpart of RecordCommand.
 *
 * SQL rows are converted here, once, into the canonical domain shape used by
 * Web and future LINE read surfaces.  Consumers must not rebuild a command
 * from the four tables or from lossy labels.  A row that cannot be validated
 * from source-backed fields is still visible, but is explicitly unsafe for a
 * correction/reversal seed.
 */

export type CanonicalReadStatus = "valid" | "unsafe";
export type CanonicalEffectiveStatus = "active" | "corrected" | "reversed" | "replacement";

export interface CanonicalRecordLineageView {
  correctionOfId: string | null;
  reversalOfId: string | null;
  replacementOfId: string | null;
  correctedById: string | null;
  reversedById: string | null;
  replacedById: string | null;
}

export interface CanonicalRecordView {
  id: string;
  organizationId: string;
  taxonomyId: TaxonomyId;
  family: string;
  type: string;
  subtype: string;
  destination: CanonicalPersistenceDestination;
  occurredAt: string;
  createdAt: string;
  farmId: string;
  farmName: string | null;
  environment: "production" | "test";
  houseId: string | null;
  houseName: string | null;
  flockId: string | null;
  flockCode: string | null;
  sourceChannel: string;
  sourceMessageId: string | null;
  sourceCandidateId: string | null;
  rawText: string;
  actorId: string | null;
  confirmedBy: string | null;
  clientOperationId: string;
  lifecycleStatus: CanonicalEffectiveStatus;
  effectiveStatus: CanonicalEffectiveStatus;
  isEffective: boolean;
  readStatus: CanonicalReadStatus;
  readErrorCode: string | null;
  correctionSafe: boolean;
  reversalSafe: boolean;
  correctionBlockReason: string | null;
  reversalBlockReason: string | null;
  lineage: CanonicalRecordLineageView;
  record: RecordingDraft | null;
  correctionSeed: RecordingDraft | null;
  reversalSeed: RecordingDraft | null;
  fields: Record<string, unknown>;
  derivedFields: Record<string, unknown>;
}

export interface CanonicalRecordReadQuery {
  organizationId: string;
  environment: "production" | "test";
  farmId?: string | null;
  limit?: number;
}

export interface CanonicalRecordReadResult {
  records: CanonicalRecordView[];
  environment: "production" | "test";
}

interface ReadRowBase {
  id: string;
  organization_id: string;
  farm_id: string;
  farmName?: string | null;
  environment: "production" | "test";
  houseName?: string | null;
  flockCode?: string | null;
}

interface ProjectedRecord {
  view: CanonicalRecordView;
  record: RecordingDraft | null;
}

type RelationKind = "correction" | "reversal" | "replacement";

function nullableString(value: unknown): string | null {
  return value === undefined || value === null || value === "" ? null : String(value);
}

function stringValue(value: unknown): string {
  return String(value ?? "");
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "CANONICAL_RECORD_READ_UNSAFE";
}

function lineageFrom(record: RecordingDraft | null): CanonicalRecordLineageView {
  return {
    correctionOfId: nullableString(record?.correctionOfId),
    reversalOfId: nullableString(record?.reversalOfId),
    replacementOfId: nullableString(record?.replacementOfId),
    correctedById: null,
    reversedById: null,
    replacedById: null,
  };
}

function relationFrom(record: RecordingDraft | null): { kind: RelationKind; id: string } | null {
  if (!record) return null;
  const relations = ([
    ["correction", record.correctionOfId],
    ["reversal", record.reversalOfId],
    ["replacement", record.replacementOfId],
  ] as Array<[RelationKind, unknown]>).filter(([, id]) => id !== undefined && id !== null && id !== "");
  if (relations.length !== 1) return null;
  return { kind: relations[0][0], id: String(relations[0][1]) };
}

function fieldsFor(record: RecordingDraft | null): Record<string, unknown> {
  if (!record) return {};
  const excluded = new Set([
    "id", "taxonomyId", "family", "type", "subtype", "occurredAt", "createdAt", "farmId",
    "houseId", "flockId", "sourceChannel", "sourceMessageId", "sourceCandidateId", "rawText",
    "actorId", "confirmedBy", "clientOperationId", "correctionOfId", "reversalOfId",
    "replacementOfId", "lifecycleStatus",
  ]);
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => !excluded.has(key) && value !== undefined && value !== null));
}

function derivedFieldsFor(record: RecordingDraft | null): Record<string, unknown> {
  if (!record) return {};
  const values: Record<string, unknown> = {};
  const fields = ["totalCount", "averageWeight", "ageDays", "reminderDueAt"];
  for (const field of fields) if (record[field] !== undefined && record[field] !== null) values[field] = record[field];
  return values;
}

function seedFor(record: RecordingDraft | null): RecordingDraft | null {
  if (!record) return null;
  const seed: RecordingDraft = { ...record };
  delete seed.correctionOfId;
  delete seed.reversalOfId;
  delete seed.replacementOfId;
  seed.lifecycleStatus = "active";
  try {
    validateRecordingDraft(seed);
    createRecordCommand(seed);
    return seed;
  } catch {
    return null;
  }
}

function createView(
  row: ReadRowBase,
  record: RecordingDraft | null,
  unsafeCode: string | null,
  destination: CanonicalPersistenceDestination,
): ProjectedRecord {
  const lineage = lineageFrom(record);
  const relation = relationFrom(record);
  const rawLifecycle = nullableString(record?.lifecycleStatus);
  const lifecycleStatus: CanonicalEffectiveStatus = relation?.kind === "reversal"
    ? "reversed"
    : relation?.kind === "correction" || relation?.kind === "replacement"
      ? "replacement"
      : rawLifecycle === "reversed" || rawLifecycle === "corrected" || rawLifecycle === "replacement"
        ? rawLifecycle
        : "active";
  const taxonomyId = String(record?.taxonomyId || "") as TaxonomyId;
  const safeSeed = unsafeCode ? null : seedFor(record);
  const view: CanonicalRecordView = {
    id: stringValue(row.id || record?.id),
    organizationId: stringValue(row.organization_id),
    taxonomyId,
    family: stringValue(record?.family),
    type: stringValue(record?.type),
    subtype: stringValue(record?.subtype),
    destination,
    occurredAt: stringValue(record?.occurredAt),
    createdAt: stringValue(record?.createdAt),
    farmId: stringValue(row.farm_id || record?.farmId),
    farmName: nullableString(row.farmName),
    environment: row.environment,
    houseId: nullableString(record?.houseId),
    houseName: nullableString(row.houseName),
    flockId: nullableString(record?.flockId),
    flockCode: nullableString(row.flockCode),
    sourceChannel: stringValue(record?.sourceChannel),
    sourceMessageId: nullableString(record?.sourceMessageId),
    sourceCandidateId: nullableString(record?.sourceCandidateId),
    rawText: stringValue(record?.rawText),
    actorId: nullableString(record?.actorId),
    confirmedBy: nullableString(record?.confirmedBy),
    clientOperationId: stringValue(record?.clientOperationId),
    lifecycleStatus,
    effectiveStatus: lifecycleStatus,
    // A correction/replacement is the current business fact; a reversal is an
    // append-only status fact that cancels its parent without becoming a second
    // effective quantity. Parent status is finalized below from child rows.
    isEffective: relation?.kind !== "reversal",
    readStatus: unsafeCode ? "unsafe" : "valid",
    readErrorCode: unsafeCode,
    correctionSafe: Boolean(safeSeed),
    reversalSafe: Boolean(safeSeed && !relation),
    correctionBlockReason: safeSeed ? null : "CANONICAL_RECORD_CORRECTION_SEED_UNSAFE",
    reversalBlockReason: safeSeed && !relation ? null : !safeSeed ? "CANONICAL_RECORD_REVERSAL_SEED_UNSAFE" : "CANONICAL_RECORD_NOT_EFFECTIVE",
    lineage,
    record,
    correctionSeed: safeSeed,
    reversalSeed: safeSeed,
    fields: fieldsFor(record),
    derivedFields: derivedFieldsFor(record),
  };
  return { view, record };
}

function safeRead<T>(read: () => T): { record: T | null; error: string | null } {
  try {
    return { record: read(), error: null };
  } catch (error) {
    return { record: null, error: errorCode(error) };
  }
}

function projectRecordingEvent(row: ReadRowBase & Record<string, unknown>): ProjectedRecord {
  const read = safeRead(() => {
    const record = normalizeRecordingDraft({
      id: row.id,
      taxonomyId: row.taxonomy_id,
      family: row.family,
      type: row.canonical_type,
      subtype: row.subtype,
      occurredAt: row.occurred_at,
      createdAt: row.created_at,
      farmId: row.farm_id,
      houseId: row.house_id,
      flockId: row.flock_id,
      maleCount: row.male_count,
      femaleCount: row.female_count,
      totalCount: row.total_count,
      condition: row.condition,
      sex: row.sex,
      chickInDate: row.chick_in_date,
      averageWeight: row.average_weight,
      weightUnit: row.weight_unit,
      ageDays: row.age_days,
      sourceChannel: row.source_channel,
      sourceMessageId: row.source_message_id,
      sourceCandidateId: row.source_candidate_id,
      rawText: row.raw_text,
      actorId: row.actor_id,
      confirmedBy: row.confirmed_by,
      clientOperationId: row.client_operation_id,
      correctionOfId: row.correction_of_id,
      reversalOfId: row.reversal_of_id,
      replacementOfId: row.replacement_of_id,
      lifecycleStatus: row.lifecycle_status,
    });
    validateRecordingDraft(record);
    return record;
  });
  return createView(row, read.record, read.error, "recording_events");
}

function projectOperationalAction(row: ReadRowBase & Record<string, unknown>): ProjectedRecord {
  const read = safeRead(() => {
    const input: LegacyOperationalActionRow = {
      id: stringValue(row.id),
      organization_id: stringValue(row.organization_id),
      farm_id: stringValue(row.farm_id),
      house_id: nullableString(row.house_id),
      flock_id: nullableString(row.flock_id),
      taxonomy_id: row.taxonomy_id as TaxonomyId,
      family: nullableString(row.family),
      canonical_type: nullableString(row.canonical_type),
      subtype: nullableString(row.subtype),
      occurred_at: nullableString(row.occurred_at),
      created_at: stringValue(row.created_at),
      content: nullableString(row.content),
      vendor: nullableString(row.vendor),
      weight: row.weight as number | null,
      weight_unit: nullableString(row.weight_unit),
      submitted_at: nullableString(row.submitted_at),
      workflow_status: nullableString(row.workflow_status),
      result: nullableString(row.result),
      completed_at: nullableString(row.completed_at),
      reminder_due_at: nullableString(row.reminder_due_at),
      maintenance_content: nullableString(row.maintenance_content),
      source_channel: row.source_channel as LegacyOperationalActionRow["source_channel"],
      source_message_id: nullableString(row.source_message_id),
      source_candidate_id: nullableString(row.source_candidate_id),
      raw_text: stringValue(row.raw_text),
      actor_id: nullableString(row.actor_id),
      confirmed_by: nullableString(row.confirmed_by),
      client_operation_id: nullableString(row.client_operation_id),
      correction_of_id: nullableString(row.correction_of_id),
      reversal_of_id: nullableString(row.reversal_of_id),
      replacement_of_id: nullableString(row.replacement_of_id),
      lifecycle_status: row.lifecycle_status as LegacyOperationalActionRow["lifecycle_status"],
    };
    return readLegacyOperationalAction(input);
  });
  return createView(row, read.record, read.error, "operational_actions");
}

function projectOperationalEvent(row: ReadRowBase & Record<string, unknown>): ProjectedRecord {
  const read = safeRead(() => {
    const input: LegacyOperationalEventRow = {
      id: stringValue(row.id),
      organization_id: stringValue(row.organization_id),
      farm_id: stringValue(row.farm_id),
      line_group_id: nullableString(row.line_group_id),
      line_user_id: nullableString(row.line_user_id),
      intent: row.intent as LegacyOperationalEventRow["intent"],
      quantity: Number(row.quantity),
      unit: stringValue(row.unit),
      event_date: stringValue(row.event_date),
      occurred_at: nullableString(row.occurred_at),
      house_id: nullableString(row.house_id),
      flock_id: nullableString(row.flock_id),
      raw_message: stringValue(row.raw_message),
      note: nullableString(row.note),
      source_event_id: stringValue(row.source_event_id),
      client_operation_id: nullableString(row.source_event_id),
      source_channel: row.source_channel as LegacyOperationalEventRow["source_channel"],
      created_at: stringValue(row.created_at),
      reversed_at: nullableString(row.reversed_at),
      taxonomy_id: row.taxonomy_id as TaxonomyId | null,
      subtype: nullableString(row.subtype),
      sex: nullableString(row.sex),
      total_weight: row.total_weight as number | null,
      average_weight: row.average_weight as number | null,
      weight_unit: nullableString(row.weight_unit),
      correction_of_id: nullableString(row.correction_of_event_id),
      reversal_of_id: nullableString(row.reversal_of_event_id),
      replacement_of_id: null,
    };
    return readLegacyOperationalEvent(input);
  });
  return createView(row, read.record, read.error, "operational_events");
}

function projectAbnormalEvent(row: ReadRowBase & Record<string, unknown>): ProjectedRecord {
  const read = safeRead(() => {
    const input: LegacyAbnormalEventRow = {
      id: stringValue(row.id),
      organization_id: stringValue(row.organization_id),
      farm_id: stringValue(row.farm_id),
      house_id: nullableString(row.house_id),
      flock_id: nullableString(row.flock_id),
      occurred_at: nullableString(row.occurred_at),
      occurred_date: stringValue(row.occurred_date),
      reported_at: stringValue(row.reported_at),
      raw_text: stringValue(row.raw_text),
      source: row.source as LegacyAbnormalEventRow["source"],
      source_event_id: stringValue(row.source_event_id),
      created_at: stringValue(row.created_at),
      taxonomy_id: row.taxonomy_id as TaxonomyId | null,
      family: nullableString(row.family),
      canonical_type: nullableString(row.canonical_type),
      subtype: nullableString(row.subtype),
      extent: nullableString(row.extent),
      linked_mortality_event_id: nullableString(row.linked_mortality_event_id),
      detail: nullableString(row.detail),
      measured_temperature: row.measured_temperature as number | null,
      measurement: nullableString(row.measurement),
      evidence: nullableString(row.evidence),
      actor_id: nullableString(row.actor_id),
      status: row.status as LegacyAbnormalEventRow["status"],
      source_candidate_id: nullableString(row.source_candidate_id),
      correction_of_id: nullableString(row.correction_of_id),
      reversal_of_id: nullableString(row.reversal_of_id),
      replacement_of_id: nullableString(row.replacement_of_id),
    };
    return readLegacyAbnormalEvent(input);
  });
  return createView(row, read.record, read.error, "abnormal_events");
}

function applyLineageStatus(projected: ProjectedRecord[]): CanonicalRecordView[] {
  const byParent = new Map<string, Array<{ kind: RelationKind; child: CanonicalRecordView }>>();
  for (const item of projected) {
    const relation = relationFrom(item.record);
    if (!relation) continue;
    const children = byParent.get(relation.id) || [];
    children.push({ kind: relation.kind, child: item.view });
    byParent.set(relation.id, children);
  }
  return projected.map(({ view }) => {
    const children = byParent.get(view.id) || [];
    const reversal = children.find((child) => child.kind === "reversal");
    const correction = children.find((child) => child.kind === "correction");
    const replacement = children.find((child) => child.kind === "replacement");
    const effectiveStatus: CanonicalEffectiveStatus = reversal
      ? "reversed"
      : correction || replacement
        ? "corrected"
        : view.effectiveStatus;
    const lineage: CanonicalRecordLineageView = {
      ...view.lineage,
      correctedById: correction?.child.id || null,
      reversedById: reversal?.child.id || null,
      replacedById: replacement?.child.id || null,
    };
    const isEffective = view.isEffective && !reversal && !correction && !replacement;
    const safe = view.readStatus === "valid" && Boolean(view.correctionSeed);
    return {
      ...view,
      effectiveStatus,
      isEffective,
      lineage,
      correctionSafe: safe && isEffective,
      reversalSafe: safe && isEffective,
      correctionBlockReason: safe && isEffective ? null : view.correctionBlockReason || "CANONICAL_RECORD_NOT_EFFECTIVE",
      reversalBlockReason: safe && isEffective ? null : view.reversalBlockReason || "CANONICAL_RECORD_NOT_EFFECTIVE",
    };
  });
}

export function projectCanonicalRecordViews(rows: {
  recordingEvents?: Array<ReadRowBase & Record<string, unknown>>;
  operationalActions?: Array<ReadRowBase & Record<string, unknown>>;
  operationalEvents?: Array<ReadRowBase & Record<string, unknown>>;
  abnormalEvents?: Array<ReadRowBase & Record<string, unknown>>;
}, limit = 100): CanonicalRecordView[] {
  const projected = [
    ...(rows.recordingEvents || []).map(projectRecordingEvent),
    ...(rows.operationalActions || []).map(projectOperationalAction),
    ...(rows.operationalEvents || []).map(projectOperationalEvent),
    ...(rows.abnormalEvents || []).map(projectAbnormalEvent),
  ];
  return applyLineageStatus(projected)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)) || String(right.id).localeCompare(String(left.id)))
    .slice(0, Math.max(1, Math.min(100, limit)));
}

export async function readCanonicalRecordModel(
  env: { DB: D1Database },
  query: CanonicalRecordReadQuery,
): Promise<CanonicalRecordReadResult> {
  const farmClause = query.farmId ? " AND e.farm_id = ?" : "";
  const bind = query.farmId
    ? [query.organizationId, query.environment, query.farmId]
    : [query.organizationId, query.environment];
  const [recordingEvents, operationalActions, operationalEvents, abnormalEvents] = await Promise.all([
    env.DB.prepare(
      `SELECT e.id, e.organization_id, e.taxonomy_id, e.family, e.canonical_type,
              e.subtype, e.occurred_at, e.created_at, e.farm_id, e.house_id, e.flock_id,
              e.male_count, e.female_count, e.total_count, e.condition, e.sex,
              e.chick_in_date, e.average_weight, e.weight_unit, e.age_days,
              e.source_channel, e.source_message_id, e.source_candidate_id, e.raw_text,
              e.actor_id, e.confirmed_by, e.client_operation_id,
              e.correction_of_id, e.reversal_of_id, e.replacement_of_id, e.lifecycle_status,
              f.name AS farmName, f.environment, h.name AS houseName, k.batch_code AS flockCode
         FROM recording_events e
         JOIN farms f ON f.id = e.farm_id
         LEFT JOIN houses h ON h.id = e.house_id
         LEFT JOIN flocks k ON k.id = e.flock_id
        WHERE e.organization_id = ? AND f.environment = ?${farmClause}`,
    ).bind(...bind).all<ReadRowBase & Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT e.id, e.organization_id, e.taxonomy_id, e.family, e.canonical_type,
              e.subtype, e.occurred_at, e.created_at, e.farm_id, e.house_id, e.flock_id,
              e.content, e.vendor, e.weight, e.weight_unit, e.submitted_at,
              e.workflow_status, e.result, e.completed_at, e.reminder_due_at,
              e.maintenance_content, e.source_channel, e.source_message_id,
              e.source_candidate_id, e.raw_text, e.actor_id, e.confirmed_by,
              e.client_operation_id, e.correction_of_id, e.reversal_of_id,
              e.replacement_of_id, e.lifecycle_status,
              f.name AS farmName, f.environment, h.name AS houseName, k.batch_code AS flockCode
         FROM operational_actions e
         JOIN farms f ON f.id = e.farm_id
         LEFT JOIN houses h ON h.id = e.house_id
         LEFT JOIN flocks k ON k.id = e.flock_id
        WHERE e.organization_id = ? AND f.environment = ?${farmClause}`,
    ).bind(...bind).all<ReadRowBase & Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT e.id, e.organization_id, e.farm_id, e.line_group_id, e.line_user_id,
              e.intent, e.quantity, e.unit, e.event_date, e.house_id, e.flock_id,
              e.raw_message, e.note, e.source_event_id, e.created_at, e.reversed_at,
              e.taxonomy_id, e.family, e.canonical_type, e.subtype, e.sex,
              e.total_weight, e.average_weight, e.weight_unit, e.occurred_at,
              e.source_channel, e.reversal_of_event_id, e.correction_of_event_id,
              f.name AS farmName, f.environment, h.name AS houseName, k.batch_code AS flockCode
         FROM operational_events e
         JOIN farms f ON f.id = e.farm_id
         LEFT JOIN houses h ON h.id = e.house_id
         LEFT JOIN flocks k ON k.id = e.flock_id
        WHERE e.organization_id = ? AND f.environment = ?
          AND e.intent IN ('shipment', 'mortality', 'cull')${farmClause}`,
    ).bind(...bind).all<ReadRowBase & Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT e.id, e.organization_id, e.farm_id, e.house_id, e.flock_id,
              e.occurred_at, e.occurred_date, e.reported_at, e.raw_text, e.source,
              e.actor_id, e.status, e.source_event_id, e.created_at,
              e.taxonomy_id, e.family, e.canonical_type, e.subtype, e.extent,
              e.linked_mortality_event_id, e.detail, e.measured_temperature,
              e.measurement, e.evidence, e.source_candidate_id, e.source_channel,
              e.correction_of_id, e.reversal_of_id, f.name AS farmName,
              f.environment, h.name AS houseName, k.batch_code AS flockCode
         FROM abnormal_events e
         JOIN farms f ON f.id = e.farm_id
         LEFT JOIN houses h ON h.id = e.house_id
         LEFT JOIN flocks k ON k.id = e.flock_id
        WHERE e.organization_id = ? AND f.environment = ?
          AND e.taxonomy_id IS NOT NULL${farmClause}`,
    ).bind(...bind).all<ReadRowBase & Record<string, unknown>>(),
  ]);
  return {
    records: projectCanonicalRecordViews({
      recordingEvents: recordingEvents.results,
      operationalActions: operationalActions.results,
      operationalEvents: operationalEvents.results,
      abnormalEvents: abnormalEvents.results,
    }, query.limit ?? 100),
    environment: query.environment,
  };
}

export function canonicalReadDestinationFor(taxonomyId: TaxonomyId): CanonicalPersistenceDestination {
  return canonicalDestinationForTaxonomy(taxonomyId);
}
