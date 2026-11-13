"use client";
// Panels inside a composed Story (GLOSSARY: Panel, Measure, Bridge). Period bars and bridges are drawn
// with Observable Plot; several metrics in one panel repeat it side by side as small multiples.
import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import { attainment, compare, resolverFrom, targetFor } from "@/lib/compare";
import { compactValue, formatValue, periodLabel } from "@/lib/format";
import type { Anchor, Annotation, CanvasData, MeasureId, Metric, Panel, Point } from "@/lib/types";

export const MEASURE_LABEL: Record<MeasureId, string> = {
  value: "Value",
  "pct-prev": "Change vs previous period, %",
  "pct-yoy": "Change vs previous year, %",
  attainment: "Attainment of target, %",
};

type Bar = { period: string; label: string; value: number; projected: boolean };

/** One measure per period, actuals then (optionally) projections, computed by the comparison engine. */
export function measureSeries(m: Metric, data: CanvasData, panel: Panel): Bar[] {
  const actual = data.series[m.slug] ?? [];
  const last = actual[actual.length - 1]?.period ?? "";
  const proj = panel.projections !== false ? (data.projections[m.id] ?? []).filter((p) => p.period > last) : [];
  const combined: Point[] = [...actual, ...proj];
  const projected = new Set(proj.map((p) => p.period));
  // The engine reads this metric through a resolver that includes its projections.
  const resolve = resolverFrom(data.metrics, { ...data.series, [m.slug]: combined });
  const measure = panel.measure ?? "value";
  const n = panel.periods ?? (measure === "value" ? 12 : 6);
  const rows: Bar[] = [];
  for (const p of combined) {
    let v: number | null | undefined = null;
    if (measure === "value") v = p.value;
    else if (measure === "attainment") v = attainment(m, p.value, targetFor(m, p.period, data.targets[m.id]));
    else {
      const c = compare(m, resolve, { keys: [measure === "pct-prev" ? "prev" : "yoy"], asOf: p.period })[0];
      v = c.available ? c.pct : null;
    }
    if (v !== null && v !== undefined && Number.isFinite(v)) rows.push({ period: p.period, label: periodLabel(p.period, m.period, true), value: v, projected: projected.has(p.period) });
  }
  return rows.slice(-n);
}

/** Finds an annotation's target among a panel's items; undefined when the target is gone. */
export function resolveAnchor<T extends { label: string; value: number; period?: string; delta?: number }>(items: T[], a: Anchor): T | undefined {
  if (!items.length) return undefined;
  if (a.type === "period") return items.find((x) => x.period === a.period);
  if (a.type === "row") return items.find((x) => x.label.toLowerCase() === a.label.toLowerCase());
  switch (a.rule) {
    case "max": return items.reduce((m, x) => (x.value > m.value ? x : m));
    case "min": return items.reduce((m, x) => (x.value < m.value ? x : m));
    case "first": return items[0];
    case "last": return items[items.length - 1];
    case "largest-step": {
      const steps = items.filter((x) => x.delta !== undefined);
      return steps.length ? steps.reduce((m, x) => (Math.abs(x.delta!) > Math.abs(m.delta!) ? x : m)) : undefined;
    }
  }
}

/** Plot marks for annotations at resolved points: ring, callout (with optional arrow) or note. */
function annotationMarks(anns: Annotation[] | undefined, items: { label: string; value: number; period?: string; delta?: number; top: number }[], span: number) {
  const marks: Plot.Markish[] = [];
  for (const a of anns ?? []) {
    const t = resolveAnchor(items, a.anchor);
    if (!t) continue; // the data moved on: the annotation hides rather than point at the wrong thing
    const lift = span * 0.2;
    if (a.kind === "ring") marks.push(Plot.dot([t], { x: "label", y: "top", dy: -9, r: 25, stroke: "var(--color-accent-2)", strokeWidth: 2, fill: "none" }));
    if (a.kind === "callout" && a.text) {
      marks.push(Plot.text([t], { x: "label", y: (d: typeof t) => d.top + lift, text: () => a.text!, fill: "var(--color-accent-2)", fontWeight: 600, fontSize: 12, lineWidth: 12, dy: -6 }));
      if (a.arrow !== false) marks.push(Plot.arrow([t], { x1: "label", x2: "label", y1: (d: typeof t) => d.top + lift, y2: "top", stroke: "var(--color-accent-2)", insetStart: 4, insetEnd: 18, headLength: 6 }));
    }
    if (a.kind === "note" && a.text) marks.push(Plot.text([t], { x: "label", y: "top", text: () => a.text!, dy: -26, fill: "var(--color-muted)", fontSize: 11, lineWidth: 12 }));
  }
  return marks;
}

