"use client";
// A View Design's plot (GLOSSARY: View Design): its marks drawn against a period or value axis, with the values the
// core worked out (design-view.tsx). The look of each mark comes from Theme tokens; how a span still running or one
// with gaps is drawn (dotted, open, hatched, spec 0018) is Ziffr's rule, the same in every design.
import { useId, useRef } from "react";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { compactValue, formatValue, health } from "@ziffr/core/format";
import { commonPeriod } from "@ziffr/core/correlation";
import { isPartial, spanCount } from "@ziffr/core/display-periods";
import { periodLabel } from "@ziffr/core/periods";
import type { Part, PlotMark, Tone } from "@ziffr/core/view-design";
import type { DesignValues } from "./design-view";

type Plot = Extract<Part, { mark: "plot" }>;
type Row = { period: string; value?: number; fc?: number; band?: [number, number]; partial?: number; target?: number };

// Theme tokens only: a design names a role, the Theme gives it a colour.
const TONE: Record<Exclude<Tone, "status">, string> = { data: "var(--color-data)", muted: "var(--color-muted)", ink: "var(--color-ink)", good: "var(--color-success)", bad: "var(--color-error)", accent: "var(--color-accent)" };

const tick = (size: number, figures = false) => ({ fontSize: size, fill: "var(--color-muted)", ...(figures ? { fontFamily: "var(--font-outlier)" } : {}) });

/** A plot of a View Design: lines, areas, bars, bands and rules over the periods, or points of two Metrics. */
export function DesignPlot({ part, v, onPointContext }: { part: Plot; v: DesignValues; onPointContext?: (period: string) => void }) {
  const marks = part.marks.filter((k) => (k.when ?? []).every((f) => v.flags[f]));
  return part.x === "value" ? <PairsPlot part={part} marks={marks} v={v} /> : <PeriodPlot part={part} marks={marks} v={v} onPointContext={onPointContext} />;
}

