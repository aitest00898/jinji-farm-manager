import { describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_TOOL_NAMES,
  PRODUCTION_AI_MODEL,
  classifyAnalysisFailure,
  isReadOnlyAnalysisQuestion,
  parseStructuredAnalysis,
  runReadOnlyAnalysis,
  type AnalysisEnv,
  validateAnalysisScope,
  validateAnalysisToolPlan,
} from "./analysis";

const analysisScope = { type: "organization", id: "organization" } as const;
const validAnalysisResponse = {
  response: JSON.stringify({
    currentStatus: "目前資料正常。",
    findings: [],
    possibleCauses: [],
    risks: [],
    recommendations: [],
    limitations: [],
  }),
};

function fakeAnalysisDb(options: { cacheError?: Error; insertError?: Error } = {}) {
  let writes = 0;
  const db = {
    get writes() { return writes; },
    prepare(sql: string) {
      return {
        bind(..._bindings: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM organizations")) return { id: "org-test", name: "測試組織" } as T;
              if (sql.includes("FROM profit_distributions")) return { allocated: 0, expense: 0, net: 0 } as T;
              if (sql.includes("FROM ai_reports")) {
                if (options.cacheError) throw options.cacheError;
                return null as T;
              }
              if (sql.includes("COALESCE(SUM")) return { todayMortality: 0, todayCull: 0, todayFeed: 0, todayWater: 0 } as T;
              return null as T;
            },
            async all<T>() {
              return { results: [] as T[] };
            },
            async run() {
              if (options.insertError) throw options.insertError;
              writes += 1;
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return db;
}

function fakeAnalysisEnv(options: { ai?: NonNullable<AnalysisEnv["AI"]>; cacheError?: Error; insertError?: Error } = {}) {
  const db = fakeAnalysisDb(options);
  const env: AnalysisEnv = { DB: db as unknown as AnalysisEnv["DB"], AI: options.ai };
  return { env, db };
}

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

  it("classifies the bounded analysis failure stages without exposing runtime details", () => {
    expect(classifyAnalysisFailure(new Error("analysis_ai_unavailable"))).toEqual({ layer: "provider", code: "ai_provider_unavailable" });
    expect(classifyAnalysisFailure(new Error("analysis_schema_invalid"))).toEqual({ layer: "response_validation", code: "ai_response_invalid" });
    expect(classifyAnalysisFailure(new Error("analysis_report_persistence_failed"))).toEqual({ layer: "persistence", code: "ai_report_persistence_failed" });
    expect(classifyAnalysisFailure(new Error("provider-internal-secret"))).toEqual({ layer: "unknown", code: "ai_analysis_unavailable" });
  });

  it("isolates fake D1 context, AI response, and report persistence stages", async () => {
    const aiRun = vi.fn(async () => validAnalysisResponse);
    const success = fakeAnalysisEnv({ ai: { run: aiRun } as unknown as NonNullable<AnalysisEnv["AI"]> });
    const result = await runReadOnlyAnalysis(success.env, "org-test", analysisScope, "最近有哪些異常？");
    expect(result.report.currentStatus).toBe("目前資料正常。");
    expect(success.db.writes).toBe(1);
    expect(aiRun).toHaveBeenCalledTimes(1);

    const provider = fakeAnalysisEnv({ ai: { run: vi.fn(async () => { throw new Error("provider transport failure"); }) } as unknown as NonNullable<AnalysisEnv["AI"]> });
    await expect(runReadOnlyAnalysis(provider.env, "org-test", analysisScope, "最近有哪些異常？")).rejects.toThrow("analysis_ai_unavailable");
    expect(provider.db.writes).toBe(0);

    const invalidResponse = fakeAnalysisEnv({ ai: { run: vi.fn(async () => ({ response: "not-json" })) } as unknown as NonNullable<AnalysisEnv["AI"]> });
    await expect(runReadOnlyAnalysis(invalidResponse.env, "org-test", analysisScope, "最近有哪些異常？")).rejects.toThrow("analysis_schema_invalid");
    expect(invalidResponse.db.writes).toBe(0);

    const cacheFailure = fakeAnalysisEnv({ ai: { run: aiRun } as unknown as NonNullable<AnalysisEnv["AI"]>, cacheError: new Error("cache unavailable") });
    await expect(runReadOnlyAnalysis(cacheFailure.env, "org-test", analysisScope, "最近有哪些異常？")).rejects.toThrow("analysis_cache_read_failed");
    expect(cacheFailure.db.writes).toBe(0);

    const persistenceFailure = fakeAnalysisEnv({ ai: { run: aiRun } as unknown as NonNullable<AnalysisEnv["AI"]>, insertError: new Error("insert unavailable") });
    await expect(runReadOnlyAnalysis(persistenceFailure.env, "org-test", analysisScope, "最近有哪些異常？")).rejects.toThrow("analysis_report_persistence_failed");
    expect(persistenceFailure.db.writes).toBe(0);
  });
});
