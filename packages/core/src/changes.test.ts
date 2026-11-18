// Changes, Attainment and judging a value against its target, against the references (spec 0022, Testing Decisions;
// GLOSSARY: Comparison, Attainment, Target Range, Unusual Value): a Comparison's difference, its percentage and
// whether it is good; Attainment by both methods; target status and health; the Unusual Value check. Each is held to
// the exact result: the double nearest to it, never a floating-point neighbour. Generated values with a fixed seed in
// `pnpm test`, more and a new seed in `test:numbers`.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { attainment, compare, resolverFrom, summary, targetGap } from "./compare";
import { changePct, difference, distancePct, percentOf } from "./exact";
import { health, targetStatus } from "./format";
import type { Polarity } from "./types";
import { unusualReasons } from "./workflow-rules";
import { metric } from "./test/fixtures";
import { referenceAttainmentExact } from "./test/reference/attainment";
import { referenceChangeOf, referenceHealth, referenceStatus, referenceUnusual } from "./test/reference/change";
import { roundingIsExact, runs, valueText } from "./test/reference/check";
import { exactOf, exactText, isNearestDouble, minus, type Exact } from "./test/reference/exact";
import { referenceChange } from "./test/reference/write";

const POLARITIES: Polarity[] = ["higher", "lower", "target"];
const { numRuns, seed } = runs();
const property = <T extends unknown[]>(p: fc.IProperty<T>) => fc.assert(p, { numRuns: numRuns * 5, seed });
const nearest = (code: number | null | undefined, exact: Exact | null, where: string) => {
  if (exact === null) expect(code ?? null, where).toBeNull();
  else expect(isNearestDouble(code!, exact), `${where}: ${code} is not the double nearest to ${exactText(exact)}`).toBe(true);
};

describe("a Comparison's change", () => {
  it("is the exact difference and percentage, and good the way the polarity likes (" + `${numRuns * 5} pairs, seed ${seed})`, () => {
    property(
      fc.property(valueText, valueText, fc.constantFrom(...POLARITIES), (a, b, polarity) => {
        const [current, previous] = [Number(a), Number(b)];
        const m = metric({ polarity, aggregation: "sum" });
        const [c] = compare(m, resolverFrom([m], { revenue: [{ period: "2026-01-01", value: previous }, { period: "2026-02-01", value: current }] }), { yearStart: 1, keys: ["prev"] });
        const ref = referenceChangeOf(exactOf(current), exactOf(previous), polarity);
        const where = `${a} against ${b}, ${polarity}`;
        expect(c.available, where).toBe(true);
        nearest(c.abs, ref.abs, `${where}: change`);
        nearest(c.pct, ref.pct, `${where}: %`);
        expect(c.good, where).toBe(ref.good);
        nearest(difference(current, previous), ref.abs, `${where}: difference()`);
        nearest(changePct(current, previous), ref.pct, `${where}: changePct()`);
      }),
    );
  });
  it("is exact where floating point is not", () => {
    // 0.3 − 0.1 in doubles is 0.19999999999999998 and 1.1 against 1 a change of 10.000000000000009 %.
    const cases: [number, number, number, number | null][] = [[0.3, 0.1, 0.2, 200], [1.1, 1, 0.1, 10], [0.7, 0.1, 0.6, 600], [-5, -10, 5, 50], [5, 0, 5, null], [0, 0, 0, null], [1e15, 999999999999999.9, 0.1, 1.0000000000000002e-14]];
    for (const [cur, prev, abs, pct] of cases) {
      expect(difference(cur, prev), `${cur} − ${prev}`).toBe(abs);
      expect(changePct(cur, prev), `${cur} against ${prev}`).toBe(pct);
    }
    // A value that is not a number has no difference or change: NaN, which shows as no value.
    expect(difference(Infinity, 1)).toBeNaN();
    expect(difference(1, NaN)).toBeNaN();
    expect(changePct(NaN, 1)).toBeNaN();
    expect(changePct(1, -Infinity)).toBeNaN();
  });
  it("is the exact difference of the spans a Comparison combines", () => {
    // Three months of 0.1 against three of 0.2, added up: −0.3 and −50 %, which doubles miss (0.30000000000000004).
    const m = metric({ aggregation: "sum", decimals: 2 });
    const points = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"].map((period, i) => ({ period, value: i < 3 ? 0.2 : 0.1 }));
    const [qoq] = compare(m, resolverFrom([m], { revenue: points }), { yearStart: 1, keys: ["qoq"] });
    expect(qoq).toMatchObject({ current: 0.3, previous: 0.6, abs: -0.3, pct: -50, good: false });
  });
});

