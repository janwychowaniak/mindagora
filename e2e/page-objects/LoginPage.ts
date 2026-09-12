import type { Locator, Page } from "@playwright/test";

import { waitForHydration } from "../hydration";

export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.email = page.getByTestId("login-email");
    this.password = page.getByTestId("login-password");
    this.submit = page.getByTestId("login-submit");
    this.error = page.getByTestId("login-error");
  }

  async goto() {
    await this.page.goto("/login");
    await waitForHydration(this.page);
  }

  // Submits and returns; the caller asserts where the page ends up (a failed sign-in stays here).
  async login(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
