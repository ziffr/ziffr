"use client";
// PROTOTYPE: Views are hardcoded. This folder is where the View plugin seam would go.
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisLabels, compactValue, formatValue, niceAxis } from "@ziffr/core/format";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { MetricDescription, Point } from "@ziffr/core/types";
import type { ForecastPoint } from "@ziffr/core/forecast";
import { periodLabel, shiftPeriod, type Span, type YearStart } from "@ziffr/core/periods";

type Row = { period: string; value?: number; fc?: number; band?: [number, number]; partial?: number; target?: number };

export function MetricChart({
  metric,
  points,
  forecast,
  markers = [],
  selected,
  onSelect,
  onPointContext,
  height = 300,
  yearStart,
  numberStyle,
  by,
  toDate = false,
  partial,
  name,
  targetLine,
  gaps = false,
}: {
  metric: MetricDescription;
  points: Point[];
  /** The workspace's year start, for naming periods. */
  yearStart: YearStart;
  /** How the workspace writes numbers. */
  numberStyle: NumberStyle;
  forecast?: ForecastPoint[] | null;
  markers?: string[];
  selected?: string | null;
  onSelect?: (period: string) => void;
  onPointContext?: (period: string) => void;
  height?: number | string;
  /** The span each point stands for (GLOSSARY: Display Period); the Metric's own period by default. */
  by?: Span;
  /** The latest point is a span not over yet: drawn dotted, so it is not read as a drop. */
  toDate?: boolean;
  /** Whether a point is a span that is over but has values for only some of its periods: drawn as an open, dashed
   * point, and named so in the tooltip ("only 2 of 3 months"). */
  partial?: (period: string) => boolean;
  /** A point's name in the tooltip, such as "Q4 2026 to date, 2 of 3 months". */
  name?: (period: string) => string;
  /** Targets per point (a Target Series combined by a Display Period), drawn as a thin line. */
  targetLine?: Point[];
  /** Draw a period that has no value as a gap in the line. */
  gaps?: boolean;
}) {
  const rows: Row[] = points.map((p) => ({ period: p.period, value: p.value }));
  if (gaps) {
    // A period with no value is a row without one, so the line breaks there (never a 0, never a line across).
    const step = by ?? metric.period;
    for (let i = rows.length - 1; i > 0; i--) {
      const missing: Row[] = [];
      for (let p = shiftPeriod(rows[i - 1].period, step, 1); p < rows[i].period && missing.length < 400; p = shiftPeriod(p, step, 1)) missing.push({ period: p });
      rows.splice(i, 0, ...missing);
    }
  }
  if (toDate && rows.length > 1) {
    // The last stretch, to the span still running, is its own dotted line; the solid one ends before it.
    const cur = rows[rows.length - 1];
    rows[rows.length - 2].partial = rows[rows.length - 2].value;
    cur.partial = cur.value;
    cur.value = undefined;
  }
  for (const t of targetLine ?? []) {
    const r = rows.find((x) => x.period === t.period);
    if (r) r.target = t.value;
  }
  if (forecast?.length && rows.length) {
    // The forecast starts from the last complete point; a running span's own row takes the first forecast step.
    const anchor = [...rows].reverse().find((r) => r.value !== undefined);
    if (anchor) {
      anchor.fc = anchor.value;
      anchor.band = [anchor.value!, anchor.value!];
    }
    for (const f of forecast) {
      const same = rows.find((r) => r.period === f.period);
      if (same) Object.assign(same, { fc: f.value, band: [f.lo, f.hi] });
      else rows.push({ period: f.period, fc: f.value, band: [f.lo, f.hi] });
    }
  }
  const values = rows.flatMap((r) => [r.value, r.partial, r.target, ...(r.band ?? [])]).filter((v): v is number => v !== undefined);
  const lo = Math.min(...values, metric.target_min ?? Infinity);
  const hi = Math.max(...values, metric.target_max ?? -Infinity);
  // Nice steps in one notation (ticket #184): never 92.35, 3,592.35, 10.6k on one axis.
  const axis = niceAxis(values.length ? lo : 0, values.length ? hi : 1);
  const domain = axis.domain;
  const axisText = new Map(axis.ticks.map((t, i) => [t, axisLabels(metric, axis.ticks, axis.step, numberStyle)[i]]));
  const byPeriod = new Map(rows.map((r) => [r.period, r]));
  const mp = by ?? metric.period;
  const label = (p: string) => name?.(p) ?? periodLabel(p, mp, yearStart);

  return (
    <div style={{ height }} role="img" aria-label={`${metric.name}, ${points.length} ${metric.period}s${points.length ? `, latest ${formatValue(metric, points[points.length - 1].value, numberStyle)}` : ""}`}>
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
          <XAxis dataKey="period" tickFormatter={(p) => periodLabel(p, mp, yearStart, true)} tick={{ fontSize: 12, fill: "var(--color-muted)" }} minTickGap={24} stroke="var(--color-rule-2)" />
          <YAxis domain={domain} ticks={axis.ticks.length ? axis.ticks : undefined} interval={axis.ticks.length ? 0 : undefined} tickFormatter={(v) => axisText.get(v) ?? compactValue(metric, v, numberStyle)} tick={{ fontSize: 12, fill: "var(--color-muted)", fontFamily: "var(--font-outlier)" }} width={68} stroke="var(--color-rule-2)" />
          <Tooltip
            content={({ active, payload }) => {
              const r = payload?.[0]?.payload as Row | undefined;
              if (!active || !r) return null;
              return (
                <div className="stock rounded-[var(--radius-input)] px-2.5 py-1.5 text-xs">
                  <div className="font-medium">{label(r.period)}</div>
                  {r.value !== undefined || r.partial !== undefined ? (
                    <>
                      <div>{metric.name}: <span className="fig">{formatValue(metric, r.value ?? r.partial!, numberStyle)}</span></div>
                      {r.target !== undefined && <div className="text-muted-foreground">Target: <span className="fig">{formatValue(metric, r.target, numberStyle)}</span></div>}
                    </>
                  ) : (
                    <>
                      <div>Forecast: <span className="fig">{formatValue(metric, r.fc!, numberStyle)}</span></div>
                      {r.band && <div className="text-muted-foreground">Likely {formatValue(metric, r.band[0], numberStyle)} – {formatValue(metric, r.band[1], numberStyle)}</div>}
                    </>
                  )}
                </div>
              );
            }}
          />
          <Area dataKey="band" stroke="none" fill="var(--color-data)" fillOpacity={0.07} isAnimationActive={false} />
          <Line dataKey="fc" stroke="var(--color-muted)" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          {targetLine?.length ? <Line dataKey="target" stroke="var(--color-muted)" strokeWidth={1} strokeOpacity={0.8} dot={false} isAnimationActive={false} connectNulls /> : null}
          {toDate && <Line dataKey="partial" stroke="var(--color-data)" strokeWidth={1.75} strokeDasharray="2 3" isAnimationActive={false} activeDot={false} dot={(p: { cx?: number; cy?: number; index?: number; payload?: Row }) => (p.cx === undefined || p.cy === undefined || p.payload?.value !== undefined || p.payload?.partial === undefined ? <g key={p.index} /> : <circle key={p.index} data-to-date cx={p.cx} cy={p.cy} r={3} fill="var(--color-cotton)" stroke="var(--color-data)" strokeWidth={1.5} strokeDasharray="2 1.5" />)} />}
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
                  {partial?.(period) ? (
                    <circle data-partial cx={p.cx} cy={p.cy} r={4} fill="var(--color-cotton)" stroke="var(--color-data)" strokeWidth={1.5} strokeDasharray="2 2" />
                  ) : points.length < 40 && <circle cx={p.cx} cy={p.cy} r={3} fill="var(--color-cotton)" stroke="var(--color-data)" strokeWidth={1.5} />}
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
