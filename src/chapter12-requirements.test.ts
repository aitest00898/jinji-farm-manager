import { describe, expect, it } from "vitest";
import {
  closeOnlySessionPolicy,
  deriveOneWaterPendingBoundary,
  financeMutationPlan,
  recalculationStateFor,
  validateFinanceMutationRequest,
  masterBatchPreview,
} from "./chapter12-requirements";

describe("Chapter 12 bounded contracts", () => {
  it("requires an explicit confirmed finance mutation and emits an auditable plan", () => {
    expect(() => validateFinanceMutationRequest({
      entityType: "investor", entityId: "investor-1", operation: "update", changes: { name: "New name" }, reason: "admin correction",
    })).toThrow("FINANCE_MUTATION_CONFIRMATION_REQUIRED");
    const request = validateFinanceMutationRequest({
      entityType: "investor", entityId: "investor-1", operation: "update", changes: { name: "New name" }, reason: "admin correction", confirm: true,
    });
    expect(financeMutationPlan(request, { id: "investor-1", name: "Old name" }, ["name", "active"])).toMatchObject({
      after: { name: "New name" }, changedFields: ["name"], requiresWarningOverride: false,
    });
  });

  it("requires a warning override for changing a profit result but no separate override reason", () => {
    const base = validateFinanceMutationRequest({
      entityType: "profit_distribution", entityId: "distribution-1", operation: "update", changes: { netIncome: 12 }, reason: "admin correction", confirm: true,
    });
    expect(() => financeMutationPlan(base, { id: "distribution-1", netIncome: 10 }, ["netIncome"])).toThrow("FINANCE_WARNING_OVERRIDE_REQUIRED");
    const plan = financeMutationPlan({ ...base, warningOverride: true }, { id: "distribution-1", netIncome: 10 }, ["netIncome"]);
    expect(plan.requiresWarningOverride).toBe(true);
    expect(plan.after).toMatchObject({ netIncome: 12 });
  });

  it("previews master-data batches with explicit dependencies and deterministic order", () => {
    const preview = masterBatchPreview([
      { kind: "farm", id: "farm-1", changes: { name: "A" } },
      { kind: "house", id: "house-1", dependsOn: ["farm:farm-1"], changes: { name: "1舍" } },
    ]);
    expect(preview.safe).toBe(true);
    expect(preview.dependencies).toEqual(["farm:farm-1"]);
    expect(preview.executionOrder).toEqual(["farm:farm-1", "house:house-1"]);
    expect(masterBatchPreview([{ kind: "house", id: "house-2", changes: { name: "2舍" } }]).safe).toBe(false);
    expect(masterBatchPreview([
      { kind: "house", id: "house-3", dependsOn: ["existing:farm:farm-1"], changes: { name: "3舍" } },
    ]).safe).toBe(true);
    expect(masterBatchPreview([
      { kind: "house", id: "house-4", dependsOn: ["unresolved"], changes: { name: "4舍" } },
    ]).safe).toBe(false);
  });

  it("exposes stable versus large recalculation state", () => {
    expect(recalculationStateFor(100)).toBe("STABLE");
    expect(recalculationStateFor(101)).toBe("RECALCULATING");
  });

  it("closes one-water pending reminders only after depletion and preserves history", () => {
    expect(deriveOneWaterPendingBoundary({ stock: 0, lifecycleStatus: "READY_NEXT_INTAKE", unresolvedPendingCount: 2, pendingReminderCount: 2 })).toEqual({
      status: "CLOSED", unresolvedPendingCount: 2, finalSummaryRequired: true, remindersActive: false, historyRetained: true,
    });
    expect(deriveOneWaterPendingBoundary({ stock: 4, lifecycleStatus: "ACTIVE", unresolvedPendingCount: 0, pendingReminderCount: 1 }).remindersActive).toBe(true);
  });

  it("uses close-only session policy for page/browser close and administrative revocation", () => {
    expect(closeOnlySessionPolicy("pagehide")).toEqual({ revoke: true, auditAction: "client_close" });
    expect(closeOnlySessionPolicy("admin_revoke")).toEqual({ revoke: true, auditAction: "revoke" });
  });
});
