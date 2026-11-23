// Every Method that works exactly on values refuses, in words, values it cannot work out in reasonable time (work-bound.ts; spec
// 0041, rule 12: never a quiet number), and stays quick on the worst such input. The hostile series are the ones a reviewer
// measured: 120 periods alternating 9.8e14 with 1e-290 to 1e-307, and values of 1e290 to 1e299, which took a fit of six drivers
// 12 and 40 seconds. Each Method is also shown to give what it gave before for ordinary values (the Methods' own tests hold the
// numbers); these tests hold the refusals, one step either side of each limit, and the time.
import { describe, expect, it } from "vitest";
import { changes } from "../basis";
import { checkSuitability, type MethodId } from "../suitability";
import { metric, months } from "../test/fixtures";
import { say } from "../takeaways/wording";
import { forecastTakeaway, reachOf } from "../takeaways/forecast";
import { driversTakeaway, emptyTakeaway, withinBudget } from "../takeaways/takeaway";
import { rankCorrelations, correlate } from "../correlation";
import { spend, wideReason, withWork } from "../work-bound";
import type { Point } from "../types";
import { afterDateTakeaway } from "./before-after";
import { WORK_BUDGET } from "../work-bound";
import { bridgeTakeaway } from "./bridge";
import { changePointTakeaway } from "./change-point";
import { paretoTakeaway, topShareTakeaway } from "./concentration";
import { fit, importance, needs, predict, type Fit, type FitInput } from "./fit";
import { bestForecast, forecastTooWide, NO_FORECAST_WIDE } from "./forecast-choice";
import { laggedTakeaway } from "./lagged-correlation";
import { HEADS_UP, scanPairs } from "./pair-scan";
import { partialTakeaway } from "./partial-correlation";
import { usualRangeTakeaway } from "./quantiles";
import { spearmanTakeaway } from "./spearman";
import { testsOf, testsOfScan } from "./heads-up-single";
import { checkedChangePoint } from "./change-point";

const ctx = { style: "1,234.5" as const };
const euro = { unit: "€", unit_position: "after" as const, decimals: 0 };
/** The time a Method may take on the worst input: generous, since the fit's work allowance is about 3 seconds of a laptop and a busy machine is several times slower, but far under the 12 to 47 seconds the Methods took before. */
const QUICK = 40_000;

function lcg(start: number) {
  let x = start;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}
type Kind = "ordinary" | "tiny" | "huge" | "fine" | "wide" | "minute" | "dense";
/** 120 months of values: ordinary (to the cent), tiny (9.8e14 alternating with 1e-290 to 1e-307), huge (1e290 to 1e299), fine (15 digits at 39 places, which the limits let through), dense (17 digits at 40 places beside 17 digits of 1e5, the worst they admit) or wide (spanning 32 orders). */
function series(kind: Kind, seed: number, n = 120): Point[] {
  const r = lcg(seed);
  const value = (i: number): number => {
    if (kind === "ordinary") return Math.round((100 + i * 0.5 + r() * 40) * 100) / 100;
    if (kind === "tiny") return i % 2 === 0 ? 9.8e14 - Math.floor(r() * 1e9) : Number(`${(1 + r() * 8.9).toFixed(3)}e-${290 + Math.floor(r() * 17)}`);
    if (kind === "huge") return Number(`${(1 + r() * 8.9).toFixed(4)}e${290 + Math.floor(r() * 10)}`);
    if (kind === "dense") return i % 2 === 0 ? Number(`${(1 + r() * 8.99).toPrecision(17)}e5`) : Number(`${(1 + r() * 8.99).toPrecision(17)}e-24`);
    if (kind === "minute") return Number(`${(1 + r() * 8.9).toFixed(3)}e-295`);
    if (kind === "fine") return Number(`${(1 + r() * 8).toPrecision(15)}e-25`);
    return i % 2 === 0 ? Number((1e18 * (1 + r())).toPrecision(5)) : Number((1e-14 * (1 + r())).toPrecision(3));
  };
  return months("2015-01", Array.from({ length: n }, (_, i) => value(i)));
}
const input = (target: Point[], drivers: Point[][], over: Partial<FitInput> = {}): FitInput => ({ target: { name: "Revenue", points: target }, drivers: drivers.map((points, i) => ({ name: ["Visits", "Price", "Tickets", "Churn", "Orders", "Returns"][i], points })), span: "month", basis: "values", ...over });
const timed = <T>(f: () => T): { result: T; ms: number } => {
  const started = performance.now();
  const result = f();
  return { result, ms: performance.now() - started };
};
const cases = (r: { ok: boolean; refusals?: { case: string }[] }) => (r.ok ? ["answer"] : r.refusals!.map((f) => f.case));

describe("checkSuitability refuses wide values first, for every Method", () => {
  const METHODS: MethodId[] = ["correlation", "spearman", "partial", "drivers", "lag", "fit", "predict", "needs", "whatIf", "forecast", "trend", "seasonal", "changePoint", "afterDate", "usualRange"];
  it.each(METHODS)("%s: says what is wrong, names the series, and nothing else (no cautions, no switches), even where the series is too short to judge", (method) => {
    const v = checkSuitability(method, { series: [{ name: "Fine", points: months("2024-01", [1, 2, 3]) }, { name: "Tiny", points: months("2024-01", [1e-300, 2e-300, 3e-300]) }, { name: "Spread", points: months("2024-01", [1, 5, 1e31]) }], span: "month" });
    expect(v).toEqual({
      refusals: [
        { case: "refuse-exact-places", slots: { name: "Tiny", places: 40, orders: 30 } },
        { case: "refuse-exact-orders", slots: { name: "Spread", places: 40, orders: 30 } },
      ],
      cautions: [],
      switches: [],
    });
  });
  it("lets values on the limits through to the checks: 40 places, and a spread of exactly 10^30", () => {
    const refusals = (vs: number[]) => checkSuitability("usualRange", { series: [{ name: "A", points: months("2024-01", vs) }], span: "month" }).refusals.map((f) => f.case);
    expect(refusals([1e-40, 2e-40, 3e-40])).toEqual(["refuse-periods"]);
    expect(refusals([1.5e-40, 2e-40, 3e-40])).toEqual(["refuse-exact-places"]);
    expect(refusals([1, 5, 1e30])).toEqual(["refuse-periods"]);
    expect(refusals([1, 5, 1.0000000000000002e30])).toEqual(["refuse-exact-orders"]);
  });
  it("says it in words a person can read, with the limits", () => {
    const f = { places: 40, orders: 30, name: "Signups" };
    expect(say("refuse-exact-places", f, ctx)).toBe("Signups: its values go to more than 40 decimal places, which cannot be worked out exactly in reasonable time.");
    expect(say("refuse-exact-orders", f, ctx)).toBe("Signups: its values span more than 30 orders of magnitude, from the smallest that is not 0 to the largest, which cannot be worked out exactly in reasonable time.");
  });
});

