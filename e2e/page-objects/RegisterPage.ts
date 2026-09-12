import type { Locator, Page } from "@playwright/test";

import { waitForHydration } from "../hydration";

export class RegisterPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly confirmPassword: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.email = page.getByTestId("register-email");
    this.password = page.getByTestId("register-password");
    this.confirmPassword = page.getByTestId("register-confirm-password");
    this.submit = page.getByTestId("register-submit");
    this.error = page.getByTestId("register-error");
  }

  async goto() {
    await this.page.goto("/register");
    await waitForHydration(this.page);
  }

  async register(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.confirmPassword.fill(password);
    await this.submit.click();
  }
}
