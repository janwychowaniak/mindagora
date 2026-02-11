import type { SupabaseClient } from "../../db/supabase.client.ts";
import type {
  AiParticipantSummaryDTO,
  ConversationMessageDTO,
  CreateConversationResponseDTO,
  CreateMessageResponseDTO,
} from "../../types.ts";

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

interface ConversationOwnershipResult {
  owned: boolean;
  error: { message: string; code?: string } | null;
}

interface ConversationMessagesResult {
  data: ConversationMessageDTO[] | null;
  error: { message: string; code?: string } | null;
}

interface CreateMessagePairResult {
  data: CreateMessageResponseDTO | null;
  error: {
    message: string;
    code?: string;
    cleanupFailed?: boolean;
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

const normalizeAiParticipant = (
  value: AiParticipantSummaryDTO | AiParticipantSummaryDTO[] | null
): AiParticipantSummaryDTO | null => {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
};

export const assertConversationOwnedByUser = async ({
  supabase,
  userId,
  conversationId,
}: {
  supabase: SupabaseClient;
  userId: string;
  conversationId: string;
}): Promise<ConversationOwnershipResult> => {
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return {
      owned: false,
      error: {
        message: error.message,
        code: error.code,
      },
    };
  }

  return { owned: Boolean(data), error: null };
};

export const getConversationMessages = async ({
  supabase,
  conversationId,
}: {
  supabase: SupabaseClient;
  conversationId: string;
}): Promise<ConversationMessagesResult> => {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id,conversation_id,role,content,ai_participant_id,created_at,ai_participant:ai_participants(id,alias,model_id,color)"
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    return {
      data: null,
      error: {
        message: error.message,
        code: error.code,
      },
    };
  }

  if (!data) {
    return {
      data: null,
      error: {
        message: "Conversation messages lookup returned null data.",
      },
    };
  }

  const normalized: ConversationMessageDTO[] = data.map((row) => ({
    ...row,
    ai_participant: normalizeAiParticipant(row.ai_participant),
  }));

  return { data: normalized, error: null };
};

export const createMessagePairWithCleanup = async ({
  supabase,
  conversationId,
  userContent,
  aiContent,
  aiParticipantId,
  participantSummary,
}: {
  supabase: SupabaseClient;
  conversationId: string;
  userContent: string;
  aiContent: string;
  aiParticipantId: string;
  participantSummary: AiParticipantSummaryDTO;
}): Promise<CreateMessagePairResult> => {
  const { data: userMessageRow, error: userMessageError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      content: userContent,
      ai_participant_id: null,
    })
    .select("id,conversation_id,role,content,ai_participant_id,created_at")
    .single();

  if (userMessageError) {
    return {
      data: null,
      error: {
        message: userMessageError.message,
        code: extractErrorCode(userMessageError),
      },
    };
  }

  if (!userMessageRow) {
    return {
      data: null,
      error: {
        message: "User message insert returned null data.",
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

  if (aiMessageError) {
    // TODO(mvp): We intentionally skip compensating conversations.updated_at here.
    // Plan marks it as optional; if cleanup fails, caller logs CRITICAL and we revisit later.
    const { error: cleanupError } = await supabase.from("messages").delete().eq("id", userMessageRow.id);

    return {
      data: null,
      error: {
        message: aiMessageError.message,
        code: extractErrorCode(aiMessageError),
        cleanupFailed: Boolean(cleanupError),
        cleanupError: cleanupError
          ? {
              message: cleanupError.message,
              code: extractErrorCode(cleanupError),
            }
          : undefined,
      },
    };
  }

  if (!aiMessageRow) {
    // TODO(mvp): We intentionally skip compensating conversations.updated_at here.
    // Plan marks it as optional; if cleanup fails, caller logs CRITICAL and we revisit later.
    const { error: cleanupError } = await supabase.from("messages").delete().eq("id", userMessageRow.id);

    return {
      data: null,
      error: {
        message: "AI message insert returned null data.",
        cleanupFailed: Boolean(cleanupError),
        cleanupError: cleanupError
          ? {
              message: cleanupError.message,
              code: extractErrorCode(cleanupError),
            }
          : undefined,
      },
    };
  }

  return {
    data: {
      user_message: {
        ...userMessageRow,
        ai_participant: null,
      },
      ai_message: {
        ...aiMessageRow,
        ai_participant: participantSummary,
      },
    },
    error: null,
  };
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
