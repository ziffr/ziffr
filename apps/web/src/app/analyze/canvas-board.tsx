"use client";
// The Analysis Canvas itself (GLOSSARY: Analysis Canvas; the owner's words of 2026-11-27): the large drop area at the top of the page.
// With Metrics on it, their chips with the one to explain, and "Pick a question" at its top right. Empty, it tells a person what to do
// in three numbered steps and nothing else, so nobody arrives not knowing what the page is for.
import { useState } from "react";
import { FlaskConical, Trash2, Wand2 } from "lucide-react";
import type { Metric } from "@ziffr/core/types";
import { getDrag, setDrag } from "@/lib/drag";
import type { DropSource } from "@/app/canvas-actions";
import { cn } from "@/lib/utils";
import { CanvasChips } from "./canvas-chips";

/** The three steps of an empty canvas, in words. */
const STEPS = ["Drop Metrics here (or click + in the Pool).", "Pick a question.", "Read the answer."] as const;

function EmptyCanvas() {
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
    </div>
  );
}

/** The canvas: a drop area for Metrics from the Pool (a drag or the + there), their chips, and the empty state. */
export function CanvasBoard({ ms, explainedId, pending, choosing, onPick, onDrop, onClear, onExplain, onRemove }: { ms: Metric[]; explainedId: number | null; pending: boolean; /** The Method picker is open. */ choosing: boolean; onPick: () => void; onDrop: (s: DropSource | null) => void; onClear: () => void; onExplain: (id: number) => void; onRemove: (id: number) => void }) {
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
            <button type="button" onClick={onPick} aria-expanded={choosing} aria-haspopup="dialog" className="flex min-h-11 items-center gap-2 rounded-[var(--radius-stock)] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 sm:min-h-10"><Wand2 aria-hidden className="size-4" /> Pick a question</button>
          </div>
        )}
      </div>
      {n === 0
        ? <EmptyCanvas />
        : <CanvasChips ms={ms} explainedId={explainedId} onExplain={onExplain} onRemove={onRemove} disabled={pending} />}
    </div>
  );
}
