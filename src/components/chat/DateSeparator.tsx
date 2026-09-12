import { formatDay } from "@/lib/format";

interface DateSeparatorProps {
  iso: string;
}

// "Dec 15" between days (PRD §3.6).
export function DateSeparator({ iso }: DateSeparatorProps) {
  return (
    <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground" data-testid="date-separator">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <time dateTime={iso}>{formatDay(iso)}</time>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

export default DateSeparator;
