"use client";
// The combined form's fields (GLOSSARY: Combined Prompt, Value Note, Breakdown; spec 0064): for each number of the
// message one field, a note and a Breakdown, and one Submit for all. Empty rows are skipped and each row says what
// became of it, in the core's own words handed back by the action; nothing from the address is ever shown. Fields are
// named by the number a figure has in the message, the only thing about it a browser sends back.
import { useActionState, useEffect, useRef, useState } from "react";
import { submitCombinedWebForm } from "@/app/actions";
import { StandInNote } from "@/app/submit/stand-in-note";
import { BreakdownField } from "@/app/submit/[code]/breakdown-field";
import { Button } from "@/components/ui/button";
import { AskedNote } from "@/components/asked-note";
import { Input } from "@/components/ui/input";
import { TuckedNote } from "@/components/value-note-tuck";
import { cn } from "@/lib/utils";
import type { CombinedFormRow, CombinedOpenRow, CombinedResult, CombinedRowResult } from "@ziffr/core/combined-form";
import type { NumberStyle } from "@ziffr/core/number-style";

type Typed = { value: string; note: string };
const EMPTY: Typed = { value: "", note: "" };

type Props = { code: string; rows: CombinedFormRow[]; numberStyle: NumberStyle; notes: boolean };

/** The list of numbers with one Submit. */
export function CombinedFields({ code, rows, numberStyle, notes }: Props) {
  const [result, action, pending] = useActionState<CombinedResult | null, FormData>(submitCombinedWebForm.bind(null, code), null);
  const [typed, setTyped] = useState<Record<number, Typed>>({});
  // What became of each row, kept over further tries for the rest.
  const [said, setSaid] = useState<Record<number, CombinedRowResult>>({});
  // Counts the times a row was recorded: a new count empties its Breakdown.
  const [rounds, setRounds] = useState<Record<number, number>>({});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!result) return;
    const answers = Object.entries(result.rows).map(([position, r]) => [Number(position), r] as const);
    setSaid((old) => ({ ...old, ...result.rows }));
    // Only what was taken leaves its field; a refused number and a note that was not saved stay.
    setTyped((old) => ({ ...old, ...Object.fromEntries(answers.filter(([, r]) => r.ok).map(([p, r]) => [p, { value: "", note: r.noteKept ? (old[p]?.note ?? "") : "" }])) }));
    setRounds((old) => ({ ...old, ...Object.fromEntries(answers.filter(([, r]) => r.ok).map(([p]) => [p, (old[p] ?? 0) + 1])) }));
    // Focus goes to the first number that needs another look.
    const refused = answers.find(([, r]) => !r.ok);
    if (refused) form.current?.querySelector<HTMLElement>(`[name="value-${refused[0]}"]`)?.focus();
  }, [result]);
  const shown: Record<number, CombinedRowResult> = { ...said, ...result?.rows };
  const open = rows.some((r) => r.open);
  return (
    <form ref={form} action={action} noValidate>
      <ol className="mt-4 flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.position} className="rounded-lg border p-3" aria-labelledby={`figure-${row.position}`}>
            <h2 id={`figure-${row.position}`} className="text-base font-semibold">
              {/* One no longer asked is not named: its number and why stand alone. */}
              {row.position}. {row.name ?? (row.open ? "" : row.words)}
              {row.periodLabel && <span className="block text-sm font-normal text-muted-foreground">{row.periodLabel}</span>}
            </h2>
            {row.open ? (
              <OpenRow
                key={rounds[row.position] ?? 0}
                row={row}
                said={shown[row.position]}
                typed={typed[row.position] ?? EMPTY}
                onType={(change) => setTyped((old) => ({ ...old, [row.position]: { ...(old[row.position] ?? EMPTY), ...change } }))}
                numberStyle={numberStyle}
                notes={notes}
              />
            ) : (
              <>
                {shown[row.position] && <Said result={shown[row.position]} />}
                {row.name !== null && <p className="mt-1.5 text-sm">{row.words}</p>}
              </>
            )}
            {/* Outside the row's own fields, which start anew once a number was taken, and also once the row closes. */}
            {shown[row.position]?.ask && <AskedNote key={shown[row.position].ask} code={shown[row.position].ask!} about={row.name === null ? undefined : `for ${row.name}, ${row.periodLabel}`} className="mt-3" />}
          </li>
        ))}
      </ol>
      {/* On a phone Submit stays in reach however long the list is, above the tab bar of a signed-in person. */}
      <div className={cn("mt-4", open && "max-sm:sticky max-sm:bottom-0 max-sm:z-30 max-sm:border-t max-sm:bg-background max-sm:py-3 max-sm:[body:has(nav[aria-label=Tabs])_&]:bottom-[calc(3rem+1px+env(safe-area-inset-bottom))]")}>
        {result && <Summary result={result} />}
        {open ? (
          <Button type="submit" size="lg" className="w-full max-sm:h-12 max-sm:text-base" disabled={pending}>{pending ? "Sending…" : "Submit"}</Button>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing more to fill in here.</p>
        )}
      </div>
    </form>
  );
}

