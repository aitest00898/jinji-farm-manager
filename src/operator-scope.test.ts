import { describe, expect, it } from "vitest";
import {
  OperatorScopeError,
  operatorIdentityKeyFor,
  requireProvisionedOperatorScope,
  scopeBindingCovers,
} from "./operator-scope";

function fakeDb(input: {
  organizationId: string;
  operatorId?: string;
  groupId?: string;
  groupOrganizationId?: string | null;
  groupFarmId?: string | null;
  groupStatus?: string;
  binding?: boolean;
  scopes?: Array<{ environment: "production" | "test"; farmId: string; houseId: string | null; flockId: string | null; active: number }>;
}): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM operator_identities")) {
                return values[0] === input.organizationId && input.operatorId ? { id: input.operatorId } as T : null;
              }
              if (sql.includes("FROM line_groups")) {
                return values[0] === (input.groupId ?? "group-1")
                  ? {
                    organizationId: input.groupOrganizationId ?? input.organizationId,
                    farmId: input.groupFarmId ?? "farm-1",
                    status: input.groupStatus ?? "bound",
                  } as T
                  : null;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes("FROM operator_scope_bindings")) {
                const isGroupBindingQuery = sql.includes("line_group_operator_bindings");
                const organizationValue = isGroupBindingQuery ? values[2] : values[1];
                const groupValue = isGroupBindingQuery ? values[0] : null;
                const rows = values[0] === (isGroupBindingQuery ? input.groupId ?? "group-1" : values[0])
                  && organizationValue === input.organizationId
                  && (!isGroupBindingQuery || input.binding === true)
                  ? input.scopes ?? [] : [];
                return { results: rows as T[] };
              }
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("operator provisioning scope boundary", () => {
  it("uses the existing Web admin boundary without creating a second auth identity", () => {
    expect(operatorIdentityKeyFor({ organizationId: "org-1", actorType: "web_admin", actorId: "session-1" })).toEqual({
      identityType: "web_admin",
      identityKey: "web-admin:org-1",
    });
  });

  it("uses the stable LINE user identity and rejects missing identity", () => {
    expect(operatorIdentityKeyFor({ organizationId: "org-1", actorType: "line_user", actorId: "U123" })).toEqual({
      identityType: "line_user",
      identityKey: "U123",
    });
    expect(operatorIdentityKeyFor({ organizationId: "org-1", actorType: "line_user" })).toBeNull();
  });

  it("allows a farm binding to cover its house/flock while keeping environment isolated", () => {
    const binding = { environment: "production" as const, farmId: "farm-1", houseId: null, flockId: null, active: true };
    expect(scopeBindingCovers(binding, { environment: "production", farmId: "farm-1", houseId: "house-1", flockId: "flock-1" })).toBe(true);
    expect(scopeBindingCovers(binding, { environment: "test", farmId: "farm-1", houseId: "house-1", flockId: "flock-1" })).toBe(false);
    expect(scopeBindingCovers(binding, { environment: "production", farmId: "farm-2", houseId: null, flockId: null })).toBe(false);
  });

  it("does not widen a house or flock binding", () => {
    const binding = { environment: "production" as const, farmId: "farm-1", houseId: "house-1", flockId: "flock-1", active: true };
    expect(scopeBindingCovers(binding, { environment: "production", farmId: "farm-1", houseId: "house-1", flockId: "flock-1" })).toBe(true);
    expect(scopeBindingCovers(binding, { environment: "production", farmId: "farm-1", houseId: "house-1", flockId: "flock-2" })).toBe(false);
    expect(scopeBindingCovers(binding, { environment: "production", farmId: "farm-1", houseId: "house-2", flockId: "flock-1" })).toBe(false);
  });

  it("fails closed for an unprovisioned or cross-organization operator", async () => {
    await expect(requireProvisionedOperatorScope(
      { DB: fakeDb({ organizationId: "org-1" }) },
      {
        organizationId: "org-2",
        actorType: "line_user",
        actorId: "U123",
        lineGroupId: "group-1",
        target: { environment: "production", farmId: "farm-1" },
      },
    )).rejects.toMatchObject({ code: "CANONICAL_OPERATOR_IDENTITY_NOT_PROVISIONED" } satisfies Partial<OperatorScopeError>);
  });

  it("fails closed when the identity exists but its LINE group scope is not bound", async () => {
    await expect(requireProvisionedOperatorScope(
      { DB: fakeDb({ organizationId: "org-1", operatorId: "operator-1", scopes: [] }) },
      {
        organizationId: "org-1",
        actorType: "line_user",
        actorId: "U123",
        lineGroupId: "group-1",
        target: { environment: "production", farmId: "farm-1" },
      },
    )).rejects.toMatchObject({ code: "CANONICAL_LINE_GROUP_SCOPE_NOT_BOUND" } satisfies Partial<OperatorScopeError>);
  });

  it("allows the provisioned environment/farm/house/flock scope", async () => {
    await expect(requireProvisionedOperatorScope(
      { DB: fakeDb({
        organizationId: "org-1",
        operatorId: "operator-1",
        binding: true,
        scopes: [{ environment: "production", farmId: "farm-1", houseId: null, flockId: null, active: 1 }],
      }) },
      {
        organizationId: "org-1",
        actorType: "line_user",
        actorId: "U123",
        lineGroupId: "group-1",
        target: { environment: "production", farmId: "farm-1", houseId: "house-1", flockId: "flock-1" },
      },
    )).resolves.toBeUndefined();
  });

  it("rejects an unbound or cross-farm LINE group before any write", async () => {
    await expect(requireProvisionedOperatorScope(
      { DB: fakeDb({ organizationId: "org-1", operatorId: "operator-1", groupStatus: "unbound", binding: true, scopes: [{ environment: "production", farmId: "farm-1", houseId: null, flockId: null, active: 1 }] }) },
      {
        organizationId: "org-1",
        actorType: "line_user",
        actorId: "U123",
        lineGroupId: "group-1",
        target: { environment: "production", farmId: "farm-1" },
      },
    )).rejects.toMatchObject({ code: "CANONICAL_LINE_GROUP_SCOPE_NOT_BOUND" } satisfies Partial<OperatorScopeError>);
    await expect(requireProvisionedOperatorScope(
      { DB: fakeDb({ organizationId: "org-1", operatorId: "operator-1", groupFarmId: "farm-2", binding: true, scopes: [{ environment: "production", farmId: "farm-1", houseId: null, flockId: null, active: 1 }] }) },
      {
        organizationId: "org-1",
        actorType: "line_user",
        actorId: "U123",
        lineGroupId: "group-1",
        target: { environment: "production", farmId: "farm-1" },
      },
    )).rejects.toMatchObject({ code: "CANONICAL_LINE_GROUP_SCOPE_NOT_BOUND" } satisfies Partial<OperatorScopeError>);
  });

  it("keeps Test and Production scopes isolated at the shared boundary", async () => {
    await expect(requireProvisionedOperatorScope(
      { DB: fakeDb({ organizationId: "org-1", operatorId: "operator-1", binding: true, scopes: [{ environment: "test", farmId: "farm-1", houseId: null, flockId: null, active: 1 }] }) },
      {
        organizationId: "org-1",
        actorType: "line_user",
        actorId: "U123",
        lineGroupId: "group-1",
        target: { environment: "production", farmId: "farm-1" },
      },
    )).rejects.toMatchObject({ code: "CANONICAL_LINE_GROUP_SCOPE_NOT_BOUND" } satisfies Partial<OperatorScopeError>);
  });
});
