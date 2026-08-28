import { describe, expect, it } from "vitest";
import { parseQuickCorrection, parseQuickCorrections } from "./quick-correction";

describe("natural-language quick correction parser", () => {
  it("prioritizes quantity correction", () => {
    expect(parseQuickCorrection("死亡不是5，是3")).toEqual({ kind: "quantity", oldQuantity: 5, newQuantity: 3 });
    expect(parseQuickCorrection("死亡改3")).toEqual({ kind: "quantity", oldQuantity: null, newQuantity: 3 });
  });

  it("distinguishes cancel, replacement, move, and whole cancel", () => {
    expect(parseQuickCorrection("咳嗽不要記")).toEqual({ kind: "cancel", rawText: "咳嗽" });
    expect(parseQuickCorrection("不是臭腳，是白冠")).toEqual({ kind: "replace", fromText: "臭腳", toText: "白冠" });
    expect(parseQuickCorrection("臭腳改白冠")).toEqual({ kind: "replace", fromText: "臭腳", toText: "白冠" });
    expect(parseQuickCorrection("剛剛全部是BBB場")).toEqual({ kind: "move", farmText: "BBB" });
    expect(parseQuickCorrection("剛剛全部取消")).toEqual({ kind: "whole_cancel" });
  });

  it("parses a multi-farm split into item assignments", () => {
    expect(parseQuickCorrection("死亡5是BBB場，咳嗽臭腳才是AAA場")).toEqual({
      kind: "partial_move",
      assignments: [
        { itemText: "死亡5", farmText: "BBB場" },
        { itemText: "咳嗽臭腳", farmText: "AAA場" },
      ],
    });
  });

  it("parses several corrections in one message", () => {
    expect(parseQuickCorrections("死亡不是5是3，咳嗽不要，臭腳改白冠")).toEqual([
      { kind: "quantity", oldQuantity: 5, newQuantity: 3 },
      { kind: "cancel", rawText: "咳嗽" },
      { kind: "replace", fromText: "臭腳", toText: "白冠" },
    ]);
  });
});
