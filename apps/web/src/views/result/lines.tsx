"use client";
// The values of a result over time (GLOSSARY: Takeaway, Analysis Canvas; ticket #1076): lines, each on its own axis where the Metrics are in
// different units, levels held over some periods, the usual band and the marks of a change or a day. It draws the numbers the core's chart
// holds and nothing else: a period with no value is a gap, never a zero. A line is told apart by its marker and its dashes as well as its colour.
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisLabels, compactValue, formatValue, niceAxis } from "@ziffr/core/format";
import type { NumberStyle } from "@ziffr/core/number-style";
import { periodLabel, type YearStart } from "@ziffr/core/periods";
import type { ChartLine, LinesChart } from "@ziffr/core/result-chart";
import { levelName, lineName, markName } from "./words";

const COLORS = ["var(--color-data)", "var(--color-accent)"];
const SHAPES = ["circle", "square"] as const;
type Row = { period: string } & Record<string, number | string | null>;
type Side = "left" | "right";

// A line is dashed where it is what a Method expects; the second Metric of a pair is dash-dotted, so two lines differ in more than colour.
const dashOf = (l: ChartLine, k: number): string | undefined => (l.dashed ? "5 4" : k === 1 ? "7 3 2 3" : undefined);

// The numbers read on one side of the chart: its lines' values, and on the left the levels and the band too.
function valuesOn(c: LinesChart, side: Side): number[] {
  const own = c.lines.filter((l) => l.scale === side).flatMap((l) => l.values).filter((v): v is number => v !== null);
  return side === "left" ? [...own, ...(c.levels ?? []).map((l) => l.value), ...(c.band ? [c.band.lo, c.band.hi] : [])] : own;
}

function dotOf(shape: (typeof SHAPES)[number], color: string, key: string) {
  const Mark = ({ cx, cy, index, payload }: { cx?: number; cy?: number; index?: number; payload?: Row }) => {
    const v = payload?.[key];
    if (cx === undefined || cy === undefined || typeof v !== "number") return <g key={index} />;
    const common = { "data-period": payload!.period, "data-value": v, fill: "var(--color-cotton)", stroke: color, strokeWidth: 1.5 };
    return shape === "square" ? <rect key={index} x={cx - 3} y={cy - 3} width={6} height={6} {...common} /> : <circle key={index} cx={cx} cy={cy} r={3} {...common} />;
  };
  return Mark;
}

/** The legend of a chart of lines: each line with its marker, and each level, band and mark with its words, so nothing is told apart by colour alone. */
function Legend({ c, both }: { c: LinesChart; both: boolean }) {
  return (
    <ul className="m-0 mb-1 flex list-none flex-wrap gap-x-4 gap-y-0.5 p-0 text-xs text-muted-foreground">
      {c.lines.map((l, k) => (
        <li key={k} className="flex items-center gap-1.5">
          <svg width="22" height="10" aria-hidden><line x1="0" x2="22" y1="5" y2="5" stroke={COLORS[k % 2]} strokeWidth="2" strokeDasharray={dashOf(l, k)} />{SHAPES[k % 2] === "square" ? <rect x="8" y="2" width="6" height="6" fill="var(--color-cotton)" stroke={COLORS[k % 2]} /> : <circle cx="11" cy="5" r="3" fill="var(--color-cotton)" stroke={COLORS[k % 2]} />}</svg>
          <span dir="auto">{lineName(l)}{both ? ` (${l.scale} axis)` : ""}</span>
        </li>
      ))}
      {(c.levels ?? []).map((l, k) => <li key={`l${k}`} className="flex items-center gap-1.5"><svg width="22" height="10" aria-hidden><line x1="0" x2="22" y1="5" y2="5" stroke="var(--color-ink)" strokeWidth="1.5" strokeDasharray={l.kind === "actual" ? undefined : "2 3"} /></svg>{levelName(l)}</li>)}
      {c.band && <li className="flex items-center gap-1.5"><svg width="22" height="10" aria-hidden><rect width="22" height="10" fill="var(--color-band)" stroke="var(--color-rule-2)" /></svg>{levelName(c.band)}</li>}
      {(c.marks ?? []).map((m, k) => <li key={`m${k}`} className="flex items-center gap-1.5"><svg width="22" height="10" aria-hidden><line x1="11" x2="11" y1="0" y2="10" stroke="var(--color-ink)" strokeWidth="1.5" strokeDasharray="3 2" /></svg>{markName(m)}</li>)}
    </ul>
  );
}

