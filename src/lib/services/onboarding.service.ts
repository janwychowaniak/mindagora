import type { SupabaseClient } from "../../db/supabase.client.ts";
import { countAiParticipants } from "./ai-participants.service.ts";
import { getUserSettings } from "./user-settings.service.ts";

// Onboarding is complete once the user has an OpenRouter key and at least two AI participants (PRD §3.2).
// Pages call this server-side to decide on a redirect; the middleware stays session-only.

export type OnboardingStep = "api-key" | "participants" | "complete";

export interface OnboardingStatus {
  hasApiKey: boolean;
  participantCount: number;
}

interface OnboardingStatusResult {
  data: OnboardingStatus | null;
  error: { message: string; code?: string } | null;
}

export const MIN_PARTICIPANTS = 2;

export const getOnboardingStatus = async ({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<OnboardingStatusResult> => {
  const settings = await getUserSettings({ supabase, userId });
  if (settings.error) {
    return { data: null, error: settings.error };
  }

  const participants = await countAiParticipants(supabase, userId);
  if (participants.error || participants.count === null) {
    return { data: null, error: participants.error ?? { message: "AI participants count unavailable." } };
  }

  return {
    data: {
      hasApiKey: Boolean(settings.data?.openrouter_api_key),
      participantCount: participants.count,
    },
    error: null,
  };
};

export const resolveOnboardingStep = ({ hasApiKey, participantCount }: OnboardingStatus): OnboardingStep => {
  if (!hasApiKey) {
    return "api-key";
  }

  if (participantCount < MIN_PARTICIPANTS) {
    return "participants";
  }

  return "complete";
};
