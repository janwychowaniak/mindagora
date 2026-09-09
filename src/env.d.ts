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

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_KEY: string;
  // Optional OpenRouter attribution headers (see openrouter.service.ts)
  readonly OPENROUTER_HTTP_REFERER?: string;
  readonly OPENROUTER_X_TITLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
