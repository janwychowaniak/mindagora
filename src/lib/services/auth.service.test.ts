import { describe, expect, it } from "vitest";

import { extractBearerToken } from "./auth.service.ts";

const requestWith = (authorization?: string) =>
  new Request("http://localhost:3000/api/conversations", {
    headers: authorization === undefined ? {} : { Authorization: authorization },
  });

describe("extractBearerToken", () => {
  it("returns null without an Authorization header", () => {
    expect(extractBearerToken(requestWith())).toBeNull();
  });

  it.each(["Basic dXNlcjpwYXNz", "Bearer", "Bearer ", "Token abc", "Bearer abc def"])(
    "returns null for the malformed header %j",
    (header) => {
      expect(extractBearerToken(requestWith(header))).toBeNull();
    }
  );

  it("returns the token after the Bearer scheme", () => {
    expect(extractBearerToken(requestWith("Bearer eyJhbGciOi.payload.sig"))).toBe("eyJhbGciOi.payload.sig");
  });

  it("accepts the scheme in any letter case", () => {
    expect(extractBearerToken(requestWith("bearer abc"))).toBe("abc");
    expect(extractBearerToken(requestWith("BEARER abc"))).toBe("abc");
  });

  it("tolerates extra whitespace between the scheme and the token", () => {
    expect(extractBearerToken(requestWith("Bearer    abc"))).toBe("abc");
  });
});
