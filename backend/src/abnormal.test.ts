import { describe, expect, it } from "vitest";
import {
  deterministicAbnormalClassification,
  formatAbnormalReply,
  looksLikeMinimalAbnormalText,
  parseAbnormalClassification,
  parseAbnormalTiming,
  weatherTemperatureLabel,
} from "./abnormal";

describe("minimal abnormal event contract", () => {
  it.each(["咳嗽", "臭腳", "水簾壞掉", "風扇2沒動", "停電", "屋頂被風吹壞"])("recognizes %s without requiring fields", (input) => {
    expect(looksLikeMinimalAbnormalText(input)).toBe(true);
  });

  it.each(["幫我決定抗生素劑量", "今天死亡", "大富翁盈虧", "晚餐吃什麼"])("does not turn %s into an abnormal row", (input) => {
    expect(looksLikeMinimalAbnormalText(input)).toBe(false);
  });

  it("uses received Taipei time for a simple message", () => {
    const timing = parseAbnormalTiming("咳嗽", "2026-08-20T06:35:00.000Z");
    expect(timing.occurredDate).toBe("2026-08-20");
    expect(timing.occurredAt).toBe("2026-08-20T06:35:00.000Z");
    expect(timing.approximatePeriod).toBeNull();
    expect(formatAbnormalReply("咳嗽", timing)).toContain("咳嗽｜14:35");
  });

  it("keeps yesterday afternoon approximate without inventing a minute", () => {
    const timing = parseAbnormalTiming("昨天下午停電", "2026-08-20T01:00:00.000Z");
    expect(timing.occurredDate).toBe("2026-08-19");
    expect(timing.occurredAt).toBeNull();
    expect(timing.approximatePeriod).toBe("afternoon");
  });

  it("classifies known observations deterministically after raw insert", () => {
    expect(deterministicAbnormalClassification("風扇壞掉")).toEqual({ category: "equipment", tags: ["fan"], confidence: 0.98 });
    expect(deterministicAbnormalClassification("咳嗽")).toEqual({ category: "health", tags: ["respiratory"], confidence: 0.98 });
  });

  it("validates AI classification metadata independently", () => {
    expect(parseAbnormalClassification({ category: "health", tags: ["respiratory"], confidence: 0.8 })).toEqual({ category: "health", tags: ["respiratory"], confidence: 0.8 });
    expect(parseAbnormalClassification({ category: "health", tags: ["DROP TABLE"], confidence: 0.8 })).toBeNull();
  });

  it("formats weather as temperature with its time", () => {
    expect(weatherTemperatureLabel(35.8, "14:00")).toBe("35.8°C（14:00）");
    expect(weatherTemperatureLabel(null, null)).toBe("待補");
  });
});
