"use client";
// "See an example" under a question that does not fit yet (GLOSSARY: Sample Data, Method, Takeaway): the question answered on Sample Data,
// kept inside its row and labelled as made up. It is never added to the results under the canvas, and there is nothing to save.
import { useId, useState, useTransition } from "react";
import { Eye } from "lucide-react";
import type { PickerExample } from "@ziffr/core/analysis-picker";
import type { EntryId } from "@ziffr/core/method-picker";
import type { Span } from "@ziffr/core/periods";
import { TakeawayView } from "@/components/takeaway-view";
import { ResultCharts } from "@/views/result";
import { pickerExample } from "@/app/picker-actions";

type Shown = Extract<PickerExample, { ok: true }>;

/** The button and, once asked for, the example of one question, counted at `span`. */
export function ShortExample({ entry, span }: { entry: EntryId; span: Span }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const body = useId();
  const toggle = () => {
    if (shown) { setShown(null); return; }
    setFailed(null);
    start(async () => {
      try {
        const got = await pickerExample(entry, span);
        if (got.ok) setShown(got);
        else setFailed(got.message);
      } catch {
        setFailed("The example could not be shown. Try again in a moment.");
      }
    });
  };
  return (
    <>
      <button type="button" onClick={toggle} disabled={pending} aria-expanded={shown !== null} aria-controls={shown ? body : undefined} className="stock flex min-h-11 items-center gap-1.5 rounded-[var(--radius-stock)] px-3 text-sm text-foreground">
        <Eye aria-hidden className="size-3.5" /> {shown ? "Hide the example" : pending ? "Working it out…" : "See an example"}
      </button>
      {failed && <p role="alert" className="basis-full text-xs text-foreground">{failed}</p>}
      {shown && (
        <section id={body} aria-label="Example on Sample Data" className="min-w-0 basis-full space-y-2 rounded-[var(--radius-input)] border border-dashed p-2.5">
          <p className="text-xs text-foreground"><span className="font-medium">Example on Sample Data.</span> Made-up numbers of {shown.about.join(", ")}, not yours. Nothing is saved.</p>
          <ResultCharts chart={shown.takeaway.chart} describedBy={`${body}-words`} style={shown.style} yearStart={shown.yearStart} />
          <TakeawayView id={`${body}-words`} takeaway={shown.takeaway} />
        </section>
      )}
    </>
  );
}
