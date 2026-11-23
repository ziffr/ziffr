"use client";
// The parts the forms that type a value in share (GLOSSARY: Submitter, Breakdown, Filled-in Value): the answer to the last
// try, the value with its optional Breakdown, and sending with the refusal and the unexpected error turned into words.
import { UNEXPECTED, isActionError } from "@/lib/action-error";
import { BreakdownField } from "@/app/submit/[code]/breakdown-field";
import type { NumberStyle } from "@ziffr/core/number-style";
import { Input } from "@/components/ui/input";

export type Answer = { ok: boolean; detail: string } | null;

/** What the last try said, in the intake's own words. */
export function AnswerBox({ answer }: { answer: Answer }) {
  if (!answer) return null;
  return <div role="status" className={`rounded-lg border px-3 py-2 text-sm ${answer.ok ? "border-[var(--color-rule-2)] bg-[var(--color-paper-2)]" : "border-destructive/30 bg-destructive/5"}`}>{answer.detail}</div>;
}

/** The value (or the total), and a way to add a Breakdown. */
export function ValueEntry({ value, setValue, breakdown, setBreakdown, placeholder, numberStyle }: { value: string; setValue: (v: string) => void; breakdown: boolean; setBreakdown: (b: boolean) => void; placeholder: string; numberStyle: NumberStyle }) {
  return (
    <>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{breakdown ? "Total" : "Value"}</span>
        <Input name="value" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder={placeholder} className="h-10 text-base" autoComplete="off" autoFocus />
      </label>
      {breakdown ? <BreakdownField numberStyle={numberStyle} /> : <button type="button" onClick={() => setBreakdown(true)} className="self-start text-sm underline">Add a breakdown</button>}
    </>
  );
}

/** Runs one send and gives the answer to show. */
export async function sendValue(send: () => Promise<NonNullable<Answer> | { error: string }>): Promise<Answer> {
  try {
    const r = await send();
    return isActionError(r) ? { ok: false, detail: r.error } : r;
  } catch {
    return { ok: false, detail: UNEXPECTED };
  }
}
