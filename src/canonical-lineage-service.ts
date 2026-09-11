import { auditLogStatement } from "./domain";
import {
  CanonicalWriteError,
  persistRecordCommand,
  type CanonicalWriteContext,
  type CanonicalWriteEnv,
  type CanonicalWriteResult,
} from "./recording-write-adapter";
import {
  readLegacyAbnormalEvent,
  readLegacyOperationalEvent,
  type LegacyAbnormalEventRow,
  type LegacyOperationalEventRow,
} from "./recording-runtime-bridge";
import { createRecordCommand } from "./record-command";

export type CanonicalLineageKind = "correction" | "reversal";

export interface CanonicalLineagePatch {
  kind: CanonicalLineageKind;
  originalId: string;
  childId: string;
  clientOperationId: string;
  quantity?: number;
  rawText?: string;
  note?: string | null;
  reason?: string | null;
  quickBundleId?: string | null;
  targetFarmId?: string;
  targetHouseId?: string | null;
  targetFlockId?: string | null;
  allowCrossFarm?: boolean;
}

export interface CanonicalLineageEnv extends CanonicalWriteEnv {
  EVENTS?: { send(message: unknown): Promise<unknown> };
}

export interface LegacyLineageResult {
  id: string;
  originalId: string;
  destination: "operational_events" | "abnormal_events";
  created: boolean;
  canonical: boolean;
  lineage: { kind: CanonicalLineageKind; referenceId: string };
  taxonomyId?: string | null;
}

export type CanonicalLineageResult = CanonicalWriteResult | LegacyLineageResult;

function text(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max && !/[\u0000-\u001F\u007F]/u.test(trimmed) ? trimmed : null;
}

function sourceChannel(context: CanonicalWriteContext): "line" | "web" | "system" {
  if (context.expectedSourceChannel === "line" || context.expectedSourceChannel === "web") return context.expectedSourceChannel;
  return context.actorType === "line_user" ? "line" : context.actorType === "web_admin" ? "web" : "system";
}

function relationField(kind: CanonicalLineageKind): "correctionOfId" | "reversalOfId" {
  return kind === "correction" ? "correctionOfId" : "reversalOfId";
}

function rawRelationField(kind: CanonicalLineageKind): "correction_of_event_id" | "reversal_of_event_id" {
  return kind === "correction" ? "correction_of_event_id" : "reversal_of_event_id";
}

function abnormalRelationField(kind: CanonicalLineageKind): "correction_of_id" | "reversal_of_id" {
  return kind === "correction" ? "correction_of_id" : "reversal_of_id";
}

function lineageAction(kind: CanonicalLineageKind): "correct" | "reverse" {
  return kind === "correction" ? "correct" : "reverse";
}

function lineageText(patch: CanonicalLineagePatch, originalText: string, channel: string): string {
  return patch.rawText || (patch.kind === "correction" ? `${channel}:correction:${originalText}` : originalText);
}

function canonicalChildRecord(
  record: Record<string, unknown>,
  patch: CanonicalLineagePatch,
  context: CanonicalWriteContext,
): Record<string, unknown> {
  const relation = relationField(patch.kind);
  const {
    id: _id,
    createdAt: _createdAt,
    clientOperationId: _clientOperationId,
    correctionOfId: _correctionOfId,
    reversalOfId: _reversalOfId,
    replacementOfId: _replacementOfId,
    lifecycleStatus: _lifecycleStatus,
    sourceChannel: _sourceChannel,
    actorId: _actorId,
    confirmedBy: _confirmedBy,
    rawText: originalRawText,
    ...businessFields
  } = record;
  return {
    ...businessFields,
    id: patch.childId,
    createdAt: new Date().toISOString(),
    sourceChannel: sourceChannel(context),
    rawText: lineageText(patch, String(originalRawText || "canonical record"), sourceChannel(context)),
    actorId: context.actorId ?? null,
    confirmedBy: context.actorId ?? null,
    clientOperationId: patch.clientOperationId,
    [relation]: patch.originalId,
    ...(patch.quantity === undefined ? {} : { quantity: patch.quantity }),
    ...(patch.note === undefined ? {} : { note: patch.note }),
  };
}

/**
 * The one canonical correction/reversal service for RecordCommand ingress.
 * It never updates or deletes the referenced business fact.
 */
export async function persistCanonicalLineage(
  env: CanonicalWriteEnv,
  record: Record<string, unknown>,
  patch: CanonicalLineagePatch,
  context: CanonicalWriteContext,
): Promise<CanonicalWriteResult> {
  const child = canonicalChildRecord(record, patch, context);
  return persistRecordCommand(env, createRecordCommand(child), context);
}

