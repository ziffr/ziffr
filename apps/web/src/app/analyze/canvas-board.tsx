"use client";
// The Analysis Canvas itself (GLOSSARY: Analysis Canvas; the owner's words of 2026-11-24): the large drop area at the top of the page.
// With Metrics on it, their chips with the one to explain. Empty, it tells a person what to do in three numbered steps and offers one
// question to click (`example`, which the page derived from the picker's own list), so nobody arrives not knowing what the page is for.
import { useState } from "react";
import { FlaskConical, Sparkles, Trash2 } from "lucide-react";
import type { Metric } from "@ziffr/core/types";
import { getDrag, setDrag } from "@/lib/drag";
import type { DropSource } from "@/app/canvas-actions";
import { cn } from "@/lib/utils";
import { CanvasChips } from "./canvas-chips";
import type { Example } from "./example";

/** The three steps of an empty canvas, in words. */
const STEPS = ["Drop Metrics here (or click + in the Pool).", "Pick a question.", "Read the answer."] as const;

function EmptyCanvas({ example, onExample }: { example: Example | null; onExample: (e: Example) => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center">
      <ol className="space-y-2 text-left text-sm" aria-label="How it works">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-start gap-3">
            <span aria-hidden className="fig flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--color-rule-2)] text-xs">{i + 1}</span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      {example && (
        <button type="button" onClick={() => onExample(example)} className="stock flex min-h-10 items-center gap-2 rounded-[var(--radius-stock)] px-4 text-sm">
          <Sparkles aria-hidden className="size-4 text-primary" /> <span><span className="text-muted-foreground">Try:</span> <span dir="auto" className="font-medium">{example.title}</span></span>
        </button>
      )}
    </div>
  );
}

/** The canvas: a drop area for Metrics from the Pool (a drag or the + there), their chips, and the empty state. */
export function CanvasBoard({ ms, explainedId, example, pending, onDrop, onClear, onExplain, onRemove, onExample }: { ms: Metric[]; explainedId: number | null; example: Example | null; pending: boolean; onDrop: (s: DropSource | null) => void; onClear: () => void; onExplain: (id: number) => void; onRemove: (id: number) => void; onExample: (e: Example) => void }) {
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
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <FlaskConical className="size-4 text-primary" /> Analysis canvas
        <span className="fig font-normal text-muted-foreground">{n}</span><span className="font-normal text-muted-foreground">metric{n === 1 ? "" : "s"}</span>
        {n > 0 && <button onClick={onClear} className="ml-auto flex min-h-8 items-center gap-1 rounded-[var(--radius-input)] px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><Trash2 className="size-3.5" /> Clear</button>}
      </div>
      {n === 0
        ? <EmptyCanvas example={example} onExample={onExample} />
        : <CanvasChips ms={ms} explainedId={explainedId} onExplain={onExplain} onRemove={onRemove} disabled={pending} />}
    </div>
  );
}
