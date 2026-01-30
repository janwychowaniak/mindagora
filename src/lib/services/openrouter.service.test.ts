import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OPENROUTER_VALIDATE_KEY_TIMEOUT_MS,
  OpenRouterHttpError,
  OpenRouterInvalidResponseError,
  OpenRouterNetworkError,
  OpenRouterTimeoutError,
  getModels,
  sendChatCompletion,
  validateApiKey,
} from "./openrouter.service";

const apiKey = "test-key";

const stubFetch = (handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => {
  vi.stubGlobal("fetch", handler);
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const abortableFetch = (init?: RequestInit): Promise<Response> =>
  new Promise((_, reject) => {
    const signal = init?.signal;
    if (!signal) {
      return;
    }

    if (signal.aborted) {
      const error = new Error("Aborted");
      error.name = "AbortError";
      reject(error);
      return;
    }

    signal.addEventListener(
      "abort",
      () => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        reject(error);
      },
      { once: true }
    );
  });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("validateApiKey", () => {
  it("returns true for valid key payload", async () => {
    stubFetch(async () => jsonResponse({ data: { hash: "abc" } }));

    await expect(validateApiKey(apiKey)).resolves.toBe(true);
  });

  it("throws OpenRouterHttpError with pass-through details", async () => {
    stubFetch(async () => jsonResponse({ error: { code: 401, message: "Invalid API key" } }, 401));

    await expect(validateApiKey(apiKey)).rejects.toBeInstanceOf(OpenRouterHttpError);
    await expect(validateApiKey(apiKey)).rejects.toMatchObject({
      status: 401,
      apiError: { details: "Invalid API key" },
    });
  });

  it("throws OpenRouterTimeoutError on timeout", async () => {
    vi.useFakeTimers();
    stubFetch(async (_input, init) => abortableFetch(init));

    const promise = validateApiKey(apiKey);
    const expectation = expect(promise).rejects.toBeInstanceOf(OpenRouterTimeoutError);
    await vi.advanceTimersByTimeAsync(OPENROUTER_VALIDATE_KEY_TIMEOUT_MS + 1);

    await expectation;
  });

  it("throws OpenRouterNetworkError on network failure", async () => {
    stubFetch(async () => {
      throw new Error("Network down");
    });

    await expect(validateApiKey(apiKey)).rejects.toBeInstanceOf(OpenRouterNetworkError);
  });
});

describe("getModels", () => {
  it("normalizes array response to { data: [] }", async () => {
    stubFetch(async () => jsonResponse([{ id: "m1", name: "Model 1", pricing: { prompt: "1", completion: "2" } }]));

    await expect(getModels(apiKey)).resolves.toEqual({
      data: [{ id: "m1", name: "Model 1", pricing: { prompt: "1", completion: "2" } }],
    });
  });

  it("normalizes { data: [] } response", async () => {
    stubFetch(async () =>
      jsonResponse({
        data: [{ id: "m2", name: "Model 2", pricing: { prompt: 1, completion: 2 } }],
      })
    );

    await expect(getModels(apiKey)).resolves.toEqual({
      data: [{ id: "m2", name: "Model 2", pricing: { prompt: "1", completion: "2" } }],
    });
  });

  it("throws OpenRouterInvalidResponseError for invalid payload", async () => {
    stubFetch(async () => jsonResponse({}));

    await expect(getModels(apiKey)).rejects.toBeInstanceOf(OpenRouterInvalidResponseError);
  });
});

describe("sendChatCompletion", () => {
  it("returns assistant content", async () => {
    stubFetch(async () =>
      jsonResponse({
        choices: [{ message: { content: "Hello!" } }],
      })
    );

    await expect(
      sendChatCompletion(apiKey, {
        model: "test",
        messages: [{ role: "user", content: "hi" }],
      })
    ).resolves.toBe("Hello!");
  });

  it("throws OpenRouterInvalidResponseError when content is missing", async () => {
    stubFetch(async () => jsonResponse({ choices: [] }));

    await expect(
      sendChatCompletion(apiKey, {
        model: "test",
        messages: [{ role: "user", content: "hi" }],
      })
    ).rejects.toBeInstanceOf(OpenRouterInvalidResponseError);
  });

  it("throws OpenRouterHttpError for non-2xx responses", async () => {
    stubFetch(async () => jsonResponse({ error: { code: 429, message: "Rate limit" } }, 429));

    await expect(
      sendChatCompletion(apiKey, {
        model: "test",
        messages: [{ role: "user", content: "hi" }],
      })
    ).rejects.toBeInstanceOf(OpenRouterHttpError);
  });
});
