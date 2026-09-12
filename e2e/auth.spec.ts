import { expect, test } from "@playwright/test";

import { e2eAccount, GUEST_STATE } from "./env";
import { AppShell } from "./page-objects/AppShell";
import { LoginPage } from "./page-objects/LoginPage";

// These scenarios start as a guest, not with the saved session.
test.use({ storageState: GUEST_STATE });

test.describe("authentication", () => {
  test("a guest is sent to the login page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL("/login");
    await expect(page.getByTestId("logout-button")).toHaveCount(0);
  });

  test("a wrong password is reported inline and the visitor stays on the login page", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await login.login(e2eAccount().email, "definitely-not-the-password");

    await expect(login.error).toBeVisible();
    await expect(login.error).not.toBeEmpty();
    await expect(page).toHaveURL("/login");
  });

  test("a successful sign-in opens the application, and the login page is no longer reachable", async ({ page }) => {
    const login = new LoginPage(page);
    const { email, password } = e2eAccount();
    await login.goto();

    await login.login(email, password);

    // The onboarding gate decides between the list and the setup; both are behind the session.
    await expect(page).toHaveURL(/\/(onboarding)?$/);
    await expect(new AppShell(page).logoutButton).toBeVisible();

    await page.goto("/login");
    await expect(page).not.toHaveURL("/login");
  });

  test("logging out ends the session", async ({ page }) => {
    const login = new LoginPage(page);
    const { email, password } = e2eAccount();
    await login.goto();
    await login.login(email, password);
    const shell = new AppShell(page);
    await expect(shell.logoutButton).toBeVisible();

    await shell.logout();

    await expect(page).toHaveURL("/login");
    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });
});
