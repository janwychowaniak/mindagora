# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-13

Provenance. This file was written on 2026-09-13 for an application whose test base already existed: the unit
suite, the API smoke suite, the Playwright scenarios and the CI gates shipped during 10xDevs 2.0 (lessons 3x2, 3x3,
3x5 and 3x6). The detailed plan behind them is `ap8-test-plan-pl.md` (Polish: levels, candidates, scenario tables,
environment). This file is the risk-first layer over it, following the 10xDevs 3.0 test-plan schema. Rollout
phases in §3 that shipped before this file existed are marked `complete` and carry no change folder.

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the risk wins. Do not promote to e2e because
   e2e "feels safer". Endpoints and database rules are checked by the API smoke suite on the real local stack,
   because a unit test with a mocked Supabase would be a second, worse implementation of the smoke suite.
2. **User concerns are first-class evidence.** Risks anchored in "the maintainer is worried about X, and the
   failure would surface in area Y" carry the same weight as PRD lines or hot-spot data. The single non-negotiable
   product rule (every AI participant receives the full conversation on every turn) is the first risk for that
   reason.
3. **Risks are scenarios, not code locations.** This plan documents _what could fail_ and _why we believe it is
   likely_, drawn from the foundation documents, the maintainer's decision inventory and codebase signal (churn,
   structure, test base). It does not claim to know which line owns the failure; that knowledge belongs to the
   research step of each rollout phase. If the plan and research disagree about where a failure lives, research is
   the ground truth.

Hot-spot scope used for likelihood weighting: `src/lib/services` (22 commits over the life of the repository, the
top directory), `src/components/auth` (12 commits in the last 30 days), `src/components/chat` (11 commits in the
last 30 days), `src/lib` (10 commits in the last 30 days). 81 of the repository's 112 commits landed in the last
30 days, so churn is high everywhere; the ordering above still holds.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by risk = impact × likelihood. Risks are
failure scenarios in user / business terms, not test names. The Source column cites the _evidence that surfaced
this risk_, never a specific file as "where the failure lives".

| #   | Risk (failure scenario)                                                                                                                                                                                                                                             | Impact | Likelihood | Source (evidence, not anchor)                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | An AI participant answers without the full conversation history, so its reply ignores what the user and the other participants said earlier in the same thread.                                                                                                     | High   | Medium     | `ap1-mvp-pl.md` (solution statement), `ap2-prd-pl.md` §1 and §3.6 ("everybody sees the same context"), `CLAUDE.md` core value proposition; hot-spot `src/lib/services` (22 commits)                                                                         |
| 2   | A signed-in user reads, renames, deletes or posts into another user's conversation or participant by supplying a well-formed id that is not theirs.                                                                                                                 | High   | Medium     | Abuse lens (IDOR); `ap4-db-plan-pl.md` (RLS policies per table), `ap5-api-plan-pl.md` §2 (404 without enumeration), `ap6-auth-spec-pl.md`                                                                                                                   |
| 3   | A visitor without a session, a user with an expired session, or a user who has not finished setup (no key, fewer than two participants) reaches a page or an API route they should be routed away from, and ends on a broken page instead of sign-in or onboarding. | High   | Medium     | `ap2-prd-pl.md` §3.1 and §3.2, `ap6-auth-spec-pl.md` (two session paths: cookie and Bearer), `ap7-ui-plan-pl.md` error matrix (401, 412); hot-spot `src/components/auth` (12 commits/30d)                                                                   |
| 4   | A failed exchange with OpenRouter (timeout, HTTP error, malformed payload, missing or invalid key) is stored as a real answer, leaves a half-written conversation behind, or loses the text the user typed.                                                         | High   | High       | `ap2-prd-pl.md` §3.7 and US-030, `ap5-api-plan-pl.md` §8 (error mapping), `ap8-test-plan-pl.md` §1 (goals); external boundary shared by hundreds of models, so failures are routine                                                                         |
| 5   | The composer sends against the user's intent: Enter during an IME composition, Shift+Enter, empty text, no participant chosen, or a second send while one is in flight.                                                                                             | Medium | Medium     | `ap2-prd-pl.md` §3.6 (composer keys, decision of 2026-09-12); hot-spot `src/components/chat` (11 commits/30d)                                                                                                                                               |
| 6   | Client-side and server-side validation drift apart, so a form accepts what the API rejects (or the reverse) and the user gets a confusing extra round trip or a rejected legitimate value.                                                                          | Medium | High       | `ap5-api-plan-pl.md` §4 (alias rules), `ap6-auth-spec-pl.md` (credentials); already burned twice: participant aliases reject non-ASCII letters, found after launch (inventory A19), and the client e-mail check is looser than the server's (inventory A16) |
| 7   | Deleting a participant punches holes in past conversations: their messages lose their author or vanish, and message counts change.                                                                                                                                  | Medium | Low        | `ap2-prd-pl.md` §3.4 ("(Deleted Participant)"), `ap4-db-plan-pl.md` (ON DELETE SET NULL on messages)                                                                                                                                                        |

