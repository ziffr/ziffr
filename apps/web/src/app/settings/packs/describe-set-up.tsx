"use client";
// "Set-up questions" under "Describe your Pack" (spec 0068; GLOSSARY: Pack, Position, Repeat, Metric Catalog): what the
// author of a Pack writes, in everyday words, for whoever sets it up: the words of the first screen, a question for each
// Position and Repeat of the file, and the numbers asked and written as targets. Short plain text only, never a screen
// or markup; Ziffr draws every Pack the same way. Each field says its limit. Nothing is written here by Ziffr itself but
// on the author's own press of "Use its set-up questions"; the core checks every field with the pack kit's checks.
import { useId } from "react";
import { TEXT_BUTTON, TEXT_FIELD } from "@/app/use-pack/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PackSetUpChoice, PackSetUpProblem } from "@ziffr/core/pack-export-set-up";
import type { PackGuideDraft } from "@ziffr/core/pack-export-guide";
import { askFits } from "@ziffr/core/pack-start-steps";
import { PACK_ASK_EVERY, PACK_SET_UP_LIMITS as L, type PackAskEvery } from "@ziffr/pack/set-up";

/** What the section holds: the author's words, what the file has that may be asked about, and what was refused. */
export type SetUpState = {
  setUp: PackSetUpChoice;
  setUpProblems: PackSetUpProblem[];
  numbers: PackGuideDraft["numbers"];
  positions: NonNullable<PackGuideDraft["positions"]>;
  repeats: NonNullable<PackGuideDraft["repeats"]>;
  setUps: NonNullable<PackGuideDraft["setUps"]>;
};
type Props<S extends SetUpState> = { state: S; setState: React.Dispatch<React.SetStateAction<S>> };
/** Changes the words; `clears` names the fields whose refusals are then out of date. */
type Edit = (change: (was: PackSetUpChoice) => PackSetUpChoice, clears: string) => void;

const EVERY: Record<PackAskEvery, string> = { month: "A month", quarter: "A quarter", year: "A year" };
const length = (text: string) => [...text.replace(/\s+/g, " ").trim()].length;

/** The refusals of one field, under it. */
function Refused({ id, problems }: { id: string; problems: PackSetUpProblem[] }) {
  if (!problems.length) return null;
  return (
    <ul id={id} role="alert" className="mt-1 space-y-0.5 text-xs text-destructive">
      {problems.map((p, i) => <li key={i}>This field {p.message}</li>)}
    </ul>
  );
}

/** One short text, with its limit. */
function Words({ field, label, max, value = "", example, problems, onChange }: { field: string; label: string; max: number; value?: string; example?: string; problems: PackSetUpProblem[]; onChange: (value: string) => void }) {
  const id = useId();
  const mine = problems.filter((p) => p.field === field);
  const used = length(value);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-medium break-words">{label}</label>
      <Input id={id} data-set-up-field={field} className={TEXT_FIELD} value={value} autoComplete="off" onChange={(e) => onChange(e.target.value)}
        aria-invalid={mine.length > 0 || used > max} aria-describedby={mine.length ? `${id}-limit ${id}-problems` : `${id}-limit`} />
      <p id={`${id}-limit`} className="mt-0.5 text-xs text-muted-foreground">{used > max ? "Too long: " : ""}{used} of {max} characters.{example ? ` For example: ${example}` : ""}</p>
      <Refused id={`${id}-problems`} problems={mine} />
    </div>
  );
}

/** The lines of one list: those written and one more to write in, up to its most. */
function ListFields({ name, legend, most, example, state, edit }: { name: "happens" | "needs"; legend: string; most: number; example: string; state: SetUpState; edit: Edit }) {
  const lines = state.setUp[name] ?? [];
  const written = lines.reduce((last, line, i) => (line?.trim() ? i : last), -1);
  const shown = Math.min(most, written + 2);
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-xs font-medium">{legend} <span className="font-normal text-muted-foreground">Up to {most} lines.</span></legend>
      {Array.from({ length: shown }, (_, i) => (
        <Words key={i} field={`${name}.${i}`} label={`Line ${i + 1}`} max={L.listed} value={lines[i]} example={i === 0 ? example : undefined} problems={state.setUpProblems}
          onChange={(value) => edit((was) => ({ ...was, [name]: Array.from({ length: Math.max(shown, i + 1) }, (__, k) => (k === i ? value : was[name]?.[k] ?? "")) }), name)} />
      ))}
    </fieldset>
  );
}

