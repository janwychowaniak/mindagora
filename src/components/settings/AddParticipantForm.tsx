import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldErrors, type ApiFailure } from "@/lib/api-client";
import { randomHexColor } from "@/lib/color";
import type { CreateAiParticipantCommand } from "@/types";

import { ModelCombobox } from "./ModelCombobox";

// Mirrors the API rule (plan ap5 §4.1): letters, digits, spaces, "-", "_", ".", at least one alphanumeric.
const ALIAS_PATTERN = /^(?=.*[A-Za-z0-9])[A-Za-z0-9 ._-]+$/;
const ALIAS_MAX = 30;

interface AddParticipantFormProps {
  onAdd: (command: CreateAiParticipantCommand) => Promise<ApiFailure | null>;
}

interface FormErrors {
  alias?: string;
  model?: string;
}

export function AddParticipantForm({ onAdd }: AddParticipantFormProps) {
  const [alias, setAlias] = useState("");
  const [modelId, setModelId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    const trimmed = alias.trim();
    if (trimmed.length === 0 || trimmed.length > ALIAS_MAX) {
      next.alias = `Alias must be 1-${ALIAS_MAX} characters`;
    } else if (!ALIAS_PATTERN.test(trimmed)) {
      next.alias = "Use letters, digits, spaces, - _ . with at least one letter or digit";
    }
    if (!modelId) {
      next.model = "Select a model";
    }
    return next;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0 || !modelId) {
      return;
    }

    setSubmitting(true);
    // The colour is generated here and validated by the API as #RRGGBB (PRD §3.4).
    const failure = await onAdd({ alias: alias.trim(), model_id: modelId, color: randomHexColor() });
    setSubmitting(false);

    if (!failure) {
      setAlias("");
      setModelId(null);
      return;
    }

    // 409 and 400 carry per-field maps (alias / model_id); anything else is a general message.
    const perField = fieldErrors(failure);
    if (Object.keys(perField).length > 0) {
      setErrors({ alias: perField.alias, model: perField.model_id });
      return;
    }
    setFormError(failure.message);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="participant-alias">Alias</Label>
          <Input
            id="participant-alias"
            value={alias}
            maxLength={ALIAS_MAX}
            onChange={(event) => setAlias(event.target.value)}
            disabled={submitting}
            aria-invalid={Boolean(errors.alias)}
            aria-describedby={errors.alias ? "participant-alias-error" : "participant-alias-hint"}
            data-testid="participant-alias-input"
          />
          {errors.alias ? (
            <p id="participant-alias-error" role="alert" className="text-sm text-destructive">
              {errors.alias}
            </p>
          ) : (
            <p id="participant-alias-hint" className="text-xs text-muted-foreground">
              Up to {ALIAS_MAX} characters: letters, digits, spaces, - _ .
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="participant-model">Model</Label>
          <ModelCombobox
            id="participant-model"
            value={modelId}
            onChange={setModelId}
            disabled={submitting}
            invalid={Boolean(errors.model)}
            describedBy={errors.model ? "participant-model-error" : undefined}
          />
          {errors.model && (
            <p id="participant-model-error" role="alert" className="text-sm text-destructive">
              {errors.model}
            </p>
          )}
        </div>
      </div>
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={submitting} data-testid="participant-add">
        {submitting ? "Adding…" : "Add participant"}
      </Button>
    </form>
  );
}

export default AddParticipantForm;
