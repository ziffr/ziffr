// Demo Mode (GLOSSARY: Demo Mode): a marked panel for buttons that only make sense in the demo, such as playing a
// recipient or running the scheduler by hand, so they never pass for everyday controls.
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/** A dashed, labelled "Demo controls" box around demo-only buttons, with one line on what they pretend. */
export function DemoControls({ hint, children, className }: { hint: string; children?: React.ReactNode; className?: string }) {
  return (
    <section aria-label="Demo controls" className={cn("rounded-[var(--radius-card)] border border-dashed border-[var(--color-accent-2)] p-4", className)}>
      <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[var(--color-accent-2)] uppercase"><FlaskConical aria-hidden className="size-3.5" /> Demo controls</h2>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      {children && <div className="mt-3">{children}</div>}
    </section>
  );
}
