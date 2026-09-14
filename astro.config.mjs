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
  security: {
    // Behind a TLS-terminating proxy the adapter does not trust the `Host` header unless the domain is listed
    // here, so it falls back to `localhost` and Astro's built-in origin check (`security.checkOrigin`, on by
    // default) rejects every browser write whose `Origin` is the real domain. The check only inspects requests
    // without a `Content-Type` (or with a form-like one), which is exactly the bodyless ones: sign-out and both
    // deletes answered 403 "Cross-site POST form submissions are forbidden" in production while every JSON write
    // passed. Listing the public origin restores a correct `url.origin` and keeps the CSRF check enabled.
    allowedDomains: [{ hostname: "mindagora.ai", protocol: "https" }],
  },
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
      // Public origin of the deployment (https://mindagora.ai). Used where the app has to name itself in an absolute
      // URL (the sign-up confirmation link); without it the request origin is used, which is right on the dev server.
      SITE_URL: envField.string({ context: "server", access: "secret", optional: true, url: true }),
    },
  },
});