describe("the multiple fit on hostile values", () => {
  const [ordinary, tiny, huge, fine] = (["ordinary", "tiny", "huge", "dense"] as const).map((k) => [series(k, 1), ...[2, 3, 4, 5, 6, 7].map((s) => series(k, s))]);
  it.each([1, 2, 3, 4, 5, 6])("refuses %s drivers of tiny values before any exact arithmetic, naming each series, in a bounded time (it took 1 to 34 seconds)", (k) => {
    const { result, ms } = timed(() => fit(input(tiny[0], tiny.slice(1, 1 + k))));
    expect(ms).toBeLessThan(QUICK);
    expect(result).toEqual({ ok: false, refusals: Array.from({ length: k + 1 }, (_, i) => ({ case: "refuse-exact-places", slots: { name: i === 0 ? "Revenue" : ["Visits", "Price", "Tickets", "Churn", "Orders", "Returns"][i - 1], places: 40, orders: 30 } })) });
  });
  it("refuses the same on the basis of changes, and in importance", () => {
    // (The changes of 9.8e14 and 1e-290 are worked out exactly and are plain numbers, so that is another series; one that is tiny throughout has tiny changes.)
    const minute = [1, 2, 3, 4].map((sd) => series("minute", sd));
    expect(timed(() => cases(fit(input(minute[0], minute.slice(1, 4), { basis: "changes" })))).result).toEqual(["refuse-exact-places", "refuse-exact-places", "refuse-exact-places", "refuse-exact-places"]);
    // The levels are judged, not only the changes: choosing the basis is exact arithmetic on the levels.
    expect(cases(fit(input(tiny[0], tiny.slice(1, 4), { basis: "changes" })))).toEqual(["refuse-exact-places", "refuse-exact-places", "refuse-exact-places", "refuse-exact-places"]);
    expect(cases(fit(input(tiny[0], tiny.slice(1, 4), { basis: undefined })))).toEqual(["refuse-exact-places", "refuse-exact-places", "refuse-exact-places", "refuse-exact-places"]);
    const { result, ms } = timed(() => importance(input(tiny[0], tiny.slice(1, 7))));
    expect(ms).toBeLessThan(QUICK);
    expect(cases(result)).toHaveLength(7);
  });
  it("refuses a driver that spans too many orders, naming only that driver", () => {
    const wide = series("wide", 9);
    expect(timed(() => fit(input(ordinary[0], [ordinary[1], wide]))).result).toEqual({ ok: false, refusals: [{ case: "refuse-exact-orders", slots: { name: "Price", places: 40, orders: 30 } }] });
  });
  it("stops a fit of six drivers on values of 1e290 and more, which no decimal place catches, when its work is spent, in words (it took 40 seconds)", () => {
    const { result, ms } = timed(() => fit(input(huge[0], huge.slice(1, 7))));
    expect(ms).toBeLessThan(QUICK);
    expect(result).toEqual({ ok: false, refusals: [{ case: "refuse-exact-work", slots: {} }] });
    expect(timed(() => importance(input(huge[0], huge.slice(1, 7)))).ms).toBeLessThan(QUICK);
  });
  it("stops a fit of six drivers on 17 digits at 40 places, the worst the bounds admit, when its work is spent; fewer drivers on the same values are worked out", () => {
    const { result, ms } = timed(() => fit(input(fine[0], fine.slice(1, 7))));
    expect(ms).toBeLessThan(QUICK);
    expect(result).toEqual({ ok: false, refusals: [{ case: "refuse-exact-work", slots: {} }] });
    expect(cases(fit(input(fine[0], fine.slice(1, 4))))).toEqual(["answer"]);
    expect(cases(fit(input(fine[0], fine.slice(1, 2))))).toEqual(["answer"]);
  });
  it("is the same answer twice: a refusal for the same series is the same bytes, and so is the answer for an ordinary one", () => {
    const [a, b] = [fit(input(huge[0], huge.slice(1, 7))), fit(input(huge[0], huge.slice(1, 7)))];
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(fit(input(ordinary[0], ordinary.slice(1, 4))))).toBe(JSON.stringify(fit(input(ordinary[0], ordinary.slice(1, 4)))));
  });
  it("works out ordinary values to the cent for six drivers on 120 periods, which is far inside the budget", () => {
    const { result, ms } = timed(() => fit(input(ordinary[0], ordinary.slice(1, 7))));
    expect(cases(result)).toEqual(["answer"]);
    expect(ms).toBeLessThan(QUICK);
    // Six decimal places, as a rate or a price in a small unit has, are inside it too.
    const eight = ([ordinary[0], ...ordinary.slice(1, 7)]).map((p) => p.map((q, i) => ({ ...q, value: Number((q.value + Math.sin(i) / 1234.5678).toFixed(6)) })));
    expect(cases(fit(input(eight[0], eight.slice(1))))).toEqual(["answer"]);
  });
});

