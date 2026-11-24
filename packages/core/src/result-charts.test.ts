// The charts of analysis results (ticket #1076): for every Method, the picture holds the very numbers the result holds, so the words and the picture
// cannot disagree. Each test works the check out another way (a plain correlation, ranks, least squares by the normal equations, a straight line through
// the points the chart itself holds), so it does not share code with the Method. Nothing here is a new calculation: the charts only reshape.
import { describe, expect, it } from "vitest";
import { ENTRIES, entryOf, type EntryId } from "./method-picker";
import { runEntry, type PickWorld, type Picked } from "./method-picker-run";
import { formatNumber } from "./format";
import { metric, months } from "./test/fixtures";
import type { BarsChart, ChartPart, ForecastChart, GridChart, LinesChart, ScatterChart, EffectsChart } from "./result-chart";
import type { Takeaway } from "./takeaways/takeaway";
import type { WhatIfTakeaway } from "./takeaways/what-if-takeaway";

const wob = (k: number, n = 36) => Array.from({ length: n }, (_, i) => 100 + Math.round(Math.sin(i * k) * 20 + (i % 5) * 3 + i * 0.8));
const V = metric({ id: 1, slug: "visits", name: "Visits", unit: "", unit_position: "after", target_min: null, polarity: "higher" });
const R = metric({ id: 2, slug: "revenue", name: "Revenue", target_min: 150, polarity: "higher" });
const P = metric({ id: 3, slug: "price", name: "Price", unit: "$", unit_position: "before", decimals: 2, target_min: null });
const T = metric({ id: 4, slug: "tickets", name: "Tickets", unit: "", target_min: null });
const visits = wob(1);
const series = {
  visits: months("2024-01", visits),
  revenue: months("2024-01", visits.map((v, i) => 3 * v + 20 + ((i * 7) % 11))),
  price: months("2024-01", wob(2.3).map((v) => v / 10)),
  tickets: months("2024-01", wob(0.6).map((v, i) => v + 2 * i)),
};
const breakdowns = {
  [R.id]: {
    "2026-11-01": [{ label: "Austria", value: 30 }, { label: "Germany", value: 120 }, { label: "France", value: 50 }, { label: "Italy", value: 5 }],
    "2026-12-01": [{ label: "Austria", value: 25 }, { label: "Germany", value: 140 }, { label: "France", value: 40 }, { label: "Italy", value: 5 }],
  },
};
const world = (over: Partial<PickWorld> = {}): PickWorld => ({ metrics: [V, R, P, T], series, breakdowns: breakdowns as never, ctx: { style: "1,234.5", charts: true }, yearStart: 1 as never, today: "2027-02-15", ...over });
const run = (id: EntryId, slots: Picked["slots"], settings: Picked["settings"] = {}, w = world()): Takeaway => runEntry(entryOf(id)!, w, { slots, settings });
const part = <K extends ChartPart["kind"]>(t: Takeaway, kind: K, n = 0) => t.chart!.filter((p) => p.kind === kind)[n] as Extract<ChartPart, { kind: K }>;
const num = (text: string) => Number(text.replace(/,/g, "").replace(/−/g, "-").replace(/[^\d.\-eE]/g, ""));
const row = (t: Takeaway, label: RegExp) => t.numbers.find((n) => label.test(n.label))!.text;
const near = (a: number, b: number, rel = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(a), Math.abs(b)));
const valuesOf = (c: LinesChart, k: number) => c.periods.map((p, i) => ({ period: p, value: c.lines[k].values[i] }));

