import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { ApiKeyForm } from "./ApiKeyForm";
import { ParticipantsPanel } from "./ParticipantsPanel";

interface SettingsViewProps {
  email: string;
  notice: "api-key" | null;
}

export function SettingsView({ email, notice }: SettingsViewProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      {notice === "api-key" && (
        <div
          role="status"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
          data-testid="settings-notice"
        >
          Add your OpenRouter API key to continue.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>OpenRouter API key</CardTitle>
          <CardDescription>
            Used to talk to the models you add below. Checked with OpenRouter before it is saved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeyForm mode="settings" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI participants</CardTitle>
          <CardDescription>
            Each participant is a model with an alias of your choice. You need at least two to start a conversation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ParticipantsPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium" data-testid="account-email">
              {email}
            </dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

export default SettingsView;
