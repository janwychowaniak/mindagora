import { expect, test } from "@playwright/test";

import { E2E_MODEL_ID, e2eAccount, GUEST_STATE, openRouterKey, requireOpenRouterKey, runTag } from "./env";
import { ConversationListPage } from "./page-objects/ConversationListPage";
import { OnboardingPage } from "./page-objects/OnboardingPage";
import { RegisterPage } from "./page-objects/RegisterPage";

// Onboarding can be walked only once per account, so this scenario registers a fresh one every run.
test.use({ storageState: GUEST_STATE });

test.describe("first run", () => {
  test.beforeEach(() => {
    requireOpenRouterKey();
  });

  test.afterEach(async ({ page }) => {
    // Best effort: the fresh account keeps its session in this context, so its participants can go.
    const listed = await page.request.get("/api/ai-participants");
    if (!listed.ok()) return;
    for (const participant of (await listed.json()) as { id: string }[]) {
      await page.request.delete(`/api/ai-participants/${participant.id}`);
    }
  });

  test("registration leads through the API key and two participants to an empty conversation list", async ({
    page,
  }) => {
    const tag = runTag();
    const register = new RegisterPage(page);
    const onboarding = new OnboardingPage(page);
    const list = new ConversationListPage(page);

    await register.goto();
    await register.register(`${tag}@mindagora.local`, e2eAccount().password);

    await page.waitForURL("/onboarding");
    await expect(onboarding.currentStep).toHaveText(/Step 1 of 2/);

    await onboarding.saveApiKey(openRouterKey() ?? "");
    await expect(onboarding.continueButton).toBeDisabled();

    await onboarding.participants.add(`Alpha ${tag}`, E2E_MODEL_ID);
    await expect(onboarding.participants.count).toHaveText("1 participant");
    await expect(onboarding.continueButton).toBeDisabled();

    await onboarding.participants.add(`Beta ${tag}`, E2E_MODEL_ID);
    await expect(onboarding.participants.count).toHaveText("2 participants");
    await expect(onboarding.continueButton).toBeEnabled();

    await onboarding.finish();
    await expect(list.emptyState).toBeVisible();

    // A completed setup never shows the onboarding again.
    await page.goto("/onboarding");
    await expect(page).toHaveURL("/");
  });
});
