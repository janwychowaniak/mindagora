import type { APIContext } from "astro";
import { z } from "zod";

import { countAiParticipants, getAiParticipantSummary } from "../../lib/services/ai-participants.service.ts";
import { createConversationWithInitialExchange } from "../../lib/services/conversations.service.ts";
import {
  OpenRouterHttpError,
  OpenRouterInvalidResponseError,
  OpenRouterNetworkError,
  OpenRouterTimeoutError,
  sendChatCompletion,
} from "../../lib/services/openrouter.service.ts";
import { getUserSettings } from "../../lib/services/user-settings.service.ts";
import type {
  ApiErrorResponseDTO,
  AiParticipantSummaryDTO,
  CreateConversationCommand,
  CreateConversationResponseDTO,
  OpenRouterChatRequest,
} from "../../types.ts";

export const prerender = false;

const route = "/api/conversations";

const jsonError = (status: number, error: string, details: ApiErrorResponseDTO["details"]) =>
  new Response(
    JSON.stringify({
      error,
      details,
    } satisfies ApiErrorResponseDTO),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    }
  );

const noApiKeyError = () =>
  jsonError(401, "No API key", "OpenRouter API key not configured. Please add it in Settings.");

const createConversationSchema = z.object({
  title: z
    .string()
    .trim()
    .max(100, "Max 100 characters")
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional(),
  user_message: z.string().trim().min(1, "Required").max(10_000, "Max 10000 characters"),
  ai_participant_id: z.string().uuid("Invalid ai_participant_id"),
});

const formatZodErrors = (error: z.ZodError): Record<string, string> => {
  const flattened = error.flatten().fieldErrors;
  const details: Record<string, string> = {};

  for (const [field, messages] of Object.entries(flattened)) {
    if (messages && messages.length > 0) {
      details[field] = messages[0];
    }
  }

  return details;
};

export const POST = async (context: APIContext) => {
  const { locals, request } = context;

  if (!locals.user) {
    return jsonError(401, "Unauthorized", "Missing or invalid authentication token");
  }

  const contentType = request.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return jsonError(400, "Bad Request", "Content-Type must be application/json");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Bad Request", "Invalid JSON body");
  }

  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Validation error", formatZodErrors(parsed.error));
  }

  const command: CreateConversationCommand = parsed.data;
  const userMessage = command.user_message;

  const { count, error: countError } = await countAiParticipants(locals.supabase, locals.user.id);

  if (countError) {
    // eslint-disable-next-line no-console
    console.error("AI participants count failed", {
      route,
      method: "POST",
      status: 500,
      supabase_error_code: countError.code,
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  if (count === null || count < 2) {
    return jsonError(400, "Validation error", "User must have at least 2 AI participants to start a conversation");
  }

  const [settingsResult, participantResult] = await Promise.all([
    getUserSettings({
      supabase: locals.supabase,
      userId: locals.user.id,
    }),
    getAiParticipantSummary(locals.supabase, command.ai_participant_id),
  ]);

  const { data: settings, error: settingsError } = settingsResult;

  if (settingsError) {
    // eslint-disable-next-line no-console
    console.error("User settings lookup failed", {
      route,
      method: "POST",
      status: 500,
      supabase_error_code: settingsError.code,
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  if (!settings) {
    // eslint-disable-next-line no-console
    console.error("User settings lookup failed", {
      route,
      method: "POST",
      status: 500,
      severity: "CRITICAL",
    });
    return jsonError(500, "Internal Server Error", "User settings not found");
  }

  const openrouterApiKey = settings.openrouter_api_key ?? "";
  if (openrouterApiKey.trim().length === 0) {
    return noApiKeyError();
  }

  const { data: participant, error: participantError } = participantResult;

  if (participantError) {
    // eslint-disable-next-line no-console
    console.error("AI participant lookup failed", {
      route,
      method: "POST",
      status: 500,
      supabase_error_code: participantError.code,
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  if (!participant) {
    return jsonError(404, "Not Found", "AI participant not found");
  }

  const participantSummary: AiParticipantSummaryDTO = participant;

  let aiContent: string;

  try {
    const requestPayload: OpenRouterChatRequest = {
      model: participant.model_id,
      messages: [{ role: "user", content: userMessage }],
    };
    aiContent = await sendChatCompletion(openrouterApiKey, requestPayload);
  } catch (error) {
    if (error instanceof OpenRouterTimeoutError) {
      // eslint-disable-next-line no-console
      console.error("OpenRouter request timed out", {
        route,
        method: "POST",
        status: 504,
        openrouter_error: error.name,
      });
      return jsonError(504, "Gateway Timeout", "OpenRouter request timed out");
    }

    if (error instanceof OpenRouterNetworkError || error instanceof OpenRouterInvalidResponseError) {
      // eslint-disable-next-line no-console
      console.error("OpenRouter request failed", {
        route,
        method: "POST",
        status: 502,
        openrouter_error: error.name,
      });
      return jsonError(502, "Bad Gateway", "OpenRouter request failed");
    }

    if (error instanceof OpenRouterHttpError) {
      const isBadGateway = error.status >= 500 || error.status === 502 || error.status === 503;
      const responseStatus = isBadGateway ? 502 : 500;
      const responseError = responseStatus === 502 ? "Bad Gateway" : "OpenRouter API error";
      const details = error.apiError.details;

      // eslint-disable-next-line no-console
      console.error("OpenRouter request failed", {
        route,
        method: "POST",
        status: responseStatus,
        openrouter_error: error.name,
        openrouter_status: error.status,
      });
      return jsonError(responseStatus, responseError, details);
    }

    // eslint-disable-next-line no-console
    console.error("OpenRouter request failed", {
      route,
      method: "POST",
      status: 500,
      openrouter_error: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonError(500, "Internal Server Error", "OpenRouter request failed");
  }

  const title = command.title ?? `${userMessage.slice(0, 50)}...`;

  const { data: conversation, error: createError } = await createConversationWithInitialExchange({
    supabase: locals.supabase,
    userId: locals.user.id,
    title,
    userMessage,
    aiParticipantId: command.ai_participant_id,
    aiContent,
    participantSummary,
  });

  if (createError) {
    const logDetails: Record<string, string | number | undefined> = {
      route,
      method: "POST",
      status: 500,
      supabase_error_code: createError.code,
    };

    if (createError.cleanupFailed) {
      logDetails.severity = "CRITICAL";
      logDetails.conversationId = createError.conversationId;
      logDetails.cleanup_error_code = createError.cleanupError?.code;
      logDetails.cleanup_error_message = createError.cleanupError?.message;
    }

    // eslint-disable-next-line no-console
    console.error("Conversation create failed", logDetails);
    return jsonError(500, "Internal Server Error", "Failed to create conversation");
  }

  if (!conversation) {
    // eslint-disable-next-line no-console
    console.error("Conversation create failed", {
      route,
      method: "POST",
      status: 500,
      severity: "CRITICAL",
    });
    return jsonError(500, "Internal Server Error", "Failed to create conversation");
  }

  return new Response(JSON.stringify(conversation satisfies CreateConversationResponseDTO), {
    status: 201,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