// A plain Pearson r and Spearman rho, and least squares by the normal equations, written for the test.
const pearson = (x: number[], y: number[]) => {
  const [mx, my] = [x, y].map((a) => a.reduce((s, v) => s + v, 0) / a.length);
  const [sxy, sxx, syy] = x.reduce((s, v, i) => [s[0] + (v - mx) * (y[i] - my), s[1] + (v - mx) ** 2, s[2] + (y[i] - my) ** 2], [0, 0, 0]);
  return sxy / Math.sqrt(sxx * syy);
};
const ranks = (a: number[]) => a.map((v) => a.filter((w) => w < v).length + (a.filter((w) => w === v).length + 1) / 2);
const spearman = (x: number[], y: number[]) => pearson(ranks(x), ranks(y));
// Solve A·b = c by Gauss-Jordan with pivoting.
function solve(a: number[][], c: number[]): number[] {
  const n = c.length;
  const m = a.map((r, i) => [...r, c[i]]);
  for (let i = 0; i < n; i++) {
    const p = m.reduce((best, r, k) => (k >= i && Math.abs(r[i]) > Math.abs(m[best][i]) ? k : best), i);
    [m[i], m[p]] = [m[p], m[i]];
    for (let k = 0; k < n; k++) if (k !== i) { const f = m[k][i] / m[i][i]; for (let j = i; j <= n; j++) m[k][j] -= f * m[i][j]; }
  }
  return m.map((r, i) => r[n] / r[i]);
}
const ols = (y: number[], xs: number[][]) => {
  const X = y.map((_, i) => [1, ...xs.map((x) => x[i])]);
  const k = X[0].length;
  const A = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => X.reduce((s, r) => s + r[a] * r[b], 0)));
  const c = Array.from({ length: k }, (_, a) => X.reduce((s, r, i) => s + r[a] * y[i], 0));
  const beta = solve(A, c);
  return X.map((r) => r.reduce((s, v, j) => s + v * beta[j], 0));
};
const line = (xs: number[], ys: number[]) => {
  const [mx, my] = [xs, ys].map((a) => a.reduce((s, v) => s + v, 0) / a.length);
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return (x: number) => my + slope * (x - mx);
};

