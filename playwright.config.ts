import { defineConfig, devices } from "@playwright/test";

// The app reads .env.test itself (`astro dev --mode test`); the tests read it here. Node ≥ 21.7 needs no dotenv.
// A missing file is fine on purpose: the setup project explains what is needed.
try {
  process.loadEnvFile(".env.test");
} catch {
  // no .env.test — E2E_* variables may still come from the environment (CI)
}

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // One dedicated account and assertions on lists: scenarios must not interleave (brief 3x3 T6).
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, teardown: "teardown" },
    { name: "teardown", testMatch: /global\.teardown\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev:e2e",
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
