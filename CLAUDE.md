# MindAgora

Multi-model chat: one conversation, many AI participants (OpenRouter models), one fully shared context.
Course project (10xDevs 2.0), MVP in progress. The maintainer talks to Claude in Polish; everything inside
this repository is in English: code, comments, commit messages, docs.

## Core value proposition (do not erode)

Every AI participant receives the FULL conversation history on every turn. Never truncate or summarise
the context as an "optimisation" — that would be a product decision, not a technical one.

## Stack

Astro 5 (SSR, Node adapter, port 3000) · React 19 islands · TypeScript 5 · Tailwind 4 · shadcn/ui
(new-york, neutral) · Supabase (PostgreSQL 17, Auth, RLS) · OpenRouter API · Vitest · Playwright (planned) ·
GitHub Actions (planned) · Node 24 (`.nvmrc`) · Supabase CLI as a devDependency (`npx supabase`).

## Layout

- `src/pages/api/**` — REST endpoints (Astro server endpoints, `export const prerender = false`)
- `src/lib/services/*.service.ts` — business logic + Supabase queries; services know nothing about HTTP
- `src/middleware/index.ts` — JWT verification, injects `locals.user` and an authed `locals.supabase`
- `src/db/` — Supabase client and generated database types; `src/types.ts` — DTOs and Command models
  (single source of truth for API contracts)
- `src/components/` — Astro for static markup, React only where interactivity is needed; `src/components/ui`
  is shadcn/ui
- `supabase/migrations/` — nine atomic migrations (enums → tables → indexes → triggers → RLS)
- `.githooks/` — gitleaks + lint-staged hooks; after cloning run `git config core.hooksPath .githooks`

## Commands

`npm run dev` · `npm run build` · `npm run lint` / `lint:fix` · `npm test` ·
`npx supabase start|stop|status` · `npx supabase db reset` (rebuild the local DB from migrations) ·
`npx supabase gen types typescript --local > src/db/database.types.ts`

Environment: `SUPABASE_URL`, `SUPABASE_KEY` (anon), optional `OPENROUTER_HTTP_REFERER`, `OPENROUTER_X_TITLE`.
The per-user OpenRouter key is stored in `user_settings`, never in env.

## Working agreements

- Extreme YAGNI for the MVP: the simplest justified solution wins.
- Code expresses intent. A deviation from a rule gets a code comment with the reason.
- Consistency within a file beats a global rule.
- Endpoint by endpoint, reviewed. Never "generate the whole API in one prompt".
- Real integration over mocks where a mock would double the work (OpenRouter is called for real).
- Security first: RLS from day one; `SUPABASE_SERVICE_ROLE_KEY` is never used in user-facing code.
- One decision = one commit. Commit messages in English, imperative, with the reason in the body.
- Host safety: no action that touches the host's system configuration; ask before installing anything.
- Secrets: gitleaks hooks + CI. A new credential format needs a prefix rule in `.gitleaks.toml`.

## Status (September 2026)

Done: schema + RLS, DTOs, OpenRouter service (unit-tested), all 12 REST endpoints (verified by a curl smoke
suite kept in the maintainer's workspace outside this repo). Not yet: UI, auth screens, E2E tests, CI/CD,
deployment. Major upgrades (Astro 7, Zod 4, Vitest 5) are deliberately deferred.

## Rules

Detailed, path-scoped rules live in `.claude/rules/` (api, supabase, astro, react, frontend).
Read the matching one before touching those files.
