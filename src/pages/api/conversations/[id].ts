import type { APIContext } from "astro";
import { z } from "zod";

import {
  deleteConversationForUserById,
  getConversationForUserById,
  getConversationMessages,
  updateConversationTitleForUser,
} from "../../../lib/services/conversations.service.ts";
import type {
  ApiErrorResponseDTO,
  ApiSuccessResponseDTO,
  ConversationDetailsDTO,
  UpdateConversationCommand,
  UpdateConversationResponseDTO,
} from "../../../types.ts";

export const prerender = false;

const route = "/api/conversations/:id";

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
        "Cache-Control": "no-store",
      },
    }
  );

const paramsSchema = z.object({
  id: z.string().uuid("Invalid id"),
});

const updateConversationSchema = z.object({
  title: z.string().trim().min(1, "Required").max(100, "Max 100 characters"),
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

// TODO: formatZodErrors() is copied across endpoints (user-settings, conversations, ai-participants, and here).
// Extract it to shared utility (e.g. src/lib/utils/validation.ts) during refactoring.
// In the same refactor scope, align PUT /api/user-settings Zod-body error label from "Bad Request"
// to "Validation error" to remove the last inconsistency in API error semantics.

export const GET = async (context: APIContext) => {
  const { locals, params } = context;

  if (!locals.user) {
    return jsonError(401, "Unauthorized", "Missing or invalid authentication token");
  }

  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return jsonError(400, "Bad Request", { id: parsedParams.error.errors[0]?.message ?? "Invalid id" });
  }

  const conversationId = parsedParams.data.id;
  const { data: conversation, error: conversationError } = await getConversationForUserById({
    supabase: locals.supabase,
    userId: locals.user.id,
    conversationId,
  });

  if (conversationError) {
    // eslint-disable-next-line no-console
    console.error("Conversation lookup failed", {
      route,
      method: "GET",
      status: 500,
      supabase_error_code: conversationError.code,
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  if (!conversation) {
    // RLS hides other users' rows, so the authenticated client returns null both for
    // "does not exist" and "is not yours". Both cases deliberately map to 404
    // (anti-enumeration / information disclosure defense).
    return jsonError(404, "Not Found", "Conversation not found");
  }

  const { data: messages, error: messagesError } = await getConversationMessages({
    supabase: locals.supabase,
    conversationId,
  });

  if (messagesError) {
    // eslint-disable-next-line no-console
    console.error("Conversation messages lookup failed", {
      route,
      method: "GET",
      status: 500,
      supabase_error_code: messagesError.code,
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  if (!messages) {
    // eslint-disable-next-line no-console
    console.error("Conversation messages lookup failed", {
      route,
      method: "GET",
      status: 500,
      severity: "CRITICAL",
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  const responseBody: ConversationDetailsDTO = {
    ...conversation,
    messages,
  };

  return new Response(JSON.stringify(responseBody satisfies ConversationDetailsDTO), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

export const PUT = async (context: APIContext) => {
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

  const parsedBody = updateConversationSchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonError(400, "Validation error", formatZodErrors(parsedBody.error));
  }

  const command: UpdateConversationCommand = parsedBody.data;
  const conversationId = parsedParams.data.id;
  const userId = locals.user.id;

  const { data: conversation, error } = await updateConversationTitleForUser({
    supabase: locals.supabase,
    userId,
    conversationId,
    title: command.title,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error("Conversation update failed", {
      route,
      method: "PUT",
      status: 500,
      severity: "regular",
      supabase_error_code: error.code,
    });
    return jsonError(500, "Internal Server Error", "Failed to update conversation");
  }

  if (!conversation) {
    // RLS ensures isolation; another user's conversation returns null with an authed client.
    // We intentionally map both "not found" and "not owned" to 404 (anti-enumeration defense).
    return jsonError(404, "Not Found", "Conversation not found");
  }

  return new Response(JSON.stringify(conversation satisfies UpdateConversationResponseDTO), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

export const DELETE = async (context: APIContext) => {
  const { locals, params } = context;

  if (!locals.user) {
    return jsonError(401, "Unauthorized", "Missing or invalid authentication token");
  }

  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return jsonError(400, "Bad Request", { id: parsedParams.error.errors[0]?.message ?? "Invalid id" });
  }

  const { data, error } = await deleteConversationForUserById({
    supabase: locals.supabase,
    userId: locals.user.id,
    conversationId: parsedParams.data.id,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error("Conversation delete failed", {
      route,
      method: "DELETE",
      status: 500,
      severity: "regular",
      supabase_error_code: error.code,
    });
    return jsonError(500, "Internal Server Error", "Failed to delete conversation");
  }

  if (!data) {
    // RLS ensures isolation; another user's conversation is invisible to the authed client.
    // We intentionally map both "not found" and "not owned" to 404 (anti-enumeration defense).
    return jsonError(404, "Not Found", "Conversation not found");
  }

  const responseBody: ApiSuccessResponseDTO = {
    message: "Conversation deleted successfully",
  };

  return new Response(JSON.stringify(responseBody satisfies ApiSuccessResponseDTO), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
