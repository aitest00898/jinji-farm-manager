import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FarmResolver } from "./farm-resolver";
import { AmbientV2DirectRestAdapter } from "./ambient-extraction-v2-rest";
import {
  AMBIENT_V2_CANONICAL_EVENT_EXAMPLE,
  AMBIENT_V2_CANONICAL_MULTI_EVENT_EXAMPLE,
  AMBIENT_V2_DETAIL_MAX_CODE_POINTS,
  AMBIENT_V2_SYSTEM_PROMPT,
  ambientV2RequestPromptFingerprint,
  auditAmbientV2PromptContract,
  buildAmbientV2Request,
  collapseAmbientV2TechnicalDuplicates,
  classifyAmbientV2MessageRoute,
  detectAmbientV2RelationCue,
  evaluateAmbientExtractionV2,
  existingAmbientV2DeterministicFastPath,
  inspectAmbientV2ResponseInput,
  parseAmbientV2Response,
  planAmbientExtractionV2Batch,
  resolveAmbientV2Context,
  resolveAmbientV2Relation,
  runAmbientExtractionV2Batch,
  type AmbientV2AiAdapter,
  type AmbientV2ExpectedMessage,
  type AmbientV2MessageInput,
  type AmbientV2SystemEvent,
} from "./ambient-extraction-v2";

interface GroundTruthEvent {
  event: "mortality" | "cull" | "abnormal";
  quantity: number | null;
  detail?: string;
}

interface GroundTruthMessage {
  safe_ref: string;
  role?: "context" | "selected";
  text: string;
  context_candidates?: string[];
  expected: {
    events: GroundTruthEvent[];
    relation_intent: { type: string; target_ref: string } | null;
    context_resolution?: "resolved" | "unresolved";
  };
}

interface GroundTruthCase {
  case_id: string;
  category: string;
  messages: Array<GroundTruthMessage & { source_identity?: string; delivery_attempt?: string }>;
  aggregate_expected: Record<string, unknown>;
}

interface V2GroundTruthArtifact {
  schema_version: string;
  ground_truth_version: string;
  previous_ground_truth_version: string;
  status: string;
  frozen_at: string;
  accounting_correction: {
    correction_type: string;
    case_level_expectations_changed: boolean;
    old_semantic_event_count: number;
    correct_semantic_event_count: number;
    correction_reason: string;
  };
  rules: {
    detail_max_unicode_code_points: number;
    d04_cross_event_quantity_attribution_risk: string;
    d04_failure_changes_current_acceptance: boolean;
    structural_fail_closed: boolean;
    semantic_partial_success: boolean;
    same_run_automatic_provider_retry: string;
    ground_truth_immutable_after_test: boolean;
  };
  dev_smoke_8: {
    selected_refs: string[];
    messages: GroundTruthMessage[];
    aggregate_expected: Record<string, unknown>;
  };
  fresh_unseen_cases: GroundTruthCase[];
}

const groundTruth = JSON.parse(readFileSync(
  resolve(import.meta.dirname, "../forensics/ambient-extraction-v2-ground-truth-2026-08-27.json"),
  "utf8",
)) as V2GroundTruthArtifact;

function inputFor(message: GroundTruthMessage & { source_identity?: string; delivery_attempt?: string }, index: number, selected: ReadonlySet<string>): AmbientV2MessageInput {
  return {
    safeRef: message.safe_ref,
    sourceIdentity: message.source_identity ?? `fixture-${message.safe_ref}`,
    text: message.text,
    selected: selected.has(message.safe_ref),
    groupKey: "fixture-group",
    ...(message.context_candidates ? { contextFarmCandidates: message.context_candidates } : {}),
  };
}

function expectedFor(messages: readonly GroundTruthMessage[]): AmbientV2ExpectedMessage[] {
  return messages.map((message) => ({
    safeRef: message.safe_ref,
    events: message.expected.events,
    relationTargetRef: message.expected.relation_intent?.target_ref ?? null,
    ...(message.expected.context_resolution ? { contextResolution: message.expected.context_resolution } : {}),
  }));
}

function responseFor(message: GroundTruthMessage): string {
  return JSON.stringify({
    events: message.expected.events.map((event) => ({
      ...event,
      detail: event.event === "abnormal" ? event.detail ?? null : null,
    })),
  });
}

