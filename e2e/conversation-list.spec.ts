import { expect, test } from "@playwright/test";

import { requireOpenRouterKey, runTag } from "./env";
import { ChatPage } from "./page-objects/ChatPage";
import { ConversationListPage } from "./page-objects/ConversationListPage";

// Creates one conversation through the API (one real exchange) so the list has something to manage.
const createConversation = async (page: Parameters<Parameters<typeof test>[2]>[0]["page"], title: string) => {
  const participants = await page.request.get("/api/ai-participants");
  expect(participants.ok()).toBe(true);
  const alpha = ((await participants.json()) as { id: string; alias: string }[]).find(
    (item) => item.alias === "E2E Alpha"
  );
  expect(alpha, "the setup project adds E2E Alpha").toBeDefined();

  const created = await page.request.post("/api/conversations", {
    data: { user_message: title, ai_participant_id: alpha?.id },
  });
  expect(created.status(), await created.text()).toBe(201);
};

test.describe("conversation list", () => {
  let title: string;

  test.beforeEach(async ({ page }) => {
    requireOpenRouterKey();
    title = `${runTag()}: list, one word`;
    await createConversation(page, title);
  });

  test("Enter saves a new title and it survives a reload", async ({ page }) => {
    const list = new ConversationListPage(page);
    await list.goto();

    await list.rename(title, `${title} renamed`);

    await expect(list.item(`${title} renamed`)).toBeVisible();
    await page.reload();
    await expect(list.item(`${title} renamed`)).toBeVisible();
    await expect(list.item(title)).toHaveCount(0);
  });

  test("Escape cancels a rename", async ({ page }) => {
    const list = new ConversationListPage(page);
    await list.goto();

    const input = await list.startRename(title);
    await input.fill("not saved");
    await input.press("Escape");

    await expect(list.item(title)).toBeVisible();
    await expect(list.item("not saved")).toHaveCount(0);
  });

  test("an empty title is refused inline", async ({ page }) => {
    const list = new ConversationListPage(page);
    await list.goto();

    const input = await list.startRename(title);
    await input.fill("   ");
    await input.press("Enter");

    await expect(list.renameError).toHaveText("Title cannot be empty");
  });

  test("deleting asks for confirmation and removes the conversation", async ({ page }) => {
    const list = new ConversationListPage(page);
    await list.goto();

    await list.remove(title);

    await expect(list.item(title)).toHaveCount(0);
    await page.reload();
    await expect(list.item(title)).toHaveCount(0);
  });
});

test.describe("missing conversation", () => {
  test("a well-formed id that does not exist shows the not-found card", async ({ page }) => {
    const chat = new ChatPage(page);

    await chat.goto("00000000-0000-4000-8000-000000000000");

    await expect(chat.notFound).toBeVisible();
    await expect(chat.notFound.getByRole("link", { name: "Back to conversations" })).toHaveAttribute("href", "/");
  });
});
