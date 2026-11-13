"use client";
// Using a team template: pick the metrics for each slot (GLOSSARY: Slot). One metric per slot,
// or one or more for a slot drawn as small multiples.
import { useCallback, useRef, useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fillsComplete } from "@ziffr/core/team-templates";
import type { DropSource } from "@/app/canvas-actions";
import type { CanvasData, TeamTemplate } from "@ziffr/core/types";

type Ask = { t: TeamTemplate; fills: number[][]; resolve: (f: number[][] | null) => void };

/** Returns a dialog to render and ask(): the fills for a template, or null when cancelled. */
export function useSlotFill(data: CanvasData) {
  const [state, setState] = useState<Ask | null>(null);
  const ref = useRef(state);
  ref.current = state;

  const ask = useCallback((t: TeamTemplate, initial: number[] = []) => new Promise<number[][] | null>((resolve) => {
    // Start from the metrics at hand (the widget being changed) in slot order.
    // One-metric slots take the first metrics in order; "one or more" slots take the rest.
    const queue = initial.filter((id) => data.metrics.some((m) => m.id === id));
    const fills = t.slots.map((s) => (s.multiple ? [] : queue.length ? [queue.shift()!] : []));
    const multi = t.slots.findIndex((s) => s.multiple);
    if (multi >= 0) fills[multi] = queue;
    setState({ t, fills, resolve });
  }), [data.metrics]);

  /** A Pool drop, with the slots filled in when it is a template. */
  const complete = useCallback(async (s: DropSource): Promise<DropSource | null> => {
    if (s.type !== "template" || s.fills) return s;
    const t = data.templates.find((x) => x.id === s.id);
    if (!t || t.kind !== "widget") return null;
    const fills = await ask(t);
    return fills ? { ...s, fills } : null;
  }, [ask, data.templates]);

  const close = (f: number[][] | null) => {
    ref.current?.resolve(f);
    setState(null);
  };

  // Only names of metrics this viewer can see.
  const example = (ids?: number[]) => (ids ?? []).map((id) => data.metrics.find((m) => m.id === id)?.name).filter(Boolean).join(", ");
  const dialog = state && (
    <Dialog open onOpenChange={(o) => { if (!o) close(null); }}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2"><LayoutTemplate aria-hidden className="size-4" /> {state.t.name}</DialogTitle>
        {state.t.description && <DialogDescription>{state.t.description}</DialogDescription>}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (fillsComplete(state.t.slots, state.fills)) close(state.fills);
          }}
        >
          {state.t.slots.map((slot, i) => (
            <fieldset key={i} className="space-y-1">
              <legend className="text-sm font-medium">{slot.label}{slot.multiple && <span className="font-normal text-muted-foreground">, one or more</span>}</legend>
              {example(slot.exampleIds) && <p className="text-xs text-muted-foreground">In the original: {example(slot.exampleIds)}</p>}
              {slot.multiple ? (
                <ul className="max-h-44 space-y-0.5 overflow-y-auto rounded-[var(--radius-input)] border border-input p-1.5">
                  {data.metrics.map((m) => {
                    const on = state.fills[i]?.includes(m.id);
                    return (
                      <li key={m.id}>
                        <label className="flex min-h-8 items-center gap-2 rounded px-1.5 text-sm hover:bg-muted">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => setState({ ...state, fills: state.fills.map((f, j) => (j === i ? (on ? f.filter((x) => x !== m.id) : [...f, m.id]) : f)) })}
                          />
                          {m.name}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <select
                  aria-label={slot.label}
                  value={state.fills[i]?.[0] ?? ""}
                  onChange={(e) => setState({ ...state, fills: state.fills.map((f, j) => (j === i ? (e.target.value ? [Number(e.target.value)] : []) : f)) })}
                  className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm"
                >
                  <option value="">Choose a metric</option>
                  {data.metrics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
            </fieldset>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => close(null)}>Cancel</Button>
            <Button type="submit" disabled={!fillsComplete(state.t.slots, state.fills)}>Use template</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  return { ask, complete, dialog };
}
