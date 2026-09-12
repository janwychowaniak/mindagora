import { expect, test as setup } from "@playwright/test";

import { E2E_MODEL_ID, e2eAccount, openRouterKey } from "./env";

const AUTH_FILE = "playwright/.auth/user.json";
const PARTICIPANTS = [
  { alias: "E2E Alpha", color: "#3366FF" },
  { alias: "E2E Beta", color: "#FF6633" },
];

// One account for the whole run: registered on first use, signed in afterwards, onboarded as far as the
// configuration allows (the OpenRouter key is optional), and its session saved for the chromium project.
// Everything goes through the app's own API with `page.request`, so the cookies land in the page context.
setup("prepare the E2E account and save its session", async ({ page }) => {
  const { email, password } = e2eAccount();

  const registered = await page.request.post("/api/auth/register", { data: { email, password } });
  if (registered.status() === 409) {
    const signedIn = await page.request.post("/api/auth/login", { data: { email, password } });
    expect(signedIn.ok(), `sign-in failed: ${await signedIn.text()}`).toBe(true);
  } else {
    expect(registered.status(), `registration failed: ${await registered.text()}`).toBe(201);
    const body = (await registered.json()) as { confirmation_required?: boolean };
    expect(body.confirmation_required, "email confirmations must be off for the E2E stack").toBeFalsy();
  }

  const key = openRouterKey();
  if (key) {
    const saved = await page.request.put("/api/user-settings", { data: { openrouter_api_key: key } });
    expect(saved.ok(), `saving the OpenRouter key failed: ${await saved.text()}`).toBe(true);
  }

  const listed = await page.request.get("/api/ai-participants");
  expect(listed.ok()).toBe(true);
  const existing = ((await listed.json()) as { alias: string }[]).map((item) => item.alias);
  for (const participant of PARTICIPANTS) {
    if (existing.includes(participant.alias)) continue;
    const created = await page.request.post("/api/ai-participants", {
      data: { ...participant, model_id: E2E_MODEL_ID },
    });
    expect(created.status(), `adding ${participant.alias} failed: ${await created.text()}`).toBe(201);
  }

  await page.context().storageState({ path: AUTH_FILE });
});
