"use client";
// The numbers a Pack asks at set-up (spec 0068; GLOSSARY: Target Series, Total, Number Style): one field, or one for
// each line, with the sum where a Total adds the targets up, or "Add later". What is typed is read in the person's
// Number Style and written as the target; the server checks it again.
import { Fragment } from "react";
import { ScreenHeading } from "@/app/first-steps/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@ziffr/core/format";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { Metric } from "@ziffr/core/types";
import { readNumber } from "@ziffr/core/numbers";
import type { StartStep } from "@ziffr/core/pack-start-steps";
import { filledLines, numberKey, stepProblem, type Answers, type LinesStep } from "./answers";
import { Card, StepForm, TEXT_BUTTON } from "./parts";

type NumbersStep = Extract<StartStep, { step: "numbers" }>;
/** A Metric's unit, written before or after its number. */
export type Unit = Pick<Metric, "unit" | "unit_position">;
type Props = {
  step: NumbersStep; answers: Answers; onChange: (answers: Answers) => void; onContinue: () => void; style: NumberStyle;
  /** The steps that list lines, for the rows of a number asked for each line, and their names. */
  lines: LinesStep[];
  rowName: (repeat: string, id: number) => string;
  units: Record<string, Unit>;
};

const decimalsOf = (n: number) => Math.min(4, (String(n).split(".")[1] ?? "").length);

/** One asked number: its question, its fields and, where a Total adds them up, their sum. */
function Ask({ ask, answers, onChange, rows, rowName, style, unit }: { ask: NumbersStep["asks"][number]; answers: Answers; onChange: Props["onChange"]; rows: (number | null)[]; rowName: Props["rowName"]; style: NumberStyle; unit?: Unit }) {
  const values = rows.flatMap((id) => readNumber(answers.numbers[numberKey(ask.metric, id)] ?? "", style) ?? []);
  const sum = values.reduce((a, b) => a + b, 0);
  const written = formatNumber(sum, Math.max(0, ...values.map(decimalsOf)), style, { group: true });
  return (
    <Card className="py-1">
      <ul className="divide-y divide-border">
        {rows.map((id) => {
          const key = numberKey(ask.metric, id);
          const label = id === null || ask.repeat === null ? ask.field : rowName(ask.repeat, id);
          return (
            <li key={key} className="py-2.5">
              <label className="flex flex-wrap items-center justify-between gap-x-3 text-sm font-medium">
                <span className="min-w-0 break-words">{label}{id !== null && <span className="sr-only">, {ask.field}</span>}</span>
                <span className="flex items-center gap-2">
                  {unit?.unit && unit.unit_position === "before" && <span className="text-muted-foreground">{unit.unit}</span>}
                  <Input
                    className="h-11 w-36 text-right text-base tabular-nums md:h-9 md:text-sm" inputMode="decimal" autoComplete="off" maxLength={24}
                    value={answers.numbers[key] ?? ""}
                    aria-invalid={Boolean(answers.numbers[key]?.trim()) && readNumber(answers.numbers[key], style) === null}
                    onChange={(e) => onChange({ ...answers, later: false, numbers: { ...answers.numbers, [key]: e.target.value } })}
                  />
                  {unit?.unit && unit.unit_position === "after" && <span className="text-muted-foreground">{unit.unit}</span>}
                </span>
              </label>
            </li>
          );
        })}
        {ask.total && rows.length > 0 && (
          <li className="flex flex-wrap items-center justify-between gap-x-3 py-3 text-sm font-medium">
            <span className="min-w-0 break-words">Total for {ask.total}</span>
            <output className="tabular-nums">{unit?.unit && unit.unit_position === "before" ? `${unit.unit} ` : ""}{written}{unit?.unit && unit.unit_position === "after" ? ` ${unit.unit}` : ""}</output>
          </li>
        )}
      </ul>
    </Card>
  );
}

/** Every number asked. */
export function NumbersScreen({ step, answers, onChange, onContinue, style, lines, rowName, units }: Props) {
  const one = step.asks.length === 1 ? step.asks[0] : null;
  const rowsOf = (repeat: string | null) => {
    if (repeat === null) return [null];
    const of = lines.find((l) => l.repeat === repeat);
    return of ? filledLines(of, answers).map((l) => l.id) : [];
  };
  return (
    <>
      <ScreenHeading title={one ? one.question : "Your targets"}>{one?.repeat ? "One number for each. You can change them at any time." : "You can change this at any time."}</ScreenHeading>
      <StepForm
        problem={stepProblem(step, answers, style)}
        onContinue={() => { if (answers.later) onChange({ ...answers, later: false }); onContinue(); }}
        aside={<Button type="button" variant="ghost" className={TEXT_BUTTON} onClick={() => { onChange({ ...answers, later: true }); onContinue(); }}>Add later</Button>}
      >
        {step.asks.map((ask) => (
          <Fragment key={ask.metric}>
            {!one && <h2 className="text-sm font-medium">{ask.question}</h2>}
            <Ask ask={ask} answers={answers} onChange={onChange} rows={rowsOf(ask.repeat)} rowName={rowName} style={style} unit={units[ask.metric]} />
          </Fragment>
        ))}
      </StepForm>
    </>
  );
}
