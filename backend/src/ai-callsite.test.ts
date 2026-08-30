import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

const sourceRoot = resolve(import.meta.dirname);

describe("Workers AI call-site compatibility", () => {
  it("uses JSON Mode only for the isolated StructuredAnalysis path", () => {
    const files = ["ambient.ts", "analysis.ts", "index.ts", "semantic.ts", "conversational-agent.ts", "conversation-v2.ts"];
    const source = Object.fromEntries(files.map((file) => [file, readFileSync(resolve(sourceRoot, file), "utf8")])) as Record<string, string>;
    expect(source["analysis.ts"]).toContain("ANALYSIS_AI_MODEL");
    expect(source["analysis.ts"]).toContain("response_format: ANALYSIS_RESPONSE_FORMAT");
    const unrelatedSource = files.filter((file) => file !== "analysis.ts").map((file) => source[file]).join("\n");
    expect(unrelatedSource).not.toMatch(/response_format\s*:/u);
    expect(unrelatedSource).not.toMatch(/json_schema\s*:/u);
  });

  it("keeps unrelated production AI paths on the pinned general model", () => {
    const files = ["ambient.ts", "analysis.ts", "index.ts", "semantic.ts", "conversational-agent.ts", "conversation-v2.ts"];
    const source = Object.fromEntries(files.map((file) => [file, readFileSync(resolve(sourceRoot, file), "utf8")])) as Record<string, string>;
    const unrelatedSource = files.filter((file) => file !== "analysis.ts").map((file) => source[file]).join("\n");
    expect(unrelatedSource).toContain("@cf/meta/llama-3.2-3b-instruct");
    expect(unrelatedSource).not.toContain("@cf/meta/llama-3.1-8b-instruct-fast");
    expect(unrelatedSource).not.toMatch(/env\.AI\.run\([^\n]+,\s*\{[^}]*write/isu);
  });

  it("keeps the complete production AI invocation inventory explicit", () => {
    const files = ["ambient.ts", "analysis.ts", "index.ts", "semantic.ts", "conversational-agent.ts", "conversation-v2.ts"];
    const source = files.map((file) => readFileSync(resolve(sourceRoot, file), "utf8")).join("\n");
    const invocations = source.match(/(?:env\.AI|ai)\.run\(/gu) ?? [];
    expect(invocations).toHaveLength(6);
    expect(source).toContain("export async function classifyAbnormalWithAi");
    expect(source).toContain("export async function classifyConversationV2WithAi");
  });
});
