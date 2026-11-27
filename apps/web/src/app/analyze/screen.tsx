"use client";
// The Analysis Canvas page (GLOSSARY: Analysis Canvas, Pool, Method, Slide-over; ticket #988; the owner's words of 2026-11-27):
// building an analysis works like building a dashboard. The canvas has the full width. "Add a Metric" opens the Pool in the panel at
// the right and "Pick a question" the Method picker in the same panel, which leaves the canvas usable on a wide screen. The answer is
// not in the panel: it appears directly under the canvas, newest first. Nothing else runs an analysis here; a Method that is left out
// says so in the list.
import { useEffect, useRef, useState, useTransition } from "react";
import { SeriesProvider, useCanvasSeries } from "@/canvas/series-store";
import { canvasAdd, canvasExplain, canvasRemove, canvasSet, type DropSource } from "@/app/canvas-actions";
import { told } from "@/lib/action-toast";
import { usePanel } from "@/lib/panel-param";
import { useMedia } from "@/lib/use-media";
import { cn } from "@/lib/utils";
import type { CanvasData } from "@ziffr/core/types";
import { explainedOf, markAfterRemoval } from "@ziffr/core/canvas-roles";
import { CanvasBoard, type CanvasPanel } from "./canvas-board";
import { CanvasSidePanel } from "./canvas-panel";
import { Results, addResult, type ResultItem } from "./results";
import { useExample } from "./use-example";
import type { Example } from "./example";

type AnalyzeProps = { data: CanvasData; onCanvas: number[]; explained?: number | null; /** Open the Method picker from the start (sent from a Metric page). */ open?: boolean; demo?: boolean; /** An Owner or Admin: the list ends with the way to write a Method of one's own. */ writes?: boolean };

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
  // From this width the panel stands beside the canvas, as a dashboard's Add widget panel does; below it, it is the Slide-over.
  const docked = useMedia("(min-width: 1024px)", true);
  const [urlOpen, setUrl] = usePanel("methods");
  const [panel, setPanel] = useState<CanvasPanel | null>(open || urlOpen ? "methods" : null);
  const [openEntry, setOpenEntry] = useState<Example["entry"] | null>(null);
  const [after, setAfter] = useState<Example | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);
  const seq = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  // The list that is showing, or showed last: its button gets the focus back.
  const last = useRef<CanvasPanel>("methods");
  if (panel) last.current = panel;
  // The Metric to explain is its own mark, not the leftmost: the order of the Metrics never changes it.
  const explainedId = explainedOf(ids, mark);
  const inOrder = ids.map((id) => data.metrics.find((m) => m.id === id)!).filter(Boolean);
  const example = useExample(data, inOrder.length === 0);
  const take = (id: number) => void change(ids.filter((i) => i !== id), () => canvasRemove(id), markAfterRemoval(ids, mark, id));
  const drop = (s: DropSource | null) => { if (s?.type === "metric" && !ids.includes(s.id)) void change([...ids, s.id], () => canvasAdd([s.id])); };
  const clear = () => { setResults([]); void change([], () => canvasSet([]), null); };

  // The example: its Metrics go on the canvas with the one to explain marked, and once they are there the panel opens on its question
  // (opened sooner, the list would be fitted to the canvas as it was).
  const tryExample = async (e: Example) => { if (await change(e.ids, () => canvasSet(e.ids, e.explains), e.explains)) setAfter(e); };
  if (after && sameIds(ids, after.ids)) { setAfter(null); setOpenEntry(after.entry); setPanel("methods"); }

  // The address says when the questions are open (`?panel=methods`), so that list has a link of its own.
  useEffect(() => { setUrl(panel === "methods"); }, [panel, setUrl]);
  // The focus goes back to the button for the list that was showing. It may be a new button (the empty canvas's goes with the first
  // Metric), so it is looked for once the panel has gone: the Slide-over would pick another when its opener is no longer there. Beside
  // the canvas, a focus that is elsewhere on the page stays where it is.
  const close = () => {
    setPanel(null);
    setOpenEntry(null);
    setTimeout(() => {
      const at = document.activeElement;
      if (docked && at && at !== document.body && at.isConnected && !at.closest("#canvas-panel")) return;
      (root.current?.querySelector<HTMLElement>(`[data-opens="${last.current}"]`) ?? root.current?.querySelector<HTMLElement>("[data-opens]"))?.focus();
    }, 0);
  };
  // Beside the canvas the list stays open; the Slide-over covers the page, so it goes once there is an answer, which is under the canvas.
  const onResult = (r: Omit<ResultItem, "key">) => { setResults((l) => addResult(l, { ...r, key: ++seq.current })); if (!docked) close(); };

  return (
    <div ref={root} className={cn("grid items-start gap-4", docked && panel && "lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_26rem]")}>
      <div className="min-w-0 space-y-4">
        <CanvasBoard ms={inOrder} explainedId={explainedId} pending={pending} panel={panel} docked={docked} onPanel={(kind) => (panel === kind ? close() : setPanel(kind))} onExample={example ? () => void tryExample(example) : undefined} onDrop={drop} onClear={clear} onExplain={explain} onRemove={take} />
        <Results items={results} writing={{ style: data.numberStyle, yearStart: data.yearStart }} />
      </div>
      {panel && <CanvasSidePanel docked={docked} kind={panel} data={data} ids={ids} explains={explainedId} openEntry={openEntry} writes={writes} onAdd={drop} onQuestions={() => setPanel("methods")} onResult={onResult} onClose={close} />}
    </div>
  );
}
