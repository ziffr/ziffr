"use client";
// The Analysis Canvas page (GLOSSARY: Analysis Canvas, Method, Slide-over; ticket #988; the owner's words of 2026-11-27): the canvas
// comes first, large, with the Pool at its left. "Pick a question" on the canvas opens the Method picker in the Slide-over, at every
// width. The answer is not in the panel: it appears directly under the canvas, newest first. Nothing else runs an analysis here; a
// Method that is left out says so in the list.
import { useEffect, useRef, useState, useTransition } from "react";
import { SeriesProvider, useCanvasSeries } from "@/canvas/series-store";
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

type AnalyzeProps = { data: CanvasData; onCanvas: number[]; explained?: number | null; /** Open the Method picker from the start (sent from a Metric page). */ open?: boolean; demo?: boolean; /** An Owner or Admin: the list ends with the way to write a Method of one's own. */ writes?: boolean };

/** The Analysis Canvas. The page sends the series of what is on it; an analysis of another Metric fetches its own
 * (ticket #125). */
export function AnalyzeScreen(props: AnalyzeProps) {
  const { data, ensure } = useCanvasSeries(props.data);
  return <SeriesProvider ensure={ensure}><AnalyzeCanvas {...props} data={data} /></SeriesProvider>;
}

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
    if (demo) { setKept(next.filter((id, i) => next.indexOf(id) === i)); setKeptMark(nextMark); return; }
    start(async () => { told(await save()); });
  };
  const explain = (id: number) => { if (demo) setKeptMark(id); else start(async () => { told(await canvasExplain(id)); }); };
  return { ids, mark, pending, change, explain };
}

function AnalyzeCanvas(props: AnalyzeProps) {
  const { data, open = false, writes = false } = props;
  const { ids, mark, pending, change, explain } = useCanvasState(props);
  const [urlOpen, setUrl] = usePanel("methods");
  const [choosing, setChoosing] = useState(open || urlOpen);
  const [results, setResults] = useState<ResultItem[]>([]);
  const seq = useRef(0);
  // The Metric to explain is its own mark, not the leftmost: the order of the Metrics never changes it.
  const explainedId = explainedOf(ids, mark);
  const inOrder = ids.map((id) => data.metrics.find((m) => m.id === id)!).filter(Boolean);
  const take = (id: number) => void change(ids.filter((i) => i !== id), () => canvasRemove(id), markAfterRemoval(ids, mark, id));
  const drop = (s: DropSource | null) => { if (s?.type === "metric") void change([...ids, s.id], () => canvasAdd([s.id])); };
  const clear = () => { setResults([]); void change([], () => canvasSet([]), null); };

  // The address says which panel is open (`?panel=methods`), so it has a link of its own.
  useEffect(() => { setUrl(choosing); }, [choosing, setUrl]);
  // The panel covers the page, so it goes once there is an answer, which is under the canvas. The panel itself gives the focus back.
  const onResult = (r: Omit<ResultItem, "key">) => { setResults((l) => addResult(l, { ...r, key: ++seq.current })); setChoosing(false); };

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="order-2 lg:order-1">
        <Pool data={data} saved={[]} metricsOnly onAdd={(s) => drop(s)} hint="Drag metrics onto the canvas, or click +." />
      </div>
      <div className="order-1 min-w-0 space-y-4 lg:order-2">
        <CanvasBoard ms={inOrder} explainedId={explainedId} pending={pending} choosing={choosing} onPick={() => setChoosing(true)} onDrop={drop} onClear={clear} onExplain={explain} onRemove={take} />
        <Results items={results} writing={{ style: data.numberStyle, yearStart: data.yearStart }} />
      </div>
      {choosing && (
        <SlideOverWindow title="Pick a question" description="Pick the question you want answered about the Metrics on the canvas." onClose={() => setChoosing(false)}>
          <MethodPicker ids={ids} explains={explainedId} writes={writes} onResult={onResult} />
        </SlideOverWindow>
      )}
    </div>
  );
}