const isPct = (panel: Panel) => (panel.measure ?? "value") !== "value";
const fmt = (m: Metric, panel: Panel, v: number, signed = false) =>
  isPct(panel) ? `${signed && v > 0 ? "+" : ""}${v.toFixed(1)} %` : `${signed && v > 0 ? "+" : ""}${compactValue(m, v)}`;

function usePlot(draw: (width: number, height: number) => Element | null, deps: unknown[]) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const render = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 60 || height < 60) return;
      const chart = draw(width, height);
      if (chart) el.replaceChildren(chart);
    };
    render();
    const ro = new ResizeObserver(render);
    ro.observe(el);
    return () => ro.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return box;
}

const STYLE = { fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--color-muted)", background: "transparent", overflow: "visible" };

/** Bars per period with signed direct labels; the highlighted bars (last or projected) stand out. */
function PeriodBars({ m, data, panel, domain }: { m: Metric; data: CanvasData; panel: Panel; domain?: [number, number] }) {
  const rows = measureSeries(m, data, panel);
  // Highlight projections when there are any, otherwise the last period (or the one chosen).
  const anyProjected = rows.some((r) => r.projected);
  const hl = (r: Bar) => (panel.highlight === "projection" && anyProjected ? r.projected : panel.highlight && !["last", "projection"].includes(panel.highlight) ? r.period === panel.highlight : r === rows[rows.length - 1]);
  const ref = refValue(m, data, panel, rows);
  const box = usePlot(
    (width, height) =>
      Plot.plot({
        width, height, marginTop: panel.annotations?.length ? 56 : 28, marginBottom: 28, marginLeft: 4, marginRight: ref ? 40 : 4, style: STYLE,
        x: { type: "band", domain: rows.map((r) => r.label), label: null, tickSize: 0, padding: 0.18 },
        y: { axis: null, domain: domain ?? undefined, nice: true, zero: true },
        marks: [
          Plot.barY(rows, { x: "label", y: "value", fill: (r: Bar) => (hl(r) ? "var(--color-accent-2)" : "var(--color-rule-2)") }),
          Plot.ruleY([0], { stroke: "var(--color-ink-2)" }),
          // dy and fontWeight are constants in Plot, so labels split by sign and emphasis.
          ...[
            [rows.filter((r) => r.value >= 0 && !hl(r)), -9, 400],
            [rows.filter((r) => r.value < 0 && !hl(r)), 11, 400],
            [rows.filter((r) => r.value >= 0 && hl(r)), -9, 700],
            [rows.filter((r) => r.value < 0 && hl(r)), 11, 700],
          ].map(([subset, dy, weight]) =>
            Plot.text(subset as Bar[], { x: "label", y: "value", text: (r: Bar) => fmt(m, panel, r.value, isPct(panel)), dy: dy as number, fill: "var(--color-print)", fontWeight: weight as number }),
          ),
          ...(ref ? [Plot.ruleY([ref.value], { stroke: "var(--color-accent-2)", strokeDasharray: "5 4" }), Plot.text([ref], { y: "value", frameAnchor: "right", dx: 38, text: "label", fill: "var(--color-accent-2)" })] : []),
          ...annotationMarks(panel.annotations, rows.map((r) => ({ ...r, top: Math.max(0, r.value) })), Math.max(...rows.map((r) => Math.abs(r.value)), 1)),
        ],
      }),
    [JSON.stringify(rows), panel.highlight, domain?.join(), ref?.value, JSON.stringify(panel.annotations)],
  );
  return (
    <figure className="flex h-full min-w-0 flex-col">
      <div ref={box} className="min-h-0 flex-1" role="img" aria-label={`${m.name}, ${MEASURE_LABEL[panel.measure ?? "value"]}: ${rows.map((r) => `${r.label} ${fmt(m, panel, r.value)}${r.projected ? " (projection)" : ""}`).join(", ")}`} />
      {rows.some((r) => r.projected) && <figcaption className="text-[11px] text-muted-foreground">Highlighted bars after the last actual are projections.</figcaption>}
    </figure>
  );
}

function refValue(m: Metric, data: CanvasData, panel: Panel, rows: { value: number }[]) {
  const r = panel.refLine;
  if (!r) return null;
  if (r.kind === "constant" && r.value !== undefined) return { value: r.value, label: r.label ?? fmt(m, panel, r.value) };
  if (r.kind === "average" && rows.length) {
    const v = rows.reduce((a, x) => a + x.value, 0) / rows.length;
    return { value: v, label: r.label ?? "Average" };
  }
  if (r.kind === "target") {
    if (isPct(panel)) return panel.measure === "attainment" ? { value: 100, label: r.label ?? "Target" } : null;
    const last = (data.series[m.slug] ?? []).at(-1);
    const t = last ? targetFor(m, last.period, data.targets[m.id]).value : null;
    return t ? { value: t, label: r.label ?? "Target" } : null;
  }
  return null;
}

