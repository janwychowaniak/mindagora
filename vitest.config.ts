/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// Vitest runs on the Astro Vite config (React integration, Tailwind, the `@/` alias from tsconfig).
// Tests run in node by default; hook and component tests opt into jsdom with `// @vitest-environment jsdom`.
export default getViteConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/components/hooks/**", "src/components/**/*.tsx"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/components/ui/**"],
    },
  },
});