class FixtureAdapter implements AmbientV2AiAdapter {
  readonly name = "v2-fixture";
  calls = 0;
  private readonly responses: ReadonlyMap<string, unknown>;

  constructor(responses: ReadonlyMap<string, unknown>) {
    this.responses = responses;
  }

  async run(_request: Parameters<AmbientV2AiAdapter["run"]>[0], context: { safeRef: string }): Promise<unknown> {
    this.calls += 1;
    return this.responses.get(context.safeRef) ?? JSON.stringify({ events: [] });
  }
}

function fixtureAdapter(messages: readonly GroundTruthMessage[]): FixtureAdapter {
  return new FixtureAdapter(new Map(messages.map((message) => [message.safe_ref, responseFor(message)])));
}

function buildDevFixture() {
  const selected = new Set(groundTruth.dev_smoke_8.selected_refs);
  const messages = groundTruth.dev_smoke_8.messages.map((message, index) => inputFor(message, index, selected));
  const adapter = fixtureAdapter(groundTruth.dev_smoke_8.messages);
  return { selected, messages, adapter };
}

describe("Ambient Extraction V2 frozen specification", () => {
  it("freezes the version before implementation and keeps D04 high-risk expectation", () => {
    expect(groundTruth).toMatchObject({
      schema_version: "ambient_extraction_v2",
      ground_truth_version: "1.0.1",
      previous_ground_truth_version: "1.0",
      status: "FROZEN",
    });
    expect(groundTruth.accounting_correction).toEqual({
      correction_type: "AGGREGATE_ACCOUNTING_CORRECTION",
      case_level_expectations_changed: false,
      old_semantic_event_count: 5,
      correct_semantic_event_count: 6,
      correction_reason: "D03_ABNORMAL_NULL_QUANTITY_WAS_OMITTED_FROM_AGGREGATE_COUNT",
    });
    expect(groundTruth.rules).toMatchObject({
      detail_max_unicode_code_points: AMBIENT_V2_DETAIL_MAX_CODE_POINTS,
      d04_cross_event_quantity_attribution_risk: "HIGH",
      d04_failure_changes_current_acceptance: true,
      ground_truth_immutable_after_test: true,
    });
    const d04 = groundTruth.dev_smoke_8.messages.find((message) => message.safe_ref === "D04");
    expect(d04?.expected.events).toEqual([
      { event: "cull", quantity: 2 },
      { event: "abnormal", quantity: 2, detail: "腳傷" },
    ]);
    const semanticEventCount = groundTruth.dev_smoke_8.messages.reduce(
      (count, message) => count + message.expected.events.length,
      0,
    );
    expect(semanticEventCount).toBe(6);
    expect(groundTruth.dev_smoke_8.aggregate_expected.semantic_event_count).toBe(6);
    expect(groundTruth.dev_smoke_8.aggregate_expected.relation_count).toBe(1);
    expect(groundTruth.fresh_unseen_cases).toHaveLength(13);
  });

  it("keeps the V2 AI prompt separate from the old decisions contract", () => {
    expect(AMBIENT_V2_SYSTEM_PROMPT).toContain("events");
    expect(AMBIENT_V2_SYSTEM_PROMPT).not.toContain("decisions");
    expect(AMBIENT_V2_SYSTEM_PROMPT).toContain("每個事件都必須輸出 detail");
    expect(AMBIENT_V2_SYSTEM_PROMPT).toContain("mortality/cull 的 detail 必須是 null");
    expect(buildAmbientV2Request({ safeRef: "D05", sourceIdentity: "safe", text: "死亡3隻" }).messages[1]?.content).toContain("source");
  });

  it("fingerprints the actual V2 request prompt without persisting prompt text", () => {
    const requestA = buildAmbientV2Request({ safeRef: "D03", sourceIdentity: "safe-a", text: "synthetic-a" });
    const requestB = buildAmbientV2Request({ safeRef: "D07", sourceIdentity: "safe-b", text: "synthetic-b" });
    const audit = auditAmbientV2PromptContract();
    expect(audit).toMatchObject({
      v2ContractMarkers: "PASS",
      canonicalPositiveEventExampleCount: 2,
      oldPromptMarkersPresent: false,
      topLevelEvents: true,
      requiresKind: false,
      requiresRef: false,
      requiresTargetRef: false,
      requiresConfidence: false,
      requiresRaw: false,
    });
    expect(audit.fingerprint).toMatch(/^fnv1a32-[0-9a-f]{8}$/u);
    expect(audit.charCount).toBe(AMBIENT_V2_SYSTEM_PROMPT.length);
    expect(ambientV2RequestPromptFingerprint(requestA)).toBe(audit.fingerprint);
    expect(ambientV2RequestPromptFingerprint(requestB)).toBe(audit.fingerprint);
  });

  it("contains exactly two canonical positive event examples and no D04-specific example", () => {
    expect(AMBIENT_V2_SYSTEM_PROMPT.split(AMBIENT_V2_CANONICAL_EVENT_EXAMPLE).length - 1).toBe(1);
    expect(AMBIENT_V2_SYSTEM_PROMPT.split(AMBIENT_V2_CANONICAL_MULTI_EVENT_EXAMPLE).length - 1).toBe(1);
    expect(AMBIENT_V2_SYSTEM_PROMPT).toContain("同一則來源可有多個事件");
    expect(AMBIENT_V2_SYSTEM_PROMPT).not.toContain("淘汰2隻");
    expect(AMBIENT_V2_SYSTEM_PROMPT).not.toContain("腳傷");
    expect(auditAmbientV2PromptContract().canonicalPositiveEventExampleCount).toBe(2);
    expect(auditAmbientV2PromptContract().oldPromptMarkersPresent).toBe(false);
  });

  it("extracts model text from the REST result without accepting the outer provider envelope", () => {
    const modelText = JSON.stringify({ events: [] });
    expect(inspectAmbientV2ResponseInput(modelText)).toEqual({
      inputClass: "MODEL_TEXT",
      modelTextPresent: true,
      failureSubtype: null,
    });
    expect(inspectAmbientV2ResponseInput({ response: modelText })).toEqual({
      inputClass: "RESULT_RESPONSE",
      modelTextPresent: true,
      failureSubtype: null,
    });
    expect(inspectAmbientV2ResponseInput({ success: true, result: { response: modelText } })).toEqual({
      inputClass: "PROVIDER_ENVELOPE",
      modelTextPresent: false,
      failureSubtype: "UNEXPECTED_PROVIDER_ENVELOPE",
    });
    expect(parseAmbientV2Response({ success: true, result: { response: modelText } }).diagnostics.structuralSubtype)
      .toBe("UNEXPECTED_PROVIDER_ENVELOPE");
  });

  it("prepares a direct REST bridge with the pinned Production parameters", async () => {
    let captured: { model: string; input: unknown } | null = null;
    const adapter = new AmbientV2DirectRestAdapter({
      transport: {
        async run(model, input) {
          captured = { model, input };
          return JSON.stringify({ events: [] });
        },
      },
    });
    await adapter.run(buildAmbientV2Request({ safeRef: "D03", sourceIdentity: "safe", text: "synthetic" }), { safeRef: "D03" });
    const capturedCall = captured as { model: string; input: Record<string, unknown> } | null;
    expect(capturedCall).toMatchObject({
      model: "@cf/meta/llama-3.2-3b-instruct",
      input: { max_tokens: 1536, temperature: 0 },
    });
    expect((capturedCall?.input as { messages?: unknown[] }).messages).toHaveLength(2);
    expect(capturedCall?.input).not.toHaveProperty("response_format");
  });

  it("requires an explicit developer opt-in before using a non-Production model", async () => {
    expect(() => new AmbientV2DirectRestAdapter({
      model: "@cf/qwen/qwen3.8-27b",
      transport: { async run() { return JSON.stringify({ events: [] }); } },
    })).toThrow("AMBIENT_V2_MODEL_MUST_MATCH_PRODUCTION");

    let capturedModel = "";
    const adapter = new AmbientV2DirectRestAdapter({
      model: "@cf/qwen/qwen3.8-27b",
      allowNonProductionModel: true,
      transport: {
        async run(model) {
          capturedModel = model;
          return JSON.stringify({ events: [] });
        },
      },
    });
    await adapter.run(buildAmbientV2Request({ safeRef: "D04", sourceIdentity: "safe", text: "synthetic" }), { safeRef: "D04" });
    expect(capturedModel).toBe("@cf/qwen/qwen3.8-27b");
  });
});