type Step = { key: string; label: string; start: number; end: number; kind: "total" | "up" | "down" };

/** A bridge's steps: one breakdown's rows walked to the total, or the change between two periods row by row. */
export function bridgeSteps(m: Metric, data: CanvasData, panel: Panel): { steps: Step[]; note?: string } {
  const byPeriod = data.breakdowns[m.id] ?? {};
  const periods = Object.keys(byPeriod).sort();
  const totalOf = (p: string) => (data.series[m.slug] ?? []).find((x) => x.period === p)?.value ?? null;
  const mode = panel.bridge?.mode ?? "rows";
  const to = panel.bridge?.period && byPeriod[panel.bridge.period] ? panel.bridge.period : periods.at(-1);
  if (!to) return { steps: [], note: "This metric has no breakdown yet." };
  const steps: Step[] = [];
  if (mode === "rows") {
    // First row is the start, the others are signed steps, the observation's value is the end.
    const rows = byPeriod[to];
    let level = rows[0].value;
    steps.push({ key: "s", label: rows[0].label, start: 0, end: level, kind: "total" });
    rows.slice(1).forEach((r, i) => {
      steps.push({ key: `r${i}`, label: r.label, start: level, end: level + r.value, kind: r.value >= 0 ? "up" : "down" });
      level += r.value;
    });
    const total = totalOf(to);
    const end = total ?? level;
    if (total !== null && Math.abs(total - level) > Math.abs(total) * 0.005)
      steps.push({ key: "x", label: "Not in breakdown", start: level, end: total, kind: total >= level ? "up" : "down" });
    steps.push({ key: "e", label: periodLabel(to, m.period, true), start: 0, end, kind: "total" });
    return { steps };
  }
  // Variance: from one period's total to another's, through each row's change.
  const from = panel.bridge?.from && byPeriod[panel.bridge.from] ? panel.bridge.from : periods.filter((p) => p < to).at(-1);
  if (!from) return { steps: [], note: "A variance bridge needs breakdowns in two periods." };
  const a = totalOf(from), b = totalOf(to);
  if (a === null || b === null) return { steps: [], note: "Both periods need a value." };
  const rowsA = new Map(byPeriod[from].map((r) => [r.label.toLowerCase(), r]));
  const rowsB = new Map(byPeriod[to].map((r) => [r.label.toLowerCase(), r]));
  const labels = [...new Set([...rowsA.keys(), ...rowsB.keys()])];
  const changes = labels
    .map((k) => ({ label: rowsB.get(k)?.label ?? rowsA.get(k)!.label, delta: (rowsB.get(k)?.value ?? 0) - (rowsA.get(k)?.value ?? 0) }))
    .filter((c) => c.delta !== 0)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  let level = a;
  steps.push({ key: "s", label: periodLabel(from, m.period, true), start: 0, end: a, kind: "total" });
  changes.forEach((c, i) => {
    steps.push({ key: `c${i}`, label: c.label, start: level, end: level + c.delta, kind: c.delta >= 0 ? "up" : "down" });
    level += c.delta;
  });
  if (Math.abs(b - level) > Math.abs(b) * 0.005) steps.push({ key: "x", label: "Other", start: level, end: b, kind: b >= level ? "up" : "down" });
  steps.push({ key: "e", label: periodLabel(to, m.period, true), start: 0, end: b, kind: "total" });
  return { steps };
}

