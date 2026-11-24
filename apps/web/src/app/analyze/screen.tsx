"use client";
// The Analysis Canvas (GLOSSARY: Analysis Canvas, Method; ticket #988): the Metrics a person drops on it, the one marked to explain, and
// "Choose a method", the one way to run an analysis: a list of questions fitted to what is on the canvas, with the Metric to explain
// already chosen. Nothing else runs an analysis here; a Method that is left out says so in the list.
import { useState, useTransition } from "react";
import { SeriesProvider, useCanvasSeries } from "@/canvas/series-store";
import { FlaskConical, Trash2, Wand2 } from "lucide-react";
import { Pool } from "@/components/pool";
import { canvasAdd, canvasExplain, canvasRemove, canvasSet, type DropSource } from "@/app/canvas-actions";
import { told } from "@/lib/action-toast";
import { getDrag, setDrag } from "@/lib/drag";
import type { CanvasData } from "@ziffr/core/types";
import { explainedOf, markAfterRemoval } from "@ziffr/core/canvas-roles";
import { CanvasChips } from "./canvas-chips";
import { MethodPicker } from "./method-picker";
import { cn } from "@/lib/utils";

type AnalyzeProps = { data: CanvasData; onCanvas: number[]; explained?: number | null; /** Open the list from the start (sent from a Metric page). */ open?: boolean; demo?: boolean };

/** The Analysis Canvas. The page sends the series of what is on it; an analysis of another Metric fetches its own
 * (ticket #125). */
export function AnalyzeScreen(props: AnalyzeProps) {
  const { data, ensure } = useCanvasSeries(props.data);
  return <SeriesProvider ensure={ensure}><AnalyzeCanvas {...props} data={data} /></SeriesProvider>;
}

function AnalyzeCanvas({ data, onCanvas, explained = null, open = false, demo = false }: AnalyzeProps) {
  const [over, setOver] = useState(false);
  // The picker is the front door: open on an empty canvas, shut (one button away) once there are Metrics to fit it to.
  const [choosing, setChoosing] = useState(open || onCanvas.length === 0);
  const [pending, start] = useTransition();
  // Outside the demo the canvas is the person's own and kept between visits: the server holds it and the page sends
  // it again after each change. The demo saves nothing (GLOSSARY: Demo Mode) and its database refuses every write, so
  // there the canvas lives on this page only, until the visitor leaves it (#827).
  const [kept, setKept] = useState(onCanvas);
  const [keptMark, setKeptMark] = useState<number | null>(explained);
  const ids = demo ? kept : onCanvas;
  const mark = demo ? keptMark : explained;
  const change = (next: number[], save: () => Promise<unknown>, nextMark: number | null = mark) => {
    if (demo) { setKept(next.filter((id, i) => next.indexOf(id) === i)); setKeptMark(nextMark); return true; }
    return new Promise<boolean>((done) => start(async () => { done(!told(await save())); }));
  };
  // The Metric to explain is its own mark, not the leftmost: the order of the Metrics never changes it.
  const explainedId = explainedOf(ids, mark);
  const inOrder = ids.map((id) => data.metrics.find((m) => m.id === id)!).filter(Boolean);
  const n = inOrder.length;
  const explain = (id: number) => { if (demo) setKeptMark(id); else start(async () => { told(await canvasExplain(id)); }); };
  const take = (id: number) => void change(ids.filter((i) => i !== id), () => canvasRemove(id), markAfterRemoval(ids, mark, id));
  const drop = (s: DropSource | null) => {
    if (s?.type === "metric") void change([...ids, s.id], () => canvasAdd([s.id]));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="order-2 lg:order-1">
        <Pool data={data} saved={[]} metricsOnly onAdd={(s) => drop(s)} hint="Drag metrics onto the canvas, or click +." />
      </div>
      <div className="order-1 min-w-0 space-y-4 lg:order-2">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setChoosing((o) => !o)} aria-expanded={choosing} className="flex min-h-10 items-center gap-2 rounded-[var(--radius-stock)] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"><Wand2 className="size-4" /> Choose a method</button>
          <span className="text-xs text-muted-foreground">Pick by what you want to know. The list starts with what fits the Metrics on the canvas.</span>
        </div>

        {choosing && <MethodPicker ids={ids} explains={explainedId} />}

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
            drop(s);
          }}
          className={cn("desk rounded-[var(--radius-card)] p-4 outline-2 -outline-offset-2", over ? "outline-dashed outline-[var(--color-ink-2)]" : "outline-transparent")}
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <FlaskConical className="size-4 text-primary" /> Analysis canvas
            <span className="fig font-normal text-muted-foreground">{n}</span><span className="font-normal text-muted-foreground">metric{n === 1 ? "" : "s"}</span>
            {n > 0 && <button onClick={() => void change([], () => canvasSet([]), null)} className="ml-auto flex min-h-8 items-center gap-1 rounded-[var(--radius-input)] px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><Trash2 className="size-3.5" /> Clear</button>}
          </div>
          {n === 0
            ? <p className="py-8 text-center text-sm text-muted-foreground">Drop Metrics here, or choose a method.</p>
            : <CanvasChips ms={inOrder} explainedId={explainedId} onExplain={explain} onRemove={take} disabled={pending} />}
        </div>
      </div>
    </div>
  );
}
