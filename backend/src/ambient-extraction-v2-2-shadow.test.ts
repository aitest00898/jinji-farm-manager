import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runProductionAmbientExtraction } from "./index";
import {
  AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST_ENV,
  runAmbientV2_2Shadow,
  ambientV2_2ShadowGroupMatches,
  type AmbientV2_2ShadowTelemetry,
} from "./ambient-extraction-v2-2-shadow";
import { AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT } from "./ambient-extraction-v2-2";
import type { AmbientBufferedMessage, AmbientEnv, AmbientExtractionResult } from "./ambient";

const fakeDb = {
  get prepare() {
    throw new Error("shadow_must_not_access_db");
  },
} as unknown as D1Database;

function bufferedMessage(
  text: string,
  lineGroupId = "group-allowed",
  lineMessageId = "line-message-1",
): AmbientBufferedMessage {
  return {
    id: `buffer-${lineMessageId}`,
    organizationId: "org-test",
    lineGroupId,
    lineUserId: "user-test",
    lineMessageId,
    eventTimestamp: "2026-08-29T00:00:00.000Z",
    text,
    digestHour: "2026-08-29T00",
  };
}

function shadowEnv(run?: (model: string, input: Record<string, unknown>) => Promise<unknown>): AmbientEnv {
  return {
    DB: fakeDb,
    AI: run ? { run } as unknown as Ai : undefined,
  };
}

function providerResponse(response: unknown): unknown {
  return { success: true, result: { response } };
}

function v1Result(): AmbientExtractionResult {
  return { attempted: false, bundle: null, validation: "not_invoked" };
}