export async function persistCanonicalCorrection(
  env: CanonicalWriteEnv,
  record: Record<string, unknown>,
  patch: Omit<CanonicalLineagePatch, "kind">,
  context: CanonicalWriteContext,
): Promise<CanonicalWriteResult> {
  return persistCanonicalLineage(env, record, { ...patch, kind: "correction" }, context);
}

export async function persistCanonicalReversal(
  env: CanonicalWriteEnv,
  record: Record<string, unknown>,
  patch: Omit<CanonicalLineagePatch, "kind" | "quantity">,
  context: CanonicalWriteContext,
): Promise<CanonicalWriteResult> {
  return persistCanonicalLineage(env, record, { ...patch, kind: "reversal" }, context);
}

async function ensureLineageScope(
  env: CanonicalLineageEnv,
  organizationId: string,
  farmId: string,
  context: CanonicalWriteContext,
  targetFarmId = farmId,
  targetHouseId: string | null = null,
  targetFlockId: string | null = null,
): Promise<{ farmName: string; houseName: string | null; lineGroupId: string }> {
  const expectedEnvironment = context.environment ?? "production";
  const farm = await env.DB.prepare(
    `SELECT id, name, environment, active FROM farms
      WHERE id = ? AND organization_id = ? LIMIT 1`,
  ).bind(targetFarmId, organizationId).first<{ id: string; name: string; environment: string; active: number }>();
  if (!farm || farm.active !== 1) throw new CanonicalWriteError("CANONICAL_SCOPE_INVALID", "farmId");
  if (farm.environment !== expectedEnvironment) throw new CanonicalWriteError("CANONICAL_ENVIRONMENT_SCOPE_INVALID", "environment");
  let houseName: string | null = null;
  if (targetHouseId) {
    const house = await env.DB.prepare(
      `SELECT id, name FROM houses WHERE id = ? AND farm_id = ? AND active = 1 LIMIT 1`,
    ).bind(targetHouseId, targetFarmId).first<{ id: string; name: string }>();
    if (!house) throw new CanonicalWriteError("CANONICAL_SCOPE_INVALID", "houseId");
    houseName = house.name;
  }
  if (targetFlockId) {
    const flock = await env.DB.prepare(
      `SELECT id, house_id AS houseId FROM flocks
        WHERE id = ? AND farm_id = ? AND status <> 'cancelled' LIMIT 1`,
    ).bind(targetFlockId, targetFarmId).first<{ id: string; houseId: string }>();
    if (!flock || (targetHouseId && flock.houseId !== targetHouseId)) throw new CanonicalWriteError("CANONICAL_SCOPE_INVALID", "flockId");
  }
  const lineGroupId = context.lineGroupId || `canonical-${sourceChannel(context)}-${organizationId}`;
  const existingGroup = await env.DB.prepare("SELECT organization_id AS organizationId FROM line_groups WHERE group_id = ? LIMIT 1").bind(lineGroupId).first<{ organizationId: string | null }>();
  if (existingGroup?.organizationId && existingGroup.organizationId !== organizationId) throw new CanonicalWriteError("CANONICAL_LINE_GROUP_ORGANIZATION_MISMATCH");
  if (context.lineGroupId && !existingGroup) throw new CanonicalWriteError("CANONICAL_LINE_GROUP_NOT_FOUND", "lineGroupId");
  await env.DB.prepare(
    `INSERT INTO line_groups (group_id, status, organization_id)
     VALUES (?, 'unbound', ?)
     ON CONFLICT(group_id) DO UPDATE SET organization_id = COALESCE(line_groups.organization_id, excluded.organization_id)`,
  ).bind(lineGroupId, organizationId).run();
  return { farmName: farm.name, houseName, lineGroupId };
}

async function existingRawChild(
  env: CanonicalLineageEnv,
  table: "operational_events" | "abnormal_events",
  organizationId: string,
  clientOperationId: string,
): Promise<{ id: string } | null> {
  const sourceColumn = table === "operational_events" ? "source_event_id" : "source_event_id";
  return env.DB.prepare(`SELECT id FROM ${table} WHERE organization_id = ? AND ${sourceColumn} = ? LIMIT 1`).bind(organizationId, clientOperationId).first<{ id: string }>();
}

async function assertSingleLineageChild(
  env: CanonicalLineageEnv,
  table: "operational_events" | "abnormal_events",
  organizationId: string,
  originalId: string,
  kind: CanonicalLineageKind,
): Promise<void> {
  const column = table === "operational_events" ? rawRelationField(kind) : abnormalRelationField(kind);
  const existing = await env.DB.prepare(`SELECT id FROM ${table} WHERE organization_id = ? AND ${column} = ? LIMIT 1`).bind(organizationId, originalId).first<{ id: string }>();
  if (existing) throw new CanonicalWriteError("CANONICAL_LINEAGE_ALREADY_EXISTS", originalId);
}

