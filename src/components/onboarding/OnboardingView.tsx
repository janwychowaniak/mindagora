import { useState } from "react";

import { ApiKeyForm } from "@/components/settings/ApiKeyForm";
import { ParticipantsPanel } from "@/components/settings/ParticipantsPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { OnboardingStep } from "@/lib/services/onboarding.service";

const MIN_PARTICIPANTS = 2;

interface OnboardingViewProps {
  step: Exclude<OnboardingStep, "complete">;
}

const STEPS: { key: OnboardingViewProps["step"]; label: string }[] = [
  { key: "api-key", label: "API key" },
  { key: "participants", label: "Participants" },
];

// Guided setup (PRD §3.2). The server picks the step from the account state, so finishing a step is a full
// navigation: the next page load lands on whatever is still missing (US-006).
export function OnboardingView({ step }: OnboardingViewProps) {
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const canContinue = participantCount !== null && participantCount >= MIN_PARTICIPANTS;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to MindAgora</h1>
        <ol className="flex items-center gap-3 text-sm text-muted-foreground" aria-label="Setup steps">
          {STEPS.map((item, index) => (
            <li
              key={item.key}
              aria-current={item.key === step ? "step" : undefined}
              className={item.key === step ? "font-medium text-foreground" : undefined}
            >
              Step {index + 1} of {STEPS.length} · {item.label}
              {index < STEPS.length - 1 && <span aria-hidden="true"> →</span>}
            </li>
          ))}
        </ol>
      </div>

      {step === "api-key" && (
        <Card>
          <CardHeader>
            <CardTitle>Add your OpenRouter API key</CardTitle>
            <CardDescription>
              MindAgora talks to the models through your own OpenRouter account. The key is checked with OpenRouter and
              stored in your settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApiKeyForm mode="onboarding" onSaved={() => window.location.assign("/onboarding")} />
          </CardContent>
        </Card>
      )}

      {step === "participants" && (
        <Card>
          <CardHeader>
            <CardTitle>Add at least two AI participants</CardTitle>
            <CardDescription>
              Each participant is a model with an alias of your choice. You can add more or remove them later in
              Settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ParticipantsPanel onCountChange={setParticipantCount} />
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            {!canContinue && (
              <p role="status" className="text-sm text-muted-foreground">
                Add at least {MIN_PARTICIPANTS} participants to continue.
              </p>
            )}
            <Button
              type="button"
              className="sm:ml-auto"
              disabled={!canContinue}
              onClick={() => window.location.assign("/")}
              data-testid="onboarding-continue"
            >
              Continue
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

export default OnboardingView;
