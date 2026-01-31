import type { APIContext } from "astro";
import { z } from "zod";

import { deleteAiParticipant } from "../../../lib/services/ai-participants.service.ts";
import type { ApiErrorResponseDTO, ApiSuccessResponseDTO } from "../../../types.ts";

export const prerender = false;

const route = "/api/ai-participants/:id";

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

const paramsSchema = z.object({
  id: z.string().uuid("Invalid id"),
});

export const DELETE = async (context: APIContext) => {
  const { locals, params } = context;

  if (!locals.user) {
    return jsonError(401, "Unauthorized", "Missing or invalid authentication token");
  }

  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return jsonError(400, "Bad Request", { id: parsed.error.errors[0]?.message ?? "Invalid id" });
  }

  const { deleted, error } = await deleteAiParticipant({
    supabase: locals.supabase,
    participantId: parsed.data.id,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error("AI participant delete failed", {
      route,
      method: "DELETE",
      status: 500,
      supabase_error_code: error.code,
    });
    return jsonError(500, "Internal Server Error", "Failed to delete AI participant");
  }

  if (!deleted) {
    return jsonError(404, "Not Found", "AI participant not found");
  }

  return new Response(
    JSON.stringify({ message: "AI participant deleted successfully" } satisfies ApiSuccessResponseDTO),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
};
