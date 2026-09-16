export type WebAccessClass = "PUBLIC" | "SHARED_EDIT" | "ADMIN";

const PUBLIC_GET_PATHS = new Set([
  "/api/organizations",
  "/api/dashboard",
  "/api/farms",
  "/api/houses",
  "/api/flocks",
  "/api/lifecycle",
  "/api/records",
  "/api/operational-events",
  "/api/abnormal-events",
  "/api/timeline",
  "/api/weather",
  "/api/ai/live-status",
]);

const SHARED_GET_PATHS = new Set([
  "/api/finance",
  "/api/ai/brief",
  "/api/ai/reports",
]);

const ADMIN_GET_PATHS = new Set([
  "/api/data-health",
  "/api/system-status",
  "/api/reliability/events",
  "/api/ambient/preview",
  "/api/pending-candidates",
  "/api/operators",
  "/api/line-groups",
  "/api/line-groups/claim-candidates",
  "/api/test-tools",
  "/api/technical-info",
  "/api/caretakers",
  "/api/audit",
  "/api/farm-aliases",
  "/api/investors",
  "/api/web/auth/sessions",
]);

const SHARED_EXACT_MUTATIONS = new Set([
  "POST /api/records",
  "POST /api/operational-events",
  "POST /api/abnormal-events",
  "POST /api/flocks",
]);

const ADMIN_EXACT_MUTATIONS = new Set([
  "POST /api/farms",
  "POST /api/caretakers",
  "POST /api/houses",
  "POST /api/operators",
  "POST /api/investors",
  "POST /api/finance/mutations",
  "POST /api/web/auth/password-rotation",
  "POST /api/web/auth/session-rotation",
]);

function methodPath(method: string, pathname: string): string {
  return `${method.toUpperCase()} ${pathname}`;
}

function isRecordRelation(pathname: string): boolean {
  return /^\/api\/records\/[^/]+\/(correct|reverse)$/u.test(pathname);
}

function isOperationalRelation(pathname: string): boolean {
  return /^\/api\/operational-events\/[^/]+\/(correct|reverse)$/u.test(pathname);
}

function isAbnormalRelation(pathname: string): boolean {
  return /^\/api\/abnormal-events\/[^/]+\/(correct|reverse)$/u.test(pathname);
}

function isPublicEntityRead(pathname: string): boolean {
  // Only farm-by-id has a reachable GET handler in the current Web API.
  // House/flock detail paths stay unclassified until they have a real
  // handler and a reviewed public projection.
  return /^\/api\/farms\/[^/]+$/u.test(pathname);
}

function isFarmCaretakerMutation(pathname: string): boolean {
  return /^\/api\/farms\/[^/]+\/caretakers$/u.test(pathname);
}

function isOperatorScopeMutation(pathname: string): boolean {
  return /^\/api\/operators\/[^/]+\/scopes$/u.test(pathname);
}

function isLineGroupAdminMutation(pathname: string): boolean {
  return /^\/api\/line-groups\/[^/]+\/(organization-claim|operational-authorization|operator-bindings|ai-conversation)$/u.test(pathname);
}

function isAdminEntityMutation(pathname: string): boolean {
  return /^\/api\/(farms|caretakers|houses|flocks)\/[^/]+$/u.test(pathname);
}

function isAdminEntityDelete(pathname: string): boolean {
  return /^\/api\/(farms|houses|investors|finance\/(?:farm-investor-equity|profit-distributions|profit-distribution-allocations))\/[^/]+$/u.test(pathname);
}

function isAdminEntityRestore(pathname: string): boolean {
  return /^\/api\/(farms|houses)\/[^/]+\/restore$/u.test(pathname);
}

function isAdminSessionMutation(pathname: string): boolean {
  return /^\/api\/web\/auth\/sessions\/[^/]+\/revoke$/u.test(pathname);
}

function isReliabilityAdminMutation(pathname: string): boolean {
  return pathname === "/api/reliability/recover"
    || pathname === "/api/reliability/acknowledge"
    || /^\/api\/reliability\/events\/[^/]+\/(recover|resolve|record)$/u.test(pathname);
}

function isRecoveryAdminMutation(pathname: string): boolean {
  return pathname === "/api/recovery/dry-run"
    || pathname === "/api/recovery/apply"
    || pathname === "/api/recovery/batch-dry-run"
    || pathname === "/api/recovery/batch-apply"
    || pathname === "/api/recovery/pit-discover"
    || pathname === "/api/recovery/pit-dry-run"
    || pathname === "/api/recovery/pit-apply"
    || pathname === "/api/recovery/finance-discover"
    || pathname === "/api/recovery/finance-dry-run"
    || pathname === "/api/recovery/finance-apply";
}

