import { defineMiddleware } from "astro:middleware";

import { createSupabaseServerInstance, supabaseClient } from "../db/supabase.client.ts";
import { createAuthedSupabaseClient, extractBearerToken, getAuthenticatedUser } from "../lib/services/auth.service.ts";
import type { ApiErrorResponseDTO } from "../types.ts";

// The whole application sits behind a session (PRD §3.1). Only the sign-in and sign-up pages and their
// API endpoints are public. Password reset paths are gone: out of MVP (decision B21, 2026-09-12).
const PUBLIC_PATHS = new Set(["/login", "/register", "/api/auth/login", "/api/auth/register"]);

const isStaticAsset = (pathname: string) =>
  pathname.startsWith("/_astro/") || pathname.startsWith("/assets/") || /^\/favicon\.(ico|png)$/.test(pathname);

const isApiRequest = (pathname: string) => pathname.startsWith("/api/");

// Supabase Auth 4xx errors mean "no valid session" (missing session, expired or revoked refresh token):
// the visitor is anonymous. Anything else (network failure, 5xx) is an outage worth a 500.
const isAnonymousSessionError = (status: number | undefined) => status !== undefined && status >= 400 && status < 500;

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
        "Cache-Control": "no-store",
      },
    }
  );

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, cookies, redirect } = context;
  const { pathname } = new URL(request.url);

  if (isStaticAsset(pathname)) {
    return next();
  }

  const isPublic = PUBLIC_PATHS.has(pathname);

  // Path 1: Bearer token (non-browser clients: smoke tests, integrations). Takes precedence over the
  // cookie session and never touches cookies. Public paths skip it: a stale token must not block sign-in.
  const token = isPublic ? null : extractBearerToken(request);
  if (token) {
    const { user, error } = await getAuthenticatedUser({ supabase: supabaseClient, token });
    if (error || !user) {
      if (!isAnonymousSessionError(error?.status)) {
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
  }

  // Path 2: cookie session (browser). The cookie-bound client is exposed on every route, including the
  // public ones: /api/auth/* uses it to set and clear the session cookies, and /login and /register use
  // `locals.user` to redirect a visitor who is already signed in.
  const supabase = createSupabaseServerInstance({ headers: request.headers, cookies });
  context.locals.supabase = supabase;

  // IMPORTANT: `getUser()` verifies the token with Supabase Auth on every request (a cookie alone is
  // not trusted) and refreshes an expired access token, writing the new cookies through `setAll`.
  const { data, error } = await supabase.auth.getUser();
  if (error && !isAnonymousSessionError(error.status)) {
    // eslint-disable-next-line no-console
    console.error("Auth middleware error", {
      route: pathname,
      method: request.method,
      status: 500,
      supabase_error_code: error.code,
    });
    return jsonError(500, "Internal Server Error", "Authentication service error");
  }

  if (data.user) {
    context.locals.user = data.user;
  }

  if (isPublic || context.locals.user) {
    return next();
  }

  if (isApiRequest(pathname)) {
    return jsonError(401, "Unauthorized", "Missing or invalid session");
  }

  return redirect("/login");
});
