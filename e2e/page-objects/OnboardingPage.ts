import type { Locator, Page } from "@playwright/test";

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

  // Saving the key triggers a full navigation back to /onboarding, which then shows the next step.
  async saveApiKey(key: string) {
    await this.apiKeyInput.fill(key);
    await this.apiKeySave.click();
    await this.page.waitForURL("/onboarding");
    await waitForHydration(this.page);
  }

  async finish() {
    await this.continueButton.click();
    await this.page.waitForURL("/");
  }
}
