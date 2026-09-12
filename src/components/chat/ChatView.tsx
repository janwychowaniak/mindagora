import { useEffect, useState } from "react";

import { useConversation } from "@/components/hooks/useConversation";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorDialog } from "@/components/shared/ErrorDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { ChatHeader } from "./ChatHeader";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";

interface ChatViewProps {
  conversationId: string | null;
}

export function ChatView({ conversationId }: ChatViewProps) {
  const { status, conversation, participants, loadError, pending, reload, send } = useConversation(conversationId);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (conversation) {
      document.title = `${conversation.title} - MindAgora`;
    }
  }, [conversation]);

  const handleSend = async (content: string, participantId: string) => {
    const failure = await send(content, participantId);
    if (failure) {
      setSendError(failure.message);
      return false;
    }
    return true;
  };

  if (status === "not-found") {
    return (
      <Card className="mx-auto max-w-md" data-testid="conversation-not-found">
        <CardHeader>
          <CardTitle>Conversation not found</CardTitle>
          <CardDescription>It may have been deleted, or the link is wrong.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <a href="/">Back to conversations</a>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-96 flex-col gap-3">
      <ChatHeader title={conversation?.title ?? "New conversation"} />

      {status === "loading" && (
        <div className="flex-1 space-y-3" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-2/3" />
        </div>
      )}

      {status === "error" && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {status === "ready" && (
        <>
          <MessageList
            messages={conversation?.messages ?? []}
            pending={pending}
            emptyState={
              <EmptyState
                title="Start the conversation"
                description="Send a message to one of your AI participants. Every participant sees the whole conversation."
              />
            }
          />
          <Composer participants={participants} busy={pending !== null} onSend={handleSend} />
        </>
      )}

      <ErrorDialog
        open={sendError !== null}
        onClose={() => setSendError(null)}
        title="Message not sent"
        message={sendError ?? ""}
      />
    </div>
  );
}

export default ChatView;
