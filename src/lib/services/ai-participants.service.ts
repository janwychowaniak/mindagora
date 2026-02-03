import type { SupabaseClient } from "../../db/supabase.client.ts";
import type {
  AiParticipantDTO,
  AiParticipantSummaryDTO,
  CreateAiParticipantCommand,
  CreateAiParticipantResponseDTO,
} from "../../types.ts";

interface AiParticipantsResult {
  data: AiParticipantDTO[] | null;
  error: { message: string; code?: string } | null;
}

interface AiParticipantCountResult {
  count: number | null;
  error: { message: string; code?: string } | null;
}

interface AiParticipantSummaryResult {
  data: AiParticipantSummaryDTO | null;
  error: { message: string; code?: string } | null;
}

interface CreateAiParticipantResult {
  data: CreateAiParticipantResponseDTO | null;
  error: { message: string; code?: string } | null;
}

interface DeleteAiParticipantResult {
  deleted: boolean;
  error: { message: string; code?: string } | null;
}

export const getAiParticipants = async ({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<AiParticipantsResult> => {
  const { data, error } = await supabase
    .from("ai_participants")
    .select("id,user_id,alias,model_id,color,created_at")
    .eq("user_id", userId)
    .order("alias", { ascending: true });

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
        message: "AI participants lookup returned null data.",
      },
    };
  }

  return { data, error: null };
};

export const countAiParticipants = async (
  supabase: SupabaseClient,
  userId: string
): Promise<AiParticipantCountResult> => {
  const { count, error } = await supabase
    .from("ai_participants")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    return {
      count: null,
      error: {
        message: error.message,
        code: error.code,
      },
    };
  }

  if (count === null) {
    return {
      count: null,
      error: {
        message: "AI participants count returned null.",
      },
    };
  }

  return { count, error: null };
};

export const getAiParticipantSummary = async (
  supabase: SupabaseClient,
  participantId: string
): Promise<AiParticipantSummaryResult> => {
  const { data, error } = await supabase
    .from("ai_participants")
    .select("id,alias,model_id,color")
    .eq("id", participantId)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: {
        message: error.message,
        code: error.code,
      },
    };
  }

  return { data: data ?? null, error: null };
};

export const createAiParticipant = async ({
  supabase,
  userId,
  command,
}: {
  supabase: SupabaseClient;
  userId: string;
  command: CreateAiParticipantCommand;
}): Promise<CreateAiParticipantResult> => {
  const { data, error } = await supabase
    .from("ai_participants")
    .insert({
      user_id: userId,
      ...command,
    })
    .select("id,user_id,alias,model_id,color,created_at")
    .single();

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
        message: "AI participant insert returned null data.",
      },
    };
  }

  return { data, error: null };
};

export const deleteAiParticipant = async ({
  supabase,
  participantId,
}: {
  supabase: SupabaseClient;
  participantId: string;
}): Promise<DeleteAiParticipantResult> => {
  const { data: participant, error: selectError } = await supabase
    .from("ai_participants")
    .select("id")
    .eq("id", participantId)
    .maybeSingle();

  if (selectError) {
    return {
      deleted: false,
      error: {
        message: selectError.message,
        code: selectError.code,
      },
    };
  }

  if (!participant) {
    return { deleted: false, error: null };
  }

  const { error: deleteError } = await supabase.from("ai_participants").delete().eq("id", participantId);

  if (deleteError) {
    return {
      deleted: false,
      error: {
        message: deleteError.message,
        code: deleteError.code,
      },
    };
  }

  return { deleted: true, error: null };
};