function PeriodPlot({ part, marks, v, onPointContext }: { part: Plot; marks: PlotMark[]; v: DesignValues; onPointContext?: (period: string) => void }) {
  const { m, pts, last, data } = v;
  const hovered = useRef<string | null>(null);
  // A span still running is hatched, so it is not read as a drop (spec 0018).
  const hatch = `hatch-${useId().replace(/:/g, "")}`;
  const full = marks.find((k): k is Extract<PlotMark, { mark: "line" }> => k.mark === "line" && k.show === "values" && k.detail === "full");
  const bars = marks.find((k) => k.mark === "bar");
  const bandOn = marks.some((k) => k.mark === "band") && v.band;
  const fc = marks.some((k) => k.show === "forecast" || k.show === "forecast.range") ? v.fc : null;
  const targetLine = marks.some((k) => k.show === "target.line") && v.combined ? v.targets?.line : undefined;
  const toDate = !!last?.toDate;

  const rows: Row[] = pts.map((p) => ({ period: p.period, value: p.value }));
  if (full && toDate && rows.length > 1) {
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
  if (fc?.length && rows.length) {
    // The forecast starts from the last complete point; a running span's own row takes the first forecast step.
    const anchor = [...rows].reverse().find((r) => r.value !== undefined);
    if (anchor) {
      anchor.fc = anchor.value;
      anchor.band = [anchor.value!, anchor.value!];
    }
    for (const f of fc) {
      const same = rows.find((r) => r.period === f.period);
      if (same) Object.assign(same, { fc: f.value, band: [f.lo, f.hi] });
      else rows.push({ period: f.period, fc: f.value, band: [f.lo, f.hi] });
    }
  }
  const tMin = bandOn ? m.target_min : null;
  const tMax = bandOn ? m.target_max : null;
  let domain: [number, number] | ["dataMin", "dataMax"] | undefined;
  if (part.scale === "padded") {
    const values = rows.flatMap((r) => [r.value, r.partial, r.target, ...(r.band ?? [])]).filter((x): x is number => x !== undefined);
    const lo = Math.min(...values, tMin ?? Infinity);
    const hi = Math.max(...values, tMax ?? -Infinity);
    const pad = (hi - lo) * 0.08 || 1;
    domain = [Math.max(0, lo - pad), hi + pad];
  } else if (part.scale === "tight") domain = ["dataMin", "dataMax"];

  const byPeriod = new Map(pts.map((p) => [p.period, p]));
  const label = (p: string) => { const x = byPeriod.get(p); return x ? v.name(x) : periodLabel(p, v.by, data.yearStart); };
  const status = (p: { value: number } | undefined) => health(v.goal(p as never), p?.value);
  const lineTone = (t: Tone | undefined) => (t === "status" ? (status(last) === "bad" ? TONE.bad : status(last) === "good" ? TONE.good : TONE.data) : TONE[t ?? "data"]);
  const compact = part.axes === "compact";
  const none = part.axes === "none";
  const margin = none ? undefined : compact ? { top: 4, right: 4, bottom: 0, left: 0 } : { top: 12, right: 12, bottom: 0, left: 8 };
  const aria = none ? undefined : `${m.name}, ${spanCount(pts.length, v.by)}${pts.length ? `, latest ${formatValue(m, pts[pts.length - 1].value, data.numberStyle)}` : ""}`;

  return (
    <div style={{ height: "100%" }} role={none ? undefined : "img"} aria-label={aria} aria-hidden={none || undefined} onContextMenu={bars ? () => hovered.current && onPointContext?.(hovered.current) : undefined}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart accessibilityLayer={false} data={rows} margin={margin}>
          {bars && (
            <defs>
              <pattern id={hatch} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--color-data)" fillOpacity={0.25} />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-data)" strokeWidth="3" />
              </pattern>
            </defs>
          )}
          {part.grid === "horizontal" && <CartesianGrid vertical={false} stroke="var(--color-rule)" />}
          {part.grid === "both" && <CartesianGrid stroke="var(--color-rule)" />}
          {!none && <XAxis dataKey="period" tickFormatter={(p) => periodLabel(p, v.by, data.yearStart, true)} tick={tick(compact ? 11 : 12)} minTickGap={compact ? 16 : 24} stroke="var(--color-rule-2)" />}
          {none ? <YAxis hide domain={domain} /> : <YAxis domain={domain} tickFormatter={(x) => compactValue(m, x, data.numberStyle)} tick={tick(compact ? 11 : 12, true)} width={compact ? 56 : 68} stroke="var(--color-rule-2)" />}
          {!none && <Tooltip content={({ active, payload }) => <PeriodTip active={active} row={payload?.[0]?.payload as Row | undefined} v={v} label={label} />} cursor={bars ? { fill: "var(--color-paper-3)" } : undefined} />}
          {marks.map((k, i) => {
            switch (k.mark) {
              case "band":
                if (!bandOn || (tMin === null && tMax === null)) return null;
                return Array.isArray(domain) && typeof domain[0] === "number"
                  ? <ReferenceArea key={i} y1={tMin ?? domain[0]} y2={tMax ?? (domain[1] as number)} fill="var(--color-band)" fillOpacity={0.6} stroke="none" ifOverflow="extendDomain" />
                  : <ReferenceArea key={i} y1={tMin ?? 0} y2={tMax ?? undefined} fill="var(--color-band)" fillOpacity={0.6} ifOverflow="extendDomain" />;
              case "rule": {
                const y = k.show === "average" ? avg(pts.map((p) => p.value)) : k.show === "target.min" ? m.target_min : m.target_max;
                return y === null || y === undefined ? null : <ReferenceLine key={i} y={y} stroke={lineTone(k.tone ?? "muted")} strokeDasharray="4 3" ifOverflow="extendDomain" />;
              }
              case "area":
                return fc ? <Area key={i} dataKey="band" stroke="none" fill={lineTone(k.tone)} fillOpacity={0.07} isAnimationActive={false} /> : null;
              case "bar":
                return (
                  <Bar key={i} dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false} onMouseEnter={(d) => (hovered.current = (d as unknown as { period: string }).period)}>
                    {pts.map((p) => (
                      <Cell key={p.period} data-to-date={p.toDate || undefined} data-partial={isPartial(p) || undefined} fill={p.toDate || isPartial(p) ? `url(#${hatch})` : k.tone === "status" && status(p) === "bad" ? TONE.bad : lineTone(k.tone === "status" ? "data" : k.tone)} fillOpacity={0.85} stroke={p.toDate || isPartial(p) ? "var(--color-data)" : undefined} strokeDasharray={p.toDate ? "3 2" : undefined} />
                    ))}
                  </Bar>
                );
              case "line": {
                const stroke = lineTone(k.tone);
                const weight = k.weight === "strong" ? { strokeWidth: 1.75 } : k.weight === "light" ? { strokeWidth: 1, strokeOpacity: 0.8 } : {};
                const dash = k.dash ? "5 4" : undefined;
                if (k.show === "forecast") return fc ? <Line key={i} dataKey="fc" stroke={stroke} strokeDasharray={dash} {...weight} dot={false} isAnimationActive={false} /> : null;
                if (k.show === "target.line") return targetLine?.length ? <Line key={i} dataKey="target" stroke={stroke} {...weight} strokeDasharray={dash} dot={false} isAnimationActive={false} connectNulls /> : null;
                if (k !== full) return <Line key={i} dataKey="value" stroke={stroke} {...weight} strokeDasharray={dash} dot={false} isAnimationActive={false} />;
                return [
                  toDate ? <Line key={`${i}-to-date`} dataKey="partial" stroke={stroke} {...weight} strokeDasharray="2 3" isAnimationActive={false} activeDot={false} dot={(p: { cx?: number; cy?: number; index?: number; payload?: Row }) => (p.cx === undefined || p.cy === undefined || p.payload?.value !== undefined || p.payload?.partial === undefined ? <g key={p.index} /> : <circle key={p.index} data-to-date cx={p.cx} cy={p.cy} r={3} fill="var(--color-cotton)" stroke={stroke} strokeWidth={1.5} strokeDasharray="2 1.5" />)} /> : null,
                  <Line
                    key={i}
                    dataKey="value"
                    stroke={stroke}
                    {...weight}
                    strokeDasharray={dash}
                    isAnimationActive={false}
                    activeDot={false}
                    dot={(p: { cx?: number; cy?: number; index?: number; payload?: Row }) => {
                      if (p.cx === undefined || p.cy === undefined || p.payload?.value === undefined) return <g key={p.index} />;
                      const period = p.payload.period;
                      const x = byPeriod.get(period);
                      return (
                        <g key={p.index} data-period={period} onContextMenu={onPointContext ? () => onPointContext(period) : undefined}>
                          {onPointContext && <circle cx={p.cx} cy={p.cy} r={12} fill="transparent" />}
                          {x && isPartial(x) ? (
                            <circle data-partial cx={p.cx} cy={p.cy} r={4} fill="var(--color-cotton)" stroke={stroke} strokeWidth={1.5} strokeDasharray="2 2" />
                          ) : pts.length < 40 && <circle cx={p.cx} cy={p.cy} r={3} fill="var(--color-cotton)" stroke={stroke} strokeWidth={1.5} />}
                        </g>
                      );
                    }}
                  />,
                ];
              }
              case "point":
                return null;
            }
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function PeriodTip({ active, row: r, v, label }: { active?: boolean; row?: Row; v: DesignValues; label: (p: string) => string }) {
  if (!active || !r) return null;
  const { m, data } = v;
  const ns = data.numberStyle;
  return (
    <div className="stock rounded-[var(--radius-input)] px-2.5 py-1.5 text-xs">
      <div className="font-medium">{label(r.period)}</div>
      {r.value !== undefined || r.partial !== undefined ? (
        <>
          <div>{m.name}: <span className="fig">{formatValue(m, r.value ?? r.partial!, ns)}</span></div>
          {r.target !== undefined && <div className="text-muted-foreground">Target: <span className="fig">{formatValue(m, r.target, ns)}</span></div>}
        </>
      ) : r.fc !== undefined ? (
        <>
          <div>Forecast: <span className="fig">{formatValue(m, r.fc, ns)}</span></div>
          {r.band && <div className="text-muted-foreground">Likely {formatValue(m, r.band[0], ns)} – {formatValue(m, r.band[1], ns)}</div>}
        </>
      ) : null}
    </div>
  );
}

/** Two Metrics against each other, one dot per common period: the longer of their periods (spec 0019). */
function PairsPlot({ marks, v }: { part: Plot; marks: PlotMark[]; v: DesignValues }) {
  const { m: y, data } = v;
  const ns = data.numberStyle;
  const point = marks.find((k): k is Extract<PlotMark, { mark: "point" }> => k.mark === "point");
  const top = v.drivers?.ranked[0];
  const res = point?.show === "drivers.pairs" ? top?.result : v.correlation?.ok ? v.correlation : undefined;
  const x = point?.show === "drivers.pairs" ? top?.metric : v.metrics[1];
  if (!res || !x) return null;
  // correlate() pairs the first Metric (x) with the second (y); the plot puts the second across.
  const pairs = res.pairs.map((p) => ({ period: p.period, x: p.y, y: p.x }));
  return (
    <div style={{ height: "100%" }} role="img" aria-label={`${y.name} against ${x.name}, ${pairs.length} points`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart accessibilityLayer={false} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--color-rule)" />
          <XAxis type="number" dataKey="x" name={x.name} domain={["auto", "auto"]} tickFormatter={(n) => compactValue(x, n, ns)} tick={tick(12, true)} stroke="var(--color-rule-2)" />
          <YAxis type="number" dataKey="y" name={y.name} domain={["auto", "auto"]} tickFormatter={(n) => compactValue(y, n, ns)} tick={tick(12, true)} width={68} stroke="var(--color-rule-2)" />
          <Tooltip
            content={({ payload }) => {
              const p = payload?.[0]?.payload as { period: string; x: number; y: number } | undefined;
              if (!p) return null;
              return (
                <div className="stock rounded-[var(--radius-input)] px-2.5 py-1.5 text-xs">
                  <div className="font-medium">{periodLabel(p.period, commonPeriod(x.period, y.period), data.yearStart)}</div>
                  <div>{x.name}: <span className="fig">{formatValue(x, p.x, ns)}</span></div>
                  <div>{y.name}: <span className="fig">{formatValue(y, p.y, ns)}</span></div>
                </div>
              );
            }}
          />
          {point && <Scatter data={pairs} fill={point.tone && point.tone !== "status" ? TONE[point.tone] : TONE.data} isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
