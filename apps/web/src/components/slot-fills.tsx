"use client";
// Filling a template's Slots (GLOSSARY: Slot, Dashboard Template, Deck Template): a Metric for each, or one or more for
// a Slot of several. Only offers the Metrics the page sent, which the core decided this person sees; the core checks
// every one again when the template is used.
import type { Slot } from "@ziffr/core/types";

/** One field per Slot: a list to pick one Metric from, or boxes to tick for a Slot of several. */
export function SlotFills({ slots, metrics, fills, onChange, original, tags = [], tagFillable = [], tagFills = [], onTagFills }: {
  slots: Pick<Slot, "label" | "multiple">[]; metrics: { id: number; name: string }[]; fills: number[][]; onChange: (fills: number[][]) => void;
  /** The names of the Metrics a Slot was made with, as far as the person sees them: shown as "In the original: …". */
  original?: (slot: number) => string;
  /** The Tags this person sees, and which Slots one may fill ("All Metrics tagged…", GLOSSARY: Tag); the choice per Slot. */
  tags?: { id: string; name: string }[]; tagFillable?: boolean[]; tagFills?: (string | null)[]; onTagFills?: (tags: (string | null)[]) => void;
}) {
  const setFills = onChange;
  return (
    <>
    {slots.map((slot, i) => (
      <fieldset key={i} className="space-y-1">
        <legend className="text-sm font-medium">{slot.label}{slot.multiple && <span className="font-normal text-muted-foreground">, one or more</span>}</legend>
        {original?.(i) && <p className="text-xs text-muted-foreground">In the original: {original(i)}</p>}
        {slot.multiple && onTagFills && tagFillable[i] && tags.length > 0 && (
          <select
            aria-label={`${slot.label}: which Metrics`}
            value={tagFills[i] ?? ""}
            onChange={(e) => onTagFills(slots.map((_, j) => (j === i ? e.target.value || null : tagFills[j] ?? null)))}
            className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm"
          >
            <option value="">Pick Metrics by hand</option>
            {tags.map((t) => <option key={t.id} value={t.id}>All Metrics tagged {t.name}</option>)}
          </select>
        )}
        {tagFills[i] ? (
          <p className="text-sm text-muted-foreground">Shows every Metric with this Tag that the person looking may see. A Metric tagged later appears by itself.</p>
        ) : slot.multiple ? (
          <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-[var(--radius-input)] border border-input p-1.5">
            {metrics.map((m) => {
              const on = fills[i]?.includes(m.id) ?? false;
              return (
                <li key={m.id}>
                  <label className="flex min-h-8 items-center gap-2 rounded px-1.5 text-sm hover:bg-muted">
                    <input type="checkbox" checked={on} onChange={() => setFills(fills.map((f, j) => (j === i ? (on ? f.filter((x) => x !== m.id) : [...f, m.id]) : f)))} />
                    {m.name}
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <select
            aria-label={slot.label}
            value={fills[i]?.[0] ?? ""}
            onChange={(e) => setFills(fills.map((f, j) => (j === i ? (e.target.value ? [Number(e.target.value)] : []) : f)))}
            className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm"
          >
            <option value="">Choose a metric</option>
            {metrics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </fieldset>
    ))}
    </>
  );
}
