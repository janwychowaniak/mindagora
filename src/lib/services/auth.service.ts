import { SUPABASE_KEY, SUPABASE_URL } from "astro:env/server";
import { createClient, type AuthError, type Session } from "@supabase/supabase-js";
import { z } from "zod";

import type { SupabaseClient, SupabaseUser } from "../../db/supabase.client.ts";
import type { Database } from "../../db/database.types.ts";

const bearerHeaderSchema = z.string().regex(/^Bearer\s+\S+$/i);

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

// `astro:env` guarantees both values: a missing one fails the first request with a clear EnvInvalidVariables error.
export const createAuthedSupabaseClient = (token: string): SupabaseClient =>
  createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
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

// -----------------------------------------------------------------------------
// Browser session (decision E3, 2026-09-12): the functions below run on the
// cookie-bound server client from `locals.supabase`, so signing in and out
// writes or clears the session cookies through @supabase/ssr.
// -----------------------------------------------------------------------------

interface AuthServiceError {
  message: string;
  status?: number;
  code?: string;
}

interface SignInResult {
  data: { user: SupabaseUser } | null;
  error: AuthServiceError | null;
}

interface SignUpResult {
  data: { user: SupabaseUser | null; session: Session | null } | null;
  error: AuthServiceError | null;
}

interface SignOutResult {
  data: null;
  error: AuthServiceError | null;
}

const toServiceError = (error: AuthError): AuthServiceError => ({
  message: error.message,
  status: error.status,
  code: error.code,
});

export const signInWithPassword = async ({
  supabase,
  email,
  password,
}: {
  supabase: SupabaseClient;
  email: string;
  password: string;
}): Promise<SignInResult> => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { data: null, error: toServiceError(error) };
  }

  return { data: { user: data.user }, error: null };
};

export const signUp = async ({
  supabase,
  email,
  password,
  emailRedirectTo,
}: {
  supabase: SupabaseClient;
  email: string;
  password: string;
  emailRedirectTo: string;
}): Promise<SignUpResult> => {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } });

  if (error) {
    return { data: null, error: toServiceError(error) };
  }

  // `session` is null when Supabase requires email confirmation first (production default).
  return { data: { user: data.user, session: data.session }, error: null };
};

// On a Bearer-bound client (no stored session) the library treats this as a no-op: non-browser
// clients sign out by discarding their token.
export const signOut = async ({ supabase }: { supabase: SupabaseClient }): Promise<SignOutResult> => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { data: null, error: toServiceError(error) };
  }

  return { data: null, error: null };
};
