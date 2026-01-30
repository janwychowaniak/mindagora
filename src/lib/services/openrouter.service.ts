import { z } from "zod";

import type {
  ApiErrorResponseDTO,
  OpenRouterChatRequest,
  OpenRouterModelDTO,
  OpenRouterModelListDTO,
} from "../../types";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_VALIDATE_KEY_TIMEOUT_MS = 10_000;
export const OPENROUTER_DEFAULT_TIMEOUT_MS = 30_000;

const openRouterHttpReferer = import.meta.env.OPENROUTER_HTTP_REFERER;
const openRouterTitle = import.meta.env.OPENROUTER_X_TITLE;

const apiKeySchema = z.string().min(1);

const openRouterErrorResponseSchema = z.object({
  error: z.object({
    code: z.union([z.number(), z.string()]),
    message: z.string(),
    metadata: z.unknown().optional(),
  }),
});

const openRouterKeyInfoResponseSchema = z.object({
  // OpenRouter payload shape varies; require `data` as an object and allow extra fields.
  data: z.object({}).passthrough(),
});

const pricingValueSchema = z.union([z.string(), z.number()]).transform((value) => String(value));

const openRouterModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  pricing: z.object({
    prompt: pricingValueSchema,
    completion: pricingValueSchema,
  }),
});

const openRouterModelsResponseSchema = z.union([
  z.array(openRouterModelSchema),
  z.object({ data: z.array(openRouterModelSchema) }),
]);

const openRouterChatResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
      }),
    })
  ),
});

export class OpenRouterServiceError extends Error {
  override name = "OpenRouterServiceError";
}

export class OpenRouterInvalidApiKeyError extends OpenRouterServiceError {
  override name = "OpenRouterInvalidApiKeyError";
}

export class OpenRouterHttpError extends OpenRouterServiceError {
  override name = "OpenRouterHttpError";
  status: number;
  apiError: ApiErrorResponseDTO;

  constructor(status: number, apiError: ApiErrorResponseDTO) {
    super(`OpenRouter request failed with status ${status}.`);
    this.status = status;
    this.apiError = apiError;
  }
}

export class OpenRouterTimeoutError extends OpenRouterServiceError {
  override name = "OpenRouterTimeoutError";

  constructor(message = "OpenRouter request timed out.") {
    super(message);
  }
}

export class OpenRouterNetworkError extends OpenRouterServiceError {
  override name = "OpenRouterNetworkError";

  constructor(message = "Failed to reach OpenRouter.") {
    super(message);
  }
}

export class OpenRouterInvalidResponseError extends OpenRouterServiceError {
  override name = "OpenRouterInvalidResponseError";

  constructor(message = "OpenRouter returned an unexpected response.") {
    super(message);
  }
}

const buildHeaders = (apiKey: string, includeJson: boolean): HeadersInit => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  if (openRouterHttpReferer) {
    headers["HTTP-Referer"] = openRouterHttpReferer;
  }

  if (openRouterTitle) {
    headers["X-Title"] = openRouterTitle;
  }

  return headers;
};

const mapStatusToLabel = (status: number): string => {
  if (status === 400) return "Bad Request";
  if (status === 401) return "Unauthorized";
  if (status === 402) return "Payment Required";
  if (status === 429) return "Too Many Requests";
  if (status === 502) return "Bad Gateway";
  if (status === 503) return "Service Unavailable";

  return "OpenRouter Error";
};

const parseJsonBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  if (!text) {
    throw new OpenRouterInvalidResponseError("OpenRouter returned an empty response.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new OpenRouterInvalidResponseError("OpenRouter returned invalid JSON.");
  }
};

const parseErrorResponse = async (response: Response): Promise<ApiErrorResponseDTO> => {
  const text = await response.text();
  const fallbackDetails = text || "Unknown OpenRouter error";

  if (!text) {
    return {
      error: mapStatusToLabel(response.status),
      details: fallbackDetails,
    };
  }

  try {
    const json = JSON.parse(text);
    const parsed = openRouterErrorResponseSchema.safeParse(json);

    if (parsed.success) {
      return {
        error: mapStatusToLabel(response.status),
        details: parsed.data.error.message,
      };
    }
  } catch {
    // Ignore parse errors and fall back to text response.
  }

  return {
    error: mapStatusToLabel(response.status),
    details: fallbackDetails,
  };
};

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  let didTimeout = false;

  if (init.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    const isAbortError = error instanceof Error && error.name === "AbortError";

    if (didTimeout || isAbortError) {
      throw new OpenRouterTimeoutError();
    }

    throw new OpenRouterNetworkError();
  } finally {
    clearTimeout(timeoutId);
  }
};

