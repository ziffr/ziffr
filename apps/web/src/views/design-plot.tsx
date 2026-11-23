"use client";
// A View Design's plot (GLOSSARY: View Design): its marks drawn against a period or value axis, with the values the
// core worked out (design-view.tsx). The look of each mark comes from Theme tokens; how a span still running or one
// with gaps is drawn (dotted, open, hatched, spec 0018) is Ziffr's rule, the same in every design.
import { useId, useRef, useState } from "react";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { axisLabels, compactValue, formatValue, health, niceAxis } from "@ziffr/core/format";
import { formatOutput } from "@ziffr/core/design-analysis";
import { drawnOutputs } from "@ziffr/core/analysis-recipe";
import { commonPeriod } from "@ziffr/core/correlation";
import { isPartial, spanCount } from "@ziffr/core/display-periods";
import { periodLabel } from "@ziffr/core/periods";
import type { Part, PlotMark, Tone } from "@ziffr/core/view-design";
import type { DesignValues } from "./design-view";
import { useWidgetScale } from "./widget-scale";
import { sparklineContext, type SparklineContext } from "./sparkline-context";
import { ObservationTip } from "./observation-tip";

type Plot = Extract<Part, { mark: "plot" }>;
// A recipe output is kept on its row under "recipe:" and the step, never under a name a value could have.
type Row = { period: string; value?: number; fc?: number; band?: [number, number]; partial?: number; target?: number; [recipe: `recipe:${string}`]: number | undefined };

// Theme tokens only: a design names a role, the Theme gives it a colour.
export const TONE: Record<Exclude<Tone, "status">, string> = { data: "var(--color-data)", muted: "var(--color-muted)", ink: "var(--color-ink)", good: "var(--color-success)", bad: "var(--color-error)", accent: "var(--color-accent)" };

// Axis words grow with the card (widget scale, #763): 1 in a usual Widget, so they read as they always did.
const tick = (size: number, figures = false) => ({ fontSize: size, fill: "var(--color-muted)", ...(figures ? { fontFamily: "var(--font-outlier)" } : {}) });

/** A plot of a View Design: lines, areas, bars, bands and rules over the periods, or points of two Metrics. */
export function DesignPlot({ part, v, onPointContext }: { part: Plot; v: DesignValues; onPointContext?: (period: string) => void }) {
  const marks = part.marks.filter((k) => (k.when ?? []).every((f) => v.flags[f]));
  return part.x === "value" ? <PairsPlot part={part} marks={marks} v={v} /> : <PeriodPlot part={part} marks={marks} v={v} onPointContext={onPointContext} />;
}

