"use client";
// A time shown as "3 minutes ago" in client components. The server renders it a moment before the browser does, so
// the words can differ by then: the browser's are kept without a hydration warning, and the exact time is a tooltip.
import { formatDistanceToNow } from "date-fns";
import { formatDate } from "@ziffr/core/format";

/** "3 minutes ago" for an ISO time, with the date as its tooltip and machine-readable time. */
export function RelativeTime({ at, className }: { at: string; className?: string }) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return (
    <time dateTime={d.toISOString()} title={`${formatDate(d)} ${d.toTimeString().slice(0, 5)}`} className={className} suppressHydrationWarning>
      {formatDistanceToNow(d, { addSuffix: true })}
    </time>
  );
}
