import { defineMiddleware } from "astro:middleware";

import { supabaseClient } from "../db/supabase.client.ts";
import { createAuthedSupabaseClient, extractBearerToken, getAuthenticatedUser } from "../lib/services/auth.service.ts";
import type { ApiErrorResponseDTO } from "../types.ts";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
]);

const isPublicRequest = (pathname: string) => {
  if (PUBLIC_PATHS.has(pathname)) {
    return true;
  }

  return pathname.startsWith("/_astro/") || pathname.startsWith("/assets/") || pathname === "/favicon.ico";
};

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

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  const { pathname } = new URL(request.url);

  if (isPublicRequest(pathname)) {
    context.locals.supabase = supabaseClient;
    return next();
  }

  const token = extractBearerToken(request);
  if (!token) {
    return jsonError(401, "Unauthorized", "Missing or invalid Authorization header");
  }

  const { user, error } = await getAuthenticatedUser({ supabase: supabaseClient, token });
  if (error || !user) {
    const status = error?.status ?? 401;
    const isAuthError = status === 401 || status === 403;

    if (!isAuthError) {
      // eslint-disable-next-line no-console
      console.error("Auth middleware error", {
        route: pathname,
        method: request.method,
        status: 500,
        supabase_error_code: error?.code,
      });
      return jsonError(500, "Internal Server Error", "Authentication service error");
    }

    return jsonError(401, "Unauthorized", "Invalid or expired token");
  }

  context.locals.supabase = createAuthedSupabaseClient(token);
  context.locals.user = user;

  return next();
});
