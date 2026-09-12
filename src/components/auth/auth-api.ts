// Client-side helpers shared by the sign-in and sign-up forms. HTTP goes through src/lib/api-client.

export interface CredentialFieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

// UX-only validation mirroring the server schema; the API validates again.
export const validateCredentials = ({ email, password }: { email: string; password: string }) => {
  const errors: CredentialFieldErrors = {};

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = "Enter a valid email address";
  }

  if (password.length < 6) {
    errors.password = "Password must be at least 6 characters";
  }

  return errors;
};
