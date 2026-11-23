"use client";
// The polar and radar marks of a View Design (GLOSSARY: View Design): shapes around a circle. What they draw (the
// order of the spokes, how far out each value is, every label and the text alternative) is worked out once by the
// core in polar-marks.ts; this file only turns it into SVG, from Theme tokens, so a widget, a Snapshot, a View
// Link and a deck's picture show the same numbers. It reaches no Metric outside the widget's own.
import type { ReactNode } from "react";
import { drawnOutputs } from "@ziffr/core/analysis-recipe";
import { formatOutput } from "@ziffr/core/design-analysis";
import { formatValue } from "@ziffr/core/format";
import { periodLabel, shiftPeriod } from "@ziffr/core/periods";
import { pointNote, polarModel, radarInputs, radarModel, type Mark } from "@ziffr/core/polar-marks";
import type { Part } from "@ziffr/core/view-design";
import type { DesignValues } from "./design-view";

type Polar = Extract<Part, { mark: "polar" }>;
type Radar = Extract<Part, { mark: "radar" }>;

const C = 100;
const R = 44;
// The angle of spoke i of n, from the top, clockwise.
const angle = (i: number, n: number) => (2 * Math.PI * i) / n - Math.PI / 2;
const at = (i: number, n: number, r: number) => [C + r * Math.cos(angle(i, n)), C + r * Math.sin(angle(i, n))] as const;
const short = (s: string, n = 14) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const anchor = (i: number, n: number) => { const c = Math.cos(angle(i, n)); return Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end"; };

/** The line of a shape: unbroken and closed, with its fill, when every spoke has a place; else only the stretches between neighbours that have one. */
function Outline({ marks, dashed, square }: { marks: Mark[]; dashed: boolean; square: boolean }) {
  const n = marks.length;
  const pts = marks.map((m, i) => (m.at === null ? null : at(i, n, R * m.at)));
  const whole = pts.every((p) => p !== null);
  const stroke = dashed ? "var(--color-ink)" : "var(--color-data)";
  const lines: ReactNode[] = [];
  if (whole) lines.push(<polygon key="shape" points={pts.map((p) => p!.join(",")).join(" ")} fill={dashed ? "none" : "var(--color-data)"} fillOpacity={dashed ? 0 : 0.18} stroke={stroke} strokeWidth={1.6} strokeDasharray={dashed ? "4 3" : undefined} strokeLinejoin="round" />);
  else {
    // A gap breaks the line: the two spokes beside it are not joined through the centre or through each other.
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % n];
      if (p && q && n > 1) lines.push(<line key={`s${i}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={stroke} strokeWidth={1.6} strokeDasharray={dashed ? "4 3" : undefined} />);
    });
  }
  const dots = pts.map((p, i) => (p ? square ? <rect key={`d${i}`} x={p[0] - 2.4} y={p[1] - 2.4} width={4.8} height={4.8} fill="var(--color-paper-3)" stroke={stroke} strokeWidth={1.4} /> : <circle key={`d${i}`} cx={p[0]} cy={p[1]} r={2.6} fill={stroke} /> : null));
  return <g>{lines}{dots}</g>;
}

function Frame({ n, rings, children, label }: { n: number; rings: number[]; children: ReactNode; label: string }) {
  return (
    <div className="relative min-h-40 w-full flex-1">
      <svg viewBox="-30 0 260 200" className="absolute inset-0 size-full" role="img" aria-label={label}>
        {rings.map((f) => <circle key={f} cx={C} cy={C} r={R * f} fill="none" stroke="var(--color-rule)" strokeWidth={0.8} />)}
        {Array.from({ length: n }, (_, i) => { const [x, y] = at(i, n, R); return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="var(--color-rule)" strokeWidth={0.8} />; })}
        {children}
      </svg>
    </div>
  );
}

function Spokes({ lines, n }: { lines: string[][]; n: number }) {
  return (
    <>
      {lines.map((ls, i) => {
        const [x, y] = at(i, n, R + 6);
        // Words grow away from the chart: up from a spoke at the top, down from one at the bottom, centred beside the others.
        const s = Math.sin(angle(i, n));
        const first = s < -0.5 ? y - (ls.length - 1) * 8 : s > 0.5 ? y + 6 : y - ((ls.length - 1) * 8) / 2 + 3;
        return (
          <text key={i} x={x} y={first} textAnchor={anchor(i, n)} fontSize={7} fill="var(--color-ink)">
            {ls.map((l, k) => <tspan key={k} x={x} dy={k ? 8 : 0} fill={k ? "var(--color-muted)" : "var(--color-ink)"}>{l}</tspan>)}
          </text>
        );
      })}
    </>
  );
}

/** Values around a circle: a series' periods as angles in the order given, the values as the distance from the centre. */
export function PolarMark({ part, v }: { part: Polar; v: DesignValues }) {
  const { m, data } = v;
  const recipe = part.show.startsWith("recipe.");
  const step = recipe ? part.show.slice("recipe.".length) : null;
  const res = step ? v.recipe?.[step] : null;
  const out = step ? drawnOutputs(v.analysis).find((o) => o.step === step) : null;
  // The last `window` periods, counted as periods: a month with no value is a gap in the circle, not a month dropped from it.
  const lastAll = v.all[v.all.length - 1];
  const to = lastAll?.period ?? "";
  const from = lastAll ? shiftPeriod(lastAll.period, v.by, 1 - v.win) : "";
  // What a period is (running, with gaps, condensed) comes from the Metric's own points, for a recipe's series as well.
  const own = new Map(v.all.map((p) => [p.period, p]));
  const source: { period: string; value: number }[] = recipe ? (res?.kind === "series" ? res.points : []) : v.all;
  const model = polarModel({
    name: recipe && out ? out.label : m.name,
    points: source.map((p) => ({ period: p.period, value: p.value, note: own.get(p.period) ? pointNote(own.get(p.period)!, m.period) : undefined, condensed: !!own.get(p.period)?.condensed })),
    by: v.by,
    from,
    to,
    label: (p) => periodLabel(p, v.by, data.yearStart, true),
    write: (x) => (recipe && out ? formatOutput(out.unit, m, x, data.numberStyle) : formatValue(m, x, data.numberStyle)),
  });
  if (!model.ok) return <Words>{model.reason}</Words>;
  const n = model.marks.length;
  return (
    <>
      <Frame n={n} rings={[0.5, 1]} label={model.alt}>
        <Outline marks={model.marks} dashed={false} square={false} />
        <Spokes n={n} lines={model.marks.map((k) => [k.label, k.text ?? "no value"])} />
      </Frame>
      <Words>{model.rule}</Words>
    </>
  );
}

/** Several Metrics as spokes on one shape, in the order of the Slots, each on a scale of its own. */
export function RadarMark({ part, v }: { part: Radar; v: DesignValues }) {
  const { data } = v;
  const model = radarModel(radarInputs(v.metrics, data, v.settings, v.offersDisplay), { window: v.win, against: part.against, style: data.numberStyle });
  if (!model.ok) return <Words>{model.reason}</Words>;
  const n = model.spokes.length;
  const [now, before] = model.shapes;
  const mixed = new Set(now.marks.map((k) => k.period).filter(Boolean)).size > 1;
  const lines = model.spokes.map((_, i) => {
    const a = now.marks[i];
    const b = before?.marks[i];
    // Spokes whose latest values are of different periods say which, so they do not read as one moment.
    const when = (k: typeof a) => (mixed && k.period ? ` (${k.period})` : "");
    return [short(a.label, 16), a.text === null ? "no value" : `${a.text}${when(a)}`, ...(b ? [`before: ${b.text ?? "no value"}${when(b)}`] : [])];
  });
  return (
    <>
      <Frame n={n} rings={[0.25, 0.5, 0.75, 1]} label={model.alt}>
        {before && <Outline marks={before.marks} dashed square />}
        <Outline marks={now.marks} dashed={false} square={false} />
        <Spokes n={n} lines={lines} />
      </Frame>
      {before && <Words>Solid line with round dots: latest. Dashed line with square dots: the period before.</Words>}
      <Words>{model.rule}</Words>
    </>
  );
}

function Words({ children }: { children: ReactNode }) {
  return <p className="widget-text-xs mt-0.5 text-muted-foreground">{children}</p>;
}
