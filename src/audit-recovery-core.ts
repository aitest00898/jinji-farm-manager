import {
  deriveCanonicalLabSubmissionSummary,
  effectiveCanonicalLabSubmissionFacts,
  type CanonicalLabSubmissionFact,
  type CanonicalLabSubmissionScope,
  type CanonicalLabSubmissionSummary,
} from "./canonical-lab-submission-read-model";
import {
  persistCanonicalLineage,
  persistCanonicalLineageBatch,
  type CanonicalLineageBatchEntry,
} from "./canonical-lineage-service";
import { addIsoDays, isIsoDate } from "./master-data";
import type { CanonicalWriteContext, CanonicalWriteResult } from "./recording-write-adapter";

const RECOVERY_OPERATION = "restore_o6_submission_result" as const;

export interface RecoveryRequest {
  environment: "production" | "test";
  targetId: string;
  clientOperationId: string;
  result: string;
  completedAt: string;
  reason: string;
}

export interface RecoveryApplyRequest extends RecoveryRequest {
  stateFingerprint: string;
  dryRunToken: string;
}

interface O6Row extends CanonicalLabSubmissionFact {
  organizationId: string;
  farmName: string;
  houseName: string | null;
  environment: "production" | "test";
  family: string;
  canonicalType: string;
  subtype: "lab_test";
  content: string;
  sourceChannel: "line" | "web" | "ambient" | "system";
  sourceMessageId: string | null;
  sourceCandidateId: string | null;
  rawText: string;
  actorId: string | null;
  confirmedBy: string | null;
  clientOperationId: string;
}

interface RecoverySnapshot {
  target: O6Row;
  facts: CanonicalLabSubmissionFact[];
  summary: CanonicalLabSubmissionSummary;
  fingerprint: string;
  targetEffective: boolean;
  lineageReason: string | null;
}

export interface RecoveryDependency {
  kind: "canonical_fact" | "derived_projection";
  id: string;
  relation: "target" | "house_o6_input" | "house_status";
  effective: boolean;
}

export interface RecoveryDryRun {
  operation: typeof RECOVERY_OPERATION;
  environment: "production" | "test";
  target: {
    id: string;
    farmId: string;
    farmName: string;
    houseId: string | null;
    houseName: string | null;
    flockId: string | null;
    workflowStatus: string | null;
    result: string | null;
    completedAt: string | null;
  };
  before: CanonicalLabSubmissionSummary;
  proposedAfter: CanonicalLabSubmissionSummary;
  dependencies: RecoveryDependency[];
  derivedImpact: {
    projection: "canonical_lab_submission_house_status";
    before: CanonicalLabSubmissionSummary;
    after: CanonicalLabSubmissionSummary;
  };
  stockImpact: {
    affected: false;
    before: null;
    after: null;
    delta: 0;
  };
  lifecycleImpact: "UNCHANGED_NON_STOCK";
  conflicts: string[];
  applyEligibility: "ELIGIBLE" | "DENIED";
  stateFingerprint: string;
  dryRunToken: string;
  evaluatedAt: string;
}

export interface RecoveryApplyResult {
  operation: typeof RECOVERY_OPERATION;
  environment: "production" | "test";
  applied: boolean;
  idempotent: boolean;
  targetId: string;
  recoveryRecordId: string;
  recoveryAuditId: string;
  canonical: CanonicalWriteResult | null;
  authoritativeReadback: {
    record: {
      id: string;
      correctionOfId: string | null;
      workflowStatus: string | null;
      result: string | null;
      completedAt: string | null;
      lifecycleStatus: string | null;
    };
    derived: CanonicalLabSubmissionSummary;
  };
}

const BATCH_RECOVERY_OPERATION = "restore_o6_submission_results_batch" as const;
const MAX_BATCH_RECOVERY_TARGETS = 20;

export interface BatchRecoveryRequest {
  targets: readonly RecoveryRequest[];
}

export interface BatchRecoveryGroupDryRun {
  groupId: string;
  environment: "production" | "test" | null;
  farmId: string | null;
  farmName: string | null;
  houseId: string | null;
  houseName: string | null;
  targetIds: string[];
  targets: Array<{
    id: string;
    clientOperationId: string;
    workflowStatus: string | null;
    result: string | null;
    completedAt: string | null;
  }>;
  before: CanonicalLabSubmissionSummary | null;
  proposedAfter: CanonicalLabSubmissionSummary | null;
  dependencies: RecoveryDependency[];
  derivedImpact: {
    projection: "canonical_lab_submission_house_status";
    before: CanonicalLabSubmissionSummary | null;
    after: CanonicalLabSubmissionSummary | null;
  };
  stockImpact: {
    affected: false;
    before: null;
    after: null;
    delta: 0;
  };
  lifecycleImpact: "UNCHANGED_NON_STOCK";
  conflicts: string[];
  applyEligibility: "ELIGIBLE" | "DENIED";
  stateFingerprint: string;
  dryRunToken: string;
  evaluatedAt: string;
}

export interface BatchRecoveryDryRun {
  operation: typeof BATCH_RECOVERY_OPERATION;
  targetCount: number;
  groupCount: number;
  groups: BatchRecoveryGroupDryRun[];
  evaluatedAt: string;
}

export interface BatchRecoveryApplyGroupRequest {
  groupId: string;
  targets: readonly RecoveryRequest[];
  stateFingerprint: string;
  dryRunToken: string;
}

export interface BatchRecoveryApplyRequest {
  groups: readonly BatchRecoveryApplyGroupRequest[];
}

export type BatchRecoveryGroupApplyStatus = "APPLIED" | "STALE_STATE" | "BLOCKED" | "FAILED";

export interface BatchRecoveryGroupApplyResult {
  groupId: string;
  status: BatchRecoveryGroupApplyStatus;
  applied: boolean;
  idempotent: boolean;
  targetIds: string[];
  recoveryRecordIds: string[];
  recoveryAuditIds: string[];
  conflicts: string[];
  canonical: CanonicalWriteResult[];
  authoritativeReadback: RecoveryApplyResult["authoritativeReadback"][];
}

export interface BatchRecoveryApplyResult {
  operation: typeof BATCH_RECOVERY_OPERATION;
  groupCount: number;
  appliedGroupCount: number;
  blockedGroupCount: number;
  groups: BatchRecoveryGroupApplyResult[];
  evaluatedAt: string;
}

export class RecoveryCoreError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 400) {
    super(code);
    this.name = "RecoveryCoreError";
    this.code = code;
    this.status = status;
  }
}

interface RecoveryEnv {
  DB: D1Database;
  CANONICAL_WRITE_HOLD?: string;
}

interface AuditReadEnv {
  DB: D1Database;
}

export interface AuditListInput {
  limit: number;
  cursor: { createdAt: string; id: string } | null;
  includeArchived: boolean;
  rangeFrom: string | null;
  rangeTo: string | null;
  now?: Date;
}

export interface AuditListRow {
  id: string;
  source: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson: string | null;
  afterJson: string | null;
  changedFieldsJson: string | null;
  reason: string | null;
  requestId: string;
  createdAt: string;
  archived: boolean;
  visibility: "current" | "archived";
}

