import {
  RECORDING_TAXONOMY,
  normalizeRecordingDraft,
  parseCanonicalRecordingText,
  taxonomyDefinitionFor,
  validateRecordingDraft,
  type CanonicalTextParse,
  type RecordingDraft,
  type RecordingSex,
  type RecordingSourceChannel,
  type TaxonomyId,
} from "./recording-taxonomy";
import { canonicalDestinationForTaxonomy, createRecordCommand, routeForRecordCommand, type RecordCommand } from "./record-command";

/**
 * Local-only proof boundary for the future canonical recording adapter.
 * This module constructs and routes validated records but never writes D1,
 * sends LINE, enqueues Queue work, or authorizes a Production operation.
 */

export interface ResolvedRecordingScope {
  kind: "direct" | "candidates" | "none";
  farmId?: string;
  houseId?: string;
  flockId?: string;
  wholeFarmConfirmed?: boolean;
}

export interface RecordingIdentity {
  id: string;
  sourceChannel: RecordingSourceChannel;
  rawText: string;
  occurredAt: string;
  createdAt: string;
  clientOperationId: string;
  sourceMessageId?: string;
  actorId?: string;
  confirmedBy?: string;
}

export type CanonicalPersistenceDestination =
  | "operational_events"
  | "recording_events"
  | "operational_actions"
  | "abnormal_events";

export interface CanonicalPersistenceRoute {
  taxonomyId: TaxonomyId;
  destination: CanonicalPersistenceDestination;
  authoritative: true;
  parallelAuthoritativeDestinations: readonly [];
  legacyIntent?: "mortality" | "cull" | "shipment";
  stockEffect: -1 | 0 | 1;
  requiresHumanConfirmation: boolean;
}

export type RecordingReadBridge = "canonical_recording_events" | "readLegacyOperationalEvent" | "readLegacyOperationalAction" | "readLegacyAbnormalEvent";

export interface RecordingAdapterMatrixRow {
  taxonomyId: TaxonomyId;
  destination: CanonicalPersistenceDestination;
  requiredFields: readonly string[];
  commandFields: readonly string[];
  storageFields: readonly string[];
  readBridge: RecordingReadBridge;
  correctionBridge: "validateRecordingLineage";
}

function storageFieldFor(field: string): string {
  return field.replace(/[A-Z]/gu, (value) => "_" + value.toLowerCase());
}

/**
 * One small, source-derived matrix for the migration review. It is metadata
 * only: it does not create an adapter, write a row, or change the authoritative
 * destination. Required and command fields intentionally remain the same
 * canonical names; storageFields show their snake_case D1 counterparts.
 */
export function recordingAdapterMatrix(): readonly RecordingAdapterMatrixRow[] {
  return Object.freeze(RECORDING_TAXONOMY.map((definition) => {
    const readBridge: RecordingReadBridge = definition.id === "O1" || definition.id === "O4"
      ? "canonical_recording_events"
      : definition.family === "operational_observation"
      ? "readLegacyAbnormalEvent"
      : definition.id === "O2" || definition.id === "O5" || definition.id === "O6" || definition.id === "O7" || definition.id === "O8"
        ? "readLegacyOperationalAction"
        : "readLegacyOperationalEvent";
    return Object.freeze({
      taxonomyId: definition.id,
      destination: canonicalDestinationForTaxonomy(definition.id),
      requiredFields: Object.freeze([...definition.requiredFields]),
      commandFields: Object.freeze([...definition.requiredFields]),
      storageFields: Object.freeze(definition.requiredFields.map(storageFieldFor)),
      readBridge,
      correctionBridge: "validateRecordingLineage" as const,
    });
  }));
}

export interface LegacyOperationalEventRow {
  id: string;
  organization_id: string;
  farm_id: string;
  line_group_id?: string | null;
  line_user_id?: string | null;
  intent: "mortality" | "cull" | "feed" | "water" | "shipment";
  quantity: number;
  unit: string;
  event_date: string;
  occurred_at?: string | null;
  house_id?: string | null;
  flock_id?: string | null;
  raw_message: string;
  raw_farm_text?: string | null;
  house?: string | null;
  note?: string | null;
  source_event_id: string;
  client_operation_id?: string | null;
  source_channel?: RecordingSourceChannel | null;
  created_at: string;
  reversed_at?: string | null;
  taxonomy_id?: TaxonomyId | null;
  family?: string | null;
  canonical_type?: string | null;
  subtype?: string | null;
  sex?: string | null;
  total_weight?: number | null;
  average_weight?: number | null;
  weight_unit?: string | null;
  correction_of_id?: string | null;
  reversal_of_id?: string | null;
  replacement_of_id?: string | null;
}

