import type { Locator, Page } from "@playwright/test";

import { waitForHydration } from "../hydration";

import { ParticipantsPanel } from "./ParticipantsPanel";

export class SettingsPage {
  readonly notice: Locator;
  readonly apiKeyInput: Locator;
  readonly apiKeySave: Locator;
  readonly apiKeySaved: Locator;
  readonly accountEmail: Locator;
  readonly participants: ParticipantsPanel;

  constructor(private readonly page: Page) {
    this.notice = page.getByTestId("settings-notice");
    this.apiKeyInput = page.getByTestId("api-key-input");
    this.apiKeySave = page.getByTestId("api-key-save");
    this.apiKeySaved = page.getByTestId("api-key-saved");
    this.accountEmail = page.getByTestId("account-email");
    this.participants = new ParticipantsPanel(page);
  }

  async goto() {
    await this.page.goto("/settings");
    await waitForHydration(this.page);
  }
}