export interface AuditListResult {
  auditLogs: AuditListRow[];
  nextCursor: { createdAt: string; id: string } | null;
  visibilityBoundary: {
    currentMaxAgeDays: 120;
    cutoffAt: string;
    archivedIncluded: boolean;
    adminOnly: true;
  };
  range: { from: string | null; to: string | null };
}

interface RecoveryContext {
  organizationId: string;
  actorId: string;
  requestId: string;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new RecoveryCoreError(`RECOVERY_${field.toUpperCase()}_INVALID`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001F\u007F]/u.test(trimmed)) {
    throw new RecoveryCoreError(`RECOVERY_${field.toUpperCase()}_INVALID`);
  }
  return trimmed;
}

function timestamp(value: unknown, field: string): string {
  const parsed = text(value, field, 80);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(parsed) || !Number.isFinite(Date.parse(parsed))) {
    throw new RecoveryCoreError(`RECOVERY_${field.toUpperCase()}_INVALID`);
  }
  return parsed;
}

function validateRequest(input: RecoveryRequest): RecoveryRequest {
  if (input.environment !== "production" && input.environment !== "test") {
    throw new RecoveryCoreError("RECOVERY_ENVIRONMENT_INVALID");
  }
  return {
    environment: input.environment,
    targetId: text(input.targetId, "target_id", 160),
    clientOperationId: text(input.clientOperationId, "client_operation_id", 200),
    result: text(input.result, "result", 240),
    completedAt: timestamp(input.completedAt, "completed_at"),
    reason: text(input.reason, "reason", 500),
  };
}

