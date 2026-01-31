import type { SupabaseClient } from "../../db/supabase.client.ts";
import type { AiParticipantDTO, CreateAiParticipantCommand, CreateAiParticipantResponseDTO } from "../../types.ts";

interface AiParticipantsResult {
  data: AiParticipantDTO[] | null;
  error: { message: string; code?: string } | null;
}

interface CreateAiParticipantResult {
  data: CreateAiParticipantResponseDTO | null;
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
