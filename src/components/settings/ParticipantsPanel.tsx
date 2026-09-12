import { useEffect } from "react";

import { useParticipants } from "@/components/hooks/useParticipants";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import { AddParticipantForm } from "./AddParticipantForm";
import { ParticipantList } from "./ParticipantList";

const MIN_PARTICIPANTS = 2;

interface ParticipantsPanelProps {
  onCountChange?: (count: number) => void;
}

// List + add form; shared by the settings page and the second onboarding step.
export function ParticipantsPanel({ onCountChange }: ParticipantsPanelProps) {
  const { status, participants, loadError, add, remove } = useParticipants();

  useEffect(() => {
    if (status === "ready") {
      onCountChange?.(participants.length);
    }
  }, [status, participants.length, onCountChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" data-testid="participant-count">
          {status === "ready"
            ? `${participants.length} ${participants.length === 1 ? "participant" : "participants"}`
            : "…"}
        </Badge>
        {status === "ready" && participants.length < MIN_PARTICIPANTS && (
          <p role="status" className="text-sm text-muted-foreground">
            At least {MIN_PARTICIPANTS} participants are needed to start a conversation.
          </p>
        )}
      </div>

      {status === "loading" && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      )}
      {status === "ready" && <ParticipantList participants={participants} onRemove={remove} />}

      <Separator />
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Add participant</h3>
        <AddParticipantForm onAdd={add} />
      </div>
    </div>
  );
}

export default ParticipantsPanel;
