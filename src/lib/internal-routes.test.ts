import { describe, expect, it } from "vitest";

import { isUnusedAstroRoute } from "./internal-routes.ts";

describe("isUnusedAstroRoute", () => {
  it.each(["/_image", "/_image/", "/_server-islands/Chat", "/_server-islands/"])("closes %s", (pathname) => {
    expect(isUnusedAstroRoute(pathname)).toBe(true);
  });

  it.each(["/", "/login", "/api/conversations", "/_astro/index.abc123.css", "/_images", "/conversations/_image"])(
    "leaves %s to the router",
    (pathname) => {
      expect(isUnusedAstroRoute(pathname)).toBe(false);
    }
  );
});
