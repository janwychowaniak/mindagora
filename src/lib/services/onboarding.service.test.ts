import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "../../db/supabase.client.ts";
import type { UserSettingsDTO } from "../../types.ts";
import { countAiParticipants } from "./ai-participants.service.ts";
import { getOnboardingStatus, MIN_PARTICIPANTS, resolveOnboardingStep } from "./onboarding.service.ts";
import { getUserSettings } from "./user-settings.service.ts";

vi.mock("./user-settings.service.ts", () => ({ getUserSettings: vi.fn() }));
vi.mock("./ai-participants.service.ts", () => ({ countAiParticipants: vi.fn() }));

// The Supabase client is never touched: both queries are mocked at the service boundary.
const supabase = {} as SupabaseClient;
const userId = "user-1";

const settingsWithKey = (openrouter_api_key: string | null) => ({
  data: { openrouter_api_key } as UserSettingsDTO,
  error: null,
});

describe("resolveOnboardingStep", () => {
  it.each([
    [{ hasApiKey: false, participantCount: 0 }, "api-key"],
    [{ hasApiKey: false, participantCount: 5 }, "api-key"],
    [{ hasApiKey: true, participantCount: 0 }, "participants"],
    [{ hasApiKey: true, participantCount: MIN_PARTICIPANTS - 1 }, "participants"],
    [{ hasApiKey: true, participantCount: MIN_PARTICIPANTS }, "complete"],
    [{ hasApiKey: true, participantCount: 7 }, "complete"],
  ])("maps %o to %s (PRD §3.2: key first, then two participants)", (status, step) => {
    expect(resolveOnboardingStep(status)).toBe(step);
  });
});

describe("getOnboardingStatus", () => {
  beforeEach(() => {
    vi.mocked(getUserSettings).mockReset();
    vi.mocked(countAiParticipants).mockReset();
  });

  it("returns the settings error without counting participants", async () => {
    const error = { message: "settings failed", code: "42P01" };
    vi.mocked(getUserSettings).mockResolvedValue({ data: null, error });

    const result = await getOnboardingStatus({ supabase, userId });

    expect(result).toEqual({ data: null, error });
    expect(countAiParticipants).not.toHaveBeenCalled();
  });

  it("returns the participants count error", async () => {
    const error = { message: "count failed", code: "PGRST000" };
    vi.mocked(getUserSettings).mockResolvedValue(settingsWithKey("sk-or-key"));
    vi.mocked(countAiParticipants).mockResolvedValue({ count: null, error });

    const result = await getOnboardingStatus({ supabase, userId });

    expect(result).toEqual({ data: null, error });
  });

  it("treats a missing count as an error with a fallback message", async () => {
    vi.mocked(getUserSettings).mockResolvedValue(settingsWithKey("sk-or-key"));
    vi.mocked(countAiParticipants).mockResolvedValue({ count: null, error: null });

    const result = await getOnboardingStatus({ supabase, userId });

    expect(result.data).toBeNull();
    expect(result.error).toEqual({ message: "AI participants count unavailable." });
  });

  it.each([
    ["null", null],
    ["an empty string", ""],
  ])("reports no API key when the stored key is %s", async (_label, storedKey) => {
    vi.mocked(getUserSettings).mockResolvedValue(settingsWithKey(storedKey));
    vi.mocked(countAiParticipants).mockResolvedValue({ count: 3, error: null });

    const result = await getOnboardingStatus({ supabase, userId });

    expect(result).toEqual({ data: { hasApiKey: false, participantCount: 3 }, error: null });
  });

  it("reports the key and the count when both lookups succeed", async () => {
    vi.mocked(getUserSettings).mockResolvedValue(settingsWithKey("sk-or-key"));
    vi.mocked(countAiParticipants).mockResolvedValue({ count: 2, error: null });

    const result = await getOnboardingStatus({ supabase, userId });

    expect(result).toEqual({ data: { hasApiKey: true, participantCount: 2 }, error: null });
    expect(countAiParticipants).toHaveBeenCalledWith(supabase, userId);
  });
});
