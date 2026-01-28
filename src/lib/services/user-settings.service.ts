import type { SupabaseClient } from "../../db/supabase.client.ts";
import type { UserSettingsDTO } from "../../types.ts";

interface UserSettingsResult {
  data: UserSettingsDTO | null;
  error: { message: string; code?: string } | null;
}

export const getUserSettings = async ({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<UserSettingsResult> => {
  const { data, error } = await supabase
    .from("user_settings")
    .select("id,user_id,openrouter_api_key,created_at")
    .eq("user_id", userId)
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

  return { data, error: null };
};
