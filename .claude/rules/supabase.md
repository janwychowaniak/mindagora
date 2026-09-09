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

## Starter recommendations (migrations)

_Starter recommendations from the 10x-astro-starter rules, carried over verbatim (experienced-developer guidance for this ecosystem). Project-specific rules and deliberate deviations are listed separately below._

## Creating a migration file

Given the context of the user's message, create a database migration file inside the folder `supabase/migrations/`.

The file MUST following this naming convention:

The file MUST be named in the format `YYYYMMDDHHmmss_short_description.sql` with proper casing for months, minutes, and seconds in UTC time:

1. `YYYY` - Four digits for the year (e.g., `2024`).
2. `MM` - Two digits for the month (01 to 12).
3. `DD` - Two digits for the day of the month (01 to 31).
4. `HH` - Two digits for the hour in 24-hour format (00 to 23).
5. `mm` - Two digits for the minute (00 to 59).
6. `ss` - Two digits for the second (00 to 59).
7. Add an appropriate description for the migration.

For example:

```
20240906123045_create_profiles.sql
```

## SQL Guidelines

Write Postgres-compatible SQL code for Supabase migration files that:

- Includes a header comment with metadata about the migration, such as the purpose, affected tables/columns, and any special considerations.
- Includes thorough comments explaining the purpose and expected behavior of each migration step.
- Write all SQL in lowercase.
- Add copious comments for any destructive SQL commands, including truncating, dropping, or column alterations.
- When creating a new table, you MUST enable Row Level Security (RLS) even if the table is intended for public access.
- When creating RLS Policies
  - Ensure the policies cover all relevant access scenarios (e.g. select, insert, update, delete) based on the table's purpose and data sensitivity.
  - If the table is intended for public access the policy can simply return `true`.
  - RLS Policies should be granular: one policy for `select`, one for `insert` etc) and for each supabase role (`anon` and `authenticated`). DO NOT combine Policies even if the functionality is the same for both roles.
  - Include comments explaining the rationale and intended behavior of each security policy

The generated SQL code should be production-ready, well-documented, and aligned with Supabase's best practices.

## Deliberate deviation from the starter

The starter asks for separate RLS policies per role (`anon` and `authenticated`). The existing nine migrations use one policy per operation for the authenticated user (`auth.uid() = user_id`, or an `EXISTS` on the owning conversation) and no `anon` policies, because nothing in MindAgora is public. New migrations follow the existing convention (consistency within the codebase beats the global rule); revisit if a public table ever appears.
