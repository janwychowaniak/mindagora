import { Plus } from "lucide-react";

import { useConversations } from "@/components/hooks/useConversations";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { ConversationListItem } from "./ConversationListItem";

function NewConversationButton() {
  return (
    <Button asChild>
      <a href="/conversations/new" data-testid="new-conversation-button">
        <Plus aria-hidden="true" />
        New conversation
      </a>
    </Button>
  );
}

export function ConversationListView() {
  const { status, conversations, loadError, reload, rename, remove } = useConversations();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Conversations</h1>
        <NewConversationButton />
      </div>

      {status === "loading" && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {status === "error" && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      )}

      {status === "ready" && conversations.length === 0 && (
        <EmptyState
          title="No conversations yet"
          description="Start one by sending a message to your AI participants. Every participant sees the whole conversation."
          action={<NewConversationButton />}
        />
      )}

      {status === "ready" && conversations.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border" data-testid="conversation-list">
          {conversations.map((conversation) => (
            <ConversationListItem
              key={conversation.id}
              conversation={conversation}
              onRename={rename}
              onDelete={remove}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default ConversationListView;
