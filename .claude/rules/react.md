---
paths:
  - "**/src/components/**/*.tsx"
---

# React rules

## Starter recommendations

_Starter recommendations from the 10x-astro-starter rules, carried over verbatim (experienced-developer guidance for this ecosystem). Project-specific rules and deliberate deviations are listed separately below._

- Use functional components with hooks instead of class components
- Never use "use client" and other Next.js directives as we use React with Astro
- Extract logic into custom hooks in `src/components/hooks`
- Implement React.memo() for expensive components that render often with the same props
- Utilize React.lazy() and Suspense for code-splitting and performance optimization
- Use the useCallback hook for event handlers passed to child components to prevent unnecessary re-renders
- Prefer useMemo for expensive calculations to avoid recomputation on every render
- Implement useId() for generating unique IDs for accessibility attributes
- Consider using the new useOptimistic hook for optimistic UI updates in forms
- Use useTransition for non-urgent state updates to keep the UI responsive

## shadcn/ui (starter helper, verbatim, translated)

Components live in `src/components/ui` (aliases from `components.json`); import via the configured `@/` alias:

```tsx
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
```

Install additional components with the shadcn CLI: `npx shadcn@latest add [component-name]` (e.g. `npx shadcn@latest add accordion`).
Important: `npx shadcn-ui@latest` is deprecated — use `npx shadcn@latest`. Full list: https://ui.shadcn.com/r

Popular components: Accordion, Alert, AlertDialog, AspectRatio, Avatar, Calendar, Checkbox, Collapsible, Command,
ContextMenu, DataTable, DatePicker, Dropdown Menu, Form, Hover Card, Menubar, Navigation Menu, Popover, Progress,
Radio Group, ScrollArea, Select, Separator, Sheet, Skeleton, Slider, Switch, Table, Textarea, Sonner (previously Toast),
Toggle, Tooltip.

Styling: the "new-york" style with the "neutral" base colour and CSS variables for theming, as configured in `components.json`.

## Project notes (deliberate deviations and clarifications)

- The React Compiler ESLint rule (`react-compiler/react-compiler`) is on. The starter's manual memoisation advice
  (`React.memo`, `useCallback`, `useMemo`) is usually unnecessary here: write plain code and let the compiler decide.
  The rule also rejects mutating a ref received as a parameter and writing to globals inside a hook, which is why
  `useAutoScroll` owns its ref and `document.title` is set in an effect of the view.
- Islands: one per view in `src/components/{auth,settings,onboarding,conversations,chat,shared}/`, state kept local,
  one hook per view in `src/components/hooks/`; HTTP only through `src/lib/api-client.ts` (see the frontend rules).
- `autoFocus` is banned by jsx-a11y; focus programmatically in an effect after the user's action (see `InlineTitleEditor`).
- shadcn CLI today emits `import { cn } from "cn"` and pulls that npm package: switch the import back to
  `@/lib/utils` and remove the package; add components with `--overwrite` when one re-requests an existing file.
