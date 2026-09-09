import type { APIContext } from "astro";
import { z } from "zod";

import { getAiParticipantSummary } from "../../../../lib/services/ai-participants.service.ts";
import {
  assertConversationOwnedByUser,
  createMessagePairWithCleanup,
  getConversationMessages,
} from "../../../../lib/services/conversations.service.ts";
import {
  OpenRouterHttpError,
  OpenRouterInvalidResponseError,
  OpenRouterNetworkError,
  OpenRouterTimeoutError,
  sendChatCompletion,
} from "../../../../lib/services/openrouter.service.ts";
import { getUserSettings } from "../../../../lib/services/user-settings.service.ts";
import type {
  ApiErrorResponseDTO,
  CreateMessageCommand,
  CreateMessageResponseDTO,
  OpenRouterChatRequest,
  OpenRouterMessageContext,
} from "../../../../types.ts";

export const prerender = false;

const route = "/api/conversations/:id/messages";

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

// 412: authenticated, but the onboarding precondition (configured API key) is not met.
// 401 is reserved for a missing/invalid session, so the UI can branch on status, not on the label.
const noApiKeyError = () =>
  jsonError(412, "No API key", "OpenRouter API key not configured. Please add it in Settings.");

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

const paramsSchema = z.object({
  id: z.string().uuid("Invalid id"),
});

const createMessageSchema = z.object({
  content: z.string().trim().min(1, "Required").max(10_000, "Max 10000 characters"),
  ai_participant_id: z.string().uuid("Invalid ai_participant_id"),
});

export const POST = async (context: APIContext) => {
  const { locals, params, request } = context;

  if (!locals.user) {
    return jsonError(401, "Unauthorized", "Missing or invalid authentication token");
  }

  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return jsonError(400, "Bad Request", { id: parsedParams.error.errors[0]?.message ?? "Invalid id" });
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

  const parsedBody = createMessageSchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonError(400, "Validation error", formatZodErrors(parsedBody.error));
  }

  const command: CreateMessageCommand = parsedBody.data;
  const conversationId = parsedParams.data.id;
  const userId = locals.user.id;

  const [ownershipResult, historyResult, participantResult, settingsResult] = await Promise.all([
    assertConversationOwnedByUser({
      supabase: locals.supabase,
      userId,
      conversationId,
    }),
    getConversationMessages({
      supabase: locals.supabase,
      conversationId,
    }),
    getAiParticipantSummary(locals.supabase, command.ai_participant_id),
    getUserSettings({
      supabase: locals.supabase,
      userId,
    }),
  ]);

  if (ownershipResult.error) {
    // eslint-disable-next-line no-console
    console.error("Conversation ownership lookup failed", {
      route,
      method: "POST",
      status: 500,
      supabase_error_code: ownershipResult.error.code,
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  if (!ownershipResult.owned) {
    return jsonError(404, "Not Found", "Conversation not found");
  }

  if (historyResult.error) {
    // eslint-disable-next-line no-console
    console.error("Conversation history lookup failed", {
      route,
      method: "POST",
      status: 500,
      supabase_error_code: historyResult.error.code,
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  if (!historyResult.data) {
    // eslint-disable-next-line no-console
    console.error("Conversation history lookup failed", {
      route,
      method: "POST",
      status: 500,
      severity: "CRITICAL",
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  if (participantResult.error) {
    // eslint-disable-next-line no-console
    console.error("AI participant lookup failed", {
      route,
      method: "POST",
      status: 500,
      supabase_error_code: participantResult.error.code,
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  if (!participantResult.data) {
    return jsonError(404, "Not Found", "AI participant not found");
  }

  if (settingsResult.error) {
    // eslint-disable-next-line no-console
    console.error("User settings lookup failed", {
      route,
      method: "POST",
      status: 500,
      supabase_error_code: settingsResult.error.code,
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  if (!settingsResult.data) {
    // eslint-disable-next-line no-console
    console.error("User settings lookup failed", {
      route,
      method: "POST",
      status: 500,
      severity: "CRITICAL",
    });
    return jsonError(500, "Internal Server Error", "User settings not found");
  }

  const openrouterApiKey = settingsResult.data.openrouter_api_key ?? "";
  if (openrouterApiKey.trim().length === 0) {
    return noApiKeyError();
  }

  const historyContext: OpenRouterMessageContext[] = historyResult.data.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const requestPayload: OpenRouterChatRequest = {
    model: participantResult.data.model_id,
    messages: [
      ...historyContext,
      {
        role: "user",
        content: command.content,
      },
    ],
  };

  let aiContent: string;

  try {
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

    if (error instanceof OpenRouterNetworkError) {
      // eslint-disable-next-line no-console
      console.error("OpenRouter request failed", {
        route,
        method: "POST",
        status: 502,
        openrouter_error: error.name,
      });
      return jsonError(502, "Bad Gateway", "OpenRouter request failed");
    }

    if (error instanceof OpenRouterInvalidResponseError) {
      // eslint-disable-next-line no-console
      console.error("OpenRouter request failed", {
        route,
        method: "POST",
        status: 502,
        openrouter_error: error.name,
      });
      return jsonError(502, "Invalid response", "Received invalid response from OpenRouter. Please try again.");
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

  const { data: createResult, error: createError } = await createMessagePairWithCleanup({
    supabase: locals.supabase,
    conversationId,
    userContent: command.content,
    aiContent,
    aiParticipantId: command.ai_participant_id,
    participantSummary: participantResult.data,
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
      logDetails.cleanup_error_code = createError.cleanupError?.code;
      logDetails.cleanup_error_message = createError.cleanupError?.message;
    }

    // eslint-disable-next-line no-console
    console.error("Conversation message create failed", logDetails);
    return jsonError(500, "Internal Server Error", "Failed to create conversation messages");
  }

  if (!createResult) {
    // eslint-disable-next-line no-console
    console.error("Conversation message create failed", {
      route,
      method: "POST",
      status: 500,
      severity: "CRITICAL",
    });
    return jsonError(500, "Internal Server Error", "Failed to create conversation messages");
  }

  return new Response(JSON.stringify(createResult satisfies CreateMessageResponseDTO), {
    status: 201,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
