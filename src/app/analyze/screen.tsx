"use client";
import { useState, useTransition } from "react";
import { FlaskConical, Lock, Play, Trash2, Wand2, X } from "lucide-react";
import { Pool } from "@/components/pool";
import { WidgetFrame } from "@/components/widget-frame";
import { canvasAdd, canvasRemove, canvasSet, type DropSource } from "@/app/canvas-actions";
import { getDrag, setDrag } from "@/lib/drag";
import { TEMPLATES } from "@/views/templates";
import type { CanvasData, TemplateId } from "@/lib/types";
import { cn } from "@/lib/utils";

type Result = { key: string; template: TemplateId; metric_ids: number[] };

export function AnalyzeScreen({ data, onCanvas, targets }: { data: CanvasData; onCanvas: number[]; targets: { id: number; name: string }[] }) {
  const [results, setResults] = useState<Result[]>([]);
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();
  const ms = onCanvas.map((id) => data.metrics.find((m) => m.id === id)!).filter(Boolean);
  const bySlug = (s: string) => data.metrics.find((m) => m.slug === s);
  const n = ms.length;
  const samePeriod = n > 1 && ms.every((m) => m.period === ms[0].period);

  const run = (template: TemplateId, ids: number[]) =>
    setResults((r) => {
      const key = `${template}:${ids.join(",")}`;
      return [{ key, template, metric_ids: ids }, ...r.filter((x) => x.key !== key)];
    });

  const drop = (s: DropSource | null) => {
    if (s?.type === "metric") start(() => canvasAdd([s.id]));
  };

  const recipe = (ids: number[], template: TemplateId) =>
    start(async () => {
      await canvasSet(ids);
      run(template, ids);
    });

  // Analyses offered depend on what's on the canvas (GLOSSARY: Analysis Canvas).
  const suggestions: { label: string; blurb: string; ok: boolean; why?: string; go?: () => void; locked?: boolean }[] = [
    { label: "Forecast", blurb: "Project each metric a few periods ahead.", ok: n >= 1, why: "Drop one metric", go: () => ms.forEach((m) => run("forecast", [m.id])) },
    { label: "Correlation", blurb: "Do these two move together?", ok: n === 2 && samePeriod, why: n !== 2 ? "Drop exactly two metrics" : "Both need the same period", go: () => run("correlation", [ms[0].id, ms[1].id]) },
    { label: "Drivers", blurb: `What moves most with ${ms[0]?.name ?? "the first metric"}?`, ok: n >= 2, why: "Drop two or more metrics", go: () => run("drivers", ms.map((m) => m.id)) },
    { label: "Correlation matrix", blurb: "Every pair at once.", ok: n >= 3, why: "Drop three or more metrics", go: () => run("matrix", ms.map((m) => m.id)) },
    { label: "Clustering", blurb: "Group periods that behave alike.", ok: false, locked: true },
    { label: "Impact analysis", blurb: "How much does one move the other?", ok: false, locked: true },
  ];

  const cost = bySlug("cost");
  const revenue = bySlug("revenue");
  const tickets = bySlug("support-tickets");
  const returns = bySlug("return-rate");
  const monthly = data.metrics.filter((m) => m.period === "month");
  const recipes = [
    cost && { label: "What drives Cost?", go: () => recipe([cost.id, ...monthly.filter((m) => m.id !== cost.id).map((m) => m.id)], "drivers") },
    revenue && { label: "Where is Revenue heading?", go: () => recipe([revenue.id], "forecast") },
    tickets && returns && { label: "Do support tickets drive returns?", go: () => recipe([returns.id, tickets.id], "correlation") },
  ].filter(Boolean) as { label: string; go: () => void }[];

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="order-2 lg:order-1">
        <Pool data={data} saved={[]} metricsOnly onAdd={(s) => drop(s)} hint="Drag metrics onto the canvas, or click +." />
      </div>
      <div className="order-1 min-w-0 space-y-4 lg:order-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Wand2 className="size-3.5" /> Recipes</span>
          {recipes.map((r) => (
            <button key={r.label} onClick={r.go} disabled={pending} className="stock min-h-9 rounded-[var(--radius-stock)] px-3 text-sm transition-[transform,box-shadow] hover:-translate-y-px hover:[box-shadow:var(--edge-stock),var(--cast-stock-lift)] active:translate-y-px">{r.label}</button>
          ))}
          {!recipes.length && <span className="text-xs text-muted-foreground">Recipes appear once the metrics they need are shared with you.</span>}
        </div>

        <div
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
            {n > 0 && <button onClick={() => { setResults([]); start(() => canvasSet([])); }} className="ml-auto flex min-h-8 items-center gap-1 rounded-[var(--radius-input)] px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><Trash2 className="size-3.5" /> Clear</button>}
          </div>
          {n === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Drop metrics here. One metric → forecast. Two → correlation. More → drivers and a matrix.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ms.map((m, i) => (
                <span key={m.id} className="stock flex min-h-9 items-center gap-1.5 rounded-[var(--radius-stock)] py-1 pr-1 pl-2.5 text-sm">
                  {i === 0 && n > 1 && <span className="rounded-[var(--radius-input)] border border-foreground px-1 text-xs font-medium">Target</span>}
                  {m.name}
                  <span className="text-xs text-muted-foreground">{m.period === "day" ? "daily" : m.period === "week" ? "weekly" : "monthly"}</span>
                  <button onClick={() => start(() => canvasRemove(m.id))} className="rounded p-0.5 text-muted-foreground hover:bg-muted"><X className="size-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((s) => (
              <button
                key={s.label}
                disabled={!s.ok || pending}
                onClick={s.go}
                title={s.locked ? "Coming soon" : !s.ok ? s.why : undefined}
                className={cn("flex items-start gap-2 rounded-[var(--radius-stock)] p-2.5 text-left text-sm transition-[transform,box-shadow]", s.ok ? "stock hover:-translate-y-px hover:[box-shadow:var(--edge-stock),var(--cast-stock-lift)]" : "cursor-not-allowed border border-dashed border-[var(--color-rule-2)] text-muted-foreground", s.locked && "border-dashed")}
              >
                {s.locked ? <Lock className="mt-0.5 size-3.5 shrink-0" /> : <Play className="mt-0.5 size-3.5 shrink-0 text-primary" />}
                <span>
                  <span className="font-medium">{s.label}</span>{s.locked && <span className="text-xs text-muted-foreground">, coming soon</span>}
                  <span className="block text-xs text-muted-foreground">{s.ok || s.locked ? s.blurb : s.why}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {results.length > 0 && (
          <div className="grid gap-4 xl:grid-cols-2">
            {results.map((r) => (
              <div key={r.key} className={r.template === "drivers" ? "h-[26rem]" : "h-80"}>
                <WidgetFrame widget={{ template: r.template, metric_ids: r.metric_ids, settings: TEMPLATES[r.template].settings, title: null }} data={data} targets={targets} />
              </div>
            ))}
          </div>
        )}
        {results.length > 0 && <p className="text-xs text-muted-foreground">Right-click a result → “Save as Widget” or “Add to dashboard”.</p>}
      </div>
    </div>
  );
}
