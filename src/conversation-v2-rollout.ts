export type ConversationV2GlobalMode = "off" | "shadow" | "test_farm" | "on";

export type ConversationV2SkipReason =
  | "global_v2_disabled"
  | "global_v2_shadow"
  | "group_v2_disabled"
  | "group_not_found"
  | "eligible";

export interface ConversationV2EligibilityDecision {
  eligible: boolean;
  reason: ConversationV2SkipReason;
}

/**
 * Global mode is a kill switch / rollout ceiling. It never grants a group
 * access by itself; the group-level switch is always required as a second
 * explicit allow.
 */
export function conversationV2EligibilityDecision(
  mode: ConversationV2GlobalMode | string | undefined,
  groupEnabled: boolean,
  groupFound = true,
): ConversationV2EligibilityDecision {
  const normalized = mode ?? "off";
  if (normalized === "off" || !["off", "shadow", "test_farm", "on"].includes(normalized)) {
    return { eligible: false, reason: "global_v2_disabled" };
  }
  if (normalized === "shadow") return { eligible: false, reason: "global_v2_shadow" };
  if (!groupFound) return { eligible: false, reason: "group_not_found" };
  if (!groupEnabled) return { eligible: false, reason: "group_v2_disabled" };
  return { eligible: true, reason: "eligible" };
}