describe("predict and needs on a model a program handed over", () => {
  const [y, a, b] = [series("ordinary", 1), series("ordinary", 2), series("ordinary", 3)];
  const good = fit(input(y, [a, b])) as Fit;
  const withRows = (rows: Fit["rows"]): Fit => ({ ...good, rows });
  const wideRows = (f: (i: number, v: number) => number) => good.rows.map((r, i) => ({ ...r, y: f(i, r.y), x: r.x.map((v) => f(i, v)) }));
  it("refuse rows that need more than 40 decimal places, or span more than 30 orders, naming the series", () => {
    const tiny = withRows(wideRows((i, v) => (i % 2 === 0 ? v : v * 1e-300)));
    const p = timed(() => predict(tiny, [1, 2]));
    expect(p.ms).toBeLessThan(QUICK);
    expect(cases(p.result)).toEqual(["refuse-exact-places", "refuse-exact-places", "refuse-exact-places"]);
    expect(cases(needs(tiny, { goal: 100, driver: 0 }))).toEqual(["refuse-exact-places", "refuse-exact-places", "refuse-exact-places"]);
    const wide = withRows(good.rows.map((r, i) => (i === 3 ? { ...r, x: [r.x[0], 1e34] } : r)));
    expect(predict(wide, [1, 2])).toEqual({ ok: false, refusals: [{ case: "refuse-exact-orders", slots: { name: good.drivers[1].name, places: 40, orders: 30 } }] });
    expect(needs(wide, { goal: 100, driver: 0 })).toEqual({ ok: false, refusals: [{ case: "refuse-exact-orders", slots: { name: good.drivers[1].name, places: 40, orders: 30 } }] });
  });
  it("still answer for the rows the fit was made from", () => {
    expect(predict(good, [150, 160]).ok).toBe(true);
    expect(needs(good, { goal: 150, driver: 0 }).ok).toBe(true);
  });
  it("answer in a bounded time for the largest values a double holds, six drivers, 120 periods (one refit is far inside the limits)", () => {
    const big = Array.from({ length: 7 }, (_, j) => series("huge", 20 + j));
    const model: Fit = { ...good, drivers: Array.from({ length: 6 }, (_, j) => ({ ...good.drivers[0], name: `D${j}`, low: -Infinity, high: Infinity })), rows: big[0].map((p, i) => ({ period: p.period, y: p.value, x: big.slice(1).map((s) => s[i].value) })), last: { y: big[0][0].value, x: big.slice(1).map((s) => s[0].value) } };
    const p = timed(() => predict(model, big.slice(1).map((s) => s[0].value)));
    const n = timed(() => needs(model, { goal: big[0][0].value, driver: 0 }));
    expect(p.ms).toBeLessThan(QUICK);
    expect(n.ms).toBeLessThan(QUICK);
  });
});

describe("the other Methods refuse in words and stay quick on hostile values", () => {
  const [y, x, c1, c2, c3] = [1, 2, 3, 4, 5].map((s) => series("tiny", s));
  const [oy, ox, o1, o2, o3] = [1, 2, 3, 4, 5].map((s) => series("ordinary", s));
  const refusal = (t: { kind: string; refusal: string | null }) => (t.kind === "refusal" ? t.refusal : null);
  const places = (name: string) => say("refuse-exact-places", { name, places: 40, orders: 30 }, ctx);
  it("partial correlation: refused before the exact arithmetic (it took 1.2 seconds), naming every series", () => {
    const { result, ms } = timed(() => partialTakeaway({ a: "A", b: "B", held: ["C", "D", "E"] }, y, x, [c1, c2, c3], "month", ctx));
    expect(ms).toBeLessThan(QUICK);
    expect(refusal(result)).toBe(["A", "B", "C", "D", "E"].map(places).join(" "));
    expect(result.sentence).toBeNull();
    expect(refusal(partialTakeaway({ a: "A", b: "B", held: ["C", "D", "E"] }, oy, ox, [o1, o2, o3], "month", ctx))).toBeNull();
  });
  it("lagged correlation and rank correlation", () => {
    expect(refusal(timed(() => laggedTakeaway("A", "B", y, x, "month", "values", ctx)).result)).toBe(`${places("A")} ${places("B")}`);
    expect(refusal(laggedTakeaway("A", "B", oy, ox, "month", "values", ctx))).toBeNull();
    const t = timed(() => spearmanTakeaway("A", "B", y, x, "month", "values", ctx));
    expect(t.ms).toBeLessThan(QUICK);
    expect(refusal(t.result)).toBe(`${places("A")} ${places("B")}`);
  });
  it("usual range, before and after, and the change point", () => {
    expect(refusal(timed(() => usualRangeTakeaway("A", y, "month", euro, ctx)).result)).toBe(places("A"));
    expect(refusal(timed(() => afterDateTakeaway("A", y, "month", "2024-01-01", euro, ctx)).result)).toBe(places("A"));
    const t = timed(() => changePointTakeaway("A", y, "month", euro, ctx));
    expect(t.ms).toBeLessThan(QUICK);
    expect(refusal(t.result)).toBe(places("A"));
    expect(refusal(changePointTakeaway("A", oy, "month", euro, ctx))).toBeNull();
    expect(refusal(usualRangeTakeaway("A", oy, "month", euro, ctx))).toBeNull();
  });
  it("the forecast, the seasonal forecast and the chance of reaching a Target (it took 5.7 seconds), and the forecast a page draws", () => {
    const m = metric({ period: "month", name: "Revenue" });
    const t = timed(() => forecastTakeaway(m, y, ctx, { ends: { min: 1, max: null } }));
    expect(t.ms).toBeLessThan(QUICK);
    expect(refusal(t.result)).toBe(places("Revenue"));
    expect(refusal(forecastTakeaway(m, oy, ctx))).toBeNull();
    const drawn = timed(() => bestForecast(y, "month", 12));
    expect(drawn.ms).toBeLessThan(QUICK);
    expect(drawn.result).toBeNull();
    expect(bestForecast(oy, "month", 12)).not.toBeNull();
    // Only the latest 120 periods are looked at, so hostile values before them are not.
    expect(bestForecast([...y, ...series("ordinary", 9, 120).map((p, i) => ({ ...p, period: months("2025-01", [0].concat(Array(130).fill(0)))[i + 1].period }))], "month", 12)).not.toBeNull();
  });
  it("share of the largest rows, Pareto and bridge", () => {
    const rows = y.map((p) => ({ label: p.period, value: Math.abs(p.value) }));
    expect(refusal(topShareTakeaway("Revenue", rows, 3, ctx))).toBe(places("Revenue"));
    expect(refusal(paretoTakeaway("Revenue", rows, ctx))).toBe(places("Revenue"));
    expect(refusal(topShareTakeaway("Revenue", oy.map((p) => ({ label: p.period, value: p.value })), 3, ctx))).toBeNull();
    const parts = y.map((p, i) => ({ label: p.period, before: p.value, after: x[i].value }));
    expect(refusal(bridgeTakeaway("Revenue", parts, euro, ctx, { before: 1, after: 2 }))).toBe(places("Revenue"));
    expect(refusal(bridgeTakeaway("Revenue", parts.map((p, i) => ({ ...p, before: i === 0 ? null : p.before })), euro, ctx))).toBe(places("Revenue"));
    expect(refusal(bridgeTakeaway("Revenue", oy.map((p, i) => ({ label: p.period, before: p.value, after: ox[i].value })), euro, ctx, { before: 1, after: 2 }))).toBeNull();
    // A part that has no value on one side, and a whole that is not given, are not values to judge.
    expect(refusal(bridgeTakeaway("Revenue", [{ label: "A", before: null, after: 5 }, { label: "B", before: 3, after: null }], euro, ctx))).toBeNull();
  });
  it("share, Pareto and bridge: a Metric whose whole alone is too wide is refused, one whose parts are fine and whole is fine is not", () => {
    const parts = [{ label: "A", before: 1, after: 2 }, { label: "B", before: 3, after: 5 }];
    expect(refusal(bridgeTakeaway("R", parts, euro, ctx, { before: 1e-300, after: 5 }))).toBe(places("R"));
    expect(refusal(bridgeTakeaway("R", parts, euro, ctx, { before: 4, after: 1e-300 }))).toBe(places("R"));
    expect(refusal(bridgeTakeaway("R", parts, euro, ctx, { before: 4, after: 7 }))).toBeNull();
    expect(refusal(bridgeTakeaway("R", parts.map((p) => ({ ...p, before: p.label === "A" ? null : p.before })), euro, ctx, { before: 4, after: 7 }))).toBeNull();
  });
  it("the pair scan leaves out a Metric whose changes are too wide, as it does one that cannot be combined, and is quick", () => {
    const ms = [1, 2, 3, 4].map((id) => ({ id, period: "month" as const }));
    // Walks of 30 months, each a sum of steps; Metric 4 moves exactly with Metric 1, at a size of 1e-300 or at the size of 1.
    const walk = (id: number) => { const r = lcg(40 + id); let v = 100; return Array.from({ length: 30 }, () => (v += Math.round((r() - 0.5) * 200) / 100)); };
    const levels = (scale: number) => (id: number) => months("2024-01", (id === 4 ? walk(1) : walk(id)).map((v) => Number((v * (id === 4 ? scale : 1)).toPrecision(12))));
    const scan = (scale: number) => timed(() => scanPairs(ms, levels(scale), () => false, "2026-07-15", 1));
    const found = (rows: ReturnType<typeof scanPairs>) => rows.map((r) => `${r.a}-${r.b}`);
    expect(found(scan(1).result)).toContain("1-4");
    const wide = scan(1e-300);
    expect(wide.ms).toBeLessThan(QUICK);
    expect(found(wide.result).some((p) => p.endsWith("-4"))).toBe(false);
    // The others are scanned all the same: the rows of the three are what they are with Metric 4 absent.
    expect(wide.result).toEqual(scanPairs(ms.slice(0, 3), levels(1), () => false, "2026-07-15", 1));
    expect(found(wide.result)).toContain("1-2");
  });
});

