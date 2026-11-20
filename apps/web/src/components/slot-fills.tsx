"use client";
// Filling a template's Slots (GLOSSARY: Slot, Dashboard Template, Deck Template): a Metric for each, or one or more for
// a Slot of several. Only offers the Metrics the page sent, which the core decided this person sees; the core checks
// every one again when the template is used.
import type { Slot } from "@ziffr/core/types";

/** One field per Slot: a list to pick one Metric from, or boxes to tick for a Slot of several. */
export function SlotFills({ slots, metrics, fills, onChange }: { slots: Pick<Slot, "label" | "multiple">[]; metrics: { id: number; name: string }[]; fills: number[][]; onChange: (fills: number[][]) => void }) {
  const setFills = onChange;
  return (
    <>
    {slots.map((slot, i) => (
      <fieldset key={i} className="space-y-1">
        <legend className="text-sm font-medium">{slot.label}{slot.multiple && <span className="font-normal text-muted-foreground">, one or more</span>}</legend>
        {slot.multiple ? (
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
