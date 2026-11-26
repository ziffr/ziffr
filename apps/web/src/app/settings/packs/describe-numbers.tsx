"use client";
// Where each number of an exported Pack comes from (spec 0058, GLOSSARY: Comes From): one answer for each number that
// somebody or something sends, "Ask a person" to begin with, with the kind of system where another system sends it
// and a short note. Numbers Ziffr calculates are not asked: the formula says it. The core checks every answer.
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { COMES_FROM_BY, COMES_FROM_LIMITS, type PackComesFrom } from "@ziffr/pack/comes-from";
import type { Description } from "./describe";

const SAYS: Record<PackComesFrom["by"], string> = { person: "Ask a person", system: "Another system sends it", target: "Set once as a target" };

/** One field set for each number of the file; draws nothing when the file has none. */
export function PackNumberFields({ state, setState }: { state: Description; setState: React.Dispatch<React.SetStateAction<Description>> }) {
  const base = useId();
  if (!state.numbers.length) return null;
  const answer = (ref: string, patch: Partial<PackComesFrom>) => setState((s) => ({
    ...s,
    comesFrom: { ...s.comesFrom, [ref]: { ...(s.comesFrom[ref] ?? { by: "person" }), ...patch } },
    numberProblems: s.numberProblems.filter((p) => p.ref !== ref),
  }));
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium">Where the numbers come from</h3>
        <p className="text-xs text-muted-foreground">Whoever gets the Pack sees this before installing, and nobody is asked for a number another system sends.</p>
      </div>
      {state.numbers.map((n, i) => {
        const said = state.comesFrom[n.ref] ?? { by: "person" as const };
        const problem = state.numberProblems.find((p) => p.ref === n.ref);
        const id = `${base}-${i}`;
        return (
          <fieldset key={n.ref} className="space-y-1.5 border-t border-border pt-2 [overflow-wrap:anywhere]">
            <legend className="float-left w-full text-xs font-medium">{n.name}</legend>
            <select data-number-field={n.ref} aria-label={`Where ${n.name} comes from`} aria-invalid={Boolean(problem)} aria-describedby={problem ? `${id}-problem` : undefined} value={said.by} onChange={(e) => answer(n.ref, { by: e.target.value as PackComesFrom["by"] })} className="clear-both block h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm">
              {COMES_FROM_BY.map((by) => <option key={by} value={by}>{SAYS[by]}</option>)}
            </select>
            {said.by === "system" && <Input aria-label={`Kind of system that sends ${n.name}`} placeholder="Kind of system, such as CRM" maxLength={COMES_FROM_LIMITS.system} value={said.system ?? ""} onChange={(e) => answer(n.ref, { system: e.target.value })} />}
            <Input aria-label={`Note on where ${n.name} comes from`} placeholder="Note (optional), such as where to find it" maxLength={COMES_FROM_LIMITS.note} value={said.note ?? ""} onChange={(e) => answer(n.ref, { note: e.target.value })} />
            {problem && <p id={`${id}-problem`} role="alert" className="text-xs text-destructive">{problem.message}</p>}
          </fieldset>
        );
      })}
    </div>
  );
}