function isSharedDomainRecoveryMutation(pathname: string): boolean {
  return pathname === "/api/recovery/domain-discover"
    || pathname === "/api/recovery/domain-dry-run"
    || pathname === "/api/recovery/domain-apply";
}

function isAdminDomainRecoveryMutation(pathname: string): boolean {
  return pathname === "/api/recovery/domain-batch-dry-run"
    || pathname === "/api/recovery/domain-batch-apply"
    || pathname === "/api/recovery/domain-pit-discover"
    || pathname === "/api/recovery/domain-pit-dry-run"
    || pathname === "/api/recovery/domain-pit-apply";
}

function isAdminAiMutation(pathname: string): boolean {
  return pathname === "/api/ai/brief" || pathname === "/api/ai/analyze";
}

function isFinanceChart(pathname: string): boolean {
  const match = /^\/api\/charts\/([^/]+)$/u.exec(pathname);
  return Boolean(match && new Set(["finance", "farm-profit", "portfolio-net"]).has(match[1]));
}

function isAnyChart(pathname: string): boolean {
  return /^\/api\/charts\/[^/]+$/u.test(pathname);
}

/**
 * The single Web route inventory used by the API boundary.  PUBLIC means a
 * production, read-only route; SHARED_EDIT and ADMIN are minimum required
 * access classes.  An unknown path/method is deliberately unclassified.
 */
export function classifyWebRoute(pathname: string, method: string): WebAccessClass | null {
  const normalizedMethod = method.toUpperCase();
  const exact = methodPath(normalizedMethod, pathname);

  if (normalizedMethod === "GET" && PUBLIC_GET_PATHS.has(pathname)) return "PUBLIC";
  if (normalizedMethod === "GET" && isPublicEntityRead(pathname)) return "PUBLIC";
  if (normalizedMethod === "GET" && isAnyChart(pathname)) return isFinanceChart(pathname) ? "SHARED_EDIT" : "PUBLIC";
  if (normalizedMethod === "GET" && SHARED_GET_PATHS.has(pathname)) return "SHARED_EDIT";
  if (normalizedMethod === "GET" && ADMIN_GET_PATHS.has(pathname)) return "ADMIN";

  if (normalizedMethod === "POST" && (isRecordRelation(pathname) || isOperationalRelation(pathname) || isAbnormalRelation(pathname))) return "SHARED_EDIT";
  if (SHARED_EXACT_MUTATIONS.has(exact)) return "SHARED_EDIT";

  if (ADMIN_EXACT_MUTATIONS.has(exact)) return "ADMIN";
  if (normalizedMethod === "POST" && isSharedDomainRecoveryMutation(pathname)) return "SHARED_EDIT";
  if (normalizedMethod === "POST" && (isFarmCaretakerMutation(pathname) || isOperatorScopeMutation(pathname) || isLineGroupAdminMutation(pathname) || isReliabilityAdminMutation(pathname) || isRecoveryAdminMutation(pathname) || isAdminDomainRecoveryMutation(pathname) || isAdminAiMutation(pathname))) return "ADMIN";
  if (normalizedMethod === "POST" && pathname === "/api/web/auth/client-close") return "SHARED_EDIT";
  if (normalizedMethod === "POST" && (isAdminEntityRestore(pathname) || isAdminSessionMutation(pathname))) return "ADMIN";
  if (normalizedMethod === "PATCH" && (isLineGroupAdminMutation(pathname) || isAdminEntityMutation(pathname))) return "ADMIN";
  if (normalizedMethod === "DELETE" && isAdminEntityDelete(pathname)) return "ADMIN";
  if (normalizedMethod === "POST" && isAdminEntityMutation(pathname)) return "ADMIN";
  if (normalizedMethod === "GET" && pathname === "/api/finance") return "SHARED_EDIT";
  if (normalizedMethod === "POST" && pathname === "/api/finance") return "ADMIN";

  return null;
}

export function webAccessClassAllows(actual: WebAccessClass, required: WebAccessClass): boolean {
  const rank: Record<WebAccessClass, number> = { PUBLIC: 0, SHARED_EDIT: 1, ADMIN: 2 };
  return rank[actual] >= rank[required];
}
