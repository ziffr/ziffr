// Derived Metrics against the references, exhaustively (spec 0022, "Derived Metrics, exhaustively" and "Formulas";
// GLOSSARY: Derived Metric, Aggregation, Display Period). Generated formulas, random trees of + − × ÷, unary minus and
// brackets over 1 to 4 inputs, against a reference evaluator, and the same formulas broken on purpose; a Derived
// Metric's value per period and over every longer Display Period for every combination of its inputs' Aggregations,
// with gaps, zeros (division) and every Fiscal Year start; and the refusals, each with its reason.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compare, resolverFrom } from "./compare";
import { NOT_COMBINED, seriesBy, valueOver } from "./display-periods";
import { checkFormula, evaluate, formulaInputs, inputsNotCombined, inputsProblem, usesPrevious, type FormulaInput } from "./formula";
import type { Span, YearStart } from "./periods";
import type { Aggregation, Metric, Observation, Point } from "./types";
import { buildSeries } from "./series";
import { metric } from "./test/fixtures";
import { dayOf, monthsLater, textOf } from "./test/reference/calendar";
import { longer, MOST, PERIODS, runs, series, valueText, YEAR_STARTS } from "./test/reference/check";
import { referenceDerivedPeriods, referenceDerivedSeries } from "./test/reference/derived";
import { exactOf, exactText, isNearestDouble } from "./test/reference/exact";
import { referenceEvaluate, referenceInputs, referenceReads } from "./test/reference/formula";

const { numRuns, seed } = runs();
const SLUGS = ["a", "b", "net-revenue", "c2"];

/** A formula as people write it: a random tree over the given inputs, with numbers, unary minus and brackets where
 * they are needed or not, and spaces here and there. */
const formula = (slugs: string[], back = false) =>
  fc.letrec<{ f: string }>((tie) => ({
    f: fc.oneof(
      { depthSize: "small", withCrossShrink: true },
      { weight: 3, arbitrary: fc.constantFrom(...slugs).map((s) => `{${s}}`) },
      // prev({x}) and change({x}), with white space inside the brackets here and there (ticket #619).
      ...(back ? [{ weight: 2, arbitrary: fc.tuple(fc.constantFrom("prev", "change"), fc.constantFrom(...slugs), fc.constantFrom("", " "), fc.constantFrom("", " ")).map(([fn, s, a, b]) => `${fn}${a}(${a}{${s}}${b})`) }] : []),
      { weight: 1, arbitrary: fc.oneof(fc.nat({ max: 1000 }).map(String), fc.tuple(fc.nat({ max: 99 }), fc.stringMatching(/^\d{1,3}$/)).map(([w, d]) => `${w}.${d}`), fc.constant("0")) },
      { weight: 2, arbitrary: fc.tuple(tie("f"), fc.constantFrom("+", "-", "*", "/"), tie("f"), fc.constantFrom("", " ", "  "), fc.boolean()).map(([a, op, b, sp, br]) => (br ? `(${a}${sp}${op}${sp}${b})` : `${a}${sp}${op}${sp}${b}`)) },
      { weight: 1, arbitrary: tie("f").map((a) => `-${a}`) },
      { weight: 1, arbitrary: tie("f").map((a) => `( ${a} )`) },
    ),
  })).f;

/** Values for some of the inputs: as people send them, often zero, sometimes one missing. */
const inputs = fc.record(Object.fromEntries(SLUGS.map((s) => [s, fc.oneof({ weight: 5, arbitrary: valueText.map(Number) }, { weight: 1, arbitrary: fc.constant(0) })])), { requiredKeys: SLUGS.slice(0, 3) }) as fc.Arbitrary<Record<string, number>>;

/** The inputs' values one period earlier, for prev and change: any of them may be missing. */
const earlier = fc.record(Object.fromEntries(SLUGS.map((s) => [s, valueText.map(Number)])), { requiredKeys: [] }) as fc.Arbitrary<Record<string, number>>;

/** Series of 1 to 3 inputs of one Period that share their periods, as inputs of a Derived Metric do: the first is a
 * generated series (gaps, periods given twice, any order), each other one keeps a random share of its periods with
 * values of its own, so spans hold every input, some or none of them. */