High-impact, low-likelihood scenarios such as an OpenRouter or Supabase outage belong to observability, not to a
test; they are deliberately absent from the map.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                            | Must challenge                                                                                          | Context `/10x-research` must ground                                                                                                                      | Likely cheapest layer                                                                                    | Anti-pattern to avoid                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| #1   | The request sent to the model carries every prior message of the thread, in order, on every exchange; a later participant can answer a question about what an earlier participant said.                | "The service passes the history because the smoke log shows a sensible answer."                         | How the history is assembled on each exchange, the ordering guarantee of stored messages, where the user message is inserted relative to the model call. | unit on a pure assembly seam (does not exist yet, see §3 Phase 5) + e2e                                  | Asserting that a mocked client was called (implementation mirror). |
| #2   | With two accounts, every route answers 404 for the other account's conversation or participant ids, including "create a conversation with a foreign participant".                                      | "RLS is on, so the API cannot leak."                                                                    | RLS policies per table, ownership checks inside services, which routes accept ids in the path or body.                                                   | integration (smoke on the real stack)                                                                    | Mocking Supabase in a unit test and asserting a filter was added.  |
| #3   | Guest → sign-in page; expired session on an API call → sign-in from the client; setup incomplete → onboarding; setup complete → through. API answers 401 / 412 with the labels the client branches on. | "The middleware covers everything" (pages carry their own gate; the client has its own redirect rules). | Middleware paths, page gates, the client's status-based redirects, the onboarding step rule.                                                             | unit (gate logic, client redirects, step rule) + e2e (guest, logout) + integration (401 / 412 contracts) | Testing only the happy sign-in.                                    |
| #4   | For each failure class the user sees the mapped message, the typed text survives, no assistant message is stored, no pending row remains.                                                              | "A 2xx from OpenRouter is a valid answer."                                                              | Error classes of the OpenRouter service, their HTTP mapping, the order of the model call versus inserts, the compensation path.                          | unit (service, hook, composer) + integration (invalid key, missing key)                                  | Happy path only; copying the mapping table into the test.          |
| #5   | Send fires only with non-empty text, a chosen participant and nothing in flight; Shift+Enter inserts a newline; an IME composition never sends; the button and the key share one predicate.            | "The button and Enter obviously share one predicate" (verify, do not assume).                           | Composer state, keyboard and composition events, the in-flight flag.                                                                                     | component unit with user-event                                                                           | A DOM snapshot of the composer.                                    |
| #6   | The same table of inputs is accepted or rejected identically on both sides, including non-ASCII letters in aliases.                                                                                    | "The client mirrors the server" (it drifted twice).                                                     | Where each rule lives on each side, whether one source of truth is possible, the messages shown for each field.                                          | unit agreement test on the pure validators + integration for the server rules                            | Testing a regex against itself.                                    |
| #7   | After deleting a participant, their messages remain with the placeholder author label and counts do not change.                                                                                        | "Cascade is what we want" (it is SET NULL by design).                                                   | Foreign-key actions, the DTO shape for a null participant, the rendering of that shape.                                                                  | integration (database action) + component unit                                                           | Asserting the schema text.                                         |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder via `/10x-new`. Status moves
left-to-right through the values below; the orchestrator updates Status as artifacts appear on disk. Phases 1–4
shipped before this plan existed (10xDevs 2.0 lessons), so they are `complete` without a change folder.

