import { describe, expect, it } from "vitest";
import {
  ambientDigestInvocationIdForTest,
  ambientFailureRetentionUntil,
  ambientMessageMayBeRelevant,
  ambientNormalExpiryAt,
  ambientPrefilter,
  formatAmbientCandidate,
} from "./ambient";

const nextSix = new Date("2026-08-24T22:00:00.000Z"); // 2026-08-25 06:00 Asia/Taipei

function buffered(text: string, index: number) {
  return {
    id: ["ambient-night-", index].join(""),
    organizationId: "org-test",
    lineGroupId: "group-test",
    lineUserId: "user-test",
    lineMessageId: ["night-", index].join(""),
    eventTimestamp: "2026-08-24T20:00:00.000Z",
    text,
    digestHour: "2026-08-25T04:00:00+08:00",
  };
}

describe("Ambient bounded failure retention", () => {
  it("keeps one stable invocation identity for a scheduled timestamp", () => {
    const scheduledFor = "2026-08-24T22:00:00.000Z";
    expect(ambientDigestInvocationIdForTest("cron", scheduledFor))
      .toBe(ambientDigestInvocationIdForTest("cron", scheduledFor));
    expect(ambientDigestInvocationIdForTest("cron", scheduledFor))
      .not.toBe(ambientDigestInvocationIdForTest("manual", scheduledFor));
  });

  it("does not extend prefilter-excluded ordinary chat", () => {
    expect(ambientMessageMayBeRelevant("我買 5 杯飲料")).toBe(false);
    expect(ambientMessageMayBeRelevant("下午 3 點集合")).toBe(false);
    expect(ambientMessageMayBeRelevant("手機剩 20%")).toBe(false);
    expect(ambientPrefilter([
      buffered("我買 5 杯飲料", 1),
      buffered("壓測晨光場死 2 隻", 2),
    ]).map((row) => row.lineMessageId)).toEqual(["night-2"]);
  });

  it("uses an absolute 72-hour cap, never now plus 72 hours", () => {
    const event = "2026-08-24T20:00:00.000Z";
    expect(ambientFailureRetentionUntil(event, nextSix)).toBe("2026-08-27T20:00:00.000Z");
    expect(ambientFailureRetentionUntil(event, new Date("2026-08-27T20:00:00.001Z"))).toBeNull();
  });

  it("keeps normal raw expiry separate from failure retention", () => {
    const event = "2026-08-24T20:00:00.000Z";
    expect(ambientNormalExpiryAt(event)).toBe("2026-08-25T20:00:00.000Z");
    expect(ambientFailureRetentionUntil(event, nextSix)).toBe("2026-08-27T20:00:00.000Z");
  });

  const nightCases: Array<[string, string, string]> = [
    ["NIGHT-01", "2026-08-24T13:00:00.000Z", "2026-08-24T22:00:00.000Z"], // 21:00 -> 06:00
    ["NIGHT-02", "2026-08-24T15:59:00.000Z", "2026-08-24T22:00:00.000Z"], // 23:59 -> 06:00
    ["NIGHT-03", "2026-08-24T16:00:00.000Z", "2026-08-24T22:00:00.000Z"], // 00:00 -> 06:00
    ["NIGHT-04", "2026-08-24T21:00:00.000Z", "2026-08-24T22:00:00.000Z"], // 05:00 -> 06:00
    ["NIGHT-05", "2026-08-24T21:59:00.000Z", "2026-08-24T22:00:00.000Z"], // 05:59 -> 06:00
    ["NIGHT-06", "2026-08-24T10:01:00.000Z", "2026-08-25T04:00:00.000Z"], // 18:01 -> next 12:00
  ];
  it.each(nightCases)("%s does not expire a fresh overnight source", (_name, event, runAt) => {
    expect(Date.parse(ambientNormalExpiryAt(event))).toBeGreaterThan(Date.parse(runAt));
  });

  it("NIGHT-07 protects candidate-like source after normal expiry", () => {
    const event = "2026-08-23T23:50:00.000Z";
    const runAt = new Date("2026-08-25T00:00:00.000Z");
    expect(Date.parse(ambientNormalExpiryAt(event))).toBeLessThanOrEqual(runAt.getTime());
    expect(Date.parse(ambientFailureRetentionUntil(event, runAt)!)).toBeGreaterThan(runAt.getTime());
  });

  it("NIGHT-08 keeps candidate-like failure protection bounded near 72 hours", () => {
    const event = "2026-08-22T00:10:00.000Z";
    const runAt = new Date("2026-08-24T23:59:00.000Z");
    expect(ambientFailureRetentionUntil(event, runAt)).toBe("2026-08-25T00:10:00.000Z");
  });

  it("NIGHT-09 expires raw source after the absolute cap", () => {
    expect(ambientFailureRetentionUntil("2026-08-22T00:10:00.000Z", new Date("2026-08-25T00:10:00.001Z"))).toBeNull();
  });
});

describe("Daily Review failure-warning presentation", () => {
  it("shows a bounded user-facing warning without technical terms", async () => {
    const { formatDailyReview } = await import("./daily-review");
    const text = formatDailyReview({
      reviewType: "operations",
      localDate: "2026-08-25",
      cutoffAt: "2026-08-25T13:00:00.000Z",
      weather: null,
      totals: { mortality: 0, cull: 0, shipment: 0, feed: 0, water: 0, abnormal: 0 },
      farms: [],
      pendingCandidates: [],
      ambientFailureWarning: "另外有部分群組訊息尚未完成整理，系統會繼續處理；這些內容目前還不是正式紀錄。",
    });
    expect(text).toContain("部分群組訊息尚未完成整理");
    expect(text).not.toContain("Ambient");
    expect(text).not.toContain("schema");
    expect(text).not.toContain("D1");
  });
});

describe("Migration safety contract", () => {
  it("does not turn failure retention into a Candidate or official record", () => {
    const rendered = formatAmbientCandidate({
      candidates: [{
        farmText: "測試場",
        conflict: false,
        items: [{ type: "mortality", quantity: 2, raw: "死亡2", confidence: "medium" }],
      }],
    });
    expect(rendered).toContain("死亡");
    expect(rendered).not.toContain("已確認");
  });
});
