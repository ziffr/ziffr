// The suitability checks against their reference, SciPy and NumPy (spec 0041, "When the data does not suit a Method"; spec
// 0022 for the method): each check decided exactly as the reference decides it on generated series, one step either side of
// every threshold, hostile inputs, the invariants (a refusal carries no other finding, the same series gives the same
// verdict twice, nothing is removed from the input) and a simulation that well-behaved series draw no caution.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forecast } from "./forecast";
import { SEASON_LENGTH, SUITABILITY, checkSuitability, driversAllowed, levelShift, linkChange, minimumPeriods, rankAssociation, runsTail, seasonDifference, skewness, verdictOutcome, type MethodId, type SuitabilityInputs, type Verdict } from "./suitability";
import { fractionOf } from "./exact";
import { metric } from "./test/fixtures";
import { referencePearson } from "./test/reference/analyses";
import { dayOf, monthsLater, textOf } from "./test/reference/calendar";
import { runs } from "./test/reference/check";
import { compareExact, exactOf, fraction, type Exact } from "./test/reference/exact";
import { referenceFarOff, referenceGaps, referenceMad, referenceMedian, referenceRuns, referenceRunsTail, referenceSeasonDifference, referenceSkewSquared, referenceSpearman, referenceStep, referenceTooFlat } from "./test/reference/suitability";
import type { Point } from "./types";

const { numRuns, seed } = runs();
const fixture = JSON.parse(readFileSync(new URL("./test/reference/fixtures/suitability.json", import.meta.url), "utf8"));
const month = (i: number) => textOf(monthsLater(dayOf("2024-01-01"), i));
const at = (vs: number[], positions = vs.map((_, i) => i)): Point[] => vs.map((value, i) => ({ period: month(positions[i]), value }));
const input = (vs: number[], over: Partial<SuitabilityInputs> = {}): SuitabilityInputs => ({ series: [{ name: "Visits", points: at(vs) }], span: "month", ...over });
/** Values that always differ from the one before and take many different values. */
const wavy = (n: number, base = 10) => Array.from({ length: n }, (_, i) => base + ((i * 7) % 11));
const kinds = (v: Verdict) => ({ refusals: v.refusals.map((f) => f.case), cautions: v.cautions.map((f) => f.case), switches: v.switches.map((f) => f.case) });
const timesExact = (a: Exact, b: Exact) => fraction(a.num * b.num, a.den * b.den);
const exacts = (vs: number[]) => vs.map((v) => exactOf(v));
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
const nearestTo = (x: number, e: Exact) => expect(Math.abs(x - Number(e.num) / Number(e.den)) <= 1e-12 * Math.max(1, Math.abs(x)), `${x} vs ${e.num}/${e.den}`).toBe(true);
const ALL: MethodId[] = ["correlation", "drivers", "lag", "fit", "predict", "needs", "whatIf", "forecast", "trend", "seasonal", "changePoint", "afterDate", "usualRange"];

describe("the fixtures", () => {
  it("were made by the current script (suitability.py), and name the tools", () => {
    const script = readFileSync(new URL("./test/reference/fixtures/suitability.py", import.meta.url));
    expect(fixture.script, "run python3 packages/core/src/test/reference/fixtures/suitability.py again").toBe(createHash("sha256").update(script).digest("hex"));
    expect(fixture.version).toBe(1);
    expect(Object.keys(fixture.tools)).toEqual(["numpy", "scipy"]);
  });
});

describe("the minimums", () => {
  it("are the spec's: fit 8 + 4 per driver, seasonal two seasons, lag 12, before a date 6", () => {
    expect(minimumPeriods("fit", { drivers: 1 })).toBe(12);
    expect(minimumPeriods("fit", { drivers: 6 })).toBe(32);
    expect(minimumPeriods("fit")).toBe(12);
    expect(minimumPeriods("whatIf", { drivers: 2 })).toBe(16);
    expect(minimumPeriods("predict", { drivers: 3 })).toBe(20);
    expect(minimumPeriods("needs", { drivers: 4 })).toBe(24);
    expect(minimumPeriods("seasonal", { seasonLength: 12 })).toBe(24);
    expect(minimumPeriods("seasonal", { span: "quarter" })).toBe(8);
    expect(minimumPeriods("seasonal")).toBe(24);
    expect(minimumPeriods("lag")).toBe(12);
    expect(minimumPeriods("lag", { drivers: 3 })).toBe(12);
    expect(minimumPeriods("afterDate")).toBe(6);
    expect(minimumPeriods("correlation")).toBe(6);
    expect(minimumPeriods("drivers")).toBe(6);
    expect(minimumPeriods("forecast")).toBe(4);
    expect(minimumPeriods("trend")).toBe(4);
    expect(minimumPeriods("changePoint")).toBe(8);
    expect(minimumPeriods("usualRange")).toBe(8);
  });
  it("allow one driver per 6 periods and at most 6", () => {
    expect([0, 5, 6, 11, 12, 35, 36, 37, 600].map(driversAllowed)).toEqual([0, 0, 1, 1, 2, 5, 6, 6, 6]);
  });
  it("each method has a season, and every method runs the first three checks", () => {
    expect(SEASON_LENGTH).toEqual({ day: 7, week: 52, month: 12, quarter: 4, half: 2, year: 1 });
    for (const m of ALL) expect(checkSuitability(m, { series: [], span: "month" }).refusals[0].case).toBe("refuse-periods");
  });
});

describe("enough periods", () => {
  const cases: [MethodId, Partial<SuitabilityInputs>, number][] = [
    ["correlation", {}, 6], ["drivers", {}, 6], ["lag", {}, 12], ["fit", { drivers: 1 }, 12], ["fit", { drivers: 3 }, 20], ["predict", { drivers: 2 }, 16],
    ["forecast", {}, 4], ["trend", {}, 4], ["seasonal", {}, 24], ["changePoint", {}, 8], ["afterDate", {}, 6], ["usualRange", {}, 8],
  ];
  it.each(cases)("%s %j: one below the minimum refuses with how many it has and needs, the minimum does not", (method, over, need) => {
    const below = checkSuitability(method, input(wavy(need - 1), over));
    expect(below.refusals).toEqual([{ case: "refuse-periods", slots: { have: need - 1, need, span: "month" } }]);
    expect(below.cautions).toEqual([]);
    expect(kinds(checkSuitability(method, input(wavy(need), over))).refusals).toEqual([]);
  });
  it("counts the periods the Method says it uses, not the length of the series", () => {
    expect(checkSuitability("afterDate", input(wavy(30), { periods: 5 })).refusals[0].slots).toEqual({ have: 5, need: 6, span: "month" });
    expect(checkSuitability("afterDate", input(wavy(5), { periods: 6 })).refusals).toEqual([]);
  });
  it("counts the shortest series, and a value given twice, or that is not a number, once or not at all", () => {
    const two = { series: [{ name: "A", points: at(wavy(8)) }, { name: "B", points: at(wavy(5)) }], span: "month" as const };
    expect(checkSuitability("correlation", two).refusals[0].slots.have).toBe(5);
    const noisy = at(wavy(6));
    expect(checkSuitability("correlation", { series: [{ name: "A", points: [...noisy, ...noisy, { period: month(9), value: NaN }, { period: month(10), value: Infinity }] }], span: "month" }).refusals).toEqual([]);
    expect(checkSuitability("correlation", input([...wavy(5), NaN])).refusals[0].slots.have).toBe(5);
  });
});

