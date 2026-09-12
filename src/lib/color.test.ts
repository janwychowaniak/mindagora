import { afterEach, describe, expect, it, vi } from "vitest";

import { randomHexColor } from "./color";

const HEX_COLOR = /^#[0-9A-F]{6}$/;

// randomHexColor draws hue, saturation and lightness in that order.
const drawing = (hue: number, saturation = 0, lightness = 0) => {
  vi.spyOn(Math, "random")
    .mockReturnValueOnce(hue / 360)
    .mockReturnValueOnce(saturation)
    .mockReturnValueOnce(lightness);
};

const channels = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));

describe("randomHexColor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("always produces an uppercase #RRGGBB value (the API contract for participant colours)", () => {
    for (let i = 0; i < 25; i += 1) {
      expect(randomHexColor()).toMatch(HEX_COLOR);
    }
  });

  it("is a pure function of the random draws", () => {
    drawing(0);
    const first = randomHexColor();
    drawing(0);
    const second = randomHexColor();

    expect(first).toBe(second);
    expect(first).toMatch(HEX_COLOR);
  });

  it.each([
    [30, 0, "red"],
    [90, 1, "green"],
    [150, 1, "green"],
    [210, 2, "blue"],
    [270, 2, "blue"],
    [330, 0, "red"],
  ])("hue %i° is dominated by the %s channel", (hue, dominant) => {
    drawing(hue);

    const [r, g, b] = channels(randomHexColor());
    const max = Math.max(r, g, b);

    expect([r, g, b].indexOf(max)).toBe(dominant);
  });

  it("keeps every channel inside the readable band for the dark theme", () => {
    for (const hue of [0, 45, 90, 135, 180, 225, 270, 315]) {
      for (const [saturation, lightness] of [
        [0, 0],
        [0.999, 0],
        [0, 0.999],
        [0.999, 0.999],
      ]) {
        drawing(hue, saturation, lightness);
        const values = channels(randomHexColor());
        expect(Math.max(...values)).toBeGreaterThan(0x80);
        expect(Math.min(...values)).toBeGreaterThan(0x20);
      }
    }
  });
});
