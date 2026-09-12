// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { message } from "@/test/fixtures";

import { MessageItem } from "./MessageItem";

describe("MessageItem", () => {
  it("labels a user message and shows its time", () => {
    render(
      <MessageItem message={message({ role: "user", content: "Hello there", created_at: "2026-09-12T10:00:00Z" })} />
    );

    const item = screen.getByTestId("message-item");
    expect(item).toHaveAttribute("data-role", "user");
    expect(item).toHaveTextContent("User");
    expect(item).toHaveTextContent("10:00 AM");
    expect(item).toHaveTextContent("Hello there");
  });

  it("names the AI participant in its colour (the prefix carries the identity, colour is never the only cue)", () => {
    render(
      <MessageItem
        message={message({
          role: "assistant",
          ai_participant_id: "p-alpha",
          ai_participant: { id: "p-alpha", alias: "Alpha", model_id: "openai/gpt-4o-mini", color: "#3366FF" },
        })}
      />
    );

    expect(screen.getByText("AI - Alpha")).toHaveStyle({ color: "#3366FF" });
    expect(screen.getByTestId("message-item")).toHaveStyle({ borderLeftColor: "#3366FF" });
  });

  it("keeps the message of a deleted participant, greyed out (PRD §3.4)", () => {
    render(<MessageItem message={message({ role: "assistant", ai_participant_id: null, ai_participant: null })} />);

    expect(screen.getByText("(Deleted Participant)")).toHaveStyle({ color: "#808080" });
    expect(screen.getByTestId("message-item")).toHaveStyle({ borderLeftColor: "#808080" });
  });
});