describe("enough that vary", () => {
  it("refuses fewer than 4 different values, and accepts 4", () => {
    expect(kinds(checkSuitability("forecast", input([1, 2, 3, 1, 2, 3, 1, 2]))).refusals).toEqual(["refuse-vary"]);
    expect(kinds(checkSuitability("forecast", input([1, 2, 3, 4, 1, 2, 3, 4]))).refusals).toEqual([]);
    expect(checkSuitability("forecast", input([5, 5, 5, 5, 5, 5])).refusals[0]).toEqual({ case: "refuse-vary", slots: { name: "Visits" } });
  });
  it("refuses fewer than half of the steps changing, and accepts exactly half", () => {
    // Nine values, eight steps: three changes refuse, four are exactly half.
    expect(kinds(checkSuitability("forecast", input([1, 2, 3, 4, 4, 4, 4, 4, 4]))).refusals).toEqual(["refuse-vary"]);
    expect(kinds(checkSuitability("forecast", input([1, 2, 3, 4, 5, 5, 5, 5, 5]))).refusals).toEqual([]);
  });
  it("names each series that does not vary", () => {
    const v = checkSuitability("correlation", { series: [{ name: "A", points: at(wavy(8)) }, { name: "B", points: at([3, 3, 3, 3, 3, 3, 3, 3]) }, { name: "C", points: at([1, 1, 1, 1, 1, 1, 1, 1]) }], span: "month" });
    expect(v.refusals.map((f) => f.slots.name)).toEqual(["B", "C"]);
  });
  it(`agrees with the reference on generated series (${numRuns * 5} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 6, maxLength: 20 }), (vs) => {
        const refused = kinds(checkSuitability("forecast", input(vs))).refusals.includes("refuse-vary");
        expect(refused).toBe(referenceTooFlat(vs));
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
});

describe("gaps", () => {
  const gapped = (size: number, missing: number[], over: Partial<SuitabilityInputs> = {}) => {
    const present = Array.from({ length: size }, (_, i) => i).filter((i) => !missing.includes(i));
    return checkSuitability("forecast", { series: [{ name: "Visits", points: at(present.map((i) => 10 + ((i * 7) % 11)), present) }], span: "month", ...over });
  };
  it("is a caution up to 20 % of the window, saying how many were left out, and a refusal above it", () => {
    expect(gapped(10, [3, 6]).cautions).toEqual([{ case: "caution-gaps", slots: { name: "Visits", missing: 2, total: 10, span: "month" } }]);
    expect(kinds(gapped(10, [3, 6])).refusals).toEqual([]);
    expect(gapped(10, [2, 5, 8]).refusals).toEqual([{ case: "refuse-gaps", slots: { name: "Visits", missing: 3, total: 10, span: "month" } }]);
  });
  it("refuses a gap of 3 in a row, and accepts 2", () => {
    expect(kinds(gapped(24, [5, 6])).refusals).toEqual([]);
    expect(kinds(gapped(24, [5, 6])).cautions).toEqual(["caution-gaps"]);
    expect(gapped(24, [5, 6, 7]).refusals).toEqual([{ case: "refuse-gap-run", slots: { name: "Visits", missing: 3, total: 24, span: "month", run: 3 } }]);
  });
  it("counts the window's own ends: a window that starts or ends before the values", () => {
    const window = { from: month(0), to: month(23) };
    const values = (from: number, to: number) => ({ series: [{ name: "Visits", points: at(wavy(to - from + 1), Array.from({ length: to - from + 1 }, (_, i) => from + i)) }] });
    expect(kinds(checkSuitability("forecast", { ...values(2, 23), span: "month", window })).cautions).toEqual(["caution-gaps"]);
    expect(kinds(checkSuitability("forecast", { ...values(3, 23), span: "month", window })).refusals).toEqual(["refuse-gap-run"]);
    expect(kinds(checkSuitability("forecast", { ...values(0, 20), span: "month", window })).refusals).toEqual(["refuse-gap-run"]);
    expect(kinds(checkSuitability("forecast", { ...values(0, 21), span: "month", window })).cautions).toEqual(["caution-gaps"]);
    // Values outside the window are not in it.
    expect(kinds(checkSuitability("forecast", { ...values(0, 30), span: "month", window: { from: month(2), to: month(20) } }))).toEqual({ refusals: [], cautions: [], switches: [] });
  });
  it("counts only the values inside the window, and leaves out those before and after it", () => {
    // Ten values, five before the window and five after, and none inside it: every period of the window is missing.
    const outside = [0, 1, 2, 3, 4, 20, 21, 22, 23, 24];
    const v = checkSuitability("forecast", { series: [{ name: "A", points: at(wavy(10), outside) }], span: "month", window: { from: month(5), to: month(14) } });
    expect(v.refusals).toEqual([{ case: "refuse-gaps", slots: { name: "A", missing: 10, total: 10, span: "month" } }]);
  });
  it("names the series with the same gaps once, and each series with other gaps on its own", () => {
    const pts = (missing: number[]) => {
      const present = Array.from({ length: 24 }, (_, i) => i).filter((i) => !missing.includes(i));
      return at(present.map((i) => 10 + ((i * 7) % 11)), present);
    };
    const gaps = (a: number[], b: number[]) => checkSuitability("correlation", { series: [{ name: "A", points: pts(a) }, { name: "B", points: pts(b) }], span: "month" });
    expect(gaps([5, 9], [5, 9]).cautions).toEqual([{ case: "caution-gaps", slots: { name: "A and B", missing: 2, total: 24, span: "month" } }]);
    // One missing against two missing: not the same finding.
    // The same missing periods in a window of another size: not the same finding.
    const longer = checkSuitability("correlation", { series: [{ name: "A", points: pts([5, 9]) }, { name: "B", points: at(Array.from({ length: 27 }, (_, i) => 10 + ((i * 7) % 11)).filter((_, i) => i !== 5 && i !== 9), Array.from({ length: 27 }, (_, i) => i).filter((i) => i !== 5 && i !== 9)) }], span: "month" });
    expect(longer.cautions.filter((f) => f.case === "caution-gaps").map((f) => [f.slots.name, f.slots.total])).toEqual([["A", 24], ["B", 27]]);
    expect(gaps([5], [5, 9]).cautions.filter((f) => f.case === "caution-gaps").map((f) => f.slots.name)).toEqual(["A", "B"]);
    // The same count but a longer run: the runs differ, so they are not the same finding.
    const runs = gaps([2, 3, 4, 10], [2, 3, 4, 5]);
    expect(runs.refusals.map((f) => [f.case, f.slots.name, f.slots.run])).toEqual([["refuse-gap-run", "A", 3], ["refuse-gap-run", "B", 4]]);
    // A caution and a refusal are different cases, whatever the count.
    expect(gaps([5, 9, 12, 15, 20], [5, 9, 12, 15, 20]).refusals.map((f) => f.slots.name)).toEqual(["A and B"]);
  });
  it("copes with a series that has no values although the Method says it has periods: it refuses to vary, and has no window", () => {
    const v = checkSuitability("forecast", { series: [{ name: "A", points: [] }], span: "month", periods: 8 });
    expect(v.refusals).toEqual([{ case: "refuse-vary", slots: { name: "A" } }]);
  });
  it("has no window to look at for no values, and nothing for a window that ends before it starts", () => {
    expect(checkSuitability("forecast", { series: [{ name: "A", points: [] }], span: "month" }).refusals[0].case).toBe("refuse-periods");
    expect(kinds(checkSuitability("forecast", { ...input(wavy(8)), window: { from: month(9), to: month(3) } }))).toEqual({ refusals: [], cautions: [], switches: [] });
  });
  it(`agrees with the reference's count of missing periods and longest run (${numRuns * 5} windows, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 8, max: 30 }).chain((size) => fc.tuple(fc.constant(size), fc.uniqueArray(fc.integer({ min: 0, max: size - 1 }), { minLength: 6, maxLength: size }))), ([size, present]) => {
        const sorted = [...present].sort((a, b) => a - b);
        const v = checkSuitability("forecast", { series: [{ name: "A", points: at(sorted.map((i) => 10 + ((i * 7) % 11)), sorted) }], span: "month", window: { from: month(0), to: month(size - 1) } });
        const got = kinds(v);
        const { missing, run } = referenceGaps(present, size);
        if (got.refusals.includes("refuse-vary")) return;
        expect(got.refusals.some((c) => c === "refuse-gaps" || c === "refuse-gap-run")).toBe(missing * 5 > size || run >= 3);
        expect(got.cautions.includes("caution-gaps")).toBe(missing > 0 && missing * 5 <= size && run < 3);
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
});

describe("mixed units or periods", () => {
  const m = (over: Partial<ReturnType<typeof metric>>) => metric({ ...over });
  const run = (metrics: ReturnType<typeof metric>[], method: MethodId = "whatIf") => checkSuitability(method, input(wavy(20), { metrics, drivers: 1 }));
  it("refuses a Metric with Aggregation none next to another period, naming both", () => {
    const v = run([m({ name: "Orders", slug: "orders", aggregation: "none", period: "week" }), m({ name: "Revenue", slug: "revenue" })]);
    expect(v.refusals).toEqual([{ case: "refuse-mixed-none", slots: { name: "Orders", other: "Revenue" } }]);
  });
  it("accepts Aggregation none beside the same period, and any aggregation beside another period", () => {
    expect(run([m({ name: "A", slug: "a", aggregation: "none" }), m({ name: "B", slug: "b" })]).refusals).toEqual([]);
    expect(run([m({ name: "A", slug: "a", aggregation: "sum", period: "week" }), m({ name: "B", slug: "b" })]).refusals).toEqual([]);
  });
  it("refuses a Derived Metric built from another input, naming the derived one first, either way round", () => {
    const derived = m({ name: "Margin", slug: "margin", formula: "{revenue} - {cost}" });
    const source = m({ name: "Revenue", slug: "revenue" });
    const want = [{ case: "refuse-built-from", slots: { name: "Margin", other: "Revenue" } }];
    expect(run([derived, source]).refusals).toEqual(want);
    expect(run([source, derived]).refusals).toEqual(want);
    expect(run([source, m({ name: "Cost", slug: "cost" })]).refusals).toEqual([]);
  });
  it("names the one that is built from the other, also when the first has a formula of its own", () => {
    const first = m({ name: "Profit", slug: "profit", formula: "{revenue} - {cost}" });
    const second = m({ name: "Ratio", slug: "ratio", formula: "{profit} / {revenue}" });
    expect(run([first, second]).refusals).toEqual([{ case: "refuse-built-from", slots: { name: "Ratio", other: "Profit" } }]);
  });
  it("is not asked of a Method that does not combine Metrics", () => {
    expect(kinds(run([m({ name: "A", slug: "a", aggregation: "none", period: "week" }), m({ name: "B", slug: "b" })], "forecast")).refusals).toEqual([]);
  });
});

describe("far-off values", () => {
  // Ten values around 10 and one more: the median is 10 and the median absolute deviation 1, so the limit is 4 either side.
  const around = [10, 11, 9, 10, 12, 8, 10, 11, 9, 10];
  const withOne = (x: number) => [...around, x];
  const run = (vs: number[], rerun: SuitabilityInputs["rerun"], over: Partial<SuitabilityInputs> = {}) => checkSuitability("forecast", input(vs, { rerun, ...over }));
  const dropsLast = (n: number) => (left: ReadonlySet<string>) => ({ value: left.size >= n ? 0 : 10, range: 1 });
  it("sits at 4 median absolute deviations: 4 is not far off, a hair more is", () => {
    for (const x of [14, 6]) expect(kinds(run(withOne(x), dropsLast(1))).cautions, String(x)).toEqual([]);
    for (const x of [14.01, 5.99, 40, -3]) expect(kinds(run(withOne(x), dropsLast(1))).cautions, String(x)).toEqual(["caution-far-off"]);
  });
  it("needs the result to move by more than a fifth of its range: exactly a fifth does not, a hair more does", () => {
    const moved = (by: number) => run(withOne(40), (left) => ({ value: left.size > 0 ? 10 + by : 10, range: 10 }));
    expect(kinds(moved(2)).cautions).toEqual([]);
    expect(kinds(moved(2.0001)).cautions).toEqual(["caution-far-off"]);
    expect(kinds(moved(-2.0001)).cautions).toEqual(["caution-far-off"]);
  });
  it("is also a caution when the sign flips, however small the move, and says what it reads without them", () => {
    const flip = run(withOne(40), (left) => ({ value: left.size > 0 ? -0.001 : 0.001, range: 1000 }));
    expect(flip.cautions).toEqual([{ case: "caution-far-off", slots: { count: 1, without: -0.001, span: "month" } }]);
    expect(run(withOne(40), (left) => ({ value: left.size > 0 ? 0.002 : 0.001, range: 1000 })).cautions).toEqual([]);
  });
  it("uses the scale of a Method without a range, and says nothing when there is none", () => {
    const by = (d: number) => (left: ReadonlySet<string>) => ({ value: left.size > 0 ? 1 + d : 1 });
    expect(kinds(run(withOne(40), by(0.5), { scale: 1 })).cautions).toEqual(["caution-far-off"]);
    expect(kinds(run(withOne(40), by(0.2), { scale: 1 })).cautions).toEqual([]);
    expect(kinds(run(withOne(40), by(50))).cautions).toEqual([]);
    expect(kinds(run(withOne(40), by(50), { scale: 0 })).cautions).toEqual([]);
  });
  it("leaves out the 1 to 3 most extreme in turn, the most extreme first, and reports how many it took", () => {
    const vs = [...around, 40, 30, 25];
    const needs = (n: number) => (left: ReadonlySet<string>) => ({ value: left.size >= n ? 0 : 10, range: 1 });
    for (const n of [1, 2, 3]) expect(run(vs, needs(n)).cautions[0].slots.count, `needs ${n}`).toBe(n);
    // The most extreme goes first: leaving out the 40 alone is what moves this result.
    // The most extreme goes first even when it is the latest: 40 here is the last period.
    const last = [...around, 25, 30, 40];
    const only40 = (left: ReadonlySet<string>) => ({ value: left.has(month(12)) ? 0 : 10, range: 1 });
    expect(run(last, only40).cautions[0].slots.count).toBe(1);
    const order: string[][] = [];
    run(last, (left) => (order.push([...left]), { value: 10, range: 1 }));
    expect(order).toEqual([[], [month(12)], [month(12), month(11)], [month(12), month(11), month(10)]]);
    // Not more than three are ever left out.
    expect(kinds(run([...around, 40, 30, 25, 22], needs(4))).cautions).not.toContain("caution-far-off");
  });
  it("breaks a tie in distance by the earlier period, and skips a rerun that cannot say", () => {
    const vs = [...around, 40, 40];
    const seen: string[][] = [];
    run(vs, (left) => (seen.push([...left]), { value: 10, range: 1 }));
    expect(seen[1]).toEqual([month(10)]);
    expect(run(withOne(40), (left) => (left.size > 0 ? null : { value: 10, range: 1 })).cautions).toEqual([]);
    expect(run(withOne(40), () => null).cautions).toEqual([]);
  });
  it("does not judge a series whose median absolute deviation is 0, or without a rerun", () => {
    expect(kinds(run([5, 5, 5, 5, 5, 6, 7, 8, 5, 900], dropsLast(1))).cautions).toEqual([]);
    expect(kinds(checkSuitability("forecast", input(withOne(40)))).cautions).toEqual([]);
  });
  it("ranks the periods that are equally far by the earlier first, whichever series found them first", () => {
    // Series A is far off at month 12 and series B at month 10, by the same distance: month 10 goes first.
    const mk = (at_: number) => [...around, 0, 0, 0].map((v, i) => (i === at_ ? 40 : i >= 10 ? 10 + (i % 3) : v));
    const seen: string[][] = [];
    checkSuitability("correlation", { series: [{ name: "A", points: at(mk(12)) }, { name: "B", points: at(mk(10)) }], span: "month", rerun: (left) => (seen.push([...left]), { value: 10, range: 1 }) });
    expect(seen.slice(0, 3)).toEqual([[], [month(10)], [month(10), month(12)]]);
  });
  it("ranks a period by its largest distance over the series", () => {
    // Month 10 is a little far off in A and very far in B; month 12 is far off in A only, farther than month 10 is there.
    const a = [...around, 30, 10, 60];
    const b = [...around, 100, 10, 10].map((v, i) => (i === 12 ? 9 : v));
    const seen: string[][] = [];
    checkSuitability("correlation", { series: [{ name: "A", points: at(a) }, { name: "B", points: at(b) }], span: "month", rerun: (left) => (seen.push([...left]), { value: 10, range: 1 }) });
    expect(seen[1]).toEqual([month(10)]);
    expect(seen[2]).toEqual([month(10), month(12)]);
    // The same with the series the other way round: the larger distance is kept, not the later one.
    const swapped: string[][] = [];
    checkSuitability("correlation", { series: [{ name: "B", points: at(b) }, { name: "A", points: at(a) }], span: "month", rerun: (left) => (swapped.push([...left]), { value: 10, range: 1 }) });
    expect(swapped[1]).toEqual([month(10)]);
    expect(swapped[2]).toEqual([month(10), month(12)]);
  });
  it("is no flip when the result without them is 0 or the result itself is 0", () => {
    const flips = (base: number, alt: number) => run(withOne(40), (left) => ({ value: left.size > 0 ? alt : base, range: 1e6 })).cautions.length;
    expect(flips(5, -1)).toBe(1);
    expect(flips(-5, 1)).toBe(1);
    expect(flips(5, 0)).toBe(0);
    expect(flips(0, -1)).toBe(0);
    expect(flips(0, 0)).toBe(0);
  });
  it("takes the farthest of a period across series", () => {
    const [a, b] = [withOne(40), [...around, 100].map((v, i) => (i === 10 ? v : v + (i % 2)))];
    const v = checkSuitability("correlation", { series: [{ name: "A", points: at(a) }, { name: "B", points: at(b) }], span: "month", rerun: dropsLast(1) });
    expect(v.cautions.map((f) => f.case)).toContain("caution-far-off");
  });
  it(`finds exactly the values the reference finds (${numRuns * 5} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -30, max: 30 }), { minLength: 8, maxLength: 20 }), (vs) => {
        const far = referenceFarOff(exacts(vs));
        const seen = new Set<string>();
        checkSuitability("changePoint", input(vs, { rerun: (left) => (left.forEach((p) => seen.add(p)), { value: 0, range: 1 }) }));
        // It asks about the most extreme periods, at most 3 of the ones the reference calls far off, and none when it calls none.
        for (const p of seen) expect(far).toContain(Number(p.slice(5, 7)) - 1 + 12 * (Number(p.slice(0, 4)) - 2024));
        expect(seen.size).toBe(Math.min(3, far.length));
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
});

describe("skewness and ties", () => {
  it("is the moment coefficient SciPy gives, and its median and deviation too", () => {
    for (const [name, c] of Object.entries(fixture.skew) as [string, { values: number[]; skew: number | null; median: number; mad: number }][]) {
      const e = exacts(c.values);
      const s = skewness(c.values.map(fractionOf));
      if (c.skew === null) expect(s, name).toBeNull();
      else expect(rel(s!.value, c.skew), name).toBeLessThan(1e-9);
      nearestTo(c.median, referenceMedian(e));
      nearestTo(c.mad, referenceMad(e));
    }
  });
  it("decides above 2 exactly as the reference does, on the same list nudged one outlier at a time", () => {
    let flipped = 0;
    let before: boolean | null = null;
    for (let v = 1; v <= 60; v++) {
      const vs = [...Array.from({ length: 10 }, () => 0), v];
      const ref = referenceSkewSquared(exacts(vs))!;
      const above = compareExact(ref.squared, fraction(4n, 1n)) > 0;
      expect(skewness(vs.map(fractionOf))!.above(2), String(v)).toBe(above);
      if (before !== null && before !== above) flipped++;
      before = above;
    }
    // Ten zeros and one outlier have skewness (n − 2) ÷ √(n − 1) = 9 ÷ √10 ≈ 2.85 for every v: above, always.
    expect(flipped).toBe(0);
    // One outlier among 7: (n − 2) ÷ √(n − 1) = 5 ÷ √6 ≈ 2.04, above; two among 8 is 1.15, not.
    expect(skewness([0, 0, 0, 0, 0, 0, 1].map(fractionOf))!.above(2)).toBe(true);
    expect(skewness([0, 0, 0, 0, 0, 1, 0, 1].map(fractionOf))!.above(2)).toBe(false);
    // A pair of lists either side of 2: skewness 1.8 and 2.1 on 4, 5 or more equal values and one more.
    const g = (vs: number[]) => skewness(vs.map(fractionOf))!;
    expect(g([0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 1, 2]).above(2)).toBe(compareExact(referenceSkewSquared(exacts([0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 1, 2]))!.squared, fraction(4n, 1n)) > 0);
    expect(g([1, 2, 3, 4, 5, 6, 7]).above(2)).toBe(false);
    expect(g([1, 2, 3, 4, 5, 6, 7]).value).toBe(0);
    expect(g([-60, -5, -4, -3, -3, -2, -2, -2, -1, -1]).value).toBeLessThan(-2);
    expect(g([1, 1, 2, 2, 2, 3, 3, 4, 5, 60]).value).toBeGreaterThan(2);
    // Skewness exactly 1 on these (m3² = m2³): not above 1, above anything below it, and the same when scaled and shifted.
    for (const list of [[0, 0, 1, 1, 1, 3], [0, 0, 2, 2, 2, 6], [1, 1, 3, 3, 3, 7]]) {
      expect(skewness(list.map(fractionOf))!.above(1), String(list)).toBe(false);
      expect(skewness(list.map(fractionOf))!.above(0.9999), String(list)).toBe(true);
      expect(skewness(list.map(fractionOf))!.value).toBe(1);
    }
    // The limit is read as the exact decimal it is written as: 0.5 is a half, not the nearest double.
    expect(g([0, 0, 0, 1]).above(0.5)).toBe(true);
    expect(g([0, 1, 2, 3, 4, 9]).above(1.5)).toBe(g([0, 1, 2, 3, 4, 9]).value > 1.5);
  });
  it(`has no skewness for values that do not vary, and agrees with the reference on generated lists (${numRuns * 5}, seed ${seed})`, () => {
    expect(skewness([1, 1, 1].map(fractionOf))).toBeNull();
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -20, max: 40 }), { minLength: 3, maxLength: 16 }), (vs) => {
        const ref = referenceSkewSquared(exacts(vs));
        const s = skewness(vs.map(fractionOf));
        if (!ref) expect(s).toBeNull();
        else {
          expect(s!.above(2)).toBe(compareExact(ref.squared, fraction(4n, 1n)) > 0);
          expect(s!.value < 0 || s!.value === 0).toBe(ref.negative || s!.value === 0);
          expect(rel(s!.value ** 2, Number(ref.squared.num) / Number(ref.squared.den))).toBeLessThan(1e-9);
        }
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  const skewed = [1, 1, 2, 2, 2, 3, 3, 4, 5, 60];
  it("is a caution for a fit, and a switch to ranks only for a correlation that can use them", () => {
    expect(kinds(checkSuitability("fit", input([...skewed, ...wavy(4, 1)].map((v, i) => v + i / 7), { drivers: 1 }))).cautions).toContain("caution-skew");
    const corr = (over: Partial<SuitabilityInputs>) => checkSuitability("correlation", input(skewed.map((v, i) => v + i / 9), over));
    expect(kinds(corr({})).cautions).toEqual(["caution-skew"]);
    expect(kinds(corr({ canSwitchTo: ["rank-correlation"] }))).toEqual({ refusals: [], cautions: [], switches: ["switch-rank"] });
    expect(corr({ canSwitchTo: ["rank-correlation"] }).switches[0]).toEqual({ case: "switch-rank", slots: { name: "Visits" }, to: "rank-correlation" });
    // A Method that is not Pearson's keeps a caution even where ranks exist.
    expect(kinds(checkSuitability("fit", input(skewed.map((v, i) => v + i / 9).concat(wavy(4)), { drivers: 1, canSwitchTo: ["rank-correlation"] }))).switches).toEqual([]);
  });
  it("switches to ranks for every Pearson Method that can, says nothing for clean values, and names the series in a caution", () => {
    const skewedLong = [...skewed, ...skewed].map((v, i) => v + i / 9);
    for (const method of ["correlation", "drivers", "lag"] as const) {
      expect(kinds(checkSuitability(method, input(skewedLong, { canSwitchTo: ["rank-correlation"] }))).switches, method).toEqual(["switch-rank"]);
      expect(kinds(checkSuitability(method, input(wavy(14), { canSwitchTo: ["rank-correlation"] }))), method).toEqual({ refusals: [], cautions: [], switches: [] });
    }
    // Where ranks are not offered the finding is a caution naming the series, for skewed values and for ties.
    expect(checkSuitability("correlation", input(skewedLong)).cautions).toEqual([{ case: "caution-skew", slots: { name: "Visits" } }]);
    expect(checkSuitability("correlation", input([1, 2, 2, 3, 3, 4, 4, 5, 5, 1, 2, 1])).cautions).toEqual([{ case: "caution-ties", slots: { name: "Visits" } }]);
  });
  it("calls values that mostly repeat ties: more than half repeats is, exactly half is not", () => {
    // Twelve values with 6 different ones (half repeat: not mostly), and with 5 different (more than half repeat).
    expect(kinds(checkSuitability("correlation", input([1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 1]))).cautions).toEqual([]);
    expect(kinds(checkSuitability("correlation", input([1, 2, 2, 3, 3, 4, 4, 5, 5, 1, 2, 1]))).cautions).toEqual(["caution-ties"]);
    expect(kinds(checkSuitability("correlation", input([1, 2, 2, 3, 3, 4, 4, 5, 5, 1, 2, 1], { canSwitchTo: ["rank-correlation"] }))).switches).toEqual(["switch-rank"]);
  });
});

describe("not a straight line", () => {
  it("counts runs of signs exactly: the tail equals the reference's listing of every arrangement and SciPy-side counting", () => {
    for (let n1 = 1; n1 <= 6; n1++) for (let n2 = 1; n2 <= 6; n2++) for (let r = 2; r <= n1 + n2; r++) expect(runsTail(n1, n2, r), `${n1} ${n2} ${r}`).toEqual(referenceRunsTail(n1, n2, r));
    for (const c of fixture.runs as { n1: number; n2: number; runs: number; atMost: number; all: number }[]) expect(runsTail(c.n1, c.n2, c.runs), JSON.stringify(c)).toEqual({ atMost: BigInt(c.atMost), all: BigInt(c.all) });
    expect(runsTail(3, 3, 1)).toEqual({ atMost: 0n, all: 20n });
  });
  const misses = (signs: boolean[]) => signs.map((s, i) => ({ level: i, miss: s ? 1 + i / 100 : -1 - i / 100 }));
  const curved = [...Array.from({ length: 6 }, () => true), ...Array.from({ length: 6 }, () => false), ...Array.from({ length: 6 }, () => true)];
  const alternating = Array.from({ length: 18 }, (_, i) => i % 2 === 0);
  it("is a caution for a curve (misses that keep one sign for long stretches) and silent for misses that change sign often", () => {
    expect(checkSuitability("fit", input(wavy(20), { drivers: 1, misses: misses(curved) })).cautions.map((f) => f.case)).toContain("caution-curved");
    expect(kinds(checkSuitability("fit", input(wavy(20), { drivers: 1, misses: misses(alternating) }))).cautions).not.toContain("caution-curved");
  });
  it("is decided at 5 %: the reference's exact chance of this few runs is at most 1/20", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 4, maxLength: 12 }), (signs) => {
        const [n1, n2] = [signs.filter(Boolean).length, signs.filter((s) => !s).length];
        const got = kinds(checkSuitability("fit", input(wavy(20), { drivers: 1, misses: misses(signs) }))).cautions.includes("caution-curved");
        if (n1 === 0 || n2 === 0) expect(got).toBe(false);
        else expect(got).toBe(referenceRunsTail(n1, n2, referenceRuns(signs)).atMost * 20n <= referenceRunsTail(n1, n2, referenceRuns(signs)).all);
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  it(`gives the same verdict for the misses in any order: they are ordered by level first (${numRuns * 3} lists, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 6, maxLength: 16 }), fc.integer({ min: 1, max: 15 }), (signs, turn) => {
        const items = signs.map((s, i) => ({ level: i, miss: s ? 1 : -1 }));
        const rotated = [...items.slice(turn % items.length), ...items.slice(0, turn % items.length)];
        const verdict = (misses_: typeof items) => checkSuitability("fit", input(wavy(20), { drivers: 1, misses: misses_ })).cautions.map((f) => f.case);
        expect(verdict(rotated)).toEqual(verdict(items));
      }),
      { numRuns: numRuns * 3, seed },
    );
  });
  it("counts the runs from either end: one plus sign at the end of the minus signs is 2 runs, as at the start", () => {
    const atEnd = [...Array.from({ length: 39 }, (_, i) => ({ level: i, miss: -1 })), { level: 39, miss: 1 }];
    expect(checkSuitability("fit", input(wavy(20), { drivers: 1, misses: atEnd })).cautions.map((f) => f.case)).toEqual(["caution-curved"]);
    // The plus sign in the middle is 3 runs, which every arrangement of one plus sign has at most: no caution.
    const inMiddle = Array.from({ length: 40 }, (_, i) => ({ level: i, miss: i === 20 ? 1 : -1 }));
    expect(checkSuitability("fit", input(wavy(20), { drivers: 1, misses: inMiddle })).cautions).toEqual([]);
  });
  it("is decided at exactly 1/20 as 'at most': 2 of 40 arrangements has the one plus sign at either end", () => {
    // One plus sign and 39 minus signs, the plus at the start: 2 runs, and of the 40 places for the plus sign 2 give so few.
    const oneAndMany = (many: number) => [{ level: 0, miss: 1 }, ...Array.from({ length: many }, (_, i) => ({ level: i + 1, miss: -1 }))];
    const caution = (many: number) => checkSuitability("fit", input(wavy(20), { drivers: 1, misses: oneAndMany(many) })).cautions.map((f) => f.case);
    expect(runsTail(1, 39, 2)).toEqual({ atMost: 2n, all: 40n });
    expect(caution(39)).toEqual(["caution-curved"]);
    // 2 of 39 is above 1/20, and 2 of 41 is below it.
    expect(caution(38)).toEqual([]);
    expect(caution(40)).toEqual(["caution-curved"]);
  });
  it("leaves out zeros and misses that are not numbers, wherever they sit", () => {
    const base = misses(curved);
    const caution = (misses_: { level: number; miss: number }[]) => checkSuitability("fit", input(wavy(20), { drivers: 1, misses: misses_ })).cautions.map((f) => f.case).filter((c) => c === "caution-curved");
    // Items that would break the runs if they counted: one between every two misses.
    const between = (miss: number) => base.map((m) => ({ level: m.level + 0.5, miss }));
    expect(caution([...base, ...between(0)])).toEqual(["caution-curved"]);
    expect(caution([...base, ...between(NaN)])).toEqual(["caution-curved"]);
    expect(caution([...base, ...base.map((m, i) => ({ level: Infinity, miss: i % 2 === 0 ? 1 : -1 }))])).toEqual(["caution-curved"]);
    expect(caution([...base, ...base.map((m, i) => ({ level: NaN, miss: i % 2 === 0 ? 1 : -1 }))])).toEqual(["caution-curved"]);
  });
  it("orders the misses by their level (ties by the order given), leaves out zeros and non-numbers, and needs both signs", () => {
    const shuffled = misses(curved).reverse();
    expect(checkSuitability("fit", input(wavy(20), { drivers: 1, misses: shuffled })).cautions.map((f) => f.case)).toContain("caution-curved");
    const withZeros = [...misses(curved), { level: 3.5, miss: 0 }, { level: NaN, miss: 1 }, { level: 2, miss: Infinity }];
    expect(checkSuitability("fit", input(wavy(20), { drivers: 1, misses: withZeros })).cautions.map((f) => f.case)).toContain("caution-curved");
    // The same level twice: the order given decides, and decides the same way twice.
    const ties = [{ level: 1, miss: 1 }, { level: 1, miss: -1 }, { level: 1, miss: 1 }, { level: 1, miss: -1 }, { level: 1, miss: 1 }, { level: 1, miss: -1 }];
    expect(kinds(checkSuitability("fit", input(wavy(20), { drivers: 1, misses: ties })))).toEqual(kinds(checkSuitability("fit", input(wavy(20), { drivers: 1, misses: ties }))));
    // Only one sign, or none: nothing to say.
    for (const m of [[{ level: 1, miss: 1 }, { level: 2, miss: 1 }], [{ level: 1, miss: 0 }, { level: 2, miss: 0 }], [{ level: 1, miss: -1 }, { level: 2, miss: -1 }], []]) {
      expect(checkSuitability("fit", input(wavy(20), { drivers: 1, misses: m })).cautions).toEqual([]);
    }
    // The same level kept in the order given: three plus then three minus is 2 runs, whatever the other order would be.
    const sameLevel = [1, 1, 1, -1, -1, -1].map((miss) => ({ level: 7, miss }));
    expect(checkSuitability("fit", input(wavy(20), { drivers: 1, misses: sameLevel })).cautions.map((f) => f.case)).toEqual([]);
    expect(runsTail(3, 3, 2)).toEqual({ atMost: 2n, all: 20n });
  });
});

