// The first steps in a new Workspace (GLOSSARY: Workspace, Metric, Dashboard): a short checklist on the empty
// Dashboards page, ticked off from what the workspace already has, so a new owner knows where to start.
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

/** One step of the checklist; `href` opens where it is done, `action` is a button instead (such as creating a dashboard). */
export type FirstRunStep = { title: string; body: string; done: boolean; href?: string; action?: React.ReactNode };

/** The checklist itself. Steps that are done stay listed, crossed out, so progress shows. */
export function FirstRun({ steps }: { steps: FirstRunStep[] }) {
  const left = steps.filter((s) => !s.done).length;
  return (
    <section aria-labelledby="first-run-h" className="desk rounded-[var(--radius-card)] p-6 sm:p-8">
      <h2 id="first-run-h" className="text-[length:var(--text-xl)]">Get your workspace ready</h2>
      <p className="mt-1 text-sm text-muted-foreground">{left === 0 ? "All done. Build your first dashboard whenever you are ready." : `${left} of ${steps.length} steps left. Each takes a minute or two.`}</p>
      <ol className="mt-5 space-y-2">
        {steps.map((s, i) => (
          <li key={s.title} className="stock flex items-start gap-3 rounded-[var(--radius-card)] p-3 text-sm">
            {s.done ? <CheckCircle2 aria-label="Done" className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]" /> : <Circle aria-label="Not done yet" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1">
              <span className={cn("font-medium", s.done && "text-muted-foreground line-through")}>{i + 1}. {s.title}</span>
              <span className="block text-xs text-muted-foreground">{s.body}</span>
            </span>
            {!s.done && (s.action ?? (s.href && <Link href={s.href} className="shrink-0 text-sm font-medium underline">Start</Link>))}
          </li>
        ))}
      </ol>
    </section>
  );
}
