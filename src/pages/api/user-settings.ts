import type { APIContext } from "astro";
import { z } from "zod";

import { updateUserSettings, getUserSettings } from "../../lib/services/user-settings.service.ts";
import {
  OpenRouterHttpError,
  OpenRouterInvalidApiKeyError,
  OpenRouterInvalidResponseError,
  OpenRouterNetworkError,
  OpenRouterTimeoutError,
  validateApiKey,
} from "../../lib/services/openrouter.service.ts";
import type { ApiErrorResponseDTO, UpdateUserSettingsResponseDTO, UserSettingsDTO } from "../../types.ts";

export const prerender = false;

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

const updateUserSettingsSchema = z.object({
  openrouter_api_key: z.string().trim().min(1, "Required"),
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

export const GET = async (context: APIContext) => {
  const { locals } = context;

  if (!locals.user) {
    return jsonError(401, "Unauthorized", "Missing or invalid authentication token");
  }

  const { data, error } = await getUserSettings({
    supabase: locals.supabase,
    userId: locals.user.id,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error("User settings lookup failed", {
      route: "/api/user-settings",
      method: "GET",
      status: 500,
      supabase_error_code: error.code,
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  if (!data) {
    // eslint-disable-next-line no-console
    console.error("User settings lookup failed", {
      route: "/api/user-settings",
      method: "GET",
      status: 404,
    });
    return jsonError(404, "Not Found", "User settings not found");
  }

  return new Response(JSON.stringify(data satisfies UserSettingsDTO), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

export const PUT = async (context: APIContext) => {
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

  const parsed = updateUserSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Bad Request", formatZodErrors(parsed.error));
  }

  const openrouterApiKey = parsed.data.openrouter_api_key;

  try {
    await validateApiKey(openrouterApiKey);
  } catch (error) {
    if (error instanceof OpenRouterTimeoutError) {
      // eslint-disable-next-line no-console
      console.error("User settings update failed", {
        route: "/api/user-settings",
        method: "PUT",
        status: 408,
        openrouter_error: error.name,
      });
      return jsonError(408, "Validation timeout", "OpenRouter API key validation timed out after 10 seconds");
    }

    if (error instanceof OpenRouterHttpError || error instanceof OpenRouterInvalidApiKeyError) {
      const openRouterMessage = error instanceof OpenRouterHttpError ? error.apiError.details : error.message;
      return jsonError(400, "Invalid API key", `OpenRouter API key validation failed: ${openRouterMessage}`);
    }

    if (error instanceof OpenRouterNetworkError || error instanceof OpenRouterInvalidResponseError) {
      // eslint-disable-next-line no-console
      console.error("User settings update failed", {
        route: "/api/user-settings",
        method: "PUT",
        status: 500,
        openrouter_error: error.name,
      });
      return jsonError(500, "Internal Server Error", "OpenRouter validation failed");
    }

    // eslint-disable-next-line no-console
    console.error("User settings update failed", {
      route: "/api/user-settings",
      method: "PUT",
      status: 500,
      openrouter_error: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonError(500, "Internal Server Error", "OpenRouter validation failed");
  }

  const { data, error } = await updateUserSettings({
    supabase: locals.supabase,
    userId: locals.user.id,
    openrouterApiKey,
  });

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("User settings update failed", {
      route: "/api/user-settings",
      method: "PUT",
      status: 500,
      supabase_error_code: error?.code,
    });
    return jsonError(500, "Internal Server Error", "Failed to update user settings");
  }

  return new Response(JSON.stringify(data satisfies UpdateUserSettingsResponseDTO), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
