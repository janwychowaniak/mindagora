import { Loader2 } from "lucide-react";

import type { AiParticipantDTO } from "@/types";

interface PendingReplyProps {
  participant: AiParticipantDTO;
}

// Spinner where the reply will appear (PRD §3.6), named after the participant asked.
export function PendingReply({ participant }: PendingReplyProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-md border-l-4 bg-background px-4 py-3 text-sm text-muted-foreground"
      style={{ borderLeftColor: participant.color }}
      data-testid="pending-reply"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span className="font-semibold" style={{ color: participant.color }}>
        AI - {participant.alias}
      </span>
      <span>is thinking…</span>
    </div>
  );
}

export default PendingReply;
