import type { Locator, Page } from "@playwright/test";

import { waitForHydration } from "../hydration";

// Shared by the settings page and the second onboarding step.
export class ParticipantsPanel {
  readonly count: Locator;
  readonly items: Locator;
  readonly aliasInput: Locator;
  readonly modelCombobox: Locator;
  readonly addButton: Locator;

  constructor(private readonly page: Page) {
    this.count = page.getByTestId("participant-count");
    this.items = page.getByTestId("participant-item");
    this.aliasInput = page.getByTestId("participant-alias-input");
    this.modelCombobox = page.getByTestId("model-combobox");
    this.addButton = page.getByTestId("participant-add");
  }

  item(alias: string) {
    return this.items.filter({ has: this.page.getByText(alias, { exact: true }) });
  }

  // The combobox loads hundreds of models on first open; filtering by the model id narrows it to one row.
  async chooseModel(modelId: string) {
    await this.modelCombobox.click();
    await this.page.getByPlaceholder("Search models…").fill(modelId);
    await this.page
      .getByTestId("model-option")
      .filter({ has: this.page.getByText(modelId, { exact: true }) })
      .click();
  }

  async add(alias: string, modelId: string) {
    await waitForHydration(this.page);
    await this.aliasInput.fill(alias);
    await this.chooseModel(modelId);
    await this.addButton.click();
    await this.item(alias).waitFor();
  }

  async remove(alias: string) {
    await waitForHydration(this.page);
    await this.item(alias).getByTestId("participant-delete").click();
    await this.page.getByTestId("confirm-dialog-confirm").click();
    await this.item(alias).waitFor({ state: "detached" });
  }
}
