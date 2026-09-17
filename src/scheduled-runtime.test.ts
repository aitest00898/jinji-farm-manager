import { describe, expect, it, vi } from "vitest";
import { executeScheduledJob, type ScheduledRuntimeEnv } from "./scheduled-runtime";

function fakeEnv(): ScheduledRuntimeEnv {
  return {
    DB: {
      prepare: () => ({
        bind: () => ({
          run: async () => ({ meta: { changes: 0 } }),
          all: async () => ({ results: [] }),
        }),
        run: async () => ({ meta: { changes: 0 } }),
        all: async () => ({ results: [] }),
      }) as never,
    },
    EVENTS: { send: async () => undefined },
    BACKUP_KV: { put: async () => undefined } as never,
  } as unknown as ScheduledRuntimeEnv;
}

describe("scheduled runtime seam", () => {
  it("routes the backup cron without invoking product review handlers", async () => {
    const backup = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const ambient = vi.fn(async () => undefined);
    const daily = vi.fn(async () => undefined);
    await executeScheduledJob("0 16 * * *", new Date("2026-09-17T08:00:00.000Z"), fakeEnv(), {
      runAmbientDigest: ambient,
      runDailyReview: daily,
    });
    expect(ambient).not.toHaveBeenCalled();
    expect(daily).not.toHaveBeenCalled();
    expect(backup).toHaveBeenCalledWith(expect.stringContaining('"event":"production_d1_backup_complete"'));
    backup.mockRestore();
  });

  it("routes normal product schedules through injected handlers", async () => {
    const env = fakeEnv();
    const ambient = vi.fn(async () => undefined);
    const daily = vi.fn(async () => undefined);
    await executeScheduledJob("0 13 * * *", new Date("2026-09-17T08:00:00.000Z"), env, {
      runAmbientDigest: ambient,
      runDailyReview: daily,
    });
    expect(daily).toHaveBeenCalledOnce();
    expect(ambient).not.toHaveBeenCalled();
  });
});
