import { describe, expect, it } from "vitest";

const farms = [
  ["林志騰二林場", 0.5, 0.1],
  ["林志騰東勢場", 0.4, 0.2],
  ["廖纔藝場", 0.5, 0.1],
  ["陳駿榜龍潭場", 0.1, 0.05],
  ["洪秀美場", 0.3, 0.25],
  ["黃惠玲太保場", 0.3, 0.1],
  ["林楷威場", 0.25, 0.1],
  ["洪嘉卿場", 0.4, 0.2],
] as const;

const transactions = [
  ["林志騰二林場", "114/12/17", 688462, 68846.2, 0, 68846.2],
  ["林志騰二林場", "115/04/15", 1166129, 116612.9, 0, 116612.9],
  ["林志騰二林場", "115/08/12", -133230, -13323, 4000, -17323],
  ["林志騰東勢場", "115/03/25", 351709, 70341.8, 0, 70341.8],
  ["林志騰東勢場", "115/07/29", -2805, -561, 1500, -2061],
  ["廖纔藝場", "115/07/22", 58205, 5820.5, 0, 5820.5],
  ["廖纔藝場", "115/08/12", 46635, 4663.5, 0, 4663.5],
  ["洪秀美場", "115/07/15", -84000, -21000, 0, -21000],
  ["洪秀美場", "115/08/12", 55856, 13964, 0, 13964],
  ["黃惠玲太保場", "115/02/25", 1207909, 120790.9, 0, 120790.9],
  ["黃惠玲太保場", "115/06/17", 641478, 64147.8, 0, 64147.8],
  ["黃惠玲太保場", "115/08/12", 45350, 4535, 0, 4535],
] as const;

const rocToGregorian = (value: string): string => {
  const [year, month, day] = value.split("/").map(Number);
  return `${year + 1911}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

describe("authoritative 大富翁資料 import contract", () => {
  it("contains eight farms, three equal investors, and precise player fractions", () => {
    expect(farms).toHaveLength(8);
    expect(["SUGAR", "何先生", "承蠔"]).toHaveLength(3);
    expect(farms.map((farm) => farm[2] / 3)).toContain(0.03333333333333333);
    expect(Number((0.1 / 3).toFixed(16))).toBe(0.0333333333333333);
    expect(Number((0.2 / 3).toFixed(16))).toBe(0.0666666666666667);
  });

  it("converts ROC dates and excludes total/zero placeholder rows", () => {
    expect(rocToGregorian("114/12/17")).toBe("2025-12-17");
    expect(rocToGregorian("115/08/12")).toBe("2026-08-12");
    expect(transactions).toHaveLength(12);
    expect(transactions.every((row) => String(row[1]).includes("/") && String(row[1]) !== "總計")).toBe(true);
    expect(transactions.filter((row) => Number(row[2]) === 0 && Number(row[3]) === 0 && Number(row[4]) === 0 && Number(row[5]) === 0)).toHaveLength(0);
  });

  it("matches the required historical distribution totals and allocation totals", () => {
    const totals = transactions.reduce(
      (acc, row) => ({
        gross: acc.gross + row[2],
        allocated: acc.allocated + row[3],
        expense: acc.expense + row[4],
        net: acc.net + row[5],
      }),
      { gross: 0, allocated: 0, expense: 0, net: 0 },
    );
    expect(totals.gross).toBe(4041698);
    expect(totals.allocated).toBeCloseTo(434838.6, 9);
    expect(totals.expense).toBe(5500);
    expect(totals.net).toBeCloseTo(429338.6, 9);
    expect(totals.net / 3).toBeCloseTo(143112.86666666667, 9);
    expect(transactions.filter((row) => String(row[0]) === "陳駿榜龍潭場")).toHaveLength(0);
    expect(transactions.filter((row) => String(row[0]) === "林楷威場")).toHaveLength(0);
    expect(transactions.filter((row) => String(row[0]) === "洪嘉卿場")).toHaveLength(0);
  });
});