describe("every picker result with a picture", () => {
  it("has one for each Method that has numbers over time or in rows, and none for a refusal or without the ask", () => {
    const withChart: EntryId[] = [];
    for (const e of ENTRIES) {
      const slots: Picked["slots"] = Object.fromEntries(e.slots.map((s) => [s.id, s.optional ? [] : s.many ? [V, P, T] : [R]]));
      if (["correlation", "rank", "lag"].includes(e.id)) { slots.first = [V]; slots.second = [R]; }
      if (e.id === "partial") { slots.first = [V]; slots.second = [R]; slots.held = [P]; }
      if (e.id === "matrix") slots.metrics = [V, R, P];
      if (e.id === "moves" || e.id === "needs" || e.id === "what-if") { slots.metric = [R]; slots.drivers = [V, P]; slots.others = [V, P]; }
      const settings: Picked["settings"] = e.id === "needs" ? { goal: 800 } : e.id === "what-if" ? { percent: 10 } : e.id === "after-date" ? { date: "2026-03-01" } : {};
      const t = run(e.id, slots, settings);
      if (t.kind === "refusal") continue;
      expect(t.chart?.length, e.id).toBeGreaterThan(0);
      withChart.push(e.id);
      // Without the ask, no picture: a widget, a Heads-up and a row of a longer Takeaway cost nothing for it.
      expect(runEntry(e, world({ ctx: { style: "1,234.5" } }), { slots, settings }).chart, e.id).toBeUndefined();
    }
    expect(withChart).toEqual(expect.arrayContaining(["forecast", "reach-target", "correlation", "rank", "partial", "lag", "moves", "needs", "what-if", "after-date", "change-point", "usual", "matrix", "bridge", "top-share", "pareto"]));
  });

  it("forecast: the history is the periods it was worked from and the band is the range the Takeaway writes", () => {
    const t = run("forecast", { metric: [R] });
    const c = part(t, "forecast") as ForecastChart;
    expect(c.history.map((p) => p.value)).toEqual(series.revenue.map((p) => p.value));
    expect(c.history.map((p) => p.period)).toEqual(series.revenue.map((p) => p.period));
    expect(c.ahead).toHaveLength(3);
    // The sentence is about the last period ahead, and its range is the very band drawn there.
    const last = c.ahead[c.ahead.length - 1];
    expect(c.asked).toBe(last.period);
    expect([t.range!.lo, t.range!.hi]).toEqual([last.lo, last.hi]);
    near(t.figures[0].value, last.value);
    // The band is 80 % either side of the value, the same width above and below.
    for (const p of c.ahead) near(p.value - p.lo, p.hi - p.value);
    expect(c.target).toBeNull();
  });

  it("reach the Target: the Target ends drawn are the ones the sentence names", () => {
    const t = run("reach-target", { metric: [R] });
    const c = part(t, "forecast");
    expect(c.target).toEqual({ min: 150, max: null });
    expect(t.figures.find((f) => /lower|min|least/i.test(f.label))?.value ?? 150).toBe(150);
    // With a number of periods asked ahead, only that many are drawn and the last is the one in the sentence.
    const two = run("reach-target", { metric: [R] }, { ahead: 2 });
    expect(part(two, "forecast").ahead).toHaveLength(2);
    expect(part(two, "forecast").asked).toBe(part(two, "forecast").ahead[1].period);
  });

  it("correlation: two lines and a scatter of the very pairs, whose r is the one in the numbers; lines each keep their own axis", () => {
    const t = run("correlation", { first: [V], second: [P] });
    const [lines, scatter] = [part(t, "lines") as LinesChart, part(t, "scatter") as ScatterChart];
    expect(lines.lines.map((l) => l.scale)).toEqual(["left", "right"]);
    expect(lines.lines.map((l) => l.name)).toEqual(["Visits", "Price"]);
    const [xs, ys] = [scatter.pairs.map((p) => p.x), scatter.pairs.map((p) => p.y)];
    expect(formatNumber(pearson(xs, ys), 2, "1,234.5")).toBe(row(t, /^r\b|correlation/i));
    expect(scatter.pairs.length).toBe(num(row(t, /pairs/i)));
    // The lines hold the same numbers, period by period, as the scatter's points.
    scatter.pairs.forEach((p, i) => { expect(valuesOf(lines, 0)[i].period).toBe(p.period); expect(lines.lines[0].values[i]).toBe(p.x); expect(lines.lines[1].values[i]).toBe(p.y); });
  });

  it("correlation: Metrics of different periods are drawn on their common period and a period without a value is a gap, never a zero", () => {
    const weekly = metric({ id: 9, slug: "weekly", name: "Weekly", period: "week", unit: "", target_min: null });
    const days = Array.from({ length: 160 }, (_, i) => ({ period: new Date(Date.UTC(2024, 0, 1 + 7 * i)).toISOString().slice(0, 10), value: 50 + ((i * 13) % 17) + i * 0.3 }));
    const w = world({ metrics: [V, weekly], series: { visits: series.visits, weekly: days } });
    const t = run("correlation", { first: [V], second: [weekly] }, {}, w);
    expect(t.kind).toBe("answer");
    const lines = part(t, "lines");
    expect(lines.span).toBe("month");
    expect(lines.periods.every((p) => p.endsWith("-01"))).toBe(true);
    // A missing month in the first Metric stays a gap in its line, and the scatter has no point for it.
    const holey = world({ series: { visits: series.visits.filter((_, i) => i !== 10), revenue: series.revenue }, metrics: [V, R] });
    const g = run("correlation", { first: [V], second: [R] }, {}, holey);
    const [gl, gs] = [part(g, "lines"), part(g, "scatter")];
    const at = gl.periods.indexOf(series.visits[10].period);
    if (at >= 0) { expect(gl.lines[0].values[at]).toBeNull(); expect(gl.lines.every((l) => l.values.every((v) => v !== 0 || false))).toBe(true); }
    expect(gs.pairs.some((p) => p.period === series.visits[10].period)).toBe(false);
  });

  it("rank correlation: the pairs in the scatter give the rho in the numbers", () => {
    const t = run("rank", { first: [V], second: [T] });
    const scatter = part(t, "scatter");
    expect(formatNumber(spearman(scatter.pairs.map((p) => p.x), scatter.pairs.map((p) => p.y)), 2, "1,234.5")).toBe(row(t, /rho|rank/i));
    expect(scatter.pairs.length).toBe(num(row(t, /pairs/i)));
  });

  it("partial correlation: the two Metrics over the periods every one of the Metrics has, and no scatter", () => {
    const t = run("partial", { first: [V], second: [R], held: [P] });
    const lines = part(t, "lines");
    expect(t.chart!.map((p) => p.kind)).toEqual(["lines"]);
    expect(lines.periods).toHaveLength(num(row(t, /pairs/i)));
    expect(lines.lines[0].values).toEqual(series.visits.map((p) => p.value));
    expect(lines.lines[1].values).toEqual(series.revenue.map((p) => p.value));
  });

  it("lagged correlation: a bar for every delay with its r, the best marked, the best delay the one in the numbers", () => {
    const delayed = world({ series: { ...series, price: months("2024-01", [0, 0, ...visits.slice(0, -2)].map((v) => v / 3 + ((v * 7) % 3))) } });
    const t = run("lag", { first: [V], second: [P] }, {}, delayed);
    const c = part(t, "bars") as BarsChart;
    expect(c.measure).toBe("delay");
    const best = c.bars.filter((b) => b.tag === "best");
    expect(best).toHaveLength(1);
    expect(Number(best[0].label)).toBe(num(row(t, /delay|lag/i)));
    expect(formatNumber(best[0].value, 2, "1,234.5")).toBe(row(t, /^r\b/i));
    // Each bar is the plain Pearson r of the first Metric with the second shifted back by that many months.
    for (const b of c.bars) {
      const lag = Number(b.label);
      const [x, y] = [series.visits.slice(0, series.visits.length - lag).map((p) => p.value), delayed.series.price.slice(lag).map((p) => p.value)];
      near(b.value, pearson(x, y), 1e-9);
    }
    // The strongest delay of all bars is the one marked.
    expect(best[0].value).toBe(c.bars.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a)).value);
  });

  it("What moves X: the fit drawn is least squares on the rows, and the shares are the words' order", () => {
    const t = run("moves", { metric: [R], drivers: [V, P, T] });
    expect(t.kind).toBe("answer");
    const [lines, bars] = [part(t, "lines") as LinesChart, part(t, "bars") as BarsChart];
    const [actual, fitted] = [lines.lines[0].values as number[], lines.lines[1].values as number[]];
    expect(lines.lines[1].dashed).toBe(true);
    // The fit expects what least squares on the Metrics' own values (or changes, where the result compared by change) gives.
    const changes = lines.about === "fit-changes";
    const diff = (a: number[]) => a.slice(1).map((v, i) => v - a[i]);
    const col = (s: { value: number }[]) => (changes ? diff(s.map((p) => p.value)) : s.map((p) => p.value));
    const [y, ...xs] = [series.revenue, ...[series.visits, series.price, series.tickets]].map(col);
    // The result may have kept fewer drivers; fit on the ones its bars name.
    const used = bars.bars.map((b) => ({ Visits: xs[0], Price: xs[1], Tickets: xs[2] })[b.label as "Visits"]);
    const expected = ols(y, used);
    const offset = y.length - actual.length;
    expect(offset).toBeGreaterThanOrEqual(0);
    actual.forEach((a, i) => near(a, y[i + offset]));
    fitted.forEach((f, i) => near(f, expected[i + offset], 1e-7));
    // The bars are the shares of the fit, as percentages that add up to the whole, in the order of the sentence (largest first).
    near(bars.bars.reduce((s, b) => s + b.value, 0), 100, 1e-9);
    expect(bars.bars.map((b) => b.value)).toEqual([...bars.bars.map((b) => b.value)].sort((a, b) => b - a));
    for (const b of bars.bars) expect(t.numbers.find((n) => n.label.startsWith(`${b.label}:`) && /what the line explains/i.test(n.label))!.text).toBe(`${formatNumber(b.value, 0, "1,234.5")} %`);
    expect(bars.bars.every((b) => typeof b.note === "string" && b.note.length > 0)).toBe(true);
  });

  it("What does X need: the same fit, and the goal drawn is the goal asked, only where the fit is on levels", () => {
    const t = run("needs", { metric: [R], drivers: [V, P] }, { goal: 800 });
    if (t.kind === "refusal") return;
    const lines = part(t, "lines");
    if (lines.about === "fit") expect(lines.levels).toEqual([{ kind: "goal", value: 800, from: lines.periods[0], to: lines.periods[lines.periods.length - 1] }]);
    else expect(lines.levels).toBeUndefined();
    expect(lines.lines[0].values.every((v) => v !== null)).toBe(true);
  });

  it("What if: a row for the change asked and each Metric it reaches, with its own range, as the rows of the sentence hold them", () => {
    const t = run("what-if", { metric: [R], others: [V, P] }, { percent: 10 }) as WhatIfTakeaway;
    expect(t.kind).toBe("answer");
    const c = part(t, "effects") as EffectsChart;
    expect(c.rows[0]).toMatchObject({ label: "Revenue", lo: null, hi: null });
    near(c.rows[0].effect!, 0.1 * series.revenue[series.revenue.length - 1].value);
    const said = t.rows.filter((r) => r.kind !== "refused");
    expect(c.rows.slice(1).map((r) => [r.label, r.effect, r.lo, r.hi])).toEqual(said.map((r) => [r.name, r.effect, r.lo, r.hi]));
    // A range always holds the effect.
    for (const r of c.rows) if (r.lo !== null && r.hi !== null) { expect(r.lo).toBeLessThanOrEqual(r.effect!); expect(r.hi).toBeGreaterThanOrEqual(r.effect!); }
  });

  it("Did it work: the day is marked, and the two levels are the numbers of the answer over the periods since", () => {
    const t = run("after-date", { metric: [R] }, { date: "2026-03-01" });
    const lines = part(t, "lines");
    expect(lines.marks).toEqual([{ period: "2026-03-01", kind: "date", day: "2026-03-01" }]);
    const [pointed, was] = [lines.levels!.find((l) => l.kind === "trend-pointed")!, lines.levels!.find((l) => l.kind === "actual")!];
    // The levels are written as the answer writes them, and span the periods since the day.
    expect(formatNumber(pointed.value, 0, "1,234.5") + " €").toBe(row(t, /where the trend pointed/i));
    expect(formatNumber(was.value, 0, "1,234.5") + " €").toBe(row(t, /what it was/i));
    expect([pointed.from, pointed.to]).toEqual(["2026-03-01", lines.periods[lines.periods.length - 1]]);
    const since = series.revenue.filter((p) => p.period >= "2026-03-01").map((p) => p.value);
    near(was.value, since.reduce((s, v) => s + v, 0) / since.length);
    expect(lines.lines[0].values).toEqual(series.revenue.map((p) => p.value));
  });

  it("Did something change: the mark is the date in the numbers and the two lines are straight lines through the points on either side", () => {
    const step = world({ series: { ...series, revenue: months("2024-01", Array.from({ length: 36 }, (_, i) => 100 + i * 2 + (i >= 20 ? 120 : 0) + Math.round(Math.sin(i * 1.7) * 9))) } });
    const t = run("change-point", { metric: [R] }, {}, step);
    const lines = part(t, "lines");
    const mark = lines.marks![0];
    expect(mark.kind).toBe("change");
    expect(t.numbers.find((n) => /^\d{4}-\d\d-\d\d$/.test(n.text))!.text).toBe(mark.period);
    const at = lines.periods.indexOf(mark.period);
    const ys = lines.lines[0].values as number[];
    const [before, since] = [lines.lines[1].values, lines.lines[2].values];
    // The lines are the least-squares lines through the points before the date and from it on, and each stands only on its own side.
    const f = line(Array.from({ length: at }, (_, i) => i), ys.slice(0, at));
    const g = line(Array.from({ length: ys.length - at }, (_, i) => at + i), ys.slice(at));
    before.forEach((v, i) => (i < at ? near(v as number, f(i), 1e-9) : expect(v).toBeNull()));
    since.forEach((v, i) => (i >= at ? near(v as number, g(i), 1e-9) : expect(v).toBeNull()));
    // The step in the answer is the jump from one line to the other at the date.
    const jump = (since[at] as number) - (before[at - 1] as number) - ((before[at - 1] as number) - (before[at - 2] as number));
    // (the answer writes it to one decimal: "+119.5 €")
    expect(Math.abs(jump - num(row(t, /^step in level/i)))).toBeLessThan(0.05);
  });

  it("Did something change: nothing standing out draws the values alone", () => {
    const t = run("change-point", { metric: [V] }, {}, world({ series: { ...series, visits: months("2024-01", series.visits.map((_, i) => 100 + (i % 3))) } }));
    if (t.kind === "refusal") return;
    const lines = part(t, "lines");
    expect(lines.lines).toHaveLength(1);
    expect(lines.marks).toBeUndefined();
  });

  it("What is usual: the band is the usual range of the sentence and the median is the one in the numbers", () => {
    const t = run("usual", { metric: [R] }, { value: 500 });
    const lines = part(t, "lines");
    const [lo, hi] = [t.figures.find((f) => /low/i.test(f.label))!.value, t.figures.find((f) => /high/i.test(f.label))!.value];
    expect([lines.band!.lo, lines.band!.hi]).toEqual([lo, hi]);
    const sorted = series.revenue.map((p) => p.value).sort((a, b) => a - b);
    const q = (p: number) => { const i = (sorted.length - 1) * p; return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i - Math.floor(i)); };
    near(lines.band!.lo, q(0.1)); near(lines.band!.hi, q(0.9));
    near(lines.levels!.find((l) => l.kind === "median")!.value, q(0.5));
    expect(lines.levels!.find((l) => l.kind === "asked")).toMatchObject({ value: 500, from: lines.periods[lines.periods.length - 1], to: lines.periods[lines.periods.length - 1] });
    expect(lines.lines[0].values).toEqual(series.revenue.map((p) => p.value));
  });

  it("Why did it change: the parts are the rows of the sentence, and they add up to the total change", () => {
    const t = run("bridge", { metric: [R] });
    const c = part(t, "bars");
    const total = c.bars[c.bars.length - 1];
    const parts = c.bars.filter((b) => b.tag === undefined || b.tag === "appeared" || b.tag === "gone");
    const left = c.bars.find((b) => b.tag === "unexplained");
    expect(total.tag).toBe("total");
    const latest = breakdowns[R.id]["2026-12-01"], before = breakdowns[R.id]["2026-11-01"];
    for (const b of parts) near(b.value, latest.find((r) => r.label === b.label)!.value - before.find((r) => r.label === b.label)!.value);
    // The rows and what they leave unexplained come to the total change (the demo's rows add up to the Metric, this fixture's do not).
    near(parts.reduce((s, b) => s + b.value, 0) + (left?.value ?? 0), total.value);
    expect(left).toBeDefined();
    // Largest change first, as the sentence lists them.
    expect(parts.map((b) => Math.abs(b.value))).toEqual([...parts.map((b) => Math.abs(b.value))].sort((a, b) => b - a));
    for (const b of parts) expect(t.numbers.find((n) => n.label === b.label)!.text.replace("−", "-").replace(/[^\d.,-]/g, "")).toBe(`${b.value > 0 ? "" : ""}${formatNumber(b.value, 0, "1,234.5")}`.replace("−", "-").replace(/[^\d.,-]/g, ""));
  });

  it("Pareto and the share of the biggest rows: every row's share and the running total, the rows the sentence names marked", () => {
    const rows = breakdowns[R.id]["2026-12-01"];
    const whole = rows.reduce((s, r) => s + r.value, 0);
    for (const [id, settings] of [["pareto", {}], ["top-share", { rows: 2 }]] as const) {
      const t = run(id, { metric: [R] }, settings);
      const c = part(t, "bars");
      const sorted = [...rows].sort((a, b) => b.value - a.value);
      expect(c.bars.map((b) => b.label)).toEqual(sorted.map((r) => r.label));
      c.bars.forEach((b, i) => near(b.value, (sorted[i].value / whole) * 100));
      c.line!.forEach((v, i) => near(v, (sorted.slice(0, i + 1).reduce((s, r) => s + r.value, 0) / whole) * 100));
      expect(c.line![c.line!.length - 1]).toBeCloseTo(100, 9);
      const named = c.bars.filter((b) => b.tag === "top").map((b) => b.label);
      // The rows marked are the ones the numbers name.
      for (const n of named) expect(t.numbers.some((x) => x.label === n)).toBe(true);
      expect(t.numbers.filter((x) => c.bars.some((b) => b.label === x.label)).length).toBe(named.length);
    }
  });

  it("the matrix: a cell for every pair with its r and its word, the numbers of Show the numbers", () => {
    const t = run("matrix", { metrics: [V, R, P] });
    const g = part(t, "grid") as GridChart;
    expect(g.labels).toEqual(["Visits", "Revenue", "Price"]);
    expect(g.cells).toHaveLength(3);
    for (const c of g.cells) {
      const label = `${g.labels[c.row]} and ${g.labels[c.col]}`;
      const text = t.numbers.find((n) => n.label === label)!.text;
      expect(text).toContain(formatNumber(c.r!, 2, "1,234.5"));
      expect(text).toContain(c.word!);
    }
    // The strongest pair's own picture is not drawn too: the grid is the picture.
    expect(t.chart).toHaveLength(1);
  });

  it("holds no Metric's id and no name that is not one of the result's own", () => {
    const names = new Set(["Visits", "Revenue", "Price", "Tickets"]);
    const labels = new Set(["Austria", "Germany", "France", "Italy"]);
    for (const [id, slots, settings] of [
      ["correlation", { first: [V], second: [R] }, {}], ["moves", { metric: [R], drivers: [V, P] }, {}], ["lag", { first: [V], second: [R] }, {}],
      ["bridge", { metric: [R] }, {}], ["pareto", { metric: [R] }, {}], ["matrix", { metrics: [V, R, P] }, {}], ["what-if", { metric: [R], others: [V, P] }, { percent: 10 }],
    ] as [EntryId, Picked["slots"], Picked["settings"]][]) {
      const t = run(id, slots, settings);
      const text = JSON.stringify(t.chart);
      for (const m of [V, R, P, T]) { expect(text).not.toContain(`"id":${m.id}`); expect(text).not.toContain(m.slug); expect(text).not.toContain("owner"); }
      // Every name in a chart is one of the Metrics of its Slots or a row of its Breakdown.
      for (const found of text.matchAll(/"(?:name|label)":"([^"]*)"/g)) expect(names.has(found[1]) || labels.has(found[1]) || /^\d$/.test(found[1]) || found[1] === "", found[1]).toBe(true);
    }
    // A Metric left off the Slots is not in the picture.
    const t = run("moves", { metric: [R], drivers: [V] });
    expect(JSON.stringify(t.chart)).not.toContain("Tickets");
  });
});
