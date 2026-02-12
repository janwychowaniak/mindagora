import type { APIContext } from "astro";
import { z } from "zod";

import { getConversationForUserById, getConversationMessages } from "../../../lib/services/conversations.service.ts";
import type { ApiErrorResponseDTO, ConversationDetailsDTO } from "../../../types.ts";

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
    // RLS izoluje zasoby innych userow, wiec authed client zwraca null
    // zarowno dla "nie istnieje", jak i "nie nalezy do Ciebie".
    // Celowo mapujemy oba przypadki na 404 (anti-enumeration / information disclosure defense).
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
