---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/vitest.config.ts"
  - "**/src/test/**"
---

# Testing rules

Test plan and the reasoning behind every choice here: `specs_ai/ap8-test-plan-pl.md` in the maintainer's workspace
(outside this repo). The pyramid: unit tests (Vitest, no network, no database) → integration (the curl smoke suite in
the maintainer's workspace, real Supabase and OpenRouter) → E2E (Playwright, planned). Endpoints and Supabase services
are covered by the smoke suite, not by unit tests with mocked Supabase.

## Starter recommendations

_From the 10xDevs `vitest-unit-testing.mdc` asset, kept where they apply to this project. Dropped on purpose: inline
snapshots (they would snapshot Tailwind class lists), UI mode, coverage thresholds, conditional mocking of optional
dependencies._

- Leverage the `vi` object for test doubles: `vi.fn()` for function mocks, `vi.spyOn()` to monitor existing functions,
  `vi.stubGlobal()` for global mocks. Prefer spies over mocks when you only need to verify interactions.
- Master `vi.mock()` factory patterns: place mock factories at the top level of the test file, return typed mock
  implementations, use `mockImplementation()` / `mockReturnValue()` for dynamic control. The factory runs before imports.
- Keep reusable configuration in setup files referenced from `vitest.config.ts`.
- Configure jsdom for DOM testing and combine it with Testing Library for realistic user interaction.
- Structure tests for maintainability: descriptive `describe` blocks, Arrange-Act-Assert, explicit assertion messages
  where the value alone would not explain a failure.
- Keep TypeScript strict in tests; mocks preserve the original type signatures (`vi.mocked`, typed factories).
- Monitor coverage with purpose: `npm run test:coverage` is a report, not a gate.

## Project rules

- **Where:** `*.test.ts` / `*.test.tsx` next to the source file (`src/lib/format.test.ts`, `src/components/chat/Composer.test.tsx`).
  Shared setup lives in `src/test/`. Tests are written in English like everything else in the repo.
- **Run:** `npm test` is `vitest run` (single run, what agents and CI use); `npm run test:watch` for the watcher.
  Never leave a watcher running from an agent session.
- **Environment:** node by default. Hook and component tests start with `// @vitest-environment jsdom` on the first
  line. Service and helper tests stay in node (jsdom replaces `AbortController`/`AbortSignal`, which the OpenRouter
  service relies on).
- **Seams:** the network is `fetch` — stub it with `vi.stubGlobal("fetch", ...)` and build responses with the real
  `Response`. Hooks mock the HTTP client as a module: `vi.mock("@/lib/api-client")` with a typed factory returning
  `ApiResult` values. `window.location` and `window.history` are stubbed, never navigated. Randomness goes through
  `vi.spyOn(Math, "random")`, time through `vi.useFakeTimers()` or an injected `now`; restore both in `afterEach`
  (`vi.useRealTimers()`, `vi.unstubAllGlobals()`, `vi.restoreAllMocks()`).
- **No Supabase in unit tests.** Do not import `src/db/supabase.client.ts` (it creates the client at import time).
  `astro:env/server` is mocked with placeholders in `src/test/setup.ts` for every test file, so modules that import
  it load without an environment; the suite must keep passing without `.env`. Services that compose other services are tested with `vi.mock` of those services; queries are covered by
  the smoke suite.
- **Components:** Testing Library with `@testing-library/user-event`; query by role, label or text first, then by
  `data-testid` (kebab-case names from `.claude/rules/frontend.md`). Never assert on class names or DOM structure.
  Radix primitives (Dialog, AlertDialog, Popover, Select) are not exercised in jsdom — mock the wrapping component
  (`vi.mock("./ParticipantPicker")` with a native `<select>`) or leave the flow to E2E.
- **What earns a test:** a rule from the PRD/API/UI plan, an error branch, a threshold, a status-code semantic
  (401 / 404 / 412). No tests for presentation-only components, shadcn/ui, or "the mock was called" without a
  behavioural consequence. Delete a generated test that has no business meaning rather than keep it green.
- **New logic with a pure seam ships with its test in the same commit.** Endpoint changes additionally rerun the
  smoke suite before the commit.

## E2E (Playwright)

- **Where:** `e2e/` — `*.spec.ts` scenarios, `page-objects/` one class per page (plus `AppShell` and the shared
  `ParticipantsPanel`), `auth.setup.ts` / `global.teardown.ts` projects, `env.ts` for `.env.test` access,
  `hydration.ts`. Config in `playwright.config.ts`; `.env.test` (ignored) from `.env.test.example`.
- **Run:** `npm run test:e2e` (Chromium only, one worker); `npm run test:e2e:ui` to watch, or `--headed` with
  `E2E_SLOW_MO=500` to slow the browser down. The web server is
  `npm run dev:e2e` (`astro dev --mode test`) against the LOCAL Supabase stack — start it first. A running dev
  server on port 3000 is reused.
- **Account:** the setup project registers or signs in `E2E_USERNAME`, stores the OpenRouter key when
  `E2E_OPENROUTER_KEY` is set, adds "E2E Alpha" and "E2E Beta", and saves the session as `storageState`. Scenarios
  that must start as a guest use `test.use({ storageState: GUEST_STATE })`. Never log the shared account out from
  a test: Supabase signs out every session, including the saved one — use a throwaway account (see `auth.spec.ts`).
- **OpenRouter:** real calls (`openai/gpt-4o-mini`), one or two per scenario. A scenario that reaches OpenRouter
  calls `requireOpenRouterKey()` in `beforeEach` and is skipped without the key; the suite must stay green without it.
- **Hydration:** every page-object action starts with `waitForHydration(page)` (no `astro-island[ssr]` left). Before
  that a form submits natively and React resets controlled inputs — interacting earlier is the classic flaky test.
- **Selectors:** `getByTestId` with the kebab-case ids from `.claude/rules/frontend.md`; roles and labels where
  the id would be redundant. Filter list items by exact text (`getByText(title, { exact: true })`), and remember
  that the inline title editor replaces the title button while editing.
- **Data:** unique per run (`runTag()` in aliases, e-mails and messages). The teardown deletes the shared
  account's conversations and participants under RLS with the anon key — never the service role — and refuses
  a non-local `SUPABASE_URL`. Throwaway accounts stay in the local `auth.users` (harmless; `npx supabase db reset`
  clears them).
- **Not here:** API contract testing (the smoke suite), visual comparisons (`toHaveScreenshot`), other browsers,
  parallel workers on the shared account.

## CI (GitHub Actions)

- **`pull-request.yml`** runs on every pull request to `master` (and by hand): `lint` (`npm run lint`, `npm run check`)
  → `unit` (`npm run test:coverage`, coverage artifact) ∥ `build` (`npm run build`) ∥ `e2e` → `status-comment`.
  The E2E job starts the same local Supabase stack as a developer machine (`npx supabase start -x …`, the CLI is a
  devDependency, Docker is on the runner), writes `.env.test` from `npx supabase status -o env`, installs Chromium with
  `--with-deps` (apt is fine there) and uploads `playwright-report/`. The only secret is `E2E_OPENROUTER_KEY`; without
  it the OpenRouter scenarios skip themselves.
- **`master.yml`** runs on every push to `master`: `lint` → `unit` (`npm test`) → `image` (buildx, GHCR, tags
  `sha-<commit>` and `latest`, GHA cache) → `deploy` (environment `production` with a required reviewer;
  `railway redeploy` with the project token from the environment secrets). E2E is not repeated there: `master` only
  receives fast-forwarded PRs that passed `pull-request.yml`. A pending approval holds the `master` concurrency group.
- **Work through pull requests.** Changes go on a branch and reach `master` through a PR; a PR is merged only green.
  Merge with a local fast-forward (`git merge --ff-only` + push) so commit hashes stay what the maintainer's inventory
  cites — never squash or rebase-merge.
- **Actions:** pin to major versions and check the latest major before adding one (`gh api repos/<owner>/<repo>/releases/latest`);
  shared steps live in `.github/actions/node-setup`. `permissions:` is set per job (least privilege), never in the
  repository settings. `gitleaks.yml` stays a separate workflow (it also runs on a schedule).
- **Local equivalents:** `npm run lint && npm run check && npm test && npm run build && npm run test:e2e`.
