import type { APIContext } from "astro";

import { signOut } from "../../../lib/services/auth.service.ts";
import type { ApiErrorResponseDTO, ApiSuccessResponseDTO } from "../../../types.ts";

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
        "Cache-Control": "no-store",
      },
    }
  );

export const POST = async (context: APIContext) => {
  const { locals } = context;

  if (!locals.user) {
    return jsonError(401, "Unauthorized", "Missing or invalid session");
  }

  // No request body is read here, so the `Content-Type: application/json` requirement that every other
  // mutating endpoint enforces does not apply (API plan §2.6). CSRF stays covered by SameSite=Lax.
  const { error } = await signOut({ supabase: locals.supabase });

  if (error) {
    // eslint-disable-next-line no-console
    console.error("Sign-out failed", {
      route: "/api/auth/logout",
      method: "POST",
      status: 500,
      supabase_error_code: error.code,
    });
    return jsonError(500, "Internal Server Error", "Authentication service error");
  }

  const responseBody: ApiSuccessResponseDTO = { message: "Logged out successfully" };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
