// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { message, participant } from "@/test/fixtures";

import { MessageList } from "./MessageList";

// jsdom has no layout: the auto-scroll hook calls scrollTo on the container, which is a no-op here.
beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

const emptyState = <p>Nothing yet</p>;

// The visual order of separators and messages inside the list, by test id.
const sequence = () =>
  Array.from(screen.getByTestId("message-list").querySelectorAll("[data-testid]")).map((element) =>
    element.getAttribute("data-testid")
  );

describe("MessageList", () => {
  it("shows the empty state when there are no messages and nothing pending", () => {
    render(<MessageList messages={[]} pending={null} emptyState={emptyState} />);

    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
    expect(screen.queryAllByTestId("message-item")).toHaveLength(0);
  });

  it("puts one separator above the first message of each day (PRD §3.6)", () => {
    render(
      <MessageList
        messages={[
          message({ id: "m-1", created_at: "2026-09-11T09:00:00Z" }),
          message({ id: "m-2", created_at: "2026-09-11T18:30:00Z" }),
          message({ id: "m-3", created_at: "2026-09-12T08:00:00Z" }),
        ]}
        pending={null}
        emptyState={emptyState}
      />
    );

    expect(sequence()).toEqual(["date-separator", "message-item", "message-item", "date-separator", "message-item"]);
    expect(screen.getAllByTestId("date-separator").map((element) => element.textContent)).toEqual(["Sep 11", "Sep 12"]);
  });

  it("renders the pending row after the messages, named after the participant asked", () => {
    render(
      <MessageList
        messages={[message({ id: "m-1" })]}
        pending={{ participant: participant({ alias: "Beta", color: "#AA0000" }) }}
        emptyState={emptyState}
      />
    );

    expect(sequence()).toEqual(["date-separator", "message-item", "pending-reply"]);
    const pending = screen.getByRole("status");
    expect(within(pending).getByText("AI - Beta")).toBeInTheDocument();
    expect(pending).toHaveTextContent("is thinking…");
  });

  it("does not show the empty state while the first reply is pending", () => {
    render(<MessageList messages={[]} pending={{ participant: participant() }} emptyState={emptyState} />);

    expect(screen.queryByText("Nothing yet")).not.toBeInTheDocument();
    expect(screen.getByTestId("pending-reply")).toBeInTheDocument();
  });
});
