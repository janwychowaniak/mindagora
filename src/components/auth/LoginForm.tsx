import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { apiPost, fieldErrors as failureFieldErrors, formMessage } from "@/lib/api-client";
import type { LoginResponseDTO } from "@/types";

import { validateCredentials, type CredentialFieldErrors } from "./auth-api";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<CredentialFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const errors = validateCredentials({ email, password });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);
    const result = await apiPost<LoginResponseDTO>("/api/auth/login", { email: email.trim(), password });
    if (result.ok) {
      // Full navigation so the server renders the next page with the new session cookies.
      window.location.assign("/");
      return;
    }

    setFieldErrors(failureFieldErrors(result.failure));
    setFormError(formMessage(result.failure));
    setSubmitting(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>Enter your email and password to continue.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
              data-testid="login-email"
            />
            {fieldErrors.email && (
              <p id="login-email-error" className="text-sm text-destructive">
                {fieldErrors.email}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
              data-testid="login-password"
            />
            {fieldErrors.password && (
              <p id="login-password-error" className="text-sm text-destructive">
                {fieldErrors.password}
              </p>
            )}
          </div>
          {formError && (
            <p role="alert" className="text-sm text-destructive" data-testid="login-error">
              {formError}
            </p>
          )}
        </CardContent>
        <CardFooter className="mt-6 flex flex-col items-stretch gap-4">
          <Button type="submit" disabled={submitting} data-testid="login-submit">
            {submitting ? "Logging in…" : "Log in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a href="/register" className="text-foreground underline underline-offset-4">
              Register
            </a>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default LoginForm;
