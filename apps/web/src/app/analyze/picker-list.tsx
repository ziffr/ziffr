"use client";
// The list of the method picker (GLOSSARY: Analysis Canvas, Method; spec 0041, ticket 16): Methods grouped by what a person wants to
// know, each with its plain name, the technical name in small type, one sentence and Use it when / Don't use it when. A Method that
// cannot work on the canvas as it is stays in the list, greyed, with the reason in words: never silently missing. Only what the core
// gave for this person is shown (it names no Metric they may not see).
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import type { EntryView, PickerList } from "@ziffr/core/analysis-picker";
import { cn } from "@/lib/utils";

/** What a Method needs and when to use it: plain text a person reads before choosing. */
function EntryDetails({ e }: { e: EntryView }) {
  return (
    <details className="mt-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">Use it when / Don&rsquo;t use it when</summary>
      <p className="mt-1"><span className="font-medium text-foreground">Use it when.</span> {e.useWhen}</p>
      <p className="mt-1 font-medium text-foreground">Don&rsquo;t use it when.</p>
      <ul className="list-disc space-y-0.5 pl-4">{e.dontUseWhen.map((d) => <li key={d}>{d}</li>)}</ul>
      <p className="mt-1">Needs {e.needs}.</p>
    </details>
  );
}

/** One Method of the list: choosable when it fits, greyed with its reason when it does not. `children` is its questions, shown once chosen. */
function EntryCard({ e, open, onPick, children }: { e: EntryView; open: boolean; onPick: (id: EntryView["id"]) => void; children?: ReactNode }) {
  const ok = e.fit.ok;
  return (
    <li className={cn("rounded-[var(--radius-stock)] p-2.5 text-sm", ok ? "stock" : "border border-dashed border-[var(--color-rule-2)] text-muted-foreground", open && "sm:col-span-2 xl:col-span-3")}>
      <button
        type="button"
        disabled={!ok}
        aria-expanded={ok ? open : undefined}
        onClick={() => onPick(e.id)}
        className="block w-full min-w-0 text-left disabled:cursor-not-allowed"
      >
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className={cn("font-medium break-words", ok && "text-foreground")}>{e.name}</span>
          <span className="text-[0.7rem] text-muted-foreground">{e.technical}</span>
          {!ok && <Lock aria-hidden className="size-3 shrink-0 self-center text-muted-foreground" />}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{e.sentence}</span>
      </button>
      {!e.fit.ok && <p className="mt-1 text-xs text-foreground/80" role="note"><span className="font-medium">Not now.</span> <span dir="auto" className="break-words">{e.fit.reason}</span></p>}
      <EntryDetails e={e} />
      {open && children}
    </li>
  );
}

/** The groups of the list. `ask` renders the questions of the Method that is open. */
export function PickerGroups({ list, openId, onPick, ask }: { list: PickerList; openId: EntryView["id"] | null; onPick: (id: EntryView["id"]) => void; ask: (e: EntryView) => ReactNode }) {
  return (
    <div className="space-y-4">
      {list.groups.map((g) => (
        <section key={g.want} aria-label={g.question}>
          <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{g.question}</h3>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {g.entries.map((e) => <EntryCard key={e.id} e={e} open={openId === e.id} onPick={onPick}>{ask(e)}</EntryCard>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