function PeriodPlot({ part, marks, v, onPointContext }: { part: Plot; marks: PlotMark[]; v: DesignValues; onPointContext?: (period: string) => void }) {
  const { m, pts, last, data } = v;
  const s = useWidgetScale();
  const hovered = useRef<string | null>(null);
  // Escape closes the popup until the pointer moves or another point is chosen with the arrow keys (#789).
  const [closed, setClosed] = useState(false);
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
  // Each series a mark shows of the design's Analysis Recipe, on the periods the plot draws.
  for (const k of marks) {
    if (!k.show.startsWith("recipe.") || k.mark === "rule") continue;
    const res = v.recipe?.[k.show.slice("recipe.".length)];
    for (const p of res?.kind === "series" ? res.points : []) {
      const r = rows.find((x) => x.period === p.period);
      if (r) r[`recipe:${k.show.slice("recipe.".length)}`] = p.value;
    }
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
  let axis: { domain: [number, number]; ticks: number[]; step: number } | null = null;
  if (part.scale === "padded") {
    const recipeKeys = marks.filter((k) => k.show.startsWith("recipe.")).map((k) => `recipe:${k.show.slice("recipe.".length)}` as const);
    const ruled = marks.flatMap((k) => (k.mark === "rule" && k.show.startsWith("recipe.") ? [recipeValue(v, k.show)] : [])).filter((x): x is number => x !== null);
    const values = [...rows.flatMap((r) => [r.value, r.partial, r.target, ...(r.band ?? []), ...recipeKeys.map((key) => r[key])]), ...ruled].filter((x): x is number => x !== undefined && Number.isFinite(x));
    const lo = Math.min(...values, tMin ?? Infinity);
    const hi = Math.max(...values, tMax ?? -Infinity);
    // Nice steps in one notation (ticket #184): never 92.35, 3,592.35, 10.6k on one axis.
    axis = niceAxis(values.length ? lo : 0, values.length ? hi : 1);
    domain = axis.domain;
  } else if (part.scale === "tight") domain = ["dataMin", "dataMax"];

  const labels = axis ? new Map(axis.ticks.map((t, i) => [t, axisLabels(m, axis!.ticks, axis!.step, data.numberStyle)[i]])) : null;
  const axisText = (x: number) => labels?.get(x) ?? compactValue(m, x, data.numberStyle);
  const byPeriod = new Map(pts.map((p) => [p.period, p]));
  const label = (p: string) => { const x = byPeriod.get(p); return x ? v.name(x) : periodLabel(p, v.by, data.yearStart); };
  const status = (p: { value: number } | undefined) => health(v.goal(p as never), p?.value);
  const lineTone = (t: Tone | undefined) => (t === "status" ? (status(last) === "bad" ? TONE.bad : status(last) === "good" ? TONE.good : TONE.data) : TONE[t ?? "data"]);
  const compact = part.axes === "compact";
  const none = part.axes === "none";
  // A sparkline with room shows its context (ends, latest, highest and lowest, target; #782), on a fitted range.
  const ctx = none ? sparklineContext({ scale: s, points: pts, target: v.flags.showTarget ? v.goal(last) : null, bars: !!bars }) : null;
  if (ctx) domain = ctx.domain;
  const note = { fontSize: 11 * s, fill: "var(--color-muted)" };
  const strong = lineTone(marks.find((k) => k.mark === "line" || k.mark === "bar")?.tone);
  const margin = ctx ? { top: 18 * s, right: 6 * s, bottom: 18 * s, left: 6 * s } : none ? undefined : compact ? { top: 4 * s, right: 4 * s, bottom: 0, left: 0 } : { top: 12 * s, right: 12 * s, bottom: 0, left: 8 * s };
  // A popup on each point wherever there is an axis, and on a sparkline once it has room for its context.
  const tips = !none || !!ctx;
  const rangeEnd = marks.some((k) => k.mark === "range") ? fc?.[fc.length - 1] : undefined;
  // A range is also said in words, so its numbers are not read off the drawing alone.
  const aria = !tips ? undefined : none ? `${m.name}, ${spanCount(pts.length, v.by)}` : `${m.name}, ${spanCount(pts.length, v.by)}${pts.length ? `, latest ${formatValue(m, pts[pts.length - 1].value, data.numberStyle)}` : ""}${rangeEnd ? `, forecast ${formatValue(m, rangeEnd.value, data.numberStyle)}, likely between ${formatValue(m, rangeEnd.lo, data.numberStyle)} and ${formatValue(m, rangeEnd.hi, data.numberStyle)}` : ""}`;

  const chart = (
      <ResponsiveContainer width="100%" height="100%">
        {/* With a popup, the chart is reachable by keyboard: focus it, the arrow keys move between points (#789). */}
        <ComposedChart accessibilityLayer={tips} data={rows} margin={margin}>
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
          {!none && <XAxis dataKey="period" tickFormatter={(p) => periodLabel(p, v.by, data.yearStart, true)} tick={tick((compact ? 11 : 12) * s)} minTickGap={(compact ? 16 : 24) * s} height={30 * s} stroke="var(--color-rule-2)" />}
          {ctx && <XAxis dataKey="period" hide />}
          {ctx && <TargetMark ctx={ctx} text={(x) => compactValue(m, x, data.numberStyle)} note={note} s={s} />}
          {none ? <YAxis hide domain={domain} /> : <YAxis domain={domain} ticks={axis?.ticks.length ? axis.ticks : undefined} interval={axis?.ticks.length ? 0 : undefined} tickFormatter={(x) => axisText(x)} tick={tick((compact ? 11 : 12) * s, true)} width={(compact ? 56 : 68) * s} stroke="var(--color-rule-2)" />}
          {/* Beside the point, never over it; a bare sparkline has none, one with room does. */}
          {tips && <Tooltip active={closed ? false : undefined} offset={16 * s} content={({ active, payload }) => <PeriodTip active={active} row={payload?.[0]?.payload as Row | undefined} v={v} label={label} />} cursor={bars ? { fill: "var(--color-paper-3)" } : ctx ? { stroke: "var(--color-rule-2)" } : undefined} isAnimationActive={false} />}
          {marks.map((k, i) => {
            switch (k.mark) {
              case "band":
                if (!bandOn || (tMin === null && tMax === null)) return null;
                return Array.isArray(domain) && typeof domain[0] === "number"
                  ? <ReferenceArea key={i} y1={tMin ?? domain[0]} y2={tMax ?? (domain[1] as number)} fill="var(--color-band)" fillOpacity={0.6} stroke="none" ifOverflow="extendDomain" />
                  : <ReferenceArea key={i} y1={tMin ?? 0} y2={tMax ?? undefined} fill="var(--color-band)" fillOpacity={0.6} ifOverflow="extendDomain" />;
              case "rule": {
                const y = k.show.startsWith("recipe.") ? recipeValue(v, k.show) : k.show === "target.min" ? m.target_min : m.target_max;
                return y === null || y === undefined ? null : <ReferenceLine key={i} y={y} stroke={lineTone(k.tone ?? "muted")} strokeDasharray="4 3" ifOverflow="extendDomain" />;
              }
              case "area":
                return fc ? <Area key={i} dataKey="band" stroke="none" fill={lineTone(k.tone)} fillOpacity={0.07} isAnimationActive={false} /> : null;
              case "bar":
                if (k.show !== "values") return <Bar key={i} dataKey={`recipe:${k.show.slice("recipe.".length)}`} radius={[3, 3, 0, 0]} isAnimationActive={false} fill={lineTone(k.tone === "status" ? "data" : k.tone)} fillOpacity={0.85} />;
                return (
                  <Bar key={i} dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false} onMouseEnter={(d) => (hovered.current = (d as unknown as { period: string }).period)}>
                    {pts.map((p) => (
                      <Cell key={p.period} data-to-date={p.toDate || undefined} data-partial={isPartial(p) || undefined} fill={p.toDate || isPartial(p) ? `url(#${hatch})` : ctx && p.period !== ctx.last.period ? "var(--color-rule-2)" : k.tone === "status" && status(p) === "bad" ? TONE.bad : lineTone(k.tone === "status" ? "data" : k.tone)} fillOpacity={0.85} stroke={p.toDate || isPartial(p) ? "var(--color-data)" : undefined} strokeDasharray={p.toDate ? "3 2" : undefined} />
                    ))}
                  </Bar>
                );
              case "line": {
                const stroke = lineTone(k.tone);
                // Lines and dots grow with the card too, so a presented line is not a hairline (#778).
                const weight = k.weight === "strong" ? { strokeWidth: 1.75 * s } : k.weight === "light" ? { strokeWidth: 1 * s, strokeOpacity: 0.8 } : { strokeWidth: 1 * s };
                const dash = k.dash ? "5 4" : undefined;
                if (k.show === "forecast") return fc ? <Line key={i} dataKey="fc" stroke={stroke} strokeDasharray={dash} {...weight} dot={false} isAnimationActive={false} /> : null;
                if (k.show === "target.line") return targetLine?.length ? <Line key={i} dataKey="target" stroke={stroke} {...weight} strokeDasharray={dash} dot={false} isAnimationActive={false} connectNulls /> : null;
                if (k.show.startsWith("recipe.")) return <Line key={i} dataKey={`recipe:${k.show.slice("recipe.".length)}`} stroke={stroke} {...weight} strokeDasharray={dash} dot={false} isAnimationActive={false} connectNulls />;
                if (k !== full) return <Line key={i} dataKey="value" stroke={stroke} {...weight} strokeDasharray={dash} dot={false} isAnimationActive={false} />;
                return [
                  toDate ? <Line key={`${i}-to-date`} dataKey="partial" stroke={stroke} {...weight} strokeDasharray="2 3" isAnimationActive={false} activeDot={false} dot={(p: { cx?: number; cy?: number; index?: number; payload?: Row }) => (p.cx === undefined || p.cy === undefined || p.payload?.value !== undefined || p.payload?.partial === undefined ? <g key={p.index} /> : <circle key={p.index} data-to-date cx={p.cx} cy={p.cy} r={3 * s} fill="var(--color-cotton)" stroke={stroke} strokeWidth={1.5 * s} strokeDasharray="2 1.5" />)} /> : null,
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
                          {onPointContext && <circle cx={p.cx} cy={p.cy} r={12 * s} fill="transparent" />}
                          {x && isPartial(x) ? (
                            <circle data-partial cx={p.cx} cy={p.cy} r={4 * s} fill="var(--color-cotton)" stroke={stroke} strokeWidth={1.5 * s} strokeDasharray="2 2" />
                          ) : pts.length < 40 && <circle cx={p.cx} cy={p.cy} r={3 * s} fill="var(--color-cotton)" stroke={stroke} strokeWidth={1.5 * s} />}
                        </g>
                      );
                    }}
                  />,
                ];
              }
              case "range":
                // The forecast's likely range at each period as a bar from low to high (a floating bar), with the forecast as its middle value on request.
                return fc ? [
                  <Bar key={`${i}-range`} dataKey="band" barSize={Math.max(4, 8 * s)} radius={2} isAnimationActive={false} fill={lineTone(k.tone)} fillOpacity={0.3} stroke={lineTone(k.tone)} />,
                  ...(k.centre ? [<Line key={`${i}-centre`} dataKey="fc" stroke="none" dot={{ r: 3 * s, fill: lineTone(k.tone), stroke: "var(--color-cotton)" }} activeDot={false} isAnimationActive={false} />] : []),
                ] : null;
              case "point":
                return null;
            }
          })}
          {ctx && <RangeMarks ctx={ctx} text={(x) => compactValue(m, x, data.numberStyle)} note={note} s={s} strong={strong} bars={!!bars} />}
        </ComposedChart>
      </ResponsiveContainer>
  );
  return (
    <div
      style={{ height: "100%" }}
      role={tips ? "img" : undefined}
      aria-label={aria}
      aria-hidden={!tips || undefined}
      onContextMenu={bars ? () => hovered.current && onPointContext?.(hovered.current) : undefined}
      onKeyDown={tips ? (e) => setClosed(e.key === "Escape" ? true : e.key.startsWith("Arrow") ? false : closed) : undefined}
      onPointerMove={closed ? () => setClosed(false) : undefined}
    >
      {ctx ? (
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">{chart}</div>
          {/* The ends: the first and last period, no ticks between; a target out of reach is named here (#782). */}
          <div className="widget-text-xs flex items-baseline justify-between gap-[1em] px-[0.5em] text-muted-foreground">
            <span>{periodLabel(ctx.ends.first, v.by, data.yearStart, true)}</span>
            {ctx.target && !ctx.target.drawn && <span>{targetText(ctx.target, (x) => compactValue(m, x, data.numberStyle))} {ctx.target.side === "above" ? "↑" : "↓"}</span>}
            <span>{periodLabel(ctx.ends.last, v.by, data.yearStart, true)}</span>
          </div>
        </div>
      ) : chart}
    </div>
  );
}

