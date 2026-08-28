import { describe, expect, it } from "vitest";
import { SEMANTIC_ACTION_TTL_MS, semanticActionExpiry, semanticActionKey } from "./semantic-dedupe";

describe("semantic menu action dedupe", () => {
  it("scopes the key by group, user, and action", () => {
    expect(semanticActionKey("group-a", "user-a", "menu_today_summary")).toBe("group-a:user-a:menu_today_summary");
    expect(semanticActionKey("group-a", "user-b", "menu_today_summary")).not.toBe(semanticActionKey("group-a", "user-a", "menu_today_summary"));
    expect(semanticActionKey("group-a", "user-a", "menu_recent_abnormal")).not.toBe(semanticActionKey("group-a", "user-a", "menu_today_summary"));
  });

  it("uses the ten-second TTL selected for query actions", () => {
    const now = Date.parse("2026-08-20T08:00:00.000Z");
    expect(Date.parse(semanticActionExpiry(now)) - now).toBe(SEMANTIC_ACTION_TTL_MS);
  });
});
