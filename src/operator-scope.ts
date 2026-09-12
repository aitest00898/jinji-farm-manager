export type ProvisionedOperatorIdentityType = "line_user" | "web_admin";
export type ProvisionedOperatorActorType = ProvisionedOperatorIdentityType | "system";

export interface OperatorScopeTarget {
  environment: "production" | "test";
  farmId: string;
  houseId?: string | null;
  flockId?: string | null;
}

export interface OperatorScopeBinding extends OperatorScopeTarget {
  active: boolean;
}

export class OperatorScopeError extends Error {
  readonly code:
    | "CANONICAL_OPERATOR_IDENTITY_NOT_PROVISIONED"
    | "CANONICAL_OPERATOR_SCOPE_NOT_ALLOWED"
    | "CANONICAL_LINE_GROUP_SCOPE_NOT_BOUND";

  constructor(code: OperatorScopeError["code"]) {
    super(code);
    this.name = "OperatorScopeError";
    this.code = code;
  }
}

/**
 * The existing Web auth has one organization-scoped admin credential, so its
 * stable provisionable identity is the organization Web admin. LINE keeps the
 * stable platform user id as its identity key. No new authentication path is
 * introduced here.
 */
export function operatorIdentityKeyFor(input: {
  organizationId: string;
  actorType: ProvisionedOperatorActorType;
  actorId?: string | null;
}): { identityType: ProvisionedOperatorIdentityType; identityKey: string } | null {
  if (input.actorType === "system") return null;
  if (input.actorType === "web_admin") {
    return { identityType: "web_admin", identityKey: `web-admin:${input.organizationId}` };
  }
  const identityKey = input.actorId?.trim();
  return identityKey ? { identityType: "line_user", identityKey } : null;
}

/** A narrower binding can grant access to one house or one flock. */
export function scopeBindingCovers(binding: OperatorScopeBinding, target: OperatorScopeTarget): boolean {
  if (!binding.active || binding.environment !== target.environment || binding.farmId !== target.farmId) return false;
  if (binding.houseId && binding.houseId !== (target.houseId ?? null)) return false;
  if (binding.flockId && binding.flockId !== (target.flockId ?? null)) return false;
  return true;
}

export async function requireProvisionedOperatorScope(
  env: { DB: D1Database },
  input: {
    organizationId: string;
    actorType: ProvisionedOperatorActorType;
    actorId?: string | null;
    lineGroupId?: string | null;
    target: OperatorScopeTarget;
  },
): Promise<void> {
  const identity = operatorIdentityKeyFor(input);
  if (!identity) return;

  const operator = await env.DB.prepare(
    `SELECT id
       FROM operator_identities
      WHERE organization_id = ? AND identity_type = ? AND identity_key = ? AND active = 1
      LIMIT 1`,
  ).bind(input.organizationId, identity.identityType, identity.identityKey).first<{ id: string }>();
  if (!operator) throw new OperatorScopeError("CANONICAL_OPERATOR_IDENTITY_NOT_PROVISIONED");

  const target = input.target;
  if (input.actorType === "line_user") {
    const groupId = input.lineGroupId?.trim();
    if (!groupId) throw new OperatorScopeError("CANONICAL_LINE_GROUP_SCOPE_NOT_BOUND");
    const group = await env.DB.prepare(
      `SELECT organization_id AS organizationId, farm_id AS farmId, status
         FROM line_groups
        WHERE group_id = ?
        LIMIT 1`,
    ).bind(groupId).first<{ organizationId: string | null; farmId: string | null; status: string }>();
    if (!group || group.organizationId !== input.organizationId || group.status !== "bound"
        || !group.farmId || group.farmId !== target.farmId) {
      throw new OperatorScopeError("CANONICAL_LINE_GROUP_SCOPE_NOT_BOUND");
    }
  }
  const groupJoin = input.actorType === "line_user"
    ? `
       JOIN line_group_operator_bindings gb
         ON gb.scope_binding_id = s.id
        AND gb.operator_id = s.operator_id
        AND gb.organization_id = s.organization_id
        AND gb.line_group_id = ?
        AND gb.active = 1`
    : "";
  const scopeBindings: unknown[] = input.actorType === "line_user"
    ? [input.lineGroupId, operator.id, input.organizationId, target.environment, target.farmId, target.houseId ?? null, target.flockId ?? null]
    : [operator.id, input.organizationId, target.environment, target.farmId, target.houseId ?? null, target.flockId ?? null];
  const rows = await env.DB.prepare(
    `SELECT s.environment, s.farm_id AS farmId, s.house_id AS houseId, s.flock_id AS flockId, s.active
       FROM operator_scope_bindings s${groupJoin}
      WHERE s.operator_id = ? AND s.organization_id = ? AND s.environment = ? AND s.farm_id = ? AND s.active = 1
        AND (s.house_id IS NULL OR s.house_id = ?)
        AND (s.flock_id IS NULL OR s.flock_id = ?)
      LIMIT 20`,
  ).bind(...scopeBindings).all<{
    environment: "production" | "test";
    farmId: string;
    houseId: string | null;
    flockId: string | null;
    active: number;
  }>();

  const allowed = rows.results.some((row) => scopeBindingCovers({
    environment: row.environment,
    farmId: String(row.farmId),
    houseId: row.houseId ?? null,
    flockId: row.flockId ?? null,
    active: Number(row.active) === 1,
  }, target));
  if (!allowed) {
    throw new OperatorScopeError(input.actorType === "line_user"
      ? "CANONICAL_LINE_GROUP_SCOPE_NOT_BOUND"
      : "CANONICAL_OPERATOR_SCOPE_NOT_ALLOWED");
  }
}