/** A number asked at set-up: whether it is, and with which words. */
function Ask({ number, state, edit }: { number: SetUpState["numbers"][number]; state: SetUpState; edit: Edit }) {
  const id = useId();
  const asked = state.setUp.asks?.[number.ref];
  const spans = PACK_ASK_EVERY.filter((every) => askFits(number.period, every));
  const field = `asks.${number.ref}`;
  const put = (ask: NonNullable<PackSetUpChoice["asks"]>[string] | null) => edit((was) => {
    const asks = { ...was.asks };
    if (ask) asks[number.ref] = ask;
    else delete asks[number.ref];
    return { ...was, asks };
    // One number more or less changes which of them is one too many.
  }, "asks");
  const own = state.setUpProblems.filter((p) => p.field === field || p.field === `${field}.every`);
  return (
    <li className="border-t border-border pt-1">
      <label className="flex min-h-11 cursor-pointer items-start gap-2 py-2 sm:min-h-0">
        <input type="checkbox" data-set-up-field={field} checked={Boolean(asked)} aria-describedby={own.length ? `${id}-problems` : undefined}
          onChange={(e) => put(e.target.checked ? { question: "", name: "", every: spans.includes("quarter") ? "quarter" : spans[spans.length - 1] } : null)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]" />
        <span className="min-w-0 break-words">Ask for a target for &ldquo;{number.name}&rdquo;</span>
      </label>
      <Refused id={`${id}-problems`} problems={own} />
      {asked && (
        <div className="space-y-2 pb-2 pl-6">
          <Words field={`${field}.question`} label={`Your question about ${number.name}`} max={L.question} value={asked.question} example="What is the target this quarter?" problems={state.setUpProblems}
            onChange={(question) => put({ ...asked, question })} />
          <Words field={`${field}.name`} label={`A short name for the field of ${number.name}`} max={L.name} value={asked.name} example="Target" problems={state.setUpProblems}
            onChange={(name) => put({ ...asked, name })} />
          <label className="block text-xs font-medium">
            One answer for {number.name} holds for
            <select data-set-up-field={`${field}.every`} value={asked.every} onChange={(e) => put({ ...asked, every: e.target.value as PackAskEvery })} className={cn(TEXT_FIELD, "block w-full rounded-[var(--radius-input)] border border-input bg-card px-2 sm:w-auto")}>
              {spans.map((every) => <option key={every} value={every}>{EVERY[every]}</option>)}
            </select>
          </label>
        </div>
      )}
    </li>
  );
}

/** The section's fields. */
export function PackSetUpFields<S extends SetUpState>({ state, setState }: Props<S>) {
  const title = useId();
  const edit: Edit = (change, clears) => setState((s) => ({ ...s, setUp: change(s.setUp), setUpProblems: s.setUpProblems.filter((p) => p.field !== clears && !p.field.startsWith(`${clears}.`)) }));
  const { setUp, setUpProblems: problems } = state;
  const asked = state.numbers.filter((n) => setUp.asks?.[n.ref]).length;
  return (
    <section aria-labelledby={title} className="space-y-4">
      <div>
        <h3 id={title} className="font-medium">Set-up questions</h3>
        <p className="text-xs text-muted-foreground">Whoever gets your Pack answers a few questions, one on each screen, before anything is made. Write as you would ask a colleague. All of it is optional: where you write nothing, Ziffr uses its own words. Anyone who gets the file reads what you write, so leave out names and email addresses. A Pack with any of this needs a newer Ziffr.</p>
      </div>
      {state.setUps.map((o) => (
        <div key={o.installId} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-input)] bg-muted p-2.5 text-xs">
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{o.name} {o.version}, installed here, has set-up questions. Take them over only if you may use its words. They replace what you wrote here.</span>
          <Button type="button" size="sm" variant="outline" className={TEXT_BUTTON} onClick={() => setState((s) => ({ ...s, setUp: o.setUp, setUpProblems: [] }))}>Use its set-up questions<span className="sr-only">: {o.name}</span></Button>
        </div>
      ))}
      <div className="space-y-3">
        <div>
          <h4 className="text-xs font-semibold">The first screen</h4>
          <p className="text-xs text-muted-foreground">If you write any of these, write the sentence and at least one line of what happens.</p>
        </div>
        <Words field="line" label="In one sentence, what does this Pack do for them?" max={L.line} value={setUp.line} example="A weekly sales meeting, prepared for you." problems={problems}
          onChange={(line) => edit((was) => ({ ...was, line }), "line")} />
        <ListFields name="happens" legend="What happens once it is set up?" most={L.happens} example="Monday: your team is asked for its figures" state={state} edit={edit} />
        <ListFields name="needs" legend="What should they have ready?" most={L.needs} example="Last quarter's figures" state={state} edit={edit} />
      </div>
      {(state.positions.length > 0 || state.repeats.length > 0) && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold">Questions about people</h4>
          {state.repeats.map((r) => (
            <Words key={r.key} field={`repeats.${r.key}.question`} label={`The question above the list of: ${r.name}`} max={L.question} value={setUp.repeats?.[r.key]?.question} problems={problems}
              onChange={(question) => edit((was) => ({ ...was, repeats: { ...was.repeats, [r.key]: { question } } }), `repeats.${r.key}`)} />
          ))}
          {state.positions.map((p) => (
            <div key={p.key} className="space-y-2">
              <Words field={`positions.${p.key}.question`} label={`The question that asks who is: ${p.name}`} max={L.question} value={setUp.positions?.[p.key]?.question} problems={problems}
                onChange={(question) => edit((was) => ({ ...was, positions: { ...was.positions, [p.key]: { ...was.positions?.[p.key], question } } }), `positions.${p.key}.question`)} />
              <Words field={`positions.${p.key}.hint`} label={`A line under that question: ${p.name}`} max={L.hint} value={setUp.positions?.[p.key]?.hint} problems={problems}
                onChange={(hint) => edit((was) => ({ ...was, positions: { ...was.positions, [p.key]: { ...was.positions?.[p.key], hint } } }), `positions.${p.key}.hint`)} />
            </div>
          ))}
        </div>
      )}
      {state.numbers.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold">Ask a number at set-up</h4>
          <p className="mb-2 text-xs text-muted-foreground">The number they type becomes the Metric&rsquo;s target for every period in the time you choose. It is written as typed, not divided. At most {L.asks} in a Pack; {asked} chosen.</p>
          <ul className="space-y-1">{state.numbers.map((n) => <Ask key={n.ref} number={n} state={state} edit={edit} />)}</ul>
        </div>
      )}
    </section>
  );
}
