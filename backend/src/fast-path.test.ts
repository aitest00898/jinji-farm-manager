import { describe, expect, it } from "vitest";
import { classifyLineFastPath } from "./fast-path";

function message(text: string, mention = false) {
  return {
    type: "message",
    message: {
      type: "text",
      text: mention ? `@Bot ${text}` : text,
      ...(mention ? { mention: { mentionees: [{ index: 0, length: 4, isSelf: true }] } } : {}),
    },
  };
}

function postback(data: string) {
  return { type: "postback", postback: { data } };
}

describe("LINE Fast Path allowlist", () => {
  it.each([
    ["選單", "menu_home"],
    ["功能選單", "menu_home"],
    ["返回", "menu_home"],
    ["返回上一頁", "menu_home"],
    ["返回主選單", "menu_home"],
    ["更多功能", "menu_more"],
    ["使用說明", "menu_help"],
  ])("allows exact public static action: %s", (text, action) => {
    const result = classifyLineFastPath(message(text));
    expect(result).toMatchObject({ eligible: true, action, source: "message" });
  });

  it("strips a true self mention before checking exact commands", () => {
    expect(classifyLineFastPath(message("選單", true))).toMatchObject({ eligible: true, action: "menu_home" });
  });

  it.each([
    ["action=menu_home", "menu_home"],
    ["action=menu_more", "menu_more"],
    ["action=menu_help", "menu_help"],
  ])("allows static postback %s", (data, action) => {
    expect(classifyLineFastPath(postback(data))).toMatchObject({ eligible: true, action, source: "postback" });
  });

  it.each([
    "快速紀錄",
    "今日狀況",
    "待確認資料",
    "歷史紀錄",
    "變更紀錄",
    "摘要",
    "管理功能",
    "開發選單",
    "系統狀態",
    "死亡5",
  ])("keeps stateful or business action on Queue: %s", (text) => {
    expect(classifyLineFastPath(message(text)).eligible).toBe(false);
  });

  it("denies stateful parameters even when the base action is public", () => {
    expect(classifyLineFastPath(postback("action=menu_home&candidate=candidate-1")).eligible).toBe(false);
    expect(classifyLineFastPath(postback("action=menu_more&page=2")).eligible).toBe(false);
  });

  it("denies unknown postbacks by default", () => {
    expect(classifyLineFastPath(postback("action=not_in_allowlist")).eligible).toBe(false);
  });
});
