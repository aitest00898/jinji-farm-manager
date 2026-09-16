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
import {
  assertCanonicalWritesOpen,
  type CanonicalWriteContext,
  type CanonicalWriteResult,
} from "./recording-write-adapter";

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

const PIT_RECOVERY_OPERATION = "selective_o6_point_in_time_recovery" as const;
const MAX_PIT_CANDIDATES = 100;
const MAX_PIT_GROUPS = 20;

export type PitRecoveryDecision = "REVERT" | "PRESERVE";
export type PitRecoveryDisposition = "REVERT" | "PRESERVE" | "DEPENDENCY_REQUIRED" | "NOT_RECOVERABLE";

export interface PitRecoveryDiscoverRequest {
  environment: "production" | "test";
  targetTime: string;
}

export interface PitRecoverySelection {
  candidateId: string;
  decision: PitRecoveryDecision;
}

export interface PitRecoveryDryRunRequest {
  environment: "production" | "test";
  targetTime: string;
  selections: readonly PitRecoverySelection[];
}

export interface PitRecoveryApplyGroupRequest {
  groupId: string;
  targetTime: string;
  selections: readonly PitRecoverySelection[];
  stateFingerprint: string;
  dryRunToken: string;
  clientOperationId: string;
}

export interface PitRecoveryApplyRequest {
  environment: "production" | "test";
  groups: readonly PitRecoveryApplyGroupRequest[];
}

export interface PitRecoveryDependencyRequirement {
  kind: "canonical_fact" | "derived_projection";
  id: string;
  candidateId: string | null;
  relation: "lineage_parent" | "house_status";
  effective: boolean;
}

export interface PitRecoveryCandidate {
  candidateId: string;
  factId: string;
  groupId: string;
  environment: "production" | "test";
  farmId: string;
  farmName: string;
  houseId: string | null;
  houseName: string | null;
  flockId: string | null;
  occurredAt: string | null;
  createdAt: string;
  submittedAt: string | null;
  workflowStatus: string | null;
  result: string | null;
  completedAt: string | null;
  changeType: "submission" | "correction" | "reversal" | "replacement";
  currentEffective: boolean;
  disposition: PitRecoveryDisposition;
  availableDecisions: readonly PitRecoveryDecision[];
  dependencies: readonly PitRecoveryDependencyRequirement[];
  reason: string | null;
}

export interface PitRecoveryDiscoverGroup {
  groupId: string;
  environment: "production" | "test";
  farmId: string;
  farmName: string;
  houseId: string | null;
  houseName: string | null;
  candidateIds: string[];
}

export interface PitRecoveryDiscoverResult {
  operation: typeof PIT_RECOVERY_OPERATION;
  supportedDomains: readonly ["O6"];
  environment: "production" | "test";
  targetTime: string;
  candidateCount: number;
  groupCount: number;
  candidates: PitRecoveryCandidate[];
  groups: PitRecoveryDiscoverGroup[];
  evaluatedAt: string;
}

export interface PitRecoveryDryRunCandidate extends PitRecoveryCandidate {
  decision: PitRecoveryDecision | null;
  decisionState: PitRecoveryDisposition;
}

