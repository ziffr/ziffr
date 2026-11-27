// The pieces every First Steps screen is made of (spec 0067; GLOSSARY: First Steps), from the app's own tokens and
// button.
import { useEffect, useRef } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A screen's question and one line under it. Focus moves here on each step, so a screen reader and a keyboard start at
 * the top of the new screen. */
export function ScreenHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <header className="mb-6">
      <h1 ref={ref} tabIndex={-1} className="text-[length:var(--text-2xl)] leading-tight outline-none">{title}</h1>
      {children && <p className="mt-2 text-sm text-muted-foreground">{children}</p>}
    </header>
  );
}

/** The list of choices of a question; two to a row where there is room, when there are many. */
export function Choices({ columns, children }: { columns?: boolean; children: React.ReactNode }) {
  return <div className={cn("grid gap-2", columns && "sm:grid-cols-2")}>{children}</div>;
}

/** One choice: a whole card to press. `selected` gives a button that holds an answer its state, shown by a tick as well
 * as by its border; a choice that only leads on has none and may name what it does (`action`). `waiting` says that a
 * press does nothing for now; the button keeps the keyboard's place. */
export function Choice({ title, hint, action, selected, waiting, onPick }: { title: string; hint?: React.ReactNode; action?: string; selected?: boolean; waiting?: boolean; onPick: () => void }) {
  return (
    <button
      type="button" aria-pressed={selected} aria-disabled={waiting || undefined} onClick={onPick}
      className="flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-card)] border border-border bg-card px-4 py-3 text-left text-card-foreground shadow-[var(--shadow-card)] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-disabled:opacity-60 aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium break-words">{title}</span>
        {hint && <span className="mt-0.5 block text-sm text-muted-foreground">{hint}</span>}
        {action && <span className="mt-2 block text-sm font-medium underline underline-offset-4">{action}</span>}
      </span>
      {selected ? <Check aria-hidden className="size-5 shrink-0" /> : <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />}
    </button>
  );
}

/** A few short answers side by side, of which one may be chosen; the chosen one is filled and ticked. */
export function Options<T extends string>({ legend, options, labels, value, onPick, className }: { legend: string; options: readonly T[]; labels: Record<T, string>; value: T | null; onPick: (v: T) => void; className?: string }) {
  return (
    <fieldset className="mt-4 min-w-0">
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className={cn("grid gap-2", className)}>
        {options.map((v) => (
          <Button key={v} type="button" variant={value === v ? "default" : "outline"} aria-pressed={value === v} className="h-11 min-w-0 px-2 md:h-9" onClick={() => onPick(v)}>
            {value === v && <Check aria-hidden />}
            {labels[v]}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

/** Goes on without an answer. */
export function Skip({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="mt-4 text-center">
      <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={onSkip}>Skip this question</Button>
    </div>
  );
}

/** Said on the first screen after the Workspace is made, when not every answer was kept. */
export function Unsaved() {
  return <p role="status" className="mb-4 rounded-[var(--radius-input)] border border-border bg-muted p-3 text-sm">Your Workspace is made, but not every answer was saved. Use Start over to save them again.</p>;
}
