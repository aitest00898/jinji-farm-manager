export type AuditSource = "line" | "web" | "system" | "migration";

export interface AuditInput {
  organizationId: string;
  source: AuditSource;
  actorType: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  changedFields?: string[];
  reason?: string | null;
  requestId: string;
}

export interface AuditEnv {
  DB: D1Database;
}

export function auditLogStatement(env: AuditEnv, input: AuditInput): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO audit_logs
      (id, organization_id, source, actor_type, actor_id, action, entity_type,
       entity_id, before_json, after_json, changed_fields_json, reason, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `audit-${crypto.randomUUID()}`,
    input.organizationId,
    input.source,
    input.actorType,
    input.actorId ?? null,
    input.action,
    input.entityType,
    input.entityId,
    input.before === undefined ? null : JSON.stringify(input.before),
    input.after === undefined ? null : JSON.stringify(input.after),
    input.changedFields ? JSON.stringify(input.changedFields) : null,
    input.reason ?? null,
    input.requestId,
  );
}

export async function writeAuditLog(env: AuditEnv, input: AuditInput): Promise<void> {
  await auditLogStatement(env, input).run();
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

export function randomWebSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function hashWebSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

export const WEB_SESSION_TTL_MS = 30 * 60 * 1000;

export function webSessionIsActive(expiresAt: string, now = new Date().toISOString()): boolean {
  return expiresAt > now;
}
