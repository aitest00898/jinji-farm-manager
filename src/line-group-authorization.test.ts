import { describe, expect, it } from "vitest";
import {
  LineGroupAuthorizationError,
  requireAuthorizedLineGroup,
} from "./line-group-authorization";

function fakeDb(row: {
  organizationId?: string | null;
  status?: string;
  operationalAuthorized?: number;
} | null): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (!sql.includes("FROM line_groups") || values[0] !== "group-1") return null;
              return row as T;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("authorized LINE group operational trust", () => {
  it("allows an ordinary member of an authorized group without an operator identity", async () => {
    await expect(requireAuthorizedLineGroup(
      { DB: fakeDb({ organizationId: "org-1", status: "unbound", operationalAuthorized: 1 }) },
      { organizationId: "org-1", groupId: "group-1", lineUserId: "U-ordinary" },
    )).resolves.toBeUndefined();
  });

  it("rejects a known group until an explicit group authorization exists", async () => {
    await expect(requireAuthorizedLineGroup(
      { DB: fakeDb({ organizationId: "org-1", status: "bound", operationalAuthorized: 0 }) },
      { organizationId: "org-1", groupId: "group-1", lineUserId: "U-old-provisioned" },
    )).rejects.toMatchObject({ code: "CANONICAL_LINE_GROUP_NOT_AUTHORIZED" } satisfies Partial<LineGroupAuthorizationError>);
  });

  it("rejects left, missing, and cross-organization groups", async () => {
    await expect(requireAuthorizedLineGroup(
      { DB: fakeDb({ organizationId: "org-1", status: "left", operationalAuthorized: 1 }) },
      { organizationId: "org-1", groupId: "group-1", lineUserId: "U1" },
    )).rejects.toMatchObject({ code: "CANONICAL_LINE_GROUP_NOT_AUTHORIZED" });
    await expect(requireAuthorizedLineGroup(
      { DB: fakeDb(null) },
      { organizationId: "org-1", groupId: "group-1", lineUserId: "U1" },
    )).rejects.toMatchObject({ code: "CANONICAL_LINE_GROUP_NOT_FOUND" });
    await expect(requireAuthorizedLineGroup(
      { DB: fakeDb({ organizationId: "org-other", status: "bound", operationalAuthorized: 1 }) },
      { organizationId: "org-1", groupId: "group-1", lineUserId: "U1" },
    )).rejects.toMatchObject({ code: "CANONICAL_LINE_GROUP_ORGANIZATION_MISMATCH" });
  });

  it("fails closed when group, actor, or the new schema is unavailable", async () => {
    await expect(requireAuthorizedLineGroup(
      { DB: fakeDb({ organizationId: "org-1", status: "bound", operationalAuthorized: 1 }) },
      { organizationId: "org-1", groupId: null, lineUserId: "U1" },
    )).rejects.toMatchObject({ code: "CANONICAL_LINE_GROUP_AUTH_REQUIRED" });
    await expect(requireAuthorizedLineGroup(
      { DB: { prepare: () => { throw new Error("missing_column"); } } as unknown as D1Database },
      { organizationId: "org-1", groupId: "group-1", lineUserId: "U1" },
    )).rejects.toMatchObject({ code: "CANONICAL_LINE_GROUP_AUTH_UNAVAILABLE" });
  });
});
