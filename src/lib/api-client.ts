import type { ApiErrorResponseDTO } from "@/types";

export const NETWORK_ERROR_MESSAGE = "Network error - check your connection.";
export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

// A failed API call as the views see it. `message` is ready to display: the `details` string, or the
// per-field messages joined when `details` is a map. `status` is 0 when the request never reached the server.
export interface ApiFailure {
  status: number;
  error: string;
  details: string | Record<string, string>;
  message: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

type Method = "GET" | "POST" | "PUT" | "DELETE";

const LOGIN_PATH = "/login";
const SETTINGS_PATH = "/settings";
const API_KEY_NOTICE_PATH = "/settings?notice=api-key";

// A failed sign-in answers 401 as well; that is not an expired session, so the auth forms handle it inline.
const isAuthEndpoint = (path: string) => path.startsWith("/api/auth/");

const toMessage = (details: ApiFailure["details"]): string => {
  if (typeof details === "string") {
    return details;
  }

  const joined = Object.values(details).join(" ");
  return joined.length > 0 ? joined : GENERIC_ERROR_MESSAGE;
};

const networkFailure = (): ApiFailure => ({
  status: 0,
  error: "Network error",
  details: NETWORK_ERROR_MESSAGE,
  message: NETWORK_ERROR_MESSAGE,
});

const readFailure = async (response: Response): Promise<ApiFailure> => {
  let payload: ApiErrorResponseDTO | null = null;
  try {
    payload = (await response.json()) as ApiErrorResponseDTO;
  } catch {
    payload = null;
  }

  const details = payload?.details ?? GENERIC_ERROR_MESSAGE;
  return {
    status: response.status,
    error: payload?.error ?? "Error",
    details,
    message: toMessage(details),
  };
};

// The UI branches on HTTP status, never on the error label (frontend rules): 401 means the session is gone,
// 412 means the OpenRouter key is missing. Both are handled here once, so views only deal with their own errors.
const redirectForStatus = (status: number, path: string) => {
  if (status === 401 && !isAuthEndpoint(path)) {
    window.location.assign(LOGIN_PATH);
    return;
  }

  // On the settings page itself a 412 (models list without a key) is shown inline instead of reloading the page.
  if (status === 412 && window.location.pathname !== SETTINGS_PATH) {
    window.location.assign(API_KEY_NOTICE_PATH);
  }
};

const request = async <T>(method: Method, path: string, body?: unknown): Promise<ApiResult<T>> => {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, failure: networkFailure() };
  }

  if (!response.ok) {
    const failure = await readFailure(response);
    redirectForStatus(failure.status, path);
    return { ok: false, failure };
  }

  try {
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      failure: {
        status: response.status,
        error: "Invalid response",
        details: GENERIC_ERROR_MESSAGE,
        message: GENERIC_ERROR_MESSAGE,
      },
    };
  }
};

export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: unknown) => request<T>("POST", path, body);
export const apiPut = <T>(path: string, body: unknown) => request<T>("PUT", path, body);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);

// Per-field messages from a validation failure, or an empty map for any other failure.
export const fieldErrors = (failure: ApiFailure): Record<string, string> =>
  typeof failure.details === "string" ? {} : failure.details;

// The general (non-field) message of a failure, or null when the failure is entirely per-field.
export const formMessage = (failure: ApiFailure): string | null =>
  typeof failure.details === "string" ? failure.message : null;
