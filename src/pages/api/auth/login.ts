import type { APIContext } from "astro";
import type { z } from "zod";

import { signInWithPassword } from "../../../lib/services/auth.service.ts";
import { authCredentialsSchema } from "../../../lib/validation/auth-credentials.ts";
import type { ApiErrorResponseDTO, LoginResponseDTO } from "../../../types.ts";

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

// Supabase Auth answers 4xx for bad credentials and unconfirmed accounts; anything else is an outage.
const isCredentialsError = (status: number | undefined) => status !== undefined && status >= 400 && status < 500;

// Public endpoint (no auth guard). `locals.supabase` is the cookie-bound client from the middleware,
// so a successful sign-in sets the session cookies on this response.
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

  const { data, error } = await signInWithPassword({
    supabase: locals.supabase,
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data) {
    if (isCredentialsError(error?.status)) {
      // 401 on the sign-in page itself: the form shows `details` inline instead of redirecting.
      return jsonError(401, "Unauthorized", error?.message ?? "Invalid login credentials");
    }

    // eslint-disable-next-line no-console
    console.error("Sign-in failed", {
      route: "/api/auth/login",
      method: "POST",
      status: 500,
      supabase_error_code: error?.code,
    });
    return jsonError(500, "Internal Server Error", "Authentication service error");
  }

  const responseBody: LoginResponseDTO = {
    user: { id: data.user.id, email: data.user.email ?? "" },
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