describe("Attainment", () => {
  const bound = fc.option(valueText.map(Number), { freq: 4 });
  it(`is the exact result of either method, for every polarity, around zero too (${numRuns * 5} values, seed ${seed})`, () => {
    property(
      fc.property(valueText, bound, bound, fc.constantFrom(...POLARITIES), fc.constantFrom("ratio" as const, "distance" as const), (text, lo, hi, polarity, method) => {
        const value = Number(text);
        const m = metric({ polarity, attainment_method: method });
        const t = { min: polarity === "lower" ? null : lo, max: polarity === "higher" ? null : hi };
        if (t.min !== null && t.max !== null && t.min > t.max) return;
        nearest(attainment(m, value, t, "ratio"), referenceAttainmentExact(method, polarity, value, t.min, t.max), `${method} ${polarity} ${text} [${t.min}, ${t.max}]`);
        // The difference shown where there is no percentage: value minus the bound it is measured against.
        const gap = targetGap(m, value, t);
        const ref = polarity === "higher" ? t.min : polarity === "lower" ? t.max : t.min !== null && value < t.min ? t.min : t.max !== null && value > t.max ? t.max : undefined;
        if (ref === null || (ref === undefined && t.min === null && t.max === null)) expect(gap).toBeNull();
        else nearest(gap, ref === undefined ? exactOf(0) : minus(exactOf(value), exactOf(ref)), `gap ${polarity} ${text} [${t.min}, ${t.max}]`);
      }),
    );
  });
  it("is exact where floating point is not, and has no percentage for a value that is not a number", () => {
    expect(percentOf(0.3, 0.1)).toBe(300); // 0.3 / 0.1 * 100 is 299.99999999999994 in doubles
    expect(distancePct(0.3, 0.2, 0.2)).toBe(150); // 100 + 0.1 of 0.2
    expect(attainment(metric({ polarity: "target" }), 0.3, { min: 0.1, max: 0.2 }, "distance")).toBe(50);
    expect(attainment(metric({ polarity: "higher" }), 0.3, { min: 0.1, max: null }, "ratio")).toBe(300);
    expect(percentOf(Infinity, 1)).toBeNaN();
    expect(percentOf(1, NaN)).toBeNaN();
    expect(distancePct(1, Infinity, 1)).toBeNaN();
    expect(distancePct(1, 1, NaN)).toBeNaN();
    expect(distancePct(NaN, 1, 1)).toBeNaN();
    for (const method of ["ratio", "distance"] as const) {
      expect(attainment(metric(), NaN, { min: 1, max: null }, method)).toBeNull();
      expect(attainment(metric(), 5, { min: Infinity, max: null }, method)).toBeNull();
      expect(targetGap(metric(), Infinity, { min: 1, max: null })).toBeNull();
    }
  });
  it("calls a value on target where Attainment is 100 % or more, or the difference allows it", () => {
    const s = (over: Parameters<typeof metric>[0], value: number, method: "ratio" | "distance" = "ratio") => summary(metric(over), resolverFrom([metric(over)], { revenue: [{ period: "2026-01-01", value }] }), [], { yearStart: 1, attainmentMethod: method }).onTarget;
    expect(s({ target_min: 0.3 }, 0.3)).toBe(true);
    expect(s({ target_min: 0.3 }, 0.29)).toBe(false);
    expect(s({ target_min: 0 }, 0)).toBe(true); // no percentage against 0: the difference, 0, is on target
    expect(s({ target_min: 0 }, -0.1)).toBe(false);
    expect(s({ polarity: "lower", target_min: null, target_max: 0 }, 0.1)).toBe(false);
    expect(s({ polarity: "lower", target_min: null, target_max: 0 }, 0)).toBe(true);
    expect(s({ polarity: "target", target_min: -1, target_max: 0 }, 0)).toBe(true);
    expect(s({ polarity: "target", target_min: 0, target_max: 0 }, 0.1, "distance")).toBe(false);
    expect(s({ polarity: "target", target_min: 0, target_max: 0 }, 0, "distance")).toBe(true);
    expect(s({ target_min: null }, 5)).toBeNull();
  });
});

