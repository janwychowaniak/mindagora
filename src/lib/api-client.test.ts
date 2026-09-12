import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  fieldErrors,
  formMessage,
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  type ApiFailure,
} from "./api-client";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fetchMock = vi.fn<typeof fetch>();
const assign = vi.fn();

// The client only reads `location.pathname` and calls `location.assign`, so a plain stub replaces the window.
const stubWindow = (pathname: string) => {
  vi.stubGlobal("window", { location: { pathname, assign } });
};

describe("api-client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    assign.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    stubWindow("/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("requests", () => {
    it("sends a GET without headers or body and returns the JSON payload", async () => {
      fetchMock.mockResolvedValue(jsonResponse([{ id: "c1" }]));

      const result = await apiGet<{ id: string }[]>("/api/conversations");

      expect(result).toEqual({ ok: true, data: [{ id: "c1" }] });
      expect(fetchMock).toHaveBeenCalledWith("/api/conversations", {
        method: "GET",
        headers: undefined,
        body: undefined,
      });
    });

    it("sends JSON with the content type when a body is given", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ id: "c1" }, 201));

      await apiPost("/api/conversations", { user_message: "Hi", ai_participant_id: "p1" });

      expect(fetchMock).toHaveBeenCalledWith("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_message: "Hi", ai_participant_id: "p1" }),
      });
    });

    it("sends a POST without a body as an empty request", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ success: true }));

      await apiPost("/api/auth/logout");

      expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
        method: "POST",
        headers: undefined,
        body: undefined,
      });
    });

    it("uses the PUT and DELETE methods", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ success: true }));

      await apiPut("/api/conversations/c1", { title: "New" });
      await apiDelete("/api/conversations/c1");

      expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PUT" });
      expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    });
  });

  describe("failures", () => {
    it("reports a network failure with status 0 when fetch rejects", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await apiGet("/api/conversations");

      expect(result).toEqual({
        ok: false,
        failure: { status: 0, error: "Network error", details: NETWORK_ERROR_MESSAGE, message: NETWORK_ERROR_MESSAGE },
      });
    });

    it("reports an invalid response when a 2xx body is not JSON", async () => {
      fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));

      const result = await apiGet("/api/conversations");

      expect(result).toEqual({
        ok: false,
        failure: {
          status: 200,
          error: "Invalid response",
          details: GENERIC_ERROR_MESSAGE,
          message: GENERIC_ERROR_MESSAGE,
        },
      });
    });

    it("uses a string `details` as the message", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "Validation error", details: "At least 2 participants" }, 400));

      const result = await apiPost("/api/conversations", {});

      expect(result).toEqual({
        ok: false,
        failure: {
          status: 400,
          error: "Validation error",
          details: "At least 2 participants",
          message: "At least 2 participants",
        },
      });
    });

    it("joins per-field `details` into the message and keeps the map", async () => {
      const details = { alias: "Alias is required", model_id: "Model is required" };
      fetchMock.mockResolvedValue(jsonResponse({ error: "Validation error", details }, 400));

      const result = await apiPost("/api/ai-participants", {});

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.details).toEqual(details);
      expect(result.failure.message).toBe("Alias is required Model is required");
    });

    it("falls back to the generic message for an empty `details` map", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "Validation error", details: {} }, 400));

      const result = await apiPost("/api/ai-participants", {});

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.message).toBe(GENERIC_ERROR_MESSAGE);
    });

    it("falls back to a generic failure when the error body is missing", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

      const result = await apiGet("/api/conversations");

      expect(result).toEqual({
        ok: false,
        failure: { status: 500, error: "Error", details: GENERIC_ERROR_MESSAGE, message: GENERIC_ERROR_MESSAGE },
      });
    });
  });

  describe("status redirects (frontend rules: branch on status, never on the label)", () => {
    it("sends an expired session to /login", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "Unauthorized", details: "Session expired" }, 401));

      const result = await apiGet("/api/conversations");

      expect(result.ok).toBe(false);
      expect(assign).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith("/login");
    });

    it("leaves a failed sign-in (401 from /api/auth/*) to the form", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "Unauthorized", details: "Invalid login credentials" }, 401));

      const result = await apiPost("/api/auth/login", { email: "a@b.co", password: "wrong1" });

      expect(result.ok).toBe(false);
      expect(assign).not.toHaveBeenCalled();
    });

    it("sends a missing API key (412) to the settings page with the notice", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "Precondition Failed", details: "No API key" }, 412));

      await apiGet("/api/openrouter-models");

      expect(assign).toHaveBeenCalledWith("/settings?notice=api-key");
    });

    it("shows a 412 inline when already on the settings page", async () => {
      stubWindow("/settings");
      fetchMock.mockResolvedValue(jsonResponse({ error: "Precondition Failed", details: "No API key" }, 412));

      const result = await apiGet("/api/openrouter-models");

      expect(result.ok).toBe(false);
      expect(assign).not.toHaveBeenCalled();
    });

    it("does not redirect on other failures", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "Not Found", details: "Conversation not found" }, 404));

      await apiGet("/api/conversations/missing");

      expect(assign).not.toHaveBeenCalled();
    });
  });
});

describe("fieldErrors and formMessage", () => {
  const perField: ApiFailure = {
    status: 400,
    error: "Validation error",
    details: { title: "Title cannot be empty" },
    message: "Title cannot be empty",
  };
  const general: ApiFailure = {
    status: 500,
    error: "Internal Server Error",
    details: "Something broke",
    message: "Something broke",
  };

  it("exposes per-field messages only for a per-field failure", () => {
    expect(fieldErrors(perField)).toEqual({ title: "Title cannot be empty" });
    expect(fieldErrors(general)).toEqual({});
  });

  it("exposes the general message only for a general failure", () => {
    expect(formMessage(general)).toBe("Something broke");
    expect(formMessage(perField)).toBeNull();
  });
});
