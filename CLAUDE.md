# MindAgora

Multi-model chat: one conversation, many AI participants (OpenRouter models), one fully shared context.
Course project (10xDevs 2.0), MVP in progress. The maintainer talks to Claude in Polish; everything inside
this repository is in English: code, comments, commit messages, docs.

## Core value proposition (do not erode)

Every AI participant receives the FULL conversation history on every turn. Never truncate or summarise
the context as an "optimisation" — that would be a product decision, not a technical one.

## Stack

Astro 5 (SSR, Node adapter, port 3000) · React 19 islands · TypeScript 5 · Tailwind 4 · shadcn/ui
(new-york, neutral) · Supabase (PostgreSQL 17, Auth via `@supabase/ssr` cookies, RLS) · OpenRouter API · Vitest · Playwright (planned) ·
GitHub Actions (planned) · Node 24 (`.nvmrc`) · Supabase CLI as a devDependency (`npx supabase`).

## Layout

- `src/pages/api/**` — REST endpoints (Astro server endpoints, `export const prerender = false`)
- `src/lib/services/*.service.ts` — business logic + Supabase queries; services know nothing about HTTP
- `src/middleware/index.ts` — session: `Authorization: Bearer` or the cookie session (`@supabase/ssr`); injects
  `locals.user` and a per-user `locals.supabase`
- `src/lib/api-client.ts` — the one HTTP client the React islands use for `/api/*` (401 → `/login`, 412 → `/settings`);
  `src/lib/onboarding-gate.ts` — server-side gate for pages behind onboarding
- `src/components/{auth,settings,onboarding,conversations,chat,shared}/` — React islands, one per view, with one hook
  per view in `src/components/hooks/`
- `src/db/` — Supabase client and generated database types; `src/types.ts` — DTOs and Command models
  (single source of truth for API contracts)
- `src/components/` — Astro for static markup, React only where interactivity is needed; `src/components/ui`
  is shadcn/ui
- `src/lib/` — services and helpers; `src/assets/` — static internal assets; `public/` — public assets
- `supabase/migrations/` — nine atomic migrations (enums → tables → indexes → triggers → RLS)
- `e2e/` — Playwright scenarios and page objects (`playwright.config.ts`, `.env.test` from `.env.test.example`)
- `.github/workflows/` — `pull-request.yml` (CI on PRs), `master.yml` (lint, unit tests, container image to GHCR on every
  push to `master`) and `gitleaks.yml`; `.github/actions/node-setup` is the shared Node + `npm ci` step
- `.githooks/` — gitleaks + lint-staged hooks; after cloning run `git config core.hooksPath .githooks`

## Commands

`npm run dev` · `npm run build` · `npm run lint` / `lint:fix` · `npm test` (single run) / `test:watch` /
`test:coverage` · `npm run check` (`astro check`, the type gate) · `npm run test:e2e` (Playwright, local Supabase,
`.env.test`) · `npx supabase start|stop|status` · `npx supabase db reset` (rebuild the local DB from migrations) ·
`npx supabase gen types typescript --local > src/db/database.types.ts`

Environment: `SUPABASE_URL`, `SUPABASE_KEY` (anon), optional `OPENROUTER_HTTP_REFERER`, `OPENROUTER_X_TITLE` — declared in
`astro.config.mjs` (`env.schema`), imported from `astro:env/server`, read from the process environment at runtime.
The per-user OpenRouter key is stored in `user_settings`, never in env.

## Coding practices

_Starter recommendations from the 10x-astro-starter rules, carried over verbatim (experienced-developer guidance for this ecosystem). Project-specific rules and deliberate deviations are listed separately below._

- Use feedback from linters to improve the code when making changes.
- Prioritize error handling and edge cases.
- Handle errors and edge cases at the beginning of functions.
- Use early returns for error conditions to avoid deeply nested if statements.
- Place the happy path last in the function for improved readability.
- Avoid unnecessary else statements; use if-return pattern instead.
- Use guard clauses to handle preconditions and invalid states early.
- Implement proper error logging and user-friendly error messages.
- Consider using custom error types or error factories for consistent error handling.

## Working agreements

- Extreme YAGNI for the MVP: the simplest justified solution wins.
- Code expresses intent. A deviation from a rule gets a code comment with the reason.
- Consistency within a file beats a global rule.
- Endpoint by endpoint, reviewed. Never "generate the whole API in one prompt".
- Real integration over mocks where a mock would double the work (OpenRouter is called for real).
- New logic with a pure seam ships with its unit test in the same commit (rules: `.claude/rules/testing.md`); endpoint
  changes rerun the smoke suite. Unit tests never touch the network or the database.
- Security first: RLS from day one; `SUPABASE_SERVICE_ROLE_KEY` is never used in user-facing code.
- One decision = one commit. Commit messages in English, imperative, with the reason in the body.
- Changes reach `master` through a pull request (one per phase or lesson), merged only when CI is green and with a
  local fast-forward so commit hashes stay stable. Never squash or rebase-merge.
- Host safety: no action that touches the host's system configuration; ask before installing anything.
- Secrets: gitleaks hooks + CI. A new credential format needs a prefix rule in `.gitleaks.toml`.

## Status (September 2026)

Done: schema + RLS, DTOs, OpenRouter service (unit-tested), 12 REST endpoints + 3 auth endpoints (verified by a
curl smoke suite kept in the maintainer's workspace outside this repo), cookie session with Bearer kept for
non-browser clients, the full MVP UI (onboarding, settings, conversation list, chat), and unit tests with Vitest +
Testing Library for the helpers, onboarding logic, HTTP client, view hooks and the chat / title-editor components
(the test plan lives in the maintainer's workspace), and Playwright E2E scenarios (auth, onboarding, conversation, list)
on the local Supabase stack with real OpenRouter calls, and CI on pull requests (`.github/workflows/pull-request.yml`:
lint + type check, unit tests, E2E on a Supabase stack in the runner, production build, PR status comment). Not yet:
deployment. Major upgrades
(Astro 7, Zod 4, Vitest 5) are deliberately deferred.

## Rules

Detailed, path-scoped rules live in `.claude/rules/` (api, supabase, astro, react, frontend, testing).
Read the matching one before touching those files.
