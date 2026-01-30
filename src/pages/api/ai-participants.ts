import type { APIContext } from "astro";

import { getAiParticipants } from "../../lib/services/ai-participants.service.ts";
import type { AiParticipantDTO, ApiErrorResponseDTO } from "../../types.ts";

export const prerender = false;

const route = "/api/ai-participants";

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

export const GET = async (context: APIContext) => {
  const { locals } = context;

  if (!locals.user) {
    return jsonError(401, "Unauthorized", "Missing or invalid authentication token");
  }

  const { data, error } = await getAiParticipants({
    supabase: locals.supabase,
    userId: locals.user.id,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error("AI participants lookup failed", {
      route,
      method: "GET",
      status: 500,
      supabase_error_code: error.code,
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  if (!data) {
    // eslint-disable-next-line no-console
    console.error("AI participants lookup failed", {
      route,
      method: "GET",
      status: 500,
      severity: "CRITICAL",
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  return new Response(JSON.stringify(data satisfies AiParticipantDTO[]), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
