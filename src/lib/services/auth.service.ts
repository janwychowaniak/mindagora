import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { SupabaseClient, SupabaseUser } from "../../db/supabase.client.ts";
import type { Database } from "../../db/database.types.ts";

const bearerHeaderSchema = z.string().regex(/^Bearer\s+\S+$/i);

const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseAnonKey = import.meta.env.SUPABASE_KEY;

export const extractBearerToken = (request: Request): string | null => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return null;
  }

  const parsed = bearerHeaderSchema.safeParse(authHeader);
  if (!parsed.success) {
    return null;
  }

  return authHeader.replace(/^Bearer\s+/i, "");
};

interface AuthResult {
  user: SupabaseUser | null;
  error: { message: string; status?: number; code?: string } | null;
}

export const getAuthenticatedUser = async ({
  supabase,
  token,
}: {
  supabase: SupabaseClient;
  token: string;
}): Promise<AuthResult> => {
  const { data, error } = await supabase.auth.getUser(token);

  if (error) {
    return {
      user: null,
      error: {
        message: error.message,
        status: error.status,
        code: error.code,
      },
    };
  }

  return { user: data.user ?? null, error: null };
};

export const createAuthedSupabaseClient = (token: string): SupabaseClient => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};
