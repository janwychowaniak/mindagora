import type { Tables, TablesInsert } from "./db/database.types";

/**
 * API Types for MindAgora
 *
 * Architecture Philosophy:
 * - Domain-Driven Design (DDD) tactical patterns applied at type level
 * - Conversation is the Aggregate Root containing Messages
 * - Types express business intent, not just database structure
 * - Tight coupling with database.types.ts ensures schema consistency
 *
 * For AI code generation:
 * - Commands express "what user wants to do" (write operations)
 * - DTOs express "what API returns" (read models)
 * - Aggregate boundaries prevent direct Message manipulation
 * - Business invariants documented in command comments
 *
 * File structure:
 *   - USER SETTINGS
 *   - AI PARTICIPANTS
 *   - OPENROUTER
 *       ├─ Public API - Models Endpoint
 *       └─ Internal Service - Chat Integration
 *   - CONVERSATIONS (Aggregate Root)
 *   - ERROR RESPONSES
 */

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

// Value Object: Immutable snapshot of AI participant data embedded in messages.
// Used when full participant entity is not needed, only display information.
// Remains stable even if the participant is deleted (ai_participant_id becomes null).
export type AiParticipantSummaryDTO = Pick<AiParticipantDTO, "id" | "alias" | "model_id" | "color">;

export type CreateAiParticipantCommand = Pick<TablesInsert<"ai_participants">, "alias" | "model_id" | "color">;

// Response for POST /api/ai-participants
// Returns the complete created AI participant entity
export type CreateAiParticipantResponseDTO = AiParticipantDTO;

// =============================================================================
// OPENROUTER (external context)
// =============================================================================
// Anti-corruption layer for OpenRouter external service.
// This section contains both public API types (models proxy endpoint)
// and internal service types (chat integration).
// =============================================================================

// -----------------------------------------------------------------------------
// Public API - Models Endpoint
// -----------------------------------------------------------------------------
// DTOs for GET /api/openrouter-models proxy endpoint.
// Returns list of available models from OpenRouter API.

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

// -----------------------------------------------------------------------------
// Internal Service - Chat Integration
// -----------------------------------------------------------------------------
// Types for internal service layer communication with OpenRouter API.
// Used when creating messages to send conversation context and receive AI response.
//
// Service layer translates between our domain (ConversationMessageDTO) and
// OpenRouter format (OpenRouterMessageContext).

// Message format expected by OpenRouter API
// Simplified structure: only role and content, no metadata
export interface OpenRouterMessageContext {
  role: "user" | "assistant";
  content: string;
}

// Request format for POST /chat/completions
export interface OpenRouterChatRequest {
  model: string;
  messages: OpenRouterMessageContext[];
}

// Response format from POST /chat/completions
export interface OpenRouterChatResponse {
  choices: {
    message: {
      role: "assistant";
      content: string;
    };
  }[];
}

// =============================================================================
// CONVERSATIONS (Aggregate Root)
// =============================================================================
// DDD Pattern: Conversation is the Aggregate Root.
// - Messages are part of this aggregate, not independent entities
// - All message operations go through conversation endpoints
// - Ensures consistency: no orphaned messages, atomic message pairs
// =============================================================================

export type ConversationDTO = ConversationRow;

export type ConversationListItemDTO = ConversationDTO & {
  // Computed COUNT(messages) value; not persisted on the table.
  message_count: number;
};

// Message representation within Conversation aggregate.
// Always includes joined participant summary (value object).
export type ConversationMessageDTO = MessageRow & {
  // Joined participant information; null when the assistant was deleted or
  // when the role is "user".
  ai_participant: AiParticipantSummaryDTO | null;
};

export type ConversationDetailsDTO = ConversationDTO & {
  // Chronologically ordered list (ASC by created_at) of all messages.
  messages: ConversationMessageDTO[];
};

/**
 * Command to create a new conversation with initial message exchange.
 *
 * Business Invariants (enforced at API level):
 * - User must have at least 2 AI participants configured before creating conversation
 * - Conversation is created atomically with first user+AI message pair
 * - If AI response fails, entire operation rolls back (no orphaned conversations)
 * - Title is auto-generated from user_message if not provided
 *
 * Aggregate Boundary: This is the only way to create a conversation.
 * Direct message creation without conversation context is not allowed.
 */
export interface CreateConversationCommand {
  // Optional because the API auto-generates it when missing.
  title?: ConversationDTO["title"];
  user_message: MessageRow["content"];
  ai_participant_id: NonNullable<MessageRow["ai_participant_id"]>;
}

export type CreateConversationResponseDTO = ConversationDetailsDTO;

export interface UpdateConversationCommand {
  title: ConversationDTO["title"];
}

export type UpdateConversationResponseDTO = ConversationDTO;

/**
 * Command to add a user message and trigger AI response.
 *
 * Business Logic:
 * - Loads FULL conversation history as context for AI (shared context between models)
 * - Creates atomic transaction: user message + AI response
 * - conversation_id comes from URL path, not body (aggregate boundary)
 *
 * Aggregate Boundary: Messages can only be added through conversation context.
 * Endpoint: POST /api/conversations/:id/messages
 */
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
