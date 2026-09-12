import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

import { useApiKey } from "@/components/hooks/useApiKey";
import { ErrorDialog } from "@/components/shared/ErrorDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserSettingsDTO } from "@/types";

interface ApiKeyFormProps {
  // settings: shows and edits the current key; onboarding: first key, nothing to load.
  mode: "settings" | "onboarding";
  onSaved?: (settings: UserSettingsDTO) => void;
}

export function ApiKeyForm({ mode, onSaved }: ApiKeyFormProps) {
  const { status, settings, loadError, saving, save } = useApiKey({ load: mode === "settings" });
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);

  // Prefill with the stored key once it arrives (masked by default, US-008).
  useEffect(() => {
    if (status === "ready" && settings?.openrouter_api_key) {
      setValue(settings.openrouter_api_key);
    }
  }, [status, settings]);

  const canSave = value.trim().length > 0 && !saving && status !== "loading";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) {
      return;
    }

    setSaved(false);
    setInlineError(null);
    const result = await save(value.trim());
    if (result.ok) {
      setSaved(true);
      onSaved?.(result.data);
      return;
    }

    const { failure } = result;
    // Validation by OpenRouter (400 with a message) and its timeout (408) are acknowledged in a dialog
    // (US-004, US-031); a per-field 400 from the schema and anything else stay inline.
    if ((failure.status === 400 && typeof failure.details === "string") || failure.status === 408) {
      setDialogMessage(failure.message);
      return;
    }
    setInlineError(failure.message);
  };

  if (status === "loading") {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-24" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {loadError && (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="api-key">OpenRouter API key</Label>
        <div className="flex gap-2">
          <Input
            id="api-key"
            type={visible ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setSaved(false);
            }}
            disabled={saving}
            aria-describedby="api-key-hint"
            data-testid="api-key-input"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? "Hide API key" : "Show API key"}
            aria-pressed={visible}
            data-testid="api-key-toggle"
          >
            {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
        <p id="api-key-hint" className="text-xs text-muted-foreground">
          The key is checked with OpenRouter before it is saved.
        </p>
      </div>
      {inlineError && (
        <p role="alert" className="text-sm text-destructive">
          {inlineError}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-400" data-testid="api-key-saved">
          API key saved.
        </p>
      )}
      <Button type="submit" disabled={!canSave} data-testid="api-key-save">
        {saving ? "Checking…" : "Save"}
      </Button>
      <ErrorDialog
        open={dialogMessage !== null}
        onClose={() => setDialogMessage(null)}
        title="API key not saved"
        message={dialogMessage ?? ""}
      />
    </form>
  );
}

export default ApiKeyForm;
