import { describe, expect, it, vi } from "vitest";
import {
  ambientCandidateIdForTest,
  AMBIENT_AI_MAX_TOKENS,
  AMBIENT_AI_EXTRACTION_ALLOWED_KEYS,
  AMBIENT_AI_EXTRACTION_ITEM_ALLOWED_KEYS,
  AMBIENT_AI_EXTRACTION_JSON_SCHEMA,
  classifyAmbientJsonSyntaxError,
  ambientHourBucket,
  ambientMessageMayBeRelevant,
  ambientPrefilter,
  ambientPrompt,
  ambientPromptSourceRefsForTest,
  ambientSelectionForTest,
  estimateAmbientAiExtractionSize,
  extractAmbientCandidates,
  interactionGateDecision,
  previousAmbientHourBucket,
  reconcileAmbientCandidate,
  stripSelfMention,
  normalizeAmbientAiExtraction,
  validateAmbientCandidateBundle,
} from "./ambient";

describe("quiet group interaction gate", () => {
  it("keeps ordinary record-like text quiet", () => {
    expect(interactionGateDecision({ eventType: "message" })).toBe("quiet");
    expect(interactionGateDecision({ eventType: "message", isSystemCommand: false })).toBe("quiet");
  });

  it("wakes on mention, postback, system command, active session, or pending", () => {
    expect(interactionGateDecision({ eventType: "message", hasMention: true })).toBe("explicit");
    expect(interactionGateDecision({ eventType: "postback" })).toBe("explicit");
    expect(interactionGateDecision({ eventType: "message", isSystemCommand: true })).toBe("explicit");
    expect(interactionGateDecision({ eventType: "message", hasActiveSession: true })).toBe("active");
    expect(interactionGateDecision({ eventType: "message", hasPendingState: true })).toBe("active");
  });

  it("strips only the validated self mention span", () => {
    expect(stripSelfMention("@金雞協會助理Ai 金雞測試場死亡5 咳嗽", [{ index: 0, length: 10, isSelf: true }])).toBe("金雞測試場死亡5 咳嗽");
    expect(stripSelfMention("@別人 死亡5", [{ index: 0, length: 3, isSelf: false }])).toBe("@別人 死亡5");
    expect(stripSelfMention("@Bot 死亡5", [{ index: 0, length: 99, isSelf: true }])).toBe("@Bot 死亡5");
  });
});

describe("Ambient model-owned extraction contract", () => {
  it("projects system-owned fields out before strict candidate validation", () => {
    const normalized = normalizeAmbientAiExtraction({
      decisions: [{
        ref: "m1",
        kind: "event",
        type: "mortality",
        quantity: 2,
        quantityConfidence: "high",
        raw: "死2隻",
        confidence: "high",
        farmText: "金雞測試場",
        sourceMessageIds: ["private-source-id"],
        sourceTimestamps: ["2026-08-20T12:00:00.000Z"],
        sourceUsers: ["private-user-id"],
        evidence: [{ field: "private", normalizedValue: "private" }],
        resolution: { status: "resolved" },
        reconciliation: { status: "not_recorded" },
        state: "new",
      }],
      sourceMessageIds: ["private-bundle-source"],
    }) as { decisions: Array<Record<string, unknown>> };
    expect(Object.keys(normalized).sort()).toEqual(["decisions"]);
    expect(Object.keys(normalized.decisions[0] ?? {}).sort()).toEqual([
      "confidence", "farmText", "kind", "quantity", "quantityConfidence", "raw", "ref", "type",
    ]);
    expect(normalized.decisions[0]).not.toHaveProperty("sourceMessageIds");
    expect(normalized.decisions[0]).not.toHaveProperty("evidence");
    expect(normalized.decisions[0]).not.toHaveProperty("reconciliation");
    expect(normalized.decisions[0]).not.toHaveProperty("conflict");
    expect(AMBIENT_AI_EXTRACTION_ALLOWED_KEYS).not.toContain("sourceMessageIds" as never);
    expect(AMBIENT_AI_EXTRACTION_ITEM_ALLOWED_KEYS).not.toContain("sourceMessageIds" as never);
  });

  it("leaves conflict construction to system enrichment", async () => {
    const run = vi.fn(async () => ({
      response: JSON.stringify({
        decisions: [{
          ref: "m1",
          kind: "event",
          type: "mortality",
          quantity: 2,
          quantityConfidence: "high",
          raw: "死2隻",
          confidence: "high",
          farmText: "金雞測試場",
        }],
      }),
    }));
    const result = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [{
      id: "system-conflict-boundary",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "system-conflict-line-message",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場死亡2隻",
      digestHour: "2026-08-20T20:00:00+08:00",
    }]);
    expect(result.validation).toBe("schema_valid");
    expect(result.bundle?.candidates[0]?.conflict).toBe(false);
  });

  it("keeps the compact contract well below the current bounded budget", () => {
    const estimate = estimateAmbientAiExtractionSize({ candidateCount: 1, itemCount: 3, sourceRelationshipCount: 6 });
    expect(estimate.sourceRelationshipCount).toBe(6);
    expect(estimate.safeUpperChars).toBeLessThan(1536 * 4);
    expect(estimate.estimatedSafeTokens).toBeLessThan(1536);
    expect(estimate.typicalChars).toBeLessThan(estimate.safeUpperChars);
  });

  it("uses one compact system contract without requesting persistence fields", async () => {
    let request: Record<string, unknown> | undefined;
    const run = vi.fn(async (_model: string, input: Record<string, unknown>) => {
      request = input;
      return { response: JSON.stringify({ decisions: [{ ref: "m1", kind: "ignore" }] }) };
    });
    await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [{
      id: "contract-message",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "contract-line-message",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場死亡2隻",
      digestHour: "2026-08-20T20:00:00+08:00",
    }]);
    const messages = request?.messages as Array<{ role: string; content: string }>;
    expect(messages[0]?.content).toContain("不要輸出系統欄位");
    expect(messages[1]?.content).toContain("最多160字");
    expect(messages[1]?.content).not.toContain("sourceMessageIds");
  });

  it("declares a provider schema that excludes persisted system fields", () => {
    const decisionSchema = AMBIENT_AI_EXTRACTION_JSON_SCHEMA.properties.decisions.items as unknown as {
      anyOf: ReadonlyArray<{
        required: readonly string[];
        properties: Record<string, { minLength?: number; maxLength?: number; enum?: readonly string[] }>;
      }>;
    };
    const eventSchema = decisionSchema.anyOf[0];
    expect(AMBIENT_AI_EXTRACTION_JSON_SCHEMA.required).toEqual(["decisions"]);
    expect(eventSchema.required).toEqual(["ref", "kind", "type", "quantity", "quantityConfidence", "raw", "confidence"]);
    expect(eventSchema.properties).not.toHaveProperty("sourceMessageIds");
    expect(eventSchema.properties).not.toHaveProperty("evidence");
    expect(eventSchema.properties.raw).toMatchObject({ minLength: 1, maxLength: 160 });
    expect(eventSchema.properties.confidence.enum).toEqual(["low", "medium", "high"]);
  });
});

