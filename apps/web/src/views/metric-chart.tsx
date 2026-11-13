"use client";
// PROTOTYPE: Views are hardcoded. This folder is where the View plugin seam would go.
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactValue, formatValue, periodLabel } from "@ziffr/core/format";
import type { MetricDescription, Point } from "@ziffr/core/types";
import type { ForecastPoint } from "@/analyses/forecast";

type Row = { period: string; value?: number; fc?: number; band?: [number, number] };

export function MetricChart({
  metric,
  points,
  forecast,
  markers = [],
  selected,
  onSelect,
  onPointContext,
  height = 300,
}: {
  metric: MetricDescription;
  points: Point[];
  forecast?: ForecastPoint[] | null;
  markers?: string[];
  selected?: string | null;
  onSelect?: (period: string) => void;
  onPointContext?: (period: string) => void;
  height?: number | string;
}) {
  const rows: Row[] = points.map((p) => ({ period: p.period, value: p.value }));
  if (forecast?.length && rows.length) {
    const last = rows[rows.length - 1];
    last.fc = last.value;
    last.band = [last.value!, last.value!];
    for (const f of forecast) rows.push({ period: f.period, fc: f.value, band: [f.lo, f.hi] });
  }
  const values = rows.flatMap((r) => [r.value, ...(r.band ?? [])]).filter((v): v is number => v !== undefined);
  const lo = Math.min(...values, metric.target_min ?? Infinity);
  const hi = Math.max(...values, metric.target_max ?? -Infinity);
  const pad = (hi - lo) * 0.08 || 1;
  const domain: [number, number] = [Math.max(0, lo - pad), hi + pad];
  const byPeriod = new Map(rows.map((r) => [r.period, r]));
  const mp = metric.period;

  return (
    <div style={{ height }} role="img" aria-label={`${metric.name}, ${points.length} ${metric.period}s${points.length ? `, latest ${formatValue(metric, points[points.length - 1].value)}` : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          accessibilityLayer={false}
          data={rows}
          margin={{ top: 12, right: 12, bottom: 0, left: 8 }}
        >
          <CartesianGrid vertical={false} stroke="var(--color-rule)" />
          {(metric.target_min !== null || metric.target_max !== null) && (
            <ReferenceArea
              y1={metric.target_min ?? domain[0]}
              y2={metric.target_max ?? domain[1]}
              fill="var(--color-band)"
              fillOpacity={0.6}
              stroke="none"
              ifOverflow="extendDomain"
            />
          )}
          <XAxis dataKey="period" tickFormatter={(p) => periodLabel(p, mp, true)} tick={{ fontSize: 12, fill: "var(--color-muted)" }} minTickGap={24} stroke="var(--color-rule-2)" />
          <YAxis domain={domain} tickFormatter={(v) => compactValue(metric, v)} tick={{ fontSize: 12, fill: "var(--color-muted)", fontFamily: "var(--font-outlier)" }} width={68} stroke="var(--color-rule-2)" />
          <Tooltip
            content={({ active, payload }) => {
              const r = payload?.[0]?.payload as Row | undefined;
              if (!active || !r) return null;
              return (
                <div className="stock rounded-[var(--radius-input)] px-2.5 py-1.5 text-xs">
                  <div className="font-medium">{periodLabel(r.period, mp)}</div>
                  {r.value !== undefined ? (
                    <div>{metric.name}: <span className="fig">{formatValue(metric, r.value)}</span></div>
                  ) : (
                    <>
                      <div>Forecast: <span className="fig">{formatValue(metric, r.fc!)}</span></div>
                      {r.band && <div className="text-muted-foreground">Likely {formatValue(metric, r.band[0])} – {formatValue(metric, r.band[1])}</div>}
                    </>
                  )}
                </div>
              );
            }}
          />
          <Area dataKey="band" stroke="none" fill="var(--color-data)" fillOpacity={0.07} isAnimationActive={false} />
          <Line dataKey="fc" stroke="var(--color-muted)" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          <Line
            dataKey="value"
            stroke="var(--color-data)"
            strokeWidth={1.75}
            isAnimationActive={false}
            activeDot={false}
            dot={(p: { cx?: number; cy?: number; index?: number; payload?: Row }) => {
              if (p.cx === undefined || p.cy === undefined || p.payload?.value === undefined) return <g key={p.index} />;
              const period = p.payload.period;
              return (
                <g key={p.index} data-period={period} onClick={onSelect ? () => onSelect(period) : undefined} onContextMenu={onPointContext ? () => onPointContext(period) : undefined} className={onSelect ? "cursor-pointer" : undefined}>
                  {(onSelect || onPointContext) && <circle cx={p.cx} cy={p.cy} r={12} fill="transparent" />}
                  {points.length < 40 && <circle cx={p.cx} cy={p.cy} r={3} fill="var(--color-cotton)" stroke="var(--color-data)" strokeWidth={1.5} />}
                </g>
              );
            }}
          />
          {markers.map((p) =>
            byPeriod.get(p)?.value !== undefined ? (
              <ReferenceDot key={p} x={p} y={byPeriod.get(p)!.value!} r={9} fill="none" stroke="var(--color-ink)" strokeWidth={1.5} strokeDasharray="3 2" />
            ) : null,
          )}
          {selected && byPeriod.get(selected)?.value !== undefined && (
            <ReferenceDot x={selected} y={byPeriod.get(selected)!.value!} r={7} fill="var(--color-ink)" stroke="var(--color-cotton)" strokeWidth={2} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
