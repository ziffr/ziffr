// Every Method that works exactly on values refuses, in words, values it cannot work out in reasonable time (work-bound.ts; spec
// 0041, rule 12: never a quiet number), and stays quick on the worst such input. The hostile series are the ones a reviewer
// measured: 120 periods alternating 9.8e14 with 1e-290 to 1e-307, and values of 1e290 to 1e299, which took a fit of six drivers
// 12 and 40 seconds. Each Method is also shown to give what it gave before for ordinary values (the Methods' own tests hold the
// numbers); these tests hold the refusals, one step either side of each limit, and the time.
import { describe, expect, it } from "vitest";
import { checkSuitability, type MethodId } from "../suitability";
import { metric, months } from "../test/fixtures";
import { say } from "../takeaways/wording";
import { forecastTakeaway } from "../takeaways/forecast";
import { emptyTakeaway, withinBudget } from "../takeaways/takeaway";
import { rankCorrelations, correlate } from "../correlation";
import { spend, wideReason } from "../work-bound";
import type { Point } from "../types";
import { afterDateTakeaway } from "./before-after";
import { WORK_BUDGET } from "../work-bound";
import { bridgeTakeaway } from "./bridge";
import { changePointTakeaway } from "./change-point";
import { paretoTakeaway, topShareTakeaway } from "./concentration";
import { fit, importance, needs, predict, type Fit, type FitInput } from "./fit";
import { bestForecast } from "./forecast-choice";
import { laggedTakeaway } from "./lagged-correlation";
import { scanPairs } from "./pair-scan";
import { partialTakeaway } from "./partial-correlation";
import { usualRangeTakeaway } from "./quantiles";
import { spearmanTakeaway } from "./spearman";

const ctx = { style: "1,234.5" as const };
const euro = { unit: "€", unit_position: "after" as const, decimals: 0 };
/** The time a Method may take on the worst input, generous so that a busy machine never fails it: the Methods took 12 to 47 seconds before. */
const QUICK = 3000;

function lcg(start: number) {
  let x = start;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}
type Kind = "ordinary" | "tiny" | "huge" | "fine" | "wide" | "minute" | "dense";
/** 120 months of values: ordinary (to the cent), tiny (9.8e14 alternating with 1e-290 to 1e-307), huge (1e290 to 1e299), fine (15 digits at 20 places, which the limits let through) or wide (spanning 20 orders). */
function series(kind: Kind, seed: number, n = 120): Point[] {
  const r = lcg(seed);
  const value = (i: number): number => {
    if (kind === "ordinary") return Math.round((100 + i * 0.5 + r() * 40) * 100) / 100;
    if (kind === "tiny") return i % 2 === 0 ? 9.8e14 - Math.floor(r() * 1e9) : Number(`${(1 + r() * 8.9).toFixed(3)}e-${290 + Math.floor(r() * 17)}`);
    if (kind === "huge") return Number(`${(1 + r() * 8.9).toFixed(4)}e${290 + Math.floor(r() * 10)}`);
    if (kind === "dense") return i % 2 === 0 ? Number(`${(1 + r() * 8.99).toPrecision(17)}e16`) : Number(`${(1 + r() * 8.99).toPrecision(17)}e-3`);
    if (kind === "minute") return Number(`${(1 + r() * 8.9).toFixed(3)}e-295`);
    if (kind === "fine") return Number(`${(1 + r() * 8).toPrecision(15)}e-6`);
    return i % 2 === 0 ? Number((1e18 * (1 + r())).toPrecision(5)) : Number((1e-2 * (1 + r())).toPrecision(3));
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
    const v = checkSuitability(method, { series: [{ name: "Fine", points: months("2024-01", [1, 2, 3]) }, { name: "Tiny", points: months("2024-01", [1e-300, 2e-300, 3e-300]) }, { name: "Spread", points: months("2024-01", [1, 5, 1e21]) }], span: "month" });
    expect(v).toEqual({
      refusals: [
        { case: "refuse-exact-places", slots: { name: "Tiny", places: 20, orders: 20 } },
        { case: "refuse-exact-orders", slots: { name: "Spread", places: 20, orders: 20 } },
      ],
      cautions: [],
      switches: [],
    });
  });
  it("lets values on the limits through to the checks: 20 places, and a spread of exactly 10^20", () => {
    const refusals = (vs: number[]) => checkSuitability("usualRange", { series: [{ name: "A", points: months("2024-01", vs) }], span: "month" }).refusals.map((f) => f.case);
    expect(refusals([1e-20, 2e-20, 3e-20])).toEqual(["refuse-periods"]);
    expect(refusals([1.5e-20, 2e-20, 3e-20])).toEqual(["refuse-exact-places"]);
    expect(refusals([1, 5, 1e20])).toEqual(["refuse-periods"]);
    expect(refusals([1, 5, 1.0000000000000002e20])).toEqual(["refuse-exact-orders"]);
  });
  it("says it in words a person can read, with the limits", () => {
    const f = { places: 20, orders: 20, name: "Signups" };
    expect(say("refuse-exact-places", f, ctx)).toBe("Signups: its values go to more than 20 decimal places, which cannot be worked out exactly in reasonable time.");
    expect(say("refuse-exact-orders", f, ctx)).toBe("Signups: its values span more than 20 orders of magnitude, from the smallest that is not 0 to the largest, which cannot be worked out exactly in reasonable time.");
  });
});

