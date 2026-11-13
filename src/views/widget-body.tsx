"use client";
// PROTOTYPE: renders a Widget by its template. Each branch is where a pluggable View would sit.
import { useRef } from "react";
import { Bar, BarChart, Cell, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactValue, formatValue, health, periodLabel } from "@/lib/format";
import { forecast } from "@/analyses/forecast";
import { pearson, strength } from "@/analyses/correlation";
import type { CanvasData, Metric, Point, Widget } from "@/lib/types";
import { MetricChart } from "./metric-chart";
import { Sparkline } from "./sparkline";
import { Gauge } from "./gauge";
import { ScatterView } from "./scatter";
import { StoryBody } from "./story";
import { cn } from "@/lib/utils";

type Props = {
  widget: Pick<Widget, "template" | "metric_ids" | "settings">;
  data: CanvasData;
  onPointContext?: (metricId: number, period: string) => void;
  /** Right-click on one row of a breakdown. */
  onRowContext?: (metricId: number, label: string, period: string) => void;
};

export function widgetMetrics(widget: Pick<Widget, "metric_ids">, data: CanvasData) {
  return widget.metric_ids.map((id) => data.metrics.find((m) => m.id === id)).filter((m): m is Metric => !!m);
}

export function WidgetBody({ widget, data, onPointContext, onRowContext }: Props) {
  const ms = widgetMetrics(widget, data);
  if (ms.length < widget.metric_ids.length) {
    return <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">No access to this metric. Ask its owner to share it.</div>;
  }
  const m = ms[0];
  const all = data.series[m.slug] ?? [];
  const win = widget.settings.window ?? 12;
  const pts = all.slice(-win);
  const last = all[all.length - 1];
  const ctx = onPointContext ? (p: string) => onPointContext(m.id, p) : undefined;

  switch (widget.template) {
    case "ranked":
    case "share":
    case "pictogram":
    case "story-line":
    case "story":
      return <StoryBody widget={widget} data={data} m={m} onRowContext={onRowContext ? (l, p) => onRowContext(m.id, l, p) : undefined} />;
    case "number": {
      const tone = health(m, last?.value);
      return (
        <div className="flex h-full flex-col">
          <div className="flex items-baseline gap-2">
            <span className={cn("text-[length:var(--text-3xl)] leading-none font-semibold tracking-[-0.03em]", tone === "bad" && "text-destructive")}>{formatValue(m, last?.value)}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{last ? periodLabel(last.period, m.period) : "No values yet"}</div>
          {pts.length > 1 && <div className="mt-auto min-h-10 flex-1 pt-2"><Sparkline points={pts} height="100%" tone={tone} /></div>}
        </div>
      );
    }
    case "line":
    case "forecast": {
      const fc = widget.template === "forecast" || widget.settings.showForecast ? forecast(pts, m.period)?.points ?? null : null;
      const view = widget.settings.showTarget === false ? { ...m, target_min: null, target_max: null } : m;
      return (
        <div className="flex h-full flex-col">
          {widget.template === "forecast" && fc && (
            <p className="mb-1 text-xs text-muted-foreground">
              Expected {formatValue(m, fc[fc.length - 1].value)} by {periodLabel(fc[fc.length - 1].period, m.period)} (likely {compactValue(m, fc[fc.length - 1].lo)}–{compactValue(m, fc[fc.length - 1].hi)})
            </p>
          )}
          <div className="min-h-0 flex-1"><MetricChart metric={view} points={pts} forecast={fc} height="100%" onPointContext={ctx} /></div>
        </div>
      );
    }
    case "bars":
      return <Bars metric={m} points={pts} showTarget={widget.settings.showTarget !== false} onPointContext={ctx} />;
    case "gauge":
      return <Gauge metric={m} value={last?.value} history={pts.map((p) => p.value)} />;
    case "table": {
      const rows = all.slice(-(widget.settings.rows ?? 6)).reverse();
      return (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.period} className="border-b border-border last:border-0" onContextMenu={ctx ? () => ctx(r.period) : undefined}>
                <td className="py-1.5 text-muted-foreground">{periodLabel(r.period, m.period, true)}</td>
                <td className={cn("fig py-1.5 text-right", health(m, r.value) === "bad" && "text-destructive")}>{formatValue(m, r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case "correlation": {
      const b = ms[1];
      const res = b ? pearson(all, data.series[b.slug] ?? []) : null;
      if (!b || !res) return <Empty>Needs two metrics with the same period and at least 6 shared values.</Empty>;
      return (
        <div className="flex h-full flex-col">
          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{strength(res.r)}</span> relationship, r = <span className="fig">{res.r.toFixed(2)}</span> over {res.n} {m.period}s</p>
          <div className="min-h-0 flex-1"><ScatterView x={b} y={m} pairs={res.pairs.map((p) => ({ period: p.period, x: p.y, y: p.x }))} height="100%" /></div>
        </div>
      );
    }
    case "matrix":
      return <Matrix metrics={ms} series={data.series} />;
    case "drivers":
      return <Drivers target={m} others={ms.slice(1)} series={data.series} />;
  }
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">{children}</div>;
}

function Bars({ metric, points, showTarget, onPointContext }: { metric: Metric; points: Point[]; showTarget: boolean; onPointContext?: (p: string) => void }) {
  const hovered = useRef<string | null>(null);
  return (
    <div className="h-full" role="img" aria-label={`${metric.name}, ${points.length} ${metric.period}s`} onContextMenu={() => hovered.current && onPointContext?.(hovered.current)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart accessibilityLayer={false} data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          {showTarget && (metric.target_min !== null || metric.target_max !== null) && (
            <ReferenceArea y1={metric.target_min ?? 0} y2={metric.target_max ?? undefined} fill="var(--color-band)" fillOpacity={0.6} ifOverflow="extendDomain" />
          )}
          <XAxis dataKey="period" tickFormatter={(p) => periodLabel(p, metric.period, true)} tick={{ fontSize: 11, fill: "var(--color-muted)" }} minTickGap={16} stroke="var(--color-rule-2)" />
          <YAxis tickFormatter={(v) => compactValue(metric, v)} tick={{ fontSize: 11, fill: "var(--color-muted)", fontFamily: "var(--font-outlier)" }} width={56} stroke="var(--color-rule-2)" />
          <Tooltip formatter={(v) => [formatValue(metric, Number(v)), metric.name]} labelFormatter={(p) => periodLabel(String(p), metric.period)} contentStyle={{ borderRadius: 8, fontSize: 12 }} cursor={{ fill: "var(--color-paper-3)" }} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false} onMouseEnter={(d) => (hovered.current = (d as unknown as { period: string }).period)}>
            {points.map((p) => (
              <Cell key={p.period} fill={health(metric, p.value) === "bad" ? "var(--color-error)" : "var(--color-ink-2)"} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Matrix({ metrics, series }: { metrics: Metric[]; series: Record<string, Point[]> }) {
  if (metrics.length < 2) return <Empty>Drop at least two metrics.</Empty>;
  return (
    <div className="h-full overflow-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th />
            {metrics.map((m) => <th key={m.id} className="max-w-20 rotate-180 px-1 pb-1 text-left font-medium [writing-mode:vertical-rl]">{m.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {metrics.map((a) => (
            <tr key={a.id}>
              <th className="pr-2 text-right font-medium whitespace-nowrap">{a.name}</th>
              {metrics.map((b) => {
                const r = a.id === b.id ? 1 : a.period === b.period ? pearson(series[a.slug] ?? [], series[b.slug] ?? [])?.r ?? null : null;
                const bg = r === null ? "var(--color-paper-2)" : r >= 0 ? `color-mix(in oklch, var(--color-ink-2) ${Math.abs(r) * 55}%, var(--color-cotton))` : `color-mix(in oklch, var(--color-error) ${Math.abs(r) * 55}%, var(--color-cotton))`;
                return (
                  <td key={b.id} title={r === null ? "Different periods" : `r = ${r.toFixed(2)}`} className={cn("fig size-11 text-center text-xs", r !== null && Math.abs(r) > 0.6 && "text-[var(--color-board-type)]")} style={{ background: bg }}>
                    {r === null ? "–" : r.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Drivers({ target, others, series }: { target: Metric; others: Metric[]; series: Record<string, Point[]> }) {
  const ranked = others
    .filter((o) => o.period === target.period && !o.formula?.includes(`{${target.slug}}`) && !target.formula?.includes(`{${o.slug}}`))
    .map((o) => ({ o, res: pearson(series[target.slug] ?? [], series[o.slug] ?? []) }))
    .filter((x) => x.res && Number.isFinite(x.res.r))
    .sort((a, b) => Math.abs(b.res!.r) - Math.abs(a.res!.r));
  if (!ranked.length) return <Empty>No other {target.period}ly metric to compare with.</Empty>;
  const top = ranked[0];
  return (
    <div className="flex h-full flex-col gap-2">
      <ul className="space-y-1">
        {ranked.map(({ o, res }) => (
          <li key={o.id} className="grid grid-cols-[minmax(0,8rem)_1fr_3rem] items-center gap-2 text-xs">
            <span className="truncate">{o.name}</span>
            <span className="h-2 rounded-full bg-[var(--color-paper-3)]">
              <span className="block h-2 rounded-full" style={{ width: `${Math.abs(res!.r) * 100}%`, background: res!.r >= 0 ? "var(--color-ink-2)" : "var(--color-error)" }} />
            </span>
            <span className="fig text-right">{res!.r.toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{top.o.name}</span> moves most with {target.name} ({strength(top.res!.r)}).</p>
      <div className="min-h-0 flex-1"><ScatterView x={top.o} y={target} pairs={top.res!.pairs.map((p) => ({ period: p.period, x: p.y, y: p.x }))} height="100%" /></div>
    </div>
  );
}
