// The field for how a Metric is calculated (spec 0060; GLOSSARY: Calculation Note), the same in the new-Metric forms and
// in Edit details. It posts as `calculation_note`; the core cleans and limits what arrives.
import { CALCULATION_NOTE_HINT, CALCULATION_NOTE_LABEL, CALCULATION_NOTE_MAX } from "@ziffr/core/calculation-note";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** A labelled text area with a line that says what belongs in it. */
export function CalculationNoteField({ id, defaultValue, className, label = CALCULATION_NOTE_LABEL }: { id: string; defaultValue?: string | null; className?: string; /** Where a heading already asks how it is calculated. */ label?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5 block">{label}</Label>
      <Textarea id={id} name="calculation_note" defaultValue={defaultValue ?? ""} maxLength={CALCULATION_NOTE_MAX} rows={3} aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">{CALCULATION_NOTE_HINT}</p>
    </div>
  );
}
