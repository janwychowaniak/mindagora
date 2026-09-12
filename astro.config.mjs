// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react()],
  server: { port: 3000 },
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: node({
    mode: "standalone",
  }),
  // Runtime configuration. Everything is a server secret on purpose: the Node adapter reads secrets from the process
  // environment at runtime, whereas public variables would be frozen into the bundle at build time and
  // a container image built once has to run against any Supabase project. `import.meta.env` is not an option: Vite
  // inlines private variables at build time as well (verified 2026-09-12, lesson 3x6).
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", url: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret" }),
      // OpenRouter attribution headers (see openrouter.service.ts); the app works without them.
      OPENROUTER_HTTP_REFERER: envField.string({ context: "server", access: "secret", optional: true }),
      OPENROUTER_X_TITLE: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
