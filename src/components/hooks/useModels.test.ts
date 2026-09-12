// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiGet, type ApiResult } from "@/lib/api-client";
import { deferred, failure, model, ok } from "@/test/fixtures";
import type { OpenRouterModelListDTO } from "@/types";

import { useModels } from "./useModels";

vi.mock("@/lib/api-client", () => ({ apiGet: vi.fn() }));

const models = [
  model({ id: "openai/gpt-4o-mini" }),
  model({ id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5" }),
];

describe("useModels", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
  });

  it("stays idle until asked (the list loads on the first open of the combobox)", () => {
    const { result } = renderHook(() => useModels());

    expect(result.current.status).toBe("idle");
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("goes through loading to ready with the model list", async () => {
    const request = deferred<ApiResult<OpenRouterModelListDTO>>();
    vi.mocked(apiGet).mockReturnValue(request.promise);
    const { result } = renderHook(() => useModels());

    act(() => {
      void result.current.load();
    });

    expect(result.current.status).toBe("loading");
    await act(async () => {
      request.resolve(ok({ data: models }));
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.models).toEqual(models);
    expect(apiGet).toHaveBeenCalledWith("/api/openrouter-models");
  });

  it("loads once per island: a second call does not hit the API again", async () => {
    vi.mocked(apiGet).mockResolvedValue(ok({ data: models }));
    const { result } = renderHook(() => useModels());

    await act(async () => {
      await result.current.load();
      await result.current.load();
    });

    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it("lets a plain load() try again after a failure (the started flag is reset)", async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(failure(0))
      .mockResolvedValueOnce(ok({ data: models }));
    const { result } = renderHook(() => useModels());

    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      await result.current.load();
    });

    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("ready");
  });

  it("names the missing key on 412 (only reachable on the settings page)", async () => {
    vi.mocked(apiGet).mockResolvedValue(failure(412, "No API key"));
    const { result } = renderHook(() => useModels());

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.message).toBe("Add your OpenRouter API key first.");
  });

  it("shows the failure message for other errors and allows an explicit retry", async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(failure(502, "OpenRouter unavailable"))
      .mockResolvedValueOnce(ok({ data: models }));
    const { result } = renderHook(() => useModels());

    await act(async () => {
      await result.current.load();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.message).toBe("OpenRouter unavailable");

    await act(async () => {
      await result.current.load(true);
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.message).toBeNull();
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});