type Note = { fontSize: number; fill: string };

/** "target 400", or "target 300–400" for a Target Range. */
const targetText = (t: { min: number | null; max: number | null }, text: (x: number) => string) =>
  `target ${t.min !== null && t.max !== null ? `${text(t.min)}–${text(t.max)}` : text((t.min ?? t.max)!)}`;

/** The target in a sparkline's context: a faint band for a range, a dashed line for one bound, labelled once at the right. */
function TargetMark({ ctx, text, note, s }: { ctx: SparklineContext; text: (x: number) => string; note: Note; s: number }) {
  const t = ctx.target;
  if (!t?.drawn) return null;
  const label = { value: targetText(t, text), position: "insideTopRight" as const, offset: 2 * s, ...note };
  return t.min !== null && t.max !== null
    ? <ReferenceArea y1={t.min} y2={t.max} fill="var(--color-band)" fillOpacity={0.45} stroke="none" label={label} />
    : <ReferenceLine y={(t.min ?? t.max)!} stroke="var(--color-muted)" strokeOpacity={0.6} strokeDasharray="4 3" label={label} />;
}

/** The latest value's dot (never labelled: the number is the headline), and the highest and lowest with a label each. */
function RangeMarks({ ctx, text, note, s, strong, bars }: { ctx: SparklineContext; text: (x: number) => string; note: Note; s: number; strong: string; bars: boolean }) {
  const edge = (p: { period: string; value: number }, position: "top" | "bottom") => (
    <ReferenceDot key={`${position}-${p.period}`} x={p.period} y={p.value} r={bars ? 0 : 2.5 * s} fill="var(--color-cotton)" stroke="var(--color-muted)" strokeWidth={1.25 * s} label={{ value: text(p.value), position, offset: 4 * s, ...note }} />
  );
  return (
    <>
      {ctx.high && edge(ctx.high, "top")}
      {ctx.low && edge(ctx.low, bars ? "top" : "bottom")}
      {!bars && <ReferenceDot x={ctx.last.period} y={ctx.last.value} r={3.5 * s} fill={strong} stroke="var(--color-cotton)" strokeWidth={1.5 * s} />}
    </>
  );
}


