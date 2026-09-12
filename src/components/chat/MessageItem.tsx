import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import type { ConversationMessageDTO } from "@/types";

// Colour for messages whose participant was deleted (PRD §3.4): the message stays, the author greys out.
const DELETED_PARTICIPANT_COLOR = "#808080";

interface MessageItemProps {
  message: ConversationMessageDTO;
}

// Stack layout, everything left-aligned (PRD §3.6). User: lighter background and a "User" prefix. AI: base
// background, left border and prefix in the participant's colour; the prefix text carries the identity, so colour
// is never the only cue.
export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === "user";
  const participant = message.ai_participant;
  const color = isUser ? undefined : (participant?.color ?? DELETED_PARTICIPANT_COLOR);
  const label = isUser ? "User" : participant ? `AI - ${participant.alias}` : "(Deleted Participant)";

  return (
    <article
      className={cn("rounded-md px-4 py-3", isUser ? "bg-muted/40" : "border-l-4 bg-background")}
      style={isUser ? undefined : { borderLeftColor: color }}
      data-testid="message-item"
      data-role={message.role}
    >
      <header className="mb-1 flex items-baseline gap-2 text-xs">
        <span className="font-semibold" style={isUser ? undefined : { color }}>
          {label}
        </span>
        <time dateTime={message.created_at} className="text-muted-foreground">
          {formatTime(message.created_at)}
        </time>
      </header>
      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{message.content}</p>
    </article>
  );
}

export default MessageItem;
