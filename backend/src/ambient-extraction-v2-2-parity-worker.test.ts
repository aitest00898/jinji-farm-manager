import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import worker from "./ambient-extraction-v2-2-parity-worker";
import {
  AMBIENT_V2_2_PARITY_PATH,
  AMBIENT_V2_2_PARITY_MODEL,
} from "./ambient-extraction-v2-2-parity-contract";
import { AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT } from "./ambient-extraction-v2-2";
import type { AmbientV2_2ParityWorkerEnv } from "./ambient-extraction-v2-2-parity-contract";

function config() {
  return JSON.parse(readFileSync(resolve(process.cwd(), "wrangler.parity.jsonc"), "utf8")) as Record<string, any>;
}

function envFor(run: (model: string, input: Record<string, unknown>) => Promise<unknown>) {
  return {
    PARITY_LOCAL_ONLY: "1",
    AI: { run } as unknown as Ai,
  } as AmbientV2_2ParityWorkerEnv;
}

async function post(run: (model: string, input: Record<string, unknown>) => Promise<unknown>, body: unknown = { caseRef: "D03" }) {
  const response = await worker.fetch(
    new Request(`http://127.0.0.1${AMBIENT_V2_2_PARITY_PATH}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    envFor(run),
  );
  return { response, payload: await response.json() as Record<string, unknown> };
}

describe("V2.2 local Worker and remote-AI parity boundary", () => {
  it("uses a dedicated AI-only config with explicit remote binding", () => {
    const value = config();
    expect(value.name).toBe("chicken-line-v2-2-ai-parity-local");
    expect(value.main).toBe("src/ambient-extraction-v2-2-parity-worker.ts");
    expect(value.ai).toEqual({ binding: "AI", remote: true });
    expect(value.workers_dev).toBe(false);
    expect(value.preview_urls).toBe(false);
    expect(value).not.toHaveProperty("d1_databases");
    expect(value).not.toHaveProperty("queues");
    expect(value).not.toHaveProperty("routes");
    expect(value).not.toHaveProperty("triggers");
    expect(value).not.toHaveProperty("secrets");
  });

  it("builds the frozen D03 request and forwards the structured input once", async () => {
    const run = vi.fn(async (_model: string, _input: Record<string, unknown>) => ({
      response: { operations: [], abnormalities: [{ detail: "咳嗽", quantity: null }] },
    }));
    const result = await post(run);
    const input = run.mock.calls[0]?.[1];
    expect(result.response.status).toBe(200);
    expect(result.payload).toMatchObject({
      ok: true,
      caseRef: "D03",
      model: AMBIENT_V2_2_PARITY_MODEL,
      requestResponseFormatPresent: true,
      requestResponseFormatPreserved: true,
      promptUnchanged: true,
      providerResponseConfirmed: true,
      responseBoundaryReached: true,
      responseClass: "STRUCTURED_OBJECT_RESPONSE",
      structuralStatus: "PASS",
      factExtraction: "PASS",
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(input).toMatchObject({
      max_tokens: 1536,
      temperature: 0,
      stream: false,
      response_format: AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT,
    });
    expect(input?.messages).toHaveLength(2);
    expect(JSON.stringify(result.payload)).not.toContain("咳嗽");
    expect(JSON.stringify(result.payload)).not.toContain("金雞測試場");
  });

  it("classifies a binding provider error without exposing its contents", async () => {
    const result = await post(async () => ({ success: false, errors: [{ code: 3036, message: "provider detail" }] }));
    expect(result.response.status).toBe(200);
    expect(result.payload).toMatchObject({
      ok: false,
      providerResponseConfirmed: true,
      responseClass: "PROVIDER_JSON_MODE_ERROR",
      structuralStatus: "FAIL",
      factExtraction: "NOT_EVALUATED",
    });
    expect(JSON.stringify(result.payload)).not.toContain("3036");
    expect(JSON.stringify(result.payload)).not.toContain("provider detail");
  });

  it("fails closed for non-D03 requests and for missing local-only config", async () => {
    const run = vi.fn(async (_model: string, _input: Record<string, unknown>) => ({ response: "unused" }));
    const invalidCase = await post(run, { caseRef: "D04" });
    expect(invalidCase.response.status).toBe(400);
    expect(run).not.toHaveBeenCalled();

    const disabled = await worker.fetch(
      new Request(`http://127.0.0.1${AMBIENT_V2_2_PARITY_PATH}`, { method: "POST", body: JSON.stringify({ caseRef: "D03" }) }),
      { AI: { run } as unknown as Ai },
    );
    expect(disabled.status).toBe(404);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not import the Production Worker entrypoint", () => {
    const source = readFileSync(resolve(process.cwd(), "src/ambient-extraction-v2-2-parity-worker.ts"), "utf8");
    expect(source).not.toContain("./index");
    expect(source).not.toContain("DB");
    expect(source).not.toContain("EVENTS");
    expect(source).not.toContain("LINE_CHANNEL");
  });

  it("keeps the dedicated Worker entrypoint default-only", () => {
    const source = readFileSync(resolve(process.cwd(), "src/ambient-extraction-v2-2-parity-worker.ts"), "utf8");
    expect(source).toMatch(/^export default worker;$/m);
    expect(source).not.toMatch(/^\s*export\s+(const|let|var|function|class|interface|type)\b/m);
    expect(source).not.toMatch(/^\s*export\s*(\{|\*)/m);
  });
});
