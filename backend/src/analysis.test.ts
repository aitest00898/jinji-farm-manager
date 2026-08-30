import { describe, expect, it } from "vitest";
import {
  ANALYSIS_TOOL_NAMES,
  PRODUCTION_AI_MODEL,
  isReadOnlyAnalysisQuestion,
  parseStructuredAnalysis,
  validateAnalysisScope,
  validateAnalysisToolPlan,
} from "./analysis";

describe("read-only AI analysis boundary", () => {
  it("recognizes analysis questions but not deterministic queries", () => {
    expect(isReadOnlyAnalysisQuestion("這一批最近有哪些異常？")).toBe(true);
    expect(isReadOnlyAnalysisQuestion("今天死亡")).toBe(false);
    expect(isReadOnlyAnalysisQuestion("SELECT * FROM farms")).toBe(false);
  });

  it("accepts only whitelisted tools and rejects SQL-shaped arguments", () => {
    expect(ANALYSIS_TOOL_NAMES).toContain("get_abnormal_events");
    expect(validateAnalysisToolPlan({ tools: [{ name: "get_abnormal_events", args: { farmId: "farm-1" } }] })).toEqual([{ name: "get_abnormal_events", args: { farmId: "farm-1" } }]);
    expect(validateAnalysisToolPlan({ tools: [{ name: "run_sql", args: {} }] })).toBeNull();
    expect(validateAnalysisToolPlan({ tools: [{ name: "get_farm_summary", args: { q: "SELECT 1" } }] })).toBeNull();
  });

  it("validates context scope and structured report schema", () => {
    expect(validateAnalysisScope({ type: "farm", id: "farm-test" })).toEqual({ type: "farm", id: "farm-test" });
    expect(validateAnalysisScope({ type: "farm", id: "../../secret" })).toBeNull();
    expect(parseStructuredAnalysis({
      currentStatus: "有資料",
      findings: ["觀察到異常"],
      possibleCauses: [{ text: "高溫同期間出現", evidence: "medium" }],
      risks: [],
      recommendations: ["持續觀察"],
      limitations: ["尚無完整批次資料"],
    })).not.toBeNull();
  });

  it("normalizes cached and model-generated finance wording to TWD", () => {
    const report = parseStructuredAnalysis({
      currentStatus: "目前有 434838.6 美元的資金分配",
      findings: ["支出 USD 5500"],
      possibleCauses: [{ text: "$429338.6 的淨收入", evidence: "strong" }],
      risks: [],
      recommendations: [],
      limitations: [],
    });
    expect(report?.currentStatus).toBe("目前有 434838.6 元的資金分配");
    expect(report?.findings[0]).toBe("支出 元 5500");
    expect(report?.possibleCauses[0]?.text).toBe("NT$429338.6 的淨收入");
  });

  it("keeps the production model unchanged", () => {
    expect(PRODUCTION_AI_MODEL).toBe("@cf/meta/llama-3.2-3b-instruct");
  });
});