/** What the last try came to, beside the button, since the row it speaks of may be off the screen. */
function Summary({ result }: { result: CombinedResult }) {
  if (result.refused) return <p role="alert" className="mb-2 text-sm text-destructive">{result.refused}</p>;
  const all = Object.values(result.rows);
  const done = all.filter((r) => r.ok).length;
  return (
    <p role="status" className="mb-2 text-sm">
      {done === all.length ? (done === 1 ? "Done. See the number above." : `All ${done} done. See each number above.`) : `${done} of ${all.length} done. See each number above for what happened.`}
    </p>
  );
}

/** What became of one row. Colour is never the only sign: a refusal starts with its own words. */
function Said({ result, id }: { result: CombinedRowResult; id?: string }) {
  return (
    <p id={id} role="status" className={cn("mt-2 rounded-lg border px-3 py-2 text-sm", result.ok ? "border-[var(--color-rule-2)] bg-[var(--color-paper-2)]" : "border-destructive/30 bg-destructive/5")}>
      {result.detail}
    </p>
  );
}

type RowProps = { row: CombinedOpenRow; said?: CombinedRowResult; typed: Typed; onType: (change: Partial<Typed>) => void; numberStyle: NumberStyle; notes: boolean };

/** One number that can be sent: what its own form link shows, its field, its note and its Breakdown. */
function OpenRow({ row, said, typed, onType, numberStyle, notes }: RowProps) {
  const [breakdown, setBreakdown] = useState(false);
  const about = `${row.name}, ${row.periodLabel}`;
  const p = row.position;
  return (
    <>
      {row.description && <p className="mt-1 text-sm text-muted-foreground">{row.description}</p>}
      {row.has !== null && <p className="mt-1.5 text-sm">This period already has <span className="font-medium">{row.has}</span> ({row.rule})</p>}
      {row.answeredOn && <p className="mt-1.5 text-sm">Already answered on {row.answeredOn}. A new number here follows this rule: {row.rule}.</p>}
      {row.standingInFor && <StandInNote name={row.standingInFor} />}
      {said && <Said id={`said-${p}`} result={said} />}
      <Input
        name={`value-${p}`}
        aria-label={`Value for ${about}`}
        aria-invalid={said && !said.ok ? true : undefined}
        aria-describedby={said ? `said-${p}` : undefined}
        inputMode="decimal"
        autoComplete="off"
        placeholder={row.placeholder}
        value={typed.value}
        onChange={(e) => onType({ value: e.target.value })}
        // Important: on a touch screen every field is otherwise set to 16px (globals.css).
        className="mt-2 h-10 text-base max-sm:h-12 max-sm:text-xl! max-sm:dark:bg-card"
      />
      {/* While the question stands the row's own note field gives way, until a further number is typed. */}
      {notes && (!said?.ask || typed.value !== "") && <div className="mt-1 sm:mt-3"><TuckedNote name={`note-${p}`} about={about} value={typed.note} onChange={(note) => onType({ note })} /></div>}
      <Button type="button" variant="ghost" className="mt-1 -ml-2 px-2 underline underline-offset-4" aria-expanded={breakdown} aria-controls={`breakdown-part-${p}`} onClick={() => setBreakdown(!breakdown)}>
        {breakdown ? "Hide the breakdown" : "Add a breakdown (optional)"}<span className="sr-only"> for {about}</span>
      </Button>
      {/* Hidden, not removed: what was typed stays and is sent. */}
      <div id={`breakdown-part-${p}`} className={breakdown ? undefined : "hidden"}>
        <BreakdownField numberStyle={numberStyle} name={`breakdown-${p}`} />
      </div>
    </>
  );
}
