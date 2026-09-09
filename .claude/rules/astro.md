---
paths:
  - "**/src/pages/**/*.astro"
  - "**/src/layouts/**"
  - "**/src/components/**/*.astro"
  - "**/astro.config.mjs"
---

# Astro rules

## Starter recommendations

_Starter recommendations from the 10x-astro-starter rules, carried over verbatim (experienced-developer guidance for this ecosystem). Project-specific rules and deliberate deviations are listed separately below._

- Leverage View Transitions API for smooth page transitions (use ClientRouter)
- Use content collections with type safety for blog posts, documentation, etc.
- Leverage Server Endpoints for API routes
- Use POST, GET - uppercase format for endpoint handlers
- Use `export const prerender = false` for API routes
- Use zod for input validation in API routes
- Extract logic into services in `src/lib/services`
- Implement middleware for request/response modification
- Use image optimization with the Astro Image integration
- Implement hybrid rendering with server-side rendering where needed
- Use Astro.cookies for server-side cookie management
- Leverage import.meta.env for environment variables

## Project notes

- Output is `server` with the Node adapter (standalone); the dev server runs on port 3000 (`astro.config.mjs`).
- No content collections, no image optimisation and no sitemap are used yet (an app behind a login) — the recommendations above still apply the day such content appears.
- Environment variables are declared in `src/env.d.ts`.
