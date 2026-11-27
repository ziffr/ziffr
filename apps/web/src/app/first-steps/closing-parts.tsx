// The pieces First Steps' last three screens share (spec 0067; GLOSSARY: First Steps), from the app's own tokens: a
// panel, a list of what is known, a way on that is not a choice, and reading what a screen shows.
import { useCallback, useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { isActionError, UNEXPECTED, type ActionError } from "@/lib/action-error";
import { cn } from "@/lib/utils";

/** The main button of a screen: full width, 44 px tall on a phone. */
export const MAIN_BUTTON = "h-11 w-full md:h-10";

/** Words set apart in a card of the app's own. */
export function Panel({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("space-y-2 rounded-[var(--radius-card)] border border-border bg-card p-4 text-sm break-words text-card-foreground", className)} {...props} />;
}

/** What is known, a term and its words per row. */
export function Facts({ label, rows }: { label: string; rows: [string, string][] }) {
  return (
    <dl aria-label={label} className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-card text-sm text-card-foreground">
      {rows.map(([term, words]) => (
        <div key={term} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="min-w-0 break-words">{words}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A quieter way on, under the main one. */
export function Quiet({ className, ...props }: React.ComponentProps<typeof Button>) {
  return <Button type="button" variant="ghost" className={cn("h-11 md:h-9", className)} {...props} />;
}

/** An action's answer, or its refusal's words handed to `refused`. A redirect passes through as Next.js needs. */
export async function answered<T>(work: () => Promise<T | ActionError>, refused: (words: string) => void): Promise<T | undefined> {
  try {
    const r = await work();
    if (!isActionError(r)) return r;
    refused(r.error);
  } catch (e) {
    unstable_rethrow(e);
    refused(UNEXPECTED);
  }
  return undefined;
}

/** What a screen shows, read when it opens and again on `reload`. */
export function useShown<T>(read: () => Promise<T | ActionError>) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // The newest read function, so a screen may pass a new one on every draw without reading again.
  const latest = useRef(read);
  useEffect(() => { latest.current = read; });
  const reload = useCallback(async () => {
    setFailed(null);
    const r = await answered(() => latest.current(), setFailed);
    if (r !== undefined) setData(r);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { data, failed, reload };
}

/** While a screen reads, and the words and a way to try again when it could not. */
export function Reading({ failed, onRetry }: { failed: string | null; onRetry: () => void }) {
  if (!failed) return <p role="status" className="text-sm text-muted-foreground">One moment…</p>;
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-destructive">{failed}</p>
      <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onRetry}>Try again</Button>
    </div>
  );
}
