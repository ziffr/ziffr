"use client";
// Ticking Metrics in the Metrics list to download their values (spec 0056), to delete them (spec 0065) or to say when
// they ask for a note (spec 0064; GLOSSARY: Metric). The checkboxes belong to the bar's form through their `form` attribute, so the page stays a server page and
// the download is a plain GET to /metric-values, which the core checks. Only slugs and ids are sent; the server decides
// what is in the file and what may be deleted.
import { Download, MessageSquarePlus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AskNoteMetrics } from "@/components/ask-note-metrics";
import { DeleteMetrics } from "@/components/delete-metrics";
import { Button } from "@/components/ui/button";
import { ASK_NOTE_MANY } from "@ziffr/core/ask-note";

/** The id the checkboxes name in their `form` attribute. */
const FORM = "metrics-export";

const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="metric"][form="${FORM}"]`));

/** Ticks or unticks every Metric the list shows, then says so once, as a person's own tick does. */
function tickAll(on: boolean) {
  const all = boxes();
  all.forEach((b) => { b.checked = on; });
  all[0]?.dispatchEvent(new Event("change", { bubbles: true }));
}

/** What is ticked now: how many, out of how many shown, their ids, and the names of the ticked Derived Metrics.
 * Counted again when a box changes and when `list` does, that is when a filter changes which rows are shown. */
function useTicks(list: string) {
  const [ticks, setTicks] = useState<{ picked: number; shown: number; ids: number[]; derived: string[] }>({ picked: 0, shown: 0, ids: [], derived: [] });
  useEffect(() => {
    const count = () => {
      const all = boxes();
      const ticked = all.filter((b) => b.checked);
      setTicks({ picked: ticked.length, shown: all.length, ids: ticked.map((b) => Number(b.dataset.id)), derived: ticked.flatMap((b) => b.dataset.derived ?? []) });
    };
    count();
    // Ticks are made in the list, outside these components: listen where they bubble to.
    document.addEventListener("change", count);
    return () => document.removeEventListener("change", count);
  }, [list]);
  return ticks;
}

/** One row's checkbox, 44 px to press. `derived` marks a Derived Metric, which the bar says has no values of its own. */
export function MetricTick({ id, slug, name, derived }: { id: number; slug: string; name: string; derived: boolean }) {
  return (
    <label className="flex size-11 cursor-pointer items-center justify-center">
      <input type="checkbox" name="metric" value={slug} form={FORM} data-id={id} data-derived={derived ? name : undefined} aria-label={`Select ${name}`} className="size-4" />
    </label>
  );
}

/** The box in the table head that ticks every Metric the list shows; half ticked while only some are. */
export function SelectAllMetrics({ list }: { list: string }) {
  const { picked, shown } = useTicks(list);
  return (
    <label className="flex size-11 cursor-pointer items-center justify-center">
      <input type="checkbox" aria-label="Select all" className="size-4" checked={shown > 0 && picked === shown} ref={(el) => { if (el) el.indeterminate = picked > 0 && picked < shown; }} onChange={(e) => tickAll(e.target.checked)} />
    </label>
  );
}

/** What the bar says: how many are selected, whether that is too many for one file, and which add no values. */
function words(picked: number, derived: string[], max: number) {
  if (picked === 0) return { count: "", note: "" };
  const count = picked > max ? `${picked} selected. One download or deletion holds at most ${max} Metrics: untick some and do it in parts.` : `${picked} selected`;
  if (!derived.length) return { count, note: "" };
  const note = derived.length === 1 ? `${derived[0]} is worked out from other Metrics and has no values of its own.` : `${derived.length} of them are worked out from other Metrics and have no values of their own.`;
  return { count, note };
}

/** The bar that appears at the foot of the screen when something is ticked: how many, "Ask for a note…" and "Delete…"
 * (for who may create, so never a Guest), "Download values" and "Clear"; `max` is the most one download or deletion
 * holds. Its form and its
 * status line are always there, only out of sight, so a screen reader hears the count when the first Metric is ticked. */
export function MetricExportBar({ max, list, canDelete }: { max: number; list: string; canDelete: boolean }) {
  const { picked, shown, ids, derived } = useTicks(list);
  // The Metrics the dialog is about: taken when it opens, so the list changing under it does not change them.
  const [deleting, setDeleting] = useState<number[] | null>(null);
  const [asking, setAsking] = useState<number[] | null>(null);
  const { count, note } = words(picked, derived, max);
  const link = "min-h-11 min-w-11 px-1 text-sm underline";
  return (
    <>
    <form id={FORM} method="get" action="/metric-values" className={picked === 0 ? "sr-only" : "stock sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-card)] p-3 text-sm shadow-lg md:bottom-3"}>
      <span role="status" className="min-w-0">
        <span className="font-medium">{count}</span>
        {note && <span className="block text-muted-foreground">{note}</span>}
      </span>
      <span className="ml-auto flex flex-wrap items-center justify-end gap-x-3">
        {/* Nothing out of sight can be reached by keyboard: these two exist only while the bar shows, and the button
            below is disabled until then. On a phone the table head, and its "Select all" box, are not shown. */}
        {picked > 0 && picked < shown && <button type="button" onClick={() => tickAll(true)} className={`${link} sm:hidden`}>Select all</button>}
        {picked > 0 && <button type="button" onClick={() => { tickAll(false); boxes()[0]?.focus(); }} className={link}>Clear</button>}
        {picked > 0 && canDelete && (
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={picked > ASK_NOTE_MANY} onClick={() => setAsking(ids)}>
            <MessageSquarePlus aria-hidden /> Ask for a note…
          </Button>
        )}
        {picked > 0 && canDelete && (
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={picked > max} onClick={() => setDeleting(ids)}>
            <Trash2 aria-hidden /> Delete…
          </Button>
        )}
        {/* Always the form's button, also while disabled: Enter on a checkbox never sends an empty or too long list. */}
        <Button type="submit" className="min-h-11 sm:min-h-9" disabled={picked === 0 || picked > max}>
          <Download aria-hidden /> Download values
        </Button>
      </span>
    </form>
    {/* Outside the form: its fields and its Enter are not the download's. */}
    <AskNoteMetrics ids={asking} onClose={() => setAsking(null)} />
    <DeleteMetrics ids={deleting ?? []} open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }} onDeleted={() => tickAll(false)} />
    </>
  );
}
