import { describe, expect, it } from "vitest";
import {
  normalizeRecordingLanguage,
  parseCanonicalRecordingText,
  parseNaturalNumber,
} from "./recording-taxonomy";
import { looksLikeMinimalAbnormalText } from "./abnormal";
import { parseQuickItemsForTest, quickRecordLooksRelevant } from "./quick-record";

const receivedAt = "2026-09-18T02:00:00.000Z";
const scope = "金雞測試場 測試1舍 批次A ";

describe("Chapter 19 bounded Traditional-Chinese language coverage", () => {
  it("normalizes Chinese numbers and keeps the existing canonical seam", () => {
    expect(parseNaturalNumber("六百")).toBe(600);
    expect(parseNaturalNumber("兩千零三")).toBe(2003);
    expect(normalizeRecordingLanguage("死了兩隻、腳也很臭")).toBe("死亡兩隻、臭腳");
  });

  it("covers natural O1-O9 wording without changing taxonomy authority", () => {
    const cases = [
      [scope + "入雛 公雞六百 母雞四百 良好", "O1", "chick_in", { maleCount: 600, femaleCount: 400 }],
      [scope + "打疫苗", "O2", "vaccination", {}],
      [scope + "投藥 球蟲藥", "O2", "medication", { content: "球蟲藥" }],
      [scope + "出雞五隻", "O3", "shipment", { quantity: 5 }],
      [scope + "平均2.1公斤", "O4", "weigh", { averageWeight: 2.1 }],
      [scope + "幫我叫20包料", "O5", "feed_order", { weight: 20, weightUnit: "bag" }],
      [scope + "拿去送驗 新城雞瘟", "O6", "lab_test", { content: "新城雞瘟" }],
      [scope + "洗完消毒", "O7", "disinfection", { workflowStatus: "completed" }],
      [scope + "2號風扇維修", "O8", "maintenance", { maintenanceContent: "2號風扇" }],
      [scope + "抓掉三隻", "O9", "cull", { quantity: 3 }],
    ] as const;

    for (const [input, taxonomyId, subtype, fields] of cases) {
      const parsed = parseCanonicalRecordingText(input);
      expect(parsed.taxonomyId, input).toBe(taxonomyId);
      expect(parsed.subtype, input).toBe(subtype);
      expect(parsed.fields, input).toMatchObject(fields);
    }
  });

  it("covers natural abnormal observations through existing A taxonomy", () => {
    const cases = [
      ["一直咳", "A2", "cough"],
      ["呼吸很喘", "A3", "respiratory_distress"],
      ["沒精神", "A4", "activity_down"],
      ["眼睛腫 小範圍", "A5", "eye_swelling"],
      ["拉白便 小範圍", "A6", "white"],
      ["生長慢 中範圍", "A7", "growth_delay"],
      ["腳很臭 小範圍", "A8", "foot_odor"],
      ["雞很燙", "A9", "fever"],
      ["熱緊迫", "A10", "heat_stress"],
      ["不吃料", "A11", "feeding_abnormality"],
      ["風扇壞了", "A12", "fan"],
      ["下大雨", "A13", "heavy_rain"],
      ["活動變少 大範圍", "A4", "activity_down"],
      ["淹水 大範圍", "A14", "flooding"],
      ["雞舍有味道", "A15", "odor"],
      ["疫情擴大", "A16", "spread"],
      ["死亡增加", "A1", "mortality_abnormality"],
    ] as const;

    for (const [observation, taxonomyId, subtype] of cases) {
      const parsed = parseCanonicalRecordingText(scope + observation);
      expect(parsed.taxonomyId, observation).toBe(taxonomyId);
      expect(parsed.subtype, observation).toBe(subtype);
      if (/(?:小範圍|中範圍|大範圍)/u.test(observation)) {
        expect(parsed.fields, observation).toMatchObject({ extent: expect.any(String) });
      } else {
        expect(parsed.recordWorthiness, observation).toBe("candidate");
      }
    }
  });

  it("delegates a safe mixed mortality bundle to the existing quick-record path", () => {
    const input = "測試1舍死2隻，一直咳，腳也很臭";
    const canonical = parseCanonicalRecordingText(input);
    expect(canonical.recordWorthiness).toBe("ignore");
    expect(canonical.reason).toBe("bundle_delegated_to_quick_record");

    const quick = parseQuickItemsForTest(input, receivedAt);
    expect(quick.items.map((item) => [item.itemType, item.intent, item.quantity, item.rawText])).toEqual([
      ["operational", "mortality", 2, "死亡 2"],
      ["abnormal", null, null, "咳嗽"],
      ["abnormal", null, null, "臭腳"],
    ]);
  });

  it("keeps a context-only abnormal continuation in the existing quick path", () => {
    const quick = parseQuickItemsForTest("那咳嗽也記一下", receivedAt);
    expect(quick.items).toHaveLength(1);
    expect(quick.items[0]).toMatchObject({ itemType: "abnormal", rawText: "咳嗽" });
  });

  it("does not turn ordinary chat, negation, or uncertainty into a record", () => {
    const ordinary = [
      "剛剛影片真的笑到快死亡",
      "今天雞排很好吃",
      "我家的電風扇快壞了",
      "晚點去買飼料給寵物",
      "他今天咳得很嚴重",
      "這個價格漲到沒精神",
    ];
    for (const input of ordinary) {
      expect(parseCanonicalRecordingText(input).recordWorthiness, input).toBe("ignore");
      expect(parseQuickItemsForTest(input, receivedAt).items, input).toEqual([]);
      expect(quickRecordLooksRelevant(input), input).toBe(false);
      expect(looksLikeMinimalAbnormalText(input), input).toBe(false);
    }

    const unsafe = [
      "沒有死亡2隻",
      "沒有咳嗽",
      "不是死亡2隻",
      "好像有死亡2隻",
      "可能是咳嗽",
      "不確定是不是喘",
    ];
    for (const input of unsafe) {
      const parsed = parseCanonicalRecordingText(input);
      expect(parsed.recordWorthiness, input).not.toBe("record");
      expect(parsed.fields, input).not.toHaveProperty("quantity");
      expect(parseQuickItemsForTest(input, receivedAt).items, input).toEqual([]);
      expect(quickRecordLooksRelevant(input), input).toBe(false);
      expect(looksLikeMinimalAbnormalText(input), input).toBe(false);
    }
  });
});
