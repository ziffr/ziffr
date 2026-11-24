"use client";
// The results of the Analysis Canvas (GLOSSARY: Analysis Canvas, Method, Takeaway; spec 0041): what a Method worked out, shown directly
// under the canvas and not in the side panel, so the Metrics and their answer are read together. The newest comes first; the last three
// are kept on the page (older ones are not, and nothing is saved until the person saves it as a widget). Each is a collapsible region
// titled with its question and the Metrics it is about. Above the Takeaway sits a reserved place for the chart of the result (the next
// ticket draws into it). A result carries only what the core gave this person: the Takeaway and the ids and names of Metrics they see.
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { BookmarkPlus, ChevronDown, FileDown } from "lucide-react";
import type { EntryView, PickerRun } from "@ziffr/core/analysis-picker";
import { TakeawayView } from "@/components/takeaway-view";
import { saveToPool } from "@/app/canvas-actions";
import { told } from "@/lib/action-toast";
import { TEMPLATES } from "@/views/templates";
import { cn } from "@/lib/utils";

/** A result the core gave. */
export type Done = Extract<PickerRun, { ok: true }>;
/** One result on the page: the entry, its question in the Metrics' words, the names of the Metrics it is about, and the answer. */
export type ResultItem = { key: number; entry: EntryView; title: string; about: string[]; done: Done };

/** How many results stay under the canvas. */
export const KEPT_RESULTS = 3;

/** The new result first, then the ones before it, no more than `KEPT_RESULTS`. */
export function addResult(list: ResultItem[], next: ResultItem): ResultItem[] {
  return [next, ...list].slice(0, KEPT_RESULTS);
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** What can be done with a result: save it as a widget, or take it as a recipe file. Said plainly where it cannot be. */
function ResultActions({ item, pending, save }: { item: ResultItem; pending: boolean; save: () => void }) {
  const { done, entry } = item;
  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      <div className="flex flex-wrap gap-2">
        {done.widget && <button type="button" disabled={pending} onClick={save} className="stock flex min-h-9 items-center gap-1.5 rounded-[var(--radius-stock)] px-3 text-sm text-foreground disabled:opacity-50"><BookmarkPlus className="size-3.5" /> Save as widget</button>}
        {done.recipe && (
          <button type="button" onClick={() => download(`${entry.id}.analysis.json`, `${JSON.stringify(done.recipe, null, 2)}\n`)} className="stock flex min-h-9 items-center gap-1.5 rounded-[var(--radius-stock)] px-3 text-sm text-foreground"><FileDown className="size-3.5" /> Download as Analysis Recipe</button>
        )}
      </div>
      {!done.widget && <p>This result cannot be saved as a widget yet.</p>}
      {done.recipe
        ? <p>The Analysis Recipe is this Method with its Slots left open. An Owner or Admin can add it to the Workspace from the Playground, and export it in a Pack under Settings.</p>
        : <p>This Method is not an Analysis Recipe yet, so it has no file to take away.</p>}
    </div>
  );
}

function ResultCard({ item, focus }: { item: ResultItem; focus: boolean }) {
  const [open, setOpen] = useState(true);
  const [pending, start] = useTransition();
  const head = useRef<HTMLHeadingElement>(null);
  // The newest result gets focus and is scrolled to, so a person who asked from the panel lands on the answer.
  useEffect(() => {
    if (!focus) return;
    head.current?.focus({ preventScroll: true });
    head.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [focus]);
  const save = () => {
    const { done, title } = item;
    const template = done.widget!.template;
    const name = window.prompt("Save to your widgets as:", title);
    if (!name) return;
    start(async () => {
      const settings = { ...TEMPLATES[template].settings, ...(done.widget!.showTarget ? { showTarget: true } : {}) };
      const res = await saveToPool({ type: "spec", template, metricIds: done.widget!.metricIds, settings }, name);
      if (!told(res, "Not saved")) toast.success("Saved to My Widgets", { description: "Drag it from the Pool onto any dashboard." });
    });
  };
  const body = `result-${item.key}`;
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-rule-2)] bg-card" aria-label={`Result: ${item.title}`}>
      <h3 ref={head} tabIndex={-1} className="m-0 text-sm font-medium outline-none">
        <button type="button" aria-expanded={open} aria-controls={body} onClick={() => setOpen((o) => !o)} className="flex w-full min-w-0 items-start gap-2 p-3 text-left">
          <ChevronDown aria-hidden className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          <span className="min-w-0 flex-1">
            <span dir="auto" className="block break-words">{item.title}</span>
            {item.about.length > 0 && <span dir="auto" className="block break-words text-xs font-normal text-muted-foreground">About {item.about.join(", ")}</span>}
          </span>
        </button>
      </h3>
      <div id={body} hidden={!open} className="space-y-3 px-3 pb-3">
        {/* The chart of this result goes here, above the Takeaway (the next ticket); empty until then, and it takes no room. */}
        <div data-result-chart />
        <TakeawayView takeaway={item.done.takeaway} />
        <ResultActions item={item} pending={pending} save={save} />
      </div>
    </section>
  );
}

/** The results under the canvas, newest first, each collapsible. Nothing is drawn until there is one. */
export function Results({ items }: { items: ResultItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-3" role="region" aria-label="Results">
      <h2 className="text-sm font-semibold">{items.length === 1 ? "Result" : `Results (the last ${items.length}, newest first)`}</h2>
      {items.map((item, i) => <ResultCard key={item.key} item={item} focus={i === 0} />)}
    </div>
  );
}
