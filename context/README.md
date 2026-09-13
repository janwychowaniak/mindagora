# Project context

The written foundation MindAgora was built from. These documents were produced before or alongside the code they
describe, and the code was generated and reviewed against them. Read them as intent and reasoning; on any question of behaviour the code wins.

**Language note.** The foundation documents are in Polish, the maintainer's working language. Everything else in this repository (code, comments, commits, README, rules) is in English. This is
a deliberate deviation recorded in `CLAUDE.md`; the risk-first test plan below is the one document written in
English from the start.

**History.** The documents lived in `.ai/` at the beginning of the project, then in the maintainer's workspace
outside the repository, and returned here in the `context/` layout (`foundation/` for the documents the product is
built from, `archive/` for the implementation plans that were executed and are no longer maintained).

## foundation/

| Context name        | File                                    | What it is                                                                                                                                                                                                                  | Status                                                       |
| ------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| shape notes / MVP   | `foundation/ap1-mvp-pl.md`              | The problem, the solution in one paragraph, the smallest feature set, what is out of scope, success criteria                                                                                                                | source of the PRD                                            |
| prd                 | `foundation/ap2-prd-pl.md`              | Product requirements: overview, user problem, functional requirements (§3: auth, onboarding, API key, participants, conversations, multi-model chat, error handling, UI), product boundaries, user stories, success metrics | source of truth with the code                                |
| tech-stack          | `foundation/ap3-tech-stack.md`          | The stack and why: Astro + React islands, Supabase, OpenRouter, GitHub Actions, Railway, Vitest, Playwright                                                                                                                 | current                                                      |
| db plan             | `foundation/ap4-db-plan-pl.md`          | Tables, relations, indexes, triggers, RLS policies; implemented as the nine migrations in `supabase/migrations/`                                                                                                            | source of truth with the migrations                          |
| api plan            | `foundation/ap5-api-plan-pl.md`         | The REST API: resources, endpoints, validation rules, status codes and error labels, security, test notes                                                                                                                   | source of truth with the code (§9 describes the test levels) |
| auth spec           | `foundation/ap6-auth-spec-pl.md`        | Session model (cookie session for the browser, Bearer for non-browser clients), middleware, protected routes, three Mermaid diagrams                                                                                        | current                                                      |
| ui plan             | `foundation/ap7-ui-plan-pl.md`          | UI architecture: route map, views, islands, hooks, error matrix (401 → sign-in, 412 → settings)                                                                                                                             | current                                                      |
| test-plan           | `foundation/test-plan.md`               | Risk-first test plan: strategy, risk map with response guidance, phased rollout, stack, quality gates, cookbook with the risk → test index, negative space, freshness ledger                                                | current (English)                                            |
| test plan, detailed | `foundation/ap8-test-plan-pl.md`        | The detailed plan behind it: test levels, unit candidates per module, what is not unit-tested and why, smoke and e2e scenario tables, environment, tools                                                                    | current                                                      |
| infrastructure      | `foundation/ap9-hosting-analysis-pl.md` | Hosting analysis that led to Railway (container image on GHCR), Cloudflare and Supabase cloud; the release flow is documented in the README, "Deployment & Releases"                                                        | current                                                      |
| roadmap             | —                                       | No roadmap document. The project followed the course lessons in order; the decision inventory with statuses lives in the maintainer's workspace. The README, "Project Status", states where the product is.                 | —                                                            |

## archive/

Implementation plans that were written just before each piece of code, executed, and kept as a record of the
reasoning at the time. They are not maintained; each folder has a README with the known divergences from the code.

- `archive/impl-plans-API/` — one plan per REST endpoint (twelve) plus implementation notes.
- `archive/impl-plans-SL/` — the OpenRouter service plan.
- `archive/impl-plans-UI/` — one plan per view (settings, onboarding, conversation list, chat).

Paths such as `sketch/…`, `specs_ai/…` or `.ai/…` inside these documents refer to the maintainer's workspace
outside this repository or to this directory's former names.
