import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLinePushPayload,
  buildLineReplyPayload,
  pushLine,
  replyLine,
  LineApiError,
  type Env,
} from "./index";
import {
  buildMainMenuFlex,
  buildQuickRecordCategoryReplies,
  buildTextMessage,
} from "./line-menu";

const env = {
  LINE_API_BASE: "https://line.test",
  LINE_CHANNEL_ACCESS_TOKEN: "test-only-token",
} as Env;

function okFetch() {
  return vi.fn(async () => new Response(JSON.stringify({ sentMessages: [] }), { status: 200 }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("global LINE outbound silent notification policy", () => {
  it("builds reply payloads with a request-level notificationDisabled=true", () => {
    const message = buildTextMessage("今日營運");
    expect(buildLineReplyPayload("reply-token", [message])).toEqual({
      replyToken: "reply-token",
      messages: [message],
      notificationDisabled: true,
    });
  });

  it("builds push payloads with a request-level notificationDisabled=true", () => {
    const message = buildTextMessage("雲林天氣");
    expect(buildLinePushPayload("group-id", [message])).toEqual({
      to: "group-id",
      messages: [message],
      notificationDisabled: true,
    });
  });

  it("sends exactly one silent Reply API request", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await replyLine("reply-token", [buildMainMenuFlex()], env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://line.test/v2/bot/message/reply");
    expect(JSON.parse(String(init.body))).toMatchObject({
      replyToken: "reply-token",
      notificationDisabled: true,
    });
    expect(JSON.parse(String(init.body)).messages[0].type).toBe("flex");
  });

  it("returns the LINE request id for successful delivery evidence", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sentMessages: [] }), { status: 200, headers: { "x-line-request-id": "req-success" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(replyLine("reply-token", [buildTextMessage("答案")], env)).resolves.toEqual({ status: 200, requestId: "req-success" });
    await expect(pushLine("group-id", [buildTextMessage("答案")], env)).resolves.toEqual({ status: 200, requestId: "req-success" });
  });

  it("sends exactly one silent Push API request", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await pushLine("group-id", [buildTextMessage("候選紀錄")], env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://line.test/v2/bot/message/push");
    expect(JSON.parse(String(init.body))).toMatchObject({
      to: "group-id",
      notificationDisabled: true,
    });
  });

  it("sends a fixed X-Line-Retry-Key with a Push fallback", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    await pushLine("group-id", [buildTextMessage("稍後再試")], env, "11111111-1111-4111-8111-111111111111");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("X-Line-Retry-Key")).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("marks a 5xx Reply as ambiguous and a 4xx Reply as definitely unsent", async () => {
    const serverError = vi.fn(async () => new Response("temporary", { status: 503, headers: { "x-line-request-id": "req-503" } }));
    vi.stubGlobal("fetch", serverError);
    await expect(replyLine("reply-token", [buildTextMessage("答案")], env)).rejects.toMatchObject({ status: 503, ambiguous: true, requestId: "req-503" } satisfies Partial<LineApiError>);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid", { status: 400, headers: { "x-line-request-id": "req-400" } })));
    await expect(replyLine("reply-token", [buildTextMessage("答案")], env)).rejects.toMatchObject({ status: 400, ambiguous: false, requestId: "req-400" } satisfies Partial<LineApiError>);
  });

  it("treats a retry-key 409 as accepted rather than a new failure", async () => {
    const fetchMock = vi.fn(async () => new Response("duplicate retry key", { status: 409, headers: { "x-line-request-id": "req-409" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(pushLine("group-id", [buildTextMessage("答案")], env, "11111111-1111-4111-8111-111111111111")).rejects.toMatchObject({ status: 409, accepted: true } satisfies Partial<LineApiError>);
  });

  it("keeps Flex and Quick Reply message content unchanged while silencing the request", () => {
    const quickReply = buildQuickRecordCategoryReplies();
    const message = buildTextMessage("直接告訴我發生什麼即可。", quickReply);
    const payload = buildLineReplyPayload("reply-token", [message, buildMainMenuFlex()]);

    expect(payload.notificationDisabled).toBe(true);
    expect(payload.messages[0]).toEqual(message);
    expect(payload.messages[1]).toEqual(buildMainMenuFlex());
    expect(payload.messages[0].type).toBe("text");
    expect((payload.messages[0] as { quickReply?: unknown }).quickReply).toEqual(quickReply);
  });

  it("does not expose a caller override that can disable the global policy", () => {
    const payload = buildLineReplyPayload("reply-token", [buildTextMessage("錯誤訊息")]);
    expect(payload.notificationDisabled).toBe(true);
    expect(Object.keys(payload)).toEqual(["replyToken", "messages", "notificationDisabled"]);
  });
});