export interface LegacyOperationalActionRow {
  id: string;
  organization_id: string;
  farm_id: string;
  house_id?: string | null;
  flock_id?: string | null;
  taxonomy_id?: TaxonomyId | null;
  family?: string | null;
  canonical_type?: string | null;
  subtype?: string | null;
  occurred_at?: string | null;
  created_at: string;
  content?: string | null;
  vendor?: string | null;
  weight?: number | null;
  weight_unit?: string | null;
  submitted_at?: string | null;
  workflow_status?: string | null;
  result?: string | null;
  completed_at?: string | null;
  reminder_due_at?: string | null;
  maintenance_content?: string | null;
  source_channel?: RecordingSourceChannel | null;
  source_message_id?: string | null;
  source_candidate_id?: string | null;
  raw_text: string;
  actor_id?: string | null;
  confirmed_by?: string | null;
  client_operation_id?: string | null;
  correction_of_id?: string | null;
  reversal_of_id?: string | null;
  replacement_of_id?: string | null;
  lifecycle_status?: "active" | "reversed" | "corrected" | "replacement" | null;
}

export interface LegacyAbnormalEventRow {
  id: string;
  organization_id: string;
  farm_id: string;
  house_id?: string | null;
  flock_id?: string | null;
  occurred_at?: string | null;
  occurred_date: string;
  reported_at: string;
  approximate_period?: string | null;
  raw_text: string;
  source: "line" | "web" | "system";
  source_event_id: string;
  created_at: string;
  taxonomy_id?: TaxonomyId | null;
  family?: string | null;
  canonical_type?: string | null;
  subtype?: string | null;
  extent?: string | null;
  linked_mortality_event_id?: string | null;
  detail?: string | null;
  measured_temperature?: number | null;
  measurement?: string | null;
  evidence?: string | null;
  actor_id?: string | null;
  classification_status?: string | null;
  weather_date?: string | null;
  reason?: string | null;
  status?: "active" | "reversed" | "corrected" | "reversal" | null;
  source_candidate_id?: string | null;
  correction_of_id?: string | null;
  reversal_of_id?: string | null;
  replacement_of_id?: string | null;
}

export interface LegacyOperationalCommandInput {
  id: string;
  intent: "mortality" | "cull" | "feed" | "water" | "shipment";
  quantity: number;
  unit: string;
  farmId: string;
  houseId?: string | null;
  flockId?: string | null;
  occurredAt: string;
  createdAt: string;
  sourceChannel: RecordingSourceChannel;
  rawText: string;
  clientOperationId: string;
  sourceMessageId?: string | null;
  actorId?: string | null;
  confirmedBy?: string | null;
  sex?: RecordingSex | null;
  note?: string | null;
  pendingActionId?: string | null;
}

/**
 * Read-only compatibility adapter for historical operational_events rows.
 * It does not query or mutate D1; callers provide one already-read row.
 */