describe("target status and health", () => {
  const bound = fc.option(valueText.map(Number), { freq: 3 });
  it(`say where a value sits against its Target Range, exactly at the bounds too (${numRuns * 5} values, seed ${seed})`, () => {
    property(
      fc.property(fc.oneof(valueText.map(Number), fc.constantFrom(NaN, Infinity, -Infinity, null, undefined)), bound, bound, fc.boolean(), (value, lo, hi, asText) => {
        // A bound as the database sends it (a number) or as a form keeps it (text): the same result.
        const m = { target_min: lo === null ? null : asText ? (String(lo) as unknown as number) : lo, target_max: hi === null ? null : asText ? (String(hi) as unknown as number) : hi };
        const where = `${value} [${lo}, ${hi}]`;
        expect(targetStatus(m, value), where).toBe(referenceStatus(value, lo, hi));
        expect(health(m, value), where).toBe(referenceHealth(value, lo, hi));
      }),
    );
  });
  it("count a value on a bound as on target", () => {
    for (const v of [-0.5, 0, 0.1, 1e15]) {
      expect(targetStatus({ target_min: v, target_max: v }, v)).toBe("on");
      expect(health({ target_min: v, target_max: null }, v)).toBe("good");
      expect(health({ target_min: null, target_max: v }, v)).toBe("good");
    }
  });
});

describe("the Unusual Value check", () => {
  // A change is written from the exact one where a double carries it (15 significant digits); beyond, from the double
  // nearest to it, which is all a JavaScript number can be.
  const shown = (pct: Exact, value: number, previous: number): Exact | number => {
    if (roundingIsExact(pct)) return pct;
    const code = Math.abs(changePct(value, previous)!);
    expect(isNearestDouble(code, pct)).toBe(true);
    return code;
  };
  const step = fc.record({ changePct: fc.constantFrom(0, 5, 10, 12.5, 50, 100, 200), outsideTarget: fc.boolean() });
  const target = fc.option(fc.record({ min: fc.option(valueText.map(Number)), max: fc.option(valueText.map(Number)) }));
  it(`flags exactly what the rule says, with the change written as the Comparison writes it (${numRuns * 5} values, seed ${seed})`, () => {
    property(
      fc.property(valueText, fc.option(valueText), step, target, (v, p, s, t) => {
        const value = Number(v);
        const previous = p === null ? undefined : Number(p);
        const m = metric();
        const got = unusualReasons(m, value, previous, previous === undefined ? undefined : "2026-01-01", { type: "check", ...s }, 1, "1,234.5", t ?? undefined);
        const want = referenceUnusual(value, previous, s, t ?? undefined).map((r) =>
          r.kind === "change" ? `${r.up ? "up" : "down"} ${referenceChange(shown(r.pct, value, previous!), "1,234.5", false)} on January 2026` : r.kind === "from0" ? `${r.up ? "up" : "down"} from 0 on January 2026` : `${r.kind} target`,
        );
        expect(got, `${v} after ${p}, step ${JSON.stringify(s)}, target ${JSON.stringify(t)}`).toEqual(want);
      }),
    );
  });
  it("never calls an unchanged value unusual, even for a step below 0 %", () => {
    // Workflows are saved with a step of 1 % to 1,000 %; the check does not rely on that.
    for (const changePct of [-5, 0]) {
      const check = { type: "check" as const, changePct, outsideTarget: false };
      expect(unusualReasons(metric(), 1, 1, "2026-01-01", check, 1, "1,234.5"), String(changePct)).toEqual([]);
      expect(unusualReasons(metric(), 1.5, 1, "2026-01-01", check, 1, "1,234.5"), String(changePct)).toEqual(["up 50.0 % on January 2026"]);
    }
  });
  it("does not flag a change of exactly the step", () => {
    const check = { type: "check" as const, changePct: 10, outsideTarget: false };
    // 1.1 after 1 is exactly 10 %: doubles made it 10.000000000000009 %, and flagged it.
    expect(unusualReasons(metric(), 1.1, 1, "2026-01-01", check, 1, "1,234.5")).toEqual([]);
    expect(unusualReasons(metric(), 0.9, 1, "2026-01-01", check, 1, "1,234.5")).toEqual([]);
    expect(unusualReasons(metric(), 1.100001, 1, "2026-01-01", check, 1, "1,234.5")).toEqual(["up 10.0 % on January 2026"]);
    expect(unusualReasons(metric(), 5, 1, undefined, check, 1, "1,234.5")).toEqual(["up 400.0 % on the period before"]);
  });
});
