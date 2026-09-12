// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiDelete, apiGet, apiPut, type ApiFailure } from "@/lib/api-client";
import { failure, listItem, ok } from "@/test/fixtures";

import { useConversations } from "./useConversations";

vi.mock("@/lib/api-client", () => ({ apiGet: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn() }));

const first = listItem({ id: "c-1", title: "First" });
const second = listItem({ id: "c-2", title: "Second" });

const renderReady = async () => {
  vi.mocked(apiGet).mockResolvedValue(ok([first, second]));
  const rendered = renderHook(() => useConversations());
  await waitFor(() => expect(rendered.result.current.status).toBe("ready"));
  return rendered;
};

describe("useConversations", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPut).mockReset();
    vi.mocked(apiDelete).mockReset();
  });

  describe("loading", () => {
    it("starts loading and exposes the list in API order once it arrives", async () => {
      vi.mocked(apiGet).mockResolvedValue(ok([first, second]));

      const { result } = renderHook(() => useConversations());

      expect(result.current.status).toBe("loading");
      await waitFor(() => expect(result.current.status).toBe("ready"));
      expect(result.current.conversations).toEqual([first, second]);
      expect(apiGet).toHaveBeenCalledWith("/api/conversations");
    });

    it("reports a load failure with its message", async () => {
      vi.mocked(apiGet).mockResolvedValue(failure(500, "Database unavailable"));

      const { result } = renderHook(() => useConversations());

      await waitFor(() => expect(result.current.status).toBe("error"));
      expect(result.current.loadError).toBe("Database unavailable");
      expect(result.current.conversations).toEqual([]);
    });

    it("clears the error and reloads on demand", async () => {
      vi.mocked(apiGet)
        .mockResolvedValueOnce(failure(0))
        .mockResolvedValueOnce(ok([first]));
      const { result } = renderHook(() => useConversations());
      await waitFor(() => expect(result.current.status).toBe("error"));

      await act(async () => {
        await result.current.reload();
      });

      expect(result.current.status).toBe("ready");
      expect(result.current.loadError).toBeNull();
      expect(result.current.conversations).toEqual([first]);
    });
  });

  describe("rename", () => {
    it("updates the title in place and keeps the order (a rename does not bump updated_at)", async () => {
      const { result } = await renderReady();
      vi.mocked(apiPut).mockResolvedValue(ok({ ...second, title: "Renamed" }));

      let outcome: ApiFailure | null = null;
      await act(async () => {
        outcome = await result.current.rename("c-2", "Renamed");
      });

      expect(outcome).toBeNull();
      expect(apiPut).toHaveBeenCalledWith("/api/conversations/c-2", { title: "Renamed" });
      expect(result.current.conversations.map((c) => [c.id, c.title])).toEqual([
        ["c-1", "First"],
        ["c-2", "Renamed"],
      ]);
    });

    it("drops a conversation that is gone (404) instead of keeping a stale row", async () => {
      const { result } = await renderReady();
      vi.mocked(apiPut).mockResolvedValue(failure(404, "Conversation not found"));

      let outcome: ApiFailure | null = null;
      await act(async () => {
        outcome = await result.current.rename("c-1", "Renamed");
      });

      expect(outcome).toMatchObject({ status: 404 });
      expect(result.current.conversations.map((c) => c.id)).toEqual(["c-2"]);
    });

    it("leaves the list untouched on a validation failure and returns it to the editor", async () => {
      const { result } = await renderReady();
      vi.mocked(apiPut).mockResolvedValue(failure(400, { title: "Title cannot be empty" }));

      let outcome: ApiFailure | null = null;
      await act(async () => {
        outcome = await result.current.rename("c-1", "");
      });

      expect(outcome).toMatchObject({ status: 400, details: { title: "Title cannot be empty" } });
      expect(result.current.conversations).toEqual([first, second]);
    });
  });

  describe("remove", () => {
    it("removes the row after the API confirms", async () => {
      const { result } = await renderReady();
      vi.mocked(apiDelete).mockResolvedValue(ok({ message: "Conversation deleted" }));

      let outcome: ApiFailure | null = null;
      await act(async () => {
        outcome = await result.current.remove("c-1");
      });

      expect(outcome).toBeNull();
      expect(apiDelete).toHaveBeenCalledWith("/api/conversations/c-1");
      expect(result.current.conversations).toEqual([second]);
    });

    it("treats an already deleted conversation (404) as success", async () => {
      const { result } = await renderReady();
      vi.mocked(apiDelete).mockResolvedValue(failure(404, "Conversation not found"));

      let outcome: ApiFailure | null = null;
      await act(async () => {
        outcome = await result.current.remove("c-2");
      });

      expect(outcome).toBeNull();
      expect(result.current.conversations).toEqual([first]);
    });

    it("keeps the row and returns the failure on any other error", async () => {
      const { result } = await renderReady();
      vi.mocked(apiDelete).mockResolvedValue(failure(500, "Database unavailable"));

      let outcome: ApiFailure | null = null;
      await act(async () => {
        outcome = await result.current.remove("c-2");
      });

      expect(outcome).toMatchObject({ status: 500, message: "Database unavailable" });
      expect(result.current.conversations).toEqual([first, second]);
    });
  });
});
