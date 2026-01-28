import type { APIContext } from "astro";

import { getUserSettings } from "../../lib/services/user-settings.service.ts";
import type { ApiErrorResponseDTO, UserSettingsDTO } from "../../types.ts";

export const prerender = false;

const jsonError = (status: number, error: string, details: string) =>
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
    return jsonError(401, "Unauthorized", "Missing authentication context");
  }

  const { data, error } = await getUserSettings({
    supabase: locals.supabase,
    userId: locals.user.id,
  });

  if (error) {
    console.error("User settings lookup failed", {
      route: "/api/user-settings",
      method: "GET",
      status: 500,
      supabase_error_code: error.code,
    });
    return jsonError(500, "Internal Server Error", "Failed to load user settings");
  }

  if (!data) {
    return jsonError(404, "Not found", "User settings not found");
  }

  return new Response(JSON.stringify(data satisfies UserSettingsDTO), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
