export type LineGroupAuthorizationCode =
  | "CANONICAL_LINE_GROUP_AUTH_REQUIRED"
  | "CANONICAL_LINE_GROUP_NOT_FOUND"
  | "CANONICAL_LINE_GROUP_NOT_AUTHORIZED"
  | "CANONICAL_LINE_GROUP_ORGANIZATION_MISMATCH"
  | "CANONICAL_LINE_GROUP_AUTH_UNAVAILABLE";

export class LineGroupAuthorizationError extends Error {
  readonly code: LineGroupAuthorizationCode;

  constructor(code: LineGroupAuthorizationCode) {
    super(code);
    this.name = "LineGroupAuthorizationError";
    this.code = code;
  }
}

interface AuthorizedLineGroupRow {
  organizationId: string | null;
  status: string;
  operationalAuthorized: number;
}

/**
 * The normal LINE operational trust boundary is the authorized group. This
 * check deliberately does not inspect operator identities or farm bindings.
 * Entity, environment, stock, lineage, idempotency, and audit validation stay
 * in their existing canonical boundaries after this check succeeds.
 */
export async function requireAuthorizedLineGroup(
  env: { DB: D1Database },
  input: {
    organizationId: string;
    groupId?: string | null;
    lineUserId?: string | null;
  },
): Promise<void> {
  const groupId = input.groupId?.trim();
  const lineUserId = input.lineUserId?.trim();
  if (!groupId || !lineUserId) throw new LineGroupAuthorizationError("CANONICAL_LINE_GROUP_AUTH_REQUIRED");

  let row: AuthorizedLineGroupRow | null;
  try {
    row = await env.DB.prepare(
      `SELECT organization_id AS organizationId,
              status,
              operational_authorized AS operationalAuthorized
         FROM line_groups
        WHERE group_id = ?
        LIMIT 1`,
    ).bind(groupId).first<AuthorizedLineGroupRow>();
  } catch {
    // A new Worker against an old schema must fail closed, never fall back to
    // the legacy operator/scope path or treat an unknown group as authorized.
    throw new LineGroupAuthorizationError("CANONICAL_LINE_GROUP_AUTH_UNAVAILABLE");
  }

  if (!row) throw new LineGroupAuthorizationError("CANONICAL_LINE_GROUP_NOT_FOUND");
  if (row.organizationId !== input.organizationId) {
    throw new LineGroupAuthorizationError("CANONICAL_LINE_GROUP_ORGANIZATION_MISMATCH");
  }
  if (row.status === "left" || Number(row.operationalAuthorized) !== 1) {
    throw new LineGroupAuthorizationError("CANONICAL_LINE_GROUP_NOT_AUTHORIZED");
  }
}

export function isLineGroupAuthorizationError(error: unknown): error is LineGroupAuthorizationError {
  return error instanceof LineGroupAuthorizationError;
}