async function persistRawOperationalRelation(
  env: CanonicalLineageEnv,
  row: LegacyOperationalEventRow,
  patch: CanonicalLineagePatch,
  context: CanonicalWriteContext,
): Promise<LegacyLineageResult> {
  const clientOperationId = patch.clientOperationId;
  const existing = await existingRawChild(env, "operational_events", context.organizationId, clientOperationId);
  if (existing) return { id: existing.id, originalId: patch.originalId, destination: "operational_events", created: false, canonical: false, lineage: { kind: patch.kind, referenceId: patch.originalId }, taxonomyId: row.taxonomy_id ?? null };
  await assertSingleLineageChild(env, "operational_events", context.organizationId, patch.originalId, patch.kind);
  const targetFarmId = patch.targetFarmId || row.farm_id;
  const targetHouseId = patch.targetHouseId === undefined ? row.house_id ?? null : patch.targetHouseId;
  const targetFlockId = patch.targetFlockId === undefined ? row.flock_id ?? null : patch.targetFlockId;
  const scope = await ensureLineageScope(env, context.organizationId, row.farm_id, context, targetFarmId, targetHouseId, targetFlockId);
  const originalQuantity = Number(row.quantity);
  const quantity = patch.quantity === undefined ? originalQuantity : patch.quantity;
  if (!Number.isFinite(quantity) || quantity <= 0) throw new CanonicalWriteError("CANONICAL_QUANTITY_INVALID", "quantity");
  if ((row.intent === "mortality" || row.intent === "cull" || row.intent === "shipment") && (!Number.isInteger(quantity) || row.unit !== "隻" && row.unit !== "bird")) {
    throw new CanonicalWriteError("CANONICAL_QUANTITY_INVALID", "quantity");
  }
  const childId = patch.childId;
  const now = new Date().toISOString();
  const childRawText = lineageText(patch, row.raw_message, sourceChannel(context));
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO operational_events
        (id, organization_id, farm_id, line_group_id, line_user_id, intent, quantity, unit,
         event_date, house, house_id, flock_id, raw_message, raw_farm_text, note,
         source_event_id, taxonomy_id, family, canonical_type, subtype, sex,
         total_weight, average_weight, weight_unit, occurred_at, source_channel,
         created_at, reversal_of_event_id, correction_of_event_id, quick_bundle_id)
       VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )`,
    ).bind(
      childId,
      context.organizationId,
      targetFarmId,
      scope.lineGroupId,
      context.lineUserId ?? row.line_user_id ?? null,
      row.intent,
      quantity,
      row.unit,
      row.event_date,
      scope.houseName,
      targetHouseId,
      targetFlockId,
      childRawText,
      scope.farmName,
      patch.note ?? null,
      clientOperationId,
      row.taxonomy_id ?? null,
      row.family ?? null,
      row.canonical_type ?? null,
      row.subtype ?? null,
      row.sex ?? null,
      row.total_weight ?? null,
      row.average_weight ?? null,
      row.weight_unit ?? null,
      row.occurred_at ?? `${row.event_date}T00:00:00+08:00`,
      sourceChannel(context),
      now,
      patch.kind === "reversal" ? patch.originalId : null,
      patch.kind === "correction" ? patch.originalId : null,
      patch.quickBundleId ?? null,
    ),
    auditLogStatement(env, {
      organizationId: context.organizationId,
      source: sourceChannel(context),
      actorType: context.actorType,
      actorId: context.actorId,
      action: lineageAction(patch.kind),
      entityType: "operational_event",
      entityId: childId,
      before: row,
      after: { id: childId, correctionOfEventId: patch.kind === "correction" ? patch.originalId : null, reversalOfEventId: patch.kind === "reversal" ? patch.originalId : null, quantity, farmId: targetFarmId, houseId: targetHouseId, flockId: targetFlockId },
      changedFields: ["quantity", "rawText", "farmId", "houseId", "flockId", "lineage"],
      reason: patch.reason,
      requestId: context.requestId,
    }),
  ]);
  return { id: childId, originalId: patch.originalId, destination: "operational_events", created: true, canonical: false, lineage: { kind: patch.kind, referenceId: patch.originalId }, taxonomyId: row.taxonomy_id ?? null };
}

export async function persistOperationalEventLineage(
  env: CanonicalLineageEnv,
  row: LegacyOperationalEventRow,
  patch: CanonicalLineagePatch,
  context: CanonicalWriteContext,
): Promise<CanonicalLineageResult> {
  const canonical = row.taxonomy_id === "O3" || row.taxonomy_id === "O9" || row.intent === "shipment" || row.intent === "mortality" || row.intent === "cull";
  if (canonical && !patch.allowCrossFarm) {
    const base = readLegacyOperationalEvent(row);
    const child = canonicalChildRecord(base, patch, context);
    return persistRecordCommand(env, createRecordCommand(child), context);
  }
  return persistRawOperationalRelation(env, row, patch, context);
}

async function persistRawAbnormalRelation(
  env: CanonicalLineageEnv,
  row: LegacyAbnormalEventRow,
  patch: CanonicalLineagePatch,
  context: CanonicalWriteContext,
): Promise<LegacyLineageResult> {
  const existing = await existingRawChild(env, "abnormal_events", context.organizationId, patch.clientOperationId);
  if (existing) return { id: existing.id, originalId: patch.originalId, destination: "abnormal_events", created: false, canonical: false, lineage: { kind: patch.kind, referenceId: patch.originalId }, taxonomyId: row.taxonomy_id ?? null };
  await assertSingleLineageChild(env, "abnormal_events", context.organizationId, patch.originalId, patch.kind);
  const targetFarmId = patch.targetFarmId || row.farm_id;
  const targetHouseId = patch.targetHouseId === undefined ? row.house_id ?? null : patch.targetHouseId;
  const targetFlockId = patch.targetFlockId === undefined ? row.flock_id ?? null : patch.targetFlockId;
  const scope = await ensureLineageScope(env, context.organizationId, row.farm_id, context, targetFarmId, targetHouseId, targetFlockId);
  const childId = patch.childId;
  const now = new Date().toISOString();
  const rawText = patch.rawText || row.raw_text;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO abnormal_events
        (id, organization_id, farm_id, house_id, flock_id, occurred_at, occurred_date,
         approximate_period, reported_at, raw_text, source, actor_id, classification_status,
         weather_date, status, correction_of_id, reversal_of_id, reason, source_event_id,
         taxonomy_id, family, canonical_type, subtype, extent, linked_mortality_event_id,
         detail, measured_temperature, measurement, evidence, source_candidate_id,
         source_channel, created_at, quick_bundle_id)
       VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?
       )`,
    ).bind(
      childId,
      context.organizationId,
      targetFarmId,
      targetHouseId,
      targetFlockId,
      row.occurred_at ?? `${row.occurred_date}T00:00:00+08:00`,
      row.occurred_date,
      row.approximate_period ?? null,
      now,
      rawText,
      sourceChannel(context),
      context.actorId ?? row.actor_id ?? null,
      row.classification_status ?? "pending",
      row.weather_date ?? row.occurred_date,
      patch.kind === "reversal" ? "reversal" : "active",
      patch.kind === "correction" ? patch.originalId : null,
      patch.kind === "reversal" ? patch.originalId : null,
      patch.reason ?? null,
      patch.clientOperationId,
      row.taxonomy_id ?? null,
      row.family ?? null,
      row.canonical_type ?? null,
      row.subtype ?? null,
      row.extent ?? null,
      row.linked_mortality_event_id ?? null,
      row.detail ?? null,
      row.measured_temperature ?? null,
      row.measurement ?? null,
      row.evidence ?? null,
      row.source_candidate_id ?? null,
      sourceChannel(context),
      now,
      patch.quickBundleId ?? null,
    ),
    auditLogStatement(env, {
      organizationId: context.organizationId,
      source: sourceChannel(context),
      actorType: context.actorType,
      actorId: context.actorId,
      action: lineageAction(patch.kind),
      entityType: "abnormal_event",
      entityId: childId,
      before: row,
      after: { id: childId, correctionOfId: patch.kind === "correction" ? patch.originalId : null, reversalOfId: patch.kind === "reversal" ? patch.originalId : null, rawText, farmId: targetFarmId, houseId: targetHouseId, flockId: targetFlockId },
      changedFields: ["rawText", "farmId", "houseId", "flockId", "lineage"],
      reason: patch.reason,
      requestId: context.requestId,
    }),
  ]);
  if (patch.kind === "correction" && env.EVENTS) {
    try { await env.EVENTS.send({ kind: "classify_abnormal", abnormalEventId: childId }); } catch { /* classification remains non-blocking */ }
  }
  return { id: childId, originalId: patch.originalId, destination: "abnormal_events", created: true, canonical: false, lineage: { kind: patch.kind, referenceId: patch.originalId }, taxonomyId: row.taxonomy_id ?? null };
}

export async function persistAbnormalEventLineage(
  env: CanonicalLineageEnv,
  row: LegacyAbnormalEventRow,
  patch: CanonicalLineagePatch,
  context: CanonicalWriteContext,
): Promise<CanonicalLineageResult> {
  if (row.taxonomy_id && row.subtype && !patch.allowCrossFarm) {
    const base = readLegacyAbnormalEvent(row);
    const child = canonicalChildRecord(base, patch, context);
    return persistRecordCommand(env, createRecordCommand(child), context);
  }
  return persistRawAbnormalRelation(env, row, patch, context);
}