const validateApiKeyInput = (apiKey: string): void => {
  const parsed = apiKeySchema.safeParse(apiKey);
  if (!parsed.success) {
    throw new OpenRouterInvalidApiKeyError("OpenRouter API key is required.");
  }
};

/**
 * Validate OpenRouter API key by calling /key endpoint.
 * @param apiKey - User-provided OpenRouter API key.
 * @returns True when the key is valid.
 * @throws OpenRouterInvalidApiKeyError for missing key.
 * @throws OpenRouterTimeoutError for timeouts.
 * @throws OpenRouterNetworkError for network failures.
 * @throws OpenRouterHttpError for non-2xx responses.
 * @throws OpenRouterInvalidResponseError for unexpected payloads.
 */
export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  validateApiKeyInput(apiKey);

  const response = await fetchWithTimeout(
    `${OPENROUTER_BASE_URL}/key`,
    {
      method: "GET",
      headers: buildHeaders(apiKey, false),
    },
    OPENROUTER_VALIDATE_KEY_TIMEOUT_MS
  );

  if (!response.ok) {
    const apiError = await parseErrorResponse(response);
    throw new OpenRouterHttpError(response.status, apiError);
  }

  const payload = await parseJsonBody(response);
  const parsed = openRouterKeyInfoResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new OpenRouterInvalidResponseError("OpenRouter key response is invalid.");
  }

  return true;
};

/**
 * Fetch models list from OpenRouter and normalize to { data: [] }.
 * @param apiKey - User-provided OpenRouter API key.
 * @returns Normalized models list DTO.
 * @throws OpenRouterInvalidApiKeyError for missing key.
 * @throws OpenRouterTimeoutError for timeouts.
 * @throws OpenRouterNetworkError for network failures.
 * @throws OpenRouterHttpError for non-2xx responses.
 * @throws OpenRouterInvalidResponseError for unexpected payloads.
 */
export const getModels = async (apiKey: string): Promise<OpenRouterModelListDTO> => {
  validateApiKeyInput(apiKey);

  const response = await fetchWithTimeout(
    `${OPENROUTER_BASE_URL}/models`,
    {
      method: "GET",
      headers: buildHeaders(apiKey, false),
    },
    OPENROUTER_DEFAULT_TIMEOUT_MS
  );

  if (!response.ok) {
    const apiError = await parseErrorResponse(response);
    throw new OpenRouterHttpError(response.status, apiError);
  }

  const payload = await parseJsonBody(response);
  const parsed = openRouterModelsResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new OpenRouterInvalidResponseError("OpenRouter models response is invalid.");
  }

  const models = Array.isArray(parsed.data) ? parsed.data : parsed.data.data;
  const normalized: OpenRouterModelDTO[] = models.map((model) => ({
    id: model.id,
    name: model.name,
    pricing: {
      prompt: model.pricing.prompt,
      completion: model.pricing.completion,
    },
  }));

  return { data: normalized };
};

/**
 * Send chat completion request to OpenRouter and return assistant content.
 * @param apiKey - User-provided OpenRouter API key.
 * @param request - Chat completion request payload.
 * @returns Assistant response content.
 * @throws OpenRouterInvalidApiKeyError for missing key.
 * @throws OpenRouterTimeoutError for timeouts.
 * @throws OpenRouterNetworkError for network failures.
 * @throws OpenRouterHttpError for non-2xx responses.
 * @throws OpenRouterInvalidResponseError for unexpected payloads.
 */
export const sendChatCompletion = async (apiKey: string, request: OpenRouterChatRequest): Promise<string> => {
  validateApiKeyInput(apiKey);

  const payload = {
    ...request,
    stream: false,
  };

  const response = await fetchWithTimeout(
    `${OPENROUTER_BASE_URL}/chat/completions`,
    {
      method: "POST",
      headers: buildHeaders(apiKey, true),
      body: JSON.stringify(payload),
    },
    OPENROUTER_DEFAULT_TIMEOUT_MS
  );

  if (!response.ok) {
    const apiError = await parseErrorResponse(response);
    throw new OpenRouterHttpError(response.status, apiError);
  }

  const responseBody = await parseJsonBody(response);
  const parsed = openRouterChatResponseSchema.safeParse(responseBody);

  if (!parsed.success) {
    throw new OpenRouterInvalidResponseError("OpenRouter chat response is invalid.");
  }

  const firstChoice = parsed.data.choices[0];
  const content = firstChoice?.message?.content;

  if (!content) {
    throw new OpenRouterInvalidResponseError("OpenRouter chat response is missing content.");
  }

  return content;
};
