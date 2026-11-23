"use client";
import { inUse } from "@ziffr/core/metric-row";
import { useState, useTransition } from "react";
import { SeriesProvider, useCanvasSeries } from "@/canvas/series-store";
import { FlaskConical, Trash2, Wand2 } from "lucide-react";
import { Pool } from "@/components/pool";
import { WidgetFrame } from "@/components/widget-frame";
import { canvasAdd, canvasExplain, canvasRemove, canvasSet, type DropSource } from "@/app/canvas-actions";
import { told } from "@/lib/action-toast";
import { getDrag, setDrag } from "@/lib/drag";
import { TEMPLATES } from "@/views/templates";
import type { CanvasData, TemplateId } from "@ziffr/core/types";
import { explainedFirst, explainedOf, markAfterRemoval } from "@ziffr/core/canvas-roles";
import { QUICK_STARTS } from "@ziffr/core/quick-starts";
import { CanvasChips } from "./canvas-chips";
import { QuickTiles } from "./quick-tiles";
import { DidItWork } from "./did-it-work";
import { MethodPicker } from "./method-picker";
import { cn } from "@/lib/utils";

// A result keeps the Metrics it was asked on; which of them it explains is read from the canvas each time it is drawn, so changing
// the one to explain re-runs it without taking anything away.
const CHIP = "stock min-h-9 rounded-[var(--radius-stock)] px-3 text-sm transition-[transform,box-shadow] hover:-translate-y-px hover:[box-shadow:var(--edge-stock),var(--cast-stock-lift)] active:translate-y-px";

type Result = { key: string; template: TemplateId; metric_ids: number[] };

type AnalyzeProps = { data: CanvasData; onCanvas: number[]; explained?: number | null; open?: boolean; targets: { id: number; name: string }[]; demo?: boolean };

/** The Analysis Canvas. The page sends the series of what is on it; an analysis of another Metric fetches its own
 * (ticket #125). */
export function AnalyzeScreen(props: AnalyzeProps) {
  const { data, ensure } = useCanvasSeries(props.data);
  return <SeriesProvider ensure={ensure}><AnalyzeCanvas {...props} data={data} /></SeriesProvider>;
}

function AnalyzeCanvas({ data, onCanvas, explained = null, open = false, targets, demo = false }: AnalyzeProps) {
  const [results, setResults] = useState<Result[]>([]);
  const [over, setOver] = useState(false);
  const [didIt, setDidIt] = useState(false);
  // The picker is the front door: open on an empty canvas, and when a Metric page sent the person here to see its questions.
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
  const ms = explainedFirst(ids, mark).map((id) => data.metrics.find((m) => m.id === id)!).filter(Boolean);
  const inOrder = ids.map((id) => data.metrics.find((m) => m.id === id)!).filter(Boolean);
  const n = ms.length;
  const bySlug = (s: string) => data.metrics.find((m) => m.slug === s);
  const explain = (id: number) => { if (demo) setKeptMark(id); else start(async () => { told(await canvasExplain(id)); }); };
  const take = (id: number) => void change(ids.filter((i) => i !== id), () => canvasRemove(id), markAfterRemoval(ids, mark, id));

  const run = (template: TemplateId, rids: number[]) =>
    setResults((r) => {
      const key = `${template}:${[...rids].sort((x, y) => x - y).join(",")}`;
      return [{ key, template, metric_ids: rids }, ...r.filter((x) => x.key !== key)];
    });

  // A Recipe sets the canvas to its own Metrics and says which one it explains.
  const recipe = async (next: number[], template: TemplateId, explains: number = next[0]) => {
    if (await change(next, () => canvasSet(next, explains), explains)) run(template, next);
  };

  const drop = (s: DropSource | null) => {
    if (s?.type === "metric") void change([...ids, s.id], () => canvasAdd([s.id]));
  };

  const cost = bySlug("cost");
  const revenue = bySlug("revenue");
  const tickets = bySlug("support-tickets");
  const returns = bySlug("return-rate");
  const label = (id: string) => QUICK_STARTS.find((q) => q.id === id)!.label;
  const recipes = [
    cost && { label: label("chip-cost"), go: () => void recipe([cost.id, ...inUse(data.metrics).filter((m) => m.id !== cost.id).map((m) => m.id)], "drivers") },
    revenue && { label: label("chip-heading"), go: () => void recipe([revenue.id], "forecast") },
    revenue && (revenue.target_min !== null || revenue.target_max !== null) && { label: label("chip-target"), go: () => void recipe([revenue.id], "forecast") },
    tickets && returns && { label: label("chip-tickets"), go: () => void recipe([returns.id, tickets.id], "correlation") },
  ].filter(Boolean) as { label: string; go: () => void }[];

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="order-2 lg:order-1">
        <Pool data={data} saved={[]} metricsOnly onAdd={(s) => drop(s)} hint="Drag metrics onto the canvas, or click +." />
      </div>
      <div className="order-1 min-w-0 space-y-4 lg:order-2">
        {/* The front door: choosing a method by what you want to know. The chips and tiles below are shortcuts into the same list. */}
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setChoosing((o) => !o)} aria-expanded={choosing} className="flex min-h-10 items-center gap-2 rounded-[var(--radius-stock)] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"><Wand2 className="size-4" /> Choose a method</button>
          <span className="text-xs text-muted-foreground">Pick by what you want to know. The quick starts below are shortcuts into the same list.</span>
        </div>

        {choosing && <MethodPicker ids={ids} explains={explainedId} />}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Quick starts</span>
          {recipes.map((r) => (
            <button key={r.label} onClick={r.go} disabled={pending} className={CHIP}>{r.label}</button>
          ))}
          {/* Asks about the one to explain on the canvas, so it needs one there; it opens a card for the day. */}
          <button onClick={() => setDidIt((o) => !o)} disabled={n === 0} aria-expanded={didIt && n > 0} title={n === 0 ? "Drop a metric first" : undefined} className={cn(CHIP, "disabled:cursor-not-allowed disabled:opacity-50")}>{label("chip-did-it-work")}</button>
          {!recipes.length && <span className="text-xs text-muted-foreground">Quick starts for named Metrics appear once the metrics they need are shared with you.</span>}
        </div>

        {didIt && n > 0 && <DidItWork key={ms[0].id} data={data} metrics={ms} />}

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
            {n > 0 && <button onClick={() => { setResults([]); void change([], () => canvasSet([]), null); }} className="ml-auto flex min-h-8 items-center gap-1 rounded-[var(--radius-input)] px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><Trash2 className="size-3.5" /> Clear</button>}
          </div>
          {n === 0
            ? <p className="py-8 text-center text-sm text-muted-foreground">Drop Metrics here, or choose a method.</p>
            : <CanvasChips ms={inOrder} explainedId={explainedId} onExplain={explain} onRemove={take} disabled={pending} />}
          <QuickTiles ms={ms} run={run} pending={pending} />
        </div>

        {results.length > 0 && (
          <div className="grid gap-4 xl:grid-cols-2">
            {results.map((r) => (
              <div key={r.key} className={r.template === "drivers" ? "h-[26rem]" : "h-80"}>
                <WidgetFrame widget={{ template: r.template, metric_ids: r.template === "drivers" ? explainedFirst(r.metric_ids, explainedId) : r.metric_ids, settings: TEMPLATES[r.template].settings, title: null }} data={data} targets={targets} />
              </div>
            ))}
          </div>
        )}
        {results.length > 0 && <p className="text-xs text-muted-foreground">A result&rsquo;s ⋯ menu saves it as a widget or adds it to a dashboard.</p>}
      </div>
    </div>
  );
}
