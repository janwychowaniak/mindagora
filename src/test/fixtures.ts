import type {
  AiParticipantDTO,
  ConversationDetailsDTO,
  ConversationListItemDTO,
  ConversationMessageDTO,
  OpenRouterModelDTO,
} from "@/types";
import type { ApiFailure, ApiResult } from "@/lib/api-client";

// Minimal, valid DTOs for hook and component tests. Override only what the test is about.

export const participant = (overrides: Partial<AiParticipantDTO> = {}): AiParticipantDTO => ({
  id: "p-alpha",
  user_id: "user-1",
  alias: "Alpha",
  model_id: "openai/gpt-4o-mini",
  color: "#3366FF",
  created_at: "2026-09-01T10:00:00Z",
  ...overrides,
});

export const message = (overrides: Partial<ConversationMessageDTO> = {}): ConversationMessageDTO => ({
  id: "m-1",
  conversation_id: "c-1",
  role: "user",
  content: "Hello",
  ai_participant_id: null,
  ai_participant: null,
  created_at: "2026-09-12T10:00:00Z",
  ...overrides,
});

export const conversation = (overrides: Partial<ConversationDetailsDTO> = {}): ConversationDetailsDTO => ({
  id: "c-1",
  user_id: "user-1",
  title: "First conversation",
  created_at: "2026-09-12T10:00:00Z",
  updated_at: "2026-09-12T10:00:00Z",
  messages: [],
  ...overrides,
});

export const listItem = (overrides: Partial<ConversationListItemDTO> = {}): ConversationListItemDTO => ({
  id: "c-1",
  user_id: "user-1",
  title: "First conversation",
  created_at: "2026-09-12T10:00:00Z",
  updated_at: "2026-09-12T10:00:00Z",
  message_count: 2,
  ...overrides,
});

export const model = (overrides: Partial<OpenRouterModelDTO> = {}): OpenRouterModelDTO => ({
  id: "openai/gpt-4o-mini",
  name: "GPT-4o mini",
  pricing: { prompt: "0.00000015", completion: "0.0000006" },
  ...overrides,
});

export const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data });

export const failed = (status: number, details: string | Record<string, string> = "Request failed"): ApiFailure => ({
  status,
  error: status === 0 ? "Network error" : "Error",
  details,
  message: typeof details === "string" ? details : Object.values(details).join(" "),
});

export const failure = <T = never>(status: number, details?: string | Record<string, string>): ApiResult<T> => ({
  ok: false,
  failure: failed(status, details),
});

// A promise the test resolves by hand, to observe state while a request is in flight.
export const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
