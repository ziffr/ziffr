"use client";
// Using a Widget Template: pick the metrics for each slot (GLOSSARY: Slot). One metric per slot, or one or more for a
// slot drawn as small multiples. Team templates and built-in ones ask the same way; once every slot is filled, a
// Preview shows the widget with the chosen metrics before it is placed (spec 0011). It is drawn in the side panel (spec 0050).
import { useCallback, useRef, useState } from "react";
import { inUse } from "@ziffr/core/metric-row";
import { Button } from "@/components/ui/button";
import { fillsComplete, fromTemplate } from "@ziffr/core/team-templates";
import { templateOf } from "@/views/templates";
import type { DropSource } from "@/app/canvas-actions";
import type { CanvasData, Slot, TeamTemplate, TemplateId, WidgetSettings, WidgetTemplate } from "@ziffr/core/types";
import { useBoxSize } from "@/views/use-box-size";
import { Preview } from "./preview";
import { SlideOverWindow } from "./slide-over-window";
import { SlotFills } from "./slot-fills";
import type { FrameWidget } from "./read-only-frame";

/** What the dialog asks for: a team template, or a built-in one by id. */
type Asked = { kind: "team"; t: WidgetTemplate } | { kind: "builtin"; id: TemplateId; settings?: WidgetSettings };
type Ask = { id: number; asked: Asked; fills: number[][]; resolve: (f: number[][] | null) => void };

// A built-in template, or a Workspace's View Design (its Slots come from the design it carries).
const builtin = (a: Extract<Asked, { kind: "builtin" }>) => templateOf({ template: a.id, settings: a.settings ?? {} });
const slotsOf = (a: Asked): Slot[] => (a.kind === "team" ? a.t.slots : builtin(a).slots);

/** The widget the chosen metrics make, and its size in grid cells. */
function made(a: Asked, fills: number[][]): { widget: FrameWidget; size: { w: number; h: number } } {
  if (a.kind === "team") return { widget: fromTemplate(a.t, fills), size: { w: a.t.w, h: a.t.h } };
  const t = builtin(a);
  return { widget: { template: a.id, metric_ids: fills.flat(), settings: { ...t.settings, ...(a.settings ?? {}) }, title: null }, size: t.size };
}

/** Returns a window to render (it opens the side panel) and ask(): the fills for a template, or null when cancelled. */
export function useSlotFill(data: CanvasData) {
  const [state, setState] = useState<Ask | null>(null);
  const asks = useRef(0);

  const open = useCallback((asked: Asked, initial: number[] = []) => new Promise<number[][] | null>((resolve) => {
    // Start from the metrics at hand (the widget being changed) in slot order.
    // One-metric slots take the first metrics in order; "one or more" slots take the rest.
    const slots = slotsOf(asked);
    const queue = initial.filter((id) => data.metrics.some((m) => m.id === id));
    const fills = slots.map((s) => (s.multiple ? [] : queue.length ? [queue.shift()!] : []));
    const multi = slots.findIndex((s) => s.multiple);
    if (multi >= 0) fills[multi] = queue;
    setState({ id: ++asks.current, asked, fills, resolve });
  }), [data.metrics]);

  /** Asks for a team template's slots. */
  const ask = useCallback((t: TeamTemplate, initial: number[] = []) => (t.kind === "widget" ? open({ kind: "team", t }, initial) : Promise.resolve(null)), [open]);

  /** A Pool drop, with the slots filled in when it is a template: a team one, or a built-in one without metrics yet. `initial` are Metrics to start the slots from. */
  const complete = useCallback(async (s: DropSource, initial: number[] = []): Promise<DropSource | null> => {
    if (s.type === "spec" && s.metricIds.length === 0 && templateOf({ template: s.template, settings: s.settings ?? {} }).slots.length) {
      const fills = await open({ kind: "builtin", id: s.template, settings: s.settings }, initial);
      return fills ? { ...s, metricIds: fills.flat() } : null;
    }
    if (s.type !== "template" || s.fills) return s;
    const t = data.templates.find((x) => x.id === s.id);
    if (!t || t.kind !== "widget") return null;
    const fills = await open({ kind: "team", t }, initial);
    return fills ? { ...s, fills } : null;
  }, [open, data.templates]);

  // Resolves this question once (a promise ignores a second answer: Cancel, then the panel closing, both end here).
  const finish = (ask: Ask, f: number[][] | null) => {
    ask.resolve(f);
    setState((s) => (s === ask ? null : s));
  };
  const dialog = state && (
    <SlideOverWindow
      key={state.id}
      title={(state.asked.kind === "team" ? state.asked.t.name : builtin(state.asked).label) || "Use this template"}
      description={(state.asked.kind === "team" ? state.asked.t.description : builtin(state.asked).blurb) || undefined}
      onClose={() => finish(state, null)}
    >
      <SlotForm asked={state.asked} initial={state.fills} data={data} onDone={(f) => finish(state, f)} />
    </SlideOverWindow>
  );

  return { ask, complete, dialog };
}

/** The questions in the panel: which Metrics fill each Slot, and the Preview once all are filled. Holds the choices itself, as the panel reads its content once. */
function SlotForm({ asked, initial, data, onDone }: { asked: Asked; initial: number[][]; data: CanvasData; onDone: (f: number[][] | null) => void }) {
  const [fills, setFills] = useState(initial);
  const slots = slotsOf(asked);
  const ready = fillsComplete(slots, fills);
  // Only names of metrics this viewer can see.
  const example = (ids?: number[]) => (ids ?? []).map((id) => data.metrics.find((m) => m.id === id)?.name).filter(Boolean).join(", ");
  // The Preview draws metrics the viewer picked from those the page has: nothing they could not place anyway.
  const preview = ready ? made(asked, fills) : null;
  return (
    <form
      className="min-w-0 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onDone(fills);
      }}
    >
      <SlotFills slots={slots} metrics={inUse(data.metrics)} fills={fills} onChange={setFills} original={(i) => example(slots[i].exampleIds)} />
      {preview && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Preview</p>
          <PreviewBox widget={preview.widget} data={data} size={preview.size} />
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={() => onDone(null)}>Cancel</Button>
        <Button type="submit" disabled={!ready}>{asked.kind === "team" ? "Use template" : "Add"}</Button>
      </div>
    </form>
  );
}

/** How wide the Preview is drawn in a frame `w` px wide: as wide as the frame allows (up to 380 px), 280 px until the frame is measured. */
export function previewWidth(w: number) {
  return w > 0 ? Math.max(160, Math.min(380, w - 16)) : 280;
}

/** The Preview in a frame, drawn as wide as the panel allows: a fixed width would push the panel's whole column wider than the panel on a narrow screen. */
function PreviewBox(props: Omit<React.ComponentProps<typeof Preview>, "width">) {
  const [box, { w }] = useBoxSize<HTMLDivElement>();
  return (
    <div ref={box} className="flex min-w-0 justify-center overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-paper-2)] p-2">
      <Preview {...props} width={previewWidth(w)} />
    </div>
  );
}