describe("ambient prefilter and candidate validation", () => {
  it("rejects generic weather chat but keeps contextual chicken information", () => {
    expect(ambientMessageMayBeRelevant("今天真的很熱")).toBe(false);
    expect(ambientMessageMayBeRelevant("我一直咳嗽")).toBe(false);
    expect(ambientMessageMayBeRelevant("金雞測試場今天真的很熱")).toBe(true);
    expect(ambientMessageMayBeRelevant("林楷威場好像死5隻")).toBe(true);
    expect(ambientPrefilter([
      { id: "1", organizationId: "o", lineGroupId: "g", lineUserId: "u", lineMessageId: "m1", eventTimestamp: "2026-08-20T12:00:00.000Z", text: "晚點吃什麼", digestHour: "h" },
      { id: "2", organizationId: "o", lineGroupId: "g", lineUserId: "u", lineMessageId: "m2", eventTimestamp: "2026-08-20T12:01:00.000Z", text: "金雞測試場好像有咳嗽", digestHour: "h" },
    ]).map((item) => item.lineMessageId)).toEqual(["m2"]);
  });

  it("uses Taipei hour buckets and previous complete hour", () => {
    expect(ambientHourBucket("2026-08-20T13:00:00.000Z")).toBe("2026-08-20T21:00:00+08:00");
    expect(previousAmbientHourBucket("2026-08-20T13:00:00.000Z")).toBe("2026-08-20T20:00:00+08:00");
  });

  it("assigns request-local refs and selected markers without exposing source IDs", () => {
    const refs = ambientPromptSourceRefsForTest([
      {
        id: "row-chat",
        organizationId: "o",
        lineGroupId: "g",
        lineUserId: "u",
        lineMessageId: "private-chat-id",
        eventTimestamp: "2026-08-20T12:00:00.000Z",
        text: "晚點吃什麼",
        digestHour: "h",
      },
      {
        id: "row-event",
        organizationId: "o",
        lineGroupId: "g",
        lineUserId: "u",
        lineMessageId: "private-event-id",
        eventTimestamp: "2026-08-20T12:01:00.000Z",
        text: "金雞測試場死亡2隻",
        digestHour: "h",
      },
    ]);
    expect(refs).toEqual([{ ref: "m1", selected: false }, { ref: "m2", selected: true }]);
    expect(JSON.stringify(refs)).not.toContain("private-");
  });

  it("accounts every selected ref and maps item refs back to system lineage", async () => {
    const messages = ["死亡2", "死亡3", "咳嗽", "淘汰2", "死亡1", "臭腳"].map((text, index) => ({
      id: `row-${index + 1}`,
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: `u-${index + 1}`,
      lineMessageId: `private-event-${index + 1}`,
      eventTimestamp: `2026-08-20T12:0${index}:00.000Z`,
      text: `金雞測試場${text}`,
      digestHour: "h",
    }));
    const run = vi.fn(async () => ({
      response: JSON.stringify({
        decisions: [
          { ref: "m1", kind: "event", type: "mortality", quantity: 2, quantityConfidence: "high", raw: "死亡2", confidence: "high", farmText: "金雞測試場" },
          { ref: "m2", kind: "event", type: "mortality", quantity: 3, quantityConfidence: "high", raw: "死亡3", confidence: "high", farmText: "金雞測試場" },
          { ref: "m3", kind: "event", type: "abnormal", quantity: null, quantityConfidence: "unknown", raw: "咳嗽", confidence: "medium", farmText: "金雞測試場" },
          { ref: "m4", kind: "event", type: "cull", quantity: 2, quantityConfidence: "high", raw: "淘汰2", confidence: "high", farmText: "金雞測試場" },
          { ref: "m5", kind: "event", type: "mortality", quantity: 1, quantityConfidence: "high", raw: "死亡1", confidence: "high", farmText: "金雞測試場" },
          { ref: "m6", kind: "event", type: "abnormal", quantity: null, quantityConfidence: "unknown", raw: "臭腳", confidence: "low", farmText: "金雞測試場" },
        ],
      }),
    }));
    const result = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, messages);
    expect(result.validation).toBe("schema_valid");
    expect(result.sourceCoverage).toMatchObject({
      selectedSourceCount: 6,
      accountedSelectedSourceCount: 6,
      unaccountedSelectedSourceCount: 0,
      selectedSourceCoverageStatus: "pass",
    });
    expect(result.bundle?.candidates[0]?.sourceMessageIds).toEqual(messages.map((message) => message.lineMessageId));
    expect(result.bundle?.candidates[0]?.items[0]).not.toHaveProperty("sourceRefs");
    expect(result.bundle?.candidates[0]?.evidence?.[0]?.sourceRef).toBe("private-event-1");
    expect(result.transportDiagnostics).toMatchObject({ accountedSelectedSourceCount: 6, unaccountedSelectedSourceCount: 0 });
  });

  it("makes one decision per selected source and builds support into one event lineage", async () => {
    const messages = [
      "今天雞排一份85元",
      "金雞測試場剛剛死2隻",
      "金雞測試場有幾隻一直咳，數量還不確定",
      "金雞測試場今天淘汰2隻，腳傷",
      "金雞測試場今天早上死3隻",
      "那個死亡3隻先記著，不是新增一筆",
      "我晚點去吃飯，金雞測試場剛剛又死1隻",
      "4個人",
    ].map((text, index) => ({
      id: `smoke-row-${index + 1}`,
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: `smoke-${index + 1}`,
      eventTimestamp: `2026-08-20T12:${String(index).padStart(2, "0")}:00.000Z`,
      text,
      digestHour: "h",
    }));
    const run = vi.fn(async () => ({
      response: JSON.stringify({
        decisions: [
          { ref: "m2", kind: "event", type: "mortality", quantity: 2, quantityConfidence: "high", raw: "死2隻", confidence: "high", farmText: "金雞測試場" },
          { ref: "m3", kind: "event", type: "abnormal", quantity: null, quantityConfidence: "unknown", raw: "一直咳", confidence: "low", farmText: "金雞測試場" },
          { ref: "m4", kind: "event", type: "cull", quantity: 2, quantityConfidence: "high", raw: "淘汰2隻", confidence: "high", farmText: "金雞測試場" },
          { ref: "m5", kind: "event", type: "mortality", quantity: 3, quantityConfidence: "high", raw: "死3隻", confidence: "high", farmText: "金雞測試場" },
          { ref: "m6", kind: "support", targetRef: "m5" },
          { ref: "m7", kind: "event", type: "mortality", quantity: 1, quantityConfidence: "high", raw: "死1隻", confidence: "high", farmText: "金雞測試場" },
        ],
      }),
    }));
    const result = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, messages);
    expect(result.validation).toBe("schema_valid");
    expect(result.sourceCoverage).toMatchObject({
      selectedSourceCount: 6,
      accountedSelectedSourceCount: 6,
      unaccountedSelectedSourceCount: 0,
      supportingSourceCount: 1,
      decisionCount: 6,
      eventDecisionCount: 5,
      supportDecisionCount: 1,
      ignoreDecisionCount: 0,
      selectedSourceCoverageStatus: "pass",
    });
    expect(result.bundle?.candidates).toHaveLength(1);
    expect(result.bundle?.candidates[0]?.items.map((item) => [item.type, item.quantity])).toEqual([
      ["mortality", 2],
      ["abnormal", null],
      ["cull", 2],
      ["mortality", 3],
      ["mortality", 1],
    ]);
    expect(result.bundle?.candidates[0]?.sourceMessageIds).toEqual(["smoke-2", "smoke-3", "smoke-4", "smoke-5", "smoke-6", "smoke-7"]);
    expect(result.bundle?.sourceMessageIds).not.toContain("smoke-1");
    expect(result.bundle?.sourceMessageIds).not.toContain("smoke-8");
    expect(result.bundle?.candidates[0]?.evidence?.filter((item) => item.normalizedValue === 3).map((item) => item.sourceRef)).toEqual(["smoke-5", "smoke-6"]);
  });

  it("rejects a silent selected-source drop before candidate persistence", async () => {
    const run = vi.fn(async () => ({
      response: JSON.stringify({
        decisions: [{ ref: "m1", kind: "event", type: "mortality", quantity: 2, quantityConfidence: "high", raw: "死亡2", confidence: "high", farmText: "金雞測試場" }],
      }),
    }));
    const messages = ["死亡2", "死亡3"].map((text, index) => ({
      id: `row-${index + 1}`,
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: `coverage-${index + 1}`,
      eventTimestamp: `2026-08-20T12:0${index}:00.000Z`,
      text: `金雞測試場${text}`,
      digestHour: "h",
    }));
    const result = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, messages);
    expect(result.validation).toBe("schema_invalid");
    expect(result.bundle).toBeNull();
    expect(result.errorClass).toBe("source_decision_missing");
    expect(result.sourceCoverage).toMatchObject({
      selectedSourceCount: 2,
      accountedSelectedSourceCount: 1,
      unaccountedSelectedSourceCount: 1,
      selectedSourceCoverageStatus: "failed",
      unaccountedSourceOrdinals: ["02"],
    });
    expect(result.validationDiagnostics).toMatchObject({
      firstIssueCode: "SOURCE_DECISION_MISSING",
      firstIssuePath: "decisions",
    });
    expect(result.transportDiagnostics?.firstBadSemanticStage).toBe("AI_EXTRACTION_COVERAGE");
    expect(result.transportDiagnostics?.unaccountedSourceOrdinals).toEqual(["02"]);
    expect(JSON.stringify(result.transportDiagnostics)).not.toContain("coverage-2");
  });

  it("allows ignored selected refs and rejects context refs as decisions", async () => {
    const ignoredRun = vi.fn(async () => ({ response: JSON.stringify({ decisions: [{ ref: "m1", kind: "ignore" }] }) }));
    const selectedMessage = {
      id: "selected-row",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "selected-id",
      eventTimestamp: "2026-08-20T12:01:00.000Z",
      text: "金雞測試場死亡2隻",
      digestHour: "h",
    };
    const ignored = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run: ignoredRun } as unknown as Ai }, [selectedMessage]);
    expect(ignored.validation).toBe("schema_valid");
    expect(ignored.bundle?.candidates).toHaveLength(0);
    expect(ignored.sourceCoverage?.ignoredSelectedSourceCount).toBe(1);

    const contextRun = vi.fn(async () => ({
      response: JSON.stringify({
        decisions: [{ ref: "m1", kind: "event", type: "mortality", quantity: 2, quantityConfidence: "high", raw: "死亡2", confidence: "high" }],
      }),
    }));
    const contextMessage = {
      id: "context-row",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "context-id",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "晚點吃飯",
      digestHour: "h",
    };
    const contextual = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run: contextRun } as unknown as Ai }, [contextMessage, selectedMessage]);
    expect(contextual.validation).toBe("schema_invalid");
    expect(contextual.errorClass).toBe("invalid_context_decision_ref");
    expect(contextual.sourceCoverage).toMatchObject({ selectedSourceCount: 1, accountedSelectedSourceCount: 0, unaccountedSelectedSourceCount: 1 });
  });

  it("rejects unknown and empty request-local refs", async () => {
    let call = 0;
    const run = vi.fn(async () => {
      call += 1;
      const ref = call === 1 ? "m9" : undefined;
      return {
        response: JSON.stringify({
          decisions: ref
            ? [{ ref, kind: "event", type: "mortality", quantity: 2, quantityConfidence: "high", raw: "死亡2", confidence: "high" }]
            : [],
        }),
      };
    });
    const message = {
      id: "ref-row",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "ref-id",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場死亡2隻",
      digestHour: "h",
    };
    const unknown = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [message]);
    expect(unknown.validation).toBe("schema_invalid");
    expect(unknown.errorClass).toBe("unknown_source_reference");
    expect(unknown.sourceCoverage?.selectedSourceCoverageStatus).toBe("failed");
    const empty = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [message]);
    expect(empty.validation).toBe("schema_invalid");
    expect(empty.errorClass).toBe("source_decision_missing");
  });

  it("keeps decision error classes distinct and enforces bounded optional clues", async () => {
    const message = {
      id: "decision-error-row",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "decision-error-id",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場死亡2隻",
      digestHour: "h",
    };
    const runWith = (response: unknown) => vi.fn(async () => ({ response: JSON.stringify(response) }));

    const duplicate = await extractAmbientCandidates({
      DB: {} as D1Database,
      AI: { run: runWith({ decisions: [
        { ref: "m1", kind: "ignore" },
        { ref: "m1", kind: "ignore" },
      ] }) } as unknown as Ai,
    }, [message]);
    expect(duplicate.errorClass).toBe("duplicate_source_decision");

    const invalidSupport = await extractAmbientCandidates({
      DB: {} as D1Database,
      AI: { run: runWith({ decisions: [{ ref: "m1", kind: "support", targetRef: "m2" }] }) } as unknown as Ai,
    }, [message]);
    expect(invalidSupport.errorClass).toBe("invalid_support_target");

    const overlongClue = await extractAmbientCandidates({
      DB: {} as D1Database,
      AI: { run: runWith({ decisions: [{
        ref: "m1",
        kind: "event",
        type: "mortality",
        quantity: 2,
        quantityConfidence: "high",
        raw: "死亡2",
        confidence: "high",
        farmText: "x".repeat(161),
      }] }) } as unknown as Ai,
    }, [message]);
    expect(overlongClue.errorClass).toBe("invalid_event_schema");
  });

  it("keeps same-hour source batches on distinct durable candidate ids", () => {
    const first = ambientCandidateIdForTest("group", "2026-08-20T20:00:00+08:00", ["m-a"]);
    const retry = ambientCandidateIdForTest("group", "2026-08-20T20:00:00+08:00", ["m-a"]);
    const second = ambientCandidateIdForTest("group", "2026-08-20T20:00:00+08:00", ["m-b"]);
    expect(first).toBe(retry);
    expect(first).not.toBe(second);
  });

  it("accepts strict candidate JSON and rejects unsafe shapes", () => {
    expect(validateAmbientCandidateBundle({
      candidates: [{
        farmText: "金雞測試場",
        houseText: "測試1舍",
        flockText: null,
        conflict: false,
        items: [
          { type: "mortality", quantity: 5, raw: "剛剛好像死5隻", confidence: "medium" },
          { type: "abnormal", quantity: null, raw: "咳嗽", confidence: "high", mentionCount: 2 },
        ],
      }],
    })?.candidates[0]?.items).toHaveLength(2);
    expect(validateAmbientCandidateBundle({
      candidates: [{ farmText: "金雞測試場", conflict: false, items: [{ type: "mortality", quantity: 0, raw: "死亡0", confidence: "high" }] }],
    })).toBeNull();
    expect(validateAmbientCandidateBundle({
      candidates: [{ farmText: "金雞測試場", conflict: true, items: [{ type: "abnormal", quantity: null, raw: "咳嗽", confidence: "high" }] }],
    })?.candidates[0]?.conflict).toBe(true);
    const unresolved = validateAmbientCandidateBundle({
      candidates: [{
        eventType: "mortality",
        quantity: null,
        quantityConfidence: "unknown",
        farmText: null,
        caretakerText: "林志騰",
        houseText: null,
        flockText: null,
        rawTexts: ["死亡5", "林志騰"],
        uncertainties: ["farm_not_uniquely_resolved"],
        conflicts: [],
      }],
    });
    expect(unresolved?.candidates[0]?.caretakerText).toBe("林志騰");
    expect(unresolved?.candidates[0]?.items[0]?.quantity).toBeNull();
  });

  it("keeps uncertainty as a successful candidate state", () => {
    const candidate = validateAmbientCandidateBundle({
      candidates: [{
        eventType: "mortality",
        quantity: 5,
        quantityConfidence: "high",
        farmText: null,
        caretakerText: "林志騰",
        rawTexts: ["死亡5", "林志騰"],
        uncertainties: ["farm_not_uniquely_resolved"],
        conflicts: [],
      }],
    })?.candidates[0];
    expect(candidate).toBeTruthy();
    const result = reconcileAmbientCandidate(candidate!, [], [{
      id: "ambient-1",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "m1",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "死亡5",
      digestHour: "h",
    }]);
    expect(result.reconciliation?.status).toBe("not_recorded");
    expect(result.state).toBe("unresolved_entity");

    const persisted = validateAmbientCandidateBundle({
      candidates: [{
        ...candidate!,
        resolution: {
          status: "ambiguous",
          caretakerId: null,
          caretakerText: "林志騰",
          resolvedFarmId: null,
          candidateFarmIds: ["farm-erlin", "farm-dongshi"],
          candidateFarmNames: ["林志騰二林場", "林志騰東勢場"],
        },
        reconciliation: {
          status: "possibly_recorded",
          matchingOfficialRecordIds: ["official-1"],
          matchReasons: ["時間接近"],
          matchConfidence: "medium",
          matchingOfficialRecords: [{
            farmName: "林志騰二林場",
            eventType: "mortality",
            quantity: 5,
            occurredAt: "2026-08-20T12:04:00.000Z",
            recordKind: "operational",
          }],
        },
        state: "possibly_recorded",
      }],
    });
    expect(persisted?.candidates[0]?.resolution?.candidateFarmIds).toEqual(["farm-erlin", "farm-dongshi"]);
    expect(persisted?.candidates[0]?.reconciliation?.matchingOfficialRecords?.[0]?.farmName).toBe("林志騰二林場");
    expect(persisted?.candidates[0]?.state).toBe("possibly_recorded");
  });

  it("preserves explicit user authority and clue provenance in candidate JSON", () => {
    const candidate = validateAmbientCandidateBundle({
      candidates: [{
        farmText: "金雞測試場",
        caretakerText: "林志騰",
        eventType: "mortality",
        quantity: 5,
        quantityConfidence: "high",
        rawTexts: ["死亡5", "林志騰"],
        items: [{ type: "mortality", quantity: 5, raw: "死亡5", confidence: "high" }],
        conflict: false,
        userOverrides: {
          farm: { farmId: "farm-test", status: "selected", at: "2035-01-01T00:00:00.000Z" },
          caretaker: { status: "overridden", at: "2035-01-01T00:00:00.000Z" },
        },
      }],
    });
    expect(candidate?.candidates[0]?.userOverrides?.farm).toMatchObject({ farmId: "farm-test", status: "selected" });
    expect(candidate?.candidates[0]?.userOverrides?.caretaker?.status).toBe("overridden");
    expect(candidate?.candidates[0]?.caretakerText).toBe("林志騰");
  });

  it("preserves multiple caretaker clues and structured conflict evidence", () => {
    const candidate = validateAmbientCandidateBundle({
      candidates: [{
        farmText: "金雞測試場",
        caretakerText: null,
        caretakerClues: ["林志騰", "王小明"],
        eventType: "mortality",
        quantity: 2,
        quantityConfidence: "high",
        conflict: true,
        conflicts: ["multiple_caretaker_clues"],
        conflictText: "飼養者線索有不同說法",
        evidence: [
          { evidenceType: "caretaker_clue", field: "caretaker", normalizedValue: "林志騰", sourceRef: "m1", confidence: "medium", extractionSource: "deterministic" },
          { evidenceType: "caretaker_clue", field: "caretaker", normalizedValue: "王小明", sourceRef: "m2", confidence: "medium", extractionSource: "deterministic" },
        ],
        conflictEvidence: [{
          type: "caretaker_farm_mismatch",
          evidenceRefs: ["m1", "m2"],
          facts: { caretakerClues: ["林志騰", "王小明"], selectedFarm: "金雞測試場" },
          dbFacts: { activeCaretakerAssignment: false, assignedFarms: [] },
          businessRule: { caretakerRequiredForMortality: false },
          blocking: false,
          overrideAllowed: true,
          resolutionStatus: "explicit_user_choice_wins",
        }],
        items: [{ type: "mortality", quantity: 2, raw: "死亡2", confidence: "high" }],
      }],
    });
    expect(candidate?.candidates[0]?.caretakerClues).toEqual(["林志騰", "王小明"]);
    expect(candidate?.candidates[0]?.evidence).toHaveLength(2);
    expect(candidate?.candidates[0]?.conflictEvidence?.[0]?.facts.caretakerClues).toHaveLength(2);
  });

  it("does not invent names for a legacy label-only conflict", () => {
    const candidate = validateAmbientCandidateBundle({
      candidates: [{
        farmText: "金雞測試場",
        conflict: true,
        conflicts: ["multiple_caretaker_clues"],
        conflictText: "飼養者線索有不同說法",
        items: [{ type: "mortality", quantity: 2, raw: "死亡2", confidence: "high" }],
      }],
    });
    expect(candidate?.candidates[0]?.caretakerClues).toBeUndefined();
    expect(candidate?.candidates[0]?.conflictEvidence).toBeUndefined();
  });

  it("requires conservative evidence before marking already recorded", () => {
    const candidate = validateAmbientCandidateBundle({
      candidates: [{
        farmText: "金雞測試場",
        eventType: "mortality",
        quantity: 5,
        quantityConfidence: "high",
        rawTexts: ["金雞測試場死亡5"],
        items: [{ type: "mortality", quantity: 5, raw: "金雞測試場死亡5", confidence: "high" }],
        conflict: false,
      }],
    })?.candidates[0];
    const message = {
      id: "ambient-1",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "m1",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場死亡5",
      digestHour: "h",
    };
    const official = {
      id: "official-1",
      recordKind: "operational" as const,
      eventType: "mortality",
      quantity: 5,
      farmId: "farm-1",
      farmName: "金雞測試場",
      houseId: null,
      flockId: null,
      rawText: "金雞測試場死亡5",
      actorId: "u",
      lineGroupId: "g",
      source: "operational",
      occurredAt: "2026-08-20T12:04:00.000Z",
      createdAt: "2026-08-20T12:04:00.000Z",
    };
    const resolved = { ...candidate!, resolution: { status: "resolved" as const, resolvedFarmId: "farm-1", candidateFarmIds: ["farm-1"] } };
    expect(reconcileAmbientCandidate(resolved, [official], [message]).state).toBe("already_recorded");
    expect(reconcileAmbientCandidate(resolved, [{ ...official, farmId: "farm-2" }], [message]).state).toBe("new");
    expect(reconcileAmbientCandidate(resolved, [{ ...official, quantity: 3 }], [message]).state).toBe("possibly_recorded");
    expect(reconcileAmbientCandidate(resolved, [{ ...official, occurredAt: "2026-08-20T15:00:00.000Z", createdAt: "2026-08-20T15:00:00.000Z" }], [message]).state).toBe("new");
  });

  it("validates prompt-constrained JSON without relying on JSON Mode", async () => {
    const run = vi.fn(async (_model: string, _input: Record<string, unknown>) => ({
      response: "\u0060\u0060\u0060json\n{\"decisions\":[{\"ref\":\"m1\",\"kind\":\"event\",\"type\":\"mortality\",\"quantity\":5,\"quantityConfidence\":\"high\",\"raw\":\"剛剛好像死5隻\",\"confidence\":\"medium\"}]}\n" + "\u0060\u0060\u0060",
    }));
    const result = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [{
      id: "1",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "m1",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場好像死5隻",
      digestHour: "2026-08-20T20:00:00+08:00",
    }]);
    expect(result.validation).toBe("schema_valid");
    expect(result.bundle?.candidates[0]?.items[0]?.quantity).toBe(5);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[1]).toMatchObject({ max_tokens: AMBIENT_AI_MAX_TOKENS, temperature: 0 });
    expect(run.mock.calls[0]?.[1]).not.toHaveProperty("response_format");
  });

  it("rejects prose around JSON instead of extracting an arbitrary substring", async () => {
    const run = vi.fn(async (_model: string, _input: Record<string, unknown>) => ({
      response: "以下是結果：{\"candidates\":[]}",
    }));
    const result = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [{
      id: "strict-json-boundary",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "m-strict-json-boundary",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場氣溫",
      digestHour: "2026-08-20T20:00:00+08:00",
    }]);
    expect(result.validation).toBe("schema_invalid");
    expect(result.transportDiagnostics?.issueCode).toBe("JSON_PARSE_FAILED");
  });

  it("rejects the retired events envelope from model output", async () => {
    const run = vi.fn(async (_model: string, _input: Record<string, unknown>) => ({
      response: JSON.stringify({
        events: [{
          farmText: "金雞測試場",
          houseText: null,
          flockText: null,
          conflict: false,
          eventType: "abnormal",
          rawTexts: ["金雞測試場氣溫"],
          items: [{ type: "abnormal", quantity: null, raw: "金雞測試場氣溫", confidence: "high", sourceRefs: ["m1"] }],
        }],
        ignoredSelectedRefs: [],
      }),
    }));
    const result = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [{
      id: "events-envelope",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "m-events-envelope",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場氣溫",
      digestHour: "2026-08-20T20:00:00+08:00",
    }]);
    expect(result.validation).toBe("schema_invalid");
    expect(result.bundle).toBeNull();
    expect(result.errorClass).toBe("invalid_event_schema");
  });

  it("rejects a top-level candidate array outside the decision contract", async () => {
    const run = vi.fn(async (_model: string, _input: Record<string, unknown>) => ({
      response: JSON.stringify([{
        farmText: "金雞測試場",
        houseText: null,
        flockText: null,
        conflict: false,
        eventType: "abnormal",
        rawTexts: ["金雞測試場氣溫"],
        items: [{ type: "abnormal", quantity: null, raw: "金雞測試場氣溫", confidence: "medium", sourceRefs: ["m1"] }],
      }]),
    }));
    const result = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [{
      id: "array-envelope",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "m-array-envelope",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場氣溫",
      digestHour: "2026-08-20T20:00:00+08:00",
    }]);
    expect(result.validation).toBe("schema_invalid");
    expect(result.bundle).toBeNull();
  });

  it("does not let envelope normalization bypass candidate validation", async () => {
    const run = vi.fn(async (_model: string, _input: Record<string, unknown>) => ({
      response: JSON.stringify({ events: [{ eventType: "abnormal", items: [] }], ignoredSelectedRefs: ["m1"] }),
    }));
    const result = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [{
      id: "invalid-events-envelope",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "m-invalid-events-envelope",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場氣溫",
      digestHour: "2026-08-20T20:00:00+08:00",
    }]);
    expect(result.validation).toBe("schema_invalid");
    expect(result.errorClass).toBe("invalid_event_schema");
  });

  it("publishes the canonical root contract to the model prompt", () => {
    const prompt = ambientPrompt([{
      id: "prompt-contract",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "m-prompt-contract",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場死亡2隻",
      digestHour: "2026-08-20T20:00:00+08:00",
    }]);
    expect(prompt).toContain('輸出格式只能是 {"decisions":[...]}');
    expect(prompt).not.toContain("ignoredSelectedRefs");
    expect(prompt).toContain("完成輸出前確認所有 [] 與 {} 都已關閉；最後一個字元必須是 }");
    expect(prompt).toContain("每個 selected=true ref 必須且只能有一個 decision");
    expect(prompt).toContain("每個 decision 的 kind 必填；只能是 event、support、ignore，不得省略");
    expect(prompt).toContain('canonical event JSON 例：{"ref":"m1","kind":"event","type":"mortality","quantity":3,"quantityConfidence":"high","raw":"死3隻","confidence":"high"}');
    expect(prompt).toContain("support");
    expect(prompt).toContain("逐一處理所有 selected 訊息");
    expect(prompt).toContain('source_messages=[{"ref":"m1","selected":true');
    expect(prompt).not.toContain("candidate 的 farmText、houseText、flockText、caretakerText、items、conflict");
  });

  it("publishes the strict item evidence and confidence contract", () => {
    const prompt = ambientPrompt([{
      id: "prompt-item-contract",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "m-prompt-item-contract",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場死亡2隻",
      digestHour: "2026-08-20T20:00:00+08:00",
    }]);
    expect(prompt).toContain("raw 是最短、非空、足以辨識事件的單一原文片段");
    expect(prompt).toContain("confidence 只能 low、medium、high");
    expect(prompt).toContain("quantityConfidence 可為 unknown");
    expect(prompt).not.toContain("item.confidence 與 quantityConfidence 只能是 low、medium、high、unknown");
  });

  it("keeps a missing decision kind fail-closed without normalizer inference", async () => {
    const normalized = normalizeAmbientAiExtraction({
      decisions: [{
        ref: "m1",
        type: "mortality",
        quantity: 3,
        quantityConfidence: "high",
        raw: "死3隻",
        confidence: "high",
      }],
    }) as { decisions: Array<Record<string, unknown>> };
    expect(normalized.decisions[0]).not.toHaveProperty("kind");

    const run = vi.fn(async () => ({
      response: JSON.stringify({ decisions: [{
        ref: "m1",
        type: "mortality",
        quantity: 3,
        quantityConfidence: "high",
        raw: "死3隻",
        confidence: "high",
      }] }),
    }));
    const result = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [{
      id: "missing-kind-contract",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "missing-kind-line-message",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場死亡3隻",
      digestHour: "2026-08-20T20:00:00+08:00",
    }]);
    expect(result.validation).toBe("schema_invalid");
    expect(result.errorClass).toBe("invalid_event_schema");
  });

  it("rejects non-JSON output without deterministic source-text salvage", async () => {
    const run = vi.fn(async (_model: string, _input: Record<string, unknown>) => ({
      response: "不是標準格式，死亡5，林志騰",
    }));
    const result = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [
      {
        id: "3",
        organizationId: "o",
        lineGroupId: "g",
        lineUserId: "u",
        lineMessageId: "m3",
        eventTimestamp: "2026-08-20T12:00:00.000Z",
        text: "死亡5",
        digestHour: "2026-08-20T20:00:00+08:00",
      },
      {
        id: "4",
        organizationId: "o",
        lineGroupId: "g",
        lineUserId: "u",
        lineMessageId: "m4",
        eventTimestamp: "2026-08-20T12:01:00.000Z",
        text: "林志騰",
        digestHour: "2026-08-20T20:00:00+08:00",
      },
    ]);
    expect(result.validation).toBe("schema_invalid");
    expect(result.bundle).toBeNull();
    expect(result.errorClass).toBe("invalid_ambient_candidate_json");
    expect(result.transportDiagnostics?.issueCode).toBe("JSON_PARSE_FAILED");
    expect(result.validationDiagnostics?.firstIssueCode).toBe("JSON_PARSE_FAILED");
  });

  it("rejects truncated JSON without bracket or source-text repair", async () => {
    const run = vi.fn(async (_model: string, _input: Record<string, unknown>) => ({
      response: '{"candidates":[{"farmText":"金雞測試場","items":[{"type":"mortality","quantity":5',
    }));
    const result = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [{
      id: "truncated-json-boundary",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "m-truncated-json-boundary",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場死亡5隻",
      digestHour: "2026-08-20T20:00:00+08:00",
    }]);
    expect(result.validation).toBe("schema_invalid");
    expect(result.bundle).toBeNull();
    expect(result.transportDiagnostics?.issueCode).toBe("POSSIBLE_TRUNCATION");
    expect(result.transportDiagnostics?.possibleTruncation).toBe(true);
    expect(result.validationDiagnostics?.firstIssueCode).toBe("JSON_PARSE_FAILED");
  });

  it("keeps invalid candidate JSON distinguishable from a valid empty result", async () => {
    const run = vi.fn(async (_model: string, _input: Record<string, unknown>) => ({
      response: '{"decisions":[]}',
    }));
    const result = await extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [{
      id: "2",
      organizationId: "o",
      lineGroupId: "g",
      lineUserId: "u",
      lineMessageId: "m2",
      eventTimestamp: "2026-08-20T12:00:00.000Z",
      text: "金雞測試場氣溫",
      digestHour: "2026-08-20T20:00:00+08:00",
    }]);
    expect(result.validation).toBe("schema_invalid");
    expect(result.errorClass).toBe("source_decision_missing");
  });
});

