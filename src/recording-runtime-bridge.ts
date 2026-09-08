import {
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
import { createRecordCommand, routeForRecordCommand, type RecordCommand } from "./record-command";

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
  source_event_id: string;
  client_operation_id?: string | null;
  source_channel?: RecordingSourceChannel | null;
  created_at: string;
  reversed_at?: string | null;
  taxonomy_id?: TaxonomyId | null;
  subtype?: string | null;
  sex?: string | null;
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
  status?: "active" | "reversed" | "corrected" | "reversal" | null;
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
    ...(row.sex ? { sex: row.sex } : {}),
    sourceChannel,
    rawText: row.raw_message,
    clientOperationId: row.client_operation_id || row.source_event_id,
    quantity: row.quantity,
    ...(row.reversed_at ? { lifecycleStatus: "reversed" } : {}),
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
    ...(row.extent ? { extent: row.extent } : {}),
    ...(row.linked_mortality_event_id ? { linkedMortalityEventId: row.linked_mortality_event_id } : {}),
    ...(row.detail ? { detail: row.detail } : {}),
    ...(row.measured_temperature !== undefined && row.measured_temperature !== null ? { measuredTemperature: row.measured_temperature } : {}),
    ...(row.measurement ? { measurement: row.measurement } : {}),
    ...(row.evidence ? { evidence: row.evidence } : {}),
    ...(row.actor_id ? { actorId: row.actor_id } : {}),
    lifecycleStatus: row.status === "reversal" ? "reversed" : row.status || "active",
  });
  validateRecordingDraft(draft);
  return draft;
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