describe("Ambient Extraction V2 strict schema", () => {
  it.each([
    ["empty events", "{\"events\":[]}"],
    ["known mortality", "{\"events\":[{\"event\":\"mortality\",\"quantity\":3,\"detail\":null}]}"],
    ["unknown mortality", "{\"events\":[{\"event\":\"mortality\",\"quantity\":null,\"detail\":null}]}"],
    ["known cull", "{\"events\":[{\"event\":\"cull\",\"quantity\":2,\"detail\":null}]}"],
    ["unknown cull", "{\"events\":[{\"event\":\"cull\",\"quantity\":null,\"detail\":null}]}"],
    ["abnormal with detail", "{\"events\":[{\"event\":\"abnormal\",\"quantity\":null,\"detail\":\"咳嗽\"}]}"],
    ["multiple events", "{\"events\":[{\"event\":\"mortality\",\"quantity\":32,\"detail\":null},{\"event\":\"abnormal\",\"quantity\":null,\"detail\":\"咳嗽\"},{\"event\":\"abnormal\",\"quantity\":null,\"detail\":\"臭腳\"}]}"],
  ])("accepts %s", (_label, json) => {
    const result = parseAmbientV2Response(json);
    expect(result.structuralStatus).toBe("pass");
    expect(result.semanticStatus).toBe(json === "{\"events\":[]}" ? "none" : "resolved");
    expect(result.diagnostics.invalidEventCount).toBe(0);
  });

  it.each([
    ["unknown top-level key", "{\"events\":[],\"reason\":\"private\"}"],
    ["events not array", "{\"events\":null}"],
    ["unknown event key", "{\"events\":[{\"event\":\"mortality\",\"quantity\":3,\"confidence\":\"high\"}]}"],
    ["missing quantity", "{\"events\":[{\"event\":\"mortality\"}]}"],
    ["invalid event type", "{\"events\":[{\"event\":\"death\",\"quantity\":3}]}"],
    ["wrong quantity type", "{\"events\":[{\"event\":\"mortality\",\"quantity\":\"3\"}]}"],
    ["missing detail", "{\"events\":[{\"event\":\"mortality\",\"quantity\":3}]}"],
    ["mortality detail", "{\"events\":[{\"event\":\"mortality\",\"quantity\":3,\"detail\":\"腳傷\"}]}"],
    ["long detail", `{"events":[{"event":"abnormal","quantity":null,"detail":"${"一".repeat(13)}"}]}`],
  ])("rejects %s without salvage", (_label, json) => {
    const result = parseAmbientV2Response(json);
    expect(result.structuralStatus === "fail" || result.semanticStatus !== "resolved").toBe(true);
    expect(result.proposals).toHaveLength(0);
  });

  it.each([
    ["invalid JSON", "{\"events\":[}", "INVALID_JSON"],
    ["truncated JSON", "{\"events\":[", "TRUNCATED_JSON"],
    ["old decisions shape", "{\"decisions\":[]}", "UNEXPECTED_OLD_DECISIONS_SHAPE"],
    ["missing events", "{}", "EVENTS_MISSING"],
    ["events not array", "{\"events\":{}}", "EVENTS_NOT_ARRAY"],
    ["unknown top-level key", "{\"events\":[],\"reason\":\"x\"}", "TOP_LEVEL_UNKNOWN_KEY"],
    ["top-level array", "[]", "TOP_LEVEL_NOT_OBJECT"],
  ] as const)("classifies %s with a bounded subtype", (_label, json, subtype) => {
    const result = parseAmbientV2Response(json);
    expect(result.structuralStatus).toBe("fail");
    expect(result.diagnostics.structuralSubtype).toBe(subtype);
    expect(result.diagnostics.topLevelKeys.every((key) => key === "UNKNOWN" || /^[A-Za-z][A-Za-z0-9]*$/u.test(key))).toBe(true);
  });

  it.each([
    ["event unknown key", "{\"events\":[{\"event\":\"mortality\",\"quantity\":3,\"confidence\":\"high\"}]}", "EVENT_ITEM_UNKNOWN_KEY", null],
    ["missing event", "{\"events\":[{\"quantity\":3}]}", "EVENT_MISSING_EVENT", "event"],
    ["missing quantity", "{\"events\":[{\"event\":\"mortality\"}]}", "EVENT_MISSING_QUANTITY", "quantity"],
    ["invalid event enum", "{\"events\":[{\"event\":\"death\",\"quantity\":3}]}", "EVENT_INVALID_EVENT_ENUM", "event"],
    ["invalid quantity type", "{\"events\":[{\"event\":\"mortality\",\"quantity\":\"3\"}]}", "EVENT_INVALID_QUANTITY_TYPE", "quantity"],
    ["missing detail", "{\"events\":[{\"event\":\"mortality\",\"quantity\":3}]}", "EVENT_MISSING_DETAIL", "detail"],
    ["detail not allowed", "{\"events\":[{\"event\":\"mortality\",\"quantity\":3,\"detail\":\"腳傷\"}]}", "EVENT_DETAIL_NOT_ALLOWED", "detail"],
    ["detail too long", `{"events":[{"event":"abnormal","quantity":null,"detail":"${"一".repeat(13)}"}]}`, "EVENT_DETAIL_TOO_LONG", "detail"],
  ] as const)("classifies %s with bounded event diagnostics", (_label, json, subtype, field) => {
    const result = parseAmbientV2Response(json);
    expect(result.structuralStatus).toBe("pass");
    expect(result.semanticStatus).toBe("unresolved");
    expect(result.diagnostics.semanticSubtype).toBe(subtype);
    expect(result.diagnostics.firstInvalidEventIndex).toBe(1);
    expect(result.diagnostics.firstInvalidField).toBe(field);
    expect(result.diagnostics.eventDiagnostics[0]?.failureSubtype).toBe(subtype);
  });

  it("fails the whole response closed for malformed or fenced JSON", () => {
    for (const input of [
      "{\"events\":[{\"event\":\"mortality\",\"quantity\":3}",
      "{\"events\":[",
      "```json\n{\"events\":[]}\n```",
    ]) {
      const result = parseAmbientV2Response(input);
      expect(result.structuralStatus).toBe("fail");
      expect(result.proposals).toEqual([]);
    }
  });

  it("uses Unicode code points and never truncates detail", () => {
    expect(parseAmbientV2Response(JSON.stringify({ events: [{ event: "abnormal", quantity: null, detail: "一".repeat(12) }] })).semanticStatus).toBe("resolved");
    expect(parseAmbientV2Response(JSON.stringify({ events: [{ event: "abnormal", quantity: null, detail: "🐔".repeat(12) }] })).semanticStatus).toBe("resolved");
    const tooLong = parseAmbientV2Response(JSON.stringify({ events: [{ event: "abnormal", quantity: null, detail: "🐔".repeat(13) }] }));
    expect(tooLong.semanticStatus).toBe("unresolved");
    expect(tooLong.proposals).toEqual([]);
  });

  it("keeps valid events while marking a parsed response partial", () => {
    const result = parseAmbientV2Response(JSON.stringify({ events: [
      { event: "mortality", quantity: 2, detail: null },
      { event: "death", quantity: 1 },
    ] }));
    expect(result.structuralStatus).toBe("pass");
    expect(result.semanticStatus).toBe("partial");
    expect(result.proposals).toEqual([{ event: "mortality", quantity: 2 }]);
    expect(result.diagnostics.invalidEventCount).toBe(1);
  });

  it("requires abnormal detail to be non-null while accepting null only for mortality and cull", () => {
    const abnormalWithoutDetail = parseAmbientV2Response(JSON.stringify({ events: [
      { event: "abnormal", quantity: null, detail: null },
    ] }));
    expect(abnormalWithoutDetail.structuralStatus).toBe("pass");
    expect(abnormalWithoutDetail.semanticStatus).toBe("unresolved");
    expect(abnormalWithoutDetail.proposals).toEqual([]);
    expect(abnormalWithoutDetail.diagnostics.semanticFailureCode).toBe("ABNORMAL_DETAIL_REQUIRED");
    expect(abnormalWithoutDetail.diagnostics.firstInvalidField).toBe("detail");

    const mortality = parseAmbientV2Response(JSON.stringify({ events: [
      { event: "mortality", quantity: 3, detail: null },
    ] }));
    expect(mortality.semanticStatus).toBe("resolved");
    expect(mortality.proposals).toEqual([{ event: "mortality", quantity: 3 }]);
    expect(mortality.proposals[0]).not.toHaveProperty("detail");

    const cull = parseAmbientV2Response(JSON.stringify({ events: [
      { event: "cull", quantity: 2, detail: null },
    ] }));
    expect(cull.semanticStatus).toBe("resolved");
    expect(cull.proposals).toEqual([{ event: "cull", quantity: 2 }]);
    expect(cull.proposals[0]).not.toHaveProperty("detail");
  });
});

