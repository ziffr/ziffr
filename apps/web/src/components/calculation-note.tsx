// How a Metric is calculated (spec 0060; GLOSSARY: Calculation Note, Derived Metric): the formula of a Derived Metric
// and the words beside it, drawn as text only, on the Metric's page and in the Quick look. The caller passes only a
// formula the person may read (formulaInWords: null when it reads a Metric not shared with them).
import { CALCULATION_NOTE_LABEL } from "@ziffr/core/calculation-note";
import { cn } from "@/lib/utils";

/** What stands where a Derived Metric's formula reads a Metric the person may not see. */
const FORMULA_NOT_SHARED = "Its formula reads a Metric that is not shared with you.";

type Shown = { note?: string | null; derived?: boolean; formula?: string | null };

/** A Derived Metric's formula, then the Calculation Note with its line breaks. */
export function CalculationWords({ note, derived, formula }: Shown) {
  return (
    <div className="space-y-2 [overflow-wrap:anywhere]">
      {derived && (
        <p>
          {formula ? <><span className="text-muted-foreground">Formula: </span><code className="rounded bg-muted px-1 py-0.5 text-xs">{formula}</code></> : <span className="text-muted-foreground">{FORMULA_NOT_SHARED}</span>}
        </p>
      )}
      {note && <p className="whitespace-pre-line">{note}</p>}
    </div>
  );
}

/** "How it is calculated", closed until opened; nothing where there is neither a note nor a formula. */
export function CalculationDisclosure({ className, ...shown }: Shown & { className?: string }) {
  if (!shown.note && !shown.derived) return null;
  return (
    <details className={cn("group/calc text-sm", className)}>
      <summary className="w-fit cursor-pointer rounded-sm py-1 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-11 max-sm:content-center">{CALCULATION_NOTE_LABEL}</summary>
      <div className="max-w-[62ch] pb-1 pt-1">
        <CalculationWords {...shown} />
      </div>
    </details>
  );
}
