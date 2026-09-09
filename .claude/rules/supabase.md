---
paths:
  - "supabase/**"
  - "src/db/**"
---

# Supabase and database rules

- Migrations live in `supabase/migrations/`, named `YYYYMMDDHHmmss_short_description.sql`, atomic, lowercase
  SQL, header comment with purpose and affected tables, comments on every step and on every policy.
- Never edit a migration that has already been applied — add a new one. Locally, `npx supabase db reset`
  rebuilds the database from the migrations (the local DB is disposable).
- After a schema change regenerate the types: `npx supabase gen types typescript --local > src/db/database.types.ts`
  (then `npm run lint:fix`; the project ESLint config normalises the generator output).
- Every table has RLS enabled with one policy per operation based on `auth.uid() = user_id` (or an `EXISTS`
  on the owning conversation for `messages`). Messages have no UPDATE policy (immutable).
- PostgreSQL does not create indexes on foreign-key columns: add them explicitly when a query pattern needs
  them (see `idx_messages_ai_participant_id`, a partial index for `ON DELETE SET NULL`).
- Decisions: no own `users` table (`auth.users`); hard delete of participants with `SET NULL` on messages;
  business validation in the application, not in CHECK constraints; the OpenRouter key is stored in plaintext
  in MVP (protected by RLS; pgcrypto reserved for V2); `user_settings` created by a trigger on sign-up;
  `conversations.updated_at` bumped by a trigger on message insert.
- Local config: `supabase/config.toml` (email confirmations disabled locally, `[local_smtp]` for mail testing).
- Never use `SUPABASE_SERVICE_ROLE_KEY` in user-facing code paths; the authed per-request client from
  `locals.supabase` is the only way to query on behalf of a user.