| #   | Phase name                       | Goal (one line)                                                                                                                                                                              | Risks covered      | Test types         | Status      | Change folder                         |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------ | ----------- | ------------------------------------- |
| 1   | Unit foundation                  | Cheapest signal on gates, error mapping, the composer and the validators                                                                                                                     | #3, #4, #5, #6, #7 | unit               | complete    | — (lesson 3x2, 2026-09-12)            |
| 2   | API smoke on the real stack      | Contracts, ownership and database actions against local Supabase and the real OpenRouter                                                                                                     | #2, #3, #4, #7     | integration        | complete    | — (lessons 2x4–3x1; `scripts/smoke/`) |
| 3   | E2E on critical flows            | Sign-in, onboarding, one full multi-participant conversation, the list                                                                                                                       | #1, #3, #5         | e2e                | complete    | — (lesson 3x3)                        |
| 4   | Quality-gates wiring             | Lint, types, unit, e2e and build on every pull request; release behind an approval gate                                                                                                      | cross-cutting      | gates              | complete    | — (lessons 3x5, 3x6)                  |
| 5   | Full-context seam and smoke gaps | Extract a pure seam for the message-history assembly and unit-test it; close the smoke gaps (send to a deleted participant → 404, `updated_at` after an exchange, `Cache-Control` on errors) | #1, #2, #4         | unit + integration | not started | —                                     |

## 4. Stack

The classic test base for this project. There are no AI-native tools in the stack.

| Layer            | Tool                                                         | Version                      | Notes                                                                                                    |
| ---------------- | ------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| unit + component | Vitest, Testing Library (React, user-event, jest-dom), jsdom | 4.0, 16.3 / 14.6 / 7.0, 29.1 | `node` by default; DOM tests opt in per file. Suite passes without `.env`.                               |
| API mocking      | none                                                         | —                            | `fetch` is stubbed at the process edge in unit tests; Supabase is never mocked.                          |
| integration      | curl + bash + python3 (`scripts/smoke/`)                     | —                            | Runs against Supabase CLI 2.117 locally and the real OpenRouter API; compares against the last baseline. |
| e2e              | Playwright, Chromium                                         | 1.63                         | One worker, page objects, a session saved by a setup project, real OpenRouter calls behind an env key.   |
| accessibility    | none yet                                                     | —                            | Deliberately out of scope, see §7.                                                                       |
| AI-native        | none                                                         | —                            | Deliberately out of scope, see §7.                                                                       |

**Stack grounding tools (current session):**

- Docs: none — versions read from `package.json` and the lockfile; checked: 2026-09-13
- Search: none — not needed for an existing stack; checked: 2026-09-13
- Runtime/browser: Playwright only (no browser MCP in the loop); checked: 2026-09-13
- Provider/platform: GitHub Actions (gates), Supabase CLI inside the runner, Railway (release); checked: 2026-09-13

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.

| Gate                                     | Where                                                                             | Required?                                 | Catches                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| lint + typecheck (ESLint, `astro check`) | git hooks + CI job `lint`                                                         | required                                  | syntactic and type drift, including `.astro` files                      |
| unit + component                         | local before every commit + CI (pull request and master)                          | required                                  | logic regressions in helpers, hooks, components, the OpenRouter service |
| API smoke                                | local, before any change to an endpoint, a service or a migration                 | required (working agreement, run by hand) | contract, ownership and database-rule regressions                       |
| e2e on critical flows                    | CI on every pull request (Supabase stack in the runner) + local on UI changes     | required                                  | broken sign-in, onboarding, conversation or list flows                  |
| production build                         | CI on every pull request                                                          | required                                  | build-time failures                                                     |
| secret scan (gitleaks)                   | git hooks + CI + GitHub push protection                                           | required                                  | leaked credentials                                                      |
| release approval                         | GitHub environment `production`, between the image build and the Railway redeploy | required (manual)                         | releasing an image nobody looked at                                     |

## 6. Cookbook Patterns

How to add new tests in this project.

### 6.1 Adding a unit or component test

- **Location**: next to the unit under test, `src/**/*.test.ts` or `*.test.tsx`.
- **Environment**: `node` by default; hooks and components add `// @vitest-environment jsdom` at the top of the
  file. Setup lives in `src/test/setup.ts` (jest-dom, cleanup, the `astro:env/server` placeholder), builders in
  `src/test/fixtures.ts`.
- **Mocking policy**: only at the process edge (`fetch`, `window.location`, `Math.random`, the clock) or at the
  module edge (`@/lib/api-client` inside hooks, sibling services inside the onboarding service). Never Supabase.
- **Reference tests**: `src/lib/api-client.test.ts` (fetch edge and status redirects),
  `src/components/hooks/useConversation.test.ts` (hook over a mocked client), `src/components/chat/Composer.test.tsx`
  (user-event, a Radix child replaced by a stub).
