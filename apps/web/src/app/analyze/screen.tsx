"use client";
// The Analysis Canvas page (GLOSSARY: Analysis Canvas, Method, Slide-over; ticket #988; the owner's words of 2026-11-24): the canvas
// comes first, large, with the Pool at its left. "Choose a method" opens the methods panel: a column beside the canvas on a wide screen
// (so the Pool stays draggable while it is open), the Slide-over on a narrow one. The answer is not in the panel: it appears directly
// under the canvas, newest first. Nothing else runs an analysis here; a Method that is left out says so in the list.
import { useEffect, useRef, useState, useTransition } from "react";
import { SeriesProvider, useCanvasSeries } from "@/canvas/series-store";
import { Wand2, X } from "lucide-react";
import { Pool } from "@/components/pool";
import { SlideOverWindow } from "@/components/slide-over-window";
import { canvasAdd, canvasExplain, canvasRemove, canvasSet, type DropSource } from "@/app/canvas-actions";
import { told } from "@/lib/action-toast";
import { usePanel } from "@/lib/panel-param";
import type { CanvasData } from "@ziffr/core/types";
import { explainedOf, markAfterRemoval } from "@ziffr/core/canvas-roles";
import { CanvasBoard } from "./canvas-board";
import { MethodPicker } from "./method-picker";
import { Results, addResult, type ResultItem } from "./results";
import { useDocked } from "./use-docked";
import { useExample } from "./use-example";
import type { Example } from "./example";
import { cn } from "@/lib/utils";

type AnalyzeProps = { data: CanvasData; onCanvas: number[]; explained?: number | null; /** Open the methods panel from the start (sent from a Metric page). */ open?: boolean; demo?: boolean; /** An Owner or Admin: the list ends with the way to write a Method of one's own. */ writes?: boolean };

/** The Analysis Canvas. The page sends the series of what is on it; an analysis of another Metric fetches its own
 * (ticket #125). */
export function AnalyzeScreen(props: AnalyzeProps) {
  const { data, ensure } = useCanvasSeries(props.data);
  return <SeriesProvider ensure={ensure}><AnalyzeCanvas {...props} data={data} /></SeriesProvider>;
}

const sameIds = (a: number[], b: number[]) => a.length === b.length && b.every((id) => a.includes(id));

// Outside the demo the canvas is the person's own and kept between visits: the server holds it and the page sends it again after each
// change. The demo saves nothing (GLOSSARY: Demo Mode) and its database refuses every write, so there the canvas lives on this page
// only, until the visitor leaves it (#827).
function useCanvasState({ onCanvas, explained = null, demo = false }: AnalyzeProps) {
  const [pending, start] = useTransition();
  const [kept, setKept] = useState(onCanvas);
  const [keptMark, setKeptMark] = useState<number | null>(explained);
  const ids = demo ? kept : onCanvas;
  const mark = demo ? keptMark : explained;
  const change = (next: number[], save: () => Promise<unknown>, nextMark: number | null = mark) => {
    if (demo) { setKept(next.filter((id, i) => next.indexOf(id) === i)); setKeptMark(nextMark); return Promise.resolve(true); }
    return new Promise<boolean>((done) => start(async () => { done(!told(await save())); }));
  };
  const explain = (id: number) => { if (demo) setKeptMark(id); else start(async () => { told(await canvasExplain(id)); }); };
  return { ids, mark, pending, change, explain };
}