/** One value a design's recipe gives, for a rule: a step's value, or a series' latest. */
function recipeValue(v: DesignValues, show: string): number | null {
  const res = v.recipe?.[show.slice("recipe.".length)];
  if (!res) return null;
  return res.kind === "value" ? res.value : res.points[res.points.length - 1]?.value ?? null;
}

function PeriodTip({ active, row: r, v, label }: { active?: boolean; row?: Row; v: DesignValues; label: (p: string) => string }) {
  if (!active || !r) return null;
  const { m, data } = v;
  const ns = data.numberStyle;
  const value = r.value ?? r.partial;
  if (value !== undefined) {
    const point = v.pts.find((p) => p.period === r.period);
    return (
      // One of the Metric's Observations: the shared popup; a span of a combined series is not one, so it asks for nothing.
      <ObservationTip metric={m} period={r.period} label={label(r.period)} value={value} goal={v.goal(point)} data={data} single={!v.combined}>
        {r.target !== undefined && <div className="text-muted-foreground">Target: <span className="fig">{formatValue(m, r.target, ns)}</span></div>}
        {drawnOutputs(v.analysis).map((o) => (r[`recipe:${o.step}`] === undefined ? null : <div key={o.step} className="text-muted-foreground">{o.label}: <span className="fig">{formatOutput(o.unit, m, r[`recipe:${o.step}`], ns)}</span></div>))}
      </ObservationTip>
    );
  }
  if (r.fc === undefined) return null;
  return (
    <div role="tooltip" className="stock widget-text-xs rounded-[var(--radius-input)] px-[0.83em] py-[0.5em]">
      <div className="font-medium">{label(r.period)}</div>
      <div>Forecast: <span className="fig">{formatValue(m, r.fc, ns)}</span></div>
      {r.band && <div className="text-muted-foreground">Likely {formatValue(m, r.band[0], ns)} – {formatValue(m, r.band[1], ns)}</div>}
    </div>
  );
}

