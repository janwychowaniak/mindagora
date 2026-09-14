import { describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "../../db/supabase.client.ts";
import { extractBearerToken, signOut } from "./auth.service.ts";

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

describe("signOut", () => {
  // The library default is "global", which would sign the account out of every other browser and device.
  const clientWith = (result: { error: unknown }) => {
    const spy = vi.fn().mockResolvedValue(result);
    return { client: { auth: { signOut: spy } } as unknown as SupabaseClient, spy };
  };

  it("ends only the session that made the request", async () => {
    const { client, spy } = clientWith({ error: null });

    await signOut({ supabase: client });

    expect(spy).toHaveBeenCalledWith({ scope: "local" });
  });

  it("reports a failure from the authentication service", async () => {
    const { client } = clientWith({ error: { message: "session not found", code: "session_not_found", status: 403 } });

    const result = await signOut({ supabase: client });

    expect(result.error).not.toBeNull();
    expect(result.data).toBeNull();
  });
});
