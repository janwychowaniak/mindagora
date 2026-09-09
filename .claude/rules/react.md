---
paths:
  - "src/components/**/*.tsx"
---

# React rules

- Functional components with hooks; never `"use client"` or other Next.js directives (this is Astro).
- Extract reusable logic into custom hooks in `src/components/hooks`.
- `React.memo`, `useCallback`, `useMemo` only where a measurable re-render cost justifies them.
- `React.lazy` + `Suspense` for code-splitting heavy islands.
- `useId()` for accessibility ids; `useTransition` for non-urgent updates; consider `useOptimistic` for forms.
- shadcn/ui components live in `src/components/ui` and are imported via the `@/` alias
  (`import { Button } from "@/components/ui/button"`). Add new ones with `npx shadcn@latest add <name>`
  (style: new-york, base colour: neutral, CSS variables).
