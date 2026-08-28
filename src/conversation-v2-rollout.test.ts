import { describe, expect, it } from "vitest";
import { conversationV2EligibilityDecision } from "./conversation-v2-rollout";
import { classifyCommand, parseCommand } from "./core";
import { interactionGateDecision } from "./ambient";
import { navigationActionForText } from "./line-menu";

describe("Conversation V2 group rollout gate", () => {
  it("ROLLOUT-01 keeps the global kill switch above group access", () => {
    expect(conversationV2EligibilityDecision("off", true)).toEqual({ eligible: false, reason: "global_v2_disabled" });
  });

  it("ROLLOUT-02 keeps a disabled group out of the planner", () => {
    expect(conversationV2EligibilityDecision("test_farm", false)).toEqual({ eligible: false, reason: "group_v2_disabled" });
  });

  it("ROLLOUT-03 enables an explicitly allowed group", () => {
    expect(conversationV2EligibilityDecision("test_farm", true)).toEqual({ eligible: true, reason: "eligible" });
  });

  it("ROLLOUT-04 does not require a Farm binding", () => {
    expect(conversationV2EligibilityDecision("test_farm", true, true).eligible).toBe(true);
  });

  it("ROLLOUT-05 does not require an active Candidate", () => {
    expect(conversationV2EligibilityDecision("test_farm", true, true).eligible).toBe(true);
  });

  it("ROLLOUT-06 treats Candidate as context rather than access", () => {
    expect(conversationV2EligibilityDecision("test_farm", false, true).reason).toBe("group_v2_disabled");
  });

  it("ROLLOUT-07 does not let a Candidate silently enable a group", () => {
    expect(conversationV2EligibilityDecision("test_farm", false, true).eligible).toBe(false);
  });

  it("ROLLOUT-08 does not let Farm text bypass the group switch", () => {
    expect(conversationV2EligibilityDecision("test_farm", false, true).eligible).toBe(false);
  });

  it("keeps shadow mode non-user-facing", () => {
    expect(conversationV2EligibilityDecision("shadow", true)).toEqual({ eligible: false, reason: "global_v2_shadow" });
  });

  it("keeps missing groups closed", () => {
    expect(conversationV2EligibilityDecision("on", true, false)).toEqual({ eligible: false, reason: "group_not_found" });
  });

  it("ROLLOUT-09 keeps ordinary unmentioned group chat quiet", () => {
    expect(interactionGateDecision({
      eventType: "message",
      hasMention: false,
      isSystemCommand: false,
      hasActiveSession: false,
      hasPendingState: false,
    })).toBe("quiet");
  });

  it.each(["選單", "返回主選單"]) ("ROLLOUT-10 keeps exact navigation commands deterministic: %s", (text) => {
    expect(navigationActionForText(text)).toBe("menu_home");
  });

  it("ROLLOUT-10 keeps exact read command deterministic: 歷史紀錄", () => {
    expect(classifyCommand(parseCommand("歷史紀錄"))).toBe("CONTROL");
  });

  it("ROLLOUT-11 keeps admin/control commands deterministic", () => {
    expect(classifyCommand(parseCommand("系統狀態"))).toBe("CONTROL");
    expect(classifyCommand(parseCommand("開發選單"))).toBe("CONTROL");
  });

  it("ROLLOUT-12 keeps the safe fallback when the group switch is off", () => {
    expect(conversationV2EligibilityDecision("test_farm", false)).toEqual({ eligible: false, reason: "group_v2_disabled" });
  });
});
