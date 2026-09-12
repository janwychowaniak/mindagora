// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiGet, apiPost, type ApiFailure, type ApiResult } from "@/lib/api-client";
import { conversation, deferred, failure, message, ok, participant } from "@/test/fixtures";
import type { ConversationDetailsDTO, CreateMessageResponseDTO } from "@/types";

import { useConversation } from "./useConversation";

vi.mock("@/lib/api-client", () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));

const alpha = participant({ id: "p-alpha", alias: "Alpha" });
const beta = participant({ id: "p-beta", alias: "Beta" });
const existing = conversation({
  id: "c-1",
  messages: [message({ id: "m-1", content: "Hello" })],
});

// apiGet answers by path: the hook loads participants and (for an existing id) the conversation in parallel.
const answerGet = (conversationResult: ApiResult<ConversationDetailsDTO> = ok(existing)) => {
  vi.mocked(apiGet).mockImplementation(async (path: string) =>
    path === "/api/ai-participants" ? ok([alpha, beta]) : conversationResult
  );
};

const renderReady = async (conversationId: string | null) => {
  const rendered = renderHook(() => useConversation(conversationId));
  await waitFor(() => expect(rendered.result.current.status).toBe("ready"));
  return rendered;
};

describe("useConversation", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPost).mockReset();
    vi.spyOn(window.history, "replaceState").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loading", () => {
    it("loads only the participants for a draft", async () => {
      answerGet();

      const { result } = await renderReady(null);

      expect(apiGet).toHaveBeenCalledTimes(1);
      expect(apiGet).toHaveBeenCalledWith("/api/ai-participants");
      expect(result.current.participants).toEqual([alpha, beta]);
      expect(result.current.conversation).toBeNull();
    });

    it("loads participants and the conversation for an existing id", async () => {
      answerGet();

      const { result } = await renderReady("c-1");

      expect(apiGet).toHaveBeenCalledWith("/api/ai-participants");
      expect(apiGet).toHaveBeenCalledWith("/api/conversations/c-1");
      expect(result.current.conversation).toEqual(existing);
    });

    it("reports an error when the participants cannot be loaded", async () => {
      vi.mocked(apiGet).mockImplementation(async (path: string) =>
        path === "/api/ai-participants" ? failure(500, "Database unavailable") : ok(existing)
      );

      const { result } = renderHook(() => useConversation("c-1"));

      await waitFor(() => expect(result.current.status).toBe("error"));
      expect(result.current.loadError).toBe("Database unavailable");
    });

    it("distinguishes a missing conversation (404) from other failures", async () => {
      answerGet(failure(404, "Conversation not found"));

      const { result } = renderHook(() => useConversation("c-missing"));

      await waitFor(() => expect(result.current.status).toBe("not-found"));
      expect(result.current.loadError).toBeNull();
    });

    it("reports other conversation failures with their message", async () => {
      answerGet(failure(500, "Database unavailable"));

      const { result } = renderHook(() => useConversation("c-1"));

      await waitFor(() => expect(result.current.status).toBe("error"));
      expect(result.current.loadError).toBe("Database unavailable");
    });
  });

  describe("send", () => {
    it("refuses an unknown participant without calling the API", async () => {
      answerGet();
      const { result } = await renderReady(null);

      let outcome: ApiFailure | null = null;
      await act(async () => {
        outcome = await result.current.send("Hi", "p-unknown");
      });

      expect(outcome).toMatchObject({ status: 0, message: "Choose a participant" });
      expect(apiPost).not.toHaveBeenCalled();
      expect(result.current.pending).toBeNull();
    });

    it("turns a draft into a conversation and swaps the URL without a reload", async () => {
      answerGet();
      const { result } = await renderReady(null);
      const request = deferred<ApiResult<ConversationDetailsDTO>>();
      vi.mocked(apiPost).mockReturnValue(request.promise);

      let outcome: Promise<ApiFailure | null> | undefined;
      act(() => {
        outcome = result.current.send("Hi", "p-alpha");
      });

      await waitFor(() => expect(result.current.pending).toEqual({ participant: alpha }));
      expect(apiPost).toHaveBeenCalledWith("/api/conversations", { user_message: "Hi", ai_participant_id: "p-alpha" });

      const created = conversation({
        id: "c-new",
        messages: [message({ content: "Hi" }), message({ id: "m-2", role: "assistant" })],
      });
      await act(async () => {
        request.resolve(ok(created));
        await outcome;
      });

      expect(await outcome).toBeNull();
      expect(result.current.pending).toBeNull();
      expect(result.current.conversation).toEqual(created);
      expect(window.history.replaceState).toHaveBeenCalledWith(null, "", "/conversations/c-new");
    });

    it("appends both messages to an existing conversation and bumps updated_at", async () => {
      answerGet();
      const { result } = await renderReady("c-1");
      const reply: CreateMessageResponseDTO = {
        user_message: message({ id: "m-2", content: "Next", created_at: "2026-09-12T11:00:00Z" }),
        ai_message: message({
          id: "m-3",
          role: "assistant",
          content: "Reply",
          ai_participant_id: "p-beta",
          ai_participant: { id: "p-beta", alias: "Beta", model_id: beta.model_id, color: beta.color },
          created_at: "2026-09-12T11:00:05Z",
        }),
      };
      vi.mocked(apiPost).mockResolvedValue(ok(reply));

      let outcome: ApiFailure | null = null;
      await act(async () => {
        outcome = await result.current.send("Next", "p-beta");
      });

      expect(outcome).toBeNull();
      expect(apiPost).toHaveBeenCalledWith("/api/conversations/c-1/messages", {
        content: "Next",
        ai_participant_id: "p-beta",
      });
      expect(result.current.conversation?.messages.map((m) => m.id)).toEqual(["m-1", "m-2", "m-3"]);
      expect(result.current.conversation?.updated_at).toBe("2026-09-12T11:00:05Z");
      expect(window.history.replaceState).not.toHaveBeenCalled();
    });

    it("clears the pending row and returns the failure when the exchange fails", async () => {
      answerGet();
      const { result } = await renderReady("c-1");
      vi.mocked(apiPost).mockResolvedValue(failure(500, "OpenRouter API error"));

      let outcome: ApiFailure | null = null;
      await act(async () => {
        outcome = await result.current.send("Next", "p-alpha");
      });

      expect(outcome).toMatchObject({ status: 500, message: "OpenRouter API error" });
      expect(result.current.pending).toBeNull();
      expect(result.current.conversation).toEqual(existing);
    });
  });
});
