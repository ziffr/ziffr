"use client";
// The "For" box of the personal form link (GLOSSARY: Period, Prompt, Submission Rule): the period the value will be
// recorded for, a list of them when an earlier one was asked for and still waits, and what the picked one already holds.
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { PeriodChoice } from "./period-choices";

type Props = {
  choice: PeriodChoice;
  choices: PeriodChoice[];
  selectable: boolean;
  /** The Metric's Submission Rule in words, said beside a value the period already holds. */
  rule: string;
  /** The form the list belongs to, so the picked period is sent with it. */
  form: string;
  onPick: (start: string) => void;
  className?: string;
};

/** The period, or the list to pick it from, with the value it holds. */
export function RecordPeriod({ choice, choices, selectable, rule, form, onPick, className }: Props) {
  const select = useRef<HTMLSelectElement>(null);
  // React resets a form after its action, which would turn the list back to its first line while the form still sends
  // what that line says: set it to the picked period again.
  useLayoutEffect(() => { if (select.current) select.current.value = choice.start; });
  const holds = choice.has !== null && <>already has <span className="font-medium">{choice.has}</span> ({rule})</>;
  return (
    <div className={cn("mt-4 rounded-lg bg-muted px-3 py-2 text-sm", className)}>
      {selectable ? (
        <>
          <label className="flex items-center gap-2">
            <span>For</span>
            <select ref={select} name="period" form={form} value={choice.start} onChange={(e) => onPick(e.target.value)} className="h-9 min-w-0 flex-1 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm font-medium">
              {choices.map((c) => <option key={c.start} value={c.start}>{[c.label, ...c.notes].join(" · ")}</option>)}
            </select>
          </label>
          {holds && <p className="mt-1">This period {holds}</p>}
        </>
      ) : (
        <>
          For <span className="font-medium">{choice.label}</span>
          {choice.notes.includes("asked for") && " (asked for)"}
          {holds && <>, {holds}</>}
        </>
      )}
      {choice.last && <p className="mt-1 sm:hidden">Last value <span className="font-medium">{choice.last.value}</span> for {choice.last.periodLabel}</p>}
    </div>
  );
}
