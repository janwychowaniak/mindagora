import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// `astro:env/server` validates the required secrets when it is imported. Unit tests never reach Supabase or
// OpenRouter (.claude/rules/testing.md), so every test file sees these placeholders instead of the real module.
vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_KEY: "unit-test-anon-key",
  OPENROUTER_HTTP_REFERER: undefined,
  OPENROUTER_X_TITLE: undefined,
  SITE_URL: undefined,
}));

// Testing Library only unmounts on its own with Vitest globals enabled; this project imports from "vitest" explicitly.
afterEach(() => {
  cleanup();
});
