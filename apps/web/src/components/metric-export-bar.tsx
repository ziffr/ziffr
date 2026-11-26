"use client";
// Ticking Metrics in the Metrics list and downloading their values (spec 0056; GLOSSARY: Metric). The checkboxes belong
// to the bar's form through their `form` attribute, so the page stays a server page and the download is a plain GET to
// /metric-values, which the core checks. Only slugs are sent; the server decides what is in the file.
import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** The id the checkboxes name in their `form` attribute. */
const FORM = "metrics-export";

const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="metric"][form="${FORM}"]`));

/** Ticks or unticks every Metric the list shows, then says so once, as a person's own tick does. */
function tickAll(on: boolean) {
  const all = boxes();
  all.forEach((b) => { b.checked = on; });
  all[0]?.dispatchEvent(new Event("change", { bubbles: true }));
}

/** What is ticked now: how many, out of how many shown, and the names of the ticked Derived Metrics. Counted again when
 * a box changes and when `list` does, that is when a filter changes which rows are shown. */
function useTicks(list: string) {
  const [ticks, setTicks] = useState<{ picked: number; shown: number; derived: string[] }>({ picked: 0, shown: 0, derived: [] });
  useEffect(() => {
    const count = () => {
      const all = boxes();
      const ticked = all.filter((b) => b.checked);
      setTicks({ picked: ticked.length, shown: all.length, derived: ticked.flatMap((b) => b.dataset.derived ?? []) });
    };
    count();
    // Ticks are made in the list, outside these components: listen where they bubble to.
    document.addEventListener("change", count);
    return () => document.removeEventListener("change", count);
  }, [list]);
  return ticks;
}

/** One row's checkbox, 44 px to press. `derived` marks a Derived Metric, which the bar says has no values of its own. */
export function MetricTick({ slug, name, derived }: { slug: string; name: string; derived: boolean }) {
  return (
    <label className="flex size-11 cursor-pointer items-center justify-center">
      <input type="checkbox" name="metric" value={slug} form={FORM} data-derived={derived ? name : undefined} aria-label={`Select ${name}`} className="size-4" />
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
  const count = picked > max ? `${picked} selected. One download holds at most ${max} Metrics: untick some and download them in parts.` : `${picked} selected`;
  if (!derived.length) return { count, note: "" };
  const note = derived.length === 1 ? `${derived[0]} is worked out from other Metrics and has no values of its own.` : `${derived.length} of them are worked out from other Metrics and have no values of their own.`;
  return { count, note };
}

/** The bar that appears at the foot of the screen when something is ticked: how many, "Download values" and "Clear";
 * `max` is the most one download holds. Its form and its status line are always there, only out of sight, so a screen
 * reader hears the count when the first Metric is ticked. */
export function MetricExportBar({ max, list }: { max: number; list: string }) {
  const { picked, shown, derived } = useTicks(list);
  const { count, note } = words(picked, derived, max);
  const link = "min-h-11 px-1 text-sm underline";
  return (
    <form id={FORM} method="get" action="/metric-values" className={picked === 0 ? "sr-only" : "stock sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-card)] p-3 text-sm shadow-lg md:bottom-3"}>
      <span role="status" className="min-w-0">
        <span className="font-medium">{count}</span>
        {note && <span className="block text-muted-foreground">{note}</span>}
      </span>
      <span className="ml-auto flex flex-wrap items-center justify-end gap-x-3">
        {/* On a phone the table head, and its "Select all" box, are not shown. */}
        {picked < shown && <button type="button" onClick={() => tickAll(true)} className={`${link} sm:hidden`}>Select all</button>}
        <button type="button" onClick={() => { tickAll(false); boxes()[0]?.focus(); }} className={link}>Clear</button>
        {/* Always the form's button, also while disabled: Enter on a checkbox never sends an empty or too long list. */}
        <Button type="submit" disabled={picked === 0 || picked > max}>
          <Download aria-hidden /> Download values
        </Button>
      </span>
    </form>
  );
}
