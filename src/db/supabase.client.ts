import type { AstroCookies } from "astro";
import { SUPABASE_KEY, SUPABASE_URL } from "astro:env/server";
import { createServerClient, parseCookieHeader, type CookieOptionsWithName } from "@supabase/ssr";
import { createClient, type SupabaseClient as SupabaseJsClient, type User } from "@supabase/supabase-js";

import type { Database } from "./database.types.ts";

// Anonymous client without a session. The middleware uses it to verify Bearer tokens.
export const supabaseClient = createClient<Database>(SUPABASE_URL, SUPABASE_KEY);

export type SupabaseClient = SupabaseJsClient<Database>;
export type SupabaseUser = User;

// Browser session cookies (decision E3, 2026-09-12). `secure` follows the build mode instead of the
// unconditional `true` from the course guide: the dev server runs on plain http://localhost:3000 and
// production is always behind HTTPS.
export const cookieOptions: CookieOptionsWithName = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: import.meta.env.PROD,
};

// Per-request server client bound to the request cookies. Create a new one for every request: the
// session lives only in cookies, and token refreshes are written back to the response through `setAll`.
// Only `getAll`/`setAll` are implemented (never `get`/`set`/`remove`), as @supabase/ssr requires.
export const createSupabaseServerInstance = (context: { headers: Headers; cookies: AstroCookies }): SupabaseClient =>
  createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookieOptions,
    cookies: {
      getAll() {
        return parseCookieHeader(context.headers.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      // The second argument carries cache headers meant for CDNs in front of the app. Nothing caches
      // in front of the Node adapter and every /api response already sends `Cache-Control: no-store`,
      // so they are not forwarded; revisit when a CDN appears at deployment time.
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => context.cookies.set(name, value, options));
      },
    },
  });