function related(period: (typeof PERIODS)[number], n: number) {
  const other = fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.array(fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), valueText), { minLength: MOST[period], maxLength: MOST[period] }));
  return fc.tuple(series(period), fc.array(other, { minLength: n - 1, maxLength: n - 1 })).map(([base, others]) => {
    const periods = [...new Set(base.points.map((p) => p.period))].sort();
    const rest = others.map(([keep, values]) => periods.flatMap((p, i) => (values[i][0] < keep ? [{ period: p, value: Number(values[i][1]) }] : [])));
    return { points: [base.points, ...rest], today: base.today };
  });
}

/** The code's value is the double nearest to the reference's exact one, or both have none. */
function sameValue(code: number | null | undefined, ref: ReturnType<typeof referenceEvaluate>, where: string) {
  if (ref === null) expect(code ?? null, `${where}: the reference has no value, the code ${code}`).toBeNull();
  else expect(code !== null && code !== undefined && isNearestDouble(code, ref), `${where}: ${code} is not the double nearest to ${exactText(ref)}`).toBe(true);
}

const asInputs = (slugs: string[], over: Partial<FormulaInput> = {}): FormulaInput[] => slugs.map((slug) => ({ slug, name: slug.toUpperCase(), period: "month", aggregation: "sum", formula: null, ...over }));