describe("Ambient development cohort source isolation", () => {
  const cutoff = "2026-08-27T00:00:00.000Z";
  const group = { organizationId: "org-test", groupId: "group-test" };

  it("excludes active locked Dev sources from normal selection", () => {
    const selection = ambientSelectionForTest({
      trigger: "cron",
      executionMode: "normal",
      devSessionId: "should-not-disable-isolation",
      targetOrganizationId: group.organizationId,
      targetGroupId: group.groupId,
    }, cutoff, "hour", group);
    expect(selection.where).toContain("NOT EXISTS");
    expect(selection.where).toContain("ambient_dev_cohort_sources");
    expect(selection.where).toContain("dev_session.status = 'locked'");
    expect(selection.where).toContain("julianday(dev_session.expires_at) > julianday(?)");
  });

  it("keeps the exact locked cohort available only to Dev execution modes", () => {
    for (const executionMode of ["dev_dry_run", "dev_commit"] as const) {
      const selection = ambientSelectionForTest({
        trigger: "manual",
        executionMode,
        devSessionId: "dev-session",
        sourceMessageIds: ["source-1"],
        targetOrganizationId: group.organizationId,
        targetGroupId: group.groupId,
      }, cutoff, "dev", group);
      expect(selection.where).not.toContain("ambient_dev_cohort_sources");
      expect(selection.where).toContain("line_message_id IN (?)");
      expect(selection.bindings).toContain("source-1");
    }
  });
});