describe("Ambient Extraction V2 relation, context, and idempotency", () => {
  const baseEvent = (sourceRef: string, sourceIdentity = sourceRef): AmbientV2SystemEvent => ({
    kind: "event",
    event: "mortality",
    quantity: 3,
    sourceRef,
    sourceIdentity,
    eventOrdinal: 1,
    quantityConfidence: "observed",
    contextResolution: { status: "not_requested", candidateCount: 0 },
    lineageRefs: [sourceRef],
  });

  it("does not semantic-dedupe different source identities", () => {
    const result = collapseAmbientV2TechnicalDuplicates([baseEvent("A", "source-A"), baseEvent("B", "source-B")]);
    expect(result.events).toHaveLength(2);
    expect(result.collapsedCount).toBe(0);
  });

  it("collapses only a same-source retry with the same event ordinal", () => {
    const result = collapseAmbientV2TechnicalDuplicates([baseEvent("A", "same-source"), baseEvent("A-retry", "same-source")]);
    expect(result.events).toHaveLength(1);
    expect(result.collapsedCount).toBe(1);
  });

  it("resolves explicit relation only against a bounded non-official pool", () => {
    expect(detectAmbientV2RelationCue("那三隻是前面那筆，不是新的一筆")).toBe(true);
    expect(resolveAmbientV2Relation("那三隻是前面那筆，不是新的一筆", [baseEvent("D05")])).toMatchObject({
      status: "resolved",
      targetRef: "D05",
    });
    expect(resolveAmbientV2Relation("那三隻是前面那筆，不是新的一筆", [{ ...baseEvent("D05"), isOfficial: true }])).toMatchObject({ status: "unresolved" });
    expect(resolveAmbientV2Relation("那三隻是前面那筆，不是新的一筆", [baseEvent("A"), baseEvent("B"), baseEvent("C"), baseEvent("D")])).toMatchObject({ status: "unresolved", candidateCount: 4 });
  });

  it("separates farm resolution from event semantics", () => {
    expect(resolveAmbientV2Context({ contextFarmCandidates: ["FARM-A"] })).toEqual({ status: "resolved", candidateCount: 1 });
    expect(resolveAmbientV2Context({ contextFarmCandidates: ["FARM-A", "FARM-B"] })).toEqual({ status: "unresolved", candidateCount: 2 });
    const resolver = new FarmResolver([
      { id: "farm-a", name: "甲試驗場", environment: "test" },
    ]);
    expect(resolveAmbientV2Context({ farmText: "甲試驗場", resolver })).toEqual({ status: "resolved", candidateCount: 1 });
  });

  it("uses the existing deterministic parser only for a conservative single event", () => {
    expect(existingAmbientV2DeterministicFastPath("死亡3隻")).toEqual([{ event: "mortality", quantity: 3 }]);
    expect(existingAmbientV2DeterministicFastPath("死亡3隻，咳嗽")).toBeNull();
    expect(existingAmbientV2DeterministicFastPath("那三隻不是新增")).toBeNull();
  });

  it("routes relation-only, mixed, event-only, and context messages before AI", () => {
    expect(classifyAmbientV2MessageRoute({ safeRef: "D06", sourceIdentity: "D06", text: "那個死亡3隻先記著，不是新增一筆" }, true))
      .toBe("RELATION_ONLY");
    expect(classifyAmbientV2MessageRoute({ safeRef: "F13-2", sourceIdentity: "F13-2", text: "今天又少1隻，前面淘汰兩隻那筆不是新增" }, true))
      .toBe("MIXED_EVENT_AND_RELATION");
    expect(classifyAmbientV2MessageRoute({ safeRef: "D02", sourceIdentity: "D02", text: "金雞測試場剛剛死2隻" }, true))
      .toBe("EVENT_ONLY");
    expect(classifyAmbientV2MessageRoute({ safeRef: "D08", sourceIdentity: "D08", text: "4個人", selected: false }, false))
      .toBe("NONE");
  });
});

