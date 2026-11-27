"use client";
// The personal form link's form (GLOSSARY: Token, Submission Rule, Prompt): the period, the value or a Breakdown, and
// once something was recorded the thank-you screen with the result in the form's place. The result is what the server action returned, Ziffr's own words; nothing from the page's URL is
// ever shown (ticket 183), so a link cannot make Ziffr's frame say what its sender wants. The Breakdown is behind a button;
// on a phone (spec 0055) the thank-you screen also offers the next value that is due.
import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { flushSync } from "react-dom";
import { submitWebForm, type WebFormResult } from "@/app/actions";
import { recordValue } from "@/app/series-actions";
import type { NumberStyle } from "@ziffr/core/number-style";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AskedNote } from "@/components/asked-note";
import { TuckedNote } from "@/components/value-note-tuck";
import { cn } from "@/lib/utils";
import { NoteSaid, savedNote, ThankYou } from "@/app/submit/thank-you";
import { BreakdownField } from "./breakdown-field";
import type { PeriodOffer } from "./period-choices";
import { RecordPeriod } from "./record-period";

type Props = {
  code: string;
  label: string;
  placeholder: string;
  numberStyle: NumberStyle;
  /** An earlier period the signed-in person's address names; the core checks it again. */
  named?: { metricId: number; period: string } | null;
  /** The periods the form may be set to, and which one it starts with. */
  offer: PeriodOffer;
  /** The Metric's Submission Rule in words, said beside a value the period already holds. */
  rule: string;
  /** What stands above the form and gives way with it: who is asked for what. */
  intro?: React.ReactNode;
  /** The note that the request for the running period was answered on another way, shown while that period is picked. */
  answered?: React.ReactNode;
  /** Notes shown between the period and the form. */
  children?: React.ReactNode;
  /** The next value of the signed-in person's own that is due. */
  next?: { href: string; name: string; periodLabel: string } | null;
  /** True when the person is known and nothing else of theirs is due. */
  nothingDue?: boolean;
  /** Whether the form offers a note on the value (GLOSSARY: Value Note). */
  notes?: boolean;
};

/** Sends the form through the operation that fits: the form link's own, or, for a named earlier period, the signed-in
 * person's Record a value. Both end in the same intake with the same rules. */
export function sendForm(code: string, named: Props["named"]) {
  if (!named) return submitWebForm.bind(null, code);
  return async (previous: WebFormResult, form: FormData): Promise<WebFormResult> => {
    // Another period picked from the list is the form link's to record: it takes the running one and those asked for.
    const picked = form.get("period");
    if (picked !== null && picked !== named.period) return submitWebForm(code, previous, form);
    const note = form.get("note");
    const r = await recordValue(named.metricId, { value: String(form.get("value") ?? ""), breakdown: String(form.get("breakdown") ?? ""), period: named.period, ...(note ? { note: String(note) } : {}) });
    return "error" in r ? { ok: false, detail: r.error } : r;
  };
}

/** The period and the form, posting to the server action; unless the address names an earlier period it works without
 * JavaScript too. */
