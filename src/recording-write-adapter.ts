import {
  createRecordCommand,
  type RecordCommand,
} from "./record-command";
import {
  deriveRecordingFields,
  normalizeRecordingDraft,
  taipeiDate,
  validateRecordingDraft,
  type RecordingDraft,
  type RecordingSourceChannel,
  type TaxonomyId,
} from "./recording-taxonomy";
import {
  validateRecordingLineage,
  type CanonicalPersistenceDestination,
  type RecordingLineageReference,
} from "./recording-runtime-bridge";

/**
 * The only D1 write boundary for a canonical RecordCommand.
 *
 * The adapter deliberately owns scope resolution, lineage checks, destination
 * routing, idempotency, audit, and persistence. Web and LINE may build a
 * RecordCommand, but neither channel may write one of the four authorities
 * directly.
 */

export interface CanonicalWriteEnv {
  DB: D1Database;
}

export type CanonicalActorType = "web_admin" | "line_user" | "system";

export interface CanonicalWriteContext {
  organizationId: string;
  actorType: CanonicalActorType;
  actorId?: string | null;
  requestId: string;
  lineGroupId?: string | null;
  lineUserId?: string | null;
  environment?: "production" | "test";
  expectedSourceChannel?: RecordingSourceChannel;
  now?: string;
}

export interface CanonicalWriteResult {
  id: string;
  destination: CanonicalPersistenceDestination;
  taxonomyId: TaxonomyId;
  clientOperationId: string;
  created: boolean;
  stockEffect: -1 | 0 | 1;
  stockDelta: number;
  lineage: {
    kind: "correction" | "reversal" | "replacement" | null;
    referenceId: string | null;
  };
}

export class CanonicalWriteError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, field?: string) {
    super(field ? `${code}:${field}` : code);
    this.name = "CanonicalWriteError";
    this.code = code;
    this.field = field;
  }
}

interface CanonicalFarm {
  id: string;
  name: string;
  environment: "production" | "test";
  structureMode: "whole_farm" | "multi_house";
  active: number;
}

interface CanonicalScope {
  organizationId: string;
  farm: CanonicalFarm;
  houseId: string | null;
  houseName: string | null;
  flockId: string | null;
  lineGroupId: string;
}

interface CanonicalReference extends RecordingLineageReference {
  farmId: string;
  taxonomyId: TaxonomyId;
}

interface Relation {
  kind: "correction" | "reversal" | "replacement";
  id: string;
}

function fail(code: string, field?: string): never {
  throw new CanonicalWriteError(code, field);
}

function nullableText(value: unknown): string | null {
  return value === undefined || value === null || value === "" ? null : String(value);
}