describe("Ambient Extraction V2 message-level processing", () => {
  it("plans DEV-SMOKE-8 provider calls without invoking AI", () => {
    const { selected, messages } = buildDevFixture();
    expect(planAmbientExtractionV2Batch({ messages, selectedRefs: selected })).toEqual({
      messagesTotal: 8,
      selectedCount: 6,
      deterministicResolved: 2,
      aiExtractionRequired: 3,
      relationDeterministic: 1,
      relationAiRequired: 0,
      noEventFastPath: 0,
      expectedProviderCalls: 3,
    });
  });

  it("does not call event extraction AI for the frozen D06 relation-only message", async () => {
    const d05 = groundTruth.dev_smoke_8.messages.find((message) => message.safe_ref === "D05");
    const d06 = groundTruth.dev_smoke_8.messages.find((message) => message.safe_ref === "D06");
    if (!d05 || !d06) throw new Error("D05_D06_MISSING");
    const adapter = fixtureAdapter([d06]);
    const result = await runAmbientExtractionV2Batch({
      messages: [inputFor(d05, 0, new Set(["D05"])), inputFor(d06, 1, new Set(["D06"]))],
      selectedRefs: ["D05", "D06"],
      adapter,
    });
    expect(adapter.calls).toBe(0);
    expect(result.messages.find((message) => message.safeRef === "D06")).toMatchObject({
      route: "RELATION_ONLY",
      extractionMode: "relation",
      structuralStatus: "pass",
      events: [],
      relationIntent: { status: "resolved", targetRef: "D05" },
    });
    expect(result.metrics.aiCalls).toBe(0);
    expect(result.metrics.relationResolverCalls).toBe(1);
  });

  it("evaluates the frozen DEV-SMOKE-8 with six semantic events and one relation", async () => {
    const { selected, messages, adapter } = buildDevFixture();
    const result = await runAmbientExtractionV2Batch({ messages, selectedRefs: selected, adapter });
    const report = evaluateAmbientExtractionV2(result, expectedFor(groundTruth.dev_smoke_8.messages), selected);
    expect(report.overallPass).toBe(true);
    expect(report.decisionCoverage).toBe("6/6");
    expect(report.eventCount).toBe(6);
    expect(report.relationCount).toBe(1);
    expect(report.hallucinationCount).toBe(0);
    expect(report.contextLineageContaminationCount).toBe(0);
    expect(report.duplicateEventCount).toBe(0);
    expect(adapter.calls).toBe(3);
    expect(result.messages.find((message) => message.safeRef === "D06")).toMatchObject({
      route: "RELATION_ONLY",
      extractionMode: "relation",
      relationIntent: { status: "resolved", targetRef: "D05" },
      events: [],
    });
    expect(result.sideEffectFree).toBe(true);
    expect(JSON.stringify(result)).not.toContain("金雞測試場");
  });

  it("runs Fresh Unseen FRESH-13 as new event plus independent relation", async () => {
    const fresh = groundTruth.fresh_unseen_cases.find((item) => item.case_id === "FRESH-13");
    if (!fresh) throw new Error("FRESH_13_MISSING");
    const selected = new Set(fresh.messages.map((message) => message.safe_ref));
    const messages = fresh.messages.map((message, index) => inputFor(message, index, selected));
    const adapter = fixtureAdapter(fresh.messages);
    const result = await runAmbientExtractionV2Batch({ messages, selectedRefs: selected, adapter, deterministicResolver: () => null });
    const report = evaluateAmbientExtractionV2(result, expectedFor(fresh.messages), selected);
    expect(report.overallPass).toBe(true);
    expect(report.eventCount).toBe(2);
    expect(report.relationCount).toBe(1);
    expect(result.messages.find((message) => message.safeRef === "F13-2")?.events).toHaveLength(1);
    expect(result.messages.find((message) => message.safeRef === "F13-2")?.relationIntent).toMatchObject({ targetRef: "F13-1", status: "resolved" });
  });

  it("keeps a transport failure isolated to one message with no same-run retry", async () => {
    let calls = 0;
    const adapter: AmbientV2AiAdapter = {
      name: "throwing-fixture",
      async run(_request, context) {
        calls += 1;
        if (context.safeRef === "D03") throw new Error("bounded provider failure");
        return JSON.stringify({ events: [{ event: "mortality", quantity: 2, detail: null }] });
      },
    };
    const result = await runAmbientExtractionV2Batch({
      messages: [
        { safeRef: "D02", sourceIdentity: "D02", text: "safe" },
        { safeRef: "D03", sourceIdentity: "D03", text: "safe" },
      ],
      selectedRefs: ["D02", "D03"],
      adapter,
      deterministicResolver: () => null,
    });
    expect(calls).toBe(2);
    expect(result.metrics.technicalFailures).toBe(1);
    expect(result.messages.find((message) => message.safeRef === "D02")?.events).toHaveLength(1);
    expect(result.messages.find((message) => message.safeRef === "D03")).toMatchObject({
      technicalStatus: "failure",
      semanticStatus: "unresolved",
      events: [],
    });
  });

  it("does not let malformed JSON from one message erase another", async () => {
    const adapter: AmbientV2AiAdapter = {
      name: "structural-fixture",
      async run(_request, context) {
        return context.safeRef === "BAD"
          ? "{\"events\":[{\"event\":\"mortality\",\"quantity\":2}"
          : JSON.stringify({ events: [{ event: "mortality", quantity: 1, detail: null }] });
      },
    };
    const result = await runAmbientExtractionV2Batch({
      messages: [
        { safeRef: "GOOD", sourceIdentity: "GOOD", text: "safe" },
        { safeRef: "BAD", sourceIdentity: "BAD", text: "safe" },
      ],
      selectedRefs: ["GOOD", "BAD"],
      adapter,
      deterministicResolver: () => null,
    });
    expect(result.messages[0]).toMatchObject({ structuralStatus: "pass", events: [{ event: "mortality", quantity: 1 }] });
    expect(result.messages[1]).toMatchObject({ structuralStatus: "fail", events: [] });
  });

  it("keeps relation detection active when a message also has a new event", async () => {
    const result = await runAmbientExtractionV2Batch({
      messages: [
        { safeRef: "OLD", sourceIdentity: "OLD", text: "淘汰2隻", groupKey: "g" },
        { safeRef: "NEW", sourceIdentity: "NEW", text: "又死1隻，前面淘汰兩隻那筆不是新增", groupKey: "g" },
      ],
      selectedRefs: ["OLD", "NEW"],
      deterministicResolver: (message) => message.safeRef === "OLD" ? [{ event: "cull", quantity: 2 }] : null,
      adapter: {
        name: "mixed-fixture",
        async run() { return JSON.stringify({ events: [{ event: "mortality", quantity: 1, detail: null }] }); },
      },
    });
    expect(result.messages.find((message) => message.safeRef === "NEW")).toMatchObject({
      route: "MIXED_EVENT_AND_RELATION",
      events: [{ event: "mortality", quantity: 1 }],
      relationIntent: { status: "resolved", targetRef: "OLD" },
    });
    expect(result.stagedEvents).toHaveLength(2);
  });
});

