import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { fieldErrors, type ApiFailure } from "@/lib/api-client";

const TITLE_MAX = 100;

interface InlineTitleEditorProps {
  title: string;
  onSave: (title: string) => Promise<ApiFailure | null>;
}

// Click → input; Enter saves, Escape cancels (PRD §3.5). Blur cancels too, so a stray click never saves.
export function InlineTitleEditor({ title, onSave }: InlineTitleEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus follows the user's click into edit mode (programmatic, instead of the autoFocus attribute).
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEditing = () => {
    setDraft(title);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    if (saving) {
      return;
    }
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    const next = draft.trim();
    if (next.length === 0) {
      setError("Title cannot be empty");
      return;
    }
    if (next === title) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const failure = await onSave(next);
    setSaving(false);
    if (failure) {
      setError(fieldErrors(failure).title ?? failure.message);
      return;
    }
    setEditing(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        title="Click to rename"
        className="max-w-full cursor-pointer truncate text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
        data-testid="conversation-title"
      >
        {title}
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        ref={inputRef}
        value={draft}
        maxLength={TITLE_MAX}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={cancel}
        disabled={saving}
        aria-label="Conversation title"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "title-error" : undefined}
        data-testid="title-input"
      />
      {error && (
        <p id="title-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export default InlineTitleEditor;
