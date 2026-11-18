"use client";
// Using a Widget Template: pick the metrics for each slot (GLOSSARY: Slot). One metric per slot, or one or more for a
// slot drawn as small multiples. Team templates and built-in ones ask the same way; once every slot is filled, a
// Preview shows the widget with the chosen metrics before it is placed (spec 0011).
import { useCallback, useRef, useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fillsComplete, fromTemplate } from "@ziffr/core/team-templates";
import { templateOf } from "@/views/templates";
import type { DropSource } from "@/app/canvas-actions";
import type { CanvasData, Slot, TeamTemplate, TemplateId, WidgetSettings, WidgetTemplate } from "@ziffr/core/types";
import { Preview } from "./preview";
import type { FrameWidget } from "./read-only-frame";

/** What the dialog asks for: a team template, or a built-in one by id. */
type Asked = { kind: "team"; t: WidgetTemplate } | { kind: "builtin"; id: TemplateId; settings?: WidgetSettings };
type Ask = { asked: Asked; fills: number[][]; resolve: (f: number[][] | null) => void };

// A built-in template, or a Workspace's View Design (its Slots come from the design it carries).
const builtin = (a: Extract<Asked, { kind: "builtin" }>) => templateOf({ template: a.id, settings: a.settings ?? {} });
const slotsOf = (a: Asked): Slot[] => (a.kind === "team" ? a.t.slots : builtin(a).slots);

/** The widget the chosen metrics make, and its size in grid cells. */
function made(a: Asked, fills: number[][]): { widget: FrameWidget; size: { w: number; h: number } } {
  if (a.kind === "team") return { widget: fromTemplate(a.t, fills), size: { w: a.t.w, h: a.t.h } };
  const t = builtin(a);
  return { widget: { template: a.id, metric_ids: fills.flat(), settings: { ...t.settings, ...(a.settings ?? {}) }, title: null }, size: t.size };
}

/** Returns a dialog to render and ask(): the fills for a template, or null when cancelled. */
export function useSlotFill(data: CanvasData) {
  const [state, setState] = useState<Ask | null>(null);
  const ref = useRef(state);
  ref.current = state;

  const open = useCallback((asked: Asked, initial: number[] = []) => new Promise<number[][] | null>((resolve) => {
    // Start from the metrics at hand (the widget being changed) in slot order.
    // One-metric slots take the first metrics in order; "one or more" slots take the rest.
    const slots = slotsOf(asked);
    const queue = initial.filter((id) => data.metrics.some((m) => m.id === id));
    const fills = slots.map((s) => (s.multiple ? [] : queue.length ? [queue.shift()!] : []));
    const multi = slots.findIndex((s) => s.multiple);
    if (multi >= 0) fills[multi] = queue;
    setState({ asked, fills, resolve });
  }), [data.metrics]);

  /** Asks for a team template's slots. */
  const ask = useCallback((t: TeamTemplate, initial: number[] = []) => (t.kind === "widget" ? open({ kind: "team", t }, initial) : Promise.resolve(null)), [open]);

  /** A Pool drop, with the slots filled in when it is a template: a team one, or a built-in one without metrics yet. */
  const complete = useCallback(async (s: DropSource): Promise<DropSource | null> => {
    if (s.type === "spec" && s.metricIds.length === 0 && templateOf({ template: s.template, settings: s.settings ?? {} }).slots.length) {
      const fills = await open({ kind: "builtin", id: s.template, settings: s.settings });
      return fills ? { ...s, metricIds: fills.flat() } : null;
    }
    if (s.type !== "template" || s.fills) return s;
    const t = data.templates.find((x) => x.id === s.id);
    if (!t || t.kind !== "widget") return null;
    const fills = await open({ kind: "team", t });
    return fills ? { ...s, fills } : null;
  }, [open, data.templates]);

  const close = (f: number[][] | null) => {
    ref.current?.resolve(f);
    setState(null);
  };

  // Only names of metrics this viewer can see.
  const example = (ids?: number[]) => (ids ?? []).map((id) => data.metrics.find((m) => m.id === id)?.name).filter(Boolean).join(", ");
  const slots = state ? slotsOf(state.asked) : [];
  const ready = !!state && fillsComplete(slots, state.fills);
  const name = state && (state.asked.kind === "team" ? state.asked.t.name : builtin(state.asked).label);
  const description = state && (state.asked.kind === "team" ? state.asked.t.description : builtin(state.asked).blurb);
  // The Preview draws metrics the viewer picked from those the page has: nothing they could not place anyway.
  const preview = state && ready ? made(state.asked, state.fills) : null;
  const dialog = state && (
    <Dialog open onOpenChange={(o) => { if (!o) close(null); }}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2"><LayoutTemplate aria-hidden className="size-4" /> {name}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) close(state.fills);
          }}
        >
          {slots.map((slot, i) => (
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
          {preview && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Preview</p>
              <div className="flex justify-center rounded-[var(--radius-card)] bg-[var(--color-paper-2)] p-2">
                <Preview widget={preview.widget} data={data} size={preview.size} width={380} />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => close(null)}>Cancel</Button>
            <Button type="submit" disabled={!ready}>{state.asked.kind === "team" ? "Use template" : "Add"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  return { ask, complete, dialog };
}
