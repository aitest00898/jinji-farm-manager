import { describe, expect, it } from "vitest";
import {
  deriveCanonicalLabSubmissionSummary,
  type CanonicalLabSubmissionFact,
  type CanonicalLabSubmissionScope,
} from "./canonical-lab-submission-read-model";

const scopeA: CanonicalLabSubmissionScope = {
  farmId: "farm-1",
  farmName: "金雞測試場",
  environment: "test",
  houseId: "house-a",
  houseName: "測試一舍",
};

const scopeB: CanonicalLabSubmissionScope = {
  ...scopeA,
  houseId: "house-b",
  houseName: "測試二舍",
};

function lab(
  input: Partial<CanonicalLabSubmissionFact> & Pick<CanonicalLabSubmissionFact, "id">,
): CanonicalLabSubmissionFact {
  return {
    id: input.id,
    farmId: input.farmId ?? "farm-1",
    houseId: input.houseId === undefined ? "house-a" : input.houseId,
    flockId: input.flockId === undefined ? "flock-a" : input.flockId,
    occurredAt: input.occurredAt ?? input.submittedAt ?? "2026-09-01T00:00:00.000Z",
    createdAt: input.createdAt ?? input.submittedAt ?? "2026-09-01T00:00:00.000Z",
    submittedAt: input.submittedAt === undefined ? "2026-09-01T00:00:00.000Z" : input.submittedAt,
    workflowStatus: input.workflowStatus ?? "waiting_result",
    result: input.result === undefined ? null : input.result,
    completedAt: input.completedAt === undefined ? null : input.completedAt,
    reminderDueAt: input.reminderDueAt === undefined ? "2026-09-04T00:00:00.000Z" : input.reminderDueAt,
    lifecycleStatus: input.lifecycleStatus ?? "active",
    correctionOfId: input.correctionOfId === undefined ? null : input.correctionOfId,
    reversalOfId: input.reversalOfId === undefined ? null : input.reversalOfId,
    replacementOfId: input.replacementOfId === undefined ? null : input.replacementOfId,
  };
}

function completed(id: string, overrides: Partial<CanonicalLabSubmissionFact> = {}): CanonicalLabSubmissionFact {
  return lab({
    id,
    workflowStatus: "completed",
    result: "陰性",
    completedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  });
}

describe("canonical O6 lab-submission read model", () => {
  it("keeps a fresh unresolved submission waiting and not incomplete", () => {
    const result = deriveCanonicalLabSubmissionSummary(scopeA, [lab({ id: "o6-a" })], new Date("2026-09-03T23:59:59.000Z"));
    expect(result).toMatchObject({
      pendingSubmissionCount: 1,
      oldestPendingSubmissionAt: "2026-09-01T00:00:00.000Z",
      hasOverdueLabSubmission: false,
      incompleteReason: null,
      status: "waiting",
      statusLabel: "送驗：等待結果",
    });
  });

  it("uses the existing reminder deadline at the exact three-day boundary and after it", () => {
    const facts = [lab({ id: "o6-a" })];
    const atBoundary = deriveCanonicalLabSubmissionSummary(scopeA, facts, new Date("2026-09-04T00:00:00.000Z"));
    const afterBoundary = deriveCanonicalLabSubmissionSummary(scopeA, facts, new Date("2026-09-04T00:00:01.000Z"));
    expect(atBoundary).toMatchObject({ hasOverdueLabSubmission: true, status: "incomplete", incompleteReason: "OVERDUE_UNRESOLVED_SUBMISSION" });
    expect(afterBoundary).toMatchObject({ hasOverdueLabSubmission: true, status: "incomplete" });
  });

  it("clears the house status when an effective result is completed", () => {
    const result = deriveCanonicalLabSubmissionSummary(scopeA, [completed("o6-done")], new Date("2026-09-10T00:00:00.000Z"));
    expect(result).toMatchObject({ pendingSubmissionCount: 0, hasOverdueLabSubmission: false, status: "none", statusLabel: "送驗：無逾期未完成" });
  });

  it("keeps the house incomplete when one submission is overdue and another is completed", () => {
    const result = deriveCanonicalLabSubmissionSummary(scopeA, [
      lab({ id: "o6-overdue" }),
      completed("o6-done", { submittedAt: "2026-09-02T00:00:00.000Z", reminderDueAt: "2026-09-05T00:00:00.000Z" }),
    ], new Date("2026-09-10T00:00:00.000Z"));
    expect(result).toMatchObject({ pendingSubmissionCount: 1, hasOverdueLabSubmission: true, status: "incomplete" });
  });

  it("clears the status only after all relevant submissions are resolved", () => {
    const result = deriveCanonicalLabSubmissionSummary(scopeA, [
      completed("o6-a"),
      completed("o6-b", { submittedAt: "2026-09-03T00:00:00.000Z", reminderDueAt: "2026-09-06T00:00:00.000Z" }),
    ], new Date("2026-09-10T00:00:00.000Z"));
    expect(result).toMatchObject({ pendingSubmissionCount: 0, hasOverdueLabSubmission: false, status: "none" });
  });

  it("removes a reversed overdue submission from the effective projection", () => {
    const result = deriveCanonicalLabSubmissionSummary(scopeA, [
      lab({ id: "o6-a" }),
      lab({ id: "o6-a-reversal", reversalOfId: "o6-a" }),
    ], new Date("2026-09-10T00:00:00.000Z"));
    expect(result).toMatchObject({ pendingSubmissionCount: 0, hasOverdueLabSubmission: false, status: "none" });
  });

  it("uses a corrected submission/result as the effective fact", () => {
    const result = deriveCanonicalLabSubmissionSummary(scopeA, [
      lab({ id: "o6-a" }),
      completed("o6-a-correction", { correctionOfId: "o6-a", completedAt: "2026-09-05T00:00:00.000Z" }),
    ], new Date("2026-09-10T00:00:00.000Z"));
    expect(result).toMatchObject({ pendingSubmissionCount: 0, hasOverdueLabSubmission: false, status: "none" });
  });

  it("recomputes when a completed result is reversed", () => {
    const result = deriveCanonicalLabSubmissionSummary(scopeA, [
      completed("o6-done"),
      completed("o6-done-reversal", { reversalOfId: "o6-done" }),
    ], new Date("2026-09-10T00:00:00.000Z"));
    expect(result).toMatchObject({ pendingSubmissionCount: 0, hasOverdueLabSubmission: false, status: "none" });
  });

  it("isolates an overdue house from another house", () => {
    const facts = [lab({ id: "o6-house-a" }), lab({ id: "o6-house-b", houseId: "house-b" })];
    const houseA = deriveCanonicalLabSubmissionSummary(scopeA, facts, new Date("2026-09-10T00:00:00.000Z"));
    const houseB = deriveCanonicalLabSubmissionSummary(scopeB, facts, new Date("2026-09-03T23:59:59.000Z"));
    expect(houseA).toMatchObject({ hasOverdueLabSubmission: true, status: "incomplete" });
    expect(houseB).toMatchObject({ pendingSubmissionCount: 1, hasOverdueLabSubmission: false, status: "waiting" });
  });

  it("fails closed when a persisted reminder deadline disagrees with the existing contract", () => {
    const result = deriveCanonicalLabSubmissionSummary(scopeA, [lab({ id: "o6-invalid", reminderDueAt: "2026-09-05T00:00:00.000Z" })], new Date("2026-09-03T00:00:00.000Z"));
    expect(result).toMatchObject({ dataCompleteness: "incomplete", incompleteReason: "O6_REMINDER_DEADLINE_INVALID", statusLabel: "送驗：資料不足，無法判定" });
  });
});
