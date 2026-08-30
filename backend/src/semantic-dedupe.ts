/**
 * Short-lived semantic action locks for message-action menu commands.
 *
 * LINE webhookEventId prevents redelivery of one webhook event. It cannot
 * prevent a user from tapping the same menu item several times, because LINE
 * creates a new valid message event for every tap. This table provides the
 * cross-request / cross-isolate guard for that semantic action.
 */

export const SEMANTIC_ACTION_TTL_MS = 10_000;

export interface SemanticDedupeEnv {
  DB: D1Database;
}

export interface SemanticActionLock {
  groupId: string;
  userId: string;
  action: string;
  eventId: string;
  expiresAt: string;
}

export interface SemanticActionAcquireResult {
  acquired: boolean;
  lock: SemanticActionLock;
  status: "running" | "completed" | null;
}

export function semanticActionKey(groupId: string, userId: string, action: string): string {
  return `${groupId}:${userId}:${action}`;
}

export function semanticActionExpiry(now = Date.now()): string {
  return new Date(now + SEMANTIC_ACTION_TTL_MS).toISOString();
}

interface LockRow {
  ownerEventId: string;
  status: "running" | "completed";
  expiresAt: string;
}

export async function acquireSemanticAction(
  env: SemanticDedupeEnv,
  groupId: string,
  userId: string,
  action: string,
  eventId: string,
  now = new Date(),
): Promise<SemanticActionAcquireResult> {
  const acquiredAt = now.toISOString();
  const expiresAt = semanticActionExpiry(now.getTime());
  const lockId = `semantic-lock-${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT INTO line_semantic_action_locks
       (id, line_group_id, line_user_id, semantic_action_key, status,
        owner_event_id, acquired_at, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'running', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (line_group_id, line_user_id, semantic_action_key)
     DO UPDATE SET
       status = 'running',
       owner_event_id = excluded.owner_event_id,
       acquired_at = excluded.acquired_at,
       expires_at = excluded.expires_at,
       updated_at = CURRENT_TIMESTAMP
     WHERE line_semantic_action_locks.expires_at <= excluded.acquired_at`,
  ).bind(lockId, groupId, userId, action, eventId, acquiredAt, expiresAt).run();

  const row = await env.DB.prepare(
    `SELECT owner_event_id AS ownerEventId, status, expires_at AS expiresAt
       FROM line_semantic_action_locks
      WHERE line_group_id = ? AND line_user_id = ? AND semantic_action_key = ?
      LIMIT 1`,
  ).bind(groupId, userId, action).first<LockRow>();
  const lock: SemanticActionLock = { groupId, userId, action, eventId, expiresAt };
  return {
    acquired: row?.ownerEventId === eventId,
    lock: { ...lock, expiresAt: row?.expiresAt ?? expiresAt },
    status: row?.status ?? null,
  };
}

export async function completeSemanticAction(env: SemanticDedupeEnv, lock: SemanticActionLock): Promise<void> {
  await env.DB.prepare(
    `UPDATE line_semantic_action_locks
        SET status = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE line_group_id = ? AND line_user_id = ? AND semantic_action_key = ?
        AND owner_event_id = ?`,
  ).bind(lock.groupId, lock.userId, lock.action, lock.eventId).run();
}

export async function abortSemanticAction(env: SemanticDedupeEnv, lock: SemanticActionLock, now = new Date()): Promise<void> {
  await env.DB.prepare(
    `UPDATE line_semantic_action_locks
        SET status = 'completed', expires_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE line_group_id = ? AND line_user_id = ? AND semantic_action_key = ?
        AND owner_event_id = ?`,
  ).bind(now.toISOString(), lock.groupId, lock.userId, lock.action, lock.eventId).run();
}
