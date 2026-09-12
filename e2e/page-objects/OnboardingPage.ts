import { expect, type Locator, type Page } from "@playwright/test";

import { waitForHydration } from "../hydration";

import { ParticipantsPanel } from "./ParticipantsPanel";

export class OnboardingPage {
  readonly currentStep: Locator;
  readonly apiKeyInput: Locator;
  readonly apiKeySave: Locator;
  readonly continueButton: Locator;
  readonly participants: ParticipantsPanel;

  constructor(private readonly page: Page) {
    this.currentStep = page.locator('li[aria-current="step"]');
    this.apiKeyInput = page.getByTestId("api-key-input");
    this.apiKeySave = page.getByTestId("api-key-save");
    this.continueButton = page.getByTestId("onboarding-continue");
    this.participants = new ParticipantsPanel(page);
  }

  async goto() {
    await this.page.goto("/onboarding");
    await waitForHydration(this.page);
  }

  // Saving the key reloads /onboarding (same URL), which then renders the next step server-side.
  async saveApiKey(key: string) {
    await waitForHydration(this.page);
    await this.apiKeyInput.fill(key);
    await this.apiKeySave.click();
    await expect(this.currentStep).toHaveText(/Step 2 of 2/);
    await waitForHydration(this.page);
  }

  async finish() {
    await waitForHydration(this.page);
    await this.continueButton.click();
    await this.page.waitForURL("/");
  }
}
