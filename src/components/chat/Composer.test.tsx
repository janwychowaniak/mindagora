// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { participant } from "@/test/fixtures";
import type { AiParticipantDTO } from "@/types";

import { Composer } from "./Composer";

// The real picker is a Radix Select, which jsdom cannot drive; a native select keeps the contract
// (value, onChange, disabled) and lets the tests choose a participant.
vi.mock("./ParticipantPicker", () => ({
  ParticipantPicker: ({
    participants,
    value,
    onChange,
    disabled,
  }: {
    participants: AiParticipantDTO[];
    value: string | null;
    onChange: (id: string) => void;
    disabled?: boolean;
  }) => (
    <select
      aria-label="AI participant"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    >
      <option value="">Choose a participant</option>
      {participants.map((item) => (
        <option key={item.id} value={item.id}>
          {item.alias}
        </option>
      ))}
    </select>
  ),
}));

const alpha = participant({ id: "p-alpha", alias: "Alpha" });
const beta = participant({ id: "p-beta", alias: "Beta" });

const setup = ({ participants = [alpha, beta], busy = false, sent = true } = {}) => {
  const user = userEvent.setup();
  const onSend = vi.fn<(content: string, participantId: string) => Promise<boolean>>().mockResolvedValue(sent);
  render(<Composer participants={participants} busy={busy} onSend={onSend} />);
  return {
    user,
    onSend,
    textarea: screen.getByRole("textbox", { name: "Message" }),
    picker: screen.getByRole("combobox", { name: "AI participant" }),
    send: screen.getByTestId("send-button"),
  };
};

describe("Composer", () => {
  describe("canSend (one predicate for the button and the Enter key)", () => {
    it("is disabled with an empty message", async () => {
      const { user, picker, send } = setup();
      await user.selectOptions(picker, "p-alpha");

      expect(send).toBeDisabled();
    });

    it("is disabled with whitespace only", async () => {
      const { user, textarea, picker, send } = setup();
      await user.type(textarea, "   ");
      await user.selectOptions(picker, "p-alpha");

      expect(send).toBeDisabled();
    });

    it("is disabled until a participant is chosen (never pre-selected)", async () => {
      const { user, textarea, send } = setup();
      await user.type(textarea, "Hello");

      expect(send).toBeDisabled();
    });

    it("is enabled with a message and a participant", async () => {
      const { user, textarea, picker, send } = setup();
      await user.type(textarea, "Hello");
      await user.selectOptions(picker, "p-alpha");

      expect(send).toBeEnabled();
    });

    it("is disabled while a message is in flight and says so", async () => {
      const { textarea, send } = setup({ busy: true });

      expect(send).toBeDisabled();
      expect(send).toHaveTextContent("Sending…");
      expect(textarea).toBeDisabled();
    });

    it("is disabled below two participants (PRD: at least 2 AI participants)", async () => {
      const { user, textarea, picker, send } = setup({ participants: [alpha] });
      await user.type(textarea, "Hello");
      await user.selectOptions(picker, "p-alpha");

      expect(send).toBeDisabled();
    });
  });

  describe("sending", () => {
    it("sends with the button and clears the form when the message went through", async () => {
      const { user, onSend, textarea, picker, send } = setup();
      await user.type(textarea, "Hello");
      await user.selectOptions(picker, "p-beta");

      await user.click(send);

      expect(onSend).toHaveBeenCalledWith("Hello", "p-beta");
      expect(textarea).toHaveValue("");
      expect(picker).toHaveValue("");
    });

    it("sends on Enter", async () => {
      const { user, onSend, textarea, picker } = setup();
      await user.selectOptions(picker, "p-alpha");

      await user.type(textarea, "Hello{Enter}");

      expect(onSend).toHaveBeenCalledWith("Hello", "p-alpha");
    });

    it("keeps the text when the message was not sent, so it can be retried", async () => {
      const { user, onSend, textarea, picker } = setup({ sent: false });
      await user.selectOptions(picker, "p-alpha");

      await user.type(textarea, "Hello{Enter}");

      expect(onSend).toHaveBeenCalledTimes(1);
      expect(textarea).toHaveValue("Hello");
      expect(picker).toHaveValue("p-alpha");
    });

    it("inserts a new line on Shift+Enter instead of sending", async () => {
      const { user, onSend, textarea, picker } = setup();
      await user.selectOptions(picker, "p-alpha");

      await user.type(textarea, "Line one{Shift>}{Enter}{/Shift}Line two");

      expect(onSend).not.toHaveBeenCalled();
      expect(textarea).toHaveValue("Line one\nLine two");
    });

    it("never sends while an IME composition is in progress", async () => {
      const { user, onSend, textarea, picker } = setup();
      await user.selectOptions(picker, "p-alpha");
      await user.type(textarea, "こんにちは");

      fireEvent.keyDown(textarea, { key: "Enter", isComposing: true });

      expect(onSend).not.toHaveBeenCalled();
    });

    it("does nothing on Enter when the message cannot be sent", async () => {
      const { user, onSend, textarea } = setup();

      await user.type(textarea, "Hello{Enter}");

      expect(onSend).not.toHaveBeenCalled();
    });
  });

  describe("character counter", () => {
    it("stays hidden below 9000 characters", async () => {
      const { user, textarea } = setup();
      await user.click(textarea);
      await user.paste("x".repeat(8_999));

      expect(screen.queryByTestId("char-counter")).not.toBeInTheDocument();
    });

    it("shows the count from 9000 characters up to the 10000 limit", async () => {
      const { user, textarea } = setup();
      await user.click(textarea);
      await user.paste("x".repeat(9_000));

      expect(screen.getByTestId("char-counter")).toHaveTextContent("9000/10000");
    });
  });
});
