// Date and time presentation for the UI (PRD §3.5, §3.6): absolute message times, day separators and a static
// relative time on the conversation list. Formatting relies on Intl; no date library.

const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dayFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const dayWithYearFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "10:45 AM"
export const formatTime = (iso: string): string => timeFormatter.format(new Date(iso));

// "Dec 15", with the year appended when it differs from the current one.
export const formatDay = (iso: string, now: Date = new Date()): string => {
  const date = new Date(iso);
  return date.getFullYear() === now.getFullYear() ? dayFormatter.format(date) : dayWithYearFormatter.format(date);
};

export const isSameDay = (a: string, b: string): boolean => {
  const first = new Date(a);
  const second = new Date(b);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
};

// "just now" / "5m ago" / "2h ago" / "3d ago", then the day. Computed once at render (static, PRD §3.5).
export const formatRelative = (iso: string, now: Date = new Date()): string => {
  const elapsed = now.getTime() - new Date(iso).getTime();

  if (elapsed < MINUTE) {
    return "just now";
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m ago`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)}h ago`;
  }
  if (elapsed < 7 * DAY) {
    return `${Math.floor(elapsed / DAY)}d ago`;
  }

  return formatDay(iso, now);
};
