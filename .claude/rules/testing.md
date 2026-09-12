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
- **No Supabase in unit tests.** Do not import `src/db/supabase.client.ts` (it creates the client at import time and
  needs env). Services that compose other services are tested with `vi.mock` of those services; queries are covered by
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