describe("ordinary values are never refused for how long the series is", () => {
  it("answers a usual range over two years of daily values to the cent, which no work allowance may stop", () => {
    const r = lcg(5);
    const daily = Array.from({ length: 730 }, (_, i) => ({ period: new Date(Date.UTC(2022, 0, 1 + i)).toISOString().slice(0, 10), value: Math.round((100 + i * 0.5 + r() * 40) * 100) / 100 }));
    expect(usualRangeTakeaway("A", daily, "day", euro, ctx).kind).toBe("answer");
  });
});

describe("the Takeaways whose series are cut to 120 periods run under the work allowance", () => {
  // A Takeaway cannot be made to spend 2.5e9 with values inside the bounds that it could not also be asked to work out in under a second,
  // so the wrapper is held by the source: a test fails when one is taken away.
  it.each([["change point", changePointTakeaway], ["before and after", afterDateTakeaway]] as const)("%s", (_name, takeaway) => {
    expect(takeaway.toString()).toMatch(/withinBudget\)?\(/);
  });
  it("and the values the bounds refuse are refused at once, whatever the Method", () => {
    const hostile = series("tiny", 1);
    for (const run of [() => changePointTakeaway("A", hostile, "month", euro, ctx), () => afterDateTakeaway("A", hostile, "month", "2020-01-01", euro, ctx), () => forecastTakeaway(metric({ period: "month" }), hostile, ctx)]) {
      const { result, ms } = timed(run);
      expect(ms).toBeLessThan(QUICK);
      expect(result.kind).toBe("refusal");
    }
  });
});

describe("a Takeaway that spends its whole work budget is a refusal in words", () => {
  it("has the Method's name and no number, and a Takeaway that does not is left as it is", () => {
    const t = withinBudget("numbers-method-holt", ctx, () => { spend(WORK_BUDGET + 1); return emptyTakeaway("never"); });
    expect(t).toMatchObject({ kind: "refusal", method: "Holt's linear trend", refusal: "These values need too much exact work to finish in reasonable time: round the values, or use fewer Metrics where several are used.", sentence: null, figures: [] });
    expect(withinBudget("numbers-method-holt", ctx, () => emptyTakeaway("kept")).method).toBe("kept");
  });
});

describe("correlation leaves out values that are too wide, once for each pair, before the exact arithmetic", () => {
  const [a, b, c] = [1, 2, 3].map((id) => metric({ id, slug: `m${id}`, name: `M${id}`, period: "month" }));
  const data: Record<string, Point[]> = { m1: series("ordinary", 1), m2: series("tiny", 2), m3: series("ordinary", 3) };
  const resolve = (slug: string) => ({ metric: [a, b, c].find((m) => m.slug === slug)!, points: data[slug] });
  it("says why in words and names the Metric, and ranks the others as before", () => {
    const wide = correlate(a, b, resolve, { yearStart: 1, basis: "values" });
    expect(wide).toMatchObject({ ok: false, why: "too-wide", reason: say("refuse-exact-places", { name: "M2", places: 40, orders: 30 }, ctx) });
    const { ranked, leftOut } = rankCorrelations(a, [b, c], resolve, { yearStart: 1, basis: "values" });
    expect(ranked.map((r) => r.metric.slug)).toEqual(["m3"]);
    expect(leftOut.map((l) => [l.metric.slug, l.why])).toEqual([["m2", "too-wide"]]);
    expect(correlate(a, c, resolve, { yearStart: 1, basis: "values" })).toMatchObject({ ok: true });
  });
});

