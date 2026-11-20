// The note on an Archived Metric's page (GLOSSARY: Archived Metric): since when, and what archiving means.
import { Archive } from "lucide-react";
import { format, parseISO } from "date-fns";

/** "Archived on 19 November 2026", with what that means; nothing for a Metric in use. */
export function ArchivedNote({ archivedAt }: { archivedAt: string | null }) {
  if (!archivedAt) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-[var(--radius-card)] border border-[var(--color-rule-2)] bg-[var(--color-paper-2)] p-4 text-sm">
      <Archive aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p><span className="font-medium">Archived on {format(parseISO(archivedAt), "d MMMM yyyy")}.</span> Its values and history stay. Nobody is asked for it, and it takes no values until it is brought back.</p>
    </div>
  );
}
