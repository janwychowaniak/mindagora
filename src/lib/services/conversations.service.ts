import type { SupabaseClient } from "../../db/supabase.client.ts";
import type {
  AiParticipantSummaryDTO,
  ConversationListItemDTO,
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

interface ConversationListResult {
  data: ConversationListItemDTO[] | null;
  error: { message: string; code?: string } | null;
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

interface EmbeddedMessageCountRow {
  count?: unknown;
}

interface ConversationWithEmbeddedCountRow {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: EmbeddedMessageCountRow[] | null;
}

const isEmbeddedMessageCountRows = (value: unknown): value is EmbeddedMessageCountRow[] => {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((entry) => typeof entry === "object" && entry !== null);
};

const getEmbeddedMessageCount = (row: ConversationWithEmbeddedCountRow): number => {
  const embedded = row.message_count;

  if (!isEmbeddedMessageCountRows(embedded)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[GET /api/conversations] Unexpected embedded count shape for conversation ${row.id}. ` +
        `Raw value: ${JSON.stringify(embedded)}. Defaulting to 0.`
    );
    return 0;
  }

  const rawCount = embedded[0]?.count;
  if (typeof rawCount !== "number") {
    // eslint-disable-next-line no-console
    console.warn(
      `[GET /api/conversations] Unexpected embedded count shape for conversation ${row.id}. ` +
        `Raw value: ${JSON.stringify(embedded)}. Defaulting to 0.`
    );
    return 0;
  }

  return rawCount;
};

const listConversationsForUserWithMessageCountFallback = async ({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<ConversationListResult> => {
  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select("id,user_id,title,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (conversationsError) {
    return {
      data: null,
      error: {
        message: conversationsError.message,
        code: conversationsError.code,
      },
    };
  }

  if (!conversations) {
    return {
      data: null,
      error: {
        message: "Conversation list lookup returned null data.",
      },
    };
  }

  if (conversations.length === 0) {
    return { data: [], error: null };
  }

  const conversationIds = conversations.map((conversation) => conversation.id);
  const { data: messageRows, error: messagesError } = await supabase
    .from("messages")
    .select("conversation_id")
    .in("conversation_id", conversationIds);

  if (messagesError) {
    return {
      data: null,
      error: {
        message: messagesError.message,
        code: messagesError.code,
      },
    };
  }

  const messageCountByConversationId = new Map<string, number>();

  for (const row of messageRows ?? []) {
    const currentCount = messageCountByConversationId.get(row.conversation_id) ?? 0;
    messageCountByConversationId.set(row.conversation_id, currentCount + 1);
  }

  const normalized: ConversationListItemDTO[] = conversations.map((conversation) => ({
    ...conversation,
    message_count: messageCountByConversationId.get(conversation.id) ?? 0,
  }));

  return { data: normalized, error: null };
};

export const listConversationsForUserWithMessageCount = async ({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<ConversationListResult> => {
  const { data, error } = await supabase
    .from("conversations")
    .select("id,user_id,title,created_at,updated_at,message_count:messages(count)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[GET /api/conversations] Embedded count query failed. Falling back to 2-query strategy.", {
      route: "/api/conversations",
      method: "GET",
      status: 500,
      userId,
      supabase_error_code: error.code,
    });
    return listConversationsForUserWithMessageCountFallback({ supabase, userId });
  }

  if (!data) {
    return {
      data: null,
      error: {
        message: "Conversation list lookup returned null data.",
      },
    };
  }

  const normalized: ConversationListItemDTO[] = data.map((row) => {
    const typedRow = row as ConversationWithEmbeddedCountRow;
    return {
      id: typedRow.id,
      user_id: typedRow.user_id,
      title: typedRow.title,
      created_at: typedRow.created_at,
      updated_at: typedRow.updated_at,
      message_count: getEmbeddedMessageCount(typedRow),
    };
  });

  return { data: normalized, error: null };
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
