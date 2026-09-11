export type CanonicalLabSubmissionStatus = "none" | "waiting" | "incomplete";

export interface CanonicalLabSubmissionFact {
  id: string;
  farmId: string;
  houseId: string | null;
  flockId: string | null;
  occurredAt: string | null;
  createdAt: string;
  submittedAt: string | null;
  workflowStatus: string | null;
  result: string | null;
  completedAt: string | null;
  reminderDueAt: string | null;
  lifecycleStatus: string | null;
  correctionOfId: string | null;
  reversalOfId: string | null;
  replacementOfId: string | null;
}

export interface CanonicalLabSubmissionScope {
  farmId: string;
  farmName: string;
  environment: "production" | "test";
  houseId: string | null;
  houseName: string | null;
}

export interface CanonicalLabSubmissionSummary {
  pendingSubmissionCount: number;
  oldestPendingSubmissionAt: string | null;
  hasOverdueLabSubmission: boolean;
  incompleteReason: string | null;
  status: CanonicalLabSubmissionStatus;
  statusLabel: string;
  dataCompleteness: "complete" | "incomplete";
}

interface EffectiveLabFactsResult {
  facts: CanonicalLabSubmissionFact[];
  reason: string | null;
}

const DAY_MS = 86_400_000;

function relationFields(fact: CanonicalLabSubmissionFact): Array<{ field: string; id: string }> {
  const candidates: Array<[string, string | null]> = [
    ["correctionOfId", fact.correctionOfId],
    ["reversalOfId", fact.reversalOfId],
    ["replacementOfId", fact.replacementOfId],
  ];
  return candidates.flatMap(([field, id]) => typeof id === "string" && id ? [{ field, id }] : []);
}

function sameScope(left: CanonicalLabSubmissionFact, right: CanonicalLabSubmissionFact): boolean {
  return left.farmId === right.farmId
    && left.houseId === right.houseId
    && left.flockId === right.flockId;
}

/**
 * Projects the append-only O6 lineage to effective leaves. A correction child
 * replaces the parent for read purposes, while a reversal child removes the
 * targeted fact. Broken or ambiguous lineage is never guessed.
 */
export function effectiveCanonicalLabSubmissionFacts(
  facts: readonly CanonicalLabSubmissionFact[],
): EffectiveLabFactsResult {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const children = new Map<string, CanonicalLabSubmissionFact[]>();

  for (const fact of facts) {
    const relations = relationFields(fact);
    if (relations.length > 1) return { facts: [], reason: "MULTIPLE_LINEAGE_REFERENCES" };
    if (fact.lifecycleStatus === "replacement" && relations.length === 0) {
      return { facts: [], reason: "REPLACEMENT_WITHOUT_LINEAGE" };
    }
    const relation = relations[0];
    if (!relation) continue;
    if (relation.id === fact.id) return { facts: [], reason: "SELF_LINEAGE" };
    const parent = byId.get(relation.id);
    if (!parent) return { facts: [], reason: "LINEAGE_REFERENCE_NOT_FOUND" };
    if (!sameScope(parent, fact)) return { facts: [], reason: "LINEAGE_SCOPE_MISMATCH" };
    const siblings = children.get(parent.id) ?? [];
    siblings.push(fact);
    children.set(parent.id, siblings);
  }

  for (const [parentId, rows] of children) {
    if (rows.length > 1) return { facts: [], reason: `MULTIPLE_LINEAGE_CHILDREN:${parentId}` };
  }

  const effective = facts.filter((fact) => {
    if (fact.lifecycleStatus === "reversed" || fact.lifecycleStatus === "reversal") return false;
    if (children.has(fact.id)) return false;
    const relation = relationFields(fact)[0];
    return !relation || relation.field === "correctionOfId" || relation.field === "replacementOfId";
  });
  return { facts: effective, reason: null };
}

