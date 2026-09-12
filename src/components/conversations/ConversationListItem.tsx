import { useState } from "react";
import { Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApiFailure } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import type { ConversationListItemDTO } from "@/types";

import { InlineTitleEditor } from "./InlineTitleEditor";

interface ConversationListItemProps {
  conversation: ConversationListItemDTO;
  onRename: (id: string, title: string) => Promise<ApiFailure | null>;
  onDelete: (id: string) => Promise<ApiFailure | null>;
}

export function ConversationListItem({ conversation, onRename, onDelete }: ConversationListItemProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const failure = await onDelete(conversation.id);
    setDeleting(false);
    if (failure) {
      setDeleteError(failure.message);
      return;
    }
    setConfirmOpen(false);
  };

  const count = conversation.message_count;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="conversation-item">
      <div className="min-w-0 flex-1 basis-48">
        <InlineTitleEditor title={conversation.title} onSave={(title) => onRename(conversation.id, title)} />
        <p className="text-xs text-muted-foreground">
          <time dateTime={conversation.updated_at}>{formatRelative(conversation.updated_at)}</time>
        </p>
      </div>
      <Badge variant="secondary" aria-label={`${count} ${count === 1 ? "message" : "messages"}`}>
        {count}
      </Badge>
      <Button variant="outline" size="sm" asChild>
        <a href={`/conversations/${conversation.id}`} data-testid="open-conversation">
          Open
        </a>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => {
          setDeleteError(null);
          setConfirmOpen(true);
        }}
        aria-label={`Delete conversation ${conversation.title}`}
        data-testid="delete-conversation"
      >
        <Trash2 aria-hidden="true" />
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete conversation '${conversation.title}'?`}
        description="All messages in this conversation will be deleted. This cannot be undone."
        onConfirm={handleDelete}
        pending={deleting}
        error={deleteError}
      />
    </li>
  );
}

export default ConversationListItem;
