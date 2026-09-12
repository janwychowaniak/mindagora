import { useCallback, useEffect, useState } from "react";

import { apiDelete, apiGet, apiPut, type ApiFailure } from "@/lib/api-client";
import type {
  ApiSuccessResponseDTO,
  ConversationListItemDTO,
  UpdateConversationCommand,
  UpdateConversationResponseDTO,
} from "@/types";

type LoadStatus = "loading" | "ready" | "error";

// Conversation list state: loaded from the API (already sorted by updated_at desc), mutated locally after the
// API confirms a rename or a delete. A rename does not bump updated_at, so the order is left untouched.
export function useConversations() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [conversations, setConversations] = useState<ConversationListItemDTO[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus("loading");
    setLoadError(null);
    const result = await apiGet<ConversationListItemDTO[]>("/api/conversations");
    if (result.ok) {
      setConversations(result.data);
      setStatus("ready");
      return;
    }
    setLoadError(result.failure.message);
    setStatus("error");
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rename = useCallback(async (id: string, title: string): Promise<ApiFailure | null> => {
    const command: UpdateConversationCommand = { title };
    const result = await apiPut<UpdateConversationResponseDTO>(`/api/conversations/${id}`, command);
    if (!result.ok) {
      // Gone elsewhere (another tab, another device): drop it from the list instead of showing a stale row.
      if (result.failure.status === 404) {
        setConversations((current) => current.filter((conversation) => conversation.id !== id));
      }
      return result.failure;
    }
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id ? { ...conversation, title: result.data.title } : conversation
      )
    );
    return null;
  }, []);

  const remove = useCallback(async (id: string): Promise<ApiFailure | null> => {
    const result = await apiDelete<ApiSuccessResponseDTO>(`/api/conversations/${id}`);
    if (!result.ok && result.failure.status !== 404) {
      return result.failure;
    }
    setConversations((current) => current.filter((conversation) => conversation.id !== id));
    return null;
  }, []);

  return { status, conversations, loadError, reload, rename, remove };
}
