---
paths:
  - "src/pages/**/*.astro"
  - "src/layouts/**"
  - "src/components/**/*.astro"
  - "astro.config.mjs"
---

# Astro rules

- Use `.astro` components for static content and layout; React only where interactivity is needed.
- Server endpoints for the API (`src/pages/api`), uppercase handler names, `export const prerender = false`,
  Zod for input validation, logic extracted to `src/lib/services`.
- Middleware (`src/middleware/index.ts`) for request/response modification and auth.
- `import.meta.env` for environment variables (declared in `src/env.d.ts`).
- `Astro.cookies` for server-side cookie management (relevant once auth screens exist).
- Prefer the View Transitions API (`ClientRouter`) for page transitions.
- Output is `server` with the Node adapter (standalone); the dev server runs on port 3000.
