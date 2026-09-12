import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RegisterResponseDTO } from "@/types";

import {
  NETWORK_ERROR_MESSAGE,
  postJson,
  readApiFailure,
  validateCredentials,
  type CredentialFieldErrors,
} from "./auth-api";

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<CredentialFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationRequired, setConfirmationRequired] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const errors = validateCredentials({ email, password });
    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await postJson("/api/auth/register", { email: email.trim(), password });
      if (response.ok) {
        const payload = (await response.json()) as RegisterResponseDTO;
        if (payload.confirmation_required) {
          // Production: Supabase opened no session until the email address is confirmed.
          setConfirmationRequired(true);
          return;
        }

        // Local dev: signed in right away; full navigation so the server sees the new cookies.
        window.location.assign("/");
        return;
      }

      const failure = await readApiFailure(response);
      setFieldErrors(failure.fieldErrors);
      setFormError(failure.message);
    } catch {
      setFormError(NETWORK_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmationRequired) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            We sent a confirmation link to <span className="text-foreground">{email.trim()}</span>. Confirm your
            account, then log in.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            <a href="/login">Go to login</a>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Use your email and a password of at least 6 characters.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="register-email">Email</Label>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
            />
            {fieldErrors.email && (
              <p id="register-email-error" className="text-sm text-destructive">
                {fieldErrors.email}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-password">Password</Label>
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "register-password-error" : undefined}
            />
            {fieldErrors.password && (
              <p id="register-password-error" className="text-sm text-destructive">
                {fieldErrors.password}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-confirm-password">Confirm password</Label>
            <Input
              id="register-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={fieldErrors.confirmPassword ? "register-confirm-password-error" : undefined}
            />
            {fieldErrors.confirmPassword && (
              <p id="register-confirm-password-error" className="text-sm text-destructive">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </CardContent>
        <CardFooter className="mt-6 flex flex-col items-stretch gap-4">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Register"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <a href="/login" className="text-foreground underline underline-offset-4">
              Log in
            </a>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default RegisterForm;
