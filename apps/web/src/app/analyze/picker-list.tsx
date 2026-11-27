"use client";
// The list of the methods panel (GLOSSARY: Analysis Canvas, Method; spec 0041, ticket 16; the owner's words of 2026-11-24): the
// questions grouped by what a person wants to know, as headings only. What fits the canvas comes first. A question that cannot work on the
// canvas as it is stays in the list, greyed, with the reason in one line beside it (where history is short, how close it is): never silently
// missing. Choosing a title opens it
// in place: what it is, Use it when / Don't use it when, and (as `children`) the fields for its settings. Only what the core gave for
// this person is shown (it names no Metric they may not see).
import { ChevronRight, Lock } from "lucide-react";
import type { ReactNode } from "react";
import type { EntryView, PickerList } from "@ziffr/core/analysis-picker";
import { cn } from "@/lib/utils";
import { ShortHelp } from "./short-help";

/** What a Method is and when to use it: plain text a person reads once they have chosen it. */
function EntryDetails({ e }: { e: EntryView }) {
  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      <p><span className="font-medium text-foreground">What it is.</span> {e.sentence} <span className="text-[0.7rem]">({e.technical})</span></p>
      <p><span className="font-medium text-foreground">Use it when.</span> {e.useWhen}</p>
      <div>
        <p className="font-medium text-foreground">Don&rsquo;t use it when.</p>
        <ul className="list-disc space-y-0.5 pl-4">{e.dontUseWhen.map((d) => <li key={d}>{d}</li>)}</ul>
      </div>
      <p>Needs {e.needs}.</p>
    </div>
  );
}

/** One question of the list: a button with its title that fits and opens it in place, or a greyed line with its reason when it does not. `children` is its fields, shown once opened. */
function EntryRow({ e, open, onPick, children }: { e: EntryView; open: boolean; onPick: (id: EntryView["id"]) => void; children?: ReactNode }) {
  const ok = e.fit.ok;
  const panel = `entry-${e.id}`;
  return (
    <li className={cn("rounded-[var(--radius-stock)] text-sm", ok ? "stock" : "border border-dashed border-[var(--color-rule-2)] text-muted-foreground", open && "ring-1 ring-foreground/30")}>
      <button
        type="button"
        disabled={!ok}
        aria-expanded={ok ? open : undefined}
        aria-controls={ok ? panel : undefined}
        onClick={() => onPick(e.id)}
        className="flex w-full min-w-0 items-start gap-1.5 p-2.5 text-left disabled:cursor-not-allowed"
      >
        {ok
          ? <ChevronRight aria-hidden className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          : <Lock aria-hidden className="mt-0.5 size-3 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1">
          <span dir="auto" className={cn("break-words", ok ? "font-medium text-foreground" : "font-medium")}>{e.name}</span>
          {!e.fit.ok && <span dir="auto" className="block break-words text-xs text-foreground/80" role="note">{e.short ? e.short.words : <><span className="font-medium">Not now.</span> {e.fit.reason}</>}</span>}
        </span>
      </button>
      {!ok && e.short && <ShortHelp short={e.short} />}
      {ok && open && <div id={panel} className="space-y-3 border-t border-[var(--color-rule-2)] p-2.5"><EntryDetails e={e} />{children}</div>}
    </li>
  );
}

/** The groups of the list. `ask` renders the fields of the question that is open. */
export function PickerGroups({ list, openId, onPick, ask }: { list: PickerList; openId: EntryView["id"] | null; onPick: (id: EntryView["id"]) => void; ask: (e: EntryView) => ReactNode }) {
  return (
    <div className="space-y-4">
      {list.groups.map((g) => (
        <section key={g.want} aria-label={g.question}>
          <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{g.question}</h3>
          <ul className="space-y-1.5">
            {g.entries.map((e) => <EntryRow key={e.id} e={e} open={openId === e.id} onPick={onPick}>{ask(e)}</EntryRow>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
