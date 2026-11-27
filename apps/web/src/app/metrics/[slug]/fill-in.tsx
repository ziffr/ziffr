"use client";
// Fill in for someone (GLOSSARY: Filled-in Value, Submitter, Due Date, Away; spec 0046): the button and slide-over where the
// Metric's owner or its Workflow's owner types a value in for a Submitter who has not sent it. It is recorded as the
// Submitter's value and always marked "Entered by you for Sara". The core decides who may and when (mayFillIn) and
// checks again on saving; this only shows the button to people it would let in, and, before the Due Date, disabled with the
// reason. What the core refuses comes back in its own words.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPen } from "lucide-react";
import { fillInForSubmitter } from "@/app/fill-in-actions";
import { AnswerBox, ValueEntry, sendValue, type Answer } from "./value-entry";
import type { FillInOffer } from "@ziffr/core/fill-in-offer";
import type { NumberStyle } from "@ziffr/core/number-style";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const first = (name: string) => name.split(" ")[0];

/** The Fill in for … button with its form; disabled, with the reason beside it, while nobody may be filled in for yet. */
export function FillIn({ offer, metricName, periodLabel, placeholder, numberStyle }: { offer: FillInOffer; metricName: string; periodLabel: string; placeholder: string; numberStyle: NumberStyle }) {
  const [open, setOpen] = useState(false);
  // The page was not redrawn after a try, so that the answer stays to be read: it is when the panel closes.
  const [stale, setStale] = useState(false);
  const router = useRouter();
  const now = offer.people.filter((p) => !p.wait);
  const label = `Fill in for ${now.length === 1 ? first(now[0].name) : offer.people.length === 1 ? first(offer.people[0].name) : "someone"}…`;
  if (!now.length) {
    return (
      <div className="text-xs">
        <Button size="sm" variant="outline" disabled aria-describedby="fill-in-wait"><UserPen aria-hidden /> {label}</Button>
        <p id="fill-in-wait" className="mt-1 text-muted-foreground">{offer.people[0].wait}</p>
      </div>
    );
  }
  return (
    <Sheet open={open} onOpenChange={(next) => { setOpen(next); if (!next && stale) { setStale(false); router.refresh(); } }}>
      <SheetTrigger className={buttonVariants({ size: "sm", variant: "outline" })}><UserPen aria-hidden /> {label}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Fill in {metricName}, {periodLabel}</SheetTitle>
          <SheetDescription>The value is recorded as theirs and always marked as entered by you. They are told, and can replace it with their own until the period is locked.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4"><FillInForm offer={offer} people={now} placeholder={placeholder} numberStyle={numberStyle} onStale={() => setStale(true)} /></div>
      </SheetContent>
    </Sheet>
  );
}

/** Whom, the value, an optional Breakdown and note, and the answer to the last try. */
function FillInForm({ offer, people, placeholder, numberStyle, onStale }: { offer: FillInOffer; people: FillInOffer["people"]; placeholder: string; numberStyle: NumberStyle; onStale: () => void }) {
  const [who, setWho] = useState(people[0].id);
  const [value, setValue] = useState("");
  const [breakdown, setBreakdown] = useState(false);
  const [note, setNote] = useState("");
  const [answer, setAnswer] = useState<Answer>(null);
  const [pending, start] = useTransition();
  const target = people.find((p) => p.id === who) ?? people[0];
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          const r = await sendValue(() => fillInForSubmitter({ metricId: offer.metricId, period: offer.period, for: target.id, value, breakdown: String(data.get("breakdown") ?? ""), ...(note ? { note } : {}) }));
          setAnswer(r);
          if (r?.noteKept) onStale();
          if (r?.ok) { setValue(""); setBreakdown(false); if (!r.noteKept) setNote(""); }
        });
      }}
    >
      <AnswerBox answer={answer} />
      {people.length > 1 ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">For</span>
          <select value={who} onChange={(e) => { setWho(e.target.value); setAnswer(null); }} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm">
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      ) : <p className="text-sm">For <span className="font-medium">{target.name}</span></p>}
      <ValueEntry value={value} setValue={setValue} breakdown={breakdown} setBreakdown={setBreakdown} placeholder={placeholder} numberStyle={numberStyle} note={offer.notes ? { words: note, setWords: setNote } : undefined} />
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Recording…" : `Enter it for ${first(target.name)}`}</Button>
    </form>
  );
}
