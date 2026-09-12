/// <reference types="astro/client" />

import type { SupabaseClient, SupabaseUser } from "./db/supabase.client.ts";

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient;
      user?: SupabaseUser;
    }
  }
}

// Runtime configuration is declared in `astro.config.mjs` (`env.schema`) and imported from `astro:env/server`;
// its types are generated into `.astro/` by `astro sync` (run by `astro check`, `astro dev` and `astro build`).
