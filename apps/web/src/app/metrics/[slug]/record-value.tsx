"use client";
// Record a value from the Metric's page (GLOSSARY: Submitter, Submission Rule, Lock, Approval, Breakdown; ticket #521):
// the page's one main action for someone who submits the Metric. The form goes through the same intake as their form
// link, so the Metric's rule, Locks, Workflow and Retention apply, and what comes back is the intake's own words. The
// core checks again who may record; this only asks for the number. A slide-over (docs/specs/0036-app-layout.md).
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { recordValue } from "@/app/series-actions";
import { AnswerBox, ValueEntry, sendValue, type Answer } from "./value-entry";
import type { RecordingOffer } from "@ziffr/core/record-own-value";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** The Record a value button with its form. */
export function RecordValue({ offer, wide }: { offer: RecordingOffer; /** Fills its row, as in the list's slide-over. */ wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = <><Plus aria-hidden /> Record a value</>;
  const intro = `Goes the way a value sent by your form link does: ${offer.rule.toLowerCase()}, and the Metric's checks and approvals apply.`;
  const body = <RecordForm offer={offer} />;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={buttonVariants({ className: wide ? "w-full" : undefined })}>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader><SheetTitle>Record a value for {offer.name}</SheetTitle><SheetDescription>{intro}</SheetDescription></SheetHeader>
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">{body}</div>
      </SheetContent>
    </Sheet>
  );
}

/** The period, the value and an optional Breakdown, and the answer to the last try. */
function RecordForm({ offer }: { offer: RecordingOffer }) {
  const [period, setPeriod] = useState(offer.periods[0].start);
  const [value, setValue] = useState("");
  const [breakdown, setBreakdown] = useState(false);
  const [answer, setAnswer] = useState<Answer>(null);
  const [pending, start] = useTransition();
  const chosen = offer.periods.find((p) => p.start === period)!;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          const r = await sendValue(() => recordValue(offer.metricId, { value, breakdown: String(data.get("breakdown") ?? ""), period }));
          setAnswer(r);
          if (r?.ok) { setValue(""); setBreakdown(false); }
        });
      }}
    >
      <AnswerBox answer={answer} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Period</span>
        <select value={period} onChange={(e) => { setPeriod(e.target.value); setAnswer(null); }} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm">
          {offer.periods.map((p, i) => <option key={p.start} value={p.start}>{p.label}{i === 0 ? ", now" : ""}</option>)}
        </select>
        {chosen.has !== null && <span className="mt-1 block text-xs text-muted-foreground">Already has <span className="fig">{chosen.has}</span>.</span>}
      </label>
      <ValueEntry value={value} setValue={setValue} breakdown={breakdown} setBreakdown={setBreakdown} placeholder={offer.placeholder} numberStyle={offer.numberStyle} />
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Recording…" : "Record the value"}</Button>
    </form>
  );
}