describe("the multiple fit on hostile values", () => {
  const [ordinary, tiny, huge, fine] = (["ordinary", "tiny", "huge", "fine"] as const).map((k) => [series(k, 1), ...[2, 3, 4, 5, 6, 7].map((s) => series(k, s))]);
  it.each([1, 2, 3, 4, 5, 6])("refuses %s drivers of tiny values before any exact arithmetic, naming each series, in well under a second (it took 1 to 34 seconds)", (k) => {
    const { result, ms } = timed(() => fit(input(tiny[0], tiny.slice(1, 1 + k))));
    expect(ms).toBeLessThan(QUICK);
    expect(result).toEqual({ ok: false, refusals: Array.from({ length: k + 1 }, (_, i) => ({ case: "refuse-exact-places", slots: { name: i === 0 ? "Revenue" : ["Visits", "Price", "Tickets", "Churn", "Orders", "Returns"][i - 1], places: 20, orders: 20 } })) });
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
    expect(timed(() => fit(input(ordinary[0], [ordinary[1], wide]))).result).toEqual({ ok: false, refusals: [{ case: "refuse-exact-orders", slots: { name: "Price", places: 20, orders: 20 } }] });
  });
  it("stops a fit of six drivers on values of 1e290 and more, which no decimal place catches, when its work is spent, in words (it took 40 seconds)", () => {
    const { result, ms } = timed(() => fit(input(huge[0], huge.slice(1, 7))));
    expect(ms).toBeLessThan(QUICK);
    expect(result).toEqual({ ok: false, refusals: [{ case: "refuse-exact-work", slots: {} }] });
    expect(timed(() => importance(input(huge[0], huge.slice(1, 7)))).ms).toBeLessThan(QUICK);
  });
  it("stops a fit of six drivers on 15 digits at 20 places, which the limits let through, when its work is spent; fewer drivers on the same values are worked out", () => {
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
  it("refuse rows that need more than 20 decimal places, or span more than 20 orders, naming the series", () => {
    const tiny = withRows(wideRows((i, v) => (i % 2 === 0 ? v : v * 1e-300)));
    const p = timed(() => predict(tiny, [1, 2]));
    expect(p.ms).toBeLessThan(QUICK);
    expect(cases(p.result)).toEqual(["refuse-exact-places", "refuse-exact-places", "refuse-exact-places"]);
    expect(cases(needs(tiny, { goal: 100, driver: 0 }))).toEqual(["refuse-exact-places", "refuse-exact-places", "refuse-exact-places"]);
    const wide = withRows(good.rows.map((r, i) => (i === 3 ? { ...r, x: [r.x[0], 1e24] } : r)));
    expect(predict(wide, [1, 2])).toEqual({ ok: false, refusals: [{ case: "refuse-exact-orders", slots: { name: good.drivers[1].name, places: 20, orders: 20 } }] });
    expect(needs(wide, { goal: 100, driver: 0 })).toEqual({ ok: false, refusals: [{ case: "refuse-exact-orders", slots: { name: good.drivers[1].name, places: 20, orders: 20 } }] });
  });
  it("still answer for the rows the fit was made from", () => {
    expect(predict(good, [150, 160]).ok).toBe(true);
    expect(needs(good, { goal: 150, driver: 0 }).ok).toBe(true);
  });
  it("answer in well under a second for the largest values a double holds, six drivers, 120 periods (one refit is far inside the limits)", () => {
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
  const places = (name: string) => say("refuse-exact-places", { name, places: 20, orders: 20 }, ctx);
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
  it.each([["change point", changePointTakeaway], ["before and after", afterDateTakeaway], ["forecast", forecastTakeaway]] as const)("%s", (_name, takeaway) => {
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
    expect(t).toMatchObject({ kind: "refusal", method: "Holt's linear trend", refusal: "These values are too large or too fine to work out exactly in reasonable time.", sentence: null, figures: [] });
    expect(withinBudget("numbers-method-holt", ctx, () => emptyTakeaway("kept")).method).toBe("kept");
  });
});

describe("correlation leaves out values that are too wide, once for each pair, before the exact arithmetic", () => {
  const [a, b, c] = [1, 2, 3].map((id) => metric({ id, slug: `m${id}`, name: `M${id}`, period: "month" }));
  const data: Record<string, Point[]> = { m1: series("ordinary", 1), m2: series("tiny", 2), m3: series("ordinary", 3) };
  const resolve = (slug: string) => ({ metric: [a, b, c].find((m) => m.slug === slug)!, points: data[slug] });
  it("says why in words and names the Metric, and ranks the others as before", () => {
    const wide = correlate(a, b, resolve, { yearStart: 1, basis: "values" });
    expect(wide).toMatchObject({ ok: false, why: "too-wide", reason: say("refuse-exact-places", { name: "M2", places: 20, orders: 20 }, ctx) });
    const { ranked, leftOut } = rankCorrelations(a, [b, c], resolve, { yearStart: 1, basis: "values" });
    expect(ranked.map((r) => r.metric.slug)).toEqual(["m3"]);
    expect(leftOut.map((l) => [l.metric.slug, l.why])).toEqual([["m2", "too-wide"]]);
    expect(correlate(a, c, resolve, { yearStart: 1, basis: "values" })).toMatchObject({ ok: true });
  });
});

describe("correlation judges the changes it works out on, not only the levels", () => {
  const [a, b] = [1, 2].map((id) => metric({ id, slug: `c${id}`, name: `C${id}`, period: "month" }));
  // Levels from 1e-5 to 1e14 (inside the bounds), rising throughout: compared by change, the steps are 1e-6 beside 1e14.
  const rising = (shift: number): Point[] => months("2022-01", Array.from({ length: 30 }, (_, i) => (i < 20 ? Number(`${10 + i + shift}e-6`) : 1e14 + (i + shift) * 1e12)));
  const resolve = (slug: string) => ({ metric: slug === "c1" ? a : b, points: slug === "c1" ? rising(0) : rising(1) });
  it("leaves the pair out in words when its changes need more than the bounds allow, and still compares the levels", () => {
    expect(wideReason(rising(0).map((p) => p.value))).toBeNull();
    const t = timed(() => correlate(a, b, resolve, { yearStart: 1 }));
    expect(t.ms).toBeLessThan(QUICK);
    expect(t.result).toMatchObject({ ok: false, why: "too-wide" });
    expect(correlate(a, b, resolve, { yearStart: 1, basis: "values" })).toMatchObject({ ok: true, basis: "values" });
  });
});

describe("the worst values the limits admit: 17 digits at 20 places beside 17 digits of 1e16, 120 periods", () => {
  const [y, x, c1, c2, c3] = [1, 2, 3, 4, 5].map((s) => series("dense", s));
  const m = metric({ period: "month", name: "Revenue" });
  it("every Method answers or refuses in well under a second (the bound here is generous so that a busy machine never fails it)", () => {
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
  it("the fit of 6 is refused in words where it would take long, and the forecast, which takes as long here, is refused in the same words", () => {
    expect(cases(fit(input(y, [x, c1, c2, c3, series("dense", 6), series("dense", 7)])))).toEqual(["refuse-exact-work"]);
    expect(forecastTakeaway(m, y, ctx)).toMatchObject({ kind: "refusal", refusal: "These values are too large or too fine to work out exactly in reasonable time." });
  });
});