describe("correlation names what is too wide, in the order of the Metrics", () => {
  const [a, b] = [1, 2].map((id) => metric({ id, slug: `d${id}`, name: `D${id}`, period: "month" }));
  const of = (x: Point[], y: Point[]) => correlate(a, b, (slug) => ({ metric: slug === "d1" ? a : b, points: slug === "d1" ? x : y }), { yearStart: 1, basis: "values" });
  const [fine, tiny, spread] = [series("ordinary", 1), series("minute", 2), months("2024-01", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1e31, 5, 6, 7, 8])];
  const words = (name: string, case_: "refuse-exact-places" | "refuse-exact-orders") => say(case_, { name, places: 40, orders: 30 }, { style: "1,234.5" });
  it("D1 alone, D2 alone, or both, in one line", () => {
    expect(of(tiny, fine)).toMatchObject({ ok: false, why: "too-wide", period: "month", n: 120, reason: words("D1", "refuse-exact-places") });
    expect(of(fine, tiny)).toMatchObject({ ok: false, why: "too-wide", reason: words("D2", "refuse-exact-places") });
    expect(of(tiny, tiny)).toMatchObject({ ok: false, why: "too-wide", reason: `${words("D1", "refuse-exact-places")} ${words("D2", "refuse-exact-places")}` });
    expect(of(spread, months("2024-01", [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2]))).toMatchObject({ ok: false, why: "too-wide", n: 17, reason: words("D1", "refuse-exact-orders") });
  });
  it("judges the levels before it chooses a basis: levels that need more than the bounds are left out even where their changes would not", () => {
    // 9.8e14 beside 1e-290: the changes of these are plain numbers, but choosing between values and changes is exact arithmetic on the levels.
    const auto = correlate(a, b, (slug) => ({ metric: slug === "d1" ? a : b, points: slug === "d1" ? series("tiny", 1) : series("ordinary", 2) }), { yearStart: 1 });
    expect(auto).toMatchObject({ ok: false, why: "too-wide", n: 120, reason: words("D1", "refuse-exact-places") });
  });
  it("judges the levels first even where the changes are plain and the series both rise", () => {
    const rising = months("2022-01", [1e-290, ...Array.from({ length: 29 }, (_, i) => (i + 1) * 1e12)]);
    const r = correlate(a, b, (slug) => ({ metric: slug === "d1" ? a : b, points: slug === "d1" ? rising : months("2022-01", Array.from({ length: 30 }, (_, i) => i * 1e12 + 5)) }), { yearStart: 1 });
    expect(r).toMatchObject({ ok: false, why: "too-wide", n: 30, reason: words("D1", "refuse-exact-places") });
  });
  it("and the changes it works out on, by the same words", () => {
    const rising = (shift: number): Point[] => months("2022-01", Array.from({ length: 30 }, (_, i) => (i < 20 ? Number(`${12345678901234567 + 3 * (i + shift)}e-40`) : 1e5 + (i + shift) * 1e3)));
    const r = correlate(a, b, (slug) => ({ metric: slug === "d1" ? a : b, points: slug === "d1" ? rising(0) : rising(1) }), { yearStart: 1 });
    expect(r).toMatchObject({ ok: false, why: "too-wide", reason: `${words("D1", "refuse-exact-orders")} ${words("D2", "refuse-exact-orders")}` });
    expect((r as { n: number }).n).toBe(29);
  });
});

describe("correlation judges the changes it works out on, not only the levels", () => {
  const [a, b] = [1, 2].map((id) => metric({ id, slug: `c${id}`, name: `C${id}`, period: "month" }));
  // Levels from 1.2e-24 (17 digits, 40 places) to 1e5 (inside the bounds), rising throughout: compared by change, the steps are 3e-40 beside 1e3.
  const rising = (shift: number): Point[] => months("2022-01", Array.from({ length: 30 }, (_, i) => (i < 20 ? Number(`${12345678901234567 + 3 * (i + shift)}e-40`) : 1e5 + (i + shift) * 1e3)));
  const resolve = (slug: string) => ({ metric: slug === "c1" ? a : b, points: slug === "c1" ? rising(0) : rising(1) });
  it("leaves the pair out in words when its changes need more than the bounds allow, and still compares the levels", () => {
    expect(wideReason(rising(0).map((p) => p.value))).toBeNull();
    const t = timed(() => correlate(a, b, resolve, { yearStart: 1 }));
    expect(t.ms).toBeLessThan(QUICK);
    expect(t.result).toMatchObject({ ok: false, why: "too-wide" });
    expect(correlate(a, b, resolve, { yearStart: 1, basis: "values" })).toMatchObject({ ok: true, basis: "values" });
  });
});


// Series that people legitimately keep, or that programs compute from them, and that every Method must work on (never a refusal for the work it takes).
const dig17 = (r: () => number) => (1 + r() * 8.99).toPrecision(17);
const LEGIT: Record<string, (r: () => number, i: number) => number> = {
  "cents up to 1e12": (r, i) => Math.round((1e11 + i * 1e9 + r() * 4e10) * 100) / 100,
  "unit prices to 8 decimals": (r) => Number((12.5 + r() * 3).toFixed(8)),
  "rates of 1e-7 with 17 digits": (r) => Number(`${dig17(r)}e-7`),
  "values near 1e6 to 6 decimals": (r, i) => Number((1e6 + i * 100 + r() * 5e4).toFixed(6)),
  "values near 1e6 to 8 decimals": (r, i) => Number((1e6 + i * 100 + r() * 5e4).toFixed(8)),
  "averages of cents": (r, i) => (Math.round((100 + i + r() * 40) * 100) / 100 + Math.round((100 + r() * 40) * 100) / 100 + Math.round((100 + r() * 40) * 100) / 100) / 3,
  "counts with one 1e9 among zeros": (r, i) => (i === 60 ? 1e9 : Math.floor(r() * 3)),
  "a conversion rate of 3e-5, a double": (r) => (Math.round(r() * 3000) + 30) / (Math.round(r() * 800000) + 1e6),
};
const workWords = /exactly in reasonable time|cannot be worked out exactly/;

