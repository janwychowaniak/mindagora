import { Fragment, type ReactNode } from "react";

import { useAutoScroll } from "@/components/hooks/useAutoScroll";
import type { PendingReply as PendingReplyState } from "@/components/hooks/useConversation";
import { isSameDay } from "@/lib/format";
import type { ConversationMessageDTO } from "@/types";

import { DateSeparator } from "./DateSeparator";
import { MessageItem } from "./MessageItem";
import { PendingReply } from "./PendingReply";

interface MessageListProps {
  messages: ConversationMessageDTO[];
  pending: PendingReplyState | null;
  emptyState: ReactNode;
}

export function MessageList({ messages, pending, emptyState }: MessageListProps) {
  const containerRef = useAutoScroll<HTMLDivElement>(`${messages.length}:${pending ? "pending" : "idle"}`);

  const isEmpty = messages.length === 0 && !pending;

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto pr-1" data-testid="message-list">
      {isEmpty ? (
        <div className="flex h-full items-center justify-center">{emptyState}</div>
      ) : (
        <div className="space-y-3">
          {messages.map((message, index) => {
            const newDay = index === 0 || !isSameDay(messages[index - 1].created_at, message.created_at);
            return (
              <Fragment key={message.id}>
                {newDay && <DateSeparator iso={message.created_at} />}
                <MessageItem message={message} />
              </Fragment>
            );
          })}
          {pending && <PendingReply participant={pending.participant} />}
        </div>
      )}
    </div>
  );
}

export default MessageList;