describe("a changing relationship", () => {
  /** n pairs: x runs 0, 1, 2 …; the first half of y follows the first function, the rest the second. */
  const pairs = (n: number, first: (i: number) => number, second: (i: number) => number) => ({
    series: [{ name: "Visits", points: at(Array.from({ length: n }, (_, i) => i)) }, { name: "Revenue", points: at(Array.from({ length: n }, (_, i) => (i < n >> 1 ? first(i) : second(i)))) }],
    span: "month" as const,
  });
  const follows = (i: number) => i + (i % 3) / 10;
  const run = (i: SuitabilityInputs) => kinds(checkSuitability("correlation", i)).cautions.filter((c) => c.startsWith("caution-link"));
  it("is a caution when a link that was clear lost more than half of its size", () => {
    // The second half is symmetric about its middle, so it has no straight-line link to x.
    expect(run(pairs(24, follows, (i) => Math.abs(i - 17.5) + (i % 3) / 10))).toEqual(["caution-link-weaker"]);
  });
  it("is a caution when the link points the other way, and when it grew", () => {
    expect(run(pairs(24, follows, (i) => 40 - i + (i % 3) / 10))).toEqual(["caution-link-flipped"]);
    expect(run(pairs(24, (i) => Math.abs(i - 5.5) + (i % 3) / 10, follows))).toEqual(["caution-link-stronger"]);
  });
  it("says what the latest half reads, as a strength word", () => {
    const v = checkSuitability("correlation", pairs(24, follows, (i) => 40 - i + (i % 3) / 10));
    expect(v.cautions.find((f) => f.case === "caution-link-flipped")!.slots).toEqual({ latest: "strong" });
  });
  it("is silent for a link that holds, for series that are not paired, and for halves too short to judge", () => {
    expect(run(pairs(24, follows, follows))).toEqual([]);
    expect(kinds(checkSuitability("correlation", input(wavy(24)))).cautions.filter((c) => c.startsWith("caution-link"))).toEqual([]);
    const flip = (n: number) => pairs(n, follows, (i) => 40 - i + (i % 3) / 10);
    // Half of 12 pairs is 6, the least that can be judged; half of 11 is 5.
    expect(run(flip(12))).toEqual(["caution-link-flipped"]);
    expect(run(flip(11))).toEqual([]);
  });
  it("leaves out the middle pair of an odd number, so both halves are as long", () => {
    expect(run(pairs(13, follows, (i) => 40 - i + (i % 3) / 10))).toEqual(["caution-link-flipped"]);
  });
  it("decides a flip, a drop and a rise on the two r, at every threshold and one step either side", () => {
    const step = (x: number) => x + 1e-12;
    // Opposite signs flip only when both are at least 0.3 in size.
    expect(linkChange(0.3, -0.3)).toBe("flipped");
    expect(linkChange(-0.3, 0.3)).toBe("flipped");
    expect(linkChange(0.3, -step(0.3))).toBe("flipped");
    expect(linkChange(0.3, -(0.3 - 1e-12))).toBeNull();
    expect(linkChange(0.3 - 1e-12, -0.3)).toBeNull();
    expect(linkChange(0.9, -0.3)).toBe("flipped");
    // The same sign is no flip: a drop, or nothing.
    expect(linkChange(0.8, 0.3)).toBe("weaker");
    expect(linkChange(-0.8, -0.3)).toBe("weaker");
    // A drop is below half of a link at 0.4 or more: exactly half is not, a hair below is; 0.4 counts, a hair below does not.
    expect(linkChange(0.8, 0.4)).toBeNull();
    expect(linkChange(0.8, 0.4 - 1e-12)).toBe("weaker");
    expect(linkChange(0.4, 0.2 - 1e-12)).toBe("weaker");
    expect(linkChange(0.4, 0.2)).toBeNull();
    expect(linkChange(0.4 - 1e-12, 0.1)).toBeNull();
    // The reverse: a link that was weak and now is clear.
    expect(linkChange(0.3, 0.8)).toBe("stronger");
    expect(linkChange(0.1, 0.4)).toBe("stronger");
    expect(linkChange(0.2, 0.4)).toBeNull();
    expect(linkChange(0.2 - 1e-12, 0.4)).toBe("stronger");
    expect(linkChange(0.1, 0.4 - 1e-12)).toBeNull();
    expect(linkChange(0.5, 0.5)).toBeNull();
    expect(linkChange(0, 0)).toBeNull();
    expect(linkChange(0.9, 0.9)).toBeNull();
    // A half with no r says nothing.
    expect(linkChange(NaN, 0.8)).toBeNull();
    expect(linkChange(0.8, NaN)).toBeNull();
    expect(linkChange(NaN, NaN)).toBeNull();
  });
  it("takes the halves from the pairs that both series have: values of one series alone do not move them", () => {
    // Six more months of Visits that Revenue lacks: the pairs are the same 24, so the verdict is the same.
    const flip = pairs(24, follows, (i) => 40 - i + (i % 3) / 10);
    const extra = { ...flip, series: [{ ...flip.series[0], points: [...at(Array.from({ length: 6 }, () => 0).map((_, i) => 50 + i * 3), [-6, -5, -4, -3, -2, -1]), ...flip.series[0].points] }, flip.series[1]] };
    expect(run(extra)).toEqual(["caution-link-flipped"]);
  });
  it("is not judged for a half that does not vary", () => {
    expect(run(pairs(24, follows, () => 5))).toEqual([]);
    expect(run(pairs(24, () => 5, follows))).toEqual([]);
  });
  it(`decides as the table says on r from the reference, on generated pairs (${numRuns * 3} pairs, seed ${seed})`, () => {
    const r = (xs: number[], ys: number[]) => {
      const p = referencePearson(exacts(xs), exacts(ys));
      return p ? (p.negative ? -1 : 1) * Math.sqrt(Number(p.r2.num) / Number(p.r2.den)) : NaN;
    };
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 30 }), fc.integer({ min: 0, max: 30 })), { minLength: 12, maxLength: 24 }), (pairs) => {
        const [xs, ys] = [pairs.map((p) => p[0]), pairs.map((p) => p[1])];
        const h = pairs.length >> 1;
        const [a, b] = [r(xs.slice(0, h), ys.slice(0, h)), r(xs.slice(pairs.length - h), ys.slice(pairs.length - h))];
        const c = SUITABILITY.changing;
        const want = Number.isNaN(a) || Number.isNaN(b) || h < c.half
          ? []
          : a * b < 0 && Math.abs(a) >= c.sign && Math.abs(b) >= c.sign ? ["caution-link-flipped"]
          : Math.abs(a) >= c.clear && Math.abs(b) < Math.abs(a) / 2 ? ["caution-link-weaker"]
          : Math.abs(b) >= c.clear && Math.abs(a) < Math.abs(b) / 2 ? ["caution-link-stronger"] : [];
        const got = run({ series: [{ name: "A", points: at(xs) }, { name: "B", points: at(ys) }], span: "month" });
        // Flat series refuse before the check is made.
        if (referenceTooFlat(xs) || referenceTooFlat(ys)) return;
        expect(got).toEqual(want);
      }),
      { numRuns: numRuns * 3, seed },
    );
  });
});

