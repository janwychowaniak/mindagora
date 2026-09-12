// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ApiFailure } from "@/lib/api-client";
import { deferred, failed } from "@/test/fixtures";

import { InlineTitleEditor } from "./InlineTitleEditor";

const setup = (onSave = vi.fn<(title: string) => Promise<ApiFailure | null>>().mockResolvedValue(null)) => {
  const user = userEvent.setup();
  render(<InlineTitleEditor title="First conversation" onSave={onSave} />);
  return { user, onSave };
};

const openEditor = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByTestId("conversation-title"));
  return screen.getByRole("textbox", { name: "Conversation title" });
};

describe("InlineTitleEditor", () => {
  it("shows the title as a button and opens a focused, fully selected input on click", async () => {
    const { user } = setup();
    expect(screen.getByTestId("conversation-title")).toHaveTextContent("First conversation");

    const input = (await openEditor(user)) as HTMLInputElement;

    expect(input).toHaveValue("First conversation");
    expect(input).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, "First conversation".length]);
  });

  it("saves the trimmed title on Enter and returns to the button", async () => {
    const { user, onSave } = setup();
    const input = await openEditor(user);

    await user.clear(input);
    await user.type(input, "  Renamed  {Enter}");

    expect(onSave).toHaveBeenCalledWith("Renamed");
    expect(await screen.findByTestId("conversation-title")).toBeInTheDocument();
  });

  it("rejects an empty title inline without calling onSave", async () => {
    const { user, onSave } = setup();
    const input = await openEditor(user);

    await user.clear(input);
    await user.keyboard("{Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent("Title cannot be empty");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes without saving when the title did not change", async () => {
    const { user, onSave } = setup();
    await openEditor(user);

    await user.keyboard("{Enter}");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("conversation-title")).toBeInTheDocument();
  });

  it("cancels on Escape", async () => {
    const { user, onSave } = setup();
    const input = await openEditor(user);

    await user.clear(input);
    await user.type(input, "Changed{Escape}");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("conversation-title")).toHaveTextContent("First conversation");
  });

  it("cancels on blur, so a stray click never saves", async () => {
    const { user, onSave } = setup();
    const input = await openEditor(user);
    await user.clear(input);
    await user.type(input, "Changed");

    fireEvent.blur(input);

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("conversation-title")).toBeInTheDocument();
  });

  it("shows the per-field message from a validation failure", async () => {
    const { user } = setup(vi.fn().mockResolvedValue(failed(400, { title: "Title is too long" })));
    const input = await openEditor(user);

    await user.clear(input);
    await user.type(input, "Changed{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Title is too long");
    expect(screen.getByRole("textbox", { name: "Conversation title" })).toBeInTheDocument();
  });

  it("shows the general message of any other failure", async () => {
    const { user } = setup(vi.fn().mockResolvedValue(failed(500, "Database unavailable")));
    const input = await openEditor(user);

    await user.clear(input);
    await user.type(input, "Changed{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
  });

  it("disables the input while saving and ignores blur until the save settles", async () => {
    const save = deferred<ApiFailure | null>();
    const { user } = setup(vi.fn().mockReturnValue(save.promise));
    const input = await openEditor(user);
    await user.clear(input);
    await user.type(input, "Changed{Enter}");

    expect(input).toBeDisabled();
    fireEvent.blur(input);
    expect(screen.getByRole("textbox", { name: "Conversation title" })).toBeInTheDocument();

    save.resolve(null);

    expect(await screen.findByTestId("conversation-title")).toBeInTheDocument();
  });
});