/** Two Metrics against each other, one dot per common period: the longer of their periods (spec 0019). */
function PairsPlot({ marks, v }: { part: Plot; marks: PlotMark[]; v: DesignValues }) {
  const { m: y, data } = v;
  const s = useWidgetScale();
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
        {/* Room on the right for half of the last x label, which is centred on the edge (#16). */}
        <ComposedChart accessibilityLayer={false} margin={{ top: 8 * s, right: 28 * s, bottom: 8 * s, left: 8 * s }}>
          <CartesianGrid stroke="var(--color-rule)" />
          <XAxis type="number" dataKey="x" name={x.name} domain={["auto", "auto"]} tickFormatter={(n) => compactValue(x, n, ns)} tick={tick(12 * s, true)} height={30 * s} stroke="var(--color-rule-2)" />
          <YAxis type="number" dataKey="y" name={y.name} domain={["auto", "auto"]} tickFormatter={(n) => compactValue(y, n, ns)} tick={tick(12 * s, true)} width={68 * s} stroke="var(--color-rule-2)" />
          <Tooltip
            content={({ payload }) => {
              const p = payload?.[0]?.payload as { period: string; x: number; y: number } | undefined;
              if (!p) return null;
              return (
                <div className="stock widget-text-xs rounded-[var(--radius-input)] px-[0.83em] py-[0.5em]">
                  <div className="font-medium">{periodLabel(p.period, commonPeriod(x.period, y.period), data.yearStart)}</div>
                  <div>{x.name}: <span className="fig">{formatValue(x, p.x, ns)}</span></div>
                  <div>{y.name}: <span className="fig">{formatValue(y, p.y, ns)}</span></div>
                </div>
              );
            }}
          />
          {/* Recharts' own dot is 64 square px; it grows with the card (#778). */}
          <ZAxis range={[64 * s * s, 64 * s * s]} />
          {point && <Scatter data={pairs} fill={point.tone && point.tone !== "status" ? TONE[point.tone] : TONE.data} isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
