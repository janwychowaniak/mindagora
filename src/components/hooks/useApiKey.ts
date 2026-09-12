import { useCallback, useEffect, useState } from "react";

import { apiGet, apiPut, type ApiResult } from "@/lib/api-client";
import type { UpdateUserSettingsCommand, UserSettingsDTO } from "@/types";

type LoadStatus = "loading" | "ready" | "error";

// Current OpenRouter key (settings page) and the save action shared with the onboarding step.
// With `load: false` nothing is fetched: the onboarding step knows there is no key yet.
export function useApiKey({ load }: { load: boolean }) {
  const [status, setStatus] = useState<LoadStatus>(load ? "loading" : "ready");
  const [settings, setSettings] = useState<UserSettingsDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!load) {
      return;
    }

    let cancelled = false;
    void apiGet<UserSettingsDTO>("/api/user-settings").then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setSettings(result.data);
        setStatus("ready");
        return;
      }
      setLoadError(result.failure.message);
      setStatus("error");
    });

    return () => {
      cancelled = true;
    };
  }, [load]);

  const save = useCallback(async (openrouterApiKey: string): Promise<ApiResult<UserSettingsDTO>> => {
    setSaving(true);
    const command: UpdateUserSettingsCommand = { openrouter_api_key: openrouterApiKey };
    const result = await apiPut<UserSettingsDTO>("/api/user-settings", command);
    setSaving(false);
    if (result.ok) {
      setSettings(result.data);
    }
    return result;
  }, []);

  return { status, settings, loadError, saving, save };
}
