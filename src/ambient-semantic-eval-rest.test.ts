import { describe, expect, it, vi } from "vitest";
import { PRODUCTION_AI_MODEL } from "./analysis";
import { DirectWorkersAiRestAdapter } from "./ambient-semantic-eval-rest";

const input = {
  messages: [{ role: "system" as const, content: "system" }, { role: "user" as const, content: "user" }],
  max_tokens: 1536,
  temperature: 0,
};

function okFetch(result: unknown = { response: '{"decisions":[]}' }) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
    JSON.stringify({ success: true, result }),
    { status: 200, headers: { "content-type": "application/json" } },
  ));
}

describe("Direct Workers AI REST semantic-eval adapter", () => {
  it("forwards the exact Production input shape and only returns bounded metadata", async () => {
    const fetchImpl = okFetch();
    const adapter = new DirectWorkersAiRestAdapter({
      endpoint: "https://api.cloudflare.com/client/v4/accounts/account/ai/run/@cf/meta/llama-3.2-3b-instruct",
      token: "test-token-not-a-real-secret",
      fetchImpl,
    });

    await adapter.run(PRODUCTION_AI_MODEL, input);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual(input);
    expect(init.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer test-token-not-a-real-secret",
    });
    expect(adapter.lastCall).toEqual({
      httpStatus: 200,
      providerResponseConfirmed: true,
      errorCode: null,
      errorClass: null,
    });
  });

  it("fails closed on a provider error without exposing the token or response body", async () => {
    const token = "test-token-not-a-real-secret";
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ success: false, errors: [{ code: 5007, message: "permission denied" }] }),
      { status: 403, headers: { "content-type": "application/json" } },
    ));
    const adapter = new DirectWorkersAiRestAdapter({
      endpoint: "https://api.cloudflare.com/client/v4/accounts/account/ai/run/@cf/meta/llama-3.2-3b-instruct",
      token,
      fetchImpl,
    });

    let thrown: unknown;
    try {
      await adapter.run(PRODUCTION_AI_MODEL, input);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).toBe("REAL_MODEL_REST_HTTP_403: REAL_MODEL_REST_HTTP_403");
    expect(String(thrown)).not.toContain(token);
    expect(adapter.lastCall).toEqual({
      httpStatus: 403,
      providerResponseConfirmed: false,
      errorCode: "5007",
      errorClass: "AUTH_FAILURE",
    });
    expect(JSON.stringify(adapter.lastCall)).not.toContain("permission denied");
  });

  it("enforces the nine-call hard limit before a tenth network call", async () => {
    const fetchImpl = okFetch();
    const adapter = new DirectWorkersAiRestAdapter({
      endpoint: "https://api.cloudflare.com/client/v4/accounts/account/ai/run/@cf/meta/llama-3.2-3b-instruct",
      token: "test-token-not-a-real-secret",
      fetchImpl,
    });

    for (let index = 0; index < 9; index += 1) await adapter.run(PRODUCTION_AI_MODEL, input);
    await expect(adapter.run(PRODUCTION_AI_MODEL, input)).rejects.toThrow("REAL_MODEL_CALL_LIMIT_EXCEEDED");
    expect(adapter.calls).toBe(9);
    expect(fetchImpl).toHaveBeenCalledTimes(9);
  });

  it("supports a smaller developer-only call limit for schema micro diagnostics", async () => {
    const fetchImpl = okFetch();
    const adapter = new DirectWorkersAiRestAdapter({
      endpoint: "https://api.cloudflare.com/client/v4/accounts/account/ai/run/@cf/meta/llama-3.2-3b-instruct",
      token: "test-token-not-a-real-secret",
      fetchImpl,
      maxCalls: 3,
    });

    for (let index = 0; index < 3; index += 1) await adapter.run(PRODUCTION_AI_MODEL, input);
    await expect(adapter.run(PRODUCTION_AI_MODEL, input)).rejects.toThrow("REAL_MODEL_CALL_LIMIT_EXCEEDED");
    expect(adapter.calls).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("rejects a non-Production model without making a provider call", async () => {
    const fetchImpl = okFetch();
    const adapter = new DirectWorkersAiRestAdapter({
      endpoint: "https://api.cloudflare.com/client/v4/accounts/account/ai/run/@cf/meta/llama-3.2-3b-instruct",
      token: "test-token-not-a-real-secret",
      fetchImpl,
    });

    await expect(adapter.run("other-model", input)).rejects.toThrow("REAL_MODEL_MODEL_MISMATCH");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
