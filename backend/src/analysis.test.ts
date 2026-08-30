import { describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_TOOL_NAMES,
  ANALYSIS_RESPONSE_FAILURE_CODES,
  ANALYSIS_AI_MODEL,
  ANALYSIS_JSON_SCHEMA,
  ANALYSIS_RESPONSE_FORMAT,
  PRODUCTION_AI_MODEL,
  classifyAnalysisFailure,
  classifyAbnormalWithAi,
  generateDailyBrief,
  isReadOnlyAnalysisQuestion,
  parseAnalysisResponse,
  parseStructuredAnalysis,
  runReadOnlyAnalysis,
  type AnalysisEnv,
  validateAnalysisScope,
  validateAnalysisToolPlan,
} from "./analysis";

const analysisScope = { type: "organization", id: "organization" } as const;
const validStructuredAnalysis = {
  currentStatus: "目前資料正常。",
  findings: [],
  possibleCauses: [],
  risks: [],
  recommendations: [],
  limitations: [],
};
const validAnalysisResponse = {
  response: JSON.stringify(validStructuredAnalysis),
};

function analysisResponse(overrides: Record<string, unknown> = {}) {
  return { response: JSON.stringify({ ...validStructuredAnalysis, ...overrides }) };
}

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
    expect(ANALYSIS_AI_MODEL).toBe("@cf/meta/llama-3.1-8b-instruct-fast");
  });

  it("isolates StructuredAnalysis on the Free-tier JSON Mode model", async () => {
    const aiRun = vi.fn(async (_model: string, _input: Record<string, unknown>) => validAnalysisResponse);
    const { env } = fakeAnalysisEnv({ ai: { run: aiRun } as unknown as NonNullable<AnalysisEnv["AI"]> });
    const result = await runReadOnlyAnalysis(env, "org-test", analysisScope, "最近有哪些異常？", true);

    expect(aiRun).toHaveBeenCalledWith(ANALYSIS_AI_MODEL, expect.objectContaining({
      response_format: ANALYSIS_RESPONSE_FORMAT,
      max_tokens: 1200,
      temperature: 0,
    }));
    expect(result.model).toBe(ANALYSIS_AI_MODEL);
  });

  it("uses the same isolated model for generated daily briefs", async () => {
    const aiRun = vi.fn(async () => validAnalysisResponse);
    const { env } = fakeAnalysisEnv({ ai: { run: aiRun } as unknown as NonNullable<AnalysisEnv["AI"]> });
    const result = await generateDailyBrief(env, "org-test", analysisScope, true);

    expect(aiRun).toHaveBeenCalledWith(ANALYSIS_AI_MODEL, expect.objectContaining({ response_format: ANALYSIS_RESPONSE_FORMAT }));
    expect(result.model).toBe(ANALYSIS_AI_MODEL);
  });

  it("keeps the JSON Schema acceptance boundary equivalent to the local validator", () => {
    expect(ANALYSIS_JSON_SCHEMA).toMatchObject({
      type: "object",
      additionalProperties: true,
      required: ["currentStatus", "findings", "possibleCauses", "risks", "recommendations", "limitations"],
    });
    const properties = ANALYSIS_JSON_SCHEMA.properties;
    expect(properties.currentStatus).toMatchObject({ type: "string", pattern: "\\S", maxLength: 1200 });
    expect(properties.findings).toMatchObject({ type: "array", maxItems: 8 });
    expect(properties.risks).toMatchObject({ type: "array", maxItems: 8 });
    expect(properties.recommendations).toMatchObject({ type: "array", maxItems: 8 });
    expect(properties.limitations).toMatchObject({ type: "array", maxItems: 8 });
    expect(properties.possibleCauses).toMatchObject({ type: "array", maxItems: 8 });
    expect(properties.possibleCauses.items).toMatchObject({
      type: "object",
      additionalProperties: true,
      required: ["text", "evidence"],
    });
    expect((properties.possibleCauses.items as typeof ANALYSIS_JSON_SCHEMA.properties.possibleCauses.items).properties.evidence).toEqual({
      type: "string",
      enum: ["strong", "medium", "weak"],
    });
    expect(parseStructuredAnalysis({
      ...validStructuredAnalysis,
      extraProviderField: true,
      possibleCauses: [{ text: "高溫", evidence: "medium", extraCauseField: "ignored" }],
    })).not.toBeNull();
  });

  it("states the complete StructuredAnalysis contract in the production prompt", async () => {
    const aiRun = vi.fn(async () => validAnalysisResponse);
    const { env } = fakeAnalysisEnv({ ai: { run: aiRun } as unknown as NonNullable<AnalysisEnv["AI"]> });
    await runReadOnlyAnalysis(env, "org-test", analysisScope, "最近有哪些異常？", true);

    const request = (aiRun.mock.calls[0] as unknown[] | undefined)?.[1] as { messages?: Array<{ content?: unknown }> } | undefined;
    const prompt = String(request?.messages?.[0]?.content ?? "");
    for (const field of ["currentStatus", "findings", "possibleCauses", "risks", "recommendations", "limitations"]) {
      expect(prompt).toContain(field);
    }
    expect(prompt).toContain("永遠包含");
    expect(prompt).toContain("[]");
    expect(prompt).toContain("strong、medium、weak");
    expect(prompt).toContain("validated context");
    expect(prompt).toContain("不得生成 SQL");
  });

  it("classifies response-validation subtypes without relaxing the schema", () => {
    expect(parseAnalysisResponse(validAnalysisResponse).ok).toBe(true);

    const cases: Array<[unknown, keyof typeof ANALYSIS_RESPONSE_FAILURE_CODES]> = [
      [null, "response_text_missing"],
      [{ response: "not-json" }, "json_no_object_candidate"],
      [{ response: 'prefix {"broken":}' }, "json_object_candidate_invalid"],
      [{ response: 'prefix {"one":1} then {"two":2}' }, "json_object_candidate_ambiguous"],
      [{ response: 'prefix {"broken":1' }, "json_object_unterminated"],
      [{ response: "[]" }, "schema_top_level_invalid"],
      [analysisResponse({ limitations: undefined }), "schema_required_field_missing"],
      [analysisResponse({ findings: [1] }), "schema_field_type_invalid"],
      [analysisResponse({ possibleCauses: ["高溫"] }), "schema_possible_causes_invalid"],
      [analysisResponse({ possibleCauses: [{ text: "高溫", evidence: "high" }] }), "schema_evidence_enum_invalid"],
      [analysisResponse({ currentStatus: "   " }), "schema_constraint_invalid"],
    ];
    for (const [value, subtype] of cases) {
      expect(parseAnalysisResponse(value)).toEqual({ ok: false, subtype });
    }

    expect(parseAnalysisResponse({
      response: `Model note {not valid JSON}; result: ${JSON.stringify(validStructuredAnalysis)}`,
    })).toEqual({ ok: true, report: validStructuredAnalysis });

    expect(parseStructuredAnalysis({
      ...validStructuredAnalysis,
      possibleCauses: [{ text: "高溫", evidence: "high" }],
    })).toBeNull();
  });

  it("classifies the bounded analysis failure stages without exposing runtime details", () => {
    expect(classifyAnalysisFailure(new Error("analysis_ai_unavailable"))).toEqual({ layer: "provider", code: "ai_provider_unavailable" });
    expect(classifyAnalysisFailure(new Error("analysis_schema_invalid"))).toEqual({ layer: "response_validation", code: "ai_response_invalid" });
    expect(classifyAnalysisFailure(new Error("analysis_report_persistence_failed"))).toEqual({ layer: "persistence", code: "ai_report_persistence_failed" });
    expect(classifyAnalysisFailure(new Error("provider-internal-secret"))).toEqual({ layer: "unknown", code: "ai_analysis_unavailable" });
    expect(classifyAnalysisFailure(new Error("analysis_response_invalid:json_extraction_failed"))).toEqual({
      layer: "response_validation",
      code: ANALYSIS_RESPONSE_FAILURE_CODES.json_extraction_failed,
    });
    expect(classifyAnalysisFailure(new Error("analysis_response_invalid:json_object_candidate_invalid"))).toEqual({
      layer: "response_validation",
      code: ANALYSIS_RESPONSE_FAILURE_CODES.json_object_candidate_invalid,
    });
    expect(classifyAnalysisFailure(new Error("analysis_response_invalid:schema_evidence_enum_invalid"))).toEqual({
      layer: "response_validation",
      code: ANALYSIS_RESPONSE_FAILURE_CODES.schema_evidence_enum_invalid,
    });
    expect(classifyAnalysisFailure(new Error("analysis_response_invalid:provider-internal-secret"))).toEqual({ layer: "unknown", code: "ai_analysis_unavailable" });
  });

  it("fails closed when JSON Mode cannot be met without trying a paid fallback", async () => {
    const aiRun = vi.fn(async (_model: string, _input: Record<string, unknown>) => {
      throw new Error("JSON Mode couldn't be met");
    });
    const { env, db } = fakeAnalysisEnv({ ai: { run: aiRun } as unknown as NonNullable<AnalysisEnv["AI"]> });
    await expect(runReadOnlyAnalysis(env, "org-test", analysisScope, "最近有哪些異常？", true)).rejects.toThrow("analysis_ai_unavailable");
    expect(aiRun).toHaveBeenCalledTimes(1);
    expect(db.writes).toBe(0);
  });

  it("keeps unrelated abnormal classification on the general Production model", async () => {
    const aiRun = vi.fn(async (model: string) => {
      expect(model).toBe(PRODUCTION_AI_MODEL);
      return { response: JSON.stringify({ category: "health", tags: [], confidence: 0.8 }) };
    });
    const result = await classifyAbnormalWithAi({ run: aiRun } as unknown as Ai, "雞群咳嗽");
    expect(result?.category).toBe("health");
    expect(aiRun).toHaveBeenCalledTimes(1);
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
    await expect(runReadOnlyAnalysis(invalidResponse.env, "org-test", analysisScope, "最近有哪些異常？")).rejects.toThrow("analysis_response_invalid:json_no_object_candidate");
    expect(invalidResponse.db.writes).toBe(0);

    const cacheFailure = fakeAnalysisEnv({ ai: { run: aiRun } as unknown as NonNullable<AnalysisEnv["AI"]>, cacheError: new Error("cache unavailable") });
    await expect(runReadOnlyAnalysis(cacheFailure.env, "org-test", analysisScope, "最近有哪些異常？")).rejects.toThrow("analysis_cache_read_failed");
    expect(cacheFailure.db.writes).toBe(0);

    const persistenceFailure = fakeAnalysisEnv({ ai: { run: aiRun } as unknown as NonNullable<AnalysisEnv["AI"]>, insertError: new Error("insert unavailable") });
    await expect(runReadOnlyAnalysis(persistenceFailure.env, "org-test", analysisScope, "最近有哪些異常？")).rejects.toThrow("analysis_report_persistence_failed");
    expect(persistenceFailure.db.writes).toBe(0);
  });
});
