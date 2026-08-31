import { describe, expect, it } from "vitest";
import { inferFarmCaretakerQueryName } from "./index";
import { routeConversationV2Deterministic, type ConversationV2Context } from "./conversation-v2";
import { FarmResolver } from "./farm-resolver";

const noCandidateContext: ConversationV2Context = {
  openCandidateCount: 0,
  hasCurrentCandidate: false,
  currentCandidateId: null,
  currentCandidateFarm: null,
  currentCandidateHouse: null,
  currentCandidateFlock: null,
  currentCandidateEvent: null,
  currentCandidateQuantity: null,
  currentCandidateEnvironment: null,
  currentCandidateState: null,
  currentCandidateBlockingField: null,
  lastGoal: null,
  lastTopic: null,
  lastResponseType: null,
  lastExplainedIssue: null,
};

describe("Query B farm-to-caretaker path", () => {
  it("routes the exact accepted wording and resolves its farm name", () => {
    const text = "金雞測試場目前設定的飼養者有誰？";
    const route = routeConversationV2Deterministic(text, noCandidateContext);
    expect(route).toMatchObject({
      goal: "QUERY",
      target: "farm_caretakers",
      // The current public route records the generic conversation context
      // tool for relationship reads; the target still selects the dedicated
      // queryFarmCaretakers renderer in the Worker.
      requestedTools: ["get_conversation_context"],
    });

    const inferred = inferFarmCaretakerQueryName(text);
    const resolution = new FarmResolver([
      { id: "farm-test", name: "金雞測試場", active: 1, environment: "test" },
    ]).resolve(inferred);
    expect(inferred).toBe("金雞測試");
    expect(resolution).toMatchObject({
      kind: "direct",
      farm: { id: "farm-test", name: "金雞測試場" },
    });

    const rendered = `${resolution.farm?.name}目前設定的飼養者：驗收測試飼養者-20260831-7Q4M`;
    expect(rendered).toContain("金雞測試場目前設定的飼養者：");
    expect(rendered).toContain("驗收測試飼養者-20260831-7Q4M");
  });

  it("preserves the existing shorter farm-to-caretaker wording", () => {
    expect(inferFarmCaretakerQueryName("金雞測試場有沒有飼養者？")).toBe("金雞測試");
    expect(inferFarmCaretakerQueryName("金雞測試場設定的飼養者")).toBe("金雞測試");
  });
});
