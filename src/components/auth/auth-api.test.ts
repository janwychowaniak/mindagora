import { describe, expect, it } from "vitest";

import { authCredentialsSchema } from "@/lib/validation/auth-credentials";

import { validateCredentials } from "./auth-api";

describe("validateCredentials", () => {
  it("returns no errors for valid credentials", () => {
    expect(validateCredentials({ email: "user@example.com", password: "secret1" })).toEqual({});
  });

  it("ignores surrounding whitespace in the email", () => {
    expect(validateCredentials({ email: "  user@example.com ", password: "secret1" })).toEqual({});
  });

  it.each(["", "user", "user@", "@example.com", "user@example", "us er@example.com"])(
    "flags %j as an invalid email",
    (email) => {
      expect(validateCredentials({ email, password: "secret1" })).toEqual({ email: "Enter a valid email address" });
    }
  );

  it("flags a password shorter than six characters", () => {
    expect(validateCredentials({ email: "user@example.com", password: "12345" })).toEqual({
      password: "Password must be at least 6 characters",
    });
  });

  it("flags both fields at once", () => {
    expect(validateCredentials({ email: "nope", password: "" })).toEqual({
      email: "Enter a valid email address",
      password: "Password must be at least 6 characters",
    });
  });
});

// The client check is a UX mirror of the server schema; if they disagree, the form either blocks a valid
// sign-in or lets a request through that the API rejects with a message the form did not expect.
describe("validateCredentials agrees with authCredentialsSchema", () => {
  it.each([
    { email: "user@example.com", password: "secret1" },
    { email: "  user@example.com  ", password: "secret1" },
    { email: "user@sub.example.co.uk", password: "123456" },
    { email: "", password: "" },
    { email: "user@example", password: "secret1" },
    { email: "us er@example.com", password: "secret1" },
    { email: "user@example.com", password: "12345" },
    { email: "nope", password: "short" },
    { email: "user@example.com", password: "      " },
  ])("reports the same invalid fields for %o", (input) => {
    const clientFields = Object.keys(validateCredentials(input)).sort();

    const parsed = authCredentialsSchema.safeParse(input);
    const serverFields = parsed.success ? [] : Object.keys(parsed.error.flatten().fieldErrors).sort();

    expect(clientFields).toEqual(serverFields);
  });
});
