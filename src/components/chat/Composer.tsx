import { useState, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AiParticipantDTO } from "@/types";

import { ParticipantPicker } from "./ParticipantPicker";

const MAX_LENGTH = 10_000;
const COUNTER_FROM = 9_000;
const MIN_PARTICIPANTS = 2;

interface ComposerProps {
  participants: AiParticipantDTO[];
  busy: boolean;
  // Resolves to true when the message went through; the composer then clears itself.
  onSend: (content: string, participantId: string) => Promise<boolean>;
}

export function Composer({ participants, busy, onSend }: ComposerProps) {
  const [text, setText] = useState("");
  const [participantId, setParticipantId] = useState<string | null>(null);

  // One predicate for the button and the Enter key (PRD §3.6).
  const canSend = text.trim().length > 0 && participantId !== null && !busy && participants.length >= MIN_PARTICIPANTS;

  const submit = async () => {
    if (!canSend || !participantId) {
      return;
    }
    const sent = await onSend(text, participantId);
    if (sent) {
      setText("");
      setParticipantId(null);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };

  // Enter sends, Shift+Enter inserts a new line; a composing IME never sends (decision 2026-09-12).
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-t border-border pt-3" data-testid="composer">
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MAX_LENGTH}
        rows={3}
        disabled={busy}
        placeholder="Write a message…"
        aria-label="Message"
        aria-describedby="composer-hint"
        className="max-h-48 min-h-20 resize-y"
        data-testid="message-input"
      />
      <div className="flex flex-wrap items-center gap-2">
        <ParticipantPicker
          participants={participants}
          value={participantId}
          onChange={setParticipantId}
          disabled={busy}
        />
        <Button type="submit" disabled={!canSend} data-testid="send-button">
          {busy ? "Sending…" : "Send"}
        </Button>
        {text.length >= COUNTER_FROM && (
          <span className="text-xs text-muted-foreground" aria-live="polite" data-testid="char-counter">
            {text.length}/{MAX_LENGTH}
          </span>
        )}
        <span id="composer-hint" className="ml-auto text-xs text-muted-foreground">
          Enter to send, Shift+Enter for a new line
        </span>
      </div>
    </form>
  );
}

export default Composer;