function AnalyzeCanvas(props: AnalyzeProps) {
  const { data, open = false, writes = false } = props;
  const { ids, mark, pending, change, explain } = useCanvasState(props);
  const docked = useDocked();
  const [urlOpen, setUrl] = usePanel("methods");
  const [choosing, setChoosing] = useState(open || urlOpen);
  const [openEntry, setOpenEntry] = useState<Example["entry"] | null>(null);
  const [after, setAfter] = useState<Example | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);
  const seq = useRef(0);
  const button = useRef<HTMLButtonElement>(null);
  const aside = useRef<HTMLElement>(null);
  const focusPanel = useRef(false);
  // The Metric to explain is its own mark, not the leftmost: the order of the Metrics never changes it.
  const explainedId = explainedOf(ids, mark);
  const inOrder = ids.map((id) => data.metrics.find((m) => m.id === id)!).filter(Boolean);
  const example = useExample(data, inOrder.length === 0);
  const take = (id: number) => void change(ids.filter((i) => i !== id), () => canvasRemove(id), markAfterRemoval(ids, mark, id));
  const drop = (s: DropSource | null) => { if (s?.type === "metric") void change([...ids, s.id], () => canvasAdd([s.id])); };
  const clear = () => { setResults([]); void change([], () => canvasSet([]), null); };

  // The example: its Metrics go on the canvas with the one to explain marked, and once they are there the panel opens on its question
  // (opened sooner, a panel that is already showing would be fitted to the canvas as it was).
  const tryExample = async (e: Example) => { if (await change(e.ids, () => canvasSet(e.ids, e.explains), e.explains)) { focusPanel.current = true; setAfter(e); } };
  if (after && sameIds(ids, after.ids)) { setAfter(null); setOpenEntry(after.entry); setChoosing(true); }

  // The address says which panel is open (`?panel=methods`), so it has a link of its own.
  useEffect(() => { setUrl(choosing); }, [choosing, setUrl]);
  useEffect(() => { if (choosing && docked && focusPanel.current) { focusPanel.current = false; aside.current?.focus(); } }, [choosing, docked]);
  const close = () => { setChoosing(false); button.current?.focus(); };
  // A narrow screen shows the panel over the page, so the answer is closed in on: the panel goes and the answer is under the canvas.
  const onResult = (r: Omit<ResultItem, "key">) => { setResults((l) => addResult(l, { ...r, key: ++seq.current })); if (!docked) setChoosing(false); };
  const picker = <MethodPicker ids={ids} explains={explainedId} writes={writes} openEntry={openEntry} onResult={onResult} />;

  return (
    <div className={cn("grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]", docked && choosing && "xl:grid-cols-[15rem_minmax(0,1fr)_26rem]")}>
      <div className="order-2 lg:order-1">
        <Pool data={data} saved={[]} metricsOnly onAdd={(s) => drop(s)} hint="Drag metrics onto the canvas, or click +." />
      </div>
      <div className="order-1 min-w-0 space-y-4 lg:order-2">
        <div className="flex flex-wrap items-center gap-3">
          <button ref={button} onClick={() => { focusPanel.current = !choosing; setChoosing(!choosing); }} aria-expanded={choosing} aria-haspopup={docked ? undefined : "dialog"} className="flex min-h-10 items-center gap-2 rounded-[var(--radius-stock)] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"><Wand2 className="size-4" /> Choose a method</button>
          <span className="text-xs text-muted-foreground">Pick the question you want answered about the Metrics on the canvas.</span>
        </div>
        <CanvasBoard ms={inOrder} explainedId={explainedId} example={example} pending={pending} onDrop={drop} onClear={clear} onExplain={explain} onRemove={take} onExample={(e) => void tryExample(e)} />
        <Results items={results} />
      </div>
      {choosing && docked && (
        <aside ref={aside} tabIndex={-1} aria-label="Choose a method" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }} className="order-3 max-h-[calc(100dvh-2rem)] min-w-0 self-start overflow-y-auto rounded-[var(--radius-card)] border border-[var(--color-rule-2)] bg-card p-4 outline-none xl:sticky xl:top-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold">Choose a method</h2>
            <button type="button" onClick={close} aria-label="Close the methods panel" className="rounded p-1 text-muted-foreground hover:bg-muted"><X aria-hidden className="size-4" /></button>
          </div>
          {picker}
        </aside>
      )}
      {choosing && !docked && <SlideOverWindow title="Choose a method" description="Pick the question you want answered about the Metrics on the canvas." onClose={() => setChoosing(false)}>{picker}</SlideOverWindow>}
    </div>
  );
}
