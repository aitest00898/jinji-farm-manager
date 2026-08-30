import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AMBIENT_DIGEST_CRON, dailyReviewCronExpression, scheduledJobForCron } from "./daily-review";
import { LINE_EVENT_RECOVERY_CRON } from "./reliability";

const TAIPEI = "Asia/Taipei";
const AMBIENT_HOURS = [6, 9, 12, 15, 18];

function taipeiParts(value: Date): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function taipeiDateAtUtc(localDate: string, hour: number): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 8, 0, 0, 0));
}

function sevenDates(startDate: string): string[] {
  const [year, month, day] = startDate.split("-").map(Number);
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(Date.UTC(year, month - 1, day + index, 0, 0, 0, 0));
    return value.toISOString().slice(0, 10);
  });
}

describe("Production scheduled trigger contract", () => {
  it("keeps the three intended triggers and no weather trigger", () => {
    const wrangler = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")) as { triggers: { crons: string[] } };
    expect(wrangler.triggers.crons).toEqual([AMBIENT_DIGEST_CRON, dailyReviewCronExpression(), LINE_EVENT_RECOVERY_CRON]);
    expect(wrangler.triggers.crons).toHaveLength(3);
    expect(scheduledJobForCron(AMBIENT_DIGEST_CRON)).toBe("ambient_digest");
    expect(scheduledJobForCron(dailyReviewCronExpression())).toBe("daily_review");
    expect(scheduledJobForCron(LINE_EVENT_RECOVERY_CRON)).toBe("recovery");
    expect(scheduledJobForCron("0 6 * * *")).toBe("unknown");
  });

  it("maps exactly five Ambient runs per Taipei day for a seven-day matrix", () => {
    const dates = sevenDates("2026-08-22");
    const instants = dates.flatMap((date) => AMBIENT_HOURS.map((hour) => taipeiDateAtUtc(date, hour)));
    expect(instants).toHaveLength(35);
    expect(new Set(instants.map((value) => value.toISOString())).size).toBe(35);
    for (let index = 0; index < dates.length; index += 1) {
      const localRuns = instants.slice(index * AMBIENT_HOURS.length, (index + 1) * AMBIENT_HOURS.length).map(taipeiParts);
      expect(localRuns.map((run) => `${run.date} ${run.hour}:${String(run.minute).padStart(2, "0")}`)).toEqual(
        AMBIENT_HOURS.map((hour) => `${dates[index]} ${hour}:00`),
      );
    }
  });

  it("maps Daily Review to 21:00 Taipei on each day without a fall-through", () => {
    const dates = sevenDates("2026-08-22");
    const runs = dates.map((date) => taipeiParts(taipeiDateAtUtc(date, 21)));
    expect(runs).toHaveLength(7);
    expect(runs.every((run, index) => run.date === dates[index] && run.hour === 21 && run.minute === 0)).toBe(true);
    expect(dailyReviewCronExpression()).toBe("0 13 * * *");
    expect(scheduledJobForCron("0 13 * * *")).toBe("daily_review");
  });

  it("keeps the local-time boundaries closed and recovery isolated", () => {
    const localDate = "2026-08-22";
    const ambientInstants = new Set(AMBIENT_HOURS.map((hour) => taipeiDateAtUtc(localDate, hour).toISOString()));
    const reviewInstant = taipeiDateAtUtc(localDate, 21).toISOString();
    const at = (hour: number, minute: number): string => {
      const [year, month, day] = localDate.split("-").map(Number);
      return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0)).toISOString();
    };
    expect(ambientInstants.has(at(5, 59))).toBe(false);
    expect(ambientInstants.has(at(6, 0))).toBe(true);
    expect(ambientInstants.has(at(6, 1))).toBe(false);
    expect(ambientInstants.has(at(18, 0))).toBe(true);
    expect(ambientInstants.has(at(18, 1))).toBe(false);
    expect(reviewInstant).toBe(at(21, 0));
    expect(reviewInstant).not.toBe(at(20, 59));
    expect(reviewInstant).not.toBe(at(21, 1));
    expect(scheduledJobForCron("0 2 * * *")).toBe("unknown");
    expect(scheduledJobForCron(LINE_EVENT_RECOVERY_CRON)).toBe("recovery");
  });
});