describe("formulas against the reference evaluator", () => {
  it(`give the exact result of generated formulas over 1 to 4 inputs (${numRuns * 5} formulas, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }).chain((n) => formula(SLUGS.slice(0, n))), inputs, (f, vars) => {
        const exact = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, exactOf(v)]));
        sameValue(evaluate(f, vars), referenceEvaluate(f, exact), f);
        expect(checkFormula(f, asInputs(SLUGS)) === null, f).toBe(referenceInputs(f).length > 0);
        expect(referenceReads(f), f).toBe(true);
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  it(`with prev and change, give the exact result over this period's and the previous period's values (${numRuns * 5} formulas, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }).chain((n) => formula(SLUGS.slice(0, n), true)), inputs, earlier, (f, vars, before) => {
        const exact = Object.fromEntries([...Object.entries(vars).map(([k, v]) => [k, exactOf(v)]), ...Object.entries(before).map(([k, v]) => [`prev:${k}`, exactOf(v)])]);
        sameValue(evaluate(f, vars, before), referenceEvaluate(f, exact), f);
        expect(referenceReads(f), f).toBe(true);
        expect(formulaInputs(f), f).toEqual(referenceInputs(f));
        expect(usesPrevious(f), f).toBe(/prev|change/.test(f));
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  it(`refuse exactly what the reference refuses, on formulas broken on purpose (${numRuns * 5} formulas, seed ${seed})`, () => {
    const breaks = fc.constantFrom(".", "e", "^", "(", ")", "{", "}", "{A}", ",", " ", "×", "%", "1", "+", "*", "-", "{a}", "{b c}", "..", " ", "E3", "prev", "change", "prev(", "change({a}", "prev({a} + {b})", "change()", "p", "c");
    fc.assert(
      fc.property(formula(SLUGS.slice(0, 2), true), fc.nat(), fc.oneof(breaks, fc.constant("")), fc.nat({ max: 3 }), inputs, earlier, (f, at, insert, cut, vars, before) => {
        const i = at % (f.length + 1);
        const broken = f.slice(0, i) + insert + f.slice(i + Math.min(cut, f.length - i));
        const exact = Object.fromEntries([...Object.entries(vars).map(([k, v]) => [k, exactOf(v)]), ...Object.entries(before).map(([k, v]) => [`prev:${k}`, exactOf(v)])]);
        const reads = referenceReads(broken);
        sameValue(evaluate(broken, vars, before), referenceEvaluate(broken, exact), JSON.stringify(broken));
        // checkFormula refuses also a formula that names no Metric; every input named here is one of the Workspace's.
        const known = referenceInputs(broken).every((s) => SLUGS.includes(s));
        if (known) expect(checkFormula(broken, asInputs(SLUGS)) === null, JSON.stringify(broken)).toBe(reads && referenceInputs(broken).length > 0);
        if (reads) expect(formulaInputs(broken), JSON.stringify(broken)).toEqual(referenceInputs(broken));
        else if (reads) expect(checkFormula(broken, asInputs(SLUGS)), JSON.stringify(broken)).toMatch(/is not a Metric/);
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  it("the reference reads and refuses what was worked out by hand", () => {
    const e = (f: string, vars: Record<string, string> = {}) => {
      const r = referenceEvaluate(f, Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, exactOf(v)])));
      return r && exactText(r);
    };
    expect(e("({a} - {b}) / {a} * 100", { a: "0.3", b: "0.1" })).toBe("200/3");
    expect(e("2 + 3 * 4 - 6 / 2 / 3")).toBe("13");
    expect(e("-2 * -3 - -(1)")).toBe("7");
    expect(e("{a} / ({b} - {b})", { a: "1", b: "2" })).toBeNull();
    expect(e("{a} + {missing}", { a: "1" })).toBeNull();
    // prev and change: this period's value minus the previous one's, which is named prev:a here.
    expect(e("change({a})", { a: "5", "prev:a": "3" })).toBe("2");
    expect(e("change({a}) * 2 - prev( {a} )", { a: "5", "prev:a": "3" })).toBe("1");
    expect(e("-change({a}) / 4", { a: "0.3", "prev:a": "0.1" })).toBe("-0.05");
    expect(e("change({a})", { a: "5" })).toBeNull();
    expect(e("prev({a})", { a: "5" })).toBeNull();
    for (const bad of ["{a} {b}", "{a} ^ 2", "1e3 * {a}", ".5 * {a}", "1. + 2", "({a}", "{a})", "()", "+{a}", "{a} *", "", "{A}", "{a b}", "2{a}", "(1)(2)", "prev({a}", "prev {a}", "prev(1)", "change()", "change({a} + {b})", "change({A})", "prev({a}){b}", "previous({a})", "change({a}) change({b})"]) {
      expect(referenceReads(bad), bad).toBe(false);
    }
    for (const good of ["{a}", "-{a}", "--{a}", "1 - -2", "( {a} )", "007", "{net-revenue} / {c2}", "prev({a})", "change( {a} ) / 7", "-change({a})", "prev ( {a} )"]) expect(referenceReads(good), good).toBe(true);
  });
  it("are held to bounds, so no formula grows its arithmetic without limit", () => {
    const ins = asInputs(["a"]);
    const sum = (n: number) => Array.from({ length: n + 1 }, () => "{a}").join("+");
    // 50 operations are read, 51 are not.
    expect(evaluate(sum(50), { a: 1 })).toBe(51);
    expect(evaluate(sum(51), { a: 1 })).toBeNull();
    expect(checkFormula(sum(51), ins)).toBe("The formula has more than 50 operations.");
    // Minus signs count as operations too.
    expect(checkFormula(`${"-".repeat(51)}{a}`, ins)).toBe("The formula has more than 50 operations.");
    // A number has at most 20 digits, its decimals included.
    expect(evaluate("{a} * 12345678901234567890", { a: 1 })).toBe(12345678901234567890);
    expect(evaluate("{a} * 1234567890.12345678901", { a: 1 })).toBeNull();
    expect(checkFormula("{a} * 123456789012345678901", ins)).toMatch(/more than 20 digits/);
    // At most 500 characters, white space included.
    const padded = (n: number) => `{a}${" ".repeat(n - 3)}`;
    expect(evaluate(padded(500), { a: 2 })).toBe(2);
    expect(evaluate(padded(501), { a: 2 })).toBeNull();
    expect(checkFormula(padded(501), ins)).toBe("The formula is longer than 500 characters.");
    for (const f of [sum(51), padded(501), "{a} * 123456789012345678901"]) expect(referenceReads(f), f).toBe(false);
    // Within the bounds, values far beyond what Ziffr keeps can still outgrow the arithmetic: no value then.
    expect(evaluate(Array(10).fill("{a}").join(" * "), { a: 1e300 })).toBeNull();
    expect(evaluate(Array(10).fill("{a}").join(" * "), { a: 1e-300 })).toBeNull();
    expect(evaluate(Array(9).fill("{a}").join(" * "), { a: 1e30 })).toBe(1e270);
  });
  it("refuses at once a formula written to burn time", () => {
    // 200,000 multiplications of a 21-digit value: before the bounds, an exact product of some four million digits.
    const f = Array.from({ length: 200_001 }, () => "{a}").join("*");
    const started = performance.now();
    expect(evaluate(f, { a: 999999999999999.9 })).toBeNull();
    expect(checkFormula(f, asInputs(["a"]))).toMatch(/longer than 500 characters/);
    expect(performance.now() - started).toBeLessThan(1000);
  });
  it("keep every fraction in lowest terms", () => {
    // Twelve halvings and doublings: exact all the way, with nothing left to grow.
    expect(evaluate(`${Array(12).fill("{a} / 2").join(" * ")} * ${Array(12).fill("2").join(" * ")}`, { a: 3 })).toBe(3 ** 12);
  });
  it("are exact where floating point is not", () => {
    expect(evaluate("{a} - {b}", { a: 0.3, b: 0.1 })).toBe(0.2);
    expect(evaluate("({a} - {b}) / {a} * 100", { a: 0.3, b: 0.1 })).toBe(66.66666666666667);
    expect(evaluate("{a} * 3", { a: 0.1 })).toBe(0.3);
    expect(evaluate("{a} - {a}", { a: -0.5 })).toBe(0);
    expect(Object.is(evaluate("-{a} * 0", { a: 5 }), 0)).toBe(true);
    expect(evaluate("{a} * {a}", { a: 1e200 })).toBeNull();
  });
});

/** Observations of a few input Metrics from generated series, in the order the database would send them. */
function observationsOf(ms: Metric[], points: Point[][]): Observation[] {
  return ms.flatMap((m, k) => points[k].map((p) => ({ metric_id: m.id, period_start: p.period, value: p.value }) as Observation));
}

describe("a Derived Metric", () => {
  const twoOrMore = fc.integer({ min: 1, max: 3 });
  const aggregations = fc.constantFrom<Aggregation>("sum", "average", "last");
  it(`per period, is the formula on its inputs' latest values where all have one (${numRuns} series, seed ${seed})`, () => {
    let compared = 0;
    for (const period of PERIODS) {
      fc.assert(
        fc.property(twoOrMore.chain((n) => fc.tuple(formula(SLUGS.slice(0, n)), related(period, n))), ([f, generated]) => {
          const ins = generated.points.map((_, k) => metric({ id: k + 1, slug: SLUGS[k], name: SLUGS[k], period, formula: null }));
          const derived = metric({ id: 99, slug: "derived", period, formula: f });
          const got = buildSeries([...ins, derived], observationsOf(ins, generated.points)).derived;
          const want = referenceDerivedPeriods(f, generated.points.map((points, k) => ({ slug: SLUGS[k], points, aggregation: "sum" })));
          expect(got.map((p) => p.period), f).toEqual(want.map((w) => textOf(w.day)));
          got.forEach((p, i) => sameValue(p.value, want[i].value, `${f} at ${p.period}`));
          compared += got.length;
        }),
        { numRuns, seed },
      );
    }
    // The generated inputs share periods: most series have values of the Derived Metric to compare.
    expect(compared).toBeGreaterThan(numRuns * 10);
  });
  it(`per period, with prev and change, is the formula on each input's value and the one a period before, where both exist (${numRuns} series, seed ${seed})`, () => {
    let compared = 0;
    for (const period of PERIODS) {
      fc.assert(
        fc.property(twoOrMore.chain((n) => fc.tuple(formula(SLUGS.slice(0, n), true), related(period, n))), ([f, generated]) => {
          const ins = generated.points.map((_, k) => metric({ id: k + 1, slug: SLUGS[k], name: SLUGS[k], period, formula: null }));
          const derived = metric({ id: 99, slug: "derived", period, formula: f });
          const got = buildSeries([...ins, derived], observationsOf(ins, generated.points)).derived;
          const want = referenceDerivedPeriods(f, generated.points.map((points, k) => ({ slug: SLUGS[k], points, aggregation: "sum" })), period);
          expect(got.map((p) => p.period), f).toEqual(want.map((w) => textOf(w.day)));
          got.forEach((p, i) => sameValue(p.value, want[i].value, `${f} at ${p.period}`));
          compared += got.length;
        }),
        { numRuns, seed },
      );
    }
    expect(compared).toBeGreaterThan(numRuns * 5);
  });
  it(`over a longer span, is the formula on its inputs' combined values, for every combination of their Aggregations, every Display Period and Fiscal Year start (${numRuns} series, seed ${seed})`, () => {
    let compared = 0;
    for (const period of PERIODS) {
      fc.assert(
        fc.property(
          twoOrMore.chain((n) => fc.tuple(formula(SLUGS.slice(0, n)), related(period, n), fc.array(aggregations, { minLength: n, maxLength: n }))),
          fc.constantFrom(...YEAR_STARTS),
          fc.boolean(),
          ([f, generated, aggs], yearStart, cut) => {
            const s = generated.points.map((points) => forYear(points, period, yearStart));
            const ins = s.map((_, k) => metric({ id: k + 1, slug: SLUGS[k], name: SLUGS[k], period, aggregation: aggs[k], formula: null }));
            const derived = metric({ id: 99, slug: "derived", period, formula: f, aggregation: "none" });
            const all = [...ins, derived];
            const built = buildSeries(all, observationsOf(ins, s));
            const resolve = resolverFrom(all, built);
            const today = generated.today;
            const alignTo = cut && built.derived.length ? built.derived[Math.floor(built.derived.length / 2)].period : undefined;
            for (const display of longer(period)) {
              const code = seriesBy(derived, resolve, display, { yearStart, today, alignTo });
              const ref = referenceDerivedSeries(f, s.map((points, k) => ({ slug: SLUGS[k], points, aggregation: aggs[k] })), period, display, { yearStart, today, alignTo });
              const where = `${f} by ${display}, ${period} inputs by ${aggs.join("/")}, year from ${yearStart}, today ${today}${alignTo ? `, cut at ${alignTo}` : ""}`;
              expect(code.ok, where).toBe(true);
              expect(code.points.map((p) => p.period), where).toEqual(ref.map((r) => r.period));
              code.points.forEach((p, i) => {
                const r = ref[i];
                expect({ held: p.held, length: p.length, toDate: p.toDate, through: p.through }, `${where}, span ${p.period}`).toEqual({ held: r.held, length: r.length, toDate: r.toDate, through: r.through });
                sameValue(p.value, r.value, `${where}, span ${p.period}`);
              });
              compared += code.points.length;
            }
          },
        ),
        { numRuns: Math.max(20, Math.floor(numRuns / 2)), seed },
      );
    }
    expect(compared).toBeGreaterThan(numRuns * 2);
  });
  describe("with prev and change (ticket #619)", () => {
    // A weekly odometer read every Sunday-ish: kilometres per day is the change since the week before, over 7 days.
    const odo = metric({ id: 1, slug: "odometer", name: "Odometer", period: "week", aggregation: "last", formula: null });
    const perDay = metric({ id: 2, slug: "km-per-day", name: "Kilometres per day", period: "week", formula: "change({odometer}) / 7" });
    const week = (n: number) => textOf(dayOf("2026-11-02") + 7 * n);
    const obs = (readings: [number, number][]) => observationsOf([odo], [readings.map(([w, value]) => ({ period: week(w), value }))]);

    it("is the change since the previous period: none for the first, none after a gap", () => {
      const built = buildSeries([odo, perDay], obs([[0, 13573], [1, 13650], [2, 13713], [4, 13900], [5, 13900]]));
      // Week 0 has no week before it; week 4 has none (week 3 is missing); week 5 is 0 kilometres.
      expect(built["km-per-day"]).toEqual([{ period: week(1), value: 11 }, { period: week(2), value: 9 }, { period: week(5), value: 0 }]);
    });
    it("looks back a day, a week, a month, a quarter or a year, across the end of a month and a year", () => {
      const dated = (period: Metric["period"], a: string, b: string) => {
        const x = metric({ id: 1, slug: "x", period, formula: null });
        const d = metric({ id: 2, slug: "d", period, formula: `change({x}) + prev({x})` });
        return buildSeries([x, d], observationsOf([x], [[{ period: a, value: 5 }, { period: b, value: 8 }]])).d;
      };
      expect(dated("day", "2026-02-28", "2026-03-01")).toEqual([{ period: "2026-03-01", value: 8 }]);
      expect(dated("week", "2026-12-28", "2027-01-04")).toEqual([{ period: "2027-01-04", value: 8 }]);
      expect(dated("month", "2026-12-01", "2027-01-01")).toEqual([{ period: "2027-01-01", value: 8 }]);
      expect(dated("quarter", "2026-10-01", "2027-01-01")).toEqual([{ period: "2027-01-01", value: 8 }]);
      expect(dated("year", "2026-01-01", "2027-01-01")).toEqual([{ period: "2027-01-01", value: 8 }]);
      // Two months apart is not the previous month.
      expect(dated("month", "2026-11-01", "2027-01-01")).toEqual([]);
    });
    it("is shown by its own period only, and says why for a longer one", () => {
      const built = buildSeries([odo, perDay], obs([[0, 100], [1, 107], [2, 114], [3, 121], [4, 128]]));
      const r = seriesBy(perDay, resolverFrom([odo, perDay], built), "month", { yearStart: 1, today: "2026-12-01" });
      expect(r).toMatchObject({ ok: false, points: [] });
      expect(!r.ok && r.reason).toBe("Shown by its own period: it reaches back to the previous period (prev or change), so it cannot be combined into longer periods.");
      expect(inputsNotCombined(perDay, [odo])).toMatch(/reaches back/);
      // By its own period it draws as any other.
      expect(seriesBy(perDay, resolverFrom([odo, perDay], built), "week", { yearStart: 1, today: "2026-12-01" })).toMatchObject({ ok: true, points: [{ value: 1 }, { value: 1 }, { value: 1 }, { value: 1 }] });
    });
    it("is accepted over an input set to Aggregation none, which no span needs; its other refusals stay", () => {
      const none = { slug: "odometer", name: "Odometer", period: "week" as const, aggregation: "none" as const, formula: null };
      expect(checkFormula("change({odometer}) / 7", [none])).toBeNull();
      expect(checkFormula("{odometer} / 7", [none])).toMatch(/Aggregation none/);
      expect(checkFormula("change({odometer})", [none], { slug: "odometer", period: "week" })).toMatch(/this Metric itself/);
      expect(checkFormula("change({odometer})", [{ ...none, period: "day" }], { slug: "d", period: "week" })).toMatch(/counted by day, it by week/);
      expect(checkFormula("change({nobody})", [none])).toMatch(/not a Metric of this Workspace/);
    });
    it("explains what it cannot read", () => {
      expect(checkFormula("change(1)", asInputs(["a"]))).toBe("change takes one Metric: write change({odometer}), with the Metric's slug in lower case.");
      expect(checkFormula("prev({a} + 1)", asInputs(["a"]))).toMatch(/^prev takes one Metric/);
      expect(checkFormula("previous({a})", asInputs(["a"]))).toMatch(/"p" cannot be read/);
      expect(evaluate("change({a})", { a: 3 })).toBeNull();
      expect(evaluate("prev({a}) + change({a})", { a: 3 }, { a: 1 })).toBe(3);
    });
    it("a Comparison with the previous period and the Metric's own period works; longer spans say why not", () => {
      const built = buildSeries([odo, perDay], obs([[0, 100], [1, 107], [2, 121]]));
      const resolve = resolverFrom([odo, perDay], built);
      const [prev, mom] = compare(perDay, resolve, { keys: ["prev", "mom"], yearStart: 1 });
      expect(prev).toMatchObject({ key: "prev", available: true, current: 2, previous: 1 });
      expect(mom.available).toBe(false);
      // A span of more than one period has no value, and neither has a period whose input has none or none before it.
      expect(valueOver("km-per-day", week(0), week(1), resolve, 2)).toBeUndefined();
      expect(valueOver("km-per-day", week(1), week(1), resolve, 1)).toBe(1);
      expect(valueOver("km-per-day", week(0), week(0), resolve, 1)).toBeUndefined();
      expect(valueOver("km-per-day", week(5), week(5), resolve, 1)).toBeUndefined();
    });
  });
  it("counts a span where each input holds half of it, even without a period of both", () => {
    // January to June of one input and July to December of the other: each holds half of the year, so the year has
    // a value (the spans used to come only from periods with a value of every input, and this year had none).
    const months = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ period: `2025-${String(from + i).padStart(2, "0")}-01`, value: 1 }));
    const [a, b] = [metric({ id: 1, slug: "a" }), metric({ id: 2, slug: "b" })];
    const d = metric({ id: 3, slug: "d", formula: "{a} - {b}" });
    const built = buildSeries([a, b, d], observationsOf([a, b], [months(1, 6), months(7, 12)]));
    expect(built.d).toEqual([]);
    const r = seriesBy(d, resolverFrom([a, b, d], built), "year", { yearStart: 1, today: "2026-06-01" });
    expect(r).toMatchObject({ ok: true, points: [{ period: "2025-01-01", value: 0, held: 6, length: 12, toDate: false }] });
  });
  it("divides by an input of zero to no value, and keeps the spans around it", () => {
    const [a, b] = [metric({ id: 1, slug: "a" }), metric({ id: 2, slug: "b" })];
    const d = metric({ id: 3, slug: "d", formula: "{a} / {b}" });
    const pts = (vs: number[]) => vs.map((value, i) => ({ period: `2026-0${i + 1}-01`, value }));
    const built = buildSeries([a, b, d], observationsOf([a, b], [pts([1, 2, 3, 4, 5, 6]), pts([2, 0, 0, 0, 0, 0])]));
    expect(built.d).toEqual([{ period: "2026-01-01", value: 0.5 }]);
    const q = seriesBy(d, resolverFrom([a, b, d], built), "quarter", { yearStart: 1, today: "2027-01-01" });
    // Q1 adds b to 2; Q2 adds it to 0, and 15 / 0 is no value.
    expect(q.points.map((p) => [p.period, p.value])).toEqual([["2026-01-01", 3]]);
  });
  it("refuses inputs it cannot combine, and says why", () => {
    const m = (slug: string, over: Partial<Metric> = {}) => metric({ id: slug.length, slug, name: slug.toUpperCase(), ...over });
    const pts = [{ period: "2026-01-01", value: 1 }, { period: "2026-02-01", value: 2 }];
    const cases: [Metric[], RegExp][] = [
      [[m("a"), m("bb", { aggregation: "none" })], /BB is set to Aggregation none, so it cannot be combined into longer periods/],
      [[m("a"), m("bb", { period: "week" })], /counted by different periods/],
      [[m("a", { period: "week" }), m("bb", { period: "week" })], /counted by week, it by month/],
      [[m("a"), m("bb", { formula: "{a} * 2" })], /BB is a Derived Metric itself/],
    ];
    for (const [ins, why] of cases) {
      const d = m("derived", { formula: "{a} / {bb}" });
      const all = [...ins, d];
      const series = Object.fromEntries(ins.map((x) => [x.slug, pts]));
      const r = seriesBy(d, resolverFrom(all, { ...series, derived: pts }), "quarter", { yearStart: 1, today: "2026-12-01" });
      expect(r, why.source).toMatchObject({ ok: false, points: [] });
      expect(!r.ok && r.reason, why.source).toMatch(why);
      expect(inputsProblem(d, ins) ?? inputsNotCombined(d, ins), why.source).toMatch(why);
      expect(checkFormula(d.formula!, ins, d), why.source).toBeTruthy();
    }
    // Its own Aggregation is not what combines it: a Derived Metric set to none still combines through its inputs.
    const d = m("derived", { formula: "{a} * 2", aggregation: "none" });
    expect(seriesBy(d, resolverFrom([m("a"), d], { a: pts, derived: pts }), "quarter", { yearStart: 1, today: "2027-01-01" })).toMatchObject({ ok: true, points: [{ value: 6 }] });
    expect(NOT_COMBINED).toMatch(/none/);
  });
  it("shows nothing, and says why, for a Derived Metric whose owner may no longer share an input (ticket #619)", () => {
    const [a, d] = [metric({ id: 1, slug: "a" }), metric({ id: 2, slug: "d", formula: "{a} * 2", inputs_withheld: true })];
    const pts = [{ period: "2026-01-01", value: 1 }, { period: "2026-02-01", value: 2 }];
    const why = "Its owner can no longer share one of the Metrics it is calculated from, so it shows no values.";
    expect(inputsProblem(d, [a])).toBe(why);
    expect(buildSeries([a, d], observationsOf([a], [pts])).d).toEqual([]);
    expect(seriesBy(d, resolverFrom([a, d], { a: pts, d: pts }), "quarter", { yearStart: 1, today: "2027-01-01" })).toMatchObject({ ok: false, reason: why });
    expect(inputsProblem({ ...d, inputs_withheld: false }, [a])).toBeNull();
  });
  it("names every input a reason is about, one or several", () => {
    const ins = asInputs(["a", "b", "c"]);
    const none = asInputs(["x", "y"], { aggregation: "none" });
    const derived = asInputs(["p", "q"], { formula: "{a} * 2" });
    expect(inputsProblem({ formula: null, period: "month" }, ins)).toBeNull();
    expect(inputsProblem({ formula: "{p} + {q}", period: "month" }, derived)).toBe("P and Q are Derived Metrics themselves: compute from the Metrics they are made of.");
    expect(inputsProblem({ formula: "{a} + {p}", period: "month" }, [...ins, ...derived])).toBe("P is a Derived Metric itself: compute from the Metrics it is made of.");
    expect(inputsNotCombined({ formula: "{x} / {y}" }, none)).toBe("Shown by its own period: X and Y are set to Aggregation none, so it cannot be combined into longer periods.");
    expect(inputsNotCombined({ formula: null }, none)).toBeNull();
    // A Derived Metric set to none is refused as derived, not as not combining.
    expect(inputsNotCombined({ formula: "{p}" }, asInputs(["p"], { formula: "{a}", aggregation: "none" }))).toBeNull();
    expect(checkFormula("{x} / {y}", none)).toBe("X and Y are set to Aggregation none: set them to sum, average or last value, so this Metric can be combined into longer periods.");
    expect(checkFormula("{x} / {a}", [...none, ...ins])).toBe("X is set to Aggregation none: set it to sum, average or last value, so this Metric can be combined into longer periods.");
  });
  it("draws no series for a Derived Metric whose inputs cannot be combined, and skips values of Metrics it does not know", () => {
    const [a, w] = [metric({ id: 1, slug: "a" }), metric({ id: 2, slug: "w", period: "week" })];
    const d = metric({ id: 3, slug: "d", formula: "{a} + {w}" });
    const obs = observationsOf([a, w, metric({ id: 9, slug: "gone" })], [[{ period: "2026-01-01", value: 1 }], [{ period: "2026-01-05", value: 2 }], [{ period: "2026-01-01", value: 3 }]]);
    expect(buildSeries([a, w, d], obs)).toEqual({ a: [{ period: "2026-01-01", value: 1 }], w: [{ period: "2026-01-05", value: 2 }], d: [] });
    // Even where a week and a month start on the same day (Monday 1 June 2026), the two do not meet.
    const same = observationsOf([a, w], [[{ period: "2026-06-01", value: 1 }], [{ period: "2026-06-01", value: 2 }]]);
    expect(buildSeries([a, w, d], same).d).toEqual([]);
  });
  it("plots each Metric's values oldest first, whatever order they were stored in, and a Derived Metric's where all inputs have one", () => {
    const [a, b] = [metric({ id: 1, slug: "a" }), metric({ id: 2, slug: "b" })];
    const d = metric({ id: 3, slug: "d", formula: "{a} + {b}" });
    const lone = metric({ id: 4, slug: "lone", formula: "{a} * {nobody}" });
    const obs = observationsOf([a, b], [
      [{ period: "2026-03-01", value: 3 }, { period: "2026-01-01", value: 1 }, { period: "2026-02-01", value: 2 }],
      [{ period: "2026-02-01", value: 20 }, { period: "2026-01-01", value: 10 }],
    ]);
    expect(buildSeries([a, b, d, lone], obs)).toEqual({
      a: [{ period: "2026-01-01", value: 1 }, { period: "2026-02-01", value: 2 }, { period: "2026-03-01", value: 3 }],
      b: [{ period: "2026-01-01", value: 10 }, { period: "2026-02-01", value: 20 }],
      d: [{ period: "2026-01-01", value: 11 }, { period: "2026-02-01", value: 22 }],
      lone: [],
    });
  });
});

// A quarterly or yearly Metric's periods start where the Fiscal Year's do: generated ones (from January) move by as
// many months as the year start does, as in the aggregation tests.
function forYear(points: Point[], period: Span, yearStart: YearStart): Point[] {
  if (period !== "quarter" && period !== "year") return points;
  return points.map((p) => ({ ...p, period: textOf(monthsLater(dayOf(p.period), yearStart - 1)) }));
}
