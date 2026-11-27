"use client";
// "Describe your Pack", the second step of Export as Pack (specs 0058 and 0068, GLOSSARY: Pack Guide, Comes From, Pack):
// where each number comes from, a field for each of the guide's five sections, "Each part" starting with the list of what
// goes into the file, the guide of an installed Pack offered again, the set-up questions (describe-set-up.tsx, only while
// the guided set-up is switched on), and what the file may not hold told at its field. The core makes and checks the
// file; this step only holds the words and decides whether the guide goes into it.
import { useCallback, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PackNumberFields } from "./describe-numbers";
import { PackSetUpFields, type SetUpState } from "./describe-set-up";
import { PACK_SET_UP_ON } from "@/app/use-pack/switch";
import type { ComesFromChoice, ComesFromProblem } from "@ziffr/core/pack-export-numbers";
import { PACK_GUIDE_SECTIONS, type PackGuideSection } from "@ziffr/pack/pack-guide";
import type { PackGuideDraft } from "@ziffr/core/pack-export-guide";
import type { GuideProblem, PackGuideText } from "@ziffr/core/pack-guide-text";
import type { PackSetUpProblem } from "@ziffr/core/pack-export-set-up";

/** What each field asks for, in plain words. */
const ASKS: Record<PackGuideSection, string> = {
  whatItsFor: "Who it is for and what they get from it.",
  beforeYouStart: "What to have ready, such as figures, people or another system.",
  firstSteps: "How to start, best as numbered steps.",
  eachPart: "What each part does. It starts with the names of what goes into the file.",
  questions: "What people ask, with your answers.",
};

/** The step's words and choices, the set-up questions among them. */
export type Description = SetUpState & {
  text: PackGuideText;
  /** The guide goes into the file: ticked by the person, or by writing in a field. */
  include: boolean;
  problems: GuideProblem[];
  offers: PackGuideDraft["installed"];
  /** Where the person says each number of the file comes from. */
  comesFrom: ComesFromChoice;
  numberProblems: ComesFromProblem[];
};

/** The state of the step, kept while the dialog moves back and forth. `drafted` takes in what the core answers each time
 * the step is opened: the list of contents replaces "Each part" only while the person has not changed it. */
export function useDescription() {
  const [state, setState] = useState<Description>({ text: {}, include: false, problems: [], offers: [], numbers: [], comesFrom: {}, numberProblems: [], setUp: {}, setUpProblems: [], positions: [], repeats: [], setUps: [] });
  const listed = useRef("");
  const drafted = useCallback((draft: PackGuideDraft) => {
    const before = listed.current;
    listed.current = draft.contents;
    // Each number starts with what the Pack it came from says, else "Ask a person"; an answer given stays.
    // The set-up questions start empty: an installed Pack's are only offered.
    setState((s) => ({ ...s, offers: draft.installed, numbers: draft.numbers, numberProblems: [], problems: [], text: (s.text.eachPart ?? "") === before ? { ...s.text, eachPart: draft.contents } : s.text,
      setUpProblems: [], positions: draft.positions ?? [], repeats: draft.repeats ?? [], setUps: draft.setUps ?? [],
      comesFrom: Object.fromEntries(draft.numbers.map((n) => [n.ref, s.comesFrom[n.ref] ?? n.said ?? { by: "person" as const }])) }));
  }, []);
  const refused = useCallback((problems: GuideProblem[], numberProblems: ComesFromProblem[], setUpProblems: PackSetUpProblem[]) => setState((s) => ({ ...s, problems, numberProblems, setUpProblems })), []);
  return { state, setState, drafted, refused, /** What goes with the export: the guide only when it is ticked. */ guide: state.include ? state.text : undefined, comesFrom: state.comesFrom, setUp: PACK_SET_UP_ON ? state.setUp : undefined };
}

/** The fields of the step, each problem under the field it is in. */
export function DescribeStep({ state, setState }: { state: Description; setState: React.Dispatch<React.SetStateAction<Description>> }) {
  const base = useId();
  const write = (key: PackGuideSection, value: string) => setState((s) => ({ ...s, include: true, text: { ...s.text, [key]: value }, problems: s.problems.filter((p) => p.section !== key && p.section !== null) }));
  const whole = state.problems.filter((p) => p.section === null);
  return (
    <div className="space-y-4 text-sm">
      <PackNumberFields state={state} setState={setState} />
      <h3 className="font-medium">The guide</h3>
      <p className="text-xs text-muted-foreground">One paragraph per line. Start a line with <code>-</code> for a list, <code>1.</code> for numbered steps or <code>#</code> for a heading; an empty line starts a new list. Put <code>**</code> before and after words to show them bold. A guide holds no link, web or email address, or markup. Leave a field empty to leave its section out.</p>
      {state.offers.map((o) => (
        <div key={o.installId} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-input)] bg-muted p-2.5 text-xs">
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{o.name} {o.version}, installed here, has a guide. Take it over only if you may use its words.</span>
          <Button size="sm" variant="outline" onClick={() => setState((s) => ({ ...s, include: true, text: o.text, problems: [] }))}>Use its guide<span className="sr-only">: {o.name}</span></Button>
        </div>
      ))}
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={state.include} onChange={(e) => setState((s) => ({ ...s, include: e.target.checked, problems: [] }))} className="mt-0.5 accent-[var(--color-ink)]" />
        <span>Put this guide into the Pack<span className="block text-xs text-muted-foreground">Ticked by itself when you write in a field. Without it, the Pack has no guide.</span></span>
      </label>
      {whole.map((p, i) => <p key={i} role="alert" className="font-medium text-destructive">{p.message}</p>)}
      {PACK_GUIDE_SECTIONS.map((s) => {
        const id = `${base}-${s.key}`;
        const problems = state.problems.filter((p) => p.section === s.key);
        return (
          <div key={s.key}>
            <label htmlFor={id} className="text-xs font-medium">{s.title}</label>
            <p id={`${id}-asks`} className="text-xs text-muted-foreground">{ASKS[s.key]}</p>
            <Textarea id={id} data-guide-field={s.key} rows={3} value={state.text[s.key] ?? ""} onChange={(e) => write(s.key, e.target.value)} className="mt-1 max-h-56"
              aria-invalid={problems.length > 0} aria-describedby={problems.length ? `${id}-asks ${id}-problems` : `${id}-asks`} />
            {problems.length > 0 && (
              <ul id={`${id}-problems`} role="alert" className="mt-1 space-y-0.5 text-xs text-destructive">
                {problems.map((p, i) => <li key={i}>{p.line ? `Line ${p.line}: ` : ""}{p.message}</li>)}
              </ul>
            )}
          </div>
        );
      })}
      {PACK_SET_UP_ON && <PackSetUpFields state={state} setState={setState} />}
    </div>
  );
}
