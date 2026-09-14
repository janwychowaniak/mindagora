// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiPost } from "@/lib/api-client";
import type { ApiFailure } from "@/lib/api-client";

import { LogoutButton } from "./LogoutButton";

vi.mock("@/lib/api-client", () => ({ apiPost: vi.fn() }));

const assign = vi.fn();

const rejected = (status: number, details: string) => ({
  ok: false as const,
  failure: { status, error: "Error", details, message: details } satisfies ApiFailure,
});

const clickLogout = async () => {
  render(<LogoutButton />);
  await userEvent.click(screen.getByTestId("logout-button"));
};

describe("LogoutButton", () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    assign.mockReset();
    // jsdom refuses a real navigation; the component only calls `location.assign`.
    Object.defineProperty(window, "location", { configurable: true, value: { pathname: "/", assign } });
  });

  it("goes to the sign-in page after signing out", async () => {
    vi.mocked(apiPost).mockResolvedValue({ ok: true, data: { message: "Logged out successfully" } });

    await clickLogout();

    expect(assign).toHaveBeenCalledWith("/login");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats a session that is already gone as signed out", async () => {
    vi.mocked(apiPost).mockResolvedValue(rejected(401, "Missing or invalid session"));

    await clickLogout();

    expect(assign).toHaveBeenCalledWith("/login");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the visitor in place and explains a refused sign-out", async () => {
    vi.mocked(apiPost).mockResolvedValue(rejected(403, "Forbidden"));

    await clickLogout();

    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Logout failed. Please try again.");
  });

  it("shows the network message when the request never reached the server", async () => {
    vi.mocked(apiPost).mockResolvedValue(rejected(0, "Network error - check your connection."));

    await clickLogout();

    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Network error - check your connection.");
  });
});
