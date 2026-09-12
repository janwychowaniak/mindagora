import { describe, expect, it } from "vitest";

import { authCredentialsSchema } from "./auth-credentials";

const fieldErrors = (input: unknown) => {
  const result = authCredentialsSchema.safeParse(input);
  return result.success ? {} : result.error.flatten().fieldErrors;
};

describe("authCredentialsSchema", () => {
  it("accepts valid credentials and trims the email", () => {
    const result = authCredentialsSchema.safeParse({ email: "  user@example.com  ", password: "secret1" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ email: "user@example.com", password: "secret1" });
  });

  it("strips keys outside the contract", () => {
    const result = authCredentialsSchema.safeParse({ email: "user@example.com", password: "secret1", role: "admin" });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("role");
  });

  it("rejects an invalid email with the UI message", () => {
    expect(fieldErrors({ email: "not-an-email", password: "secret1" })).toEqual({
      email: ["Enter a valid email address"],
    });
  });

  it("rejects a password shorter than six characters (mirrors supabase/config.toml)", () => {
    expect(fieldErrors({ email: "user@example.com", password: "12345" })).toEqual({
      password: ["Password must be at least 6 characters"],
    });
  });

  it("reports both fields when both are invalid", () => {
    expect(fieldErrors({ email: "nope", password: "" })).toEqual({
      email: ["Enter a valid email address"],
      password: ["Password must be at least 6 characters"],
    });
  });

  it("reports a missing field", () => {
    expect(Object.keys(fieldErrors({ email: "user@example.com" }))).toEqual(["password"]);
  });

  it("rejects non-string values", () => {
    expect(Object.keys(fieldErrors({ email: 42, password: null })).sort()).toEqual(["email", "password"]);
  });
});