/** The values over time of a result: see the file's header. */
export function LinesView({ chart: c, style, yearStart }: { chart: LinesChart; style: NumberStyle; yearStart: YearStart }) {
  const rows: Row[] = c.periods.map((period, i) => ({ period, ...Object.fromEntries(c.lines.map((l, k) => [`v${k}`, l.values[i]])) }));
  const sides = (["left", "right"] as const).filter((s) => c.lines.some((l) => l.scale === s));
  const axes = Object.fromEntries(sides.map((s) => [s, { axis: niceAxis(Math.min(...valuesOn(c, s)), Math.max(...valuesOn(c, s))), unit: c.lines.find((l) => l.scale === s)!.unit }]));
  const label = (p: string) => periodLabel(p, c.span, yearStart);
  const drawn = c.periods.length < 40;
  return (
    <div>
      <Legend c={c} both={sides.length > 1} />
      <div style={{ height: 240 }} data-chart="lines">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart accessibilityLayer={false} data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--color-rule)" />
            <XAxis dataKey="period" tickFormatter={(p) => periodLabel(p, c.span, yearStart, true)} tick={{ fontSize: 12, fill: "var(--color-muted)" }} minTickGap={24} stroke="var(--color-rule-2)" />
            {sides.map((s) => {
              const { axis, unit } = axes[s];
              const text = axisLabels(unit, axis.ticks, axis.step, style);
              return <YAxis key={s} yAxisId={s} orientation={s} domain={axis.domain} ticks={axis.ticks} interval={0} tickFormatter={(v: number) => text[axis.ticks.indexOf(v)] ?? compactValue(unit, v, style)} tick={{ fontSize: 12, fill: "var(--color-muted)", fontFamily: "var(--font-outlier)" }} width={68} stroke="var(--color-rule-2)" />;
            })}
            <Tooltip
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as Row | undefined;
                if (!active || !r) return null;
                return (
                  <div className="stock rounded-[var(--radius-input)] px-2.5 py-1.5 text-xs">
                    <div className="font-medium">{label(r.period)}</div>
                    {c.lines.map((l, k) => typeof r[`v${k}`] === "number" && <div key={k}>{lineName(l)}: <span className="fig">{formatValue(l.unit, r[`v${k}`] as number, style)}</span></div>)}
                  </div>
                );
              }}
            />
            {c.band && <ReferenceArea yAxisId="left" x1={c.band.from} x2={c.band.to} y1={c.band.lo} y2={c.band.hi} fill="var(--color-band)" fillOpacity={0.8} stroke="var(--color-rule-2)" strokeDasharray="2 3" ifOverflow="extendDomain" />}
            {(c.levels ?? []).map((l, k) => (l.from === l.to
              ? <ReferenceDot key={k} yAxisId="left" x={l.from} y={l.value} r={5} fill="var(--color-ink)" stroke="var(--color-cotton)" data-level={l.kind} data-value={l.value} />
              : <ReferenceLine key={k} yAxisId="left" segment={[{ x: l.from, y: l.value }, { x: l.to, y: l.value }]} stroke="var(--color-ink)" strokeWidth={1.5} strokeDasharray={l.kind === "actual" ? undefined : "2 3"} data-level={l.kind} data-value={l.value} />))}
            {(c.marks ?? []).map((m, k) => <ReferenceLine key={`m${k}`} yAxisId={sides[0]} x={m.period} stroke="var(--color-ink)" strokeWidth={1.5} strokeDasharray="3 2" />)}
            {c.lines.map((l: ChartLine, k) => (
              <Line key={k} yAxisId={l.scale} dataKey={`v${k}`} stroke={COLORS[k % 2]} strokeWidth={1.75} strokeDasharray={dashOf(l, k)} isAnimationActive={false} connectNulls={false} activeDot={false} dot={drawn ? dotOf(SHAPES[k % 2], COLORS[k % 2], `v${k}`) : false} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