describe("Ambient V2.2 test-group Shadow", () => {
  it("uses one exact, fail-closed ordinary-group allowlist", () => {
    expect(AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST_ENV).toBe("AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST");
    expect(ambientV2_2ShadowGroupMatches("group-allowed", undefined)).toBe(false);
    expect(ambientV2_2ShadowGroupMatches("group-allowed", "")).toBe(false);
    expect(ambientV2_2ShadowGroupMatches("group-allowed", "   ")).toBe(false);
    expect(ambientV2_2ShadowGroupMatches("group-allowed", "group-other")).toBe(false);
    expect(ambientV2_2ShadowGroupMatches("group-allowed", "group-allowed-extra")).toBe(false);
    expect(ambientV2_2ShadowGroupMatches("prefix-group-allowed", "group-allowed")).toBe(false);
    expect(ambientV2_2ShadowGroupMatches("group-allowed", "group-allowed-suffix")).toBe(false);
    expect(ambientV2_2ShadowGroupMatches("group-allowed", "group-allowed*")).toBe(false);
    expect(ambientV2_2ShadowGroupMatches(null, "group-allowed")).toBe(false);
    expect(ambientV2_2ShadowGroupMatches("group-allowed", "group-other group-allowed")).toBe(true);
  });

  it("keeps the Shadow default-off and returns the unchanged V1 result", async () => {
    const run = vi.fn(async () => providerResponse({
      operations: [],
      abnormalities: [{ detail: "咳嗽", quantity: null }],
    }));
    const selected = [bufferedMessage("金雞測試場有咳嗽，數量還不確定")];
    const v1 = vi.fn(async (_env: AmbientEnv, _messages: AmbientBufferedMessage[]) => v1Result());
    const environment = shadowEnv(run);

    const result = await runProductionAmbientExtraction(
      {},
      environment,
      selected,
      v1,
    );

    expect(result).toEqual(v1Result());
    expect(v1.mock.calls[0]?.[0]).toBe(environment);
    expect(v1.mock.calls[0]?.[1]).toBe(selected);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not activate for a non-allowlisted ordinary group", async () => {
    const run = vi.fn(async () => providerResponse({ operations: [], abnormalities: [] }));
    const result = await runAmbientV2_2Shadow(
      shadowEnv(run),
      [bufferedMessage("金雞測試場有咳嗽", "group-other")],
      { groupId: "group-other", allowlist: "group-allowed" },
    );

    expect(result).toMatchObject({ enabled: false, allowlistMatch: false, providerAttempts: 0, telemetry: [] });
    expect(run).not.toHaveBeenCalled();
  });

  it("reaches the real ordinary Ambient extraction seam only for an allowlisted group", async () => {
    const run = vi.fn(async () => providerResponse({
      operations: [],
      abnormalities: [{ detail: "咳嗽", quantity: null }],
    }));
    const selected = [bufferedMessage("金雞測試場有咳嗽，數量還不確定")];
    const v1 = vi.fn(async (_env: AmbientEnv, _messages: AmbientBufferedMessage[]) => v1Result());
    const environment = shadowEnv(run);
    const v1Output = await runProductionAmbientExtraction(
      { AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST: "group-allowed" },
      environment,
      selected,
      v1,
    );

    expect(v1Output).toEqual(v1Result());
    expect(v1.mock.calls[0]?.[0]).toBe(environment);
    expect(v1.mock.calls[0]?.[1]).toBe(selected);
    expect(run).toHaveBeenCalledTimes(1);
    const source = readFileSync(resolve(import.meta.dirname, "index.ts"), "utf8");
    expect(source).toContain("if (gate === \"quiet\")");
    expect(source).toContain("bufferAmbientMessage");
    expect(source).toContain("runProductionAmbientDigest");
    expect(source).toContain("extract: (ambientEnv, messages) => runProductionAmbientExtraction(");
    expect(source).toContain("deferV1Terminal: true");
    expect(source).toContain("onGroupTerminal: emitV1Terminal");
    expect(source).toContain("runAmbientV2_2Shadow");
  });

  it("keeps deterministic D02/D05/D07-shaped messages at zero Shadow provider calls", async () => {
    const run = vi.fn(async () => providerResponse({ operations: [], abnormalities: [] }));
    const result = await runAmbientV2_2Shadow(
      shadowEnv(run),
      [
        bufferedMessage("金雞測試場剛剛死2隻", "group-allowed", "d02"),
        bufferedMessage("金雞測試場今天早上死3隻", "group-allowed", "d05"),
        bufferedMessage("我晚點去吃飯，金雞測試場剛剛又死1隻", "group-allowed", "d07"),
      ],
      { groupId: "group-allowed", allowlist: "group-allowed", emit: () => undefined },
    );

    expect(result.providerAttempts).toBe(0);
    expect(result.telemetry).toHaveLength(3);
    expect(result.telemetry.every((item) => item.ai_attempted === false)).toBe(true);
    expect(result.telemetry.every((item) => item.deterministic_operation_count === 1)).toBe(true);
  });

  it("keeps D06 relation-only local with no false new event or provider call", async () => {
    const run = vi.fn(async () => providerResponse({ operations: [], abnormalities: [] }));
    const result = await runAmbientV2_2Shadow(
      shadowEnv(run),
      [bufferedMessage("那個死亡3隻先記著，不是新增一筆")],
      { groupId: "group-allowed", allowlist: "group-allowed", emit: () => undefined },
    );

    expect(result.providerAttempts).toBe(0);
    expect(result.telemetry[0]).toMatchObject({
      route_class: "RELATION_ONLY",
      deterministic_operation_count: 0,
      operation_count: 0,
      ai_required: false,
      ai_attempted: false,
    });
  });

  it("keeps D04 deterministic cull and invokes the residual AI seam once", async () => {
    const run = vi.fn(async (_model: string, input: Record<string, unknown>) => {
      expect(input.response_format).toEqual(AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT);
      expect(input.max_tokens).toBe(1536);
      expect(input.temperature).toBe(0);
      expect(input.stream).toBe(false);
      return providerResponse({
        operations: [],
        abnormalities: [{ detail: "腳傷", quantity: null }],
      });
    });
    const result = await runAmbientV2_2Shadow(
      shadowEnv(run),
      [bufferedMessage("金雞測試場今天淘汰2隻，腳傷")],
      { groupId: "group-allowed", allowlist: "group-allowed", emit: () => undefined },
    );

    expect(run).toHaveBeenCalledTimes(1);
    expect(result.providerAttempts).toBe(1);
    expect(result.telemetry[0]).toMatchObject({
      route_class: "EVENT_ONLY",
      deterministic_operation_count: 1,
      ai_required: true,
      ai_attempted: true,
      response_class: "STRUCTURED_OBJECT_RESPONSE",
      structural_status: "PASS",
      semantic_status: "resolved",
      operation_count: 1,
      abnormality_count: 1,
      safe_failure_class: null,
      production_v1_unchanged: true,
    });
  });

  it("contains provider and structural failures without reaching V1", async () => {
    const providerRun = vi.fn(async () => {
      throw new Error("provider-secret-like-message");
    });
    const providerTelemetry: AmbientV2_2ShadowTelemetry[] = [];
    const providerFailure = await runAmbientV2_2Shadow(
      shadowEnv(providerRun),
      [bufferedMessage("金雞測試場有咳嗽")],
      { groupId: "group-allowed", allowlist: "group-allowed", emit: (item) => providerTelemetry.push(item) },
    );
    expect(providerFailure.providerAttempts).toBe(1);
    expect(providerFailure.telemetry[0]).toMatchObject({
      ai_attempted: true,
      structural_status: "NOT_RUN",
      safe_failure_class: "PROVIDER_FAILURE",
    });
    expect(JSON.stringify(providerTelemetry)).not.toContain("provider-secret-like-message");

    const structuralRun = vi.fn(async () => providerResponse({ operations: [] }));
    const structuralFailure = await runAmbientV2_2Shadow(
      shadowEnv(structuralRun),
      [bufferedMessage("金雞測試場有咳嗽")],
      { groupId: "group-allowed", allowlist: "group-allowed", emit: () => undefined },
    );
    expect(structuralFailure.telemetry[0]).toMatchObject({
      response_class: "STRUCTURED_OBJECT_RESPONSE",
      structural_status: "FAIL",
      safe_failure_class: "ABNORMALITIES_MISSING",
    });
  });

  it("keeps text and provider JSON-mode responses in bounded classes", async () => {
    const textRun = vi.fn(async () => providerResponse('{"operations":[],"abnormalities":[]}'));
    const textResult = await runAmbientV2_2Shadow(
      shadowEnv(textRun),
      [bufferedMessage("金雞測試場有咳嗽")],
      { groupId: "group-allowed", allowlist: "group-allowed", emit: () => undefined },
    );
    expect(textResult.telemetry[0]).toMatchObject({
      response_class: "PROMPT_TEXT_RESPONSE",
      structural_status: "PASS",
      semantic_status: "none",
    });

    const errorRun = vi.fn(async () => ({
      success: false,
      errors: [{ code: 4000, message: "JSON Mode could not be met" }],
    }));
    const errorResult = await runAmbientV2_2Shadow(
      shadowEnv(errorRun),
      [bufferedMessage("金雞測試場有咳嗽")],
      { groupId: "group-allowed", allowlist: "group-allowed", emit: () => undefined },
    );
    expect(errorResult.telemetry[0]).toMatchObject({
      response_class: "PROVIDER_JSON_MODE_ERROR",
      structural_status: "FAIL",
      safe_failure_class: "PROVIDER_JSON_MODE_ERROR",
    });
  });

  it("keeps bounded Shadow telemetry free of source, detail, group, and provider text", async () => {
    const sourceText = "SHADOW_SOURCE_RAW_SHOULD_NOT_PERSIST";
    const detailText = "SHADOW_DETAIL_RAW_SHOULD_NOT_PERSIST";
    const groupId = "group-privacy-only";
    const emitted: AmbientV2_2ShadowTelemetry[] = [];
    const run = vi.fn(async () => providerResponse({
      operations: [],
      abnormalities: [{ detail: detailText, quantity: null }],
    }));
    await runAmbientV2_2Shadow(
      shadowEnv(run),
      [bufferedMessage(sourceText, groupId)],
      { groupId, allowlist: groupId, emit: (item) => emitted.push(item) },
    );

    const bounded = JSON.stringify(emitted);
    expect(bounded).not.toContain(sourceText);
    expect(bounded).not.toContain(detailText);
    expect(bounded).not.toContain(groupId);
    expect(bounded).not.toContain("provider-secret-like-message");
    expect(bounded).not.toContain("completion");
    expect(bounded).not.toContain("prompt");
    expect(emitted[0]).toMatchObject({ production_v1_unchanged: true });
  });

  it("preserves the V1 observable result with Shadow disabled or enabled", async () => {
    const run = vi.fn(async () => providerResponse({
      operations: [],
      abnormalities: [{ detail: "咳嗽", quantity: null }],
    }));
    const selected = [bufferedMessage("金雞測試場有咳嗽")];
    const offResult = v1Result();
    const onResult = v1Result();
    const off = await runProductionAmbientExtraction(
      {},
      shadowEnv(run),
      selected,
      async () => offResult,
    );
    const on = await runProductionAmbientExtraction(
      { AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST: "group-allowed" },
      shadowEnv(run),
      selected,
      async () => onResult,
    );

    expect(off).toBe(offResult);
    expect(on).toBe(onResult);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("correlates Shadow entry, Shadow terminal, and V1 completion for one run", async () => {
    const emitted: AmbientV2_2ShadowTelemetry[] = [];
    const run = vi.fn(async () => providerResponse({
      operations: [],
      abnormalities: [{ detail: "咳嗽", quantity: null }],
    }));
    await runProductionAmbientExtraction(
      { AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST: "group-allowed" },
      shadowEnv(run),
      [bufferedMessage("金雞測試場有咳嗽")],
      async () => v1Result(),
      (item) => emitted.push(item),
    );

    expect(emitted.map((item) => item.phase)).toEqual([
      "SHADOW_ENTERED",
      "SHADOW_TERMINAL",
      "V1_TERMINAL",
    ]);
    expect(new Set(emitted.map((item) => item.correlation_id)).size).toBe(1);
    expect(emitted.at(-1)).toMatchObject({
      phase: "V1_TERMINAL",
      v1_terminal_status: "COMPLETED",
      safe_failure_class: null,
    });
  });

  it("creates a new opaque correlation for each eligible run", async () => {
    const emitted: AmbientV2_2ShadowTelemetry[] = [];
    const run = vi.fn(async () => providerResponse({ operations: [], abnormalities: [] }));
    const environment = { AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST: "group-allowed" };
    await runProductionAmbientExtraction(environment, shadowEnv(run), [bufferedMessage("金雞測試場有咳嗽")], async () => v1Result(), (item) => emitted.push(item));
    await runProductionAmbientExtraction(environment, shadowEnv(run), [bufferedMessage("金雞測試場有咳嗽", "group-allowed", "line-message-2")], async () => v1Result(), (item) => emitted.push(item));

    const entries = emitted.filter((item) => item.phase === "SHADOW_ENTERED");
    expect(entries).toHaveLength(2);
    expect(entries[0]?.correlation_id).toBeTruthy();
    expect(entries[0]?.correlation_id).not.toBe(entries[1]?.correlation_id);
  });

  it("does not create correlation telemetry when Shadow is disabled or not allowlisted", async () => {
    const emitted: AmbientV2_2ShadowTelemetry[] = [];
    const run = vi.fn(async () => providerResponse({ operations: [], abnormalities: [] }));
    const selected = [bufferedMessage("金雞測試場有咳嗽")];
    await runProductionAmbientExtraction({}, shadowEnv(run), selected, async () => v1Result(), (item) => emitted.push(item));
    await runProductionAmbientExtraction(
      { AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST: "group-other" },
      shadowEnv(run),
      selected,
      async () => v1Result(),
      (item) => emitted.push(item),
    );

    expect(emitted).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("proves Shadow provider failure still reaches V1 completion on the same run", async () => {
    const emitted: AmbientV2_2ShadowTelemetry[] = [];
    const providerRun = vi.fn(async () => { throw new Error("shadow-provider-private"); });
    await runProductionAmbientExtractionForTest(
      providerRun,
      emitted,
      async () => v1Result(),
    );

    const correlationIds = new Set(emitted.map((item) => item.correlation_id));
    expect(correlationIds.size).toBe(1);
    expect(emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: "SHADOW_TERMINAL", shadow_terminal_status: "FAILED", safe_failure_class: "PROVIDER_FAILURE" }),
      expect.objectContaining({ phase: "V1_TERMINAL", v1_terminal_status: "COMPLETED" }),
    ]));
    expect(JSON.stringify(emitted)).not.toContain("shadow-provider-private");
  });

  it("proves Shadow structural failure still reaches V1 completion", async () => {
    const emitted: AmbientV2_2ShadowTelemetry[] = [];
    const providerRun = vi.fn(async () => providerResponse({ operations: [] }));
    await runProductionAmbientExtractionForTest(
      providerRun,
      emitted,
      async () => v1Result(),
    );

    expect(emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: "SHADOW_TERMINAL", shadow_terminal_status: "FAILED", structural_status: "FAIL" }),
      expect.objectContaining({ phase: "V1_TERMINAL", v1_terminal_status: "COMPLETED" }),
    ]));
  });

  it("keeps deterministic and relation-only runs correlated without AI", async () => {
    const emitted: AmbientV2_2ShadowTelemetry[] = [];
    const run = vi.fn(async () => providerResponse({ operations: [], abnormalities: [] }));
    const environment = { AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST: "group-allowed" };
    await runProductionAmbientExtraction(environment, shadowEnv(run), [bufferedMessage("金雞測試場剛剛死2隻")], async () => v1Result(), (item) => emitted.push(item));
    await runProductionAmbientExtraction(environment, shadowEnv(run), [bufferedMessage("那個死亡3隻先記著，不是新增一筆", "group-allowed", "relation")], async () => v1Result(), (item) => emitted.push(item));

    const shadowTerminals = emitted.filter((item) => item.phase === "SHADOW_TERMINAL");
    expect(shadowTerminals).toHaveLength(2);
    expect(shadowTerminals.every((item) => item.ai_attempted === false)).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect(emitted.filter((item) => item.phase === "V1_TERMINAL").every((item) => item.v1_terminal_status === "COMPLETED")).toBe(true);
  });

  it("records V1 failure without changing its propagation", async () => {
    const emitted: AmbientV2_2ShadowTelemetry[] = [];
    const v1Error = new Error("v1-private-error");
    await expect(runProductionAmbientExtraction(
      { AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST: "group-allowed" },
      shadowEnv(),
      [bufferedMessage("金雞測試場有咳嗽")],
      async () => { throw v1Error; },
      (item) => emitted.push(item),
    )).rejects.toBe(v1Error);

    expect(emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: "V1_TERMINAL", v1_terminal_status: "FAILED", safe_failure_class: "V1_FAILURE" }),
    ]));
    expect(JSON.stringify(emitted)).not.toContain("v1-private-error");
  });

  it("keeps the live tail event family queryable with phase and correlation", () => {
    const source = readFileSync(resolve(import.meta.dirname, "ambient-extraction-v2-2-shadow.ts"), "utf8");
    expect(source).toContain('event: "ambient_v2_2_shadow"');
    expect(source).toContain("phase");
    expect(source).toContain("correlation_id");
  });

  it("does not add a semantic dedupe or business-write seam", () => {
    const shadowSource = readFileSync(resolve(import.meta.dirname, "ambient-extraction-v2-2-shadow.ts"), "utf8");
    expect(shadowSource).not.toContain("collapseAmbientV2_2TechnicalDuplicates");
    expect(shadowSource).not.toContain("pushLine");
    expect(shadowSource).not.toContain("env.DB");
  });
});

async function runProductionAmbientExtractionForTest(
  providerRun: (model: string, input: Record<string, unknown>) => Promise<unknown>,
  emitted: AmbientV2_2ShadowTelemetry[],
  v1: NonNullable<Parameters<typeof runProductionAmbientExtraction>[3]>,
): Promise<void> {
  await runProductionAmbientExtraction(
    { AMBIENT_V2_2_SHADOW_GROUP_ALLOWLIST: "group-allowed" },
    shadowEnv(providerRun),
    [bufferedMessage("金雞測試場有咳嗽")],
    v1,
    (item) => emitted.push(item),
  );
}