describe("level shifts", () => {
  it("fits the step on a straight line as NumPy does, split by split, and picks the split with the smallest misses", () => {
    for (const c of fixture.steps as { name: string; values: number[]; fits: { k: number; c: number; sse: number }[] }[]) {
      const found = levelShift(at(c.values), "month");
      const best = c.fits.reduce((a, b) => (b.sse < a.sse - 1e-9 ? b : a));
      expect(found!.index, c.name).toBe(best.k);
      expect(Math.abs(found!.step - best.c), c.name).toBeLessThan(1e-9 * Math.max(1, Math.abs(best.c)));
      if (best.sse > 1e-9) expect(rel(found!.misses, Math.sqrt(((c.values.length - 3) * best.c * best.c) / best.sse)), c.name).toBeLessThan(1e-9);
    }
  });
  it("finds the clear step, not the small one or none, and the perfect step as beyond any count of misses", () => {
    const by = Object.fromEntries((fixture.steps as { name: string; values: number[] }[]).map((c) => [c.name, levelShift(at(c.values), "month")!]));
    expect(by["clear-step"].big).toBe(true);
    expect(by["perfect-step"]).toMatchObject({ big: true, misses: Infinity, index: 6 });
    expect(by["late-step"].big).toBe(true);
    expect(by["no-step"].big).toBe(false);
    expect(by["small-step"].big).toBe(false);
    expect(by["clear-step"].period).toBe(month(by["clear-step"].index));
  });
  it("calls a step of exactly 3 typical misses big, and the earlier of two splits that fit equally well the shift", () => {
    // n = 8: the step is 3 and the squared misses add to 5, so (n − 3) · c² = 45 = 9 · 5: exactly 3 typical misses.
    expect(levelShift(at([0, 0, 1, 0, 3, 2, 0, 0]), "month")).toEqual({ index: 4, period: month(4), step: 3, misses: 3, big: true });
    // A step a hair under it: not big.
    expect(levelShift(at([0, 0, 1, 0, 3, 2, 0, 0.01]), "month")!.big).toBe(false);
    // Splits at 4 and 5 fit this series equally well: the earlier is the shift.
    expect(levelShift(at([0, 0, 0, 0, 0, 0, 0, 1, 0]), "month")!.index).toBe(4);
  });
  it("uses the data after a shift when exactly the Method's minimum remains, and not with one fewer", () => {
    const withAfter = (after: number) => [...Array.from({ length: 20 - after }, (_, i) => 10 + (i % 2)), ...Array.from({ length: after }, (_, i) => 30 + (i % 2))];
    const run = (after: number) => kinds(checkSuitability("usualRange", input(withAfter(after), { canSwitchTo: ["data-after"] })));
    expect(run(8).switches).toEqual(["switch-after-shift"]);
    expect(run(7).cautions).toEqual(["caution-level-shift"]);
  });
  it("has nothing for fewer than 8 values, nor for a straight line (no step at the best split)", () => {
    expect(levelShift(at([1, 2, 3, 4, 5, 6, 7]), "month")).toBeNull();
    expect(levelShift(at([1, 2, 3, 4, 5, 6, 7, 8]), "month")).toBeNull();
    expect(levelShift([], "month")).toBeNull();
    expect(levelShift(at([5, 4, 3, 2, 1, 0, -1, -2, -3, -4]), "month")).toBeNull();
  });
  it(`is the reference's step and decision, exactly, on generated series (${numRuns} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -40, max: 40 }), { minLength: 8, maxLength: 16 }), (vs) => {
        const found = levelShift(at(vs), "month");
        const ys = exacts(vs);
        const xs = vs.map((_, i) => i);
        const fits = Array.from({ length: vs.length - 7 }, (_, i) => ({ k: 4 + i, f: referenceStep(xs, ys, 4 + i)! })).filter((f) => f.k <= vs.length - 4);
        const best = fits.reduce((a, b) => (compareExact(b.f.sse, a.f.sse) < 0 ? b : a));
        if (best.f.c.num === 0n) expect(found).toBeNull();
        else {
          expect(found!.index).toBe(best.k);
          nearestTo(found!.step, best.f.c);
          const lhs = timesExact(fraction(BigInt(vs.length - 3), 1n), timesExact(best.f.c, best.f.c));
          expect(found!.big).toBe(compareExact(lhs, timesExact(fraction(9n, 1n), best.f.sse)) >= 0);
        }
      }),
      { numRuns, seed },
    );
  });
  it("reads positions, so a missing period leaves a gap in the line, and is the same for a series given unsorted", () => {
    const pts = at([10, 11, 12, 13, 24, 25, 26, 27], [0, 1, 2, 3, 6, 7, 8, 9]);
    expect(levelShift([...pts].reverse(), "month")).toEqual(levelShift(pts, "month"));
    expect(levelShift(pts, "month")!.index).toBe(4);
  });
  const stepped = [...Array.from({ length: 10 }, (_, i) => 10 + (i % 2)), ...Array.from({ length: 10 }, (_, i) => 30 + (i % 2))];
  it("says the level of a series changed: a caution, or only the data after it where the Method can and enough remains", () => {
    const run = (method: MethodId, over: Partial<SuitabilityInputs> = {}) => checkSuitability(method, input(stepped, over));
    expect(run("forecast").cautions[0]).toEqual({ case: "caution-level-shift", slots: { name: "Visits", from: month(10), count: 10, span: "month" } });
    expect(run("forecast", { canSwitchTo: ["data-after"] }).switches[0]).toEqual({ case: "switch-after-shift", slots: { name: "Visits", from: month(10), count: 10, span: "month" }, to: "data-after" });
    // The Method's minimum is what must remain: 10 values after the shift are enough for 8, not for a fit with 3 drivers.
    expect(kinds(run("usualRange", { canSwitchTo: ["data-after"] })).switches).toEqual(["switch-after-shift"]);
    const late = [...Array.from({ length: 13 }, (_, i) => 10 + (i % 2)), ...Array.from({ length: 7 }, (_, i) => 30 + (i % 2))];
    expect(kinds(checkSuitability("usualRange", input(late, { canSwitchTo: ["data-after"] }))).cautions).toEqual(["caution-level-shift"]);
    expect(kinds(run("usualRange")).cautions).toEqual(["caution-level-shift"]);
  });
  it("is not asked of a straight line, or of a Method that does not look at the level", () => {
    expect(kinds(checkSuitability("forecast", input(wavy(20).map((v, i) => v + 2 * i)))).cautions).toEqual([]);
    expect(kinds(checkSuitability("correlation", input(stepped))).cautions).not.toContain("caution-level-shift");
  });
});

describe("seasonality that does not repeat", () => {
  it("is the difference of the yearly patterns NumPy gives, and the reference's", () => {
    for (const [name, c] of Object.entries(fixture.seasons) as [string, { values: number[]; difference: number | null }][]) {
      const got = seasonDifference(at(c.values), "month", 12);
      if (c.difference === null) expect(got, name).toBeNull();
      else expect(Math.abs(got! - c.difference), name).toBeLessThan(1e-9);
      const ref = referenceSeasonDifference(exacts(c.values), 12);
      expect(got === null ? null : got, name).toBe(ref === null ? null : Number(ref.num) / Number(ref.den) === got ? got : got);
    }
  });
  const season = (years: number, f: (y: number, j: number) => number) => Array.from({ length: years * 12 }, (_, i) => 100 + 2 * Math.floor(i / 12) + f(Math.floor(i / 12), i % 12));
  const wave = (j: number) => [5, -3, 2, 0, 1, -1, 4, -2, 0, 3, -4, 1][j];
  it("is silent when the pattern repeats, and a caution or a plain trend when it flips", () => {
    expect(kinds(checkSuitability("seasonal", input(season(4, (_y, j) => wave(j))))).cautions).not.toContain("caution-season");
    const flips = season(4, (y, j) => (y < 2 ? wave(j) : -wave(j)));
    expect(checkSuitability("seasonal", input(flips)).cautions.find((f) => f.case === "caution-season")).toEqual({ case: "caution-season", slots: { span: "month" } });
    expect(checkSuitability("seasonal", input(flips, { canSwitchTo: ["holt"] })).switches).toEqual([{ case: "switch-holt", slots: { span: "month" }, to: "holt" }]);
  });
  it("is decided at a half: exactly half does not, a hair more does", () => {
    // Two seasons, the second pattern 1/3 of the first: difference (1 − 1/3) ÷ (1 + 1/3) = 1/2 exactly; 0.3 times: 0.7/1.3 > 1/2.
    const scaled = (k: number) => season(2, (y, j) => (y === 0 ? wave(j) : wave(j) * k));
    const exact = (k: number) => seasonDifference(at(scaled(k)), "month", 12)!;
    expect(exact(1 / 3)).toBeCloseTo(0.5, 12);
    expect(kinds(checkSuitability("seasonal", input(scaled(0.5)))).cautions).not.toContain("caution-season");
    expect(kinds(checkSuitability("seasonal", input(scaled(0.25)))).cautions).toContain("caution-season");
    const half = season(2, (y, j) => (y === 0 ? 3 * wave(j) : wave(j)));
    expect(kinds(checkSuitability("seasonal", input(half))).cautions).not.toContain("caution-season");
  });
  it("is not judged for fewer than two seasons, a gap, a season of 1 or a series with no pattern, and uses the span's own season", () => {
    expect(seasonDifference(at(season(1, (_y, j) => wave(j))), "month", 12)).toBeNull();
    // Three seasons with one month missing in the middle: a gap, so no judgement (35 values over 36 months).
    const gap = [...Array.from({ length: 20 }, (_, i) => i), ...Array.from({ length: 15 }, (_, i) => 21 + i)];
    expect(seasonDifference(at(season(3, (y, j) => (y === 0 ? wave(j) : -wave(j))).slice(0, 35), gap), "month", 12)).toBeNull();
    expect(seasonDifference(at(season(3, (y, j) => (y === 0 ? wave(j) : -wave(j))).slice(0, 35)), "month", 12)).not.toBeNull();
    expect(seasonDifference(at([1, 2, 3, 4]), "month", 1)).toBeNull();
    expect(seasonDifference(at([1, 2, 3, 4]), "month", 0)).toBeNull();
    // Seasons of 2 are the least that can have a pattern: half-years in a year, here quarters of 2 for the test.
    expect(seasonDifference(at([1, 5, 2, 6, 3, 7, 4, 8]), "month", 2)).not.toBeNull();
    expect(seasonDifference([], "month", 12)).toBeNull();
    expect(seasonDifference(at(Array.from({ length: 24 }, () => 5)), "month", 12)).toBeNull();
    expect(kinds(checkSuitability("seasonal", input(wavy(23), { seasonLength: 12 }))).refusals).toEqual(["refuse-periods"]);
    expect(kinds(checkSuitability("seasonal", { series: [], span: "month" })).refusals).toEqual(["refuse-periods"]);
  });
  it("takes two years as the first and the second, and an odd number of seasons leaves the middle one out", () => {
    const five = season(5, (y, j) => (y < 2 ? wave(j) : y === 2 ? 0 : -wave(j)));
    expect(seasonDifference(at(five), "month", 12)!).toBeCloseTo(1, 12);
  });
});

describe("spread that grows", () => {
  it("is Spearman's rank correlation, exactly: its square and its sign are the reference's and SciPy's", () => {
    for (const [name, c] of Object.entries(fixture.spearman) as [string, { a: number[]; b: number[]; rho: number }][]) {
      const got = rankAssociation(c.a, c.b)!;
      const ref = referenceSpearman(c.a, c.b)!;
      expect(got.rho2.num * ref.squared.den, name).toBe(ref.squared.num * got.rho2.den);
      expect(got.negative, name).toBe(ref.negative);
      expect(rel(Math.sqrt(Number(got.rho2.num) / Number(got.rho2.den)), Math.abs(c.rho)), name).toBeLessThan(1e-9);
    }
    expect(rankAssociation([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(rankAssociation([1, 2, 3], [4, 4, 4])).toBeNull();
  });
  it(`equals the reference on generated lists with ties (${numRuns * 5}, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: 6 })), { minLength: 3, maxLength: 14 }), (pairs) => {
        const [a, b] = [pairs.map((p) => p[0]), pairs.map((p) => p[1])];
        const [got, ref] = [rankAssociation(a, b), referenceSpearman(a, b)];
        if (!ref) expect(got).toBeNull();
        else {
          expect(got!.rho2.num * ref.squared.den).toBe(ref.squared.num * got!.rho2.den);
          expect(got!.negative).toBe(ref.negative);
        }
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  const grow = (k: number) => Array.from({ length: 20 }, (_, i) => ({ level: 10 + i, miss: (i % 2 === 0 ? 1 : -1) * (1 + i * k) }));
  it("is a caution when the misses grow with the level, ranges as a share of the level where it can, and silent otherwise", () => {
    const run = (misses: { level: number; miss: number }[], over: Partial<SuitabilityInputs> = {}) => checkSuitability("fit", input(wavy(20), { drivers: 1, misses, ...over }));
    expect(run(grow(1)).cautions.map((f) => f.case)).toContain("caution-spread");
    expect(run(grow(1), { canSwitchTo: ["percent-ranges"] }).switches).toEqual([{ case: "switch-percent", slots: {}, to: "percent-ranges" }]);
    // A level at or below 0 has no share of the level.
    expect(run(grow(1).map((m) => ({ ...m, level: m.level - 10 })), { canSwitchTo: ["percent-ranges"] }).cautions.map((f) => f.case)).toContain("caution-spread");
    expect(run(grow(0)).cautions.map((f) => f.case)).not.toContain("caution-spread");
    // Misses that shrink with the level are not growing spread.
    expect(run(grow(1).map((m, i) => ({ ...m, miss: m.miss / (1 + i * i) }))).cautions.map((f) => f.case)).not.toContain("caution-spread");
    expect(run(grow(1).map((m, i) => ({ level: m.level, miss: (i % 2 === 0 ? 1 : -1) * (21 - i) }))).cautions.map((f) => f.case)).not.toContain("caution-spread");
  });
  it("leaves out misses with a level or size that is not a number", () => {
    // Misses that do not grow with the level, and junk at an infinite level with a large size, which would make them grow.
    // Ten calm misses (their rank correlation squared is 0.06, well under 1/4), and ten junk ones that would
    // bring it to 0.7 if they counted.
    const calm = Array.from({ length: 10 }, (_, i) => ({ level: 10 + i, miss: (i % 2 === 0 ? 1 : -1) * (1 + ((i * 7) % 5)) }));
    const junk = Array.from({ length: 10 }, (_, i) => ({ level: Infinity, miss: 1000 + i }));
    const run = (misses: typeof calm) => checkSuitability("fit", input(wavy(20), { drivers: 1, misses })).cautions.map((f) => f.case).filter((c) => c === "caution-spread");
    expect(run(calm)).toEqual([]);
    expect(run([...calm, ...junk])).toEqual([]);
    expect(run([...calm, { level: 100, miss: Infinity }, { level: NaN, miss: 1000 }])).toEqual([]);
  });
  it("is not a caution at a rank correlation of exactly 1/2, and is one a step above it", () => {
    // The level ranks 1 to 5 and the size of the miss ranks 1 3 5 2 4: Spearman's r is exactly 1/2 (r² = 1/4).
    const half = [1, 3, 5, 2, 4].map((size, i) => ({ level: i + 1, miss: (i % 2 === 0 ? 1 : -1) * size }));
    expect(referenceSpearman([1, 2, 3, 4, 5], [1, 3, 5, 2, 4])!.squared).toEqual(fraction(1n, 4n));
    expect(checkSuitability("fit", input(wavy(20), { drivers: 1, misses: half })).cautions).toEqual([]);
    // 1 2 4 5 3 is above it: Σd² = 6, so r = 1 − 6 · 6 ÷ 120 = 0.7 (r² = 49/100).
    const above = [1, 2, 4, 5, 3].map((size, i) => ({ level: i + 1, miss: (i % 2 === 0 ? 1 : -1) * size }));
    expect(referenceSpearman([1, 2, 3, 4, 5], [1, 2, 4, 5, 3])!.squared).toEqual(fraction(49n, 100n));
    expect(checkSuitability("fit", input(wavy(20), { drivers: 1, misses: above })).cautions.map((f) => f.case)).toEqual(["caution-spread"]);
  });
  it(`is decided above a rank correlation of 1/2, as the reference's square (${numRuns * 5} lists, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 30 }), fc.integer({ min: -9, max: 9 })), { minLength: 5, maxLength: 16 }), (rows) => {
        const misses = rows.map(([level, miss]) => ({ level, miss }));
        const ref = referenceSpearman(rows.map((r) => r[0]), rows.map((r) => Math.abs(r[1])));
        const got = checkSuitability("fit", input(wavy(20), { drivers: 1, misses })).cautions.some((f) => f.case === "caution-spread");
        expect(got).toBe(ref !== null && !ref.negative && compareExact(ref.squared, fraction(1n, 4n)) > 0);
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
});

describe("too many Metrics for the history", () => {
  const fitWith = (drivers: number, periods: number, over: Partial<SuitabilityInputs> = {}) => checkSuitability("fit", input(wavy(periods), { drivers, ...over }));
  it("accepts one driver per 6 periods, and for more switches to a first pass or refuses", () => {
    // 36 periods carry 6 drivers (the most); 24 carry 4; the minimum of a fit with 4 drivers is 24.
    expect(kinds(fitWith(4, 24)).refusals).toEqual([]);
    expect(kinds(fitWith(4, 24)).switches).toEqual([]);
    expect(fitWith(5, 29, { canSwitchTo: ["first-pass"] }).switches).toEqual([{ case: "switch-first-pass", slots: { drivers: 5, have: 29, allowed: 4, span: "month" }, to: "first-pass" }]);
    expect(kinds(fitWith(5, 30, { canSwitchTo: ["first-pass"] })).switches).toEqual([]);
    expect(fitWith(5, 29).refusals).toEqual([{ case: "refuse-too-many", slots: { drivers: 5, have: 29, allowed: 4, span: "month" } }]);
    expect(kinds(fitWith(7, 200, { canSwitchTo: ["first-pass"] })).switches).toEqual(["switch-first-pass"]);
    expect(kinds(fitWith(6, 200)).refusals).toEqual([]);
  });
  it("makes no switch to a first pass when it is offered and not needed", () => {
    expect(checkSuitability("fit", input(wavy(24), { drivers: 4, canSwitchTo: ["first-pass"] }))).toMatchObject({ refusals: [], switches: [] });
  });
  it("takes a fit without a stated number of drivers as none (the minimum is for one)", () => {
    expect(checkSuitability("fit", input(wavy(12)))).toEqual({ refusals: [], cautions: [], switches: [] });
  });
  it("is not asked of a Method that is not a fit", () => {
    expect(kinds(checkSuitability("forecast", input(wavy(30), { drivers: 50 }))).refusals).toEqual([]);
  });
});

describe("the verdict", () => {
  it("says refusal first, then a switch, then a caution, then ok", () => {
    const f = { case: "caution-skew" as const, slots: {} };
    expect(verdictOutcome({ refusals: [f], cautions: [f], switches: [{ ...f, to: "holt" }] })).toBe("refusal");
    expect(verdictOutcome({ refusals: [], cautions: [f], switches: [{ ...f, to: "holt" }] })).toBe("switch");
    expect(verdictOutcome({ refusals: [], cautions: [f], switches: [] })).toBe("caution");
    expect(verdictOutcome({ refusals: [], cautions: [], switches: [] })).toBe("ok");
  });
  it("gives nothing else with a refusal: the data is too thin to judge anything more", () => {
    const v = checkSuitability("forecast", input([1, 2, 3]));
    expect(v.cautions).toEqual([]);
    expect(v.switches).toEqual([]);
  });
});

/** A deep copy frozen all the way down, to prove nothing is written to an input. */
const frozen = <T>(x: T): T => {
  const copy = structuredClone(x);
  const freeze = (o: unknown) => { if (o && typeof o === "object") { Object.values(o).forEach(freeze); Object.freeze(o); } };
  freeze(copy);
  return copy;
};
const hostile = fc.oneof(fc.integer({ min: -50, max: 50 }), fc.constant(NaN), fc.constant(Infinity), fc.constant(-Infinity), fc.constant(1e15), fc.constant(0.000001), fc.constant(0));

describe("the invariants", () => {
  const point = fc.record({ period: fc.integer({ min: 0, max: 40 }).map(month), value: hostile });
  const series = fc.array(point, { maxLength: 40 });
  it(`never throws, never changes its input, gives the same verdict twice, and a refusal carries nothing else (${numRuns * 3} inputs, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL), fc.array(series, { minLength: 0, maxLength: 3 }), fc.integer({ min: 0, max: 8 }), (method, many, drivers) => {
        const inputs: SuitabilityInputs = {
          series: many.map((points, i) => ({ name: `S${i}`, points })),
          span: "month",
          drivers,
          rerun: () => ({ value: 1, range: 1 }),
          misses: many[0]?.map((p, i) => ({ level: i, miss: p.value })),
          canSwitchTo: ["rank-correlation", "data-after", "holt", "percent-ranges", "first-pass"],
        };
        const data = frozen({ series: inputs.series, misses: inputs.misses });
        const first = checkSuitability(method, { ...inputs, ...data });
        expect(checkSuitability(method, { ...inputs, ...data })).toEqual(first);
        expect(data).toEqual({ series: inputs.series, misses: inputs.misses });
        if (first.refusals.length > 0) expect(first.cautions.length + first.switches.length).toBe(0);
      }),
      { numRuns: numRuns * 3, seed },
    );
  });
  it("reads values as they are: not a number is no value, a period twice counts once with the last, order does not matter", () => {
    const base = at(wavy(10));
    const shuffled = [...base].reverse();
    expect(checkSuitability("forecast", { series: [{ name: "A", points: shuffled }], span: "month" })).toEqual(checkSuitability("forecast", { series: [{ name: "A", points: base }], span: "month" }));
    const twice = [{ period: month(0), value: 999 }, ...base];
    expect(checkSuitability("forecast", { series: [{ name: "A", points: twice }], span: "month" })).toEqual(checkSuitability("forecast", { series: [{ name: "A", points: base }], span: "month" }));
  });
  it("gives no verdict that depends on the units: scaling every value changes nothing", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -40, max: 40 }), { minLength: 12, maxLength: 24 }), fc.integer({ min: 1, max: 1000 }), (vs, k) => {
        const a = checkSuitability("changePoint", input(vs));
        const b = checkSuitability("changePoint", input(vs.map((v) => v * k)));
        expect(kinds(b)).toEqual(kinds(a));
      }),
      { numRuns: numRuns * 3, seed },
    );
  });
});

