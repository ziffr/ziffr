"use client";
// Choose a method (GLOSSARY: Analysis Canvas, Method, Takeaway; spec 0041, ticket 16): for a person who knows what they want. The list
// is grouped by what they want to know and fitted to the Metrics on the canvas; a Method that does not fit is greyed with its reason.
// Choosing one asks for its Slots and settings in words and runs it through the Takeaway layer in the core, the same code the Recipes
// use, so the minimums, ranges, strength words and footers are the same. The result can be saved as a widget (where the Method has
// one) and taken as an Analysis Recipe file, which goes into a Pack the existing way. Everything is asked of the core through server
// actions: the list names only Metrics this person sees.
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { BookmarkPlus, FileDown } from "lucide-react";
import type { EntryView, PickerList, PickerRun } from "@ziffr/core/analysis-picker";
import { TakeawayView } from "@/components/takeaway-view";
import { saveToPool } from "@/app/canvas-actions";
import { pickerList, pickerRun } from "@/app/picker-actions";
import { told } from "@/lib/action-toast";
import { TEMPLATES } from "@/views/templates";
import { AskForm, startAnswers, type Answers } from "./picker-ask";
import { PickerGroups } from "./picker-list";

type Done = Extract<PickerRun, { ok: true }>;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** What can be done with a result: save it as a widget, or take it as a recipe file. Said plainly where it cannot be. */
function ResultActions({ entry, done, pending, save }: { entry: EntryView; done: Done; pending: boolean; save: () => void }) {
  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      <div className="flex flex-wrap gap-2">
        {done.widget && <button type="button" disabled={pending} onClick={save} className="stock flex min-h-9 items-center gap-1.5 rounded-[var(--radius-stock)] px-3 text-sm text-foreground disabled:opacity-50"><BookmarkPlus className="size-3.5" /> Save as widget</button>}
        {done.recipe && (
          <button type="button" onClick={() => download(`${entry.id}.analysis.json`, `${JSON.stringify(done.recipe, null, 2)}\n`)} className="stock flex min-h-9 items-center gap-1.5 rounded-[var(--radius-stock)] px-3 text-sm text-foreground"><FileDown className="size-3.5" /> Download as Analysis Recipe</button>
        )}
      </div>
      {!done.widget && <p>This result has no widget of its own yet, so it stays on this screen.</p>}
      {done.recipe
        ? <p>The Analysis Recipe is this Method with its Slots left open. An Owner or Admin can add it to the Workspace from the Playground, and export it in a Pack under Settings.</p>
        : <p>This Method is not an Analysis Recipe yet, so it has no file to take away.</p>}
    </div>
  );
}

function Result({ entry, done }: { entry: EntryView; done: Done }) {
  const [pending, start] = useTransition();
  const save = () => {
    const template = done.widget!.template;
    const name = window.prompt("Save to your widgets as:", entry.name);
    if (!name) return;
    start(async () => {
      const settings = { ...TEMPLATES[template].settings, ...(done.widget!.showTarget ? { showTarget: true } : {}) };
      const res = await saveToPool({ type: "spec", template, metricIds: done.widget!.metricIds, settings }, name);
      if (!told(res, "Not saved")) toast.success("Saved to My Widgets", { description: "Drag it from the Pool onto any dashboard." });
    });
  };
  return (
    <div className="mt-3 space-y-2 rounded-[var(--radius-card)] border border-[var(--color-rule-2)] p-3" role="region" aria-label={`Result: ${entry.name}`}>
      <TakeawayView takeaway={done.takeaway} />
      <ResultActions entry={entry} done={done} pending={pending} save={save} />
    </div>
  );
}

// The questions of the open Method, and its result under them.
function Open({ entry, list }: { entry: EntryView; list: PickerList }) {
  const [answers, setAnswers] = useState<Answers>(() => startAnswers(entry));
  const [done, setDone] = useState<Done | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const asked = useRef(0);
  const run = () => start(async () => {
    const n = ++asked.current;
    const res = await pickerRun({ entry: entry.id, slots: answers.slots, settings: answers.settings });
    // A result for answers that have been changed since is not shown under the new ones.
    if (n !== asked.current) return;
    setMessage(res.ok ? null : res.message);
    setDone(res.ok ? res : null);
  });
  return (
    <>
      <AskForm entry={entry} canvas={list.canvas} answers={answers} onChange={(a) => { asked.current++; setAnswers(a); setDone(null); setMessage(null); }} onRun={run} pending={pending} />
      {message && <p role="alert" className="mt-2 text-xs text-destructive">{message}</p>}
      {done && <Result entry={entry} done={done} />}
    </>
  );
}

/** The panel under the Recipes: the list of Methods for the Metrics on the canvas (`ids`), and the questions of the one chosen. */
export function MethodPicker({ ids }: { ids: number[] }) {
  const [list, setList] = useState<(PickerList & { key: string }) | null>(null);
  const [openId, setOpenId] = useState<EntryView["id"] | null>(null);
  const [failed, setFailed] = useState(false);
  const asked = useRef(0);
  const key = ids.join(",");
  // The list is asked again when the canvas changes; an older answer that arrives late is dropped.
  useEffect(() => {
    const n = ++asked.current;
    pickerList(ids).then((l) => { if (n === asked.current) { setList({ ...l, key }); setFailed(false); } }, () => { if (n === asked.current) setFailed(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the canvas
  }, [key]);
  return (
    <section className="desk space-y-3 rounded-[var(--radius-card)] p-4" aria-label="Choose a method">
      <h2 className="text-sm font-medium">Choose a method</h2>
      <p className="text-xs text-muted-foreground">Pick by what you want to know. A Method that does not fit what is on the canvas stays here, greyed, with the reason. The Takeaway is worded and held to the same rules as a Recipe&rsquo;s.</p>
      {failed && <p role="alert" className="text-xs text-destructive">The list could not be loaded. Try again in a moment.</p>}
      {list?.notice && <p role="note" className="text-xs text-muted-foreground">{list.notice}</p>}
      {!list && !failed && <p className="text-xs text-muted-foreground">Loading the list…</p>}
      {list && <PickerGroups list={list} openId={openId} onPick={(id) => setOpenId((cur) => (cur === id ? null : id))} ask={(e) => <Open key={`${e.id}:${list.key}`} entry={e} list={list} />} />}
    </section>
  );
}