export function SubmitForm({ code, label, placeholder, numberStyle, named = null, offer, rule, intro, answered, children, next = null, nothingDue = false, notes = false }: Props) {
  const [result, action, pending] = useActionState<WebFormResult, FormData>(sendForm(code, named), null);
  // Controlled, so a refusal does not empty the field (React resets uncontrolled fields after an action); the
  // value is cleared only when it was recorded.
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  // Once opened the Breakdown stays open, so nothing typed in it is ever out of sight.
  const [breakdown, setBreakdown] = useState(false);
  const [again, setAgain] = useState(false);
  // What the person picked holds while the form offers it; a period that stopped waiting gives way to the one to start with.
  const [picked, setPicked] = useState<string | null>(null);
  const choice = offer.choices.find((c) => c.start === picked) ?? offer.choices.find((c) => c.start === offer.preselected) ?? offer.choices[0];
  const id = useId();
  // What the last try was sent with: the period it was for and the note's words.
  const [sent, setSent] = useState<{ period: string; note: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const part = useRef<HTMLDivElement>(null);
  const refused = result && !result.ok ? result.detail : null;
  // A recorded value ends the flow: the form gives way to the thank-you screen.
  const done = Boolean(result?.ok) && !again;
  // An earlier period that was answered may no longer be offered: then nothing here can change it.
  const changeable = sent === null || offer.choices.some((c) => c.start === sent.period);
  useEffect(() => {
    setAgain(false);
    if (result?.ok) {
      setValue("");
      // A note that was not saved stays in its field.
      if (!result.noteKept) setNote("");
    }
    // Focus goes back to the wrong field after a refusal; the value field is the first and the only required one.
    else if (result) input.current?.focus();
  }, [result]);
  useEffect(() => { if (again) input.current?.focus(); }, [again]);
  // The button goes away once pressed, so focus moves to the field it opened.
  const openBreakdown = () => { flushSync(() => setBreakdown(true)); part.current?.querySelector("textarea")?.focus(); };
  if (result && done) {
    const words = savedNote(result.detail, sent?.note);
    return (
      <div className="mt-1">
        <ThankYou
          changeLabel={changeable ? "Change it" : "Send another value"}
          onChange={() => { if (changeable && sent) setPicked(sent.period); setAgain(true); }}
          next={next ? (
            <Link href={next.href} prefetch={false} className={cn(buttonVariants({ size: "lg" }), "mt-4 h-auto min-h-12 w-full flex-col gap-0 py-2 text-center whitespace-normal sm:hidden")}>
              <span className="text-base">Next: {next.name}</span>
              <span className="text-xs font-normal">Due for {next.periodLabel}</span>
            </Link>
          ) : nothingDue && <p className="mt-4 text-sm text-muted-foreground sm:hidden">No other value of yours is due now.</p>}
        >
          <div role="status" className="rounded-lg border border-[var(--color-rule-2)] bg-[var(--color-paper-2)] px-3 py-2">
            <p>{result.detail}</p>
            {words && <NoteSaid words={words} />}
          </div>
          {/* Also after a value proposed for a locked period, which the form counts as taken. */}
          {result.ask && <AskedNote key={result.ask} code={result.ask} />}
        </ThankYou>
      </div>
    );
  }
  return (
    <>
      {intro}
      <RecordPeriod choice={choice} choices={offer.choices} selectable={offer.selectable} rule={rule} form={id} onPick={setPicked} />
      {children}
      {choice.running && answered}
      <form id={id} action={action} onSubmit={() => setSent({ period: choice.start, note })} className="mt-4">
        {/* The heading above names the Metric already: on a phone the field comes straight after the period. */}
        <label htmlFor="value" className="text-sm font-medium max-sm:sr-only">{label}</label>
        <Input
          ref={input}
          id="value"
          name="value"
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={refused ? true : undefined}
          aria-describedby={refused ? "value-error" : undefined}
          // Important: on a touch screen every field is otherwise set to 16px (globals.css).
          className="mt-1.5 h-10 text-base max-sm:mt-0 max-sm:h-14 max-sm:text-2xl! max-sm:dark:bg-card"
          autoFocus
        />
        {refused && <p id="value-error" role="alert" className="mt-1.5 text-sm text-destructive">{refused}</p>}
        {!breakdown && (
          <Button type="button" variant="ghost" className="mt-1 -ml-2 px-2 underline underline-offset-4 max-sm:min-h-11" aria-expanded={false} aria-controls="breakdown-part" onClick={openBreakdown}>
            Add a breakdown (optional)
          </Button>
        )}
        {/* Hidden, not removed: the field is part of the form whether it was opened or not. */}
        <div ref={part} id="breakdown-part" className={breakdown ? undefined : "hidden"}>
          <BreakdownField numberStyle={numberStyle} />
        </div>
        {notes && <div className="mt-1 sm:mt-4"><TuckedNote value={note} onChange={setNote} /></div>}
        <Button type="submit" size="lg" className="mt-4 w-full max-sm:h-12 max-sm:text-base" disabled={pending}>Submit</Button>
      </form>
    </>
  );
}