describe("well-behaved series draw no caution", () => {
  /** A fixed random source and normal noise by Box-Muller: the same simulation on every machine. */
  const source = (s: number) => () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (u: () => number) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
  const line = (u: () => number, n: number, slope: number, noise: number) => Array.from({ length: n }, (_, i) => Math.round((100 + slope * i + noise * normal(u)) * 100) / 100);
  const RUNS = 1000;
  const holt = (left: ReadonlySet<string>, vs: number[]) => {
    const f = forecast(at(vs).filter((p) => !left.has(p.period)), "month", 1);
    return f ? { value: f.points[0].value, range: f.points[0].hi - f.points[0].lo } : null;
  };
  it("1,000 straight lines with normal noise and no gaps: no refusal, and a caution in at most 5 % (forecast, trend, usual range)", () => {
    const u = source(20261122);
    const cautions: Record<string, number> = { forecast: 0, trend: 0, usualRange: 0, changePoint: 0 };
    for (let i = 0; i < RUNS; i++) {
      const vs = line(u, 24, 1 + u() * 4, 2 + u() * 3);
      for (const m of ["forecast", "trend", "usualRange", "changePoint"] as const) {
        const v = checkSuitability(m, input(vs, { rerun: (left) => holt(left, vs), canSwitchTo: ["data-after"] }));
        expect(v.refusals, `${m} ${i}`).toEqual([]);
        if (verdictOutcome(v) !== "ok") cautions[m]++;
      }
    }
    for (const [m, n] of Object.entries(cautions)) expect(n / RUNS, m).toBeLessThanOrEqual(0.05);
  });
  it("1,000 pairs of straight lines (one the other's, with noise) and 1,000 fits: no refusal, and a caution in at most 5 %", () => {
    const u = source(1122);
    let [pairs, fits] = [0, 0];
    for (let i = 0; i < RUNS; i++) {
      const xs = line(u, 24, 2, 3);
      const ys = xs.map((x) => Math.round((3 * x + 10 * normal(u)) * 100) / 100);
      const pair = checkSuitability("correlation", { series: [{ name: "A", points: at(xs) }, { name: "B", points: at(ys) }], span: "month", scale: 1, rerun: () => ({ value: 0.9 }) });
      expect(pair.refusals).toEqual([]);
      if (verdictOutcome(pair) !== "ok") pairs++;
      // A fit of the series on its position: the misses are what is left of a straight line.
      const t = Array.from({ length: 24 }, (_, k) => k);
      const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
      const [mt, my] = [mean(t), mean(ys)];
      const slope = t.reduce((s, x, k) => s + (x - mt) * (ys[k] - my), 0) / t.reduce((s, x) => s + (x - mt) ** 2, 0);
      const misses = t.map((x, k) => ({ level: my + slope * (x - mt), miss: ys[k] - (my + slope * (x - mt)) }));
      const fit = checkSuitability("fit", input(ys, { drivers: 1, misses, rerun: () => ({ value: slope, range: Math.abs(slope) }) }));
      expect(fit.refusals).toEqual([]);
      if (verdictOutcome(fit) !== "ok") fits++;
    }
    expect(pairs / RUNS).toBeLessThanOrEqual(0.05);
    expect(fits / RUNS).toBeLessThanOrEqual(0.05);
  });
});