describe("ambient validation diagnostics", () => {
  const message = {
    id: "diagnostic-message",
    organizationId: "o",
    lineGroupId: "g",
    lineUserId: "u",
    lineMessageId: "diagnostic-line-message",
    eventTimestamp: "2026-08-20T12:00:00.000Z",
    text: "金雞測試場氣溫",
    digestHour: "2026-08-20T20:00:00+08:00",
  };

  async function extractDiagnostic(response: unknown, raw = false) {
    const run = vi.fn(async () => ({ response: raw ? response as string : JSON.stringify(response) }));
    return extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [message]);
  }

  const validCandidate = {
    farmText: "金雞測試場",
    houseText: null,
    flockText: null,
    conflict: false,
    items: [{ type: "abnormal", quantity: null, raw: "氣溫", confidence: "medium", sourceRefs: ["m1"] }],
  };

  const validDecision = {
    ref: "m1",
    kind: "event" as const,
    type: "abnormal" as const,
    quantity: null,
    quantityConfidence: "unknown" as const,
    raw: "氣溫",
    confidence: "medium" as const,
  };

  it.each([
    ["RAW-01 accepts bounded non-empty source evidence", "死亡2", true],
    ["RAW-02 rejects null source evidence", null, false],
    ["RAW-03 rejects empty source evidence", "", false],
  ] as const)("%s", (_name, raw, expected) => {
    const candidate = validateAmbientCandidateBundle({
      candidates: [{ ...validCandidate, items: [{ type: "mortality", quantity: 2, raw, confidence: "medium", sourceRefs: ["m1"] }] }],
    });
    expect(Boolean(candidate)).toBe(expected);
  });

  it("RAW-06 does not invent raw evidence when an item supplies null", async () => {
    const result = await extractDiagnostic({
      decisions: [{ ...validDecision, raw: null }],
    });
    expect(result.validation).toBe("schema_invalid");
    expect(result.validationDiagnostics).toMatchObject({
      firstIssuePath: "decisions[0].raw",
      firstActualType: "null",
    });
    expect(result.bundle).toBeNull();
  });

  it("RAW-07 preserves the existing bounded raw length", () => {
    const candidate = validateAmbientCandidateBundle({
      candidates: [{ ...validCandidate, items: [{ type: "abnormal", quantity: null, raw: "x".repeat(2001), confidence: "medium", sourceRefs: ["m1"] }] }],
    });
    expect(candidate).toBeNull();
  });

  it.each([
    ["CONF-01 low", "low", true],
    ["CONF-02 medium", "medium", true],
    ["CONF-03 high", "high", true],
    ["CONF-04 unknown", "unknown", false],
    ["CONF-05 null", null, false],
  ] as const)("%s", (_name, confidence, expected) => {
    const candidate = validateAmbientCandidateBundle({
      candidates: [{ ...validCandidate, items: [{ type: "abnormal", quantity: null, raw: "咳嗽", confidence, sourceRefs: ["m1"] }] }],
    });
    expect(Boolean(candidate)).toBe(expected);
  });

  it("CONF-06 keeps bounded numeric confidence normalization", async () => {
    const result = await extractDiagnostic({
      decisions: [{ ...validDecision, raw: "咳嗽", confidence: 0.6 }],
    });
    expect(result.validation).toBe("schema_valid");
    expect(result.bundle?.candidates[0]?.items[0]?.confidence).toBe("medium");
  });

  it("diagnoses a missing required candidate field without storing its value", async () => {
    const { raw: _raw, ...missingRaw } = validDecision;
    const result = await extractDiagnostic({ decisions: [missingRaw] });
    expect(result.validation).toBe("schema_invalid");
    expect(result.validationDiagnostics).toMatchObject({ firstIssueCode: "INVALID_FIELD_TYPE", firstIssuePath: "decisions[0].raw", firstActualType: "missing", failedCandidateIndex: 0 });
  });

  it("diagnoses a wrong field type", async () => {
    const result = await extractDiagnostic({ decisions: [{ ...validDecision, type: "mortality", quantity: "2" }] });
    expect(result.validationDiagnostics).toMatchObject({ firstIssueCode: "INVALID_FIELD_TYPE", firstIssuePath: "decisions[0].quantity", firstExpectedType: "number|null", firstActualType: "string" });
  });

  it("diagnoses invalid enum tokens with a bounded safe token", async () => {
    const result = await extractDiagnostic({ decisions: [{ ...validDecision, type: "未支援事件" }] });
    expect(result.validationDiagnostics).toMatchObject({ firstIssueCode: "INVALID_ENUM", firstIssuePath: "decisions[0].type", safeEnumActual: "未支援事件" });
  });

  it("keeps the strict persisted-candidate validator boundary for a known quantity", () => {
    const candidate = validateAmbientCandidateBundle({ candidates: [{ ...validCandidate, quantity: 2, items: [{ type: "mortality", quantity: null, raw: "死亡", confidence: "medium" }] }] });
    expect(candidate).toBeNull();
  });

  it("records root and envelope kinds for supported shapes", async () => {
    const canonicalResult = await extractDiagnostic({ decisions: [validDecision] });
    expect(canonicalResult.validation).toBe("schema_valid");
    expect(canonicalResult.validationDiagnostics).toMatchObject({ rootKind: "object", envelopeKind: "decisions", candidateCount: 1, issueCount: 0 });
    const arrayResult = await extractDiagnostic([validDecision]);
    expect(arrayResult.validation).toBe("schema_invalid");
    expect(arrayResult.validationDiagnostics).toMatchObject({ rootKind: "array", envelopeKind: "top_level_array", firstIssueCode: "ENVELOPE_INVALID" });
  });

  it("normalizes bounded provider enum and optional-field variants before strict validation", async () => {
    const result = await extractDiagnostic({
      decisions: [{ ...validDecision, type: "死亡", quantity: 2, quantityConfidence: "high", raw: "死亡2", confidence: 0.9, farmText: "金雞測試場" }],
    });
    expect(result.validation).toBe("schema_valid");
    expect(result.validationDiagnostics).toMatchObject({ issueCount: 0 });
    expect(result.bundle?.candidates[0]?.items).toEqual([
      { type: "mortality", quantity: 2, raw: "死亡2", confidence: "high" },
    ]);
  });

  it("diagnoses an unknown wrapper and JSON parse failure separately", async () => {
    const wrapperResult = await extractDiagnostic({ records: [validCandidate] });
    expect(wrapperResult.validationDiagnostics).toMatchObject({ envelopeKind: "other_object", firstIssueCode: "ENVELOPE_INVALID" });
    const parseResult = await extractDiagnostic("not valid json", true);
    expect(parseResult.validationDiagnostics).toMatchObject({ rootKind: "unknown", firstIssueCode: "JSON_PARSE_FAILED" });
  });

  it("keeps structural fingerprints free of candidate values", async () => {
    const result = await extractDiagnostic({ decisions: [{ ...validDecision, farmText: "PRIVATE_FARM_NAME", type: "not-an-enum", raw: "PRIVATE_SYMPTOM" }] });
    const diagnostics = result.validationDiagnostics!;
    expect(diagnostics.structuralKeysJson).toContain("farmText");
    expect(diagnostics.structuralKeysJson).not.toContain("PRIVATE_FARM_NAME");
    expect(diagnostics.issueSummaryJson).not.toContain("PRIVATE_SYMPTOM");
    expect(diagnostics.issueSummaryJson).not.toContain("PRIVATE_FARM_NAME");
  });

  it("bounds diagnostic issue and structural payloads", async () => {
    const decisions = [{ ...validDecision, type: "invalid-enum", quantity: "bad", raw: "private-value", confidence: "bad" }];
    const result = await extractDiagnostic({ decisions });
    expect(result.validationDiagnostics!.issueCount).toBeLessThanOrEqual(32);
    expect(result.validationDiagnostics!.issueSummaryJson.length).toBeLessThanOrEqual(4096);
    expect(result.validationDiagnostics!.structuralKeysJson.length).toBeLessThanOrEqual(4096);
  });
});