describe("Ambient Extraction V2 frozen fixture coverage", () => {
  it("keeps the 13 Fresh Unseen case categories and frozen expected content", () => {
    const categories = new Set(groundTruth.fresh_unseen_cases.map((item) => item.category));
    for (const category of [
      "simple_mortality",
      "simple_cull",
      "abnormal_unknown_quantity",
      "multi_event",
      "mixed_chat_event",
      "pure_chat_number",
      "ambiguous_farm_context",
      "support_relation",
      "duplicate_source_reference",
      "negative_statement",
      "mortality_unknown_quantity",
      "new_abnormal_wording",
      "mixed_new_event_and_relation",
    ]) expect(categories.has(category)).toBe(true);
    expect(groundTruth.fresh_unseen_cases.some((item) => item.case_id === "FRESH-13" && item.aggregate_expected.mixed_event_relation === true)).toBe(true);
  });

  it("supports the DEV-SMOKE-8 D04 two-event semantic expectation", async () => {
    const d04 = groundTruth.dev_smoke_8.messages.find((message) => message.safe_ref === "D04");
    if (!d04) throw new Error("D04_MISSING");
    const result = await runAmbientExtractionV2Batch({
      messages: [inputFor(d04, 0, new Set(["D04"]))],
      selectedRefs: ["D04"],
      deterministicResolver: () => null,
      adapter: { name: "d04-fixture", async run() { return responseFor(d04); } },
    });
    expect(result.stagedEvents.map(({ event, quantity, detail }) => ({ event, quantity, detail }))).toEqual(d04.expected.events);
  });
});
