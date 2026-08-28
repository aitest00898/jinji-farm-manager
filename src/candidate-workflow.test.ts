import { describe, expect, it } from "vitest";
import { parseCandidateRepairIntent } from "./candidate-workflow";

describe("candidate repair intent", () => {
  it("parses farm patches without losing the natural-language scope", () => {
    expect(parseCandidateRepairIntent("不是金雞測試場，是二林場")).toMatchObject({ kind: "set_field", field: "farm", value: "二林場" });
    expect(parseCandidateRepairIntent("改成東勢場")).toMatchObject({ kind: "set_field", field: "farm", value: "東勢場" });
  });

  it("parses quantity patches", () => {
    expect(parseCandidateRepairIntent("數量不是5，是3")).toMatchObject({ kind: "set_field", field: "quantity", value: "3" });
  });

  it("recognizes cancel and minimum-question fallback", () => {
    expect(parseCandidateRepairIntent("這筆不要記")).toMatchObject({ kind: "cancel" });
    expect(parseCandidateRepairIntent("這筆不對")).toMatchObject({ kind: "select_field" });
    expect(parseCandidateRepairIntent("改一下")).toMatchObject({ kind: "select_field" });
  });
});