export function readLegacyOperationalEvent(row: LegacyOperationalEventRow): RecordingDraft {
  const taxonomyId: TaxonomyId = row.taxonomy_id || (
    row.intent === "shipment" ? "O3" : row.intent === "mortality" || row.intent === "cull" ? "O9" : (() => {
      throw new Error("LEGACY_OPERATIONAL_EVENT_NOT_CANONICAL");
    })()
  );
  const subtype = row.subtype || (row.intent === "shipment" ? "shipment" : row.intent);
  const definition = taxonomyDefinitionFor(taxonomyId);
  const sourceChannel = row.source_channel || "line";
  const occurredAt = row.occurred_at || row.event_date + "T00:00:00+08:00";
  const draft = normalizeRecordingDraft({
    id: row.id,
    taxonomyId,
    family: definition.family,
    type: definition.canonicalType,
    subtype,
    occurredAt,
    createdAt: row.created_at,
    farmId: row.farm_id,
    ...(row.house_id ? { houseId: row.house_id } : {}),
    ...(row.flock_id ? { flockId: row.flock_id } : {}),
    ...(row.sex ? { sex: row.sex } : taxonomyId === "O3" ? { sex: "unspecified" } : {}),
    ...(row.total_weight !== undefined && row.total_weight !== null ? { totalWeight: row.total_weight } : {}),
    ...(row.average_weight !== undefined && row.average_weight !== null ? { averageWeight: row.average_weight } : {}),
    ...(row.weight_unit ? { weightUnit: row.weight_unit } : {}),
    sourceChannel,
    rawText: row.raw_message,
    clientOperationId: row.client_operation_id || row.source_event_id,
    sourceMessageId: row.source_event_id,
    ...(row.correction_of_id ? { correctionOfId: row.correction_of_id } : {}),
    ...(row.reversal_of_id ? { reversalOfId: row.reversal_of_id } : {}),
    ...(row.replacement_of_id ? { replacementOfId: row.replacement_of_id } : {}),
    quantity: row.quantity,
    ...(row.reversed_at ? { lifecycleStatus: "reversed" } : {}),
  });
  validateRecordingDraft(draft);
  return draft;
}

/**
 * Read-only compatibility adapter for the canonical operational_actions
 * table. The table is already canonical; missing or non-action taxonomy data
 * is rejected instead of being inferred from an old label or free text.
 */
export function readLegacyOperationalAction(row: LegacyOperationalActionRow): RecordingDraft {
  if (!row.taxonomy_id || !["O2", "O5", "O6", "O7", "O8"].includes(row.taxonomy_id)) {
    fail("LEGACY_OPERATIONAL_ACTION_NOT_CANONICAL");
  }
  if (!row.source_channel || !row.client_operation_id) fail("LEGACY_OPERATIONAL_ACTION_PROVENANCE_REQUIRED");
  const definition = taxonomyDefinitionFor(row.taxonomy_id);
  const draft = normalizeRecordingDraft({
    id: row.id,
    taxonomyId: row.taxonomy_id,
    family: row.family || definition.family,
    type: row.canonical_type || definition.canonicalType,
    subtype: row.subtype,
    occurredAt: row.occurred_at || row.created_at,
    createdAt: row.created_at,
    farmId: row.farm_id,
    ...(row.house_id ? { houseId: row.house_id } : {}),
    ...(row.flock_id ? { flockId: row.flock_id } : {}),
    sourceChannel: row.source_channel,
    sourceMessageId: row.source_message_id || undefined,
    sourceCandidateId: row.source_candidate_id || undefined,
    rawText: row.raw_text,
    actorId: row.actor_id || undefined,
    confirmedBy: row.confirmed_by || undefined,
    clientOperationId: row.client_operation_id,
    ...(row.content ? { content: row.content } : {}),
    ...(row.vendor ? { vendor: row.vendor } : {}),
    ...(row.weight !== undefined && row.weight !== null ? { weight: row.weight } : {}),
    ...(row.weight_unit ? { weightUnit: row.weight_unit } : {}),
    ...(row.submitted_at ? { submittedAt: row.submitted_at } : {}),
    ...(row.workflow_status ? { workflowStatus: row.workflow_status } : {}),
    ...(row.result ? { result: row.result } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.reminder_due_at ? { reminderDueAt: row.reminder_due_at } : {}),
    ...(row.maintenance_content ? { maintenanceContent: row.maintenance_content } : {}),
    ...(row.correction_of_id ? { correctionOfId: row.correction_of_id } : {}),
    ...(row.reversal_of_id ? { reversalOfId: row.reversal_of_id } : {}),
    ...(row.replacement_of_id ? { replacementOfId: row.replacement_of_id } : {}),
    lifecycleStatus: row.lifecycle_status || "active",
  });
  validateRecordingDraft(draft);
  return draft;
}

/**
 * Read-only compatibility adapter for canonical abnormal_events rows. Rows
 * without an explicit taxonomy id are rejected rather than reclassified from
 * an old AI category or free text guess.
 */
