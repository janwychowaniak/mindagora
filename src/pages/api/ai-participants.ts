import type { APIContext } from "astro";
import { z } from "zod";

import { createAiParticipant, getAiParticipants } from "../../lib/services/ai-participants.service.ts";
import type {
  AiParticipantDTO,
  ApiErrorResponseDTO,
  CreateAiParticipantCommand,
  CreateAiParticipantResponseDTO,
} from "../../types.ts";

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

const createAiParticipantSchema = z.object({
  alias: z
    .string()
    .trim()
    .min(1, "Required")
    .max(30, "Max 30 characters")
    // Regex requires at least one alphanumeric character (positive lookahead).
    // Prevents nonsensical aliases like "_", "...", or "---".
    // Allowed: letters, digits, spaces, and special chars: - _ .
    .regex(/^(?=.*[A-Za-z0-9])[A-Za-z0-9 _.-]+$/, "Invalid alias format"),
  model_id: z.string().trim().min(1, "Required").max(150, "Max 150 characters"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format"),
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

const looksLikeUniqueViolation = (error: { code?: unknown; message?: string }): boolean => {
  const code = error.code;
  const message = (error.message ?? "").toLowerCase();

  return (
    code === "23505" || code === 23505 || message.includes("duplicate key") || message.includes("unique constraint")
  );
};

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

export const POST = async (context: APIContext) => {
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

  const parsed = createAiParticipantSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Validation error", formatZodErrors(parsed.error));
  }

  const command: CreateAiParticipantCommand = parsed.data;
  const { data, error } = await createAiParticipant({
    supabase: locals.supabase,
    userId: locals.user.id,
    command,
  });

  if (error) {
    if (looksLikeUniqueViolation(error)) {
      return jsonError(409, "Conflict", { alias: "Alias already exists" });
    }

    // eslint-disable-next-line no-console
    console.error("AI participant create failed", {
      route,
      method: "POST",
      status: 500,
      supabase_error_code: error.code,
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  if (!data) {
    // eslint-disable-next-line no-console
    console.error("AI participant create failed", {
      route,
      method: "POST",
      status: 500,
      severity: "CRITICAL",
    });
    return jsonError(500, "Internal Server Error", "An unexpected error occurred");
  }

  return new Response(JSON.stringify(data satisfies CreateAiParticipantResponseDTO), {
    status: 201,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
