import { describe, expect, it } from "vitest";

import { formatDay, formatRelative, formatTime, isSameDay } from "./format";

// The setup file pins TZ=UTC, so day boundaries and clock times are deterministic here.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const now = new Date("2026-09-12T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("formatRelative", () => {
  it.each([
    [0, "just now"],
    [MINUTE - 1, "just now"],
    [MINUTE, "1m ago"],
    [HOUR - 1, "59m ago"],
    [HOUR, "1h ago"],
    [DAY - 1, "23h ago"],
    [DAY, "1d ago"],
    [7 * DAY - 1, "6d ago"],
  ])("renders %i ms ago as %s", (elapsed, expected) => {
    expect(formatRelative(ago(elapsed), now)).toBe(expected);
  });

  it("falls back to the day once a week has passed", () => {
    expect(formatRelative(ago(7 * DAY), now)).toBe("Sep 5");
  });

  it("reads a timestamp slightly in the future (clock skew) as just now", () => {
    expect(formatRelative(ago(-30_000), now)).toBe("just now");
  });
});

describe("formatDay", () => {
  it("omits the year for the current year", () => {
    expect(formatDay("2026-03-04T12:00:00Z", now)).toBe("Mar 4");
  });

  it("appends the year for another year", () => {
    expect(formatDay("2025-12-15T12:00:00Z", now)).toBe("Dec 15, 2025");
  });
});

describe("isSameDay", () => {
  it("is true for two times on the same calendar day", () => {
    expect(isSameDay("2026-09-12T00:00:01Z", "2026-09-12T23:59:59Z")).toBe(true);
  });

  it("is false across midnight", () => {
    expect(isSameDay("2026-09-12T23:59:59Z", "2026-09-13T00:00:00Z")).toBe(false);
  });

  it("is false for the same day of month in another month or year", () => {
    expect(isSameDay("2026-09-12T12:00:00Z", "2026-08-12T12:00:00Z")).toBe(false);
    expect(isSameDay("2026-09-12T12:00:00Z", "2025-09-12T12:00:00Z")).toBe(false);
  });
});

describe("formatTime", () => {
  it("renders a 12-hour clock time", () => {
    expect(formatTime("2026-09-12T10:45:00Z")).toBe("10:45 AM");
    expect(formatTime("2026-09-12T22:05:00Z")).toBe("10:05 PM");
  });
});