export function readLegacyAbnormalEvent(row: LegacyAbnormalEventRow): RecordingDraft {
  if (!row.taxonomy_id || !row.subtype) fail("LEGACY_ABNORMAL_EVENT_NOT_CANONICAL");
  const definition = taxonomyDefinitionFor(row.taxonomy_id);
  const draft = normalizeRecordingDraft({
    id: row.id,
    taxonomyId: row.taxonomy_id,
    family: row.family || definition.family,
    type: row.canonical_type || definition.canonicalType,
    subtype: row.subtype,
    occurredAt: row.occurred_at || row.occurred_date + "T00:00:00+08:00",
    createdAt: row.created_at,
    farmId: row.farm_id,
    ...(row.house_id ? { houseId: row.house_id } : {}),
    ...(row.flock_id ? { flockId: row.flock_id } : {}),
    sourceChannel: row.source,
    rawText: row.raw_text,
    clientOperationId: row.source_event_id,
    sourceCandidateId: row.source_candidate_id || undefined,
    ...(row.extent ? { extent: row.extent } : {}),
    ...(row.linked_mortality_event_id ? { linkedMortalityEventId: row.linked_mortality_event_id } : {}),
    ...(row.detail ? { detail: row.detail } : {}),
    ...(row.measured_temperature !== undefined && row.measured_temperature !== null ? { measuredTemperature: row.measured_temperature } : {}),
    ...(row.measurement ? { measurement: row.measurement } : {}),
    ...(row.evidence ? { evidence: row.evidence } : {}),
    ...(row.actor_id ? { actorId: row.actor_id } : {}),
    ...(row.correction_of_id ? { correctionOfId: row.correction_of_id } : {}),
    ...(row.reversal_of_id ? { reversalOfId: row.reversal_of_id } : {}),
    ...(row.replacement_of_id ? { replacementOfId: row.replacement_of_id } : {}),
    lifecycleStatus: row.status === "reversal" ? "reversed" : row.status || "active",
  });
  validateRecordingDraft(draft);
  return draft;
}

export interface RecordingLineageReference {
  id: string;
  organizationId: string;
  family: string;
  createdAt: string;
}

export interface RecordingLineageInput extends RecordingLineageReference {
  correctionOfId?: string | null;
  reversalOfId?: string | null;
  replacementOfId?: string | null;
}

/**
 * Validates lineage only when the caller has supplied the referenced rows.
 * This keeps the check deterministic and prevents a compatibility adapter from
 * accepting a cross-organization, cross-family, self, or future reference.
 */
export function validateRecordingLineage(input: RecordingLineageInput, references: readonly RecordingLineageReference[]): void {
  const byId = new Map(references.map((reference) => [reference.id, reference]));
  for (const field of ["correctionOfId", "reversalOfId", "replacementOfId"] as const) {
    const referenceId = input[field];
    if (!referenceId) continue;
    if (referenceId === input.id) fail("RECORDING_LINEAGE_SELF_REFERENCE");
    const reference = byId.get(referenceId);
    if (!reference) fail("RECORDING_LINEAGE_REFERENCE_NOT_FOUND");
    if (reference.organizationId !== input.organizationId) fail("RECORDING_LINEAGE_ORGANIZATION_MISMATCH");
    if (reference.family !== input.family) fail("RECORDING_LINEAGE_FAMILY_MISMATCH");
    const inputCreatedAt = Date.parse(input.createdAt);
    const referenceCreatedAt = Date.parse(reference.createdAt);
    if (!Number.isFinite(inputCreatedAt) || !Number.isFinite(referenceCreatedAt) || referenceCreatedAt >= inputCreatedAt) {
      fail("RECORDING_LINEAGE_ORDER_INVALID");
    }
  }
}

/**
 * Builds the shared command for legacy operational writes that have an exact
 * canonical equivalent. Feed/water consumption intentionally returns null:
 * the taxonomy's O5 is a feed order, not a consumption event, so relabelling
 * those rows would invent semantics. Existing legacy persistence remains the
 * authority for that pair until a separately approved taxonomy decision.
 */
