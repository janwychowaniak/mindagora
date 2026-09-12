import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ChatHeaderProps {
  title: string;
}

export function ChatHeader({ title }: ChatHeaderProps) {
  return (
    <div className="flex items-center gap-3 border-b border-border pb-3">
      <Button variant="ghost" size="sm" asChild>
        <a href="/" data-testid="back-to-list">
          <ArrowLeft aria-hidden="true" />
          List
        </a>
      </Button>
      <h1 className="truncate text-lg font-semibold tracking-tight" data-testid="chat-title">
        {title}
      </h1>
    </div>
  );
}

export default ChatHeader;