describe.each(Object.entries(LEGIT))("legitimate values: %s", (_name, make) => {
  const data = (seed: number): Point[] => { const r = lcg(seed); return months("2015-01", Array.from({ length: 120 }, (_, i) => make(r, i))); };
  const [y, x, c1, c2, c3, c4, c5] = [1, 2, 3, 4, 5, 6, 7].map(data);
  const refusal = (t: { kind: string; refusal: string | null }) => (t.kind === "refusal" ? t.refusal : null);
  it("are inside the bounds, as levels and as changes", () => {
    for (const s of [y, x]) {
      expect(wideReason(s.map((p) => p.value))).toBeNull();
      expect(wideReason(changes(s, "month").map((p) => p.value))).toBeNull();
    }
  });
  it.each([1, 2, 3, 4, 5, 6])("are worked out by a fit of %s drivers, never refused for the work", (k) => {
    const r = timed(() => fit(input(y, [x, c1, c2, c3, c4, c5].slice(0, k))));
    expect(r.ms).toBeLessThan(QUICK);
    expect(r.result.ok ? [] : r.result.refusals.map((f) => f.case).filter((c) => c.startsWith("refuse-exact"))).toEqual([]);
  });
  it("are worked out by partial and lagged correlation, rank correlation, usual range, before and after, the change point and the forecast", () => {
    const takeaways = [
      partialTakeaway({ a: "A", b: "B", held: ["C", "D"] }, y, x, [c1, c2], "month", ctx),
      laggedTakeaway("A", "B", y, x, "month", "values", ctx),
      spearmanTakeaway("A", "B", y, x, "month", "values", ctx),
      usualRangeTakeaway("A", y, "month", euro, ctx),
      afterDateTakeaway("A", y, "month", "2022-01-01", euro, ctx),
      changePointTakeaway("A", y, "month", euro, ctx),
      forecastTakeaway(metric({ period: "month" }), y, ctx),
    ];
    for (const t of takeaways) expect(refusal(t) ?? "", t.method).not.toMatch(workWords);
    expect(bestForecast(y, "month", 12)).not.toBeNull();
  });
  it("are compared by correlation", () => {
    const [a, b] = [1, 2].map((id) => metric({ id, slug: `l${id}`, name: `L${id}`, period: "month" }));
    const r = correlate(a, b, (slug) => ({ metric: slug === "l1" ? a : b, points: slug === "l1" ? y : x }), { yearStart: 1 });
    expect(r.ok ? "ok" : r.why).not.toMatch(/too-wide|too-much/);
  });
});

describe("the worst values the bounds admit: 17 digits at 40 places beside 17 digits of 1e5, 120 periods", () => {
  const [y, x, c1, c2, c3] = [1, 2, 3, 4, 5].map((s) => series("dense", s));
  const m = metric({ period: "month", name: "Revenue" });
  it("every Method answers, or refuses in words by the work allowance, in a bounded time (the case assertions carry the guarantee; the time is only a generous bound)", () => {
    const runs: [string, () => unknown][] = [
      ["fit of 6", () => fit(input(y, [x, c1, c2, c3, series("dense", 6), series("dense", 7)]))],
      ["importance of 3", () => importance(input(y, [x, c1, c2]))],
      ["partial", () => partialTakeaway({ a: "A", b: "B", held: ["C", "D", "E"] }, y, x, [c1, c2, c3], "month", ctx)],
      ["lagged", () => laggedTakeaway("A", "B", y, x, "month", "values", ctx)],
      ["rank", () => spearmanTakeaway("A", "B", y, x, "month", "values", ctx)],
      ["usual range", () => usualRangeTakeaway("A", y, "month", euro, ctx)],
      ["before and after", () => afterDateTakeaway("A", y, "month", "2023-01-01", euro, ctx)],
      ["change point", () => changePointTakeaway("A", y, "month", euro, ctx)],
      ["forecast", () => forecastTakeaway(m, y, ctx)],
      ["forecast with a Target", () => forecastTakeaway(m, y, ctx, { ends: { min: 1, max: null } })],
      ["the forecast a page draws", () => bestForecast(y, "month", 12)],
      ["share, Pareto, bridge", () => [topShareTakeaway("A", y.map((p) => ({ label: p.period, value: Math.abs(p.value) })), 3, ctx), paretoTakeaway("A", y.map((p) => ({ label: p.period, value: Math.abs(p.value) })), ctx), bridgeTakeaway("A", y.map((p, i) => ({ label: p.period, before: p.value, after: x[i].value })), euro, ctx)]],
    ];
    for (const [name, run] of runs) expect(timed(run).ms, name).toBeLessThan(QUICK);
  });
  it("the fit of 6 is refused in words where it would take long, and the forecast and the chart agree: both draw one, since its cost is far inside the allowance", () => {
    expect(cases(fit(input(y, [x, c1, c2, c3, series("dense", 6), series("dense", 7)])))).toEqual(["refuse-exact-work"]);
    expect(forecastTakeaway(m, y, ctx).kind).toBe("answer");
    expect(bestForecast(y, "month", 12)).not.toBeNull();
  });
});

describe("the Heads-ups about one Metric leave out a Metric whose values are too wide", () => {
  const metricOf = { id: 1, name: "Signups", period: "month" as const, polarity: "higher" as const, target_min: 100, target_max: null, unit: "€", unit_position: "after" as const, decimals: 0 };
  const ctxOf = { style: "1,234.5" as const, today: "2025-01-15" };
  it("tries no test of any kind on them, and still tries the ordinary Metric's", () => {
    const hostile = timed(() => testsOf({ metric: metricOf, points: series("tiny", 1) }, ctxOf));
    expect(hostile.result).toEqual([]);
    expect(hostile.ms).toBeLessThan(QUICK);
    expect(testsOf({ metric: metricOf, points: series("ordinary", 1) }, ctxOf).length).toBeGreaterThan(0);
    // Only the window the tests look at is judged: hostile values older than it are not read.
    const old = series("tiny", 2, 30).map((p) => p.value);
    const recent = series("ordinary", 1, HEADS_UP.window).map((p) => p.value);
    expect(testsOf({ metric: metricOf, points: months("2010-01", [...old, ...recent]) }, { ...ctxOf, today: "2030-01-15" }).length).toBeGreaterThan(0);
  });
});

describe("the change point is not searched for in values that are too wide", () => {
  it("has no result to read for either kind of refusal, and the real result for any other", () => {
    expect(checkedChangePoint("A", series("tiny", 1), "month").result).toEqual({ ok: false, why: "huge" });
    expect(checkedChangePoint("A", series("wide", 1), "month").result).toEqual({ ok: false, why: "huge" });
    expect(checkedChangePoint("A", series("ordinary", 1).slice(0, 5), "month").result).toEqual({ ok: false, why: "few" });
    expect(checkedChangePoint("A", series("ordinary", 1), "month").result.ok).toBe(true);
  });
});

