import { SITE_URL } from "astro:env/server";
import type { APIContext } from "astro";
import type { z } from "zod";

import { signUp } from "../../../lib/services/auth.service.ts";
import { authCredentialsSchema } from "../../../lib/validation/auth-credentials.ts";
import type { ApiErrorResponseDTO, RegisterResponseDTO } from "../../../types.ts";

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

const isClientError = (status: number | undefined) => status !== undefined && status >= 400 && status < 500;

// Public endpoint (no auth guard). With email confirmation disabled (local dev) Supabase opens a session
// right away and the cookie-bound client stores it; with confirmation enabled (production) there is no
// session and the user signs in after clicking the link, which points at /login.
export const POST = async (context: APIContext) => {
  const { locals, request } = context;

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

  const parsed = authCredentialsSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Validation error", formatZodErrors(parsed.error));
  }

  const { data, error } = await signUp({
    supabase: locals.supabase,
    email: parsed.data.email,
    password: parsed.data.password,
    // The confirmation link in the sign-up e-mail comes back to this app. Production sets SITE_URL: the Node adapter
    // builds `request.url` on `localhost` unless the host is allow-listed (Astro 5.18), so the request origin is
    // only trustworthy on the dev server, where it stays the fallback.
    emailRedirectTo: new URL("/login", SITE_URL ?? request.url).toString(),
  });

  if (error || !data) {
    // Only reachable with email confirmation disabled: with it enabled Supabase hides existing
    // accounts behind a successful response (its own anti-enumeration), and so do we.
    if (error?.code === "user_already_exists") {
      return jsonError(409, "Conflict", error.message);
    }

    // Password rules and other policies enforced by Supabase (e.g. weak_password), message passed 1:1.
    if (isClientError(error?.status)) {
      return jsonError(400, "Validation error", error?.message ?? "Registration rejected");
    }

    // eslint-disable-next-line no-console
    console.error("Sign-up failed", {
      route: "/api/auth/register",
      method: "POST",
      status: 500,
      supabase_error_code: error?.code,
    });
    return jsonError(500, "Internal Server Error", "Authentication service error");
  }

  const responseBody: RegisterResponseDTO = {
    user: data.user ? { id: data.user.id, email: data.user.email ?? "" } : null,
    confirmation_required: data.session === null,
  };

  return new Response(JSON.stringify(responseBody), {
    status: 201,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
