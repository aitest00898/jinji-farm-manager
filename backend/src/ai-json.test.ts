import { describe, expect, it } from "vitest";
import { extractJsonResult, extractJsonValue } from "./ai-json";

function expectExtracted(raw: string, expected: unknown) {
  const result = extractJsonResult(raw);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.value).toEqual(expected);
}

describe("bounded JSON response extraction", () => {
  it("accepts direct valid JSON", () => {
    const value = { status: "ok", count: 3 };
    expectExtracted(JSON.stringify(value), value);
  });

  it("accepts a fenced valid JSON object", () => {
    const value = { status: "ok", count: 3 };
    expectExtracted(["```json", JSON.stringify(value), "```"].join("\n"), value);
  });

  it("accepts one valid JSON object inside wrapper prose", () => {
    const value = { status: "ok", count: 3 };
    expectExtracted(`Here is the result:\n${JSON.stringify(value)}\nEnd of result.`, value);
  });

  it("accepts the valid candidate when wrapper prose has unrelated braces", () => {
    const value = { status: "ok", count: 3 };
    expectExtracted(`Diagnostic note {not valid JSON} follows:\n${JSON.stringify(value)}`, value);
  });

  it("tries balanced candidates independently and selects the only valid one", () => {
    const value = { status: "ok", count: 3 };
    expectExtracted(`prefix {"broken":} then ${JSON.stringify(value)} suffix`, value);
  });

  it("ignores quoted braces while scanning an object", () => {
    const value = { message: "literal { brace } and } brace" };
    expectExtracted(`Model response: ${JSON.stringify(value)}`, value);
  });

  it("respects escaped quotes and backslashes inside JSON strings", () => {
    const value = { message: 'quoted "text" and path C:\\farm\\house' };
    expectExtracted(`Model response: ${JSON.stringify(value)}`, value);
  });

  it("fails closed when an object is truncated", () => {
    expect(extractJsonResult('prefix {"outer":{"inner":1}')).toEqual({
      ok: false,
      failure: "json_object_unterminated",
    });
  });

  it("fails closed for a balanced but malformed JSON candidate", () => {
    expect(extractJsonResult('prefix {"outer":}')).toEqual({
      ok: false,
      failure: "json_object_candidate_invalid",
    });
  });

  it("fails closed when no object candidate exists", () => {
    expect(extractJsonResult("plain response with no structured data")).toEqual({
      ok: false,
      failure: "json_no_object_candidate",
    });
    expect(extractJsonValue("plain response with no structured data")).toBeNull();
  });

  it("fails closed when multiple valid object candidates are ambiguous", () => {
    expect(extractJsonResult('first {"one":1} then {"two":2}')).toEqual({
      ok: false,
      failure: "json_object_candidate_ambiguous",
    });
  });
});
