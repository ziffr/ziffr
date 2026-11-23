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
import { pointNote, polarModel, radarInputs, radarModel, radarRadius, RADAR_INNER, windowProblem, type Mark } from "@ziffr/core/polar-marks";
import type { Part } from "@ziffr/core/view-design";
import type { DesignValues } from "./design-view";

type Polar = Extract<Part, { mark: "polar" }>;
type Radar = Extract<Part, { mark: "radar" }>;

const C = 100;
const R = 44;
// The angle of spoke i of n, from the top, clockwise.
const angle = (i: number, n: number) => (2 * Math.PI * i) / n - Math.PI / 2;
const at = (i: number, n: number, r: number) => [C + r * Math.cos(angle(i, n)), C + r * Math.sin(angle(i, n))] as const;
const anchor = (i: number, n: number) => { const c = Math.cos(angle(i, n)); return Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end"; };

// A name is cut by the width it takes, not by a count of letters: wide scripts take about twice the room of Latin letters.
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60]/u;
const width = (ch: string, size: number) => (WIDE.test(ch) ? 1 : 0.6) * size;
const widthOf = (chars: string[], size: number) => chars.reduce((w, c) => w + width(c, size), 0);
/** A text shortened to fit `max` wide, ending in an ellipsis when something was cut. */
function fit(text: string, max: number, size: number): string {
  const chars = [...text];
  if (widthOf(chars, size) <= max) return text;
  let out: string[] = [];
  for (const c of chars) {
    if (widthOf([...out, c, "…"], size) > max) break;
    out = [...out, c];
  }
  return `${out.join("")}…`;
}
/** A name on at most two lines of `max` wide: broken at a space where there is one, the last line shortened. */
function wrap(text: string, max: number, size: number): string[] {
  const chars = [...text];
  if (widthOf(chars, size) <= max) return [text];
  let n = 0;
  while (n < chars.length && widthOf(chars.slice(0, n + 1), size) <= max) n++;
  const space = chars.slice(0, n).lastIndexOf(" ");
  const cut = space > 0 && n < chars.length ? space : n;
  return [chars.slice(0, cut).join("").trimEnd(), fit(chars.slice(cut).join("").trimStart(), max, size)];
}

