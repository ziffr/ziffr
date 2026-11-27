"use client";
// The Analysis Canvas itself (GLOSSARY: Analysis Canvas; the owner's words of 2026-11-27): the large drop area at the top of the page.
// With Metrics on it, their chips with the one to explain, and "Add a Metric" and "Pick a question" at its top right. Empty, it tells a
// person what to do in three numbered steps, with one button, "Add a Metric", and a quiet "See an example", so nobody arrives not
// knowing what the page is for.
import { useState } from "react";
import { FlaskConical, Plus, Trash2, Wand2 } from "lucide-react";
import type { Metric } from "@ziffr/core/types";
import { getDrag, setDrag } from "@/lib/drag";
import type { DropSource } from "@/app/canvas-actions";
import { cn } from "@/lib/utils";
import { CanvasChips } from "./canvas-chips";

/** Which list the panel at the side of the canvas shows. */
export type CanvasPanel = "metrics" | "methods";

/** The three steps of an empty canvas, in words. */
const STEPS = ["Add a Metric.", "Pick a question.", "Read the answer."] as const;

const BUTTON = "flex min-h-11 items-center gap-2 rounded-[var(--radius-stock)] px-4 text-sm font-medium sm:min-h-10";
const PRIMARY = cn(BUTTON, "bg-primary text-primary-foreground hover:opacity-90");
const SECONDARY = cn(BUTTON, "border border-[var(--color-rule-2)] bg-card hover:bg-muted");

/** What a button that opens a panel says about it. `data-opens` is how the focus finds its way back to it. */
type Opens = (kind: CanvasPanel) => { type: "button"; "data-opens": CanvasPanel; "aria-expanded": boolean; "aria-haspopup": "dialog" | undefined; onClick: () => void };

function EmptyCanvas({ opens, onExample }: { opens: Opens; onExample?: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-10">
      <ol className="space-y-2 text-left text-sm" aria-label="How it works">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-start gap-3">
            <span aria-hidden className="fig flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--color-rule-2)] text-xs">{i + 1}</span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      <button {...opens("metrics")} className={cn(PRIMARY, "mt-6")}><Plus aria-hidden className="size-4" /> Add a Metric</button>
      {onExample && <button type="button" onClick={onExample} className="mt-2 min-h-11 px-3 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground sm:min-h-10">See an example</button>}
    </div>
  );
}

/** The canvas: a drop area for Metrics from the Pool (a drag or the + there), their chips, and the empty state. */
export function CanvasBoard({ ms, explainedId, pending, panel, docked, onPanel, onExample, onDrop, onClear, onExplain, onRemove }: { ms: Metric[]; explainedId: number | null; pending: boolean; /** The panel that is open. */ panel: CanvasPanel | null; /** The panel stands beside the canvas instead of covering the page. */ docked: boolean; /** A button asked for a panel. */ onPanel: (kind: CanvasPanel) => void; /** Absent when there is no example to show. */ onExample?: () => void; onDrop: (s: DropSource | null) => void; onClear: () => void; onExplain: (id: number) => void; onRemove: (id: number) => void }) {
  const opens: Opens = (kind) => ({ type: "button", "data-opens": kind, "aria-expanded": panel === kind, "aria-haspopup": docked ? undefined : "dialog", onClick: () => onPanel(kind) });
  const [over, setOver] = useState(false);
  const n = ms.length;
  return (
    <div
      data-canvas
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        let s = getDrag();
        try { s = JSON.parse(e.dataTransfer.getData("text/plain")); } catch {}
        setDrag(null);
        onDrop(s);
      }}
      className={cn("desk min-h-72 rounded-[var(--radius-card)] p-4 outline-2 -outline-offset-2", over ? "outline-dashed outline-[var(--color-ink-2)]" : "outline-transparent")}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-medium">
        <FlaskConical className="size-4 text-primary" /> Analysis canvas
        <span className="fig font-normal text-muted-foreground">{n}</span><span className="font-normal text-muted-foreground">metric{n === 1 ? "" : "s"}</span>
        {n > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={onClear} className="flex min-h-11 items-center gap-1 rounded-[var(--radius-input)] px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:min-h-10"><Trash2 aria-hidden className="size-3.5" /> Clear</button>
            <button {...opens("metrics")} className={SECONDARY}><Plus aria-hidden className="size-4" /> Add a Metric</button>
            <button {...opens("methods")} className={PRIMARY}><Wand2 aria-hidden className="size-4" /> Pick a question</button>
          </div>
        )}
      </div>
      {n === 0
        ? <EmptyCanvas opens={opens} onExample={onExample} />
        : <CanvasChips ms={ms} explainedId={explainedId} onExplain={onExplain} onRemove={onRemove} disabled={pending} />}
    </div>
  );
}