- **Run locally**: `npm test` (single run), `npm run test:watch`, `npm run test:coverage`.
- **Rule**: new logic with a pure seam ships with its test in the same commit (`.claude/rules/testing.md`).

### 6.2 Adding an integration (smoke) case

- **Location**: `scripts/smoke/smoke-baseline.sh`, one block per endpoint, cases named `PREFIX-n`.
- **Pattern**: `check ID expected "$(req METHOD /path auth ctype body)" "note"`; body assertions go through the
  `json` helper or a `note` line; database state is forced through the `db` helper only when the API cannot reach
  the state (invalid or missing key).
- **Fixtures**: accounts `smoke-a/b/c@mindagora.local`, wiped at the start of every run; the local database is
  disposable.
- **Reference block**: `GET /api/conversations/:id` (401 three ways, 400 malformed id, 404 unknown id, 404 foreign
  id, 200 with body assertions).
- **Run locally**: `npx supabase start`, `npm run dev`, then
  `SUPA_URL=… ANON=… OR_KEY=… scripts/smoke/smoke-baseline.sh | tee baseline-<date>.out` and compare the summary
  line with the previous baseline (110 PASS / 0 FAIL / 5 SKIP on 2026-09-12).

### 6.3 Adding an e2e test

- **Location**: `e2e/*.spec.ts`, page objects in `e2e/page-objects/`.
- **Pattern**: every page-object action waits for island hydration (`waitForHydration`) before interacting; the
  session comes from `e2e/auth.setup.ts` (storage state); scenarios that call a model are guarded by
  `requireOpenRouterKey`; a test that signs out uses a disposable account, because Supabase sign-out invalidates
  every session of the account.
- **Reference test**: `e2e/conversation-list.spec.ts`.
- **Run locally**: `npm run test:e2e` (needs `.env.test` from `.env.test.example` and the local Supabase stack);
  `E2E_SLOW_MO=500 npx playwright test e2e/auth.spec.ts --headed` to watch.

### 6.4 Adding a test for a new API endpoint

- **Test type**: integration (smoke block) is the default: 401 without, with a foreign scheme and with an invalid
  token; 400 for a malformed id or body; 404 for an unknown and for a foreign id; the happy path with body
  assertions. Pure validation extracted into `src/lib/validation/` gets a unit test.
- **When to add e2e instead**: only if the failure mode needs the browser (cookies, redirects, an island).

### 6.5 Risk → test index

The evidence that each risk in §2 is exercised today. Test names are quoted as they appear in the files.

