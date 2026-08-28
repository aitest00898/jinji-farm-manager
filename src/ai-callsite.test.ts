import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

const sourceRoot = resolve(import.meta.dirname);

describe("Workers AI call-site compatibility", () => {
  it("has no executable response_format field in production TypeScript call sites", () => {
    const files = ["ambient.ts", "analysis.ts", "index.ts", "semantic.ts", "conversational-agent.ts", "conversation-v2.ts"];
    const source = files.map((file) => readFileSync(resolve(sourceRoot, file), "utf8")).join("\n");
    expect(source).not.toMatch(/response_format\s*:/u);
    expect(source).not.toMatch(/json_schema\s*:/u);
  });

  it("keeps all known production AI paths on the pinned model", () => {
    const files = ["ambient.ts", "analysis.ts", "index.ts", "semantic.ts", "conversational-agent.ts", "conversation-v2.ts"];
    const source = files.map((file) => readFileSync(resolve(sourceRoot, file), "utf8")).join("\n");
    expect(source).toContain("@cf/meta/llama-3.2-3b-instruct");
    expect(source).not.toMatch(/env\.AI\.run\([^\n]+,\s*\{[^}]*write/isu);
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
