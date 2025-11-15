import type { Tables, TablesInsert } from "./db/database.types";

// BASE ALIASES tied directly to Supabase table definitions.
// Keeping them in one place guarantees that downstream DTOs/commands
// stay in sync with the persisted schema.

type UserSettingsRow = Tables<"user_settings">;
type AiParticipantRow = Tables<"ai_participants">;
type ConversationRow = Tables<"conversations">;
type MessageRow = Tables<"messages">;

// Generic success response shared by DELETE endpoints.
export interface ApiSuccessResponseDTO {
  message: string;
}

// =============================================================================
// USER SETTINGS
// =============================================================================

export type UserSettingsDTO = UserSettingsRow;

export interface UpdateUserSettingsCommand {
  // Required string even though the column allows nulls; clearing the key
  // is not supported by the public API per spec, hence `NonNullable`.
  openrouter_api_key: NonNullable<UserSettingsRow["openrouter_api_key"]>;
}

// Response for PUT /api/user-settings
// Returns the complete updated user settings
export type UpdateUserSettingsResponseDTO = UserSettingsDTO;

// =============================================================================
// AI PARTICIPANTS
// =============================================================================

export type AiParticipantDTO = AiParticipantRow;
export type AiParticipantSummaryDTO = Pick<AiParticipantDTO, "id" | "alias" | "model_id" | "color">;
export type CreateAiParticipantCommand = Pick<TablesInsert<"ai_participants">, "alias" | "model_id" | "color">;

// Response for POST /api/ai-participants
// Returns the complete created AI participant entity
export type CreateAiParticipantResponseDTO = AiParticipantDTO;

// =============================================================================
// OPENROUTER MODELS (external resource, no DB table backing)
// =============================================================================

export interface OpenRouterModelDTO {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
}

export interface OpenRouterModelListDTO {
  data: OpenRouterModelDTO[];
}

// =============================================================================
// CONVERSATIONS (list + detail)
// =============================================================================

export type ConversationDTO = ConversationRow;

export type ConversationListItemDTO = ConversationDTO & {
  // Computed COUNT(messages) value; not persisted on the table.
  message_count: number;
};

export type ConversationMessageDTO = MessageRow & {
  // Joined participant information; null when the assistant was deleted or
  // when the role is "user".
  ai_participant: AiParticipantSummaryDTO | null;
};

export type ConversationDetailsDTO = ConversationDTO & {
  // Chronologically ordered list (ASC by created_at) of all messages.
  messages: ConversationMessageDTO[];
};

export interface CreateConversationCommand {
  // Optional because the API auto-generates it when missing.
  title?: ConversationDTO["title"];
  user_message: MessageRow["content"];
  ai_participant_id: NonNullable<MessageRow["ai_participant_id"]>;
}

export type CreateConversationResponseDTO = ConversationDetailsDTO;

export interface UpdateConversationTitleCommand {
  title: ConversationDTO["title"];
}

export type UpdateConversationResponseDTO = ConversationDTO;

export interface CreateMessageCommand {
  content: MessageRow["content"];
  ai_participant_id: NonNullable<MessageRow["ai_participant_id"]>;
}

export interface CreateMessageResponseDTO {
  // User message echoed back to the client.
  user_message: ConversationMessageDTO;
  // Assistant reply produced by OpenRouter.
  ai_message: ConversationMessageDTO;
}

// =============================================================================
// ERROR RESPONSES
// =============================================================================

// Standard error structure for all API endpoints
// Used for 4xx and 5xx error responses
// The `details` field can be either a simple string message or an object
// mapping field names to specific error messages (e.g., validation errors)
export interface ApiErrorResponseDTO {
  error: string;
  details: string | Record<string, string>;
}
