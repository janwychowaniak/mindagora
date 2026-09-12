import { expect, test } from "@playwright/test";

import { requireOpenRouterKey, runTag } from "./env";
import { ChatPage } from "./page-objects/ChatPage";
import { ConversationListPage } from "./page-objects/ConversationListPage";

// The core of the product: one conversation, several AI participants, real replies from OpenRouter.
test.describe("conversation", () => {
  test.beforeEach(() => {
    requireOpenRouterKey();
  });

  test("a draft becomes a conversation on the first reply and every participant joins the same thread", async ({
    page,
  }) => {
    const tag = runTag();
    const list = new ConversationListPage(page);
    const chat = new ChatPage(page);
    const firstMessage = `${tag}: reply with one word`;

    await list.goto();
    await list.startNew();
    await expect(chat.title).toHaveText("New conversation");
    await expect(chat.sendButton).toBeDisabled();

    await chat.send(firstMessage, "E2E Alpha");

    await expect(chat.messages).toHaveCount(2);
    await expect(chat.messages.nth(0)).toHaveAttribute("data-role", "user");
    await expect(chat.messages.nth(0)).toContainText(firstMessage);
    await expect(chat.messages.nth(1)).toHaveAttribute("data-role", "assistant");
    await expect(chat.messages.nth(1)).toContainText("AI - E2E Alpha");
    // The draft turned into a conversation: the URL changed without a reload and the title is the auto title.
    await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/);
    await expect(chat.title).toHaveText(firstMessage);
    await expect(chat.messageInput).toHaveValue("");

    await chat.send(`${tag}: and you, one word too`, "E2E Beta");

    await expect(chat.messages).toHaveCount(4);
    await expect(chat.messages.nth(3)).toContainText("AI - E2E Beta");

    await chat.backToList.click();
    await page.waitForURL("/");
    const item = list.item(firstMessage);
    await expect(item).toBeVisible();
    await expect(item.getByLabel("4 messages")).toBeVisible();
  });
});