| Risk | Layer       | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1   | e2e         | `e2e/conversation.spec.ts`: "a draft becomes a conversation on the first reply and every participant joins the same thread" (two participants, four messages in one thread)                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| #1   | integration | `scripts/smoke/smoke-baseline.sh`: MSG-14 (the second participant is asked what the first one said; the answer is logged as a `note`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| #1   | unit        | none yet: the history assembly has no pure seam (§3 Phase 5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| #2   | integration | smoke: GCID-6, PCID-8, MSG-11, DCID-4 (another user's conversation → 404), DAIP-7, CONV-7b, MSG-12 (another user's participant → 404)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| #2   | e2e         | `e2e/conversation-list.spec.ts`: "a well-formed id that does not exist shows the not-found card"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| #3   | unit        | `src/lib/onboarding-gate.test.ts`: "redirects a visitor without a session to /login without any lookup", "lets a completed setup through"; `src/lib/api-client.test.ts`: "sends an expired session to /login", "leaves a failed sign-in (401 from /api/auth/*) to the form", "sends a missing API key (412) to the settings page with the notice"; `src/lib/services/onboarding.service.test.ts`: `resolveOnboardingStep`; `src/lib/services/auth.service.test.ts`: `extractBearerToken`                                                                                                                                    |
| #3   | integration | smoke: AUTH-11 to AUTH-15 (no session → 401 on the API, 302 to `/login` on pages), US-1 to US-3, MOD-3, CONV-6, MSG-13 (412 without a key)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| #3   | e2e         | `e2e/auth.spec.ts`: "a guest is sent to the login page", "logging out ends the session"; `e2e/onboarding.spec.ts`: "registration leads through the API key and two participants to an empty conversation list"                                                                                                                                                                                                                                                                                                                                                                                                              |
| #4   | unit        | `src/lib/services/openrouter.service.test.ts`: "throws OpenRouterTimeoutError on timeout", "throws OpenRouterNetworkError on network failure", "throws OpenRouterHttpError for non-2xx responses", "throws OpenRouterInvalidResponseError when content is missing"; `src/components/hooks/useConversation.test.ts`: "clears the pending row and returns the failure when the exchange fails"; `src/components/chat/Composer.test.tsx`: "keeps the text when the message was not sent, so it can be retried"; `src/components/hooks/useModels.test.ts`: "names the missing key on 412 (only reachable on the settings page)" |
| #4   | integration | smoke: PUT-6 (invalid key rejected at save), CONV-9 and MSG-15 (invalid key in the database → 500 with OpenRouter's message, no orphan conversation), CONV-6 and MSG-13 (missing key → 412)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| #5   | unit        | `src/components/chat/Composer.test.tsx`: "is disabled with whitespace only", "is disabled until a participant is chosen (never pre-selected)", "is disabled while a message is in flight and says so", "is disabled below two participants (PRD: at least 2 AI participants)", "sends on Enter", "inserts a new line on Shift+Enter instead of sending", "never sends while an IME composition is in progress", "does nothing on Enter when the message cannot be sent"                                                                                                                                                     |
| #5   | e2e         | `e2e/conversation.spec.ts` (Enter sends the first message of the draft)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| #6   | unit        | `src/components/auth/auth-api.test.ts`: "validateCredentials agrees with authCredentialsSchema"; `src/lib/validation/auth-credentials.test.ts`: "rejects an invalid email with the UI message", "rejects a password shorter than six characters (mirrors supabase/config.toml)"                                                                                                                                                                                                                                                                                                                                             |
| #6   | integration | smoke: PAIP-4 to PAIP-6 (alias, colour, model id), PCID-5 and PCID-6 (title), MSG-7 and MSG-8 (content length), AUTH-3 (credentials)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| #6   | known gap   | the alias rules live twice (form and endpoint) without an agreement test, and both reject non-ASCII letters (inventory A19); the client e-mail check is looser than the server's (A16)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| #7   | unit        | `src/components/chat/MessageItem.test.tsx`: "keeps the message of a deleted participant, greyed out (PRD §3.4)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| #7   | integration | smoke: SETNULL-1 and SETNULL-2 (the deleted participant's message keeps a null author; the other reply keeps its alias), DCID-6 (CASCADE on conversation delete)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### 6.6 Per-rollout-phase notes

- Phase 1 (unit): jsdom 30 needs Node 24.15, so jsdom stays on 29 while `.nvmrc` says 24.13; the suite pins the
  time zone to UTC; Radix components are stubbed at the child boundary, not polyfilled.
- Phase 3 (e2e): an island that has not hydrated submits the form natively, so every action waits for hydration;
  Supabase sign-out is global, so the logout scenario owns a disposable account; the title editor swaps a button
  for an input, so locators live on the list row, not on the title text.
- Phase 4 (gates): `npm install typescript` without a version hangs on the `typescript-eslint` peer range, so
  TypeScript is pinned to `~5.8`; in a `pull_request` run the checkout SHA is GitHub's merge commit, so the status
  comment names the head SHA explicitly.

## 7. What We Deliberately Don't Test

Exclusions agreed while the test base was built (`ap8-test-plan-pl.md` §2.2 and §4.3). Future contributors should
respect these unless the underlying assumption changes.

- **shadcn/ui and Radix internals** — third-party code; in jsdom they need polyfills. E2E exercises them.
  Re-evaluate if a component is forked.
- **Endpoints and Supabase services in unit tests** — the smoke suite checks them on the real stack; a unit would
  need a mocked Supabase, a second and worse implementation. Re-evaluate if the smoke suite becomes too slow.
- **Astro page rendering in Vitest** — pages are covered by e2e. Re-evaluate if a page grows logic of its own.
- **Performance and load** — a single-user MVP. Re-evaluate at the first multi-user deployment.
- **Accessibility audit, visual snapshots, coverage thresholds** — not for the MVP; snapshots are brittle with
  Tailwind. Re-evaluate in 10xDevs 3.0 module 3 (multimodal scenarios).
- **AI-native layers (post-edit hooks, vision review in CI)** — cost × signal does not justify them for one
  maintainer. Re-evaluate together with the accessibility audit.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-13
- Stack versions last verified: 2026-09-13
- AI-native tool references last verified: 2026-09-13 (none in use)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap, the decision inventory or a production incident,
- a recommended tool's version is older than three months,
- the project's tech stack changes (major upgrades of Astro, Zod or Vitest are planned after certification),
- §7 negative space no longer matches what the maintainer believes.
