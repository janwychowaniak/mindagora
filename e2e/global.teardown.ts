import { test as teardown } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { e2eAccount } from "./env";

// Removes what the run created, under RLS: the client signs in as the E2E account and can only delete its
// own rows. Never the service role. Refuses anything but the local stack, so a wrong .env.test cannot wipe a
// real project.
teardown("remove the E2E account's conversations and participants", async () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_KEY;
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_KEY are required for the teardown");
  }
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
    throw new Error(`teardown refuses to touch a non-local Supabase: ${url}`);
  }

  const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
  const { email, password } = e2eAccount();
  const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !data.user) {
    throw new Error(`teardown could not sign in as the E2E account: ${signInError?.message ?? "no user"}`);
  }

  // Conversations cascade to their messages (schema); participants set message references to null.
  for (const table of ["conversations", "ai_participants"] as const) {
    const { error } = await supabase.from(table).delete().eq("user_id", data.user.id);
    if (error) {
      throw new Error(`teardown failed on ${table}: ${error.message}`);
    }
  }
});
