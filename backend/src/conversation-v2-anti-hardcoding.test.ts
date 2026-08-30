import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

describe("Conversation V2 anti-overfit guard", () => {
  it("does not embed the observed benchmark utterances as production branches", () => {
    const source = readFileSync(resolve(import.meta.dirname, "conversation-v2.ts"), "utf8");
    for (const phrase of [
      "什麼衝突",
      "你現在知道這筆哪些資料",
      "這筆哪裡有問題",
      "我如果現在不想記這筆可以怎麼辦",
    ]) {
      expect(source).not.toContain(phrase);
    }
  });
});
