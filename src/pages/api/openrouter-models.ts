import type { APIContext } from "astro";

import { getUserSettings } from "../../lib/services/user-settings.service.ts";
import {
  getModels,
  OpenRouterHttpError,
  OpenRouterInvalidApiKeyError,
  OpenRouterInvalidResponseError,
  OpenRouterNetworkError,
  OpenRouterTimeoutError,
} from "../../lib/services/openrouter.service.ts";
import type { ApiErrorResponseDTO, OpenRouterModelListDTO } from "../../types.ts";

export const prerender = false;

const route = "/api/openrouter-models";

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
      route,
      method: "GET",
      status: 500,
      supabase_error_code: error.code,
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  if (!data) {
    // eslint-disable-next-line no-console
    console.error("User settings lookup failed", {
      route,
      method: "GET",
      status: 500,
      severity: "CRITICAL",
    });
    return jsonError(500, "Internal Server Error", "User settings not found");
  }

  const openrouterApiKey = data.openrouter_api_key ?? "";

  if (openrouterApiKey.trim().length === 0) {
    return noApiKeyError();
  }

  try {
    const models = await getModels(openrouterApiKey);

    return new Response(JSON.stringify(models satisfies OpenRouterModelListDTO), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (
      error instanceof OpenRouterTimeoutError ||
      error instanceof OpenRouterNetworkError ||
      error instanceof OpenRouterInvalidResponseError
    ) {
      // eslint-disable-next-line no-console
      console.error("OpenRouter request failed", {
        route,
        method: "GET",
        status: 502,
        openrouter_error: error.name,
      });
      return jsonError(502, "Bad Gateway", "OpenRouter request failed");
    }

    if (error instanceof OpenRouterHttpError) {
      const isBadGateway = error.status >= 500 || error.status === 502 || error.status === 503;
      const responseStatus = isBadGateway ? 502 : 500;
      const responseError = responseStatus === 502 ? "Bad Gateway" : "Internal Server Error";
      const details = typeof error.apiError.details === "string" ? error.apiError.details : "OpenRouter request failed";

      // eslint-disable-next-line no-console
      console.error("OpenRouter request failed", {
        route,
        method: "GET",
        status: responseStatus,
        openrouter_error: error.name,
        openrouter_status: error.status,
      });
      return jsonError(responseStatus, responseError, details);
    }

    if (error instanceof OpenRouterInvalidApiKeyError) {
      if (openrouterApiKey.trim().length === 0) {
        return noApiKeyError();
      }

      // eslint-disable-next-line no-console
      console.error("OpenRouter request failed", {
        route,
        method: "GET",
        status: 500,
        openrouter_error: error.name,
      });
      return jsonError(500, "Internal Server Error", "OpenRouter request failed");
    }

    // eslint-disable-next-line no-console
    console.error("OpenRouter request failed", {
      route,
      method: "GET",
      status: 500,
      openrouter_error: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonError(500, "Internal Server Error", "OpenRouter request failed");
  }
};
