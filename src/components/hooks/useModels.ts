import { useCallback, useRef, useState } from "react";

import { apiGet } from "@/lib/api-client";
import type { OpenRouterModelDTO, OpenRouterModelListDTO } from "@/types";

type LoadStatus = "idle" | "loading" | "ready" | "error";

// OpenRouter model list for the participant form. Loaded lazily on the first open of the combobox
// (US-013) and kept for the lifetime of the island; `load` is idempotent unless retrying after an error.
export function useModels() {
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [models, setModels] = useState<OpenRouterModelDTO[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const startedRef = useRef(false);

  const load = useCallback(async (retry = false) => {
    if (startedRef.current && !retry) {
      return;
    }
    startedRef.current = true;
    setStatus("loading");
    setMessage(null);

    const result = await apiGet<OpenRouterModelListDTO>("/api/openrouter-models");
    if (result.ok) {
      setModels(result.data.data);
      setStatus("ready");
      return;
    }

    startedRef.current = false;
    // 412 reaches here only on the settings page (the client does not redirect there): the key is missing.
    setMessage(result.failure.status === 412 ? "Add your OpenRouter API key first." : result.failure.message);
    setStatus("error");
  }, []);

  return { status, models, message, load };
}