describe("long series are cut to the latest 120 periods, and the Takeaway says so", () => {
  const days = (seed: number, n: number): Point[] => { const r = lcg(seed); return Array.from({ length: n }, (_, i) => ({ period: new Date(Date.UTC(2010, 0, 1 + i)).toISOString().slice(0, 10), value: Math.round((100 + i * 0.5 + r() * 40) * 100) / 100 })); };
  const long = [1, 2, 3, 4, 5].map((s) => days(s, 3650));
  const note = "Only the latest 120 days with a value in common are used.";
  const notes = (t: { kind: string; notes: string[] }) => (t.kind === "answer" ? t.notes : []);
  it("partial, lagged and rank correlation and the usual range on 3,650 daily values answer in a bounded time, with the note, as on the latest 120 alone", () => {
    const cut = (s: Point[]) => s.slice(-120);
    const runs: [string, () => ReturnType<typeof usualRangeTakeaway>, () => ReturnType<typeof usualRangeTakeaway>][] = [
      ["partial", () => partialTakeaway({ a: "A", b: "B", held: ["C", "D", "E"] }, long[0], long[1], long.slice(2), "day", ctx), () => partialTakeaway({ a: "A", b: "B", held: ["C", "D", "E"] }, cut(long[0]), cut(long[1]), long.slice(2).map(cut), "day", ctx)],
      ["lagged", () => laggedTakeaway("A", "B", long[0], long[1], "day", "values", ctx), () => laggedTakeaway("A", "B", cut(long[0]), cut(long[1]), "day", "values", ctx)],
      ["rank", () => spearmanTakeaway("A", "B", long[0], long[1], "day", "values", ctx), () => spearmanTakeaway("A", "B", cut(long[0]), cut(long[1]), "day", "values", ctx)],
      ["usual range", () => usualRangeTakeaway("A", long[0], "day", euro, ctx), () => usualRangeTakeaway("A", cut(long[0]), "day", euro, ctx)],
    ];
    for (const [name, many, latest] of runs) {
      const t = timed(many);
      expect(t.ms, name).toBeLessThan(QUICK);
      expect(t.result.kind, name).toBe("answer");
      expect(notes(t.result), name).toContain(note);
      const alone = latest();
      expect({ ...t.result, notes: t.result.notes.filter((n) => n !== note) }, name).toEqual(alone);
      expect(notes(alone), name).not.toContain(note);
    }
  });
  it("say nothing of it for 120 periods or fewer", () => {
    const cut = (s: Point[]) => s.slice(-120);
    expect(notes(usualRangeTakeaway("A", cut(long[0]), "day", euro, ctx))).toEqual([]);
    expect(notes(spearmanTakeaway("A", "B", cut(long[0]), cut(long[1]), "day", "values", ctx))).toEqual([]);
  });
});

describe("the ranking of Metrics by correlation runs under one work allowance", () => {
  const ms = Array.from({ length: 12 }, (_, i) => metric({ id: i + 1, slug: `r${i}`, name: `R${i}`, period: "month" }));
  const data = Object.fromEntries(ms.map((m, i) => [m.slug, series(i === 0 ? "ordinary" : "dense", i + 1)]));
  const resolve = (slug: string) => ({ metric: ms.find((m) => m.slug === slug)!, points: data[slug] });
  it("compares the pairs it can, ranks them exactly as it would alone, and says once that the others were not compared", () => {
    const [self, ...others] = ms;
    const spentAfter = (n: number) => withWork(() => rankCorrelations(self, others, resolve, { yearStart: 1, basis: "values" }), n)!;
    const all = rankCorrelations(self, others, resolve, { yearStart: 1, basis: "values" });
    expect(all.leftOut.filter((l) => l.why === "too-much")).toEqual([]);
    // A work allowance of 1: nothing is compared, every Metric is left out in the same words.
    const none = spentAfter(1);
    expect(none.ranked).toEqual([]);
    expect(none.leftOut.map((l) => l.why)).toEqual(others.map(() => "too-much"));
    expect(new Set(none.leftOut.map((l) => l.reason)).size).toBe(1);
    expect(none.leftOut[0].reason).toBe("Some Metrics were not compared: there are too many of them to work out exactly in reasonable time.");
    // An allowance that covers some of the pairs: the compared ones are those a ranking of just them gives.
    const some = spentAfter(100_000_000);
    const compared = others.filter((m) => !some.leftOut.some((l) => l.metric.id === m.id && l.why === "too-much"));
    expect(compared.length).toBeGreaterThan(0);
    expect(compared.length).toBeLessThan(others.length);
    expect(some.ranked).toEqual(rankCorrelations(self, compared, resolve, { yearStart: 1, basis: "values" }).ranked);
    // The ones left are the last ones: once spent, nothing after is compared.
    const firstLeft = others.findIndex((m) => some.leftOut.some((l) => l.metric.id === m.id && l.why === "too-much"));
    expect(others.slice(firstLeft).every((m) => some.leftOut.some((l) => l.metric.id === m.id && l.why === "too-much"))).toBe(true);
  });
});

describe("the fit judges the periods it uses", () => {
  it("is made on the latest periods where an old value of a long history is too wide, and refused where one of them is", () => {
    const old = (kind: Kind, seed: number) => { const long = series(kind, seed, 160); return long.map((p, i) => (i === 3 ? { ...p, value: 1e-300 } : p)); };
    const clean = [1, 2, 3].map((sd) => old("ordinary", sd));
    const f = fit(input(clean[0], [clean[1], clean[2]]));
    expect(f.ok).toBe(true);
    expect(f.ok && f.rows.length).toBe(120);
    // The same history with the odd value inside the 120 latest periods is refused, naming that series.
    const inside = clean.map((s, i) => s.map((p, k) => (i === 1 && k === 150 ? { ...p, value: 1e-300 } : p)));
    expect(fit(input(inside[0], [inside[1], inside[2]]))).toEqual({ ok: false, refusals: [{ case: "refuse-exact-places", slots: { name: "Visits", places: 40, orders: 30 } }] });
    // A period one series lacks is that series' gap alone, as in the clean history.
    const gaps = (wideFirst: boolean) => {
      const [t, d] = [series("ordinary", 11, 140), series("ordinary", 12, 140)];
      const target = t.filter((_, i) => i !== 135).map((p, i) => (wideFirst && i === 0 ? { ...p, value: 1e-45 } : p));
      const f = fit(input(target, [d]));
      return f.ok ? f.verdict.cautions.filter((c) => c.case === "caution-gaps").map((c) => c.slots.name) : [];
    };
    expect(gaps(false)).toEqual(["Revenue"]);
    expect(gaps(true)).toEqual(["Revenue"]);
    // A series with no value has no range to judge: the others are not judged either, and the fit says there are too few periods.
    expect(cases(fit(input([], [series("tiny", 1)])))).toEqual(["refuse-periods"]);
    // Series with no period in common keep what they have, and a wide one is refused.
    const [early, late] = [series("ordinary", 1, 20), months("2030-01", Array.from({ length: 20 }, (_, i) => 100 + i))];
    expect(cases(fit(input(early.map((p, i) => (i === 0 ? { ...p, value: 1e-45 } : p)), [late])))).toEqual(["refuse-exact-places"]);
    // The basis is chosen on the whole history where that is clean (a rise early on and none since is "changes" over 160 months, "values" over the latest 121).
    const walk = (seed: number) => { let x = seed; const r = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648); const mk = () => { let v = 100; return months("2010-01", Array.from({ length: 160 }, (_, i) => Math.round((v += (i < 40 ? 3 : 0) + (r() - 0.5) * 6) * 100) / 100)); }; return [mk(), mk()]; };
    const [wa, wb] = walk(1);
    const long = fit(input(wa, [wb], { basis: undefined }));
    expect(long.ok && long.basis).toBe("changes");
    // The range judged ends at the latest period they have in common, and takes it in: later values of one series are not read, that one is.
    const [t, d] = [series("ordinary", 21, 140), series("ordinary", 22, 130)];
    const oddAt = (k: number) => t.map((p, i) => (i === 0 || i === k ? { ...p, value: 1e-300 } : p));
    expect(fit(input(oddAt(135), [d])).ok).toBe(true);
    expect(cases(fit(input(oddAt(129), [d])))).toEqual(["refuse-exact-places"]);
    // A short wide history is refused as before.
    expect(cases(fit(input(series("tiny", 1), [series("tiny", 2)])))).toEqual(["refuse-exact-places", "refuse-exact-places"]);
  });
});

