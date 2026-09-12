import type { Locator, Page } from "@playwright/test";

import { waitForHydration } from "../hydration";

export class ChatPage {
  readonly title: Locator;
  readonly backToList: Locator;
  readonly messageInput: Locator;
  readonly participantSelect: Locator;
  readonly sendButton: Locator;
  readonly pendingReply: Locator;
  readonly messages: Locator;
  readonly notFound: Locator;
  readonly errorDialogOk: Locator;

  constructor(private readonly page: Page) {
    this.title = page.getByTestId("chat-title");
    this.backToList = page.getByTestId("back-to-list");
    this.messageInput = page.getByTestId("message-input");
    this.participantSelect = page.getByTestId("participant-select");
    this.sendButton = page.getByTestId("send-button");
    this.pendingReply = page.getByTestId("pending-reply");
    this.messages = page.getByTestId("message-item");
    this.notFound = page.getByTestId("conversation-not-found");
    this.errorDialogOk = page.getByTestId("error-dialog-ok");
  }

  async gotoNew() {
    await this.page.goto("/conversations/new");
    await waitForHydration(this.page);
  }

  async goto(conversationId: string) {
    await this.page.goto(`/conversations/${conversationId}`);
    await waitForHydration(this.page);
  }

  // Radix Select renders its options in a portal; the option is found by the participant's alias.
  async chooseParticipant(alias: string) {
    await this.participantSelect.click();
    await this.page.getByTestId("participant-option").filter({ hasText: alias }).click();
  }

  // Enter sends (PRD §3.6). Resolves once the reply has arrived: the pending row is gone.
  async send(content: string, alias: string) {
    await this.chooseParticipant(alias);
    await this.messageInput.fill(content);
    await this.messageInput.press("Enter");
    await this.pendingReply.waitFor();
    await this.pendingReply.waitFor({ state: "detached", timeout: 60_000 });
  }
}