function baseSummary(
  status: CanonicalLabSubmissionStatus,
  pendingSubmissionCount: number,
  oldestPendingSubmissionAt: string | null,
  hasOverdueLabSubmission: boolean,
  incompleteReason: string | null,
  dataCompleteness: "complete" | "incomplete" = "complete",
): CanonicalLabSubmissionSummary {
  const statusLabel = dataCompleteness === "incomplete"
    ? "送驗：資料不足，無法判定"
    : status === "incomplete"
      ? "送驗：結果待補"
      : status === "waiting"
        ? "送驗：等待結果"
        : "送驗：無逾期未完成";
  return {
    pendingSubmissionCount,
    oldestPendingSubmissionAt,
    hasOverdueLabSubmission,
    incompleteReason,
    status,
    statusLabel,
    dataCompleteness,
  };
}

function invalidSummary(reason: string): CanonicalLabSubmissionSummary {
  return baseSummary("incomplete", 0, null, false, reason, "incomplete");
}

function validTimestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function reminderDueAt(fact: CanonicalLabSubmissionFact, submittedAt: number): number | null {
  const expected = submittedAt + 3 * DAY_MS;
  if (fact.reminderDueAt !== null) {
    const persisted = validTimestamp(fact.reminderDueAt);
    if (persisted === null || persisted !== expected) return null;
    return persisted;
  }
  // Existing O6 records derive reminderDueAt from submittedAt. Keep the same
  // deterministic formula for older rows where the derived column is absent.
  return expected;
}

function validateEffectiveFact(fact: CanonicalLabSubmissionFact): string | null {
  const submittedAt = validTimestamp(fact.submittedAt);
  if (submittedAt === null) return "O6_SUBMITTED_AT_INVALID";
  if (reminderDueAt(fact, submittedAt) === null) return "O6_REMINDER_DEADLINE_INVALID";
  if (fact.workflowStatus === "waiting_result") {
    if (fact.result !== null || fact.completedAt !== null) return "O6_WAITING_RESULT_CONTRADICTORY";
    return null;
  }
  if (fact.workflowStatus === "completed") {
    if (typeof fact.result !== "string" || !fact.result.trim()) return "O6_COMPLETED_RESULT_MISSING";
    if (validTimestamp(fact.completedAt) === null) return "O6_COMPLETED_AT_INVALID";
    return null;
  }
  return "O6_WORKFLOW_STATUS_INVALID";
}

export function deriveCanonicalLabSubmissionSummary(
  scope: CanonicalLabSubmissionScope,
  facts: readonly CanonicalLabSubmissionFact[],
  now = new Date(),
): CanonicalLabSubmissionSummary {
  const scopedFacts = facts.filter((fact) => fact.farmId === scope.farmId && (!scope.houseId || fact.houseId === scope.houseId));
  const effective = effectiveCanonicalLabSubmissionFacts(scopedFacts);
  if (effective.reason) return invalidSummary(effective.reason);
  if (!Number.isFinite(now.getTime())) return invalidSummary("READ_TIME_INVALID");

  const pending: Array<{ fact: CanonicalLabSubmissionFact; submittedAt: number; submittedAtValue: string; overdue: boolean }> = [];
  for (const fact of effective.facts) {
    const invalid = validateEffectiveFact(fact);
    if (invalid) return invalidSummary(invalid);
    if (fact.workflowStatus !== "waiting_result") continue;
    const submittedAt = validTimestamp(fact.submittedAt);
    if (submittedAt === null) return invalidSummary("O6_SUBMITTED_AT_INVALID");
    const dueAt = reminderDueAt(fact, submittedAt);
    if (dueAt === null) return invalidSummary("O6_REMINDER_DEADLINE_INVALID");
    pending.push({
      fact,
      submittedAt,
      submittedAtValue: String(fact.submittedAt),
      // The existing reminder contract is due at submittedAt + 3 days; the
      // read model uses the same inclusive boundary (now >= reminderDueAt).
      overdue: now.getTime() >= dueAt,
    });
  }

  pending.sort((left, right) => left.submittedAt - right.submittedAt || left.fact.id.localeCompare(right.fact.id));
  const overdue = pending.some((item) => item.overdue);
  return baseSummary(
    overdue ? "incomplete" : pending.length ? "waiting" : "none",
    pending.length,
    pending[0]?.submittedAtValue ?? null,
    overdue,
    overdue ? "OVERDUE_UNRESOLVED_SUBMISSION" : null,
  );
}