describe("no forecast for values too wide is said, and the Drivers Takeaway says when the ranking ran out", () => {
  it("knows which values have none, from the latest 120 periods, and has its words", () => {
    expect(forecastTooWide(series("tiny", 1))).toBe(true);
    expect(forecastTooWide(series("ordinary", 1))).toBe(false);
    expect(forecastTooWide([...series("tiny", 1, 5), ...series("ordinary", 1, 130).map((p, i) => ({ ...p, period: months("2030-01", Array(130).fill(0))[i].period }))])).toBe(false);
    expect(NO_FORECAST_WIDE).toBe("No forecast: the values are too fine or too wide to work out exactly.");
    expect(bestForecast(series("tiny", 1), "month", 12)).toBeNull();
  });
  it("says that the answer is among the Metrics compared, only then", () => {
    const [a, b] = [1, 2].map((id) => metric({ id, slug: `n${id}`, name: `N${id}`, period: "month" }));
    const data = { n1: series("ordinary", 1), n2: series("ordinary", 2) };
    const { ranked } = rankCorrelations(a, [b], (slug) => ({ metric: slug === "n1" ? a : b, points: data[slug as "n1"] }), { yearStart: 1, basis: "values" });
    expect(driversTakeaway(a, ranked, ctx).notes).toEqual([]);
    expect(driversTakeaway(a, ranked, ctx, true).notes).toEqual(["This is among the Metrics that were compared: some were not, as working them out exactly would take too long."]);
  });
});

describe("a scan of many Metrics for Heads-ups about one Metric runs under an allowance", () => {
  const metricOf = (id: number) => ({ id, name: `M${id}`, period: "month" as const, polarity: "higher" as const, target_min: 100, target_max: null, unit: "€", unit_position: "after" as const, decimals: 0 });
  const ctxOf = { style: "1,234.5" as const, today: "2025-01-15" };
  const looks = (kind: Kind, n: number) => Array.from({ length: n }, (_, i) => ({ metric: metricOf(i + 1), points: series(kind, 1 + (i % 7)) }));
  it("looks at 200 hostile Metrics in no time (none has a test), and at ordinary ones all", () => {
    const hostile = timed(() => testsOfScan(looks("tiny", 200), ctxOf));
    expect(hostile.ms).toBeLessThan(QUICK);
    expect(hostile.result).toEqual({ tests: [], skipped: 0, skippedIds: [] });
    const ordinary = testsOfScan(looks("ordinary", 30), ctxOf);
    expect(ordinary.skipped).toBe(0);
    expect(ordinary.tests.length).toBeGreaterThan(0);
  });
  it("leaves the Metrics after the scan's allowance is spent unlooked at, still counted for the correction as tests of chance 1, in about the scan's time", () => {
    const worst = timed(() => testsOfScan(looks("dense", 200), ctxOf));
    expect(worst.ms).toBeLessThan(QUICK);
    expect(worst.result.skipped).toBeGreaterThan(0);
    expect(worst.result.skipped).toBeLessThan(200);
    const neutral = worst.result.tests.filter((t) => t.p === 1 && t.gates && Object.keys(t.gates).length === 0);
    expect(neutral).toHaveLength(3 * worst.result.skipped);
    expect(() => neutral[0].build(1, 1)).toThrow("never reported");
    // The same looks give the same answer twice.
    expect(testsOfScan(looks("dense", 200), ctxOf).skipped).toBe(worst.result.skipped);
    expect(testsOfScan(looks("dense", 200).reverse(), ctxOf).skippedIds).toEqual(worst.result.skippedIds);
    // The first Metrics by id are the ones looked at.
    expect(worst.result.skippedIds).toEqual([...worst.result.skippedIds].sort((x, y) => x - y));
    expect(worst.result.skippedIds[0]).toBeGreaterThan(1);
  });
});

describe("a refusal says nothing of a cut it did not make", () => {
  it("has no note where the Takeaway is a refusal, however long the history", () => {
    const flat = Array.from({ length: 300 }, (_, i) => ({ period: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10), value: 5 }));
    const t = usualRangeTakeaway("A", flat, "day", euro, ctx);
    expect(t.kind).toBe("refusal");
    expect(t.notes).toEqual([]);
  });
});

describe("a forecast that spends its work allowance is a refusal in words, for the Takeaway and for the Heads-up", () => {
  it("says what to do, and gives no reach", () => {
    const m = metric({ period: "month", name: "Revenue" });
    const y = series("ordinary", 1);
    expect(forecastTakeaway(m, y, ctx, { allowance: 1000 })).toMatchObject({ kind: "refusal", refusal: "These values need too much exact work to finish in reasonable time: round the values, or use fewer Metrics where several are used." });
    expect(forecastTakeaway(m, y, ctx).kind).toBe("answer");
    expect(reachOf(m, y, ctx, { ends: { min: 1, max: null }, allowance: 1000 })).toBeNull();
    expect(reachOf(m, y, ctx, { ends: { min: 1, max: null } })).not.toBeNull();
  });
});