/** The line of a shape: unbroken and closed, with its fill, when every spoke has a place; else only the stretches between neighbours that have one. `radius` maps a place (0 to 1) to the distance from the centre. */
function Outline({ marks, dashed, square, closed = true, radius = (x) => x }: { marks: Mark[]; dashed: boolean; square: boolean; closed?: boolean; radius?: (at: number) => number }) {
  const n = marks.length;
  const pts = marks.map((m, i) => (m.at === null ? null : at(i, n, R * radius(m.at))));
  const whole = pts.every((p) => p !== null);
  const stroke = dashed ? "var(--color-ink)" : "var(--color-data)";
  const lines: ReactNode[] = [];
  if (whole && closed) lines.push(<polygon key="shape" points={pts.map((p) => p!.join(",")).join(" ")} fill={dashed ? "none" : "var(--color-data)"} fillOpacity={dashed ? 0 : 0.18} stroke={stroke} strokeWidth={1.6} strokeDasharray={dashed ? "4 3" : undefined} strokeLinejoin="round" />);
  else {
    // A gap breaks the line: the two spokes beside it are not joined through the centre or through each other.
    pts.forEach((p, i) => {
      const q = i + 1 < n ? pts[i + 1] : closed ? pts[0] : null;
      if (p && q && n > 1) lines.push(<line key={`s${i}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={stroke} strokeWidth={1.6} strokeDasharray={dashed ? "4 3" : undefined} />);
    });
  }
  const dots = pts.map((p, i) => (p ? square ? <rect key={`d${i}`} x={p[0] - 2.4} y={p[1] - 2.4} width={4.8} height={4.8} fill="var(--color-paper-3)" stroke={stroke} strokeWidth={1.4} /> : <circle key={`d${i}`} cx={p[0]} cy={p[1]} r={2.6} fill={stroke} /> : null));
  return <g>{lines}{dots}</g>;
}

function Frame({ n, rings, inner, children, label }: { n: number; rings: number[]; inner?: number; children: ReactNode; label: string }) {
  return (
    <div className="relative min-h-40 w-full flex-1">
      <svg viewBox="-30 0 260 200" className="absolute inset-0 size-full" role="img" aria-label={label}>
        {rings.map((f) => <circle key={f} cx={C} cy={C} r={R * f} fill="none" stroke="var(--color-rule)" strokeWidth={0.8} />)}
        {inner !== undefined && <circle cx={C} cy={C} r={R * inner} fill="none" stroke="var(--color-muted)" strokeOpacity={0.6} strokeWidth={0.8} strokeDasharray="2 2" />}
        {Array.from({ length: n }, (_, i) => { const [x, y] = at(i, n, R); return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="var(--color-rule)" strokeWidth={0.8} />; })}
        {children}
      </svg>
    </div>
  );
}

/** What is written at the end of one spoke: lines of text (the first, the name, may wrap on two), the muted ones beneath. */
type Label = { name: string; rest: { text: string; muted: boolean; wrap?: boolean }[] };

function Spokes({ labels, n, size = 7, stagger = false }: { labels: Label[]; n: number; size?: number; stagger?: boolean }) {
  const max = 60;
  const step = size + 1;
  return (
    <>
      {labels.map((l, i) => {
        const [x, y] = at(i, n, R + (stagger && i % 2 ? 11 : 6));
        const lines = [...wrap(l.name, max, size).map((t) => ({ text: t, muted: false })), ...l.rest.flatMap((r) => (r.wrap ? wrap(r.text, max, size) : [fit(r.text, max, size)]).map((t) => ({ text: t, muted: r.muted })))];
        // Words grow away from the chart: up from a spoke at the top, down from one at the bottom, centred beside the others.
        const s = Math.sin(angle(i, n));
        const first = s < -0.5 ? y - (lines.length - 1) * step : s > 0.5 ? y + step : y - ((lines.length - 1) * step) / 2 + size / 3;
        // Each line is its own text, isolated, so a name written right to left and its value never run together.
        return lines.map((ln, k) => <text key={`${i}-${k}`} x={x} y={first + k * step} textAnchor={anchor(i, n)} fontSize={size} fill={ln.muted ? "var(--color-muted)" : "var(--color-ink)"} style={{ unicodeBidi: "plaintext" }}>{ln.text}</text>);
      })}
    </>
  );
}

/** Values around a circle: a Metric's periods as angles in the order given, the values as the distance from the centre. */
export function PolarMark({ part, v }: { part: Polar; v: DesignValues }) {
  const { m, data } = v;
  const problem = windowProblem(v.win);
  if (problem) return <Words>{problem}</Words>;
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
  // With many periods the labels would touch: they are smaller and every other one sits further out.
  const crowded = n > 8;
  const labels: Label[] = model.marks.map((k) => ({ name: k.label, rest: [{ text: k.text ?? "no value", muted: true }, ...("why" in k && k.why ? [{ text: k.why, muted: true, wrap: true }] : [])] }));
  return (
    <>
      <Frame n={n} rings={[0.5, 1]} label={model.alt}>
        <Outline marks={model.marks} dashed={false} square={false} closed={model.closed} />
        <Spokes n={n} labels={labels} size={crowded ? 6 : 7} stagger={crowded} />
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
  const labels: Label[] = model.spokes.map((_, i) => {
    const a = now.marks[i];
    const b = before?.marks[i];
    // Spokes whose latest values are of different periods say which, so they do not read as one moment.
    const when = (k: typeof a) => (mixed && k.period ? [{ text: `of ${k.period}`, muted: true }] : []);
    // Why a value is not on its spoke is written beside it, not only in the text alternative.
    const why = "why" in a && a.why ? [{ text: a.why, muted: true, wrap: true }] : [];
    return { name: a.label, rest: [{ text: a.text === null ? "no value" : a.text, muted: true }, ...(a.text === null ? [] : when(a)), ...why, ...(b ? [{ text: `before: ${b.text ?? "no value"}`, muted: true }, ...(b.text === null ? [] : when(b))] : [])] };
  });
  const drawn = (marks: Mark[]) => marks.some((k) => k.at !== null);
  const key = [drawn(now.marks) && before ? "Solid line with round dots: latest." : "", before && drawn(before.marks) ? "Dashed line with square dots: the period before." : ""].filter(Boolean).join(" ");
  return (
    <>
      <Frame n={n} rings={[radarRadius(0.5), 1]} inner={RADAR_INNER} label={model.alt}>
        {before && <Outline marks={before.marks} dashed square radius={radarRadius} />}
        <Outline marks={now.marks} dashed={false} square={false} radius={radarRadius} />
        <Spokes n={n} labels={labels} />
      </Frame>
      {key && <Words>{key}</Words>}
      <Words>{model.rule}</Words>
    </>
  );
}

function Words({ children }: { children: ReactNode }) {
  return <p className="widget-text-xs mt-0.5 text-muted-foreground">{children}</p>;
}
