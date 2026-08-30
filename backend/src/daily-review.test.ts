import { describe, expect, it } from "vitest";
import { dailyReviewWindow, isDailyReviewCron, scheduledJobForCron } from "./daily-review";

describe("daily operations review schedule", () => {
  it("maps 21:00 Asia/Taipei to 13:00 UTC", () => {
    const window = dailyReviewWindow(new Date("2026-08-21T13:00:00.000Z"));
    expect(window.localDate).toBe("2026-08-21");
    expect(window.startAt).toBe("2026-08-20T16:00:00.000Z");
    expect(window.cutoffAt).toBe("2026-08-21T13:00:00.000Z");
  });

  it("keeps local dates across midnight and does not confuse 20:29 with another day", () => {
    expect(dailyReviewWindow(new Date("2026-08-21T12:29:00.000Z")).localDate).toBe("2026-08-21");
    expect(dailyReviewWindow(new Date("2026-08-21T15:59:00.000Z")).localDate).toBe("2026-08-21");
    expect(dailyReviewWindow(new Date("2026-08-21T16:00:00.000Z")).localDate).toBe("2026-08-22");
  });

  it("routes the five daily Ambient runs and the 21:00 review separately", () => {
    expect(isDailyReviewCron("0 13 * * *")).toBe(true);
    expect(scheduledJobForCron("0 13 * * *")).toBe("daily_review");
    expect(scheduledJobForCron("0 1,4,7,10,22 * * *")).toBe("ambient_digest");
    expect(scheduledJobForCron("0 13 * * *")).not.toBe("ambient_digest");
    expect(scheduledJobForCron("0 * * * *")).toBe("unknown");
  });
});