function json(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

function lineageFor(record: RecordingDraft): Relation | null {
  const relations = ([
    ["correction", record.correctionOfId],
    ["reversal", record.reversalOfId],
    ["replacement", record.replacementOfId],
  ] as const).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (relations.length > 1) fail("CANONICAL_LINEAGE_MULTIPLE");
  if (!relations.length) return null;
  return { kind: relations[0][0], id: String(relations[0][1]) };
}

function lifecycleFor(record: RecordingDraft, relation: Relation | null): "active" | "reversed" | "corrected" | "replacement" {
  if (relation?.kind === "reversal") return "reversed";
  if (relation) return "replacement";
  return record.lifecycleStatus === "reversed" || record.lifecycleStatus === "corrected" || record.lifecycleStatus === "replacement"
    ? record.lifecycleStatus
    : "active";
}

function stockDeltaFor(record: RecordingDraft): number {
  if (record.taxonomyId === "O1") return Number(record.totalCount ?? Number(record.maleCount) + Number(record.femaleCount));
  if (record.taxonomyId === "O3" || record.taxonomyId === "O9") return -Number(record.quantity);
  return 0;
}

function sourceForAbnormal(sourceChannel: RecordingSourceChannel): "line" | "web" | "system" {
  return sourceChannel === "line" || sourceChannel === "web" ? sourceChannel : "system";
}

function intentFor(record: RecordingDraft): "mortality" | "cull" | "shipment" {
  if (record.taxonomyId === "O3") return "shipment";
  if (record.subtype === "mortality" || record.subtype === "cull") return record.subtype;
  fail("CANONICAL_OPERATIONAL_INTENT_INVALID", "subtype");
}

async function resolveScope(env: CanonicalWriteEnv, record: RecordingDraft, context: CanonicalWriteContext): Promise<CanonicalScope> {
  const organizationId = context.organizationId;
  const farmId = String(record.farmId);
  const farm = await env.DB.prepare(
    `SELECT id, name, active, environment, farm_structure_mode AS structureMode
       FROM farms
      WHERE id = ? AND organization_id = ?
      LIMIT 1`,
  ).bind(farmId, organizationId).first<CanonicalFarm>();
  if (!farm || farm.active !== 1) fail("CANONICAL_SCOPE_INVALID", "farmId");
  const expectedEnvironment = context.environment ?? "production";
  if (farm.environment !== expectedEnvironment) fail("CANONICAL_ENVIRONMENT_SCOPE_INVALID", "environment");

  const requestedHouseId = record.houseId === undefined || record.houseId === null ? null : String(record.houseId);
  const requestedFlockId = record.flockId === undefined || record.flockId === null ? null : String(record.flockId);
  let houseId = requestedHouseId;
  let houseName: string | null = null;
  if (requestedHouseId) {
    const house = await env.DB.prepare(
      `SELECT h.id, h.name
         FROM houses h
        WHERE h.id = ? AND h.farm_id = ? AND h.active = 1
        LIMIT 1`,
    ).bind(requestedHouseId, farm.id).first<{ id: string; name: string }>();
    if (!house) fail("CANONICAL_SCOPE_INVALID", "houseId");
    houseName = house.name;
  }
  if (farm.structureMode === "multi_house" && !houseId) fail("CANONICAL_SCOPE_HOUSE_REQUIRED", "houseId");

  let flockId = requestedFlockId;
  if (requestedFlockId) {
    const flock = await env.DB.prepare(
      `SELECT id, house_id AS houseId, status
         FROM flocks
        WHERE id = ? AND farm_id = ? AND status <> 'cancelled'
        LIMIT 1`,
    ).bind(requestedFlockId, farm.id).first<{ id: string; houseId: string; status: string }>();
    if (!flock) fail("CANONICAL_SCOPE_INVALID", "flockId");
    if (houseId && flock.houseId !== houseId) fail("CANONICAL_SCOPE_INVALID", "flockId");
    if (!houseId) {
      houseId = flock.houseId;
      const house = await env.DB.prepare("SELECT id, name FROM houses WHERE id = ? AND farm_id = ? AND active = 1 LIMIT 1").bind(houseId, farm.id).first<{ id: string; name: string }>();
      if (house) {
        houseName = house.name;
      } else {
        fail("CANONICAL_SCOPE_INVALID", "houseId");
      }
    }
  }

  if ((record.taxonomyId === "O1" || record.taxonomyId === "O4") && (!houseId || !flockId)) {
    fail("CANONICAL_SCOPE_FLOCK_REQUIRED", "flockId");
  }

  const groupId = context.lineGroupId || `canonical-${record.sourceChannel}-${organizationId}`;
  return { organizationId, farm, houseId, houseName, flockId, lineGroupId: groupId };
}

async function ensureLineGroup(
  env: CanonicalWriteEnv,
  organizationId: string,
  requestedGroupId: string | null | undefined,
  sourceChannel: RecordingSourceChannel,
): Promise<string> {
  const groupId = requestedGroupId || `canonical-${sourceChannel}-${organizationId}`;
  const existing = await env.DB.prepare("SELECT organization_id AS organizationId FROM line_groups WHERE group_id = ? LIMIT 1").bind(groupId).first<{ organizationId: string | null }>();
  if (existing && existing.organizationId && existing.organizationId !== organizationId) fail("CANONICAL_LINE_GROUP_ORGANIZATION_MISMATCH");
  if (requestedGroupId && !existing) fail("CANONICAL_LINE_GROUP_NOT_FOUND", "lineGroupId");
  await env.DB.prepare(
    `INSERT INTO line_groups (group_id, status, organization_id)
     VALUES (?, 'unbound', ?)
     ON CONFLICT(group_id) DO UPDATE SET organization_id = COALESCE(line_groups.organization_id, excluded.organization_id)`,
  ).bind(groupId, organizationId).run();
  return groupId;
}

async function referenceFor(
  env: CanonicalWriteEnv,
  destination: CanonicalPersistenceDestination,
  id: string,
  organizationId: string,
): Promise<CanonicalReference | null> {
  if (destination === "recording_events") {
    const row = await env.DB.prepare(
      `SELECT id, organization_id AS organizationId, farm_id AS farmId,
              family, taxonomy_id AS taxonomyId, created_at AS createdAt
         FROM recording_events
        WHERE id = ? AND organization_id = ? LIMIT 1`,
    ).bind(id, organizationId).first<CanonicalReference>();
    return row ? { ...row, taxonomyId: row.taxonomyId } : null;
  }
  if (destination === "operational_actions") {
    const row = await env.DB.prepare(
      `SELECT id, organization_id AS organizationId, farm_id AS farmId,
              family, taxonomy_id AS taxonomyId, created_at AS createdAt
         FROM operational_actions
        WHERE id = ? AND organization_id = ? LIMIT 1`,
    ).bind(id, organizationId).first<CanonicalReference>();
    return row ? { ...row, taxonomyId: row.taxonomyId } : null;
  }
  if (destination === "operational_events") {
    const row = await env.DB.prepare(
      `SELECT id, organization_id AS organizationId, farm_id AS farmId,
              family, taxonomy_id AS taxonomyId, intent, created_at AS createdAt
         FROM operational_events
        WHERE id = ? AND organization_id = ? LIMIT 1`,
    ).bind(id, organizationId).first<CanonicalReference & { intent: string; taxonomyId: TaxonomyId | null }>();
    if (!row) return null;
    const taxonomyId = row.taxonomyId || (row.intent === "shipment" ? "O3" : row.intent === "mortality" || row.intent === "cull" ? "O9" : null);
    if (!taxonomyId) return null;
    return { ...row, family: row.family || "operational_event", taxonomyId };
  }
  const row = await env.DB.prepare(
    `SELECT id, organization_id AS organizationId, farm_id AS farmId,
            family, taxonomy_id AS taxonomyId, created_at AS createdAt
       FROM abnormal_events
      WHERE id = ? AND organization_id = ? LIMIT 1`,
  ).bind(id, organizationId).first<CanonicalReference>();
  return row ? { ...row, taxonomyId: row.taxonomyId } : null;
}

async function validateRelation(
  env: CanonicalWriteEnv,
  record: RecordingDraft,
  destination: CanonicalPersistenceDestination,
  relation: Relation | null,
  organizationId: string,
): Promise<void> {
  if (!relation) return;
  const reference = await referenceFor(env, destination, relation.id, organizationId);
  if (!reference) fail("CANONICAL_LINEAGE_REFERENCE_NOT_FOUND", relation.id);
  if (reference.taxonomyId !== record.taxonomyId) fail("CANONICAL_LINEAGE_TAXONOMY_MISMATCH");
  if (reference.farmId !== String(record.farmId)) fail("CANONICAL_LINEAGE_FARM_MISMATCH");
  validateRecordingLineage({
    id: String(record.id),
    organizationId,
    family: String(record.family),
    createdAt: String(record.createdAt),
    ...(relation.kind === "correction" ? { correctionOfId: relation.id } : {}),
    ...(relation.kind === "reversal" ? { reversalOfId: relation.id } : {}),
    ...(relation.kind === "replacement" ? { replacementOfId: relation.id } : {}),
  }, [reference]);
}

async function validateMortalityLink(env: CanonicalWriteEnv, record: RecordingDraft, organizationId: string): Promise<void> {
  if (record.taxonomyId !== "A1") return;
  const linkedId = String(record.linkedMortalityEventId);
  const row = await env.DB.prepare(
    `SELECT id
       FROM operational_events
      WHERE id = ? AND organization_id = ? AND farm_id = ?
        AND intent IN ('mortality', 'cull')
        AND (taxonomy_id IS NULL OR taxonomy_id = 'O9')
      LIMIT 1`,
  ).bind(linkedId, organizationId, String(record.farmId)).first<{ id: string }>();
  if (!row) fail("CANONICAL_MORTALITY_LINK_INVALID", "linkedMortalityEventId");
}

async function existingForDestination(
  env: CanonicalWriteEnv,
  destination: CanonicalPersistenceDestination,
  organizationId: string,
  clientOperationId: string,
): Promise<{ id: string } | null> {
  if (destination === "recording_events" || destination === "operational_actions") {
    return env.DB.prepare(
      `SELECT id FROM ${destination} WHERE organization_id = ? AND client_operation_id = ? LIMIT 1`,
    ).bind(organizationId, clientOperationId).first<{ id: string }>();
  }
  return env.DB.prepare(
    `SELECT id FROM ${destination} WHERE organization_id = ? AND source_event_id = ? LIMIT 1`,
  ).bind(organizationId, clientOperationId).first<{ id: string }>();
}

async function existingAnywhere(
  env: CanonicalWriteEnv,
  destination: CanonicalPersistenceDestination,
  organizationId: string,
  clientOperationId: string,
): Promise<{ id: string; destination: CanonicalPersistenceDestination } | null> {
  const destinations: CanonicalPersistenceDestination[] = [
    "recording_events",
    "operational_actions",
    "operational_events",
    "abnormal_events",
  ];
  for (const candidate of destinations) {
    const row = await existingForDestination(env, candidate, organizationId, clientOperationId);
    if (row) {
      if (candidate !== destination) fail("CANONICAL_IDEMPOTENCY_DESTINATION_MISMATCH");
      return { id: row.id, destination: candidate };
    }
  }
  return null;
}

function deterministicAuditStatement(env: CanonicalWriteEnv, input: {
  context: CanonicalWriteContext;
  destination: CanonicalPersistenceDestination;
  result: CanonicalWriteResult;
  record: RecordingDraft;
  action: "create" | "correct" | "reverse";
}) {
  const auditId = `audit-canonical-${input.destination}-${input.result.clientOperationId}`;
  return env.DB.prepare(
    `INSERT OR IGNORE INTO audit_logs
      (id, organization_id, source, actor_type, actor_id, action, entity_type, entity_id,
       before_json, after_json, changed_fields_json, reason, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
  ).bind(
    auditId,
    input.context.organizationId,
    input.record.sourceChannel === "line" ? "line" : input.record.sourceChannel === "web" ? "web" : "system",
    input.context.actorType,
    input.context.actorId ?? null,
    input.action,
    input.destination,
    input.result.id,
    json({ ...input.record, destination: input.destination, stockDelta: input.result.stockDelta }),
    json(["canonical_record", "destination", "stockDelta"]),
    input.result.lineage.kind ? `canonical_${input.result.lineage.kind}` : "canonical_record_command",
    input.context.requestId,
    input.context.now ?? new Date().toISOString(),
  );
}

async function insertRecordingEvent(
  env: CanonicalWriteEnv,
  record: RecordingDraft,
  scope: CanonicalScope,
  relation: Relation | null,
): Promise<D1PreparedStatement> {
  const derived = deriveRecordingFields(record);
  return env.DB.prepare(
    `INSERT OR IGNORE INTO recording_events
      (id, organization_id, taxonomy_id, family, canonical_type, subtype,
       occurred_at, created_at, farm_id, house_id, flock_id,
       male_count, female_count, total_count, condition, sex, chick_in_date,
       average_weight, weight_unit, age_days, source_channel, source_message_id,
       source_candidate_id, raw_text, actor_id, confirmed_by, client_operation_id,
       correction_of_id, reversal_of_id, replacement_of_id, lifecycle_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    String(record.id),
    scope.organizationId,
    String(record.taxonomyId),
    String(record.family),
    String(record.type),
    String(record.subtype),
    String(record.occurredAt),
    String(record.createdAt),
    scope.farm.id,
    scope.houseId,
    scope.flockId,
    record.maleCount ?? null,
    record.femaleCount ?? null,
    record.totalCount ?? derived.totalCount ?? null,
    record.condition ?? null,
    record.sex ?? null,
    record.chickInDate ?? null,
    record.averageWeight ?? derived.averageWeight ?? null,
    record.weightUnit ?? null,
    record.ageDays ?? derived.ageDays ?? null,
    record.sourceChannel,
    record.sourceMessageId ?? null,
    record.sourceCandidateId ?? null,
    String(record.rawText),
    record.actorId ?? null,
    record.confirmedBy ?? null,
    String(record.clientOperationId),
    record.correctionOfId ?? null,
    record.reversalOfId ?? null,
    record.replacementOfId ?? null,
    lifecycleFor(record, relation),
  );
}

async function insertOperationalAction(
  env: CanonicalWriteEnv,
  record: RecordingDraft,
  scope: CanonicalScope,
  relation: Relation | null,
): Promise<D1PreparedStatement> {
  const derived = deriveRecordingFields(record);
  return env.DB.prepare(
    `INSERT OR IGNORE INTO operational_actions
      (id, organization_id, taxonomy_id, family, canonical_type, subtype,
       occurred_at, created_at, farm_id, house_id, flock_id, content, vendor,
       weight, weight_unit, submitted_at, workflow_status, result, completed_at,
       reminder_due_at, maintenance_content, source_channel, source_message_id,
       source_candidate_id, raw_text, actor_id, confirmed_by, client_operation_id,
       correction_of_id, reversal_of_id, replacement_of_id, lifecycle_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    String(record.id),
    scope.organizationId,
    String(record.taxonomyId),
    String(record.family),
    String(record.type),
    String(record.subtype),
    String(record.occurredAt),
    String(record.createdAt),
    scope.farm.id,
    scope.houseId,
    scope.flockId,
    record.content ?? null,
    record.vendor ?? null,
    record.weight ?? null,
    record.weightUnit ?? null,
    record.submittedAt ?? null,
    record.workflowStatus ?? null,
    record.result ?? null,
    record.completedAt ?? null,
    record.reminderDueAt ?? derived.reminderDueAt ?? null,
    record.maintenanceContent ?? null,
    record.sourceChannel,
    record.sourceMessageId ?? null,
    record.sourceCandidateId ?? null,
    String(record.rawText),
    record.actorId ?? null,
    record.confirmedBy ?? null,
    String(record.clientOperationId),
    record.correctionOfId ?? null,
    record.reversalOfId ?? null,
    record.replacementOfId ?? null,
    lifecycleFor(record, relation),
  );
}

async function insertOperationalEvent(
  env: CanonicalWriteEnv,
  record: RecordingDraft,
  scope: CanonicalScope,
  context: CanonicalWriteContext,
  relation: Relation | null,
): Promise<D1PreparedStatement> {
  const intent = intentFor(record);
  const isShipment = record.taxonomyId === "O3";
  const quantity = Number(record.quantity);
  const totalWeight = isShipment ? record.totalWeight ?? null : null;
  const averageWeight = isShipment ? record.averageWeight ?? null : null;
  return env.DB.prepare(
    `INSERT OR IGNORE INTO operational_events
      (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity,
       unit, event_date, house, house_id, flock_id, raw_message, raw_farm_text,
       note, pending_action_id, source_event_id, taxonomy_id, family, canonical_type,
       subtype, sex, total_weight, average_weight, weight_unit, occurred_at,
       source_channel, created_at, reversal_of_event_id, correction_of_event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    String(record.id),
    scope.organizationId,
    scope.farm.id,
    scope.lineGroupId,
    context.lineUserId ?? null,
    intent,
    quantity,
    "隻",
    taipeiDate(new Date(String(record.occurredAt))),
    scope.houseName,
    scope.houseId,
    scope.flockId,
    String(record.rawText),
    scope.farm.name,
    record.note ?? null,
    record.pendingActionId ?? null,
    String(record.clientOperationId),
    String(record.taxonomyId),
    String(record.family),
    String(record.type),
    String(record.subtype),
    record.sex ?? null,
    totalWeight,
    averageWeight,
    record.weightUnit ?? null,
    String(record.occurredAt),
    record.sourceChannel,
    String(record.createdAt),
    relation?.kind === "reversal" ? relation.id : null,
    relation?.kind === "correction" || relation?.kind === "replacement" ? relation.id : null,
  );
}

async function insertAbnormalEvent(
  env: CanonicalWriteEnv,
  record: RecordingDraft,
  scope: CanonicalScope,
  relation: Relation | null,
): Promise<D1PreparedStatement> {
  const status = relation?.kind === "reversal" ? "reversal" : relation ? "corrected" : "active";
  return env.DB.prepare(
    `INSERT OR IGNORE INTO abnormal_events
      (id, organization_id, farm_id, house_id, flock_id, occurred_at, occurred_date,
       reported_at, raw_text, source, actor_id, classification_status, weather_date,
       status, correction_of_id, reversal_of_id, reason, source_event_id,
       taxonomy_id, family, canonical_type, subtype, extent,
       linked_mortality_event_id, detail, measured_temperature, measurement,
       evidence, source_candidate_id, source_channel, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    String(record.id),
    scope.organizationId,
    scope.farm.id,
    scope.houseId,
    scope.flockId,
    String(record.occurredAt),
    taipeiDate(new Date(String(record.occurredAt))),
    String(record.createdAt),
    String(record.rawText),
    sourceForAbnormal(record.sourceChannel as RecordingSourceChannel),
    record.actorId ?? null,
    "skipped",
    taipeiDate(new Date(String(record.occurredAt))),
    status,
    relation?.kind === "correction" || relation?.kind === "replacement" ? relation.id : null,
    relation?.kind === "reversal" ? relation.id : null,
    String(record.clientOperationId),
    String(record.taxonomyId),
    String(record.family),
    String(record.type),
    String(record.subtype),
    record.extent ?? null,
    record.linkedMortalityEventId ?? null,
    record.detail ?? null,
    record.measuredTemperature ?? null,
    record.measurement ?? null,
    record.evidence ?? null,
    record.sourceCandidateId ?? null,
    record.sourceChannel,
    String(record.createdAt),
  );
}

async function readWrittenRow(
  env: CanonicalWriteEnv,
  destination: CanonicalPersistenceDestination,
  id: string,
  organizationId: string,
): Promise<Record<string, unknown> | null> {
  return env.DB.prepare(`SELECT * FROM ${destination} WHERE id = ? AND organization_id = ? LIMIT 1`).bind(id, organizationId).first<Record<string, unknown>>();
}

export async function persistRecordCommand(
  env: CanonicalWriteEnv,
  input: RecordCommand,
  context: CanonicalWriteContext,
): Promise<CanonicalWriteResult> {
  const record = normalizeRecordingDraft(input.record);
  validateRecordingDraft(record);
  const canonical = createRecordCommand(record);
  if (input.kind !== "record_command" || input.version !== 1) fail("CANONICAL_COMMAND_VERSION_INVALID");
  if (input.taxonomyId !== canonical.taxonomyId || input.destination !== canonical.destination || input.authoritativeDestination !== canonical.authoritativeDestination) {
    fail("CANONICAL_COMMAND_ROUTE_MISMATCH");
  }
  if (input.parallelAuthoritativeDestinations.length !== 0) fail("CANONICAL_PARALLEL_AUTHORITY_FORBIDDEN");
  if (context.expectedSourceChannel && record.sourceChannel !== context.expectedSourceChannel) fail("CANONICAL_SOURCE_CHANNEL_MISMATCH");

  const destination = canonical.destination;
  const relation = lineageFor(record);
  let scope = await resolveScope(env, record, context);
  await validateRelation(env, record, destination, relation, context.organizationId);
  await validateMortalityLink(env, record, context.organizationId);

  const clientOperationId = String(record.clientOperationId);
  const existing = await existingAnywhere(env, destination, context.organizationId, clientOperationId);
  if (existing) {
    return {
      id: existing.id,
      destination,
      taxonomyId: canonical.taxonomyId,
      clientOperationId,
      created: false,
      stockEffect: canonical.stockEffect,
      stockDelta: stockDeltaFor(record),
      lineage: relation ? { kind: relation.kind, referenceId: relation.id } : { kind: null, referenceId: null },
    };
  }

  // Resolve/ensure the LINE group only after all fail-closed validation and
  // idempotency checks. Invalid Web/API requests must not leave metadata rows.
  scope = {
    ...scope,
    lineGroupId: await ensureLineGroup(env, context.organizationId, context.lineGroupId, record.sourceChannel as RecordingSourceChannel),
  };

  let insert: D1PreparedStatement;
  if (destination === "recording_events") insert = await insertRecordingEvent(env, record, scope, relation);
  else if (destination === "operational_actions") insert = await insertOperationalAction(env, record, scope, relation);
  else if (destination === "operational_events") insert = await insertOperationalEvent(env, record, scope, context, relation);
  else insert = await insertAbnormalEvent(env, record, scope, relation);

  const result: CanonicalWriteResult = {
    id: String(record.id),
    destination,
    taxonomyId: canonical.taxonomyId,
    clientOperationId,
    created: true,
    stockEffect: canonical.stockEffect,
    stockDelta: stockDeltaFor(record),
    lineage: relation ? { kind: relation.kind, referenceId: relation.id } : { kind: null, referenceId: null },
  };
  const action = relation?.kind === "reversal" ? "reverse" : relation ? "correct" : "create";
  await env.DB.batch([
    insert,
    deterministicAuditStatement(env, { context, destination, result, record, action }),
  ]);
  const written = await readWrittenRow(env, destination, String(record.id), context.organizationId);
  if (!written) fail("CANONICAL_WRITE_READBACK_FAILED");
  const writtenClientOperationId = destination === "operational_events" || destination === "abnormal_events"
    ? String(written.source_event_id)
    : String(written.client_operation_id);
  if (writtenClientOperationId !== clientOperationId) fail("CANONICAL_ID_CONFLICT");
  return result;
}

export interface CanonicalStockProjection {
  organizationId: string;
  farmId?: string;
  currentStockDelta: number;
  appliedFactCount: number;
  duplicateAuthorityCount: number;
}

interface StockFact {
  id: string;
  authorityKey: string;
  farmId: string;
  delta: number;
  relationId: string | null;
  relationKind: "correction" | "reversal" | null;
}

/**
 * Deterministic local reconciliation projection used by the write E2E. It
 * treats the original fact as immutable and applies a correction/reversal
 * exactly once through its append-only child row.
 */
export async function canonicalStockProjection(
  env: CanonicalWriteEnv,
  organizationId: string,
  farmId?: string,
): Promise<CanonicalStockProjection> {
  const farmClause = farmId ? " AND farm_id = ?" : "";
  const bind = farmId ? [organizationId, farmId] : [organizationId];
  const [events, operations, actions, abnormalities] = await Promise.all([
    env.DB.prepare(`SELECT id, client_operation_id AS clientOperationId, farm_id AS farmId, taxonomy_id AS taxonomyId, total_count AS totalCount, lifecycle_status AS lifecycleStatus, correction_of_id AS correctionOfId, reversal_of_id AS reversalOfId, replacement_of_id AS replacementOfId FROM recording_events WHERE organization_id = ?${farmClause}`).bind(...bind).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id, source_event_id AS sourceEventId, farm_id AS farmId, taxonomy_id AS taxonomyId, intent, quantity, reversed_at AS reversedAt, correction_of_event_id AS correctionOfId, reversal_of_event_id AS reversalOfId FROM operational_events WHERE organization_id = ?${farmClause}`).bind(...bind).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id, client_operation_id AS clientOperationId, farm_id AS farmId, taxonomy_id AS taxonomyId, lifecycle_status AS lifecycleStatus, correction_of_id AS correctionOfId, reversal_of_id AS reversalOfId, replacement_of_id AS replacementOfId FROM operational_actions WHERE organization_id = ?${farmClause}`).bind(...bind).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id, source_event_id AS sourceEventId, farm_id AS farmId, taxonomy_id AS taxonomyId, correction_of_id AS correctionOfId, reversal_of_id AS reversalOfId FROM abnormal_events WHERE organization_id = ?${farmClause}`).bind(...bind).all<Record<string, unknown>>(),
  ]);
  const facts: StockFact[] = [];
  for (const row of events.results) {
    facts.push({ id: String(row.id), authorityKey: String(row.clientOperationId || row.id), farmId: String(row.farmId), delta: row.taxonomyId === "O1" ? Number(row.totalCount || 0) : 0, relationId: row.reversalOfId ? String(row.reversalOfId) : row.correctionOfId ? String(row.correctionOfId) : row.replacementOfId ? String(row.replacementOfId) : null, relationKind: row.reversalOfId ? "reversal" : row.correctionOfId || row.replacementOfId ? "correction" : null });
  }
  for (const row of operations.results) {
    const taxonomyId = row.taxonomyId || (row.intent === "shipment" ? "O3" : row.intent === "mortality" || row.intent === "cull" ? "O9" : null);
    facts.push({ id: String(row.id), authorityKey: String(row.sourceEventId || row.id), farmId: String(row.farmId), delta: row.reversedAt ? 0 : taxonomyId === "O3" || taxonomyId === "O9" ? -Number(row.quantity || 0) : 0, relationId: row.reversalOfId ? String(row.reversalOfId) : row.correctionOfId ? String(row.correctionOfId) : null, relationKind: row.reversalOfId ? "reversal" : row.correctionOfId ? "correction" : null });
  }
  for (const row of actions.results) {
    facts.push({ id: String(row.id), authorityKey: String(row.clientOperationId || row.id), farmId: String(row.farmId), delta: 0, relationId: row.reversalOfId ? String(row.reversalOfId) : row.correctionOfId ? String(row.correctionOfId) : row.replacementOfId ? String(row.replacementOfId) : null, relationKind: row.reversalOfId ? "reversal" : row.correctionOfId || row.replacementOfId ? "correction" : null });
  }
  for (const row of abnormalities.results) {
    facts.push({ id: String(row.id), authorityKey: String(row.sourceEventId || row.id), farmId: String(row.farmId), delta: 0, relationId: row.reversalOfId ? String(row.reversalOfId) : row.correctionOfId ? String(row.correctionOfId) : row.replacementOfId ? String(row.replacementOfId) : null, relationKind: row.reversalOfId ? "reversal" : row.correctionOfId || row.replacementOfId ? "correction" : null });
  }
  const authorityCounts = new Map<string, number>();
  for (const fact of facts) authorityCounts.set(fact.authorityKey, (authorityCounts.get(fact.authorityKey) ?? 0) + 1);
  const childByParent = new Map<string, StockFact>();
  for (const fact of facts) if (fact.relationId) childByParent.set(fact.relationId, fact);
  let currentStockDelta = 0;
  let appliedFactCount = 0;
  for (const fact of facts) {
    if (fact.relationId) continue;
    const child = childByParent.get(fact.id);
    if (!child) {
      currentStockDelta += fact.delta;
      appliedFactCount += 1;
      continue;
    }
    if (child.relationKind === "reversal") {
      currentStockDelta += 0;
    } else {
      currentStockDelta += child.delta;
    }
    appliedFactCount += 1;
  }
  return {
    organizationId,
    farmId,
    currentStockDelta,
    appliedFactCount,
    duplicateAuthorityCount: [...authorityCounts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0),
  };
}
