import { scheduledJobForCron } from "./daily-review";
import { runProductionD1Backup, type ProductionD1BackupEnv } from "./production-d1-backup";
import {
  recoverStalledLineEvents,
  redactExpiredLineEventPayloads,
  type ReliabilityQueueEnv,
} from "./reliability";

export type ScheduledRuntimeEnv = ReliabilityQueueEnv & ProductionD1BackupEnv;

export interface ScheduledRuntimeHandlers<EnvType extends ScheduledRuntimeEnv = ScheduledRuntimeEnv> {
  runAmbientDigest: (env: EnvType, now: Date) => Promise<void>;
  runDailyReview: (env: EnvType, now: Date) => Promise<void>;
}

export async function executeScheduledJob<EnvType extends ScheduledRuntimeEnv>(
  cron: string,
  scheduledAt: Date,
  env: EnvType,
  handlers: ScheduledRuntimeHandlers<EnvType>,
): Promise<void> {
  try {
    await redactExpiredLineEventPayloads(env, scheduledAt);
    await env.DB.prepare(
      `DELETE FROM line_events
        WHERE received_at < datetime('now', '-90 days')
          AND lifecycle_status = 'reply_completed'`,
    ).run();
    await env.DB.prepare(
      `DELETE FROM line_events
        WHERE lifecycle_status = 'retained'
        AND retained_until IS NOT NULL
          AND julianday(retained_until) <= julianday(?)`,
    ).bind(new Date(scheduledAt.getTime()).toISOString()).run();
    await env.DB.prepare(
      `DELETE FROM line_event_recovery_audit
        WHERE created_at < datetime('now', '-7 days')`,
    ).run();
    await env.DB.prepare(
      `DELETE FROM line_event_delivery_attempts
        WHERE julianday(expires_at) <= julianday(?)`,
    ).bind(new Date(scheduledAt.getTime()).toISOString()).run();
  } catch (error) {
    console.log(JSON.stringify({
      event: "scheduled_cleanup_error",
      error_class: error instanceof Error && error.name ? error.name : "unknown",
    }));
  }

  const job = scheduledJobForCron(cron);
  if (job === "production_d1_backup") {
    try {
      const result = await runProductionD1Backup(env, scheduledAt);
      console.log(JSON.stringify({
        event: "production_d1_backup_complete",
        trigger: "cron",
        cron,
        object_key: result.objectKey,
        latest_key: result.latestKey,
        sha256: result.sha256,
        byte_length: result.byteLength,
        table_count: result.tableCount,
        row_count: result.rowCount,
      }));
    } catch (error) {
      console.error(JSON.stringify({
        event: "production_d1_backup_failure",
        trigger: "cron",
        cron,
        error_class: error instanceof Error && error.name ? error.name : "backup_error",
      }));
    }
    return;
  }
  if (job === "recovery") {
    try {
      const result = await recoverStalledLineEvents(env, scheduledAt, 20);
      console.log(JSON.stringify({
        event: "line_event_recovery_complete",
        cron,
        scanned: result.scanned,
        requeued: result.requeued,
        skipped: result.skipped,
        failed: result.failed,
      }));
    } catch (error) {
      console.error(JSON.stringify({
        event: "line_event_recovery_failure",
        cron,
        error_class: error instanceof Error && error.name ? error.name : "recovery_error",
      }));
    }
    return;
  }
  if (job === "daily_review") {
    await handlers.runDailyReview(env, scheduledAt);
    return;
  }
  if (job === "ambient_digest") {
    await handlers.runAmbientDigest(env, scheduledAt);
    return;
  }
  console.log(JSON.stringify({ event: "scheduled_unknown_cron", cron }));
}
