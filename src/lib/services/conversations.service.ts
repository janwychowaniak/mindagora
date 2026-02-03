import type { SupabaseClient } from "../../db/supabase.client.ts";
import type { AiParticipantSummaryDTO, CreateConversationResponseDTO } from "../../types.ts";

interface CreateConversationResult {
  data: CreateConversationResponseDTO | null;
  error: {
    message: string;
    code?: string;
    cleanupFailed?: boolean;
    conversationId?: string;
    cleanupError?: { message: string; code?: string };
  } | null;
}

const extractErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  return undefined;
};

export const createConversationWithInitialExchange = async ({
  supabase,
  userId,
  title,
  userMessage,
  aiParticipantId,
  aiContent,
  participantSummary,
}: {
  supabase: SupabaseClient;
  userId: string;
  title: string;
  userMessage: string;
  aiParticipantId: string;
  aiContent: string;
  participantSummary: AiParticipantSummaryDTO;
}): Promise<CreateConversationResult> => {
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title })
    .select("id,user_id,title,created_at,updated_at")
    .single();

  if (conversationError) {
    return {
      data: null,
      error: {
        message: conversationError.message,
        code: extractErrorCode(conversationError),
      },
    };
  }

  if (!conversation) {
    return {
      data: null,
      error: {
        message: "Conversation insert returned null data.",
      },
    };
  }

  const conversationId = conversation.id;

  const { data: userMessageRow, error: userMessageError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      content: userMessage,
      ai_participant_id: null,
    })
    .select("id,conversation_id,role,content,ai_participant_id,created_at")
    .single();

  if (userMessageError || !userMessageRow) {
    const message = userMessageError?.message ?? "User message insert returned null data.";
    const { error: deleteError } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId)
      .eq("user_id", userId);

    return {
      data: null,
      error: {
        message,
        code: extractErrorCode(userMessageError),
        cleanupFailed: Boolean(deleteError),
        conversationId,
        cleanupError: deleteError
          ? {
              message: deleteError.message,
              code: extractErrorCode(deleteError),
            }
          : undefined,
      },
    };
  }

  const { data: aiMessageRow, error: aiMessageError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      content: aiContent,
      ai_participant_id: aiParticipantId,
    })
    .select("id,conversation_id,role,content,ai_participant_id,created_at")
    .single();

  if (aiMessageError || !aiMessageRow) {
    const message = aiMessageError?.message ?? "AI message insert returned null data.";
    const { error: deleteError } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId)
      .eq("user_id", userId);

    return {
      data: null,
      error: {
        message,
        code: extractErrorCode(aiMessageError),
        cleanupFailed: Boolean(deleteError),
        conversationId,
        cleanupError: deleteError
          ? {
              message: deleteError.message,
              code: extractErrorCode(deleteError),
            }
          : undefined,
      },
    };
  }

  let finalConversation = conversation;
  const { data: refreshedConversation, error: refreshError } = await supabase
    .from("conversations")
    .select("id,user_id,title,created_at,updated_at")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  if (!refreshError && refreshedConversation) {
    finalConversation = refreshedConversation;
  }

  return {
    data: {
      ...finalConversation,
      messages: [
        {
          ...userMessageRow,
          ai_participant: null,
        },
        {
          ...aiMessageRow,
          ai_participant: participantSummary,
        },
      ],
    },
    error: null,
  };
};
