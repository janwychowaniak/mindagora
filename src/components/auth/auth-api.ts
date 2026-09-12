import type { ApiErrorResponseDTO } from "@/types";

export const NETWORK_ERROR_MESSAGE = "Network error - check your connection.";
export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

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

export interface ApiFailure {
  status: number;
  fieldErrors: CredentialFieldErrors;
  message: string | null;
}

// Splits an API error body into per-field messages (`details` map) or one general message (`details` string).
export const readApiFailure = async (response: Response): Promise<ApiFailure> => {
  let payload: ApiErrorResponseDTO | null = null;
  try {
    payload = (await response.json()) as ApiErrorResponseDTO;
  } catch {
    payload = null;
  }

  if (!payload) {
    return { status: response.status, fieldErrors: {}, message: GENERIC_ERROR_MESSAGE };
  }

  if (typeof payload.details === "string") {
    return { status: response.status, fieldErrors: {}, message: payload.details };
  }

  return { status: response.status, fieldErrors: payload.details, message: null };
};

export const postJson = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
