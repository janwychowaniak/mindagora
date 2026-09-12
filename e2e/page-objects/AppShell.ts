import type { Locator, Page } from "@playwright/test";

import { waitForHydration } from "../hydration";

// The layout header: present on every page behind the session.
export class AppShell {
  readonly logoutButton: Locator;

  constructor(private readonly page: Page) {
    this.logoutButton = page.getByTestId("logout-button");
  }

  async logout() {
    await waitForHydration(this.page);
    await this.logoutButton.click();
    await this.page.waitForURL("/login");
  }
}
