"use client";
// PROTOTYPE: renders a Widget by its template. Each branch is where a pluggable View would sit.
import { useId, useRef } from "react";
import { Bar, BarChart, Cell, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactValue, formatValue, health } from "@ziffr/core/format";
import { forecast } from "@/analyses/forecast";
import { pearson, strength } from "@ziffr/core/correlation";
import type { CanvasData, Metric, Point, Widget } from "@ziffr/core/types";
import { Lock } from "lucide-react";
import { MetricChart } from "./metric-chart";
import { Sparkline } from "./sparkline";
import { Gauge } from "./gauge";
import { ScatterView } from "./scatter";
import { fillSettings } from "@ziffr/core/placeholders";
import dynamic from "next/dynamic";

// tldraw is browser-only; free layouts load it on demand.
const LayoutView = dynamic(() => import("@/canvas/layout-view"), { ssr: false });
// Observable Plot is only needed by stories: their code loads with the first story shown (still rendered on the server).
const StoryBody = dynamic(() => import("./story").then((m) => m.StoryBody));
import { cn } from "@/lib/utils";
import { useSeriesReady } from "@/canvas/series-store";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import { dataAsOf } from "@ziffr/core/snapshot-periods";
import { TargetChip } from "@/components/target-chip";
import { PERIOD_LABEL, periodLabel, type Span, type YearStart } from "@ziffr/core/periods";
import { heldText, shownSeries, SHOWN_BY, spanCount, type DisplayPoint } from "@ziffr/core/display-periods";

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

