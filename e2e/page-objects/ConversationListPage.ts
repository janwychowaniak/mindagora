import type { Locator, Page } from "@playwright/test";

import { waitForHydration } from "../hydration";

export class ConversationListPage {
  readonly newConversationButton: Locator;
  readonly items: Locator;
  readonly emptyState: Locator;

  constructor(private readonly page: Page) {
    this.newConversationButton = page.getByTestId("new-conversation-button").first();
    this.items = page.getByTestId("conversation-item");
    this.emptyState = page.getByTestId("empty-state");
  }

  async goto() {
    await this.page.goto("/");
    await waitForHydration(this.page);
  }

  item(title: string) {
    return this.items.filter({ has: this.page.getByTestId("conversation-title").filter({ hasText: title }) });
  }

  async startNew() {
    await this.newConversationButton.click();
    await this.page.waitForURL("/conversations/new");
    await waitForHydration(this.page);
  }

  async open(title: string) {
    await this.item(title).getByTestId("open-conversation").click();
    await this.page.waitForURL(/\/conversations\/[0-9a-f-]{36}$/);
    await waitForHydration(this.page);
  }

  // Click → input; the caller decides between Enter (save) and Escape (cancel).
  async startRename(title: string) {
    await this.item(title).getByTestId("conversation-title").click();
    return this.item(title).getByTestId("title-input");
  }

  async rename(title: string, next: string) {
    const input = await this.startRename(title);
    await input.fill(next);
    await input.press("Enter");
    await this.item(next).waitFor();
  }

  async remove(title: string) {
    await this.item(title).getByTestId("delete-conversation").click();
    await this.page.getByTestId("confirm-dialog-confirm").click();
    await this.item(title).waitFor({ state: "detached" });
  }
}
