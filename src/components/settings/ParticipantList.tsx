import { useState } from "react";
import { Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import type { ApiFailure } from "@/lib/api-client";
import type { AiParticipantDTO } from "@/types";

interface ParticipantListProps {
  participants: AiParticipantDTO[];
  onRemove: (id: string) => Promise<ApiFailure | null>;
}

export function ParticipantList({ participants, onRemove }: ParticipantListProps) {
  const [pendingDelete, setPendingDelete] = useState<AiParticipantDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!pendingDelete) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const failure = await onRemove(pendingDelete.id);
    setDeleting(false);
    if (failure) {
      setDeleteError(failure.message);
      return;
    }
    setPendingDelete(null);
  };

  if (participants.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="participant-list-empty">
        No participants yet.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-md border border-border" data-testid="participant-list">
        {participants.map((participant) => (
          <li key={participant.id} className="flex items-center gap-3 px-3 py-2" data-testid="participant-item">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: participant.color }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{participant.alias}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{participant.model_id}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setDeleteError(null);
                setPendingDelete(participant);
              }}
              aria-label={`Delete participant ${participant.alias}`}
              data-testid="participant-delete"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete participant '${pendingDelete?.alias ?? ""}'?`}
        description="Messages from this participant stay in your conversations as (Deleted Participant)."
        onConfirm={handleConfirm}
        pending={deleting}
        error={deleteError}
      />
    </>
  );
}

export default ParticipantList;
