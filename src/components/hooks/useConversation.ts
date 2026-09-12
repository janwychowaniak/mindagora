import { useCallback, useEffect, useState } from "react";

import { apiGet, apiPost, type ApiFailure } from "@/lib/api-client";
import type {
  AiParticipantDTO,
  ConversationDetailsDTO,
  CreateConversationCommand,
  CreateConversationResponseDTO,
  CreateMessageCommand,
  CreateMessageResponseDTO,
} from "@/types";

type LoadStatus = "loading" | "ready" | "not-found" | "error";

export interface PendingReply {
  participant: AiParticipantDTO;
}

// One hook for the draft (`conversationId === null`) and an existing conversation. The first successful
// exchange turns the draft into a conversation and swaps the URL without a reload (UI plan ap7 §0.5).
export function useConversation(conversationId: string | null) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [conversation, setConversation] = useState<ConversationDetailsDTO | null>(null);
  const [participants, setParticipants] = useState<AiParticipantDTO[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingReply | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setLoadError(null);

    const [participantsResult, conversationResult] = await Promise.all([
      apiGet<AiParticipantDTO[]>("/api/ai-participants"),
      conversationId ? apiGet<ConversationDetailsDTO>(`/api/conversations/${conversationId}`) : Promise.resolve(null),
    ]);

    if (!participantsResult.ok) {
      setLoadError(participantsResult.failure.message);
      setStatus("error");
      return;
    }
    setParticipants(participantsResult.data);

    if (conversationResult) {
      if (!conversationResult.ok) {
        if (conversationResult.failure.status === 404) {
          setStatus("not-found");
          return;
        }
        setLoadError(conversationResult.failure.message);
        setStatus("error");
        return;
      }
      setConversation(conversationResult.data);
    }

    setStatus("ready");
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Returns the failure for the view to show in the dialog, or null on success. While the request runs,
  // `pending` names the participant so the list can show the spinner row where the reply will appear.
  const send = useCallback(
    async (content: string, participantId: string): Promise<ApiFailure | null> => {
      const participant = participants.find((item) => item.id === participantId);
      if (!participant) {
        return {
          status: 0,
          error: "Validation error",
          details: "Choose a participant",
          message: "Choose a participant",
        };
      }

      setPending({ participant });

      if (!conversation) {
        const command: CreateConversationCommand = { user_message: content, ai_participant_id: participantId };
        const result = await apiPost<CreateConversationResponseDTO>("/api/conversations", command);
        setPending(null);
        if (!result.ok) {
          return result.failure;
        }
        setConversation(result.data);
        window.history.replaceState(null, "", `/conversations/${result.data.id}`);
        return null;
      }

      const command: CreateMessageCommand = { content, ai_participant_id: participantId };
      const result = await apiPost<CreateMessageResponseDTO>(`/api/conversations/${conversation.id}/messages`, command);
      setPending(null);
      if (!result.ok) {
        return result.failure;
      }
      setConversation((current) =>
        current
          ? {
              ...current,
              updated_at: result.data.ai_message.created_at,
              messages: [...current.messages, result.data.user_message, result.data.ai_message],
            }
          : current
      );
      return null;
    },
    [conversation, participants]
  );

  return { status, conversation, participants, loadError, pending, reload: load, send };
}