describe("ambient provider transport diagnostics", () => {
  it("uses the bounded 1536-token Ambient output budget", () => {
    expect(AMBIENT_AI_MAX_TOKENS).toBe(1536);
  });

  const message = {
    id: "transport-message",
    organizationId: "o",
    lineGroupId: "g",
    lineUserId: "u",
    lineMessageId: "transport-line-message",
    eventTimestamp: "2026-08-20T12:00:00.000Z",
    text: "金雞測試場氣溫",
    digestHour: "2026-08-20T20:00:00+08:00",
  };
  const validCandidate = {
    farmText: "金雞測試場",
    houseText: null,
    flockText: null,
    conflict: false,
    items: [{ type: "abnormal", quantity: null, raw: "氣溫", confidence: "medium", sourceRefs: ["m1"] }],
  };

  async function extractTransport(providerResult: unknown) {
    const run = vi.fn(async () => providerResult);
    return extractAmbientCandidates({ DB: {} as D1Database, AI: { run } as unknown as Ai }, [message]);
  }

  it("accepts the minimal top-level JSON skeleton without auto-closing it", async () => {
    const result = await extractTransport({ response: '{"decisions":[]}' });
    expect(result.transportDiagnostics).toMatchObject({
      issueCode: "NONE",
      jsonSyntax: {
        parseErrorCode: null,
        hasUnbalancedBraces: false,
        hasUnbalancedBrackets: false,
        stringStateClosed: true,
      },
    });
    // The selected source is not accounted for by this syntax-only skeleton,
    // so semantic validation may reject it; parsing must still be successful.
    expect(result.bundle).toBeNull();
    expect(result.validationDiagnostics?.firstIssueCode).toBe("SOURCE_DECISION_MISSING");
  });

  it.each([
    ["missing final brace", '{"ignoredSelectedRefs":[],"candidates":[]', true, false, "end_of_input"],
    ["missing final bracket and brace", '{"ignoredSelectedRefs":[],"candidates":[', true, true, null],
  ] as const)("fails closed for %s", async (_name, response, unbalancedBraces, unbalancedBrackets, nearErrorCharClass) => {
    const result = await extractTransport({ response });
    expect(result.validation).toBe("schema_invalid");
    expect(result.bundle).toBeNull();
    expect(result.transportDiagnostics).toMatchObject({
      issueCode: "POSSIBLE_TRUNCATION",
      jsonSyntax: {
        hasUnbalancedBraces: unbalancedBraces,
        hasUnbalancedBrackets: unbalancedBrackets,
        nearErrorCharClass,
      },
    });
    expect(result.validationDiagnostics?.firstIssueCode).toBe("JSON_PARSE_FAILED");
  });

  it.each([
    ["TR-01 plain object JSON", { response: JSON.stringify({ candidates: [validCandidate] }) }, "object", "string"],
    ["TR-02 plain array JSON", { response: JSON.stringify([validCandidate]) }, "object", "string"],
    ["TR-05 structured provider object", { response: { candidates: [validCandidate] } }, "object", "object"],
    ["TR-06 structured provider array", { response: [validCandidate] }, "object", "array"],
  ] as const)("records %s", async (_name, providerResult, resultKind, responseKind) => {
    const result = await extractTransport(providerResult);
    expect(result.transportDiagnostics).toMatchObject({
      providerResultKind: resultKind,
      responseFieldPresent: true,
      responseValueKind: responseKind,
      issueCode: "NONE",
    });
  });

  it.each([
    ["TR-07 json fence", "```json\n{\"candidates\":[]}\n```", true, true],
    ["TR-08 generic fence", "```\n{\"candidates\":[]}\n```", true, false],
  ] as const)("records %s without storing content", async (_name, completion, markdownFence, jsonFence) => {
    const result = await extractTransport({ response: completion });
    expect(result.transportDiagnostics).toMatchObject({ markdownFenceDetected: markdownFence, jsonFenceDetected: jsonFence });
    expect(JSON.stringify(result.transportDiagnostics)).not.toContain("candidates");
  });

  it.each([
    ["TR-09 leading prose", "前置說明\n{\"candidates\":[]}", true, false],
    ["TR-10 trailing prose", "{\"candidates\":[]}\n結束說明", false, true],
  ] as const)("bounds %s shape flags", async (_name, completion, leading, trailing) => {
    const result = await extractTransport({ response: completion });
    expect(result.transportDiagnostics).toMatchObject({ leadingNonJsonDetected: leading, trailingNonJsonDetected: trailing });
  });

  it("TR-11 records empty completion separately", async () => {
    const result = await extractTransport({ response: "" });
    expect(result.transportDiagnostics).toMatchObject({ responseValueKind: "string", completionLength: 0, issueCode: "EMPTY_COMPLETION" });
  });

  it("TR-12 records whitespace-only completion separately", async () => {
    const result = await extractTransport({ response: " \n\t" });
    expect(result.transportDiagnostics).toMatchObject({ responseValueKind: "string", trimmedLength: 0, issueCode: "EMPTY_COMPLETION" });
  });

  it("TR-13 records null and undefined response values without content", async () => {
    const nullResult = await extractTransport({ response: null });
    const undefinedResult = await extractTransport({ response: undefined });
    expect(nullResult.transportDiagnostics).toMatchObject({ responseValueKind: "null", issueCode: "EMPTY_COMPLETION" });
    expect(undefinedResult.transportDiagnostics).toMatchObject({ responseValueKind: "missing", issueCode: "EMPTY_COMPLETION" });
  });

  it("TR-17/TR-19 distinguishes a missing provider response field", async () => {
    const result = await extractTransport({ result: JSON.stringify({ candidates: [] }) });
    expect(result.transportDiagnostics).toMatchObject({
      providerResultKind: "object",
      responseFieldPresent: false,
      responseValueKind: "missing",
      issueCode: "RESPONSE_FIELD_MISSING",
    });
  });

  it("TR-14/TR-16 records malformed and multiple-block JSON as parse failure", async () => {
    const malformed = await extractTransport({ response: "not valid json" });
    const multiple = await extractTransport({ response: "{\"candidates\":[]} {\"candidates\":[]}" });
    expect(malformed.transportDiagnostics?.issueCode).toBe("JSON_PARSE_FAILED");
    expect(multiple.transportDiagnostics?.issueCode).toBe("JSON_PARSE_FAILED");
  });

  it("TR-15 records bounded truncation evidence", async () => {
    const result = await extractTransport({ response: "{\"candidates\":[" });
    expect(result.transportDiagnostics).toMatchObject({ possibleTruncation: true, issueCode: "POSSIBLE_TRUNCATION" });
  });

  it("TR-18 does not stringify an object without a response field", async () => {
    const result = await extractTransport({ candidates: [validCandidate] });
    expect(result.transportDiagnostics).toMatchObject({ responseFieldPresent: false, responseValueKind: "missing", issueCode: "RESPONSE_FIELD_MISSING" });
  });

  it("TR-20 records only bounded transport metadata", async () => {
    const result = await extractTransport({ response: "PRIVATE_COMPLETION_SHOULD_NOT_PERSIST" });
    const serialized = JSON.stringify(result.transportDiagnostics);
    expect(serialized).not.toContain("PRIVATE_COMPLETION_SHOULD_NOT_PERSIST");
    expect(serialized.length).toBeLessThanOrEqual(2048);
  });

  it("records bounded request and usage metadata without response content", async () => {
    const result = await extractTransport({
      response: JSON.stringify({ candidates: [] }),
      usage: { prompt_tokens: 1247, completion_tokens: 551, total_tokens: 1798 },
    });
    expect(result.transportDiagnostics).toMatchObject({
      requestedMaxTokens: AMBIENT_AI_MAX_TOKENS,
      usagePromptTokens: 1247,
      usageCompletionTokens: 551,
      usageTotalTokens: 1798,
      effectiveOutputBudgetSource: "explicit",
    });
    expect(JSON.stringify(result.transportDiagnostics)).not.toContain("candidates");
  });

  it("keeps missing usage fields safely null", async () => {
    const result = await extractTransport({ response: JSON.stringify({ candidates: [] }) });
    expect(result.transportDiagnostics).toMatchObject({
      requestedMaxTokens: AMBIENT_AI_MAX_TOKENS,
      usagePromptTokens: null,
      usageCompletionTokens: null,
      usageTotalTokens: null,
      effectiveOutputBudgetSource: "explicit",
    });
  });

  it("records allowlisted finish reason without storing provider payload", async () => {
    const result = await extractTransport({ response: JSON.stringify({ candidates: [] }), finish_reason: "length" });
    expect(result.transportDiagnostics).toMatchObject({ finishReason: "length", possibleTruncation: true, issueCode: "POSSIBLE_TRUNCATION" });
  });

  it("marks a near-budget small cohort as a non-blocking output-size anomaly", async () => {
    const result = await extractTransport({
      response: JSON.stringify({ candidates: [validCandidate] }),
      usage: { prompt_tokens: 900, completion_tokens: AMBIENT_AI_MAX_TOKENS, total_tokens: 2436 },
    });
    expect(result.transportDiagnostics).toMatchObject({
      selectedSourceCount: 1,
      parsedCandidateCount: 1,
      parsedItemCount: 1,
      outputSizeAnomaly: true,
    });
  });

  it("classifies runtime JSON syntax errors into the allowlist without exposing messages", () => {
    expect(classifyAmbientJsonSyntaxError(new SyntaxError("Expected ',' or '}' after property value in JSON at position 6"))).toBe("EXPECTED_COMMA_OR_END");
    expect(classifyAmbientJsonSyntaxError(new SyntaxError("Expected property name or '}' in JSON at position 1"))).toBe("EXPECTED_PROPERTY_NAME");
    expect(classifyAmbientJsonSyntaxError(new SyntaxError("Bad escaped character in JSON at position 7"))).toBe("INVALID_ESCAPE");
    expect(classifyAmbientJsonSyntaxError(new SyntaxError("Unexpected number in JSON at position 6"))).toBe("INVALID_NUMBER");
    expect(classifyAmbientJsonSyntaxError(new SyntaxError("Bad control character in string literal in JSON at position 7"))).toBe("CONTROL_CHARACTER");
    expect(classifyAmbientJsonSyntaxError(new SyntaxError("Unexpected keyword in JSON at position 5"))).toBe("INVALID_LITERAL");
    expect(classifyAmbientJsonSyntaxError(new SyntaxError("Unterminated string in JSON at position 7"))).toBe("UNEXPECTED_END");
  });

  it("records bounded native syntax diagnostics and never repairs malformed JSON", async () => {
    const missingBrace = await extractTransport({ response: "{\"a\":1" });
    expect(missingBrace.validation).toBe("schema_invalid");
    expect(missingBrace.bundle).toBeNull();
    expect(missingBrace.transportDiagnostics).toMatchObject({
      issueCode: "POSSIBLE_TRUNCATION",
      jsonSyntax: {
        parseErrorCode: "EXPECTED_COMMA_OR_END",
        parseErrorOffsetBucket: "0-99",
        nearErrorCharClass: "end_of_input",
        hasUnbalancedBraces: true,
        stringStateClosed: true,
      },
    });
    expect(missingBrace.validationDiagnostics?.firstIssueCode).toBe("JSON_PARSE_FAILED");
  });

  it.each([
    ["trailing comma", "{\"a\":1,}", "EXPECTED_PROPERTY_NAME", true],
    ["bad escape", "{\"a\":\"\\x\"}", "INVALID_ESCAPE", false],
    ["unfinished quote", "{\"a\":\"x", "UNEXPECTED_END", true],
  ] as const)("records safe structural flags for %s", async (_name, completion, code, unbalancedString) => {
    const result = await extractTransport({ response: completion });
    expect(result.validation).toBe("schema_invalid");
    expect(result.transportDiagnostics?.jsonSyntax.parseErrorCode).toBe(code);
    if (code === "EXPECTED_PROPERTY_NAME") expect(result.transportDiagnostics?.jsonSyntax.possibleTrailingCommaBeforeClose).toBe(true);
    if (code === "UNEXPECTED_END") expect(result.transportDiagnostics?.jsonSyntax.endsInsideString).toBe(unbalancedString);
    expect(JSON.stringify(result.transportDiagnostics)).not.toContain(completion);
  });

  it("records bounded syntax metadata without retaining the completion", async () => {
    const privateCompletion = "{\"private\":\"PRIVATE_COMPLETION_SHOULD_NOT_PERSIST\"";
    const result = await extractTransport({ response: privateCompletion });
    const serialized = JSON.stringify(result.transportDiagnostics);
    expect(serialized).not.toContain("PRIVATE_COMPLETION_SHOULD_NOT_PERSIST");
    expect(serialized).not.toContain("Expected");
    expect(result.transportDiagnostics?.failureDetailClass).toBe("json_parse_invalid");
    expect(serialized.length).toBeLessThanOrEqual(2048);
  });
});
