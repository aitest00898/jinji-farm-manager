import { describe, expect, it, vi } from "vitest";
import {
  classifyConversationalGoalWithAi,
  CONVERSATIONAL_TOOL_ALLOWLIST,
  parseConversationalAiForTest,
  routeConversationalGoal,
} from "./conversational-agent";

describe("bounded conversational agent routing", () => {
  it("routes explanation and read-only query goals from current context", () => {
    expect(routeConversationalGoal("飼養者線索有什麼不同", { openCandidateCount: 1, hasCurrentCandidate: true })).toEqual({
      goal: "EXPLAIN",
      target: "candidate_caretaker_clue",
    });
    expect(routeConversationalGoal("林志騰目前對應哪些雞場", { openCandidateCount: 1, hasCurrentCandidate: true })).toEqual({
      goal: "QUERY",
      target: "caretaker_farms",
    });
    expect(routeConversationalGoal("金雞測試場有飼養者嗎", { openCandidateCount: 0, hasCurrentCandidate: false })).toEqual({
      goal: "QUERY",
      target: "farm_caretakers",
    });
    expect(routeConversationalGoal("目前有幾筆待確認", { openCandidateCount: 2, hasCurrentCandidate: false })).toEqual({
      goal: "QUERY",
      target: "open_candidates",
    });
  });

  it("keeps repair and clue dismissal as structured candidate actions", () => {
    expect(routeConversationalGoal("就用金雞測試場", { openCandidateCount: 1, hasCurrentCandidate: true })).toMatchObject({
      goal: "REPAIR",
      field: "farm",
      repair: { kind: "set_field", value: "金雞測試場" },
    });
    expect(routeConversationalGoal("那不要管林志騰", { openCandidateCount: 1, hasCurrentCandidate: true })).toMatchObject({
      goal: "REPAIR",
      repair: { kind: "dismiss_clue", field: "caretaker" },
    });
    expect(routeConversationalGoal("這筆有點不對", { openCandidateCount: 1, hasCurrentCandidate: true })).toEqual({
      goal: "CLARIFY",
      clarificationReason: "candidate_field_unspecified",
    });
  });

  it("does not guess a candidate when a group has multiple open candidates", () => {
    expect(routeConversationalGoal("這筆哪裡怪", { openCandidateCount: 2, hasCurrentCandidate: false })).toMatchObject({
      goal: "EXPLAIN",
      target: "candidate",
    });
  });

  it("accepts fenced JSON only through the bounded local schema", () => {
    expect(parseConversationalAiForTest('前置說明```json\n{"goal":"EXPLAIN","target":"candidate_caretaker_clue","field":null,"value":null,"confidence":0.9}\n```')).toEqual({
      goal: "EXPLAIN",
      target: "candidate_caretaker_clue",
    });
    expect(parseConversationalAiForTest('{"goal":"REPAIR","target":null,"field":null,"value":"金雞測試場","confidence":1}')).toBeNull();
    expect(parseConversationalAiForTest('{"goal":"REPAIR","target":null,"field":"farm","value":"金雞測試場","confidence":1}')).toMatchObject({
      goal: "REPAIR",
      field: "farm",
      repair: { kind: "set_field", value: "金雞測試場" },
    });
  });

  it("uses the current model without an unsupported response format", async () => {
    const run = vi.fn(async (_model: string, input: Record<string, unknown>) => {
      expect(input).not.toHaveProperty("response_format");
      return { response: '{"goal":"EXPLAIN","target":"candidate","field":null,"value":null,"confidence":0.8}' };
    });
    const result = await classifyConversationalGoalWithAi(
      { run } as unknown as Ai,
      "這筆哪裡有問題",
      { openCandidateCount: 1, hasCurrentCandidate: true },
    );
    expect(result.validation).toBe("schema_valid");
    expect(result.route).toEqual({ goal: "EXPLAIN", target: "candidate" });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("has no official mutation tool in the conversational allowlist", () => {
    expect(CONVERSATIONAL_TOOL_ALLOWLIST.read).toContain("explainAmbientCandidate");
    expect(CONVERSATIONAL_TOOL_ALLOWLIST.candidate).toContain("applyAmbientCandidatePatch");
    expect(CONVERSATIONAL_TOOL_ALLOWLIST.official).toEqual([]);
  });
});
