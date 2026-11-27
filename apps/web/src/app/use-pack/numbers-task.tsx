"use client";
// "Set quotas for a new quarter", after a Pack's set-up (spec 0068; GLOSSARY: Pack, Target Series, Total): the
// set-up's numbers asked again, for the running period or the next one. What is left empty stays as it is. It draws
// what the core answered to this Owner or Admin; the server checks every number again.
import { useState } from "react";
import { answered } from "@/app/first-steps/closing-parts";
import { Choice, Choices, ScreenHeading } from "@/app/first-steps/parts";
import { PHONE_BUTTON } from "@/app/setup/phone";
import { buttonVariants } from "@/components/ui/button";
import type { ActionError } from "@/lib/action-error";
import type { NumberStyle } from "@ziffr/core/number-style";
import { readNumber } from "@ziffr/core/numbers";
import type { PackNumbers, PackSpan } from "@ziffr/core/pack-after-numbers";
import { cn } from "@/lib/utils";
import { numberKey, startAnswers, type Answers } from "./answers";
import { Ask } from "./numbers";
import { StepForm } from "./parts";

type Props = { view: PackNumbers; style: NumberStyle; save: (input: { span: PackSpan; numbers: { id: number; value: number }[] }) => Promise<{ set: number } | ActionError>; done: string };

/** The fields for each number, and which period they are for. */
export function NumbersTask({ view, style, save, done }: Props) {
  const [answers, setAnswers] = useState<Answers>(() => startAnswers([], { metrics: null, trial: null, practice: false }));
  const [span, setSpan] = useState<PackSpan>(view.preselected);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const back = <a href={done} className={cn(buttonVariants({ variant: "outline" }), PHONE_BUTTON)}>Back to Packs</a>;
  const label = view.spans.find((s) => s.span === span)?.label ?? "";

  if (saved) {
    return (
      <>
        <ScreenHeading key="saved" title="Saved">{saved}</ScreenHeading>
        {back}
      </>
    );
  }
  if (!view.asks.length) {
    return (
      <>
        <ScreenHeading title="Nothing to set">This Pack asks no number you may change here.</ScreenHeading>
        {back}
      </>
    );
  }
  const typed = view.asks.flatMap((a) => a.rows.map((r) => ({ id: r.id, name: r.label, text: (answers.numbers[numberKey(a.metric, r.id)] ?? "").trim() }))).filter((r) => r.text);
  const bad = typed.find((r) => readNumber(r.text, style) === null);
  const problem = bad ? `“${bad.text.slice(0, 30)}” is not a number. Correct it, or clear the field.` : typed.length ? null : "Enter at least one number.";
  async function press() {
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    const r = await answered(() => save({ span, numbers: typed.map((t) => ({ id: t.id, value: readNumber(t.text, style)! })) }), setRefusal);
    setBusy(false);
    if (r) { setSaved(`${r.set} ${r.set === 1 ? "target" : "targets"} set. ${label}.`); window.scrollTo(0, 0); }
  }
  return (
    <>
      <ScreenHeading title={view.label ?? "Set targets"}>Empty fields stay as they are.</ScreenHeading>
      <StepForm problem={busy ? "Saving…" : problem} onContinue={() => void press()} label="Set them">
        <Choices>
          {view.spans.map((s) => <Choice key={s.span} title={s.label} selected={span === s.span} onPick={() => setSpan(s.span)} />)}
        </Choices>
        {view.asks.map((a) => (
          <section key={a.metric} className="space-y-1.5">
            <h2 className="text-sm font-medium">{a.question}</h2>
            <Ask
              ask={{ metric: a.metric, name: a.field, question: a.question, field: a.field, every: "quarter", repeat: "row", total: a.total }}
              answers={answers} onChange={setAnswers} rows={a.rows.map((r) => r.id)} style={style} unit={a.rows[0].unit}
              rowName={(_, id) => a.rows.find((r) => r.id === id)?.label ?? ""}
            />
          </section>
        ))}
        <p role="alert" className="text-sm text-destructive empty:hidden">{refusal}</p>
      </StepForm>
    </>
  );
}
