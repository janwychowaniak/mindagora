import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onboardingGate } from "./onboarding-gate";
import { getOnboardingStatus } from "./services/onboarding.service.ts";

// `resolveOnboardingStep` stays real (it is pure); only the Supabase-backed lookup is mocked.
vi.mock("./services/onboarding.service.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./services/onboarding.service.ts")>()),
  getOnboardingStatus: vi.fn(),
}));

type Locals = Parameters<typeof onboardingGate>[0]["locals"];

const signedIn = { user: { id: "user-1" }, supabase: {} } as unknown as Locals;
const signedOut = { user: null, supabase: {} } as unknown as Locals;

describe("onboardingGate", () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(getOnboardingStatus).mockReset();
    errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects a visitor without a session to /login without any lookup", async () => {
    const outcome = await onboardingGate({ locals: signedOut, route: "/" });

    expect(outcome).toEqual({ redirect: "/login" });
    expect(getOnboardingStatus).not.toHaveBeenCalled();
  });

  it("answers 503 and logs when the status lookup fails (backend outage, not user state)", async () => {
    vi.mocked(getOnboardingStatus).mockResolvedValue({ data: null, error: { message: "down", code: "57P01" } });

    const outcome = await onboardingGate({ locals: signedIn, route: "/" });

    expect(outcome).not.toBeNull();
    if (!outcome || !("response" in outcome)) throw new Error("expected a response outcome");
    expect(outcome.response.status).toBe(503);
    expect(errorLog).toHaveBeenCalledWith(
      "Onboarding status lookup failed",
      expect.objectContaining({ route: "/", status: 503, supabase_error_code: "57P01" })
    );
  });

  it("answers 503 when the lookup returns no data", async () => {
    vi.mocked(getOnboardingStatus).mockResolvedValue({ data: null, error: null });

    const outcome = await onboardingGate({ locals: signedIn, route: "/conversations/new" });

    expect(outcome).not.toBeNull();
    if (!outcome || !("response" in outcome)) throw new Error("expected a response outcome");
    expect(outcome.response.status).toBe(503);
  });

  it.each([
    ["no API key", { hasApiKey: false, participantCount: 2 }],
    ["fewer than two participants", { hasApiKey: true, participantCount: 1 }],
  ])("redirects to /onboarding with %s", async (_label, status) => {
    vi.mocked(getOnboardingStatus).mockResolvedValue({ data: status, error: null });

    expect(await onboardingGate({ locals: signedIn, route: "/" })).toEqual({ redirect: "/onboarding" });
  });

  it("lets a completed setup through", async () => {
    vi.mocked(getOnboardingStatus).mockResolvedValue({ data: { hasApiKey: true, participantCount: 2 }, error: null });

    expect(await onboardingGate({ locals: signedIn, route: "/" })).toBeNull();
    expect(getOnboardingStatus).toHaveBeenCalledWith({ supabase: signedIn.supabase, userId: "user-1" });
  });
});
