import { getOnboardingStatus, resolveOnboardingStep } from "./services/onboarding.service.ts";

type GateOutcome = { redirect: string } | { response: Response } | null;

// Server-side gate for the pages behind onboarding (/ and /conversations/*, UI plan ap7 §4):
// an incomplete setup goes to /onboarding; a failed status lookup answers 503 (backend outage, not user state).
export const onboardingGate = async ({
  locals,
  route,
}: {
  locals: App.Locals;
  route: string;
}): Promise<GateOutcome> => {
  const user = locals.user;
  if (!user) {
    return { redirect: "/login" };
  }

  const status = await getOnboardingStatus({ supabase: locals.supabase, userId: user.id });
  if (status.error || !status.data) {
    // eslint-disable-next-line no-console
    console.error("Onboarding status lookup failed", {
      route,
      status: 503,
      supabase_error_code: status.error?.code,
    });
    return { response: new Response("Could not load your account state. Please try again later.", { status: 503 }) };
  }

  if (resolveOnboardingStep(status.data) !== "complete") {
    return { redirect: "/onboarding" };
  }

  return null;
};
