// A Metric's Tags as small chips (GLOSSARY: Tag; spec 0038): each leads to the Metrics list filtered by it. The words are
// Workspace text and are shown as text, never as markup. Callers pass only Tags the viewer may see.
import Link from "next/link";
import { tagFilterHref } from "@/lib/tag-filter";

/** The chips of `names`, at most `max` of them and "+2" for the rest (the rest are all on the Metric's page). */
export function TagChips({ names, max = 3, className }: { names: readonly string[]; max?: number; className?: string }) {
  if (!names.length) return null;
  const shown = names.slice(0, max);
  return (
    <ul aria-label="Tags" className={`relative z-10 flex flex-wrap items-center gap-1 ${className ?? ""}`}>
      {shown.map((n) => (
        <li key={n}>
          <Link href={tagFilterHref([n])} className="inline-block max-w-[12rem] truncate rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-[var(--color-ink-2)] no-underline hover:bg-[var(--color-paper-2)]">{n}</Link>
        </li>
      ))}
      {names.length > max && <li className="text-xs text-muted-foreground">+{names.length - max}</li>}
    </ul>
  );
}
