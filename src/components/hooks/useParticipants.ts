import { useCallback, useEffect, useState } from "react";

import { apiDelete, apiGet, apiPost, type ApiFailure } from "@/lib/api-client";
import type {
  AiParticipantDTO,
  ApiSuccessResponseDTO,
  CreateAiParticipantCommand,
  CreateAiParticipantResponseDTO,
} from "@/types";

type LoadStatus = "loading" | "ready" | "error";

// Same ordering as the API (alias, case-insensitive), applied after local inserts.
const sortByAlias = (list: AiParticipantDTO[]) =>
  [...list].sort((a, b) => a.alias.localeCompare(b.alias, "en", { sensitivity: "base" }));

export function useParticipants() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [participants, setParticipants] = useState<AiParticipantDTO[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus("loading");
    setLoadError(null);
    const result = await apiGet<AiParticipantDTO[]>("/api/ai-participants");
    if (result.ok) {
      setParticipants(result.data);
      setStatus("ready");
      return;
    }
    setLoadError(result.failure.message);
    setStatus("error");
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Returns the failure for the form to render, or null on success (the list is updated locally).
  const add = useCallback(async (command: CreateAiParticipantCommand): Promise<ApiFailure | null> => {
    const result = await apiPost<CreateAiParticipantResponseDTO>("/api/ai-participants", command);
    if (!result.ok) {
      return result.failure;
    }
    setParticipants((current) => sortByAlias([...current, result.data]));
    return null;
  }, []);

  const remove = useCallback(async (id: string): Promise<ApiFailure | null> => {
    const result = await apiDelete<ApiSuccessResponseDTO>(`/api/ai-participants/${id}`);
    if (!result.ok) {
      return result.failure;
    }
    setParticipants((current) => current.filter((participant) => participant.id !== id));
    return null;
  }, []);

  return { status, participants, loadError, reload, add, remove };
}