export interface PitRecoveryGroupDryRun {
  groupId: string;
  environment: "production" | "test";
  targetTime: string;
  farmId: string;
  farmName: string;
  houseId: string | null;
  houseName: string | null;
  candidateIds: string[];
  candidates: PitRecoveryDryRunCandidate[];
  selectedRevert: string[];
  selectedPreserve: string[];
  dependencyRequired: PitRecoveryDependencyRequirement[];
  dependencyRequiredCandidateIds: string[];
  before: CanonicalLabSubmissionSummary;
  current: CanonicalLabSubmissionSummary;
  proposedAfter: CanonicalLabSubmissionSummary | null;
  derivedImpact: {
    projection: "canonical_lab_submission_house_status";
    before: CanonicalLabSubmissionSummary;
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

export interface PitRecoveryDryRunResult {
  operation: typeof PIT_RECOVERY_OPERATION;
  supportedDomains: readonly ["O6"];
  environment: "production" | "test";
  targetTime: string;
  candidateCount: number;
  groupCount: number;
  groups: PitRecoveryGroupDryRun[];
  evaluatedAt: string;
}

export type PitRecoveryGroupApplyStatus = "APPLIED" | "PRESERVED" | "STALE_STATE" | "BLOCKED" | "FAILED";

export interface PitRecoveryAuthoritativeReadback {
  derived: CanonicalLabSubmissionSummary;
  effectiveFactIds: string[];
  revertedFactIds: string[];
}

export interface PitRecoveryGroupApplyResult {
  groupId: string;
  status: PitRecoveryGroupApplyStatus;
  applied: boolean;
  idempotent: boolean;
  candidateIds: string[];
  revertedCandidateIds: string[];
  preservedCandidateIds: string[];
  dependencyRequiredCandidateIds: string[];
  recoveryRecordIds: string[];
  recoveryAuditIds: string[];
  conflicts: string[];
  canonical: CanonicalWriteResult[];
  authoritativeReadback: PitRecoveryAuthoritativeReadback | null;
}

export interface PitRecoveryApplyResult {
  operation: typeof PIT_RECOVERY_OPERATION;
  supportedDomains: readonly ["O6"];
  groupCount: number;
  appliedGroupCount: number;
  preservedGroupCount: number;
  blockedGroupCount: number;
  groups: PitRecoveryGroupApplyResult[];
  evaluatedAt: string;
}

interface PitGroupState {
  groupId: string;
  environment: "production" | "test";
  scope: CanonicalLabSubmissionScope;
  facts: O6Row[];
  candidates: PitRecoveryCandidate[];
}

function pitGroupId(environment: "production" | "test", farmId: string, houseId: string | null): string {
  return `o6:${environment}:${farmId}:${houseId ?? "whole-farm"}`;
}

function pitCandidateId(factId: string): string {
  return `o6-change:${factId}`;
}

function pitRelation(fact: CanonicalLabSubmissionFact): { kind: "correction" | "reversal" | "replacement"; id: string } | null {
  if (fact.correctionOfId) return { kind: "correction", id: fact.correctionOfId };
  if (fact.reversalOfId) return { kind: "reversal", id: fact.reversalOfId };
  if (fact.replacementOfId) return { kind: "replacement", id: fact.replacementOfId };
  return null;
}

function pitChangeType(fact: CanonicalLabSubmissionFact): PitRecoveryCandidate["changeType"] {
  const relation = pitRelation(fact);
  return relation?.kind ?? "submission";
}

function pitEffectiveIds(facts: readonly CanonicalLabSubmissionFact[]): { ids: Set<string>; reason: string | null } {
  const projection = effectiveCanonicalLabSubmissionFacts(facts);
  return { ids: new Set(projection.facts.map((fact) => fact.id)), reason: projection.reason };
}

function pitCandidateFromFact(
  fact: O6Row,
  groupId: string,
  effectiveIds: Set<string>,
  projectionReason: string | null,
  factsById: ReadonlyMap<string, O6Row>,
): PitRecoveryCandidate {
  const relation = pitRelation(fact);
  const currentEffective = effectiveIds.has(fact.id);
  const disposition: PitRecoveryDisposition = projectionReason
    ? "NOT_RECOVERABLE"
    : currentEffective && !relation
      ? "REVERT"
      : currentEffective && relation
        ? "DEPENDENCY_REQUIRED"
        : "NOT_RECOVERABLE";
  const dependencies: PitRecoveryDependencyRequirement[] = [];
  if (relation) {
    const parent = factsById.get(relation.id);
    dependencies.push({
      kind: "canonical_fact",
      id: relation.id,
      candidateId: parent ? pitCandidateId(parent.id) : null,
      relation: "lineage_parent",
      effective: parent ? effectiveIds.has(parent.id) : false,
    });
  }
  dependencies.push({
    kind: "derived_projection",
    id: `house:${fact.farmId}:${fact.houseId ?? "whole-farm"}`,
    candidateId: null,
    relation: "house_status",
    effective: true,
  });
  return {
    candidateId: pitCandidateId(fact.id),
    factId: fact.id,
    groupId,
    environment: fact.environment,
    farmId: fact.farmId,
    farmName: fact.farmName,
    houseId: fact.houseId,
    houseName: fact.houseName,
    flockId: fact.flockId,
    occurredAt: fact.occurredAt,
    createdAt: fact.createdAt,
    submittedAt: fact.submittedAt,
    workflowStatus: fact.workflowStatus,
    result: fact.result,
    completedAt: fact.completedAt,
    changeType: pitChangeType(fact),
    currentEffective,
    disposition,
    availableDecisions: disposition === "REVERT" ? ["REVERT", "PRESERVE"] : ["PRESERVE"],
    dependencies,
    reason: projectionReason
      ? `EFFECTIVE_PROJECTION_INVALID:${projectionReason}`
      : disposition === "DEPENDENCY_REQUIRED"
        ? "LINEAGE_DEPENDENCY_MUST_BE_RESOLVED_AS_A_GROUP"
        : disposition === "NOT_RECOVERABLE"
          ? "CHANGE_IS_NOT_CURRENT_EFFECTIVE_ROOT"
          : null,
  };
}

async function readPitGroups(env: RecoveryEnv, organizationId: string, environment: "production" | "test"): Promise<PitGroupState[]> {
  const rows = await env.DB.prepare(
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
      WHERE e.organization_id = ? AND e.taxonomy_id = 'O6'
        AND e.subtype = 'lab_test' AND f.environment = ? AND f.active = 1
      ORDER BY e.created_at ASC, e.id ASC`,
  ).bind(organizationId, environment).all<Record<string, unknown>>();
  const grouped = new Map<string, { target: O6Row; facts: O6Row[] }>();
  for (const row of rows.results) {
    const target = rowToO6(row);
    const groupId = pitGroupId(environment, target.farmId, target.houseId);
    const current = grouped.get(groupId);
    if (current) current.facts.push(target);
    else grouped.set(groupId, { target, facts: [target] });
  }
  return Array.from(grouped.entries()).map(([groupId, group]) => {
    const facts = group.facts.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    return {
      groupId,
      environment,
      scope: labScope(group.target),
      facts,
      candidates: [],
    };
  });
}

function pitCandidateGroups(states: readonly PitGroupState[], targetTime: string): PitGroupState[] {
  const targetMs = Date.parse(targetTime);
  return states
    .map((state) => {
      const facts = state.facts.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
      const factsById = new Map(facts.map((fact) => [fact.id, fact]));
      const effective = pitEffectiveIds(facts);
      return {
        ...state,
        candidates: facts
          .filter((fact) => {
            const created = Date.parse(fact.createdAt);
            return Number.isFinite(created) && created > targetMs;
          })
          .map((fact) => pitCandidateFromFact(fact, state.groupId, effective.ids, effective.reason, factsById)),
      };
    })
    .filter((state) => state.candidates.length > 0)
    .sort((left, right) => left.groupId.localeCompare(right.groupId));
}

function validatePitEnvironment(environment: unknown): asserts environment is "production" | "test" {
  if (environment !== "production" && environment !== "test") throw new RecoveryCoreError("RECOVERY_ENVIRONMENT_INVALID");
}

function validatePitSelection(input: PitRecoverySelection): PitRecoverySelection {
  return {
    candidateId: text(input.candidateId, "pit_candidate_id", 220),
    decision: input.decision === "REVERT" || input.decision === "PRESERVE"
      ? input.decision
      : (() => { throw new RecoveryCoreError("PIT_DECISION_INVALID"); })(),
  };
}

function validatePitDiscoverRequest(input: PitRecoveryDiscoverRequest): PitRecoveryDiscoverRequest {
  validatePitEnvironment(input.environment);
  return { environment: input.environment, targetTime: timestamp(input.targetTime, "pit_target_time") };
}

function validatePitDryRunRequest(input: PitRecoveryDryRunRequest): PitRecoveryDryRunRequest {
  validatePitEnvironment(input.environment);
  if (!Array.isArray(input.selections) || input.selections.length === 0 || input.selections.length > MAX_PIT_CANDIDATES) {
    throw new RecoveryCoreError("PIT_SELECTIONS_INVALID");
  }
  return {
    environment: input.environment,
    targetTime: timestamp(input.targetTime, "pit_target_time"),
    selections: input.selections.map(validatePitSelection),
  };
}

function validatePitApplyGroup(input: PitRecoveryApplyGroupRequest): PitRecoveryApplyGroupRequest {
  const groupId = text(input.groupId, "pit_group_id", 220);
  const targetTime = timestamp(input.targetTime, "pit_target_time");
  if (!Array.isArray(input.selections) || input.selections.length === 0 || input.selections.length > MAX_PIT_CANDIDATES) {
    throw new RecoveryCoreError("PIT_SELECTIONS_INVALID");
  }
  const stateFingerprint = text(input.stateFingerprint, "state_fingerprint", 128);
  const dryRunToken = text(input.dryRunToken, "dry_run_token", 128);
  if (!/^[a-f0-9]{64}$/u.test(stateFingerprint) || !/^[a-f0-9]{64}$/u.test(dryRunToken)) {
    throw new RecoveryCoreError("PIT_PLAN_TOKEN_INVALID");
  }
  return {
    groupId,
    targetTime,
    selections: input.selections.map(validatePitSelection),
    stateFingerprint,
    dryRunToken,
    clientOperationId: text(input.clientOperationId, "client_operation_id", 200),
  };
}

function pitDependencyKey(dependency: PitRecoveryDependencyRequirement): string {
  return `${dependency.kind}:${dependency.id}:${dependency.relation}`;
}

function pitCandidateDecisionState(
  candidate: PitRecoveryCandidate,
  decision: PitRecoveryDecision | null,
): PitRecoveryDisposition {
  if (candidate.disposition === "NOT_RECOVERABLE" || candidate.disposition === "DEPENDENCY_REQUIRED") return candidate.disposition;
  return decision ?? "PRESERVE";
}

function pitPreviewReversal(target: O6Row, evaluatedAt: string): CanonicalLabSubmissionFact {
  return {
    ...stateValue(target) as Omit<CanonicalLabSubmissionFact, "id">,
    id: `pit-preview-reversal:${target.id}`,
    createdAt: evaluatedAt,
    lifecycleStatus: "reversed",
    correctionOfId: null,
    reversalOfId: target.id,
    replacementOfId: null,
  };
}

async function pitStateFingerprint(
  organizationId: string,
  state: PitGroupState,
  targetTime: string,
): Promise<string> {
  return sha256Hex(JSON.stringify({
    operation: PIT_RECOVERY_OPERATION,
    organizationId,
    environment: state.environment,
    groupId: state.groupId,
    targetTime,
    facts: state.facts.slice().sort((left, right) => left.id.localeCompare(right.id)).map(stateValue),
  }));
}

async function pitDryRunToken(
  organizationId: string,
  state: PitGroupState,
  targetTime: string,
  selections: readonly PitRecoverySelection[],
  stateFingerprint: string,
): Promise<string> {
  return sha256Hex(JSON.stringify({
    operation: PIT_RECOVERY_OPERATION,
    organizationId,
    environment: state.environment,
    groupId: state.groupId,
    targetTime,
    selections: selections.slice().sort((left, right) => left.candidateId.localeCompare(right.candidateId)),
    stateFingerprint,
  }));
}

async function buildPitGroupDryRun(
  organizationId: string,
  state: PitGroupState,
  targetTime: string,
  selections: readonly PitRecoverySelection[],
  evaluatedAt: string,
): Promise<PitRecoveryGroupDryRun> {
  const selectionByCandidate = new Map<string, PitRecoveryDecision>();
  const conflicts = new Set<string>();
  for (const selection of selections) {
    const existing = selectionByCandidate.get(selection.candidateId);
    if (existing) {
      conflicts.add(existing === selection.decision
        ? `PIT_DUPLICATE_SELECTION:${selection.candidateId}`
        : `PIT_CONFLICTING_SELECTION:${selection.candidateId}`);
    } else selectionByCandidate.set(selection.candidateId, selection.decision);
  }
  const candidateById = new Map(state.candidates.map((candidate) => [candidate.candidateId, candidate]));
  for (const selection of selections) {
    if (!candidateById.has(selection.candidateId)) conflicts.add(`PIT_CANDIDATE_NOT_IN_GROUP:${selection.candidateId}`);
  }
  for (const candidate of state.candidates) {
    if (!selectionByCandidate.has(candidate.candidateId)) conflicts.add(`PIT_SELECTION_REQUIRED:${candidate.candidateId}`);
    const decision = selectionByCandidate.get(candidate.candidateId);
    if (decision === "REVERT" && candidate.disposition !== "REVERT") {
      conflicts.add(`PIT_${candidate.disposition}:${candidate.candidateId}`);
    }
  }
  for (const candidate of state.candidates) {
    const relation = candidate.dependencies.find((dependency) => dependency.kind === "canonical_fact" && dependency.relation === "lineage_parent");
    if (!relation) continue;
    const parentCandidate = state.candidates.find((item) => item.factId === relation.id);
    if (parentCandidate
      && selectionByCandidate.get(parentCandidate.candidateId) === "REVERT"
      && selectionByCandidate.get(candidate.candidateId) === "PRESERVE") {
      conflicts.add(`PIT_PRESERVE_DEPENDENCY_CONFLICT:${candidate.candidateId}`);
    }
  }
  const dependencyRequired = Array.from(
    new Map(state.candidates.flatMap((candidate) => candidate.dependencies.map((dependency) => [pitDependencyKey(dependency), dependency] as const))).values(),
  ).sort((left, right) => pitDependencyKey(left).localeCompare(pitDependencyKey(right)));
  const selectedRevert = state.candidates
    .filter((candidate) => selectionByCandidate.get(candidate.candidateId) === "REVERT")
    .map((candidate) => candidate.candidateId);
  const selectedPreserve = state.candidates
    .filter((candidate) => selectionByCandidate.get(candidate.candidateId) === "PRESERVE")
    .map((candidate) => candidate.candidateId);
  const before = deriveCanonicalLabSubmissionSummary(state.scope, state.facts, new Date(evaluatedAt));
  const proposedAfter = conflicts.size
    ? null
    : deriveCanonicalLabSubmissionSummary(
      state.scope,
      [
        ...state.facts,
        ...state.candidates
          .filter((candidate) => selectionByCandidate.get(candidate.candidateId) === "REVERT" && candidate.disposition === "REVERT")
          .map((candidate) => pitPreviewReversal(state.facts.find((fact) => fact.id === candidate.factId)!, evaluatedAt)),
      ],
      new Date(evaluatedAt),
    );
  const stateFingerprint = await pitStateFingerprint(organizationId, state, targetTime);
  const dryRunToken = await pitDryRunToken(organizationId, state, targetTime, selections, stateFingerprint);
  const candidates = state.candidates.map((candidate) => {
    const decision = selectionByCandidate.get(candidate.candidateId) ?? null;
    return {
      ...candidate,
      decision,
      decisionState: pitCandidateDecisionState(candidate, decision),
    };
  });
  return {
    groupId: state.groupId,
    environment: state.environment,
    targetTime,
    farmId: state.scope.farmId,
    farmName: state.scope.farmName,
    houseId: state.scope.houseId,
    houseName: state.scope.houseName,
    candidateIds: state.candidates.map((candidate) => candidate.candidateId),
    candidates,
    selectedRevert,
    selectedPreserve,
    dependencyRequired,
    dependencyRequiredCandidateIds: state.candidates
      .filter((candidate) => candidate.disposition === "DEPENDENCY_REQUIRED")
      .map((candidate) => candidate.candidateId),
    before,
    current: before,
    proposedAfter,
    derivedImpact: { projection: "canonical_lab_submission_house_status", before, after: proposedAfter },
    stockImpact: { affected: false, before: null, after: null, delta: 0 },
    lifecycleImpact: "UNCHANGED_NON_STOCK",
    conflicts: Array.from(conflicts).sort(),
    applyEligibility: conflicts.size ? "DENIED" : "ELIGIBLE",
    stateFingerprint,
    dryRunToken,
    evaluatedAt,
  };
}

export async function discoverO6PointInTimeRecovery(
  env: RecoveryEnv,
  context: Pick<RecoveryContext, "organizationId">,
  input: PitRecoveryDiscoverRequest,
): Promise<PitRecoveryDiscoverResult> {
  const request = validatePitDiscoverRequest(input);
  const states = pitCandidateGroups(
    await readPitGroups(env, context.organizationId, request.environment),
    request.targetTime,
  );
  const candidates = states.flatMap((state) => state.candidates);
  if (candidates.length > MAX_PIT_CANDIDATES) throw new RecoveryCoreError("PIT_CANDIDATE_LIMIT_EXCEEDED");
  if (states.length > MAX_PIT_GROUPS) throw new RecoveryCoreError("PIT_GROUP_LIMIT_EXCEEDED");
  return {
    operation: PIT_RECOVERY_OPERATION,
    supportedDomains: ["O6"],
    environment: request.environment,
    targetTime: request.targetTime,
    candidateCount: candidates.length,
    groupCount: states.length,
    candidates,
    groups: states.map((state) => ({
      groupId: state.groupId,
      environment: state.environment,
      farmId: state.scope.farmId,
      farmName: state.scope.farmName,
      houseId: state.scope.houseId,
      houseName: state.scope.houseName,
      candidateIds: state.candidates.map((candidate) => candidate.candidateId),
    })),
    evaluatedAt: new Date().toISOString(),
  };
}

export async function dryRunO6PointInTimeRecovery(
  env: RecoveryEnv,
  context: Pick<RecoveryContext, "organizationId">,
  input: PitRecoveryDryRunRequest,
): Promise<PitRecoveryDryRunResult> {
  const request = validatePitDryRunRequest(input);
  const states = pitCandidateGroups(
    await readPitGroups(env, context.organizationId, request.environment),
    request.targetTime,
  );
  const candidateById = new Map(states.flatMap((state) => state.candidates).map((candidate) => [candidate.candidateId, candidate]));
  for (const selection of request.selections) {
    if (!candidateById.has(selection.candidateId)) throw new RecoveryCoreError(`PIT_CANDIDATE_NOT_FOUND:${selection.candidateId}`, 404);
  }
  const evaluatedAt = new Date().toISOString();
  const groups = [];
  for (const state of states) {
    const groupSelections = request.selections.filter((selection) => state.candidates.some((candidate) => candidate.candidateId === selection.candidateId));
    groups.push(await buildPitGroupDryRun(context.organizationId, state, request.targetTime, groupSelections, evaluatedAt));
  }
  if (request.selections.length > MAX_PIT_CANDIDATES) throw new RecoveryCoreError("PIT_CANDIDATE_LIMIT_EXCEEDED");
  return {
    operation: PIT_RECOVERY_OPERATION,
    supportedDomains: ["O6"],
    environment: request.environment,
    targetTime: request.targetTime,
    candidateCount: states.reduce((count, state) => count + state.candidates.length, 0),
    groupCount: groups.length,
    groups,
    evaluatedAt,
  };
}

async function pitClientOperationId(base: string, candidateId: string): Promise<string> {
  return `pit-recovery-${(await sha256Hex(`${PIT_RECOVERY_OPERATION}:${base}:${candidateId}`)).slice(0, 56)}`;
}

async function pitRecoveryRecordId(clientOperationId: string): Promise<string> {
  return `web-pit-recovery-${(await sha256Hex(`${PIT_RECOVERY_OPERATION}:record:${clientOperationId}`)).slice(0, 48)}`;
}

function pitAuditId(clientOperationId: string): string {
  return `audit-pit-${clientOperationId}`;
}

async function pitExistingRecovery(
  env: RecoveryEnv,
  organizationId: string,
  clientOperationId: string,
): Promise<{ id: string; reversalOfId: string | null; lifecycleStatus: string | null } | null> {
  return env.DB.prepare(
    `SELECT id, reversal_of_id AS reversalOfId, lifecycle_status AS lifecycleStatus
       FROM operational_actions
      WHERE organization_id = ? AND client_operation_id = ? LIMIT 1`,
  ).bind(organizationId, clientOperationId).first<{ id: string; reversalOfId: string | null; lifecycleStatus: string | null }>();
}

async function pitAuditExists(env: RecoveryEnv, organizationId: string, clientOperationId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT id FROM audit_logs WHERE id = ? AND organization_id = ? LIMIT 1",
  ).bind(pitAuditId(clientOperationId), organizationId).first<{ id: string }>();
  return Boolean(row?.id);
}

function pitReversalRecord(
  target: O6Row,
  context: RecoveryContext,
  id: string,
  clientOperationId: string,
): Record<string, unknown> {
  return {
    id,
    taxonomyId: "O6",
    family: target.family,
    type: target.canonicalType,
    subtype: target.subtype,
    occurredAt: target.occurredAt,
    farmId: target.farmId,
    houseId: target.houseId,
    flockId: target.flockId,
    content: target.content,
    submittedAt: target.submittedAt,
    workflowStatus: target.workflowStatus,
    result: target.result,
    completedAt: target.completedAt,
    reminderDueAt: target.reminderDueAt,
    sourceChannel: "web",
    sourceMessageId: target.sourceMessageId,
    sourceCandidateId: target.sourceCandidateId,
    rawText: `web:pit-recovery:${target.rawText}`,
    actorId: context.actorId,
    confirmedBy: context.actorId,
    clientOperationId,
    reversalOfId: target.id,
  };
}

function pitAuditStatement(
  env: RecoveryEnv,
  context: RecoveryContext,
  target: O6Row,
  selection: PitRecoverySelection,
  result: CanonicalWriteResult,
  plan: PitRecoveryGroupDryRun,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO audit_logs
      (id, organization_id, source, actor_type, actor_id, action, entity_type,
       entity_id, before_json, after_json, changed_fields_json, reason, request_id, created_at)
     VALUES (?, ?, 'web', 'web_admin', ?, 'selective_pit_recovery',
             'canonical_pit_recovery', ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    pitAuditId(result.clientOperationId),
    context.organizationId,
    context.actorId,
    target.id,
    JSON.stringify({
      operation: PIT_RECOVERY_OPERATION,
      targetTime: plan.targetTime,
      candidateId: selection.candidateId,
      decision: selection.decision,
      target: stateValue(target),
      before: plan.before,
    }),
    JSON.stringify({
      recoveryRecordId: result.id,
      reversalOfId: target.id,
      proposedAfter: plan.proposedAfter,
    }),
    JSON.stringify(["effective_lineage", "derived_house_status"]),
    `Selective PIT revert to ${plan.targetTime}`,
    context.requestId,
    new Date().toISOString(),
  );
}

async function pitAuthoritativeReadback(
  env: RecoveryEnv,
  organizationId: string,
  groupId: string,
  environment: "production" | "test",
): Promise<PitRecoveryAuthoritativeReadback | null> {
  const state = (await readPitGroups(env, organizationId, environment)).find((item) => item.groupId === groupId);
  if (!state) return null;
  const effective = effectiveCanonicalLabSubmissionFacts(state.facts);
  return {
    derived: deriveCanonicalLabSubmissionSummary(state.scope, state.facts),
    effectiveFactIds: effective.facts.map((fact) => fact.id),
    revertedFactIds: state.facts
      .filter((fact) => fact.lifecycleStatus === "reversed" && fact.reversalOfId)
      .map((fact) => String(fact.reversalOfId)),
  };
}

function pitApplyResult(
  group: PitRecoveryGroupDryRun | { groupId: string; candidateIds: string[]; selectedRevert: string[]; selectedPreserve: string[]; dependencyRequiredCandidateIds: string[] },
  status: PitRecoveryGroupApplyStatus,
  conflicts: string[] = [],
  idempotent = false,
  canonical: CanonicalWriteResult[] = [],
  authoritativeReadback: PitRecoveryAuthoritativeReadback | null = null,
  recoveryAuditIds: string[] = canonical.map((result) => pitAuditId(result.clientOperationId)),
): PitRecoveryGroupApplyResult {
  return {
    groupId: group.groupId,
    status,
    applied: status === "APPLIED" && !idempotent,
    idempotent,
    candidateIds: group.candidateIds,
    revertedCandidateIds: group.selectedRevert,
    preservedCandidateIds: group.selectedPreserve,
    dependencyRequiredCandidateIds: group.dependencyRequiredCandidateIds,
    recoveryRecordIds: canonical.map((result) => result.id),
    recoveryAuditIds,
    conflicts,
    canonical,
    authoritativeReadback,
  };
}

async function applyPitGroup(
  env: RecoveryEnv,
  context: RecoveryContext,
  input: PitRecoveryApplyGroupRequest,
  environment: "production" | "test",
): Promise<PitRecoveryGroupApplyResult> {
  const request = validatePitApplyGroup(input);
  const states = pitCandidateGroups(
    await readPitGroups(env, context.organizationId, environment),
    request.targetTime,
  );
  const state = states.find((candidate) => candidate.groupId === request.groupId);
  if (!state) {
    return pitApplyResult({ groupId: request.groupId, candidateIds: [], selectedRevert: [], selectedPreserve: [], dependencyRequiredCandidateIds: [] }, "BLOCKED", ["PIT_GROUP_NOT_FOUND"]);
  }
  const plan = await buildPitGroupDryRun(context.organizationId, state, request.targetTime, request.selections, new Date().toISOString());
  if (plan.conflicts.some((conflict) => conflict.startsWith("PIT_DUPLICATE_SELECTION:") || conflict.startsWith("PIT_CONFLICTING_SELECTION:"))) {
    return pitApplyResult(plan, "BLOCKED", plan.conflicts);
  }
  const requestedRevertCandidates = request.selections.filter((selection) => selection.decision === "REVERT");
  const selectedRevertCandidates = plan.candidates.filter((candidate) => candidate.decision === "REVERT" && candidate.disposition === "REVERT");
  const expectedOperations = await Promise.all(requestedRevertCandidates.map((selection) => pitClientOperationId(request.clientOperationId, selection.candidateId)));
  const existingRows = await Promise.all(expectedOperations.map((operationId) => pitExistingRecovery(env, context.organizationId, operationId)));
  const existingCount = existingRows.filter(Boolean).length;
  if (existingCount > 0 && existingCount < expectedOperations.length) {
    return pitApplyResult(plan, "BLOCKED", ["PIT_IDEMPOTENCY_PARTIAL"]);
  }
  if (existingCount === expectedOperations.length && expectedOperations.length > 0) {
    const valid = existingRows.every((row, index) => row
      && row.reversalOfId === state.facts.find((fact) => pitCandidateId(fact.id) === requestedRevertCandidates[index].candidateId)?.id
      && row.lifecycleStatus === "reversed");
    const audits = await Promise.all(expectedOperations.map((operationId) => pitAuditExists(env, context.organizationId, operationId)));
    if (!valid || audits.some((value) => !value)) return pitApplyResult(plan, "FAILED", ["PIT_IDEMPOTENCY_READBACK_FAILED"]);
    const replayGroup = {
      ...plan,
      candidateIds: request.selections.map((selection) => selection.candidateId),
      selectedRevert: requestedRevertCandidates.map((selection) => selection.candidateId),
      selectedPreserve: request.selections.filter((selection) => selection.decision === "PRESERVE").map((selection) => selection.candidateId),
    };
    return pitApplyResult(
      replayGroup,
      "APPLIED",
      [],
      true,
      [],
      await pitAuthoritativeReadback(env, context.organizationId, request.groupId, state.environment),
      expectedOperations.map(pitAuditId),
    );
  }
  if (plan.stateFingerprint !== request.stateFingerprint) return pitApplyResult(plan, "STALE_STATE", ["STALE_STATE"]);
  if (plan.dryRunToken !== request.dryRunToken) return pitApplyResult(plan, "BLOCKED", ["PIT_PLAN_TOKEN_MISMATCH"]);
  if (plan.conflicts.length || !plan.proposedAfter) return pitApplyResult(plan, "BLOCKED", plan.conflicts.length ? plan.conflicts : ["PIT_GROUP_NOT_ELIGIBLE"]);
  if (!selectedRevertCandidates.length) {
    return pitApplyResult(
      plan,
      "PRESERVED",
      [],
      false,
      [],
      await pitAuthoritativeReadback(env, context.organizationId, request.groupId, state.environment),
      [],
    );
  }
  try {
    const entries: CanonicalLineageBatchEntry[] = [];
    for (let index = 0; index < selectedRevertCandidates.length; index += 1) {
      const candidate = selectedRevertCandidates[index];
      const target = state.facts.find((fact) => fact.id === candidate.factId);
      if (!target) return pitApplyResult(plan, "BLOCKED", [`PIT_CANDIDATE_NOT_FOUND:${candidate.candidateId}`]);
      const clientOperationId = expectedOperations[index];
      const id = await pitRecoveryRecordId(clientOperationId);
      entries.push({
        record: pitReversalRecord(target, context, id, clientOperationId),
        patch: {
          kind: "reversal",
          originalId: target.id,
          childId: id,
          clientOperationId,
          reason: `Selective PIT revert to ${request.targetTime}`,
        },
      });
    }
    const recoveryContext: CanonicalWriteContext = {
      organizationId: context.organizationId,
      actorType: "web_admin",
      actorId: context.actorId,
      requestId: context.requestId,
      environment: state.environment,
      expectedSourceChannel: "web",
      operatorScopeRequired: true,
    };
    const canonical = (await persistCanonicalLineageBatch(
      { DB: env.DB, CANONICAL_WRITE_HOLD: env.CANONICAL_WRITE_HOLD },
      entries,
      recoveryContext,
      (results) => results.map((result, index) => pitAuditStatement(
        env,
        context,
        state.facts.find((fact) => fact.id === selectedRevertCandidates[index].factId)!,
        request.selections.find((selection) => selection.candidateId === selectedRevertCandidates[index].candidateId)!,
        result,
        plan,
      )),
    )) as CanonicalWriteResult[];
    const readback = await pitAuthoritativeReadback(env, context.organizationId, request.groupId, state.environment);
    if (!readback || JSON.stringify(readback.derived) !== JSON.stringify(plan.proposedAfter)) {
      throw new RecoveryCoreError("PIT_DERIVED_READBACK_MISMATCH", 500);
    }
    const auditIds = canonical.map((result) => pitAuditId(result.clientOperationId));
    const audits = await Promise.all(canonical.map((result) => pitAuditExists(env, context.organizationId, result.clientOperationId)));
    if (audits.some((value) => !value)) throw new RecoveryCoreError("PIT_AUDIT_READBACK_FAILED", 500);
    return pitApplyResult(plan, "APPLIED", [], false, canonical, readback, auditIds);
  } catch (error) {
    const code = error instanceof RecoveryCoreError ? error.code : "PIT_ATOMIC_APPLY_FAILED";
    return pitApplyResult(plan, "FAILED", [code]);
  }
}

export async function applyO6PointInTimeRecovery(
  env: RecoveryEnv,
  context: RecoveryContext,
  input: PitRecoveryApplyRequest,
): Promise<PitRecoveryApplyResult> {
  validatePitEnvironment(input.environment);
  if (!Array.isArray(input.groups) || input.groups.length === 0 || input.groups.length > MAX_PIT_GROUPS) {
    throw new RecoveryCoreError("PIT_GROUPS_INVALID");
  }
  const groups = input.groups.map(validatePitApplyGroup);
  if (new Set(groups.map((group) => group.groupId)).size !== groups.length) throw new RecoveryCoreError("PIT_DUPLICATE_GROUP");
  const results: PitRecoveryGroupApplyResult[] = [];
  for (const group of groups) results.push(await applyPitGroup(env, context, group, input.environment));
  return {
    operation: PIT_RECOVERY_OPERATION,
    supportedDomains: ["O6"],
    groupCount: results.length,
    appliedGroupCount: results.filter((group) => group.status === "APPLIED").length,
    preservedGroupCount: results.filter((group) => group.status === "PRESERVED").length,
    blockedGroupCount: results.filter((group) => group.status !== "APPLIED" && group.status !== "PRESERVED").length,
    groups: results,
    evaluatedAt: new Date().toISOString(),
  };
}

/*
 * Cross-domain recovery deliberately lives beside the established O6
 * recovery functions.  It is an allowlisted extension of the same recovery
 * authority, not a second persistence or lineage engine.  The implementation
 * only restores fields that the existing Web administration handlers already
 * record in immutable audit snapshots; identifiers, organizations,
 * environments, stock facts, and financial facts are never taken from a
 * client-supplied snapshot.
 */

export const DOMAIN_RECOVERY_ENTITY_TYPES = [
  "farm",
  "house",
  "flock",
  "caretaker",
  "farm_caretaker_assignment",
  "line_group",
  "line_group_organization_claim",
  "line_group_operational_authorization",
  "line_group_ai_conversation",
  "operator_identity",
  "operator_scope_binding",
  "line_group_operator_binding",
] as const;

export type DomainRecoveryEntityType = typeof DOMAIN_RECOVERY_ENTITY_TYPES[number];
export type DomainRecoveryDecision = "REVERT" | "PRESERVE";

const DOMAIN_RECOVERY_OPERATION = "restore_canonical_domain_state" as const;
const DOMAIN_BATCH_RECOVERY_OPERATION = "restore_canonical_domain_states_batch" as const;
const DOMAIN_PIT_RECOVERY_OPERATION = "selective_canonical_domain_point_in_time_recovery" as const;
const MAX_DOMAIN_RECOVERY_TARGETS = 20;
const MAX_DOMAIN_PIT_CANDIDATES = 100;
const MAX_DOMAIN_PIT_GROUPS = 20;

export interface DomainRecoveryRequest {
  environment: "production" | "test";
  auditId: string;
  entityType: DomainRecoveryEntityType;
  targetId: string;
  clientOperationId: string;
  reason: string;
}

export interface DomainRecoveryApplyRequest extends DomainRecoveryRequest {
  stateFingerprint: string;
  dryRunToken: string;
  confirm: boolean;
  previewAcknowledged?: boolean;
}

export interface DomainRecoveryDependency {
  kind: "domain_entity" | "dependent_entity" | "derived_projection";
  id: string;
  relation: "target" | "parent" | "dependent" | "scope" | "audit";
  effective: boolean;
}

export interface DomainRecoveryPlan {
  operation: typeof DOMAIN_RECOVERY_OPERATION;
  environment: "production" | "test";
  audit: {
    id: string;
    action: string;
    entityType: DomainRecoveryEntityType;
    entityId: string;
    createdAt: string;
  };
  target: {
    id: string;
    entityType: DomainRecoveryEntityType;
    table: string;
    organizationId: string | null;
    environment: "production" | "test";
    scope: {
      farmId: string | null;
      houseId: string | null;
      flockId: string | null;
    };
  };
  before: Record<string, unknown> | null;
  current: Record<string, unknown>;
  proposedAfter: Record<string, unknown>;
  dependencies: DomainRecoveryDependency[];
  dependencyImpact: boolean;
  dependencyGroupId: string;
  stockImpact: { affected: false; delta: 0 };
  financeImpact: { affected: false; delta: 0 };
  conflicts: string[];
  applyEligibility: "ELIGIBLE" | "DENIED";
  stateFingerprint: string;
  dryRunToken: string;
  evaluatedAt: string;
}

export interface DomainRecoveryApplyResult {
  operation: typeof DOMAIN_RECOVERY_OPERATION;
  environment: "production" | "test";
  entityType: DomainRecoveryEntityType;
  targetId: string;
  applied: boolean;
  idempotent: boolean;
  recoveryAuditId: string;
  authoritativeReadback: {
    entityType: DomainRecoveryEntityType;
    id: string;
    environment: "production" | "test";
    state: Record<string, unknown>;
  };
}

export interface DomainRecoveryBatchRequest {
  targets: readonly DomainRecoveryRequest[];
}

export interface DomainRecoveryBatchGroupDryRun {
  groupId: string;
  environment: "production" | "test" | null;
  targetIds: string[];
  targets: DomainRecoveryPlan[];
  dependencies: DomainRecoveryDependency[];
  dependencyImpact: boolean;
  conflicts: string[];
  applyEligibility: "ELIGIBLE" | "DENIED";
  stateFingerprint: string;
  dryRunToken: string;
  evaluatedAt: string;
}

export interface DomainRecoveryBatchDryRun {
  operation: typeof DOMAIN_BATCH_RECOVERY_OPERATION;
  targetCount: number;
  groupCount: number;
  groups: DomainRecoveryBatchGroupDryRun[];
  evaluatedAt: string;
}

export interface DomainRecoveryBatchApplyGroupRequest {
  groupId: string;
  targets: readonly DomainRecoveryApplyRequest[];
  stateFingerprint: string;
  dryRunToken: string;
}

export interface DomainRecoveryBatchApplyRequest {
  groups: readonly DomainRecoveryBatchApplyGroupRequest[];
}

export type DomainRecoveryBatchGroupStatus = "APPLIED" | "STALE_STATE" | "BLOCKED" | "FAILED";

export interface DomainRecoveryBatchGroupApplyResult {
  groupId: string;
  status: DomainRecoveryBatchGroupStatus;
  applied: boolean;
  idempotent: boolean;
  targetIds: string[];
  recoveryAuditIds: string[];
  conflicts: string[];
  authoritativeReadback: DomainRecoveryApplyResult["authoritativeReadback"][];
}

export interface DomainRecoveryBatchApplyResult {
  operation: typeof DOMAIN_BATCH_RECOVERY_OPERATION;
  groupCount: number;
  appliedGroupCount: number;
  blockedGroupCount: number;
  groups: DomainRecoveryBatchGroupApplyResult[];
  evaluatedAt: string;
}

export interface DomainRecoveryDiscoverRequest {
  environment: "production" | "test";
  entityType?: DomainRecoveryEntityType;
  limit?: number;
}

export interface DomainRecoveryDiscoverCandidate {
  auditId: string;
  action: string;
  entityType: DomainRecoveryEntityType;
  targetId: string;
  createdAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface DomainRecoveryDiscoverResult {
  operation: "discover_canonical_domain_recovery_candidates";
  environment: "production" | "test";
  candidates: DomainRecoveryDiscoverCandidate[];
  evaluatedAt: string;
}

export interface DomainPitRecoveryDiscoverRequest {
  environment: "production" | "test";
  targetTime: string;
}

export interface DomainPitRecoverySelection {
  auditId: string;
  decision: DomainRecoveryDecision;
}

export interface DomainPitRecoveryDryRunRequest {
  environment: "production" | "test";
  targetTime: string;
  selections: readonly DomainPitRecoverySelection[];
}

export interface DomainPitRecoveryApplyGroupRequest {
  groupId: string;
  targetTime: string;
  selections: readonly DomainPitRecoverySelection[];
  stateFingerprint: string;
  dryRunToken: string;
  clientOperationId: string;
}

export interface DomainPitRecoveryApplyRequest {
  environment: "production" | "test";
  groups: readonly DomainPitRecoveryApplyGroupRequest[];
}

export interface DomainPitRecoveryCandidate extends DomainRecoveryDiscoverCandidate {
  groupId: string;
  environment: "production" | "test";
  disposition: "REVERT" | "PRESERVE" | "NOT_RECOVERABLE";
  dependencyImpact: boolean;
}

export interface DomainPitRecoveryDiscoverResult {
  operation: typeof DOMAIN_PIT_RECOVERY_OPERATION;
  environment: "production" | "test";
  targetTime: string;
  candidateCount: number;
  groupCount: number;
  candidates: DomainPitRecoveryCandidate[];
  groups: Array<{ groupId: string; candidateIds: string[] }>;
  evaluatedAt: string;
}

export interface DomainPitRecoveryGroupDryRun {
  groupId: string;
  environment: "production" | "test";
  targetTime: string;
  candidateIds: string[];
  selectedRevert: string[];
  selectedPreserve: string[];
  targetPlans: DomainRecoveryPlan[];
  dependencies: DomainRecoveryDependency[];
  dependencyImpact: boolean;
  conflicts: string[];
  applyEligibility: "ELIGIBLE" | "DENIED";
  stateFingerprint: string;
  dryRunToken: string;
  evaluatedAt: string;
}

export interface DomainPitRecoveryDryRunResult {
  operation: typeof DOMAIN_PIT_RECOVERY_OPERATION;
  environment: "production" | "test";
  targetTime: string;
  candidateCount: number;
  groupCount: number;
  groups: DomainPitRecoveryGroupDryRun[];
  evaluatedAt: string;
}

export type DomainPitRecoveryGroupStatus = "APPLIED" | "PRESERVED" | "STALE_STATE" | "BLOCKED" | "FAILED";

export interface DomainPitRecoveryGroupApplyResult {
  groupId: string;
  status: DomainPitRecoveryGroupStatus;
  applied: boolean;
  idempotent: boolean;
  candidateIds: string[];
  revertedCandidateIds: string[];
  preservedCandidateIds: string[];
  recoveryAuditIds: string[];
  conflicts: string[];
  authoritativeReadback: DomainRecoveryApplyResult["authoritativeReadback"][];
}

export interface DomainPitRecoveryApplyResult {
  operation: typeof DOMAIN_PIT_RECOVERY_OPERATION;
  environment: "production" | "test";
  groupCount: number;
  appliedGroupCount: number;
  preservedGroupCount: number;
  blockedGroupCount: number;
  groups: DomainPitRecoveryGroupApplyResult[];
  evaluatedAt: string;
}

interface DomainAuditRow {
  id: string;
  action: string;
  entityType: DomainRecoveryEntityType;
  entityId: string;
  beforeJson: string | null;
  afterJson: string | null;
  createdAt: string;
}

interface DomainTargetRow {
  id: string;
  entityType: DomainRecoveryEntityType;
  table: string;
  organizationId: string | null;
  environment: "production" | "test";
  farmId: string | null;
  houseId: string | null;
  flockId: string | null;
  values: Record<string, unknown>;
}

function domainEntityType(value: unknown): DomainRecoveryEntityType {
  if (typeof value === "string" && (DOMAIN_RECOVERY_ENTITY_TYPES as readonly string[]).includes(value)) {
    return value as DomainRecoveryEntityType;
  }
  throw new RecoveryCoreError("RECOVERY_DOMAIN_ENTITY_TYPE_INVALID");
}

function domainRequestText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new RecoveryCoreError(`RECOVERY_DOMAIN_${field.toUpperCase()}_INVALID`);
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001F\u007F]/u.test(normalized)) {
    throw new RecoveryCoreError(`RECOVERY_DOMAIN_${field.toUpperCase()}_INVALID`);
  }
  return normalized;
}

function domainEnvironment(value: unknown): "production" | "test" {
  if (value !== "production" && value !== "test") throw new RecoveryCoreError("RECOVERY_ENVIRONMENT_INVALID");
  return value;
}

function domainApplyToken(value: unknown, field: string): string {
  const token = domainRequestText(value, field, 128);
  if (!/^[a-f0-9]{64}$/u.test(token)) throw new RecoveryCoreError("RECOVERY_PLAN_TOKEN_INVALID");
  return token;
}

function validateDomainRequest(input: DomainRecoveryRequest): DomainRecoveryRequest {
  return {
    environment: domainEnvironment(input?.environment),
    auditId: domainRequestText(input?.auditId, "audit_id", 240),
    entityType: domainEntityType(input?.entityType),
    targetId: domainRequestText(input?.targetId, "target_id", 240),
    clientOperationId: domainRequestText(input?.clientOperationId, "client_operation_id", 240),
    reason: domainRequestText(input?.reason, "reason", 500),
  };
}

function validateDomainApplyRequest(input: DomainRecoveryApplyRequest): DomainRecoveryApplyRequest {
  const request = validateDomainRequest(input);
  if (input?.confirm !== true) throw new RecoveryCoreError("RECOVERY_CONFIRMATION_REQUIRED");
  return {
    ...request,
    stateFingerprint: domainApplyToken(input?.stateFingerprint, "state_fingerprint"),
    dryRunToken: domainApplyToken(input?.dryRunToken, "dry_run_token"),
    confirm: true,
    previewAcknowledged: input?.previewAcknowledged === true,
  };
}

function domainJsonObject(value: string | null, field: string): Record<string, unknown> | null {
  if (value === null || value === undefined || value === "") return null;
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new RecoveryCoreError(`RECOVERY_DOMAIN_${field.toUpperCase()}_INVALID`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new RecoveryCoreError(`RECOVERY_DOMAIN_${field.toUpperCase()}_INVALID`);
  return parsed as Record<string, unknown>;
}

function domainString(value: unknown, field: string, required = true): string | null {
  if (value === null || value === undefined || value === "") {
    if (required) throw new RecoveryCoreError(`RECOVERY_DOMAIN_${field.toUpperCase()}_INVALID`);
    return null;
  }
  if (typeof value !== "string") throw new RecoveryCoreError(`RECOVERY_DOMAIN_${field.toUpperCase()}_INVALID`);
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > 500 || /[\u0000-\u001F\u007F]/u.test(normalized)) {
    throw new RecoveryCoreError(`RECOVERY_DOMAIN_${field.toUpperCase()}_INVALID`);
  }
  return normalized;
}

function domainNullableString(value: unknown, field: string): string | null {
  return value === null || value === undefined || value === "" ? null : domainString(value, field, false);
}

function domainBool(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new RecoveryCoreError(`RECOVERY_DOMAIN_${field.toUpperCase()}_INVALID`);
  return value;
}

function domainInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new RecoveryCoreError(`RECOVERY_DOMAIN_${field.toUpperCase()}_INVALID`);
  return number;
}

function domainDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = domainString(value, field);
  if (!date || !Number.isFinite(Date.parse(date))) throw new RecoveryCoreError(`RECOVERY_DOMAIN_${field.toUpperCase()}_INVALID`);
  return date;
}

function domainNormalized(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "");
}

function domainSortedObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
}

function domainStatesEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(domainSortedObject(left)) === JSON.stringify(domainSortedObject(right));
}

function domainCopySnapshot(
  target: DomainTargetRow,
  before: Record<string, unknown> | null,
): Record<string, unknown> {
  const next = { ...target.values };
  const source = before ?? {};
  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(source, key);
  switch (target.entityType) {
    case "farm":
      if (before === null) next.active = false;
      else {
        if (has("name")) next.name = domainString(source.name, "name");
        if (has("siteName")) next.siteName = domainNullableString(source.siteName, "site_name");
        if (has("latitude")) next.latitude = source.latitude === null ? null : Number(source.latitude);
        if (has("longitude")) next.longitude = source.longitude === null ? null : Number(source.longitude);
        if (has("structureMode")) next.structureMode = domainString(source.structureMode, "structure_mode");
        if (has("note")) next.note = domainNullableString(source.note, "note");
        if (has("active")) next.active = domainBool(source.active, "active");
      }
      break;
    case "house":
      if (before === null) next.active = false;
      else {
        if (has("name")) next.name = domainString(source.name, "name");
        if (has("normalizedName")) next.normalizedName = domainString(source.normalizedName, "normalized_name");
        if (has("capacity")) next.capacity = domainInteger(source.capacity, "capacity");
        if (has("note")) next.note = domainNullableString(source.note, "note");
        if (has("active")) next.active = domainBool(source.active, "active");
      }
      break;
    case "flock":
      if (before === null) next.status = "cancelled";
      else {
        if (has("breed")) next.breed = domainNullableString(source.breed, "breed");
        if (has("expectedShipmentDate")) next.expectedShipmentDate = domainDate(source.expectedShipmentDate, "expected_shipment_date");
        if (has("actualShipmentDate")) next.actualShipmentDate = domainDate(source.actualShipmentDate, "actual_shipment_date");
        if (has("status")) {
          const status = domainString(source.status, "status");
          if (!status || !["active", "closed", "cancelled"].includes(status)) throw new RecoveryCoreError("RECOVERY_DOMAIN_STATUS_INVALID");
          next.status = status;
        }
        if (has("note")) next.note = domainNullableString(source.note, "note");
      }
      break;
    case "caretaker":
      if (before === null) next.active = false;
      else {
        if (has("name")) {
          const name = domainString(source.name, "name");
          next.name = name;
          next.normalizedName = has("normalizedName") ? domainString(source.normalizedName, "normalized_name") : domainNormalized(name ?? "");
        }
        if (has("normalizedName")) next.normalizedName = domainString(source.normalizedName, "normalized_name");
        if (has("note")) next.note = domainNullableString(source.note, "note");
        if (has("active")) next.active = domainBool(source.active, "active");
      }
      break;
    case "farm_caretaker_assignment":
      if (before === null) next.effectiveTo = addIsoDays(String(target.values.effectiveFrom), -1);
      else {
        if (has("effectiveFrom")) next.effectiveFrom = domainDate(source.effectiveFrom, "effective_from");
        if (has("effectiveTo")) next.effectiveTo = domainDate(source.effectiveTo, "effective_to");
        if (has("isPrimary")) next.isPrimary = domainBool(source.isPrimary, "is_primary");
      }
      break;
    case "line_group":
      if (before === null) {
        next.status = "unbound";
        next.farmId = null;
        next.farmName = null;
      } else {
        if (has("status")) next.status = domainString(source.status, "status");
        if (has("farmId")) next.farmId = domainNullableString(source.farmId, "farm_id");
        if (has("farmName")) next.farmName = domainNullableString(source.farmName, "farm_name");
      }
      break;
    case "line_group_organization_claim":
      if (before === null) {
        next.organizationId = null;
        next.status = "unbound";
      } else {
        if (has("organizationId")) next.organizationId = domainNullableString(source.organizationId, "organization_id");
        if (has("status")) next.status = domainString(source.status, "status");
      }
      break;
    case "line_group_operational_authorization":
      next.operationalAuthorized = before === null ? false : has("operationalAuthorized") ? domainBool(source.operationalAuthorized, "operational_authorized") : next.operationalAuthorized;
      break;
    case "line_group_ai_conversation":
      next.conversationV2Enabled = before === null ? false : has("conversationV2Enabled") ? domainBool(source.conversationV2Enabled, "conversation_v2_enabled") : next.conversationV2Enabled;
      break;
    case "operator_identity":
      if (before === null) next.active = false;
      else {
        if (has("displayName")) next.displayName = domainString(source.displayName, "display_name");
        if (has("active")) next.active = domainBool(source.active, "active");
      }
      break;
    case "operator_scope_binding":
      next.active = before === null ? false : has("active") ? domainBool(source.active, "active") : next.active;
      break;
    case "line_group_operator_binding":
      next.active = before === null ? false : has("active") ? domainBool(source.active, "active") : next.active;
      break;
  }
  return next;
}

function domainDependencyImpact(entityType: DomainRecoveryEntityType): boolean {
  return new Set<DomainRecoveryEntityType>([
    "farm",
    "house",
    "flock",
    "farm_caretaker_assignment",
    "line_group",
    "line_group_organization_claim",
    "operator_identity",
    "operator_scope_binding",
    "line_group_operator_binding",
  ]).has(entityType);
}

const DOMAIN_RECOVERY_MUTABLE_FIELDS: Readonly<Record<DomainRecoveryEntityType, readonly string[]>> = Object.freeze({
  farm: ["name", "siteName", "latitude", "longitude", "structureMode", "note", "active"],
  house: ["name", "normalizedName", "capacity", "note", "active"],
  flock: ["breed", "expectedShipmentDate", "actualShipmentDate", "status", "note"],
  caretaker: ["name", "normalizedName", "note", "active"],
  farm_caretaker_assignment: ["effectiveFrom", "effectiveTo", "isPrimary"],
  line_group: ["status", "farmId", "farmName"],
  line_group_organization_claim: ["organizationId", "status"],
  line_group_operational_authorization: ["operationalAuthorized"],
  line_group_ai_conversation: ["conversationV2Enabled"],
  operator_identity: ["displayName", "active"],
  operator_scope_binding: ["active"],
  line_group_operator_binding: ["active"],
});

function domainRecoveryMutableFields(entityType: DomainRecoveryEntityType): readonly string[] {
  return DOMAIN_RECOVERY_MUTABLE_FIELDS[entityType];
}

function domainExpectedAfterState(target: DomainTargetRow, proposedAfter: Record<string, unknown>): Record<string, unknown> {
  if (typeof target.values.version !== "number") return proposedAfter;
  return { ...proposedAfter, version: target.values.version + 1 };
}

function domainDependencyGroup(target: DomainTargetRow): string {
  if (target.entityType === "line_group" || target.entityType.startsWith("line_group_")) return `line-group:${target.environment}:${target.id}`;
  if (target.entityType === "farm" || target.entityType === "farm_caretaker_assignment") return `farm:${target.environment}:${target.farmId ?? target.id}`;
  if (target.entityType === "house") return `house:${target.environment}:${target.houseId ?? target.id}`;
  if (target.entityType === "flock") return `flock:${target.environment}:${target.flockId ?? target.id}`;
  if (target.entityType === "operator_identity") return `operator:${target.organizationId ?? "unknown"}:${target.id}`;
  if (target.entityType === "operator_scope_binding") return `scope:${target.environment}:${target.id}`;
  if (target.entityType === "line_group_operator_binding") return `binding:${target.environment}:${target.id}`;
  return `organization:${target.organizationId ?? "unknown"}:${target.entityType}`;
}

function domainDependencies(target: DomainTargetRow, audit: DomainAuditRow): DomainRecoveryDependency[] {
  const dependencies: DomainRecoveryDependency[] = [
    { kind: "domain_entity", id: `${target.entityType}:${target.id}`, relation: "target", effective: true },
    { kind: "derived_projection", id: `scope:${target.environment}:${target.farmId ?? target.organizationId ?? "organization"}`, relation: "scope", effective: true },
    { kind: "domain_entity", id: `audit:${audit.id}`, relation: "audit", effective: true },
  ];
  if (target.farmId) dependencies.push({ kind: "dependent_entity", id: `farm:${target.farmId}`, relation: "parent", effective: true });
  if (target.houseId) dependencies.push({ kind: "dependent_entity", id: `house:${target.houseId}`, relation: "parent", effective: true });
  if (target.flockId) dependencies.push({ kind: "dependent_entity", id: `flock:${target.flockId}`, relation: "parent", effective: true });
  return dependencies;
}

async function domainSha256(value: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(value));
}

async function domainAuditById(
  env: RecoveryEnv,
  organizationId: string,
  request: DomainRecoveryRequest,
): Promise<DomainAuditRow> {
  const row = await env.DB.prepare(
    `SELECT id, action, entity_type AS entityType, entity_id AS entityId,
            before_json AS beforeJson, after_json AS afterJson, created_at AS createdAt
       FROM audit_logs
      WHERE id = ? AND organization_id = ? AND entity_type = ? AND entity_id = ?
      LIMIT 1`,
  ).bind(request.auditId, organizationId, request.entityType, request.targetId).first<Record<string, unknown>>();
  if (!row) throw new RecoveryCoreError("RECOVERY_DOMAIN_AUDIT_NOT_FOUND", 404);
  return {
    id: String(row.id),
    action: String(row.action),
    entityType: domainEntityType(row.entityType),
    entityId: String(row.entityId),
    beforeJson: row.beforeJson === null || row.beforeJson === undefined ? null : String(row.beforeJson),
    afterJson: row.afterJson === null || row.afterJson === undefined ? null : String(row.afterJson),
    createdAt: String(row.createdAt),
  };
}

function domainTargetFromRow(
  entityType: DomainRecoveryEntityType,
  table: string,
  row: Record<string, unknown>,
  requestedEnvironment: "production" | "test",
): DomainTargetRow {
  const organizationId = row.organizationId === null || row.organizationId === undefined ? null : String(row.organizationId);
  const environment = row.environment === "test" ? "test" : "production";
  if (environment !== requestedEnvironment && ["farm", "house", "flock", "farm_caretaker_assignment", "line_group", "line_group_organization_claim", "line_group_operational_authorization", "line_group_ai_conversation", "operator_scope_binding", "line_group_operator_binding"].includes(entityType)) {
    throw new RecoveryCoreError("RECOVERY_DOMAIN_ENVIRONMENT_MISMATCH", 409);
  }
  const id = String(row.id);
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!["id", "entityType", "table", "environment"].includes(key)) values[key] = value;
  }
  if (["farm", "house", "caretaker", "operator_identity", "operator_scope_binding", "line_group_operator_binding"].includes(entityType) && Object.prototype.hasOwnProperty.call(values, "active")) {
    values.active = Number(values.active) === 1;
  }
  if (entityType === "farm_caretaker_assignment" && Object.prototype.hasOwnProperty.call(values, "isPrimary")) values.isPrimary = Number(values.isPrimary) === 1;
  if (entityType === "line_group" || entityType === "line_group_organization_claim" || entityType === "line_group_operational_authorization" || entityType === "line_group_ai_conversation") {
    if (Object.prototype.hasOwnProperty.call(values, "operationalAuthorized")) values.operationalAuthorized = Number(values.operationalAuthorized) === 1;
    if (Object.prototype.hasOwnProperty.call(values, "conversationV2Enabled")) values.conversationV2Enabled = Number(values.conversationV2Enabled) === 1;
  }
  return {
    id,
    entityType,
    table,
    organizationId,
    environment: requestedEnvironment,
    farmId: row.farmId === null || row.farmId === undefined ? null : String(row.farmId),
    houseId: row.houseId === null || row.houseId === undefined ? null : String(row.houseId),
    flockId: row.flockId === null || row.flockId === undefined ? null : String(row.flockId),
    values,
  };
}

async function domainTargetById(
  env: RecoveryEnv,
  organizationId: string,
  request: DomainRecoveryRequest,
): Promise<DomainTargetRow> {
  const id = request.targetId;
  let row: Record<string, unknown> | null = null;
  let table = "";
  switch (request.entityType) {
    case "farm":
      table = "farms";
      row = await env.DB.prepare(
        `SELECT id, organization_id AS organizationId, environment, name, site_name AS siteName,
                latitude, longitude, active, farm_structure_mode AS structureMode, note, version
           FROM farms WHERE id = ? AND organization_id = ? AND environment = ? LIMIT 1`,
      ).bind(id, organizationId, request.environment).first<Record<string, unknown>>();
      break;
    case "house":
      table = "houses";
      row = await env.DB.prepare(
        `SELECT h.id, f.organization_id AS organizationId, f.environment, h.farm_id AS farmId,
                h.name, h.normalized_name AS normalizedName, h.capacity, h.active, h.note, h.version
           FROM houses h JOIN farms f ON f.id = h.farm_id
          WHERE h.id = ? AND f.organization_id = ? AND f.environment = ? LIMIT 1`,
      ).bind(id, organizationId, request.environment).first<Record<string, unknown>>();
      break;
    case "flock":
      table = "flocks";
      row = await env.DB.prepare(
        `SELECT k.id, f.organization_id AS organizationId, f.environment, k.farm_id AS farmId,
                k.house_id AS houseId, k.batch_code AS batchCode, k.breed, k.chick_in_date AS chickInDate,
                k.initial_count AS initialCount, k.expected_shipment_date AS expectedShipmentDate,
                k.actual_shipment_date AS actualShipmentDate, k.status, k.note, k.version
           FROM flocks k JOIN farms f ON f.id = k.farm_id
          WHERE k.id = ? AND f.organization_id = ? AND f.environment = ? LIMIT 1`,
      ).bind(id, organizationId, request.environment).first<Record<string, unknown>>();
      break;
    case "caretaker":
      table = "caretakers";
      row = await env.DB.prepare(
        `SELECT id, organization_id AS organizationId, name, normalized_name AS normalizedName,
                active, note, version FROM caretakers
          WHERE id = ? AND organization_id = ? LIMIT 1`,
      ).bind(id, organizationId).first<Record<string, unknown>>();
      break;
    case "farm_caretaker_assignment":
      table = "farm_caretaker_assignments";
      row = await env.DB.prepare(
        `SELECT a.id, f.organization_id AS organizationId, f.environment, a.farm_id AS farmId,
                a.caretaker_id AS caretakerId, a.effective_from AS effectiveFrom,
                a.effective_to AS effectiveTo, a.is_primary AS isPrimary
           FROM farm_caretaker_assignments a JOIN farms f ON f.id = a.farm_id
          WHERE a.id = ? AND f.organization_id = ? AND f.environment = ? LIMIT 1`,
      ).bind(id, organizationId, request.environment).first<Record<string, unknown>>();
      break;
    case "line_group":
    case "line_group_organization_claim":
    case "line_group_operational_authorization":
    case "line_group_ai_conversation":
      table = "line_groups";
      row = await env.DB.prepare(
        `SELECT g.group_id AS id, g.organization_id AS organizationId,
                COALESCE(f.environment, 'production') AS environment,
                g.status, g.farm_id AS farmId, g.farm_name AS farmName,
                COALESCE(g.operational_authorized, 0) AS operationalAuthorized,
                COALESCE(g.conversation_v2_enabled, 0) AS conversationV2Enabled
           FROM line_groups g LEFT JOIN farms f ON f.id = g.farm_id
          WHERE g.group_id = ? LIMIT 1`,
      ).bind(id).first<Record<string, unknown>>();
      if (row && row.organizationId !== null && row.organizationId !== organizationId) throw new RecoveryCoreError("RECOVERY_DOMAIN_ORGANIZATION_MISMATCH", 409);
      if (row && request.entityType !== "line_group_organization_claim" && row.organizationId !== organizationId) row = null;
      break;
    case "operator_identity":
      table = "operator_identities";
      row = await env.DB.prepare(
        `SELECT id, organization_id AS organizationId, identity_type AS identityType,
                identity_key AS identityKey, display_name AS displayName, active, version
           FROM operator_identities WHERE id = ? AND organization_id = ? LIMIT 1`,
      ).bind(id, organizationId).first<Record<string, unknown>>();
      break;
    case "operator_scope_binding":
      table = "operator_scope_bindings";
      row = await env.DB.prepare(
        `SELECT s.id, s.organization_id AS organizationId, s.environment, s.operator_id AS operatorId,
                s.farm_id AS farmId, s.house_id AS houseId, s.flock_id AS flockId, s.active
           FROM operator_scope_bindings s
          WHERE s.id = ? AND s.organization_id = ? AND s.environment = ? LIMIT 1`,
      ).bind(id, organizationId, request.environment).first<Record<string, unknown>>();
      break;
    case "line_group_operator_binding":
      table = "line_group_operator_bindings";
      row = await env.DB.prepare(
        `SELECT b.id, b.organization_id AS organizationId, s.environment,
                b.line_group_id AS groupId, b.operator_id AS operatorId,
                b.scope_binding_id AS scopeId, b.active
           FROM line_group_operator_bindings b
           JOIN operator_scope_bindings s ON s.id = b.scope_binding_id AND s.organization_id = b.organization_id
          WHERE b.id = ? AND b.organization_id = ? AND s.environment = ? LIMIT 1`,
      ).bind(id, organizationId, request.environment).first<Record<string, unknown>>();
      break;
  }
  if (!row) throw new RecoveryCoreError("RECOVERY_DOMAIN_TARGET_NOT_FOUND", 404);
  return domainTargetFromRow(request.entityType, table, row, request.environment);
}

function domainPlanConflicts(
  target: DomainTargetRow,
  before: Record<string, unknown> | null,
  proposedAfter: Record<string, unknown>,
  organizationId: string,
): string[] {
  const conflicts: string[] = [];
  if (before && before.id !== undefined && String(before.id) !== target.id) conflicts.push("RECOVERY_DOMAIN_AUDIT_TARGET_MISMATCH");
  if (before && before.environment !== undefined && before.environment !== target.environment) conflicts.push("RECOVERY_DOMAIN_ENVIRONMENT_MISMATCH");
  if (target.entityType === "line_group_organization_claim") {
    const nextOrganization = proposedAfter.organizationId === null || proposedAfter.organizationId === undefined ? null : String(proposedAfter.organizationId);
    if (nextOrganization !== null && nextOrganization !== organizationId) conflicts.push("RECOVERY_DOMAIN_ORGANIZATION_REASSIGNMENT");
  }
  if (target.entityType === "flock" && proposedAfter.initialCount !== undefined && proposedAfter.initialCount !== target.values.initialCount) conflicts.push("RECOVERY_DOMAIN_STOCK_FIELD_FORBIDDEN");
  const changed = domainRecoveryMutableFields(target.entityType).some((key) => JSON.stringify(proposedAfter[key]) !== JSON.stringify(target.values[key]));
  if (!changed) conflicts.push("RECOVERY_DOMAIN_NO_STATE_CHANGE");
  return conflicts;
}

async function domainPlanFingerprint(
  organizationId: string,
  request: DomainRecoveryRequest,
  audit: DomainAuditRow,
  target: DomainTargetRow,
): Promise<string> {
  return domainSha256({
    operation: DOMAIN_RECOVERY_OPERATION,
    organizationId,
    request: { environment: request.environment, auditId: request.auditId, entityType: request.entityType, targetId: request.targetId },
    audit: { id: audit.id, action: audit.action, before: audit.beforeJson, after: audit.afterJson, createdAt: audit.createdAt },
    current: domainSortedObject(target.values),
  });
}

async function domainPlanToken(
  request: DomainRecoveryRequest,
  fingerprint: string,
  proposedAfter: Record<string, unknown>,
): Promise<string> {
  return domainSha256({ operation: DOMAIN_RECOVERY_OPERATION, request, fingerprint, proposedAfter: domainSortedObject(proposedAfter) });
}

async function buildDomainRecoveryPlan(
  env: RecoveryEnv,
  organizationId: string,
  request: DomainRecoveryRequest,
): Promise<DomainRecoveryPlan> {
  const normalized = validateDomainRequest(request);
  const audit = await domainAuditById(env, organizationId, normalized);
  const before = domainJsonObject(audit.beforeJson, "before");
  const target = await domainTargetById(env, organizationId, normalized);
  const proposedAfter = domainExpectedAfterState(target, domainCopySnapshot(target, before));
  const conflicts = domainPlanConflicts(target, before, proposedAfter, organizationId);
  const fingerprint = await domainPlanFingerprint(organizationId, normalized, audit, target);
  return {
    operation: DOMAIN_RECOVERY_OPERATION,
    environment: normalized.environment,
    audit: { id: audit.id, action: audit.action, entityType: audit.entityType, entityId: audit.entityId, createdAt: audit.createdAt },
    target: {
      id: target.id,
      entityType: target.entityType,
      table: target.table,
      organizationId: target.organizationId,
      environment: target.environment,
      scope: { farmId: target.farmId, houseId: target.houseId, flockId: target.flockId },
    },
    before,
    current: target.values,
    proposedAfter,
    dependencies: domainDependencies(target, audit),
    dependencyImpact: domainDependencyImpact(target.entityType),
    dependencyGroupId: domainDependencyGroup(target),
    stockImpact: { affected: false, delta: 0 },
    financeImpact: { affected: false, delta: 0 },
    conflicts,
    applyEligibility: conflicts.length ? "DENIED" : "ELIGIBLE",
    stateFingerprint: fingerprint,
    dryRunToken: await domainPlanToken(normalized, fingerprint, proposedAfter),
    evaluatedAt: new Date().toISOString(),
  };
}

export async function dryRunDomainRecovery(
  env: RecoveryEnv,
  context: Pick<RecoveryContext, "organizationId">,
  input: DomainRecoveryRequest,
): Promise<DomainRecoveryPlan> {
  return buildDomainRecoveryPlan(env, context.organizationId, input);
}

function domainRecoveryAuditId(clientOperationId: string): string {
  return `audit-domain-recovery-${clientOperationId}`;
}

function domainRecoveryAuditStatement(
  env: RecoveryEnv,
  context: RecoveryContext,
  request: DomainRecoveryApplyRequest,
  plan: DomainRecoveryPlan,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO audit_logs
      (id, organization_id, source, actor_type, actor_id, action, entity_type,
       entity_id, before_json, after_json, changed_fields_json, reason, request_id)
     VALUES (?, ?, 'web', 'web_admin', ?, 'recovery_apply', 'domain_recovery', ?, ?, ?, ?, ?, ?)`,
  ).bind(
    domainRecoveryAuditId(request.clientOperationId),
    context.organizationId,
    context.actorId,
    plan.target.id,
    JSON.stringify({
      operation: DOMAIN_RECOVERY_OPERATION,
      auditId: plan.audit.id,
      entityType: plan.target.entityType,
      targetId: plan.target.id,
      stateFingerprint: plan.stateFingerprint,
      state: plan.current,
    }),
    JSON.stringify({
      operation: DOMAIN_RECOVERY_OPERATION,
      entityType: plan.target.entityType,
      targetId: plan.target.id,
      state: plan.proposedAfter,
      stockDelta: 0,
      financeDelta: 0,
    }),
    JSON.stringify(domainRecoveryMutableFields(plan.target.entityType).filter((key) => JSON.stringify(plan.proposedAfter[key]) !== JSON.stringify(plan.current[key]))),
    request.reason,
    context.requestId,
  );
}

function domainUpdateStatement(
  env: RecoveryEnv,
  organizationId: string,
  request: DomainRecoveryRequest,
  plan: DomainRecoveryPlan,
): D1PreparedStatement {
  const state = plan.proposedAfter;
  const id = plan.target.id;
  switch (request.entityType) {
    case "farm":
      return env.DB.prepare(
        `UPDATE farms SET name = ?, site_name = ?, latitude = ?, longitude = ?,
                farm_structure_mode = ?, note = ?, active = ?, version = version + 1,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND organization_id = ? AND environment = ? AND version = ?`,
      ).bind(state.name, state.siteName ?? null, state.latitude ?? null, state.longitude ?? null, state.structureMode, state.note ?? null, state.active ? 1 : 0, id, organizationId, request.environment, Number(plan.current.version));
    case "house":
      return env.DB.prepare(
        `UPDATE houses SET name = ?, normalized_name = ?, capacity = ?, note = ?, active = ?,
                version = version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND version = ? AND EXISTS (
            SELECT 1 FROM farms f WHERE f.id = houses.farm_id AND f.organization_id = ? AND f.environment = ?
          )`,
      ).bind(state.name, state.normalizedName ?? domainNormalized(String(state.name)), state.capacity ?? null, state.note ?? null, state.active ? 1 : 0, id, Number(plan.current.version), organizationId, request.environment);
    case "flock":
      return env.DB.prepare(
        `UPDATE flocks SET breed = ?, expected_shipment_date = ?, actual_shipment_date = ?,
                status = ?, note = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND version = ? AND EXISTS (
            SELECT 1 FROM farms f WHERE f.id = flocks.farm_id AND f.organization_id = ? AND f.environment = ?
          )`,
      ).bind(state.breed ?? null, state.expectedShipmentDate ?? null, state.actualShipmentDate ?? null, state.status, state.note ?? null, id, Number(plan.current.version), organizationId, request.environment);
    case "caretaker":
      return env.DB.prepare(
        `UPDATE caretakers SET name = ?, normalized_name = ?, note = ?, active = ?,
                version = version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND organization_id = ? AND version = ?`,
      ).bind(state.name, state.normalizedName ?? domainNormalized(String(state.name)), state.note ?? null, state.active ? 1 : 0, id, organizationId, Number(plan.current.version));
    case "farm_caretaker_assignment":
      return env.DB.prepare(
        `UPDATE farm_caretaker_assignments SET effective_from = ?, effective_to = ?, is_primary = ?
          WHERE id = ? AND EXISTS (
            SELECT 1 FROM farms f WHERE f.id = farm_caretaker_assignments.farm_id
              AND f.organization_id = ? AND f.environment = ?
          )`,
      ).bind(state.effectiveFrom, state.effectiveTo ?? null, state.isPrimary ? 1 : 0, id, organizationId, request.environment);
    case "line_group":
      return env.DB.prepare(
        `UPDATE line_groups SET status = ?, farm_id = ?, farm_name = ?
          WHERE group_id = ? AND organization_id = ?`,
      ).bind(state.status, state.farmId ?? null, state.farmName ?? null, id, organizationId);
    case "line_group_organization_claim":
      return env.DB.prepare(
        `UPDATE line_groups SET organization_id = ?, status = ?
          WHERE group_id = ? AND organization_id = ?`,
      ).bind(state.organizationId ?? null, state.status, id, organizationId);
    case "line_group_operational_authorization":
      return env.DB.prepare(
        `UPDATE line_groups SET operational_authorized = ?
          WHERE group_id = ? AND organization_id = ?`,
      ).bind(state.operationalAuthorized ? 1 : 0, id, organizationId);
    case "line_group_ai_conversation":
      return env.DB.prepare(
        `UPDATE line_groups SET conversation_v2_enabled = ?
          WHERE group_id = ? AND organization_id = ?`,
      ).bind(state.conversationV2Enabled ? 1 : 0, id, organizationId);
    case "operator_identity":
      return env.DB.prepare(
        `UPDATE operator_identities SET display_name = ?, active = ?, version = version + 1,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND organization_id = ? AND version = ?`,
      ).bind(state.displayName, state.active ? 1 : 0, id, organizationId, Number(plan.current.version));
    case "operator_scope_binding":
      return env.DB.prepare(
        `UPDATE operator_scope_bindings SET active = ?
          WHERE id = ? AND organization_id = ? AND environment = ?`,
      ).bind(state.active ? 1 : 0, id, organizationId, request.environment);
    case "line_group_operator_binding":
      return env.DB.prepare(
        `UPDATE line_group_operator_bindings SET active = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND organization_id = ?`,
      ).bind(state.active ? 1 : 0, id, organizationId);
  }
}

async function domainRecoveryAuditExists(env: RecoveryEnv, organizationId: string, clientOperationId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT id FROM audit_logs WHERE id = ? AND organization_id = ? AND entity_type = 'domain_recovery' LIMIT 1",
  ).bind(domainRecoveryAuditId(clientOperationId), organizationId).first<{ id: string }>();
  return Boolean(row?.id);
}

async function domainRecoveryIdempotentState(
  env: RecoveryEnv,
  organizationId: string,
  request: DomainRecoveryApplyRequest,
): Promise<Record<string, unknown> | null> {
  const row = await env.DB.prepare(
    "SELECT after_json AS afterJson FROM audit_logs WHERE id = ? AND organization_id = ? AND entity_type = 'domain_recovery' LIMIT 1",
  ).bind(domainRecoveryAuditId(request.clientOperationId), organizationId).first<{ afterJson: string | null }>();
  const after = domainJsonObject(row?.afterJson ?? null, "recovery_after");
  return after?.state && typeof after.state === "object" && !Array.isArray(after.state) ? after.state as Record<string, unknown> : null;
}

async function domainAuthoritativeReadback(
  env: RecoveryEnv,
  organizationId: string,
  request: DomainRecoveryRequest,
): Promise<DomainRecoveryApplyResult["authoritativeReadback"]> {
  const target = await domainTargetById(env, organizationId, request);
  return { entityType: target.entityType, id: target.id, environment: target.environment, state: target.values };
}

async function executeDomainRecoveryGroup(
  env: RecoveryEnv,
  context: RecoveryContext,
  requests: readonly DomainRecoveryApplyRequest[],
  plans: readonly DomainRecoveryPlan[],
): Promise<{ auditIds: string[]; readbacks: DomainRecoveryApplyResult["authoritativeReadback"][] }> {
  if (!requests.length || requests.length !== plans.length) throw new RecoveryCoreError("RECOVERY_BATCH_INPUT_INVALID");
  const statements: D1PreparedStatement[] = [];
  for (let index = 0; index < requests.length; index += 1) {
    statements.push(domainUpdateStatement(env, context.organizationId, requests[index], plans[index]));
    statements.push(domainRecoveryAuditStatement(env, context, requests[index], plans[index]));
  }
  await env.DB.batch(statements);
  const readbacks: DomainRecoveryApplyResult["authoritativeReadback"][] = [];
  for (let index = 0; index < requests.length; index += 1) {
    const readback = await domainAuthoritativeReadback(env, context.organizationId, requests[index]);
    const fields = domainRecoveryMutableFields(requests[index].entityType);
    const matches = fields.every((field) => JSON.stringify(readback.state[field]) === JSON.stringify(plans[index].proposedAfter[field]));
    if (!matches) throw new RecoveryCoreError("RECOVERY_DOMAIN_READBACK_MISMATCH", 500);
    if (!(await domainRecoveryAuditExists(env, context.organizationId, requests[index].clientOperationId))) throw new RecoveryCoreError("RECOVERY_DOMAIN_AUDIT_READBACK_FAILED", 500);
    readbacks.push(readback);
  }
  return { auditIds: requests.map((request) => domainRecoveryAuditId(request.clientOperationId)), readbacks };
}

export async function applyDomainRecovery(
  env: RecoveryEnv,
  context: RecoveryContext,
  input: DomainRecoveryApplyRequest,
): Promise<DomainRecoveryApplyResult> {
  assertCanonicalWritesOpen(env);
  const request = validateDomainApplyRequest(input);
  const priorState = await domainRecoveryIdempotentState(env, context.organizationId, request);
  if (priorState) {
    const readback = await domainAuthoritativeReadback(env, context.organizationId, request);
    if (!domainStatesEqual(readback.state, priorState)) throw new RecoveryCoreError("RECOVERY_IDEMPOTENCY_CONFLICT", 409);
    return {
      operation: DOMAIN_RECOVERY_OPERATION,
      environment: request.environment,
      entityType: request.entityType,
      targetId: request.targetId,
      applied: false,
      idempotent: true,
      recoveryAuditId: domainRecoveryAuditId(request.clientOperationId),
      authoritativeReadback: readback,
    };
  }
  const plan = await buildDomainRecoveryPlan(env, context.organizationId, request);
  if (plan.stateFingerprint !== request.stateFingerprint) throw new RecoveryCoreError("STALE_STATE", 409);
  if (plan.dryRunToken !== request.dryRunToken) throw new RecoveryCoreError("RECOVERY_PLAN_TOKEN_MISMATCH", 409);
  if (plan.dependencyImpact && !request.previewAcknowledged) throw new RecoveryCoreError("RECOVERY_DEPENDENCY_PREVIEW_REQUIRED", 409);
  if (plan.conflicts.length || plan.applyEligibility !== "ELIGIBLE") throw new RecoveryCoreError(plan.conflicts[0] ?? "RECOVERY_DOMAIN_NOT_ELIGIBLE", 409);
  const executed = await executeDomainRecoveryGroup(env, context, [request], [plan]);
  return {
    operation: DOMAIN_RECOVERY_OPERATION,
    environment: request.environment,
    entityType: request.entityType,
    targetId: request.targetId,
    applied: true,
    idempotent: false,
    recoveryAuditId: executed.auditIds[0],
    authoritativeReadback: executed.readbacks[0],
  };
}

function validateDomainBatchRequest(input: DomainRecoveryBatchRequest): DomainRecoveryRequest[] {
  if (!input || !Array.isArray(input.targets) || input.targets.length < 1 || input.targets.length > MAX_DOMAIN_RECOVERY_TARGETS) throw new RecoveryCoreError("RECOVERY_BATCH_INPUT_INVALID");
  return input.targets.map(validateDomainRequest);
}

function validateDomainBatchApplyRequest(input: DomainRecoveryBatchApplyRequest): DomainRecoveryBatchApplyGroupRequest[] {
  if (!input || !Array.isArray(input.groups) || input.groups.length < 1 || input.groups.length > MAX_DOMAIN_RECOVERY_TARGETS) throw new RecoveryCoreError("RECOVERY_BATCH_INPUT_INVALID");
  const groups = input.groups.map((group) => {
    if (!group || !Array.isArray(group.targets) || group.targets.length < 1 || group.targets.length > MAX_DOMAIN_RECOVERY_TARGETS) throw new RecoveryCoreError("RECOVERY_BATCH_INPUT_INVALID");
    return {
      groupId: domainRequestText(group.groupId, "group_id", 240),
      targets: group.targets.map(validateDomainApplyRequest),
      stateFingerprint: domainApplyToken(group.stateFingerprint, "state_fingerprint"),
      dryRunToken: domainApplyToken(group.dryRunToken, "dry_run_token"),
    };
  });
  const seen = new Set<string>();
  let count = 0;
  for (const group of groups) {
    if (seen.has(group.groupId)) throw new RecoveryCoreError("RECOVERY_BATCH_DUPLICATE_GROUP");
    seen.add(group.groupId);
    count += group.targets.length;
  }
  if (count > MAX_DOMAIN_RECOVERY_TARGETS) throw new RecoveryCoreError("RECOVERY_BATCH_INPUT_INVALID");
  return groups;
}

async function domainBatchFingerprint(
  organizationId: string,
  groupId: string,
  plans: readonly DomainRecoveryPlan[],
): Promise<string> {
  return domainSha256({
    operation: DOMAIN_BATCH_RECOVERY_OPERATION,
    organizationId,
    groupId,
    plans: plans.map((plan) => ({
      audit: plan.audit,
      target: plan.target,
      current: domainSortedObject(plan.current),
      proposedAfter: domainSortedObject(plan.proposedAfter),
      conflicts: plan.conflicts,
    })),
  });
}

async function domainBatchToken(groupId: string, requests: readonly DomainRecoveryRequest[], fingerprint: string): Promise<string> {
  const requestIdentity = requests.map(({ environment, auditId, entityType, targetId, clientOperationId, reason }) => ({
    environment,
    auditId,
    entityType,
    targetId,
    clientOperationId,
    reason,
  }));
  return domainSha256({ operation: DOMAIN_BATCH_RECOVERY_OPERATION, groupId, fingerprint, requests: requestIdentity });
}

async function domainBatchPlans(
  env: RecoveryEnv,
  organizationId: string,
  requests: readonly DomainRecoveryRequest[],
  requestedGroupId?: string,
): Promise<{ groupId: string; plans: DomainRecoveryPlan[]; conflicts: string[]; environment: "production" | "test" | null }> {
  const plans = await Promise.all(requests.map((request) => buildDomainRecoveryPlan(env, organizationId, request)));
  const groupIds = new Set(plans.map((plan) => plan.dependencyGroupId));
  const environments = new Set(plans.map((plan) => plan.environment));
  const groupId = requestedGroupId ?? (groupIds.size === 1 ? Array.from(groupIds)[0] : `mixed:${Array.from(groupIds).sort().join(",")}`);
  const conflicts: string[] = [];
  if (requestedGroupId && (groupIds.size !== 1 || !groupIds.has(requestedGroupId))) conflicts.push("BATCH_GROUP_ID_MISMATCH");
  if (environments.size !== 1) conflicts.push("RECOVERY_BATCH_ENVIRONMENT_MISMATCH");
  for (const plan of plans) conflicts.push(...plan.conflicts.map((conflict) => `${plan.target.entityType}:${plan.target.id}:${conflict}`));
  return { groupId, plans, conflicts: Array.from(new Set(conflicts)), environment: environments.size === 1 ? Array.from(environments)[0] : null };
}

function domainBatchGroupFromPlans(
  groupId: string,
  batch: { plans: DomainRecoveryPlan[]; conflicts: string[]; environment: "production" | "test" | null },
  fingerprint: string,
  token: string,
): DomainRecoveryBatchGroupDryRun {
  const dependencies = batch.plans.flatMap((plan) => plan.dependencies);
  const uniqueDependencies = Array.from(new Map(dependencies.map((dependency) => [`${dependency.kind}:${dependency.id}:${dependency.relation}`, dependency])).values());
  return {
    groupId,
    environment: batch.environment,
    targetIds: batch.plans.map((plan) => plan.target.id),
    targets: batch.plans,
    dependencies: uniqueDependencies,
    dependencyImpact: batch.plans.some((plan) => plan.dependencyImpact),
    conflicts: Array.from(new Set(batch.conflicts)),
    applyEligibility: batch.conflicts.length ? "DENIED" : "ELIGIBLE",
    stateFingerprint: fingerprint,
    dryRunToken: token,
    evaluatedAt: new Date().toISOString(),
  };
}

export async function dryRunDomainRecoveryBatch(
  env: RecoveryEnv,
  context: Pick<RecoveryContext, "organizationId">,
  input: DomainRecoveryBatchRequest,
): Promise<DomainRecoveryBatchDryRun> {
  const requests = validateDomainBatchRequest(input);
  const grouped = new Map<string, DomainRecoveryRequest[]>();
  for (const request of requests) {
    const preview = await buildDomainRecoveryPlan(env, context.organizationId, request);
    const group = grouped.get(preview.dependencyGroupId) ?? [];
    group.push(request);
    grouped.set(preview.dependencyGroupId, group);
  }
  const groups: DomainRecoveryBatchGroupDryRun[] = [];
  for (const [groupId, groupRequests] of grouped.entries()) {
    const batch = await domainBatchPlans(env, context.organizationId, groupRequests, groupId);
    const fingerprint = await domainBatchFingerprint(context.organizationId, groupId, batch.plans);
    const token = await domainBatchToken(groupId, groupRequests, fingerprint);
    groups.push(domainBatchGroupFromPlans(groupId, batch, fingerprint, token));
  }
  groups.sort((left, right) => left.groupId.localeCompare(right.groupId));
  return { operation: DOMAIN_BATCH_RECOVERY_OPERATION, targetCount: requests.length, groupCount: groups.length, groups, evaluatedAt: new Date().toISOString() };
}

async function applyDomainBatchGroup(
  env: RecoveryEnv,
  context: RecoveryContext,
  group: DomainRecoveryBatchApplyGroupRequest,
): Promise<DomainRecoveryBatchGroupApplyResult> {
  const requests = group.targets.map(validateDomainApplyRequest);
  const targetIds = requests.map((request) => request.targetId);
  const existingStates = await Promise.all(requests.map((request) => domainRecoveryIdempotentState(env, context.organizationId, request)));
  const existingCount = existingStates.filter(Boolean).length;
  if (existingCount > 0 && existingCount < requests.length) return { groupId: group.groupId, status: "BLOCKED", applied: false, idempotent: false, targetIds, recoveryAuditIds: [], conflicts: ["BATCH_IDEMPOTENCY_PARTIAL"], authoritativeReadback: [] };
  const batch = await domainBatchPlans(env, context.organizationId, requests, group.groupId);
  const fingerprint = await domainBatchFingerprint(context.organizationId, group.groupId, batch.plans);
  const token = await domainBatchToken(group.groupId, requests, fingerprint);
  if (fingerprint !== group.stateFingerprint) return { groupId: group.groupId, status: "STALE_STATE", applied: false, idempotent: false, targetIds, recoveryAuditIds: [], conflicts: ["STALE_STATE"], authoritativeReadback: [] };
  if (token !== group.dryRunToken) return { groupId: group.groupId, status: "BLOCKED", applied: false, idempotent: false, targetIds, recoveryAuditIds: [], conflicts: ["RECOVERY_PLAN_TOKEN_MISMATCH"], authoritativeReadback: [] };
  if (batch.conflicts.length) return { groupId: group.groupId, status: "BLOCKED", applied: false, idempotent: false, targetIds, recoveryAuditIds: [], conflicts: batch.conflicts, authoritativeReadback: [] };
  if (existingCount === requests.length) {
    const readbacks = await Promise.all(requests.map((request) => domainAuthoritativeReadback(env, context.organizationId, request)));
    const valid = readbacks.every((readback, index) => domainStatesEqual(readback.state, existingStates[index] ?? {}));
    return valid
      ? { groupId: group.groupId, status: "APPLIED", applied: false, idempotent: true, targetIds, recoveryAuditIds: requests.map((request) => domainRecoveryAuditId(request.clientOperationId)), conflicts: [], authoritativeReadback: readbacks }
      : { groupId: group.groupId, status: "FAILED", applied: false, idempotent: false, targetIds, recoveryAuditIds: [], conflicts: ["BATCH_IDEMPOTENCY_READBACK_FAILED"], authoritativeReadback: [] };
  }
  if (requests.some((request, index) => batch.plans[index].dependencyImpact && !request.previewAcknowledged)) return { groupId: group.groupId, status: "BLOCKED", applied: false, idempotent: false, targetIds, recoveryAuditIds: [], conflicts: ["RECOVERY_DEPENDENCY_PREVIEW_REQUIRED"], authoritativeReadback: [] };
  if (batch.plans.some((plan) => plan.conflicts.length)) return { groupId: group.groupId, status: "BLOCKED", applied: false, idempotent: false, targetIds, recoveryAuditIds: [], conflicts: batch.plans.flatMap((plan) => plan.conflicts), authoritativeReadback: [] };
  try {
    const executed = await executeDomainRecoveryGroup(env, context, requests, batch.plans);
    return { groupId: group.groupId, status: "APPLIED", applied: true, idempotent: false, targetIds, recoveryAuditIds: executed.auditIds, conflicts: [], authoritativeReadback: executed.readbacks };
  } catch (error) {
    return { groupId: group.groupId, status: "FAILED", applied: false, idempotent: false, targetIds, recoveryAuditIds: [], conflicts: [error instanceof RecoveryCoreError ? error.code : "BATCH_ATOMIC_APPLY_FAILED"], authoritativeReadback: [] };
  }
}

export async function applyDomainRecoveryBatch(
  env: RecoveryEnv,
  context: RecoveryContext,
  input: DomainRecoveryBatchApplyRequest,
): Promise<DomainRecoveryBatchApplyResult> {
  assertCanonicalWritesOpen(env);
  const groups = validateDomainBatchApplyRequest(input);
  const results: DomainRecoveryBatchGroupApplyResult[] = [];
  for (const group of groups) results.push(await applyDomainBatchGroup(env, context, group));
  return {
    operation: DOMAIN_BATCH_RECOVERY_OPERATION,
    groupCount: results.length,
    appliedGroupCount: results.filter((group) => group.status === "APPLIED" && group.applied).length,
    blockedGroupCount: results.filter((group) => group.status !== "APPLIED").length,
    groups: results,
    evaluatedAt: new Date().toISOString(),
  };
}

function domainPitTargetTime(value: unknown): string {
  const targetTime = domainRequestText(value, "target_time", 80);
  if (!Number.isFinite(Date.parse(targetTime))) throw new RecoveryCoreError("RECOVERY_PIT_TARGET_TIME_INVALID");
  return targetTime;
}

function domainPitSelection(value: DomainPitRecoverySelection): DomainPitRecoverySelection {
  const auditId = domainRequestText(value?.auditId, "audit_id", 240);
  if (value?.decision !== "REVERT" && value?.decision !== "PRESERVE") throw new RecoveryCoreError("PIT_DECISION_INVALID");
  return { auditId, decision: value.decision };
}

async function domainCandidateMatchesEnvironment(
  env: AuditReadEnv,
  organizationId: string,
  candidate: DomainRecoveryDiscoverCandidate,
  environment: "production" | "test",
): Promise<boolean> {
  const snapshot = candidate.after ?? candidate.before;
  if (snapshot?.environment !== undefined) return snapshot.environment === environment;
  if (!candidate.entityType.startsWith("line_group")) return true;
  const organizationClause = candidate.entityType === "line_group_organization_claim"
    ? "(g.organization_id = ? OR g.organization_id IS NULL)"
    : "g.organization_id = ?";
  const row = await env.DB.prepare(
    `SELECT CASE WHEN f.environment IN ('production', 'test') THEN f.environment ELSE NULL END AS environment
       FROM line_groups g LEFT JOIN farms f ON f.id = g.farm_id
      WHERE g.group_id = ? AND ${organizationClause}
      LIMIT 1`,
  ).bind(candidate.targetId, organizationId).first<{ environment: string | null }>();
  return row?.environment === environment;
}

async function domainRecoveryCandidatesAfter(
  env: RecoveryEnv,
  organizationId: string,
  environment: "production" | "test",
  targetTime: string,
): Promise<DomainRecoveryDiscoverCandidate[]> {
  const placeholders = DOMAIN_RECOVERY_ENTITY_TYPES.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id, action, entity_type AS entityType, entity_id AS entityId,
            before_json AS beforeJson, after_json AS afterJson, created_at AS createdAt
       FROM audit_logs
      WHERE organization_id = ? AND entity_type IN (${placeholders})
        AND created_at > ? ORDER BY created_at ASC, id ASC LIMIT ?`,
  ).bind(organizationId, ...DOMAIN_RECOVERY_ENTITY_TYPES, targetTime, MAX_DOMAIN_PIT_CANDIDATES).all<Record<string, unknown>>();
  const candidates = rows.results.map((row) => ({
    auditId: String(row.id),
    action: String(row.action),
    entityType: domainEntityType(row.entityType),
    targetId: String(row.entityId),
    createdAt: String(row.createdAt),
    before: domainJsonObject(row.beforeJson === null || row.beforeJson === undefined ? null : String(row.beforeJson), "before"),
    after: domainJsonObject(row.afterJson === null || row.afterJson === undefined ? null : String(row.afterJson), "after"),
  }));
  const matches = await Promise.all(candidates.map((candidate) => domainCandidateMatchesEnvironment(env, organizationId, candidate, environment)));
  return candidates.filter((_, index) => matches[index]);
}

export async function discoverDomainRecovery(
  env: AuditReadEnv,
  context: Pick<RecoveryContext, "organizationId">,
  input: DomainRecoveryDiscoverRequest,
): Promise<DomainRecoveryDiscoverResult> {
  const environment = domainEnvironment(input?.environment);
  const entityType = input?.entityType === undefined ? undefined : domainEntityType(input.entityType);
  const limit = Math.min(MAX_DOMAIN_RECOVERY_TARGETS * 5, Math.max(1, Number(input?.limit ?? 50) || 50));
  const placeholders = DOMAIN_RECOVERY_ENTITY_TYPES.map(() => "?").join(",");
  const typeClause = entityType ? "AND entity_type = ?" : `AND entity_type IN (${placeholders})`;
  const bindings: unknown[] = [context.organizationId, ...(entityType ? [entityType] : DOMAIN_RECOVERY_ENTITY_TYPES), limit];
  const rows = await env.DB.prepare(
    `SELECT id, action, entity_type AS entityType, entity_id AS entityId,
            before_json AS beforeJson, after_json AS afterJson, created_at AS createdAt
       FROM audit_logs WHERE organization_id = ? ${typeClause}
      ORDER BY created_at DESC, id DESC LIMIT ?`,
  ).bind(...bindings).all<Record<string, unknown>>();
  const candidates = rows.results.map((row) => ({
    auditId: String(row.id), action: String(row.action), entityType: domainEntityType(row.entityType), targetId: String(row.entityId), createdAt: String(row.createdAt),
    before: domainJsonObject(row.beforeJson === null || row.beforeJson === undefined ? null : String(row.beforeJson), "before"),
    after: domainJsonObject(row.afterJson === null || row.afterJson === undefined ? null : String(row.afterJson), "after"),
  }));
  const matches = await Promise.all(candidates.map((candidate) => domainCandidateMatchesEnvironment(env, context.organizationId, candidate, environment)));
  const environmentCandidates = candidates.filter((_, index) => matches[index]);
  return {
    operation: "discover_canonical_domain_recovery_candidates",
    environment,
    candidates: environmentCandidates,
    evaluatedAt: new Date().toISOString(),
  };
}

export async function discoverDomainPointInTimeRecovery(
  env: RecoveryEnv,
  context: Pick<RecoveryContext, "organizationId">,
  input: DomainPitRecoveryDiscoverRequest,
): Promise<DomainPitRecoveryDiscoverResult> {
  const environment = domainEnvironment(input?.environment);
  const targetTime = domainPitTargetTime(input?.targetTime);
  const candidates = await domainRecoveryCandidatesAfter(env, context.organizationId, environment, targetTime);
  const enriched: DomainPitRecoveryCandidate[] = [];
  for (const candidate of candidates) {
    try {
      const request: DomainRecoveryRequest = { environment, auditId: candidate.auditId, entityType: candidate.entityType, targetId: candidate.targetId, clientOperationId: `pit-discover-${candidate.auditId}`, reason: `PIT discovery ${targetTime}` };
      const plan = await buildDomainRecoveryPlan(env, context.organizationId, request);
      enriched.push({ ...candidate, groupId: plan.dependencyGroupId, environment, disposition: plan.conflicts.length ? "NOT_RECOVERABLE" : "REVERT", dependencyImpact: plan.dependencyImpact });
    } catch {
      enriched.push({ ...candidate, groupId: `unresolved:${candidate.auditId}`, environment, disposition: "NOT_RECOVERABLE", dependencyImpact: true });
    }
  }
  const groups = Array.from(new Map(enriched.map((candidate) => [candidate.groupId, { groupId: candidate.groupId, candidateIds: [] as string[] }])).values());
  for (const candidate of enriched) groups.find((group) => group.groupId === candidate.groupId)?.candidateIds.push(candidate.auditId);
  return { operation: DOMAIN_PIT_RECOVERY_OPERATION, environment, targetTime, candidateCount: enriched.length, groupCount: groups.length, candidates: enriched, groups, evaluatedAt: new Date().toISOString() };
}

async function domainPitGroupPlans(
  env: RecoveryEnv,
  organizationId: string,
  request: DomainPitRecoveryDryRunRequest,
): Promise<DomainPitRecoveryGroupDryRun[]> {
  const environment = domainEnvironment(request.environment);
  const targetTime = domainPitTargetTime(request.targetTime);
  const selections = request.selections.map(domainPitSelection);
  if (!selections.length || selections.length > MAX_DOMAIN_PIT_CANDIDATES) throw new RecoveryCoreError("PIT_SELECTIONS_INVALID");
  const seen = new Set<string>();
  for (const selection of selections) {
    if (seen.has(selection.auditId)) throw new RecoveryCoreError(`PIT_DUPLICATE_SELECTION:${selection.auditId}`);
    seen.add(selection.auditId);
  }
  const discovered = await discoverDomainPointInTimeRecovery(env, { organizationId }, { environment, targetTime });
  const candidateMap = new Map(discovered.candidates.map((candidate) => [candidate.auditId, candidate]));
  const grouped = new Map<string, { plans: DomainRecoveryPlan[]; selectedRevert: string[]; selectedPreserve: string[]; conflicts: string[] }>();
  for (const selection of selections) {
    const candidate = candidateMap.get(selection.auditId);
    if (!candidate) throw new RecoveryCoreError(`PIT_CANDIDATE_NOT_FOUND:${selection.auditId}`, 404);
    const group = grouped.get(candidate.groupId) ?? { plans: [], selectedRevert: [], selectedPreserve: [], conflicts: [] };
    if (selection.decision === "PRESERVE") group.selectedPreserve.push(selection.auditId);
    else {
      if (candidate.disposition !== "REVERT") group.conflicts.push(`PIT_${candidate.disposition}:${candidate.auditId}`);
      else {
        const plan = await buildDomainRecoveryPlan(env, organizationId, {
          environment,
          auditId: candidate.auditId,
          entityType: candidate.entityType,
          targetId: candidate.targetId,
          clientOperationId: `pit-recovery-${candidate.auditId}`,
          reason: `Selective PIT revert to ${targetTime}`,
        });
        if (group.plans.some((existing) => existing.target.id === plan.target.id)) group.conflicts.push(`PIT_MULTIPLE_REVERT_TARGET:${plan.target.id}`);
        group.plans.push(plan);
        group.selectedRevert.push(selection.auditId);
      }
    }
    grouped.set(candidate.groupId, group);
  }
  const results: DomainPitRecoveryGroupDryRun[] = [];
  for (const [groupId, group] of grouped.entries()) {
    const dependencies = Array.from(new Map(group.plans.flatMap((plan) => plan.dependencies).map((dependency) => [`${dependency.kind}:${dependency.id}:${dependency.relation}`, dependency])).values());
    const conflicts = Array.from(new Set([...group.conflicts, ...group.plans.flatMap((plan) => plan.conflicts)]));
    const fingerprint = await domainSha256({ operation: DOMAIN_PIT_RECOVERY_OPERATION, organizationId, groupId, targetTime, selections, plans: group.plans.map((plan) => ({ audit: plan.audit, current: plan.current, proposedAfter: plan.proposedAfter })) });
    const token = await domainSha256({ operation: DOMAIN_PIT_RECOVERY_OPERATION, groupId, targetTime, selections, fingerprint });
    results.push({ groupId, environment, targetTime, candidateIds: [...group.selectedRevert, ...group.selectedPreserve], selectedRevert: group.selectedRevert, selectedPreserve: group.selectedPreserve, targetPlans: group.plans, dependencies, dependencyImpact: group.plans.some((plan) => plan.dependencyImpact), conflicts, applyEligibility: conflicts.length ? "DENIED" : "ELIGIBLE", stateFingerprint: fingerprint, dryRunToken: token, evaluatedAt: new Date().toISOString() });
  }
  return results;
}

export async function dryRunDomainPointInTimeRecovery(
  env: RecoveryEnv,
  context: Pick<RecoveryContext, "organizationId">,
  input: DomainPitRecoveryDryRunRequest,
): Promise<DomainPitRecoveryDryRunResult> {
  const environment = domainEnvironment(input?.environment);
  const targetTime = domainPitTargetTime(input?.targetTime);
  const groups = await domainPitGroupPlans(env, context.organizationId, input);
  return { operation: DOMAIN_PIT_RECOVERY_OPERATION, environment, targetTime, candidateCount: input.selections.length, groupCount: groups.length, groups, evaluatedAt: new Date().toISOString() };
}

function domainPitApplyStatus(
  group: DomainPitRecoveryGroupDryRun,
  status: DomainPitRecoveryGroupStatus,
  conflicts: string[] = [],
  idempotent = false,
  recoveryAuditIds: string[] = [],
  authoritativeReadback: DomainRecoveryApplyResult["authoritativeReadback"][] = [],
): DomainPitRecoveryGroupApplyResult {
  return { groupId: group.groupId, status, applied: status === "APPLIED" && !idempotent, idempotent, candidateIds: group.candidateIds, revertedCandidateIds: group.selectedRevert, preservedCandidateIds: group.selectedPreserve, recoveryAuditIds, conflicts, authoritativeReadback };
}

export async function applyDomainPointInTimeRecovery(
  env: RecoveryEnv,
  context: RecoveryContext,
  input: DomainPitRecoveryApplyRequest,
): Promise<DomainPitRecoveryApplyResult> {
  assertCanonicalWritesOpen(env);
  const environment = domainEnvironment(input?.environment);
  if (!Array.isArray(input?.groups) || !input.groups.length || input.groups.length > MAX_DOMAIN_PIT_GROUPS) throw new RecoveryCoreError("PIT_GROUPS_INVALID");
  const results: DomainPitRecoveryGroupApplyResult[] = [];
  for (const rawGroup of input.groups) {
    const group = {
      groupId: domainRequestText(rawGroup.groupId, "group_id", 240),
      targetTime: domainPitTargetTime(rawGroup.targetTime),
      selections: rawGroup.selections.map(domainPitSelection),
      stateFingerprint: domainApplyToken(rawGroup.stateFingerprint, "state_fingerprint"),
      dryRunToken: domainApplyToken(rawGroup.dryRunToken, "dry_run_token"),
      clientOperationId: domainRequestText(rawGroup.clientOperationId, "client_operation_id", 240),
    };
    try {
      const dryRun = await dryRunDomainPointInTimeRecovery(env, { organizationId: context.organizationId }, { environment, targetTime: group.targetTime, selections: group.selections });
      const plan = dryRun.groups.find((candidate) => candidate.groupId === group.groupId);
      if (!plan) {
        results.push({ groupId: group.groupId, status: "BLOCKED", applied: false, idempotent: false, candidateIds: group.selections.map((selection: DomainPitRecoverySelection) => selection.auditId), revertedCandidateIds: [], preservedCandidateIds: [], recoveryAuditIds: [], conflicts: ["PIT_GROUP_NOT_FOUND"], authoritativeReadback: [] });
        continue;
      }
      if (plan.stateFingerprint !== group.stateFingerprint) { results.push(domainPitApplyStatus(plan, "STALE_STATE", ["STALE_STATE"])); continue; }
      if (plan.dryRunToken !== group.dryRunToken) { results.push(domainPitApplyStatus(plan, "BLOCKED", ["PIT_PLAN_TOKEN_MISMATCH"])); continue; }
      if (plan.conflicts.length || plan.applyEligibility !== "ELIGIBLE") { results.push(domainPitApplyStatus(plan, "BLOCKED", plan.conflicts)); continue; }
      if (!plan.selectedRevert.length) { results.push(domainPitApplyStatus(plan, "PRESERVED")); continue; }
      const requests: DomainRecoveryApplyRequest[] = plan.targetPlans.map((targetPlan, index) => ({
        environment,
        auditId: targetPlan.audit.id,
        entityType: targetPlan.target.entityType,
        targetId: targetPlan.target.id,
        clientOperationId: `pit-recovery-${group.clientOperationId}-${index}`,
        reason: `Selective PIT revert to ${group.targetTime}`,
        stateFingerprint: targetPlan.stateFingerprint,
        dryRunToken: targetPlan.dryRunToken,
        confirm: true,
        previewAcknowledged: true,
      }));
      const executed = await executeDomainRecoveryGroup(env, context, requests, plan.targetPlans);
      results.push(domainPitApplyStatus(plan, "APPLIED", [], false, executed.auditIds, executed.readbacks));
    } catch (error) {
      const code = error instanceof RecoveryCoreError ? error.code : "PIT_ATOMIC_APPLY_FAILED";
      results.push({ groupId: group.groupId, status: "FAILED", applied: false, idempotent: false, candidateIds: group.selections.map((selection: DomainPitRecoverySelection) => selection.auditId), revertedCandidateIds: group.selections.filter((selection: DomainPitRecoverySelection) => selection.decision === "REVERT").map((selection: DomainPitRecoverySelection) => selection.auditId), preservedCandidateIds: group.selections.filter((selection: DomainPitRecoverySelection) => selection.decision === "PRESERVE").map((selection: DomainPitRecoverySelection) => selection.auditId), recoveryAuditIds: [], conflicts: [code], authoritativeReadback: [] });
    }
  }
  return { operation: DOMAIN_PIT_RECOVERY_OPERATION, environment, groupCount: results.length, appliedGroupCount: results.filter((group) => group.status === "APPLIED").length, preservedGroupCount: results.filter((group) => group.status === "PRESERVED").length, blockedGroupCount: results.filter((group) => !["APPLIED", "PRESERVED"].includes(group.status)).length, groups: results, evaluatedAt: new Date().toISOString() };
}