export function canonicalCommandForLegacyOperational(input: LegacyOperationalCommandInput): RecordCommand | null {
  if (input.intent === "feed" || input.intent === "water") return null;
  const taxonomyId: TaxonomyId = input.intent === "shipment" ? "O3" : "O9";
  const definition = taxonomyDefinitionFor(taxonomyId);
  const record = normalizeRecordingDraft({
    id: input.id,
    taxonomyId,
    family: definition.family,
    type: definition.canonicalType,
    subtype: input.intent === "shipment" ? "shipment" : input.intent,
    occurredAt: input.occurredAt,
    createdAt: input.createdAt,
    farmId: input.farmId,
    ...(input.houseId ? { houseId: input.houseId } : {}),
    ...(input.flockId ? { flockId: input.flockId } : {}),
    ...(input.sex ? { sex: input.sex } : taxonomyId === "O3" ? { sex: "unspecified" } : {}),
    sourceChannel: input.sourceChannel,
    sourceMessageId: input.sourceMessageId || undefined,
    rawText: input.rawText,
    clientOperationId: input.clientOperationId,
    actorId: input.actorId || undefined,
    confirmedBy: input.confirmedBy || undefined,
    note: input.note || undefined,
    pendingActionId: input.pendingActionId || undefined,
    quantity: input.quantity,
    unit: input.unit,
  });
  validateRecordingDraft(record);
  return createRecordCommand(record);
}

function fail(code: string): never {
  throw new Error(code);
}

function scopeFailure(scope: ResolvedRecordingScope, parsed: CanonicalTextParse): void {
  if (scope.kind !== "direct" || !scope.farmId) fail("RECORDING_SCOPE_UNRESOLVED");
  if (parsed.fields.houseText && !scope.houseId) fail("RECORDING_HOUSE_UNRESOLVED");
  if (parsed.fields.flockText && !scope.flockId) fail("RECORDING_FLOCK_UNRESOLVED");
  if (!parsed.fields.houseText && scope.houseId) fail("RECORDING_HOUSE_SCOPE_NOT_EXPLICIT");
  if (!parsed.fields.flockText && scope.flockId) fail("RECORDING_FLOCK_SCOPE_NOT_EXPLICIT");
  if (!parsed.fields.houseText && !scope.wholeFarmConfirmed) fail("RECORDING_WHOLE_FARM_CONFIRMATION_REQUIRED");
}

export function buildCanonicalRecordingDraft(
  parsed: CanonicalTextParse,
  scope: ResolvedRecordingScope,
  identity: RecordingIdentity,
): RecordingDraft {
  if (parsed.recordWorthiness !== "record" || !parsed.taxonomyId || parsed.missingFields.length > 0) {
    fail("RECORDING_NOT_READY_FOR_PERSISTENCE");
  }
  scopeFailure(scope, parsed);
  const definition = taxonomyDefinitionFor(parsed.taxonomyId);
  const fields = { ...parsed.fields };
  delete fields.farmText;
  delete fields.houseText;
  delete fields.flockText;
  const occurredAt = typeof fields.occurredAt === "string" ? fields.occurredAt : identity.occurredAt;
  delete fields.occurredAt;
  const draft = normalizeRecordingDraft({
    ...fields,
    id: identity.id,
    taxonomyId: parsed.taxonomyId,
    family: definition.family,
    type: definition.canonicalType,
    subtype: parsed.subtype,
    farmId: scope.farmId,
    ...(scope.houseId ? { houseId: scope.houseId } : {}),
    ...(scope.flockId ? { flockId: scope.flockId } : {}),
    sourceChannel: identity.sourceChannel,
    ...(identity.sourceMessageId ? { sourceMessageId: identity.sourceMessageId } : {}),
    rawText: identity.rawText,
    occurredAt,
    createdAt: identity.createdAt,
    clientOperationId: identity.clientOperationId,
    ...(identity.actorId ? { actorId: identity.actorId } : {}),
    ...(identity.confirmedBy ? { confirmedBy: identity.confirmedBy } : {}),
    lifecycleStatus: "active",
  });
  validateRecordingDraft(draft);
  return draft;
}

export function persistenceRouteForCanonicalRecord(record: RecordingDraft): CanonicalPersistenceRoute {
  return routeForRecordCommand(createRecordCommand(record));
}

export function canonicalRouteForText(
  rawText: string,
  scope: ResolvedRecordingScope,
  identity: RecordingIdentity,
): { parsed: CanonicalTextParse; draft: RecordingDraft; route: CanonicalPersistenceRoute; command: RecordCommand } {
  const parsed = parseCanonicalRecordingText(rawText, new Date(identity.createdAt));
  const draft = buildCanonicalRecordingDraft(parsed, scope, identity);
  const command = createRecordCommand(draft);
  return { parsed, draft, route: routeForRecordCommand(command), command };
}
