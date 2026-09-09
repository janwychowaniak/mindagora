---
paths:
  - "src/pages/api/**"
  - "src/lib/services/**"
  - "src/middleware/**"
  - "src/types.ts"
---

# API layer rules

## Layering

middleware (JWT → `locals.user`, `locals.supabase`) → handler (guard auth → validate → call service → map to HTTP)
→ service (pure logic + Supabase queries, returns `{ data, error }`). Handlers never query Supabase directly;
services never build HTTP responses.

## Handler shape

- `export const prerender = false`; uppercase `GET`/`POST`/`PUT`/`DELETE`.
- Guard 1: `if (!locals.user) return 401` (defense in depth — middleware already checked).
- Guard 2: Zod on path params (`z.string().uuid()`) and on the request body (after checking
  `Content-Type: application/json` and parsing JSON).
- Call the service, map `{ data, error }` to HTTP, return JSON.

## Service shape

- A named result interface per function at the top of the file (`FooResult { data: X | null; error: {...} | null }`).
- Object params always, even for two arguments. No inline return types.
- Explicit `.eq("user_id", userId)` on every query even though RLS already isolates rows (third defense layer).

## Writes: NO RPC

No Postgres RPC functions and no DB transactions for multi-step writes. Sequential `.insert()` calls with an
explicit cleanup on failure (delete the conversation / the user message). Call OpenRouter BEFORE the first
insert. Log a failed cleanup with `severity: "CRITICAL"`. Reads may use PostgREST embedded counts and joins.

## Anti-enumeration

A resource that exists but belongs to another user returns `404`, identical to "does not exist". Never `403`.
Put a comment with this reason at every occurrence.

## Zod: where

Request body, path params, OpenRouter responses → yes. Supabase query results → no (types + DB constraints).
Keep schemas inline in the endpoint file until they are reused.

## HTTP conventions

- Success: `200` (GET/PUT/DELETE), `201` (POST).
- `400 "Bad Request"` for structural problems (Content-Type, malformed JSON, invalid UUID);
  `400 "Validation error"` for business rules on valid JSON (`details` = field → message map, or a string).
- `401 "Unauthorized"` only for a missing/invalid session. `412 "No API key"` when the user has no configured
  OpenRouter key (onboarding precondition). `404 "Not Found"`, `409 "Conflict"` (duplicate alias),
  `408 "Validation timeout"` (key validation > 10 s).
- OpenRouter 4xx (invalid key, no credits, rate limit) → `500 "OpenRouter API error"` with `details` passed
  through 1:1 (deliberate MVP choice). OpenRouter 5xx / network → `502 "Bad Gateway"`; timeout → `504`.
- Error body: `{ error, details }` with `details: string | Record<string, string>`.
- Headers on every response, success and error: `Content-Type: application/json; charset=utf-8`,
  `Cache-Control: no-store`.

## Logging

`console.error` with a structured object `{ route, method, status, supabase_error_code }`; add
`severity: "CRITICAL"` for states that must never happen (missing `user_settings`, failed cleanup).

## Invariants

- `user_settings` always exists (created by trigger): use `.single()` and log CRITICAL if missing.
- `role = "user"` ⇒ `ai_participant_id = null`; deleted participant ⇒ `null` via `ON DELETE SET NULL`.
- A conversation never exists without messages; min. 2 AI participants and the 10 000-char limit are
  enforced in the API, not in the DB.
- No `updated_at` on `user_settings`, `ai_participants`, `messages` by design. `conversations.updated_at`
  is the time of the last message (trigger); editing the title does not change it.
- Auto-title: first 50 chars of the first user message, `...` only if the message was longer than 50 chars.
- `model_id` is validated for format only; existence is guaranteed by the UI dropdown fed from
  `GET /api/openrouter-models` (no re-fetch on POST). That endpoint requires a configured key as an
  onboarding gate, although OpenRouter's `/models` is public.
- OpenRouter: roles `user`/`assistant` only (no `system` in MVP); timeouts 10 s (key validation) / 30 s;
  non-streaming.

## Known debt (planned refactor — do not fix ad hoc)

`jsonError` / `formatZodErrors` duplicated per endpoint; `PUT /api/user-settings` still uses "Bad Request"
for body validation; timeout mapped to 502 in one endpoint and 504 in others; `Cache-Control: no-store`
missing on some error responses; two service functions with positional params.

## Starter recommendations (backend)

_Starter recommendations from the 10x-astro-starter rules, carried over verbatim (experienced-developer guidance for this ecosystem). Project-specific rules and deliberate deviations are listed separately below._

- Use Supabase for backend services, including authentication and database interactions.
- Follow Supabase guidelines for security and performance.
- Use Zod schemas to validate data exchanged with the backend.
- Use supabase from context.locals in Astro routes instead of importing supabaseClient directly
- Use SupabaseClient type from `src/db/supabase.client.ts`, not from `@supabase/supabase-js`