function validateApplyRequest(input: RecoveryApplyRequest): RecoveryApplyRequest {
  const request = validateRequest(input);
  const stateFingerprint = text(input.stateFingerprint, "state_fingerprint", 128);
  const dryRunToken = text(input.dryRunToken, "dry_run_token", 128);
  if (!/^[a-f0-9]{64}$/u.test(stateFingerprint) || !/^[a-f0-9]{64}$/u.test(dryRunToken)) {
    throw new RecoveryCoreError("RECOVERY_PLAN_TOKEN_INVALID");
  }
  return { ...request, stateFingerprint, dryRunToken };
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function rowToFact(row: Record<string, unknown>): CanonicalLabSubmissionFact {
  return {
    id: String(row.id),
    farmId: String(row.farmId),
    houseId: nullableString(row.houseId),
    flockId: nullableString(row.flockId),
    occurredAt: nullableString(row.occurredAt),
    createdAt: String(row.createdAt),
    submittedAt: nullableString(row.submittedAt),
    workflowStatus: nullableString(row.workflowStatus),
    result: nullableString(row.result),
    completedAt: nullableString(row.completedAt),
    reminderDueAt: nullableString(row.reminderDueAt),
    lifecycleStatus: nullableString(row.lifecycleStatus),
    correctionOfId: nullableString(row.correctionOfId),
    reversalOfId: nullableString(row.reversalOfId),
    replacementOfId: nullableString(row.replacementOfId),
  };
}

function rowToO6(row: Record<string, unknown>): O6Row {
  const fact = rowToFact(row);
  return {
    ...fact,
    organizationId: String(row.organizationId),
    farmName: String(row.farmName),
    houseName: nullableString(row.houseName),
    environment: row.environment === "test" ? "test" : "production",
    family: String(row.family),
    canonicalType: String(row.canonicalType),
    subtype: "lab_test",
    content: String(row.content),
    sourceChannel: String(row.sourceChannel) as O6Row["sourceChannel"],
    sourceMessageId: nullableString(row.sourceMessageId),
    sourceCandidateId: nullableString(row.sourceCandidateId),
    rawText: String(row.rawText),
    actorId: nullableString(row.actorId),
    confirmedBy: nullableString(row.confirmedBy),
    clientOperationId: String(row.clientOperationId),
  };
}

function stateValue(fact: CanonicalLabSubmissionFact): Record<string, unknown> {
  return {
    id: fact.id,
    farmId: fact.farmId,
    houseId: fact.houseId,
    flockId: fact.flockId,
    occurredAt: fact.occurredAt,
    createdAt: fact.createdAt,
    submittedAt: fact.submittedAt,
    workflowStatus: fact.workflowStatus,
    result: fact.result,
    completedAt: fact.completedAt,
    reminderDueAt: fact.reminderDueAt,
    lifecycleStatus: fact.lifecycleStatus,
    correctionOfId: fact.correctionOfId,
    reversalOfId: fact.reversalOfId,
    replacementOfId: fact.replacementOfId,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function auditTimestampMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.includes("T") || /[zZ]|[+-]\d{2}:?\d{2}$/u.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function auditVisibilityFor(
  createdAt: unknown,
  now = new Date(),
): { archived: boolean; visibility: "current" | "archived" } {
  const cutoffMs = now.getTime() - 120 * 86_400_000;
  const createdAtMs = auditTimestampMs(createdAt);
  const archived = createdAtMs === null || createdAtMs < cutoffMs;
  return { archived, visibility: archived ? "archived" : "current" };
}

export function auditRangeBoundary(value: string | null, end: boolean): string | null {
  if (value === null) return null;
  if (isIsoDate(value)) return `${end ? addIsoDays(value, 1) : value}T00:00:00.000Z`;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

export async function listAuditLogs(
  env: AuditReadEnv,
  organizationId: string,
  input: AuditListInput,
): Promise<AuditListResult> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - 120 * 86_400_000);
  const rangeClauses: string[] = [];
  const bindings: unknown[] = [organizationId];
  if (!input.includeArchived) {
    rangeClauses.push("datetime(created_at) >= datetime(?)");
    bindings.push(cutoff.toISOString());
  }
  if (input.rangeFrom) {
    rangeClauses.push("datetime(created_at) >= datetime(?)");
    bindings.push(input.rangeFrom);
  }
  if (input.rangeTo) {
    rangeClauses.push("datetime(created_at) < datetime(?)");
    bindings.push(input.rangeTo);
  }
  const cursorClause = input.cursor
    ? "AND (created_at < ? OR (created_at = ? AND id < ?))"
    : "";
  if (input.cursor) bindings.push(input.cursor.createdAt, input.cursor.createdAt, input.cursor.id);
  const rows = await env.DB.prepare(
    `SELECT id, source, actor_type AS actorType, actor_id AS actorId, action, entity_type AS entityType,
            entity_id AS entityId, before_json AS beforeJson, after_json AS afterJson,
            changed_fields_json AS changedFieldsJson, reason, request_id AS requestId, created_at AS createdAt
       FROM audit_logs WHERE organization_id = ? ${rangeClauses.length ? `AND ${rangeClauses.join(" AND ")}` : ""} ${cursorClause}
      ORDER BY created_at DESC, id DESC LIMIT ?`,
  ).bind(...bindings, input.limit + 1).all<Record<string, unknown>>();
  const values = rows.results.slice(0, input.limit).map((row) => {
    const visibility = auditVisibilityFor(row.createdAt, now);
    return {
      id: String(row.id),
      source: String(row.source),
      actorType: String(row.actorType),
      actorId: row.actorId === null || row.actorId === undefined ? null : String(row.actorId),
      action: String(row.action),
      entityType: String(row.entityType),
      entityId: String(row.entityId),
      beforeJson: row.beforeJson === null || row.beforeJson === undefined ? null : String(row.beforeJson),
      afterJson: row.afterJson === null || row.afterJson === undefined ? null : String(row.afterJson),
      changedFieldsJson: row.changedFieldsJson === null || row.changedFieldsJson === undefined ? null : String(row.changedFieldsJson),
      reason: row.reason === null || row.reason === undefined ? null : String(row.reason),
      requestId: String(row.requestId),
      createdAt: String(row.createdAt),
      ...visibility,
    } satisfies AuditListRow;
  });
  const last = values[values.length - 1];
  return {
    auditLogs: values,
    nextCursor: rows.results.length > input.limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    visibilityBoundary: {
      currentMaxAgeDays: 120,
      cutoffAt: cutoff.toISOString(),
      archivedIncluded: input.includeArchived,
      adminOnly: true,
    },
    range: { from: input.rangeFrom, to: input.rangeTo },
  };
}

function labScope(target: O6Row): CanonicalLabSubmissionScope {
  return {
    farmId: target.farmId,
    farmName: target.farmName,
    environment: target.environment,
    houseId: target.houseId,
    houseName: target.houseName,
  };
}

function proposedFact(target: O6Row, request: RecoveryRequest): CanonicalLabSubmissionFact {
  return {
    ...stateValue(target) as Omit<CanonicalLabSubmissionFact, "id">,
    id: `recovery-preview-${target.id}`,
    workflowStatus: "completed",
    result: request.result,
    completedAt: request.completedAt,
    lifecycleStatus: "replacement",
    correctionOfId: target.id,
    reversalOfId: null,
    replacementOfId: null,
  };
}

function dependencies(snapshot: RecoverySnapshot): RecoveryDependency[] {
  const effective = new Set(effectiveCanonicalLabSubmissionFacts(snapshot.facts).facts.map((fact) => fact.id));
  return [
    ...snapshot.facts
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((fact) => ({
        kind: "canonical_fact" as const,
        id: fact.id,
        relation: fact.id === snapshot.target.id ? "target" as const : "house_o6_input" as const,
        effective: effective.has(fact.id),
      })),
    {
      kind: "derived_projection",
      id: `house:${snapshot.target.farmId}:${snapshot.target.houseId ?? "whole-farm"}`,
      relation: "house_status",
      effective: true,
    },
  ];
}

async function readSnapshot(
  env: RecoveryEnv,
  organizationId: string,
  request: RecoveryRequest,
): Promise<RecoverySnapshot> {
  const target = await env.DB.prepare(
    `SELECT e.id, e.organization_id AS organizationId, f.name AS farmName,
            f.environment, e.farm_id AS farmId, e.house_id AS houseId,
            h.name AS houseName, e.flock_id AS flockId,
            e.occurred_at AS occurredAt, e.created_at AS createdAt,
            e.submitted_at AS submittedAt, e.workflow_status AS workflowStatus,
            e.result, e.completed_at AS completedAt,
            e.reminder_due_at AS reminderDueAt,
            e.lifecycle_status AS lifecycleStatus,
            e.correction_of_id AS correctionOfId,
            e.reversal_of_id AS reversalOfId,
            e.replacement_of_id AS replacementOfId,
            e.family, e.canonical_type AS canonicalType, e.subtype,
            e.content, e.source_channel AS sourceChannel,
            e.source_message_id AS sourceMessageId,
            e.source_candidate_id AS sourceCandidateId,
            e.raw_text AS rawText, e.actor_id AS actorId,
            e.confirmed_by AS confirmedBy,
            e.client_operation_id AS clientOperationId
       FROM operational_actions e
       JOIN farms f ON f.id = e.farm_id
       LEFT JOIN houses h ON h.id = e.house_id
      WHERE e.id = ? AND e.organization_id = ?
        AND e.taxonomy_id = 'O6' AND e.subtype = 'lab_test'
        AND f.environment = ? AND f.active = 1
      LIMIT 1`,
  ).bind(request.targetId, organizationId, request.environment).first<Record<string, unknown>>();
  if (!target) throw new RecoveryCoreError("RECOVERY_TARGET_NOT_FOUND", 404);
  const targetRow = rowToO6(target);
  const rows = await env.DB.prepare(
    `SELECT e.id, e.farm_id AS farmId, e.house_id AS houseId,
            e.flock_id AS flockId, e.occurred_at AS occurredAt,
            e.created_at AS createdAt, e.submitted_at AS submittedAt,
            e.workflow_status AS workflowStatus, e.result,
            e.completed_at AS completedAt, e.reminder_due_at AS reminderDueAt,
            e.lifecycle_status AS lifecycleStatus,
            e.correction_of_id AS correctionOfId,
            e.reversal_of_id AS reversalOfId,
            e.replacement_of_id AS replacementOfId
       FROM operational_actions e
       JOIN farms f ON f.id = e.farm_id
      WHERE e.organization_id = ? AND e.taxonomy_id = 'O6'
        AND e.subtype = 'lab_test' AND e.farm_id = ?
        AND (? IS NULL OR e.house_id = ?)
        AND f.environment = ?
      ORDER BY e.created_at ASC, e.id ASC`,
  ).bind(organizationId, targetRow.farmId, targetRow.houseId, targetRow.houseId, request.environment).all<Record<string, unknown>>();
  const facts = rows.results.map(rowToFact);
  const effective = effectiveCanonicalLabSubmissionFacts(facts);
  const summary = deriveCanonicalLabSubmissionSummary(labScope(targetRow), facts);
  const fingerprint = await sha256Hex(JSON.stringify({
    operation: RECOVERY_OPERATION,
    organizationId,
    environment: request.environment,
    target: stateValue(targetRow),
    facts: facts.slice().sort((left, right) => left.id.localeCompare(right.id)).map(stateValue),
  }));
  return {
    target: targetRow,
    facts,
    summary,
    fingerprint,
    targetEffective: effective.facts.some((fact) => fact.id === targetRow.id),
    lineageReason: effective.reason,
  };
}

function assertRecoverableSnapshot(snapshot: RecoverySnapshot): void {
  if (snapshot.lineageReason) {
    throw new RecoveryCoreError(`RECOVERY_LINEAGE_INVALID:${snapshot.lineageReason}`, 409);
  }
  if (!snapshot.targetEffective) {
    throw new RecoveryCoreError("RECOVERY_TARGET_NOT_EFFECTIVE", 409);
  }
  if (snapshot.target.workflowStatus !== "waiting_result") {
    throw new RecoveryCoreError("RECOVERY_TARGET_NOT_WAITING", 409);
  }
}

function proposedSummary(snapshot: RecoverySnapshot, request: RecoveryRequest): CanonicalLabSubmissionSummary {
  // Keep the immutable parent in the preview graph.  The effective projection
  // needs that parent to validate the proposed correction lineage; removing it
  // would turn a valid preview into a false missing-reference error.
  const facts = [...snapshot.facts, proposedFact(snapshot.target, request)];
  return deriveCanonicalLabSubmissionSummary(labScope(snapshot.target), facts);
}

async function planToken(snapshot: RecoverySnapshot, request: RecoveryRequest): Promise<string> {
  return sha256Hex(JSON.stringify({
    operation: RECOVERY_OPERATION,
    environment: request.environment,
    targetId: request.targetId,
    clientOperationId: request.clientOperationId,
    result: request.result,
    completedAt: request.completedAt,
    reason: request.reason,
    stateFingerprint: snapshot.fingerprint,
  }));
}

export async function dryRunO6Recovery(
  env: RecoveryEnv,
  context: Pick<RecoveryContext, "organizationId">,
  input: RecoveryRequest,
): Promise<RecoveryDryRun> {
  const request = validateRequest(input);
  let snapshot: RecoverySnapshot;
  try {
    snapshot = await readSnapshot(env, context.organizationId, request);
  } catch (error) {
    if (error instanceof RecoveryCoreError && error.code === "RECOVERY_TARGET_NOT_FOUND") {
      throw new RecoveryCoreError("STALE_STATE", 409);
    }
    throw error;
  }
  assertRecoverableSnapshot(snapshot);
  const after = proposedSummary(snapshot, request);
  const conflicts: string[] = [];
  const existingChild = await env.DB.prepare(
    `SELECT id FROM operational_actions
      WHERE organization_id = ?
        AND (correction_of_id = ? OR reversal_of_id = ? OR replacement_of_id = ?)
      LIMIT 1`,
  ).bind(context.organizationId, snapshot.target.id, snapshot.target.id, snapshot.target.id).first<{ id: string }>();
  if (existingChild) conflicts.push("RECOVERY_TARGET_ALREADY_HAS_LINEAGE_CHILD");
  return {
    operation: RECOVERY_OPERATION,
    environment: request.environment,
    target: {
      id: snapshot.target.id,
      farmId: snapshot.target.farmId,
      farmName: snapshot.target.farmName,
      houseId: snapshot.target.houseId,
      houseName: snapshot.target.houseName,
      flockId: snapshot.target.flockId,
      workflowStatus: snapshot.target.workflowStatus,
      result: snapshot.target.result,
      completedAt: snapshot.target.completedAt,
    },
    before: snapshot.summary,
    proposedAfter: after,
    dependencies: dependencies(snapshot),
    derivedImpact: {
      projection: "canonical_lab_submission_house_status",
      before: snapshot.summary,
      after,
    },
    stockImpact: { affected: false, before: null, after: null, delta: 0 },
    lifecycleImpact: "UNCHANGED_NON_STOCK",
    conflicts,
    applyEligibility: conflicts.length ? "DENIED" : "ELIGIBLE",
    stateFingerprint: snapshot.fingerprint,
    dryRunToken: await planToken(snapshot, request),
    evaluatedAt: new Date().toISOString(),
  };
}

function recoveryAuditStatement(
  env: RecoveryEnv,
  context: RecoveryContext,
  request: RecoveryRequest,
  snapshot: RecoverySnapshot,
  result: CanonicalWriteResult,
  after: CanonicalLabSubmissionSummary,
  operation: typeof RECOVERY_OPERATION | typeof BATCH_RECOVERY_OPERATION = RECOVERY_OPERATION,
) {
  const auditId = `audit-recovery-${request.clientOperationId}`;
  return env.DB.prepare(
    `INSERT OR IGNORE INTO audit_logs
      (id, organization_id, source, actor_type, actor_id, action, entity_type,
       entity_id, before_json, after_json, changed_fields_json, reason, request_id)
     VALUES (?, ?, 'web', 'web_admin', ?, 'recovery_apply',
             'canonical_recovery', ?, ?, ?, ?, ?, ?)`,
  ).bind(
    auditId,
    context.organizationId,
    context.actorId,
    snapshot.target.id,
    JSON.stringify({
      operation,
      targetId: snapshot.target.id,
      workflowStatus: snapshot.target.workflowStatus,
      result: snapshot.target.result,
      completedAt: snapshot.target.completedAt,
      stateFingerprint: snapshot.fingerprint,
      dependencyCount: snapshot.facts.length,
    }),
    JSON.stringify({
      operation,
      recoveryRecordId: result.id,
      correctionOfId: snapshot.target.id,
      workflowStatus: "completed",
      result: request.result,
      completedAt: request.completedAt,
      derived: after,
    }),
    JSON.stringify(["canonical_lineage", "derived_lab_submission_status"]),
    request.reason,
    context.requestId,
  );
}

async function authoritativeAfter(
  env: RecoveryEnv,
  organizationId: string,
  request: RecoveryRequest,
  recoveryRecordId: string,
): Promise<RecoveryApplyResult["authoritativeReadback"]> {
  const row = await env.DB.prepare(
    `SELECT e.id, e.correction_of_id AS correctionOfId,
            e.workflow_status AS workflowStatus, e.result,
            e.completed_at AS completedAt, e.lifecycle_status AS lifecycleStatus,
            e.farm_id AS farmId, e.house_id AS houseId,
            f.name AS farmName, h.name AS houseName, f.environment
       FROM operational_actions e
       JOIN farms f ON f.id = e.farm_id
       LEFT JOIN houses h ON h.id = e.house_id
      WHERE e.id = ? AND e.organization_id = ? AND e.taxonomy_id = 'O6'
      LIMIT 1`,
  ).bind(recoveryRecordId, organizationId).first<Record<string, unknown>>();
  if (!row) throw new RecoveryCoreError("RECOVERY_READBACK_FAILED", 500);
  const afterTarget = rowToO6({
    ...row,
    organizationId,
    farmId: row.farmId,
    farmName: row.farmName,
    houseName: row.houseName,
    environment: row.environment,
    flockId: null,
    occurredAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    submittedAt: null,
    reminderDueAt: null,
    replacementOfId: null,
    family: "operational_action",
    canonicalType: "action",
    subtype: "lab_test",
    content: "recovery",
    sourceChannel: "web",
    rawText: "recovery",
    sourceMessageId: null,
    sourceCandidateId: null,
    actorId: null,
    confirmedBy: null,
    clientOperationId: "recovery-readback",
  });
  const facts = await env.DB.prepare(
    `SELECT e.id, e.farm_id AS farmId, e.house_id AS houseId,
            e.flock_id AS flockId, e.occurred_at AS occurredAt,
            e.created_at AS createdAt, e.submitted_at AS submittedAt,
            e.workflow_status AS workflowStatus, e.result,
            e.completed_at AS completedAt, e.reminder_due_at AS reminderDueAt,
            e.lifecycle_status AS lifecycleStatus,
            e.correction_of_id AS correctionOfId,
            e.reversal_of_id AS reversalOfId,
            e.replacement_of_id AS replacementOfId
       FROM operational_actions e
      WHERE e.organization_id = ? AND e.taxonomy_id = 'O6'
        AND e.subtype = 'lab_test' AND e.farm_id = ?
        AND (? IS NULL OR e.house_id = ?)`,
  ).bind(organizationId, afterTarget.farmId, afterTarget.houseId, afterTarget.houseId).all<Record<string, unknown>>();
  const summary = deriveCanonicalLabSubmissionSummary(
    labScope(afterTarget),
    facts.results.map(rowToFact),
  );
  return {
    record: {
      id: String(row.id),
      correctionOfId: nullableString(row.correctionOfId),
      workflowStatus: nullableString(row.workflowStatus),
      result: nullableString(row.result),
      completedAt: nullableString(row.completedAt),
      lifecycleStatus: nullableString(row.lifecycleStatus),
    },
    derived: summary,
  };
}

export async function applyO6Recovery(
  env: RecoveryEnv,
  context: RecoveryContext,
  input: RecoveryApplyRequest,
): Promise<RecoveryApplyResult> {
  const request = validateApplyRequest(input);
  const existingBeforeSnapshot = await env.DB.prepare(
    `SELECT id, correction_of_id AS correctionOfId, workflow_status AS workflowStatus,
            result, completed_at AS completedAt, lifecycle_status AS lifecycleStatus
       FROM operational_actions
      WHERE organization_id = ? AND client_operation_id = ?
      LIMIT 1`,
  ).bind(context.organizationId, request.clientOperationId).first<Record<string, unknown>>();
  if (existingBeforeSnapshot) {
    if (String(existingBeforeSnapshot.correctionOfId ?? "") !== request.targetId
      || String(existingBeforeSnapshot.workflowStatus ?? "") !== "completed"
      || String(existingBeforeSnapshot.result ?? "") !== request.result
      || String(existingBeforeSnapshot.completedAt ?? "") !== request.completedAt) {
      throw new RecoveryCoreError("RECOVERY_IDEMPOTENCY_CONFLICT", 409);
    }
    const readback = await authoritativeAfter(env, context.organizationId, request, String(existingBeforeSnapshot.id));
    const audit = await env.DB.prepare(
      "SELECT id FROM audit_logs WHERE id = ? AND organization_id = ? LIMIT 1",
    ).bind(`audit-recovery-${request.clientOperationId}`, context.organizationId).first<{ id: string }>();
    if (!audit) throw new RecoveryCoreError("RECOVERY_AUDIT_READBACK_FAILED", 500);
    return {
      operation: RECOVERY_OPERATION,
      environment: request.environment,
      applied: false,
      idempotent: true,
      targetId: request.targetId,
      recoveryRecordId: String(existingBeforeSnapshot.id),
      recoveryAuditId: audit.id,
      canonical: null,
      authoritativeReadback: readback,
    };
  }
  const snapshot = await readSnapshot(env, context.organizationId, request);
  if (snapshot.fingerprint !== request.stateFingerprint) {
    throw new RecoveryCoreError("STALE_STATE", 409);
  }
  assertRecoverableSnapshot(snapshot);
  const expectedToken = await planToken(snapshot, request);
  if (expectedToken !== request.dryRunToken) throw new RecoveryCoreError("RECOVERY_PLAN_TOKEN_MISMATCH", 409);
  const after = proposedSummary(snapshot, request);
  const existing = await env.DB.prepare(
    `SELECT id, correction_of_id AS correctionOfId, workflow_status AS workflowStatus,
            result, completed_at AS completedAt, lifecycle_status AS lifecycleStatus
       FROM operational_actions
      WHERE organization_id = ? AND client_operation_id = ?
      LIMIT 1`,
  ).bind(context.organizationId, request.clientOperationId).first<Record<string, unknown>>();
  if (existing) {
    if (String(existing.correctionOfId ?? "") !== snapshot.target.id
      || String(existing.workflowStatus ?? "") !== "completed"
      || String(existing.result ?? "") !== request.result
      || String(existing.completedAt ?? "") !== request.completedAt) {
      throw new RecoveryCoreError("RECOVERY_IDEMPOTENCY_CONFLICT", 409);
    }
    const readback = await authoritativeAfter(env, context.organizationId, request, String(existing.id));
    return {
      operation: RECOVERY_OPERATION,
      environment: request.environment,
      applied: false,
      idempotent: true,
      targetId: snapshot.target.id,
      recoveryRecordId: String(existing.id),
      recoveryAuditId: `audit-recovery-${request.clientOperationId}`,
      canonical: null,
      authoritativeReadback: readback,
    };
  }
  const record: Record<string, unknown> = {
    id: `web-recovery-${crypto.randomUUID()}`,
    taxonomyId: "O6",
    family: snapshot.target.family,
    type: snapshot.target.canonicalType,
    subtype: snapshot.target.subtype,
    occurredAt: snapshot.target.occurredAt,
    farmId: snapshot.target.farmId,
    houseId: snapshot.target.houseId,
    flockId: snapshot.target.flockId,
    content: snapshot.target.content,
    submittedAt: snapshot.target.submittedAt,
    workflowStatus: "completed",
    result: request.result,
    completedAt: request.completedAt,
    reminderDueAt: snapshot.target.reminderDueAt,
    sourceChannel: "web",
    sourceMessageId: snapshot.target.sourceMessageId,
    sourceCandidateId: snapshot.target.sourceCandidateId,
    rawText: `web:recovery:${snapshot.target.rawText}`,
    actorId: context.actorId,
    confirmedBy: context.actorId,
    clientOperationId: request.clientOperationId,
    correctionOfId: snapshot.target.id,
  };
  const canonical = await persistCanonicalLineage(
    { DB: env.DB, CANONICAL_WRITE_HOLD: env.CANONICAL_WRITE_HOLD },
    record,
    {
      kind: "correction",
      originalId: snapshot.target.id,
      childId: String(record.id),
      clientOperationId: request.clientOperationId,
      reason: request.reason,
    },
    {
      organizationId: context.organizationId,
      actorType: "web_admin",
      actorId: context.actorId,
      requestId: context.requestId,
      environment: request.environment,
      expectedSourceChannel: "web",
      operatorScopeRequired: true,
    },
  );
  const readback = await authoritativeAfter(env, context.organizationId, request, canonical.id);
  if (JSON.stringify(readback.derived) !== JSON.stringify(after)) {
    throw new RecoveryCoreError("RECOVERY_DERIVED_READBACK_MISMATCH", 500);
  }
  const auditId = `audit-recovery-${request.clientOperationId}`;
  await env.DB.batch([recoveryAuditStatement(env, context, request, snapshot, canonical, after)]);
  const audit = await env.DB.prepare("SELECT id FROM audit_logs WHERE id = ? AND organization_id = ? LIMIT 1").bind(auditId, context.organizationId).first<{ id: string }>();
  if (!audit) throw new RecoveryCoreError("RECOVERY_AUDIT_READBACK_FAILED", 500);
  return {
    operation: RECOVERY_OPERATION,
    environment: request.environment,
    applied: canonical.created,
    idempotent: !canonical.created,
    targetId: snapshot.target.id,
    recoveryRecordId: canonical.id,
    recoveryAuditId: audit.id,
    canonical,
    authoritativeReadback: readback,
  };
}

interface BatchTargetSnapshotEntry {
  request: RecoveryRequest;
  snapshot: RecoverySnapshot | null;
  error: string | null;
}

interface BatchGroupPlan {
  groupId: string;
  entries: BatchTargetSnapshotEntry[];
  recoverableEntries: Array<BatchTargetSnapshotEntry & { snapshot: RecoverySnapshot }>;
  environment: "production" | "test" | null;
  farmId: string | null;
  farmName: string | null;
  houseId: string | null;
  houseName: string | null;
  before: CanonicalLabSubmissionSummary | null;
  proposedAfter: CanonicalLabSubmissionSummary | null;
  dependencies: RecoveryDependency[];
  conflicts: string[];
  stateFingerprint: string;
  dryRunToken: string;
}

function validateBatchTargets(input: BatchRecoveryRequest): RecoveryRequest[] {
  if (!input || !Array.isArray(input.targets) || input.targets.length < 1 || input.targets.length > MAX_BATCH_RECOVERY_TARGETS) {
    throw new RecoveryCoreError("RECOVERY_BATCH_INPUT_INVALID");
  }
  return input.targets.map((target) => validateRequest(target));
}

function validateBatchApplyGroups(input: BatchRecoveryApplyRequest): BatchRecoveryApplyGroupRequest[] {
  if (!input || !Array.isArray(input.groups) || input.groups.length < 1 || input.groups.length > MAX_BATCH_RECOVERY_TARGETS) {
    throw new RecoveryCoreError("RECOVERY_BATCH_INPUT_INVALID");
  }
  const groups = input.groups.map((group) => {
    const groupId = text(group?.groupId, "batch_group_id", 200);
    if (!groupId || !Array.isArray(group.targets) || group.targets.length < 1 || group.targets.length > MAX_BATCH_RECOVERY_TARGETS) {
      throw new RecoveryCoreError("RECOVERY_BATCH_INPUT_INVALID");
    }
    const targets = group.targets.map((target: RecoveryRequest) => validateRequest(target));
    const stateFingerprint = text(group.stateFingerprint, "state_fingerprint", 128);
    const dryRunToken = text(group.dryRunToken, "dry_run_token", 128);
    if (!stateFingerprint || !dryRunToken || !/^[a-f0-9]{64}$/u.test(stateFingerprint) || !/^[a-f0-9]{64}$/u.test(dryRunToken)) {
      throw new RecoveryCoreError("RECOVERY_PLAN_TOKEN_INVALID");
    }
    return { groupId, targets, stateFingerprint, dryRunToken };
  });
  const groupIds = new Set<string>();
  let targetCount = 0;
  for (const group of groups) {
    if (groupIds.has(group.groupId)) throw new RecoveryCoreError("RECOVERY_BATCH_DUPLICATE_GROUP");
    groupIds.add(group.groupId);
    targetCount += group.targets.length;
  }
  if (targetCount > MAX_BATCH_RECOVERY_TARGETS) throw new RecoveryCoreError("RECOVERY_BATCH_INPUT_INVALID");
  return groups;
}

async function readBatchTargetSnapshot(
  env: RecoveryEnv,
  organizationId: string,
  request: RecoveryRequest,
): Promise<BatchTargetSnapshotEntry> {
  try {
    return { request, snapshot: await readSnapshot(env, organizationId, request), error: null };
  } catch (error) {
    return {
      request,
      snapshot: null,
      error: error instanceof RecoveryCoreError ? error.code : "BATCH_TARGET_READ_FAILED",
    };
  }
}

function groupIdForSnapshot(snapshot: RecoverySnapshot): string {
  return `o6:${snapshot.target.environment}:${snapshot.target.farmId}:${snapshot.target.houseId ?? "whole-farm"}`;
}

function addBatchConflict(conflicts: string[], value: string): void {
  if (!conflicts.includes(value)) conflicts.push(value);
}

function batchDependencies(snapshot: RecoverySnapshot, targetIds: ReadonlySet<string>): RecoveryDependency[] {
  const effective = new Set(effectiveCanonicalLabSubmissionFacts(snapshot.facts).facts.map((fact) => fact.id));
  return [
    ...snapshot.facts
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((fact) => ({
        kind: "canonical_fact" as const,
        id: fact.id,
        relation: targetIds.has(fact.id) ? "target" as const : "house_o6_input" as const,
        effective: effective.has(fact.id),
      })),
    {
      kind: "derived_projection" as const,
      id: `house:${snapshot.target.farmId}:${snapshot.target.houseId ?? "whole-farm"}`,
      relation: "house_status" as const,
      effective: true,
    },
  ];
}

async function existingRecoveryChild(
  env: RecoveryEnv,
  organizationId: string,
  targetId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT id FROM operational_actions
      WHERE organization_id = ?
        AND (correction_of_id = ? OR reversal_of_id = ? OR replacement_of_id = ?)
      LIMIT 1`,
  ).bind(organizationId, targetId, targetId, targetId).first<{ id: string }>();
  return row?.id ? String(row.id) : null;
}

async function batchGroupFingerprint(
  organizationId: string,
  groupId: string,
  entries: readonly BatchTargetSnapshotEntry[],
  base: RecoverySnapshot | null,
): Promise<string> {
  return sha256Hex(JSON.stringify({
    operation: BATCH_RECOVERY_OPERATION,
    organizationId,
    groupId,
    targets: entries
      .slice()
      .sort((left, right) => left.request.targetId.localeCompare(right.request.targetId))
      .map((entry) => ({
        request: entry.request,
        state: entry.snapshot ? stateValue(entry.snapshot.target) : null,
        error: entry.error,
      })),
    facts: base?.facts.slice().sort((left, right) => left.id.localeCompare(right.id)).map(stateValue) ?? [],
  }));
}

async function batchGroupPlanToken(
  groupId: string,
  entries: readonly BatchTargetSnapshotEntry[],
  stateFingerprint: string,
): Promise<string> {
  return sha256Hex(JSON.stringify({
    operation: BATCH_RECOVERY_OPERATION,
    groupId,
    stateFingerprint,
    targets: entries
      .slice()
      .sort((left, right) => left.request.targetId.localeCompare(right.request.targetId))
      .map((entry) => entry.request),
  }));
}

async function buildBatchGroupPlan(
  env: RecoveryEnv,
  organizationId: string,
  entries: BatchTargetSnapshotEntry[],
  explicitGroupId?: string,
): Promise<BatchGroupPlan> {
  const conflicts: string[] = [];
  const blockedTargets = new Set<string>();
  const snapshots = entries.filter((entry): entry is BatchTargetSnapshotEntry & { snapshot: RecoverySnapshot } => entry.snapshot !== null);
  const base = snapshots[0]?.snapshot ?? null;
  const canonicalGroupId = base ? groupIdForSnapshot(base) : null;
  const groupId = canonicalGroupId ?? explicitGroupId ?? `unresolved:${entries[0]?.request.targetId ?? "batch"}`;

  const targetIds = new Set<string>();
  const clientOperationIds = new Set<string>();
  for (const entry of entries) {
    if (targetIds.has(entry.request.targetId)) {
      addBatchConflict(conflicts, `BATCH_DUPLICATE_TARGET:${entry.request.targetId}`);
      blockedTargets.add(entry.request.targetId);
    }
    targetIds.add(entry.request.targetId);
    if (clientOperationIds.has(entry.request.clientOperationId)) {
      addBatchConflict(conflicts, `BATCH_DUPLICATE_OPERATION:${entry.request.clientOperationId}`);
      blockedTargets.add(entry.request.targetId);
    }
    clientOperationIds.add(entry.request.clientOperationId);
    if (entry.error) {
      addBatchConflict(conflicts, `${entry.request.targetId}:${entry.error}`);
      blockedTargets.add(entry.request.targetId);
    }
    if (entry.snapshot && base && groupIdForSnapshot(entry.snapshot) !== canonicalGroupId) {
      addBatchConflict(conflicts, `BATCH_SCOPE_MISMATCH:${entry.request.targetId}`);
      blockedTargets.add(entry.request.targetId);
    }
    if (entry.snapshot && base && entry.request.environment !== base.target.environment) {
      addBatchConflict(conflicts, `BATCH_ENVIRONMENT_MISMATCH:${entry.request.targetId}`);
      blockedTargets.add(entry.request.targetId);
    }
  }
  if (explicitGroupId && canonicalGroupId && explicitGroupId !== canonicalGroupId) {
    addBatchConflict(conflicts, "BATCH_GROUP_ID_MISMATCH");
  }
  if (new Set(entries.map((entry) => entry.request.environment)).size > 1) {
    addBatchConflict(conflicts, "BATCH_ENVIRONMENT_MISMATCH");
    for (const entry of entries) blockedTargets.add(entry.request.targetId);
  }

  for (const entry of snapshots) {
    if (blockedTargets.has(entry.request.targetId)) continue;
    try {
      assertRecoverableSnapshot(entry.snapshot);
    } catch (error) {
      const code = error instanceof RecoveryCoreError ? error.code : "BATCH_TARGET_NOT_RECOVERABLE";
      addBatchConflict(conflicts, `${entry.request.targetId}:${code}`);
      blockedTargets.add(entry.request.targetId);
      continue;
    }
    const childId = await existingRecoveryChild(env, organizationId, entry.snapshot.target.id);
    if (childId) {
      addBatchConflict(conflicts, `BATCH_TARGET_ALREADY_HAS_LINEAGE_CHILD:${entry.snapshot.target.id}`);
      blockedTargets.add(entry.request.targetId);
    }
  }

  const recoverableEntries = snapshots.filter((entry) => !blockedTargets.has(entry.request.targetId));
  const proposedAfter = base && recoverableEntries.length
    ? deriveCanonicalLabSubmissionSummary(
      labScope(base.target),
      [
        ...base.facts,
        ...recoverableEntries.map((entry) => proposedFact(entry.snapshot.target, entry.request)),
      ],
    )
    : base?.summary ?? null;
  const fingerprint = await batchGroupFingerprint(organizationId, groupId, entries, base);
  const dryRunToken = await batchGroupPlanToken(groupId, entries, fingerprint);
  return {
    groupId,
    entries,
    recoverableEntries,
    environment: base?.target.environment ?? entries[0]?.request.environment ?? null,
    farmId: base?.target.farmId ?? null,
    farmName: base?.target.farmName ?? null,
    houseId: base?.target.houseId ?? null,
    houseName: base?.target.houseName ?? null,
    before: base?.summary ?? null,
    proposedAfter,
    dependencies: base ? batchDependencies(base, targetIds) : [],
    conflicts,
    stateFingerprint: fingerprint,
    dryRunToken,
  };
}

function batchDryRunGroupFromPlan(plan: BatchGroupPlan): BatchRecoveryGroupDryRun {
  return {
    groupId: plan.groupId,
    environment: plan.environment,
    farmId: plan.farmId,
    farmName: plan.farmName,
    houseId: plan.houseId,
    houseName: plan.houseName,
    targetIds: plan.entries.map((entry) => entry.request.targetId),
    targets: plan.entries.map((entry) => ({
      id: entry.snapshot?.target.id ?? entry.request.targetId,
      clientOperationId: entry.request.clientOperationId,
      workflowStatus: entry.snapshot?.target.workflowStatus ?? null,
      result: entry.snapshot?.target.result ?? null,
      completedAt: entry.snapshot?.target.completedAt ?? null,
    })),
    before: plan.before,
    proposedAfter: plan.proposedAfter,
    dependencies: plan.dependencies,
    derivedImpact: {
      projection: "canonical_lab_submission_house_status",
      before: plan.before,
      after: plan.proposedAfter,
    },
    stockImpact: { affected: false, before: null, after: null, delta: 0 },
    lifecycleImpact: "UNCHANGED_NON_STOCK",
    conflicts: plan.conflicts,
    applyEligibility: plan.conflicts.length || plan.recoverableEntries.length !== plan.entries.length ? "DENIED" : "ELIGIBLE",
    stateFingerprint: plan.stateFingerprint,
    dryRunToken: plan.dryRunToken,
    evaluatedAt: new Date().toISOString(),
  };
}

export async function dryRunO6RecoveryBatch(
  env: RecoveryEnv,
  context: Pick<RecoveryContext, "organizationId">,
  input: BatchRecoveryRequest,
): Promise<BatchRecoveryDryRun> {
  const requests = validateBatchTargets(input);
  const entries = await Promise.all(requests.map((request) => readBatchTargetSnapshot(env, context.organizationId, request)));
  const grouped = new Map<string, BatchTargetSnapshotEntry[]>();
  for (const entry of entries) {
    const key = entry.snapshot ? groupIdForSnapshot(entry.snapshot) : `unresolved:${entry.request.targetId}`;
    const group = grouped.get(key) ?? [];
    group.push(entry);
    grouped.set(key, group);
  }
  const groups: BatchRecoveryGroupDryRun[] = [];
  for (const groupEntries of grouped.values()) {
    groups.push(batchDryRunGroupFromPlan(await buildBatchGroupPlan(env, context.organizationId, groupEntries)));
  }
  groups.sort((left, right) => left.groupId.localeCompare(right.groupId));
  return {
    operation: BATCH_RECOVERY_OPERATION,
    targetCount: requests.length,
    groupCount: groups.length,
    groups,
    evaluatedAt: new Date().toISOString(),
  };
}

async function existingRecoveryForClientOperation(
  env: RecoveryEnv,
  organizationId: string,
  clientOperationId: string,
): Promise<Record<string, unknown> | null> {
  return env.DB.prepare(
    `SELECT id, correction_of_id AS correctionOfId, workflow_status AS workflowStatus,
            result, completed_at AS completedAt, lifecycle_status AS lifecycleStatus
       FROM operational_actions
      WHERE organization_id = ? AND client_operation_id = ?
      LIMIT 1`,
  ).bind(organizationId, clientOperationId).first<Record<string, unknown>>();
}

async function recoveryAuditExists(
  env: RecoveryEnv,
  organizationId: string,
  clientOperationId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT id FROM audit_logs WHERE id = ? AND organization_id = ? LIMIT 1",
  ).bind(`audit-recovery-${clientOperationId}`, organizationId).first<{ id: string }>();
  return Boolean(row?.id);
}

async function batchRecoveryRecordId(clientOperationId: string): Promise<string> {
  const suffix = await sha256Hex(`batch-recovery:${clientOperationId}`);
  return `web-recovery-batch-${suffix.slice(0, 40)}`;
}

function batchRecoveryRecord(
  snapshot: RecoverySnapshot,
  request: RecoveryRequest,
  context: RecoveryContext,
  id: string,
): Record<string, unknown> {
  return {
    id,
    taxonomyId: "O6",
    family: snapshot.target.family,
    type: snapshot.target.canonicalType,
    subtype: snapshot.target.subtype,
    occurredAt: snapshot.target.occurredAt,
    farmId: snapshot.target.farmId,
    houseId: snapshot.target.houseId,
    flockId: snapshot.target.flockId,
    content: snapshot.target.content,
    submittedAt: snapshot.target.submittedAt,
    workflowStatus: "completed",
    result: request.result,
    completedAt: request.completedAt,
    reminderDueAt: snapshot.target.reminderDueAt,
    sourceChannel: "web",
    sourceMessageId: snapshot.target.sourceMessageId,
    sourceCandidateId: snapshot.target.sourceCandidateId,
    rawText: `web:batch-recovery:${snapshot.target.rawText}`,
    actorId: context.actorId,
    confirmedBy: context.actorId,
    clientOperationId: request.clientOperationId,
    correctionOfId: snapshot.target.id,
  };
}

function batchApplyResult(
  groupId: string,
  status: BatchRecoveryGroupApplyStatus,
  targetIds: string[],
  conflicts: string[] = [],
  idempotent = false,
  canonical: CanonicalWriteResult[] = [],
  authoritativeReadback: RecoveryApplyResult["authoritativeReadback"][] = [],
  recoveryAuditIds: string[] = canonical.length
    ? canonical.map((result) => `audit-recovery-${result.clientOperationId}`)
    : [],
): BatchRecoveryGroupApplyResult {
  return {
    groupId,
    status,
    applied: status === "APPLIED" && !idempotent,
    idempotent,
    targetIds,
    recoveryRecordIds: canonical.map((result) => result.id),
    recoveryAuditIds,
    conflicts,
    canonical,
    authoritativeReadback,
  };
}

async function applyBatchGroup(
  env: RecoveryEnv,
  context: RecoveryContext,
  group: BatchRecoveryApplyGroupRequest,
): Promise<BatchRecoveryGroupApplyResult> {
  const requests = group.targets.map((target) => validateRequest(target));
  const targetIds = requests.map((request) => request.targetId);
  const existingRows = await Promise.all(requests.map((request) => existingRecoveryForClientOperation(env, context.organizationId, request.clientOperationId)));
  const existingCount = existingRows.filter(Boolean).length;
  if (existingCount > 0 && existingCount < requests.length) {
    return batchApplyResult(group.groupId, "BLOCKED", targetIds, ["BATCH_IDEMPOTENCY_PARTIAL"]);
  }
  if (existingCount === requests.length) {
    const readbacks: RecoveryApplyResult["authoritativeReadback"][] = [];
    for (let index = 0; index < requests.length; index += 1) {
      const existing = existingRows[index];
      if (!existing
        || String(existing.correctionOfId ?? "") !== requests[index].targetId
        || String(existing.workflowStatus ?? "") !== "completed"
        || String(existing.result ?? "") !== requests[index].result
        || String(existing.completedAt ?? "") !== requests[index].completedAt
        || !(await recoveryAuditExists(env, context.organizationId, requests[index].clientOperationId))) {
        return batchApplyResult(group.groupId, "FAILED", targetIds, ["BATCH_IDEMPOTENCY_READBACK_FAILED"]);
      }
      readbacks.push(await authoritativeAfter(env, context.organizationId, requests[index], String(existing.id)));
    }
    return batchApplyResult(
      group.groupId,
      "APPLIED",
      targetIds,
      [],
      true,
      [],
      readbacks,
      requests.map((request) => `audit-recovery-${request.clientOperationId}`),
    );
  }

  const entries = await Promise.all(requests.map((request) => readBatchTargetSnapshot(env, context.organizationId, request)));
  const plan = await buildBatchGroupPlan(env, context.organizationId, entries, group.groupId);
  if (plan.groupId !== group.groupId) return batchApplyResult(group.groupId, "BLOCKED", targetIds, ["BATCH_GROUP_ID_MISMATCH"]);
  if (plan.stateFingerprint !== group.stateFingerprint) return batchApplyResult(group.groupId, "STALE_STATE", targetIds, ["STALE_STATE"]);
  if (plan.dryRunToken !== group.dryRunToken) return batchApplyResult(group.groupId, "BLOCKED", targetIds, ["RECOVERY_PLAN_TOKEN_MISMATCH"]);
  if (plan.conflicts.length || plan.recoverableEntries.length !== entries.length || !plan.proposedAfter) {
    return batchApplyResult(group.groupId, "BLOCKED", targetIds, plan.conflicts.length ? plan.conflicts : ["BATCH_GROUP_NOT_ELIGIBLE"]);
  }

  try {
    const proposedAfter = plan.proposedAfter;
    if (!proposedAfter) return batchApplyResult(group.groupId, "BLOCKED", targetIds, ["BATCH_GROUP_NOT_ELIGIBLE"]);
    const lineageEntries: CanonicalLineageBatchEntry[] = [];
    for (const entry of plan.recoverableEntries) {
      const id = await batchRecoveryRecordId(entry.request.clientOperationId);
      lineageEntries.push({
        record: batchRecoveryRecord(entry.snapshot, entry.request, context, id),
        patch: {
          kind: "correction",
          originalId: entry.snapshot.target.id,
          childId: id,
          clientOperationId: entry.request.clientOperationId,
          reason: entry.request.reason,
        },
      });
    }
    const recoveryContext: CanonicalWriteContext = {
      organizationId: context.organizationId,
      actorType: "web_admin",
      actorId: context.actorId,
      requestId: context.requestId,
      environment: requests[0].environment,
      expectedSourceChannel: "web",
      operatorScopeRequired: true,
    };
    const canonical = (await persistCanonicalLineageBatch(
      { DB: env.DB, CANONICAL_WRITE_HOLD: env.CANONICAL_WRITE_HOLD },
      lineageEntries,
      recoveryContext,
      (results) => results.map((result, index) => recoveryAuditStatement(
        env,
        context,
        plan.recoverableEntries[index].request,
        plan.recoverableEntries[index].snapshot,
        result,
        proposedAfter,
        BATCH_RECOVERY_OPERATION,
      )),
    )) as CanonicalWriteResult[];
    const readbacks = await Promise.all(canonical.map((result, index) => authoritativeAfter(
      env,
      context.organizationId,
      plan.recoverableEntries[index].request,
      result.id,
    )));
    if (!readbacks.every((readback) => JSON.stringify(readback.derived) === JSON.stringify(proposedAfter))) {
      throw new RecoveryCoreError("RECOVERY_DERIVED_READBACK_MISMATCH", 500);
    }
    for (const entry of plan.recoverableEntries) {
      if (!(await recoveryAuditExists(env, context.organizationId, entry.request.clientOperationId))) {
        throw new RecoveryCoreError("RECOVERY_AUDIT_READBACK_FAILED", 500);
      }
    }
    return batchApplyResult(
      group.groupId,
      "APPLIED",
      targetIds,
      [],
      false,
      canonical,
      readbacks,
      plan.recoverableEntries.map((entry) => `audit-recovery-${entry.request.clientOperationId}`),
    );
  } catch (error) {
    const code = error instanceof RecoveryCoreError ? error.code : "BATCH_ATOMIC_APPLY_FAILED";
    return batchApplyResult(group.groupId, "FAILED", targetIds, [code]);
  }
}

export async function applyO6RecoveryBatch(
  env: RecoveryEnv,
  context: RecoveryContext,
  input: BatchRecoveryApplyRequest,
): Promise<BatchRecoveryApplyResult> {
  const groups = validateBatchApplyGroups(input);
  const results: BatchRecoveryGroupApplyResult[] = [];
  for (const group of groups) results.push(await applyBatchGroup(env, context, group));
  return {
    operation: BATCH_RECOVERY_OPERATION,
    groupCount: results.length,
    appliedGroupCount: results.filter((group) => group.status === "APPLIED").length,
    blockedGroupCount: results.filter((group) => group.status !== "APPLIED").length,
    groups: results,
    evaluatedAt: new Date().toISOString(),
  };
}
