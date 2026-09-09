import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { PRODUCTION_AI_MODEL } from "./analysis";

const sourceRoot = resolve(import.meta.dirname);

describe("Workers AI call-site compatibility", () => {
  it("has no executable response_format field in production TypeScript call sites", () => {
    const files = ["ambient.ts", "analysis.ts", "index.ts", "semantic.ts", "conversational-agent.ts", "conversation-v2.ts", "model-registry.ts", "model-portability.ts"];
    const source = files.map((file) => readFileSync(resolve(sourceRoot, file), "utf8")).join("\n");
    expect(source).not.toMatch(/response_format\s*:/u);
    expect(source).not.toMatch(/json_schema\s*:/u);
  });

  it("keeps all known production AI paths on the canonical model", () => {
    const files = ["ambient.ts", "analysis.ts", "index.ts", "semantic.ts", "conversational-agent.ts", "conversation-v2.ts", "model-registry.ts", "model-portability.ts"];
    const source = files.map((file) => readFileSync(resolve(sourceRoot, file), "utf8")).join("\n");
    expect(PRODUCTION_AI_MODEL).toBe("@cf/meta/llama-3.1-8b-instruct-fast");
    expect(source).toContain("resolveModelForRole(\"ANALYSIS\")");
    expect(source).toContain("resolveModelForRole(\"AMBIENT_EXTRACTION\")");
    const historicalThreeB = source.match(/@cf\/meta\/llama-3\.2-3b-instruct/gu) ?? [];
    expect(historicalThreeB).toHaveLength(1);
    expect(source).toContain("modelIdForKey(MODEL_KEYS.HISTORICAL_3B)");
    expect(source).not.toMatch(/env\.AI\.run\([^\n]+,\s*\{[^}]*write/isu);
  });

  it("does not pin the local Conversation V2 harness to the retired default", () => {
    const config = JSON.parse(readFileSync(resolve(sourceRoot, "../wrangler.jsonc"), "utf8")) as { vars?: Record<string, unknown> };
    const harness = readFileSync(resolve(sourceRoot, "../scripts/conversation-v2-runtime-local.mjs"), "utf8");
    expect(config.vars).not.toHaveProperty("CONVERSATION_MODEL");
    expect(harness).not.toContain("CONVERSATION_MODEL:@cf/meta/llama-3.2-3b-instruct");
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