function Bridge({ m, data, panel }: { m: Metric; data: CanvasData; panel: Panel }) {
  const { steps, note } = bridgeSteps(m, data, panel);
  const ref = panel.refLine?.kind === "constant" && panel.refLine.value !== undefined ? { value: panel.refLine.value, label: panel.refLine.label ?? compactValue(m, panel.refLine.value) } : null;
  const fill = (s: Step) => (s.kind === "down" ? "var(--color-error)" : s.kind === "up" ? "var(--color-success)" : s.key === "e" ? "var(--color-ink-2)" : "var(--color-rule-2)");
  // A variance bridge zooms to the band where the steps happen (totals are cut at the bottom, as in finance);
  // a bridge of one breakdown's rows starts at zero, like the CFO's walk from gross to net.
  const variance = panel.bridge?.mode === "variance";
  const levels = steps.flatMap((x) => (x.kind === "total" ? [x.end] : [x.start, x.end]));
  const lo = Math.min(...levels), hi = Math.max(...levels);
  const pad = (hi - lo) * 0.35 || Math.abs(hi) * 0.05;
  const domain: [number, number] | undefined = variance && steps.length ? [Math.max(0, lo - pad), hi + pad * 0.6] : undefined;
  // Connectors: a dotted tick at each step's starting level, inside its own band.
  const connectors = steps.filter((x) => x.kind !== "total" || x.key === "e").map((x) => ({ label: x.label, y: x.kind === "total" ? x.end : x.start }));
  const rotate = steps.length > 5;
  const box = usePlot(
    (width, height) =>
      Plot.plot({
        width, height, marginTop: panel.annotations?.length ? 60 : 30, marginBottom: rotate ? 52 : 30, marginLeft: 4, marginRight: ref ? 44 : 4, style: STYLE,
        x: { type: "band", domain: steps.map((x) => x.label), label: null, tickSize: 0, padding: 0.25, tickRotate: rotate ? -30 : 0 },
        y: { axis: null, domain, nice: !variance, zero: !variance },
        marks: [
          // Only the bars are clipped (totals cut at the zoomed floor); labels and callouts may sit above.
          Plot.barY(steps, { x: "label", y1: (x: Step) => (variance && x.kind === "total" ? domain![0] : x.start), y2: "end", fill, clip: true }),
          Plot.tickY(connectors, { x: "label", y: "y", stroke: "var(--color-muted)", strokeDasharray: "2 3" }),
          Plot.text(steps, {
            x: "label", y: (x: Step) => Math.max(x.start, x.end), dy: -10,
            text: (x: Step) => (x.kind === "total" ? compactValue(m, x.end) : `${x.end - x.start > 0 ? "+" : "−"}${compactValue(m, Math.abs(x.end - x.start))}`),
            fill: (x: Step) => (x.kind === "down" ? "var(--color-error)" : "var(--color-print)"), fontWeight: 700, fontSize: 13,
          }),
          ...(ref ? [Plot.ruleY([ref.value], { stroke: "var(--color-accent-2)", strokeDasharray: "5 4" }), Plot.text([ref], { y: "value", frameAnchor: "right", dx: 42, text: "label", fill: "var(--color-accent-2)" })] : []),
          ...annotationMarks(
            panel.annotations,
            steps.map((x) => ({ label: x.label, value: x.end, top: Math.max(x.start, x.end), delta: x.kind === "total" ? undefined : x.end - x.start })),
            ((domain ? domain[1] - domain[0] : Math.max(...steps.map((x) => Math.abs(x.end)), 1)) * 0.6),
          ),
        ],
      }),
    [JSON.stringify(steps), ref?.value, variance, JSON.stringify(panel.annotations)],
  );
  if (note) return <p className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">{note}</p>;
  return <div ref={box} className="h-full min-w-0" role="img" aria-label={`${m.name} bridge: ${steps.map((s) => `${s.label} ${compactValue(m, s.end - (s.kind === "total" ? 0 : s.start))}`).join(", ")}`} />;
}

/** One panel, repeated per metric as small multiples; titles name the metric when there are several. */
export function PanelView({ panel, data, render }: { panel: Panel; data: CanvasData; render: (m: Metric, domain?: [number, number]) => React.ReactNode }) {
  const ms = panel.metricIds.map((id) => data.metrics.find((x) => x.id === id)).filter((x): x is Metric => !!x);
  if (!ms.length) return <p className="text-xs text-muted-foreground">Choose a metric for this panel.</p>;
  let domain: [number, number] | undefined;
  if (panel.sharedScale && panel.type === "period-bars") {
    const vals = ms.flatMap((m) => measureSeries(m, data, panel).map((r) => r.value));
    domain = [Math.min(0, ...vals), Math.max(0, ...vals)];
  }
  return (
    <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: `repeat(${ms.length}, minmax(0, 1fr))` }}>
      {ms.map((m) => (
        <div key={m.id} className="flex min-h-0 min-w-0 flex-col">
          {(ms.length > 1 || panel.title) && <div className="mb-1 text-center text-sm font-semibold text-[var(--color-print)]">{ms.length > 1 ? m.name : panel.title}</div>}
          <div className="min-h-0 flex-1">{render(m, domain)}</div>
        </div>
      ))}
    </div>
  );
}

export { PeriodBars, Bridge };
export const formatMeasure = (m: Metric, panel: Panel, v: number) => (isPct(panel) ? `${v.toFixed(1)} %` : formatValue(m, v));