export function WidgetBody({ widget, data: live, onPointContext, onRowContext }: Props) {
  // A widget of a deck made from a Snapshot draws the values of that period only (spec 0013).
  const data = widget.settings.asOf ? dataAsOf(live, widget.settings.asOf) : live;
  const ms = widgetMetrics(widget, data);
  // A page sends only the series it draws; one placed or picked since is fetched, with a quiet placeholder meanwhile.
  const ready = useSeriesReady(widgetMetricIds(widget.metric_ids, widget.settings), data);
  if (!ready) return <div aria-busy="true" aria-label="Loading values" className="h-full min-h-16 w-full animate-pulse rounded-[var(--radius-input)] bg-muted/40" />;
  if (widget.template === "canvas") return <LayoutView settings={widget.settings} data={data} />;
  if (ms.length < widget.metric_ids.length) {
    return <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">No access to this metric. Ask its owner to share it.</div>;
  }
  const m = ms[0];
  // Show by (spec 0018): the series by its Display Period, combined by the Aggregation; a Snapshot's deck counts
  // "to date" as of its own day, so it keeps what the widget showed then.
  const shown = SHOWN_BY.includes(widget.template) ? shownSeries(m, data, widget.settings.display, { today: widget.settings.asOf ?? undefined }) : null;
  const by = shown?.by ?? m.period;
  const all: DisplayPoint[] = shown?.points ?? (data.series[m.slug] ?? []).map((p) => ({ ...p, held: 1, length: 1, toDate: false, through: p.period }));
  const combined = !!shown?.combined;
  const win = widget.settings.window ?? 12;
  const pts = all.slice(-win);
  const last = all[all.length - 1];
  // A point of a combined series is a span, not one of the Metric's periods: there is no single value to ask about.
  const ctx = onPointContext && !combined ? (p: string) => onPointContext(m.id, p) : undefined;
  const targets = shown?.targets ?? null;
  // The target a value is judged against: the span's own when combined, else the Metric's range as always.
  const goal = (p: DisplayPoint | undefined) => (combined ? { target_min: targets?.at[p?.period ?? ""]?.min ?? null, target_max: targets?.at[p?.period ?? ""]?.max ?? null } : m);
  // "Q4 2026 to date, 2 of 3 months": a half-finished span is never read as a drop.
  const name = (p: DisplayPoint, short = false) => periodLabel(p.period, by, data.yearStart, short) + (p.toDate ? (short ? " to date" : ` to date, ${heldText(p, m.period)}`) : "");
  const note = shown?.reason ?? (combined ? targets?.note ?? null : null);

  switch (widget.template) {
    case "ranked":
    case "share":
    case "pictogram":
    case "story-line":
    case "story":
      return <StoryBody widget={{ ...widget, settings: fillSettings(widget, data) }} data={data} m={m} onRowContext={onRowContext ? (l, p) => onRowContext(m.id, l, p) : undefined} />;
    case "number": {
      const tone = health(goal(last), last?.value);
      return (
        <div className="flex h-full flex-col">
          <div className="flex items-baseline gap-2">
            {/* The headline stays neutral; the chip says on or off target (one colour rule, see target-chip). */}
            <span className="text-[length:clamp(var(--text-3xl),13cqw,5rem)] leading-none font-semibold tracking-[-0.03em]">{formatValue(m, last?.value)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {/* "Q4 26, 2 of 3 months" fits a small card; the tooltip says "to date" in full. */}
            {last ? (last.toDate ? <span title={name(last)}>{periodLabel(last.period, by, data.yearStart, true)}, {heldText(last, m.period)}</span> : name(last)) : "No values yet"}
            <TargetChip metric={{ ...m, ...goal(last) }} value={last?.value} note={note} />
            {last && <ApprovalMark data={data} metricId={m.id} period={last.period} through={combined ? last.through : undefined} />}
          </div>
          {/* A small card has no room for the target's note: it is the chip's tooltip. */}
          {pts.length > 1 && <div className="mt-auto min-h-10 flex-1 pt-2"><Sparkline points={pts} height="100%" tone={tone} /></div>}
        </div>
      );
    }
    case "line":
    case "forecast": {
      // A span still running would read as a drop: the forecast starts from the last complete one.
      const base = last?.toDate ? pts.slice(0, -1) : pts;
      const fc = widget.template === "forecast" || widget.settings.showForecast ? forecast(base, by)?.points ?? null : null;
      const showTarget = widget.settings.showTarget !== false;
      const view = !showTarget || (combined && !targets?.range) ? { ...m, target_min: null, target_max: null } : m;
      return (
        <div className="flex h-full flex-col">
          {widget.template === "forecast" && fc && (
            <p className="mb-1 text-xs text-muted-foreground">
              Expected {formatValue(m, fc[fc.length - 1].value)} by {periodLabel(fc[fc.length - 1].period, by, data.yearStart)} (likely {compactValue(m, fc[fc.length - 1].lo)}–{compactValue(m, fc[fc.length - 1].hi)})
            </p>
          )}
          <div className="min-h-0 flex-1"><MetricChart metric={view} points={pts} forecast={fc} height="100%" onPointContext={ctx} yearStart={data.yearStart} by={by} toDate={!!last?.toDate} name={(p) => { const x = pts.find((q) => q.period === p); return x ? name(x) : periodLabel(p, by, data.yearStart); }} targetLine={showTarget && combined ? targets?.line : undefined} /></div>
          {note && showTarget && <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>}
        </div>
      );
    }
    case "bars": {
      const showTarget = widget.settings.showTarget !== false;
      return (
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1"><Bars metric={m} points={pts} by={by} name={name} goal={goal} band={showTarget && (!combined || !!targets?.range)} yearStart={data.yearStart} onPointContext={ctx} /></div>
          {note && showTarget && <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>}
        </div>
      );
    }
    case "gauge":
      return <Gauge metric={m} value={last?.value} history={pts.map((p) => p.value)} />;
    case "table": {
      const rows = all.slice(-(widget.settings.rows ?? 6)).reverse();
      return (
        <div>
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.period} className="border-b border-border last:border-0" onContextMenu={ctx ? () => ctx(r.period) : undefined}>
                  <td className="py-1.5 text-muted-foreground"><span className="flex items-center gap-1" title={r.toDate ? name(r) : undefined}>{name(r, true)}<ApprovalMark data={data} metricId={m.id} period={r.period} through={combined ? r.through : undefined} short /></span></td>
                  <td className={cn("fig py-1.5 text-right", health(goal(r), r.value) === "bad" && "text-destructive")}>{formatValue(m, r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
        </div>
      );
    }
    case "correlation": {
      const b = ms[1];
      const res = b ? pearson(all, data.series[b.slug] ?? []) : null;
      if (!b || !res) return <Empty>Needs two metrics with the same period and at least 6 shared values.</Empty>;
      return (
        <div className="flex h-full flex-col">
          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{strength(res.r)}</span> relationship, r = <span className="fig">{res.r.toFixed(2)}</span> over {res.n} {m.period}s</p>
          <div className="min-h-0 flex-1"><ScatterView x={b} y={m} pairs={res.pairs.map((p) => ({ period: p.period, x: p.y, y: p.x }))} height="100%" yearStart={data.yearStart} /></div>
        </div>
      );
    }
    case "matrix":
      return <Matrix metrics={ms} series={data.series} />;
    case "drivers":
      return <Drivers target={m} others={ms.slice(1)} series={data.series} yearStart={data.yearStart} />;
  }
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">{children}</div>;
}

function Bars({ metric, points, by, name, goal, band, yearStart, onPointContext }: { metric: Metric; points: DisplayPoint[]; by: Span; name: (p: DisplayPoint, short?: boolean) => string; goal: (p: DisplayPoint) => Pick<Metric, "target_min" | "target_max">; band: boolean; yearStart: YearStart; onPointContext?: (p: string) => void }) {
  const hovered = useRef<string | null>(null);
  // A span still running is hatched, so it is not read as a drop (spec 0018).
  const hatch = `hatch-${useId().replace(/:/g, "")}`;
  const byPeriod = new Map(points.map((p) => [p.period, p]));
  return (
    <div className="h-full" role="img" aria-label={`${metric.name}, ${spanCount(points.length, by)}`} onContextMenu={() => hovered.current && onPointContext?.(hovered.current)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart accessibilityLayer={false} data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <pattern id={hatch} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--color-data)" fillOpacity={0.25} />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-data)" strokeWidth="3" />
            </pattern>
          </defs>
          {band && (metric.target_min !== null || metric.target_max !== null) && (
            <ReferenceArea y1={metric.target_min ?? 0} y2={metric.target_max ?? undefined} fill="var(--color-band)" fillOpacity={0.6} ifOverflow="extendDomain" />
          )}
          <XAxis dataKey="period" tickFormatter={(p) => periodLabel(p, by, yearStart, true)} tick={{ fontSize: 11, fill: "var(--color-muted)" }} minTickGap={16} stroke="var(--color-rule-2)" />
          <YAxis tickFormatter={(v) => compactValue(metric, v)} tick={{ fontSize: 11, fill: "var(--color-muted)", fontFamily: "var(--font-outlier)" }} width={56} stroke="var(--color-rule-2)" />
          <Tooltip formatter={(v) => [formatValue(metric, Number(v)), metric.name]} labelFormatter={(p) => { const x = byPeriod.get(String(p)); return x ? name(x) : periodLabel(String(p), by, yearStart); }} contentStyle={{ borderRadius: 8, fontSize: 12 }} cursor={{ fill: "var(--color-paper-3)" }} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false} onMouseEnter={(d) => (hovered.current = (d as unknown as { period: string }).period)}>
            {points.map((p) => (
              <Cell key={p.period} data-to-date={p.toDate || undefined} fill={p.toDate ? `url(#${hatch})` : health(goal(p), p.value) === "bad" ? "var(--color-error)" : "var(--color-data)"} fillOpacity={0.85} stroke={p.toDate ? "var(--color-data)" : undefined} strokeDasharray={p.toDate ? "3 2" : undefined} />
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
                const bg = r === null ? "var(--color-paper-2)" : r >= 0 ? `color-mix(in oklch, var(--color-data) ${Math.abs(r) * 55}%, var(--color-cotton))` : `color-mix(in oklch, var(--color-error) ${Math.abs(r) * 55}%, var(--color-cotton))`;
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

function Drivers({ target, others, series, yearStart }: { target: Metric; others: Metric[]; series: Record<string, Point[]>; yearStart: YearStart }) {
  const ranked = others
    .filter((o) => o.period === target.period && !o.formula?.includes(`{${target.slug}}`) && !target.formula?.includes(`{${o.slug}}`))
    .map((o) => ({ o, res: pearson(series[target.slug] ?? [], series[o.slug] ?? []) }))
    .filter((x) => x.res && Number.isFinite(x.res.r))
    .sort((a, b) => Math.abs(b.res!.r) - Math.abs(a.res!.r));
  if (!ranked.length) return <Empty>No other {PERIOD_LABEL[target.period].toLowerCase()} metric to compare with.</Empty>;
  const top = ranked[0];
  return (
    <div className="flex h-full flex-col gap-2">
      <ul className="space-y-1">
        {ranked.map(({ o, res }) => (
          <li key={o.id} className="grid grid-cols-[minmax(0,8rem)_1fr_3rem] items-center gap-2 text-xs">
            <span className="truncate">{o.name}</span>
            <span className="h-2 rounded-full bg-[var(--color-paper-3)]">
              <span className="block h-2 rounded-full" style={{ width: `${Math.abs(res!.r) * 100}%`, background: res!.r >= 0 ? "var(--color-data)" : "var(--color-error)" }} />
            </span>
            <span className="fig text-right">{res!.r.toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{top.o.name}</span> moves most with {target.name} ({strength(top.res!.r)}).</p>
      <div className="min-h-0 flex-1"><ScatterView x={top.o} y={target} pairs={top.res!.pairs.map((p) => ({ period: p.period, x: p.y, y: p.x }))} height="100%" yearStart={yearStart} /></div>
    </div>
  );
}

/** Whether a value waits for Approval or is locked (GLOSSARY: Approval, Lock), wherever a value is shown. */
export function ApprovalMark({ data, metricId, period, through, short }: { data: CanvasData; metricId: number; period: string; through?: string; short?: boolean }) {
  // A span shown by a Display Period (`through` set) waits while any of its periods does; it is never one locked period.
  if (through !== undefined ? data.pending?.[metricId]?.some((p) => p >= period && p <= through) : data.pending?.[metricId]?.includes(period))
    return <span title="Not approved yet" className="rounded-[var(--radius-input)] border border-dashed border-[var(--color-accent-2)] px-1 text-[10px] leading-4 text-[var(--color-accent-2)]">{short ? "unapproved" : "not approved yet"}</span>;
  if (through === undefined && data.locked?.[metricId]?.includes(period)) return <Lock aria-label="Locked" className="size-3" />;
  return null;
}
