// The what-if chain against its reference and the outside world (spec 0041, ticket 5; spec 0022 for the method): the change in each Metric
// reached equals the reference's exact sum over the paths (the double nearest to it), the ranges equal the reference's corners of the
// effects' ranges to 1e-9 and NumPy's and SciPy's fixtures, a chain of one step is the fit's own effect times the change and `predict`'s
// difference, an exact link is a Derived Metric's formula worked out on fractions, the limits (2 steps, 12 Metrics, 120 links) one step
// either side, hostile input, order independence, scaling, and the coverage of the stated range on simulated data: a range that is
// "likely between" holds the true effect at least four times in five, for one link and for a chain, without assuming the links'
// errors are independent. Generated with a fixed seed in `pnpm test`, more and a new seed in `test:numbers`.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluateRange } from "../formula";
import { fit, predict, type Fit } from "./fit";
import { fractionOf } from "../exact";
import { MOST_LINKS, MOST_METRICS, MOST_STEPS, planOf, whatIf, type FitLink, type WhatIfInput, type WhatIfLink, type WorkedLink } from "./what-if";
import { dayOf, monthsLater, textOf } from "../test/reference/calendar";
import { runs } from "../test/reference/check";
import { exactOf, isNearestDouble, minus as minusExact } from "../test/reference/exact";
import { referenceEvaluate } from "../test/reference/formula";
import { referenceWhatIf, type ReferenceLink } from "../test/reference/what-if";
import type { ReferenceRow } from "../test/reference/fit";
import type { Finding } from "../suitability";
import type { Point } from "../types";

const { numRuns, seed } = runs();
const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/what-if.json", import.meta.url), "utf8"));
const month = (i: number) => textOf(monthsLater(dayOf("2024-01-01"), i));
const pts = (vs: number[]): Point[] => vs.map((value, i) => ({ period: month(i), value }));
const close = (a: number, b: number, tol = 1e-9, floor = 1e-9) => Math.abs(a - b) <= tol * Math.max(Math.abs(b), floor);

/** A pseudo-random generator from a seed, and normal noise from it. */
function lcg(start: number) {
  let x = start;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const tenths = (v: number) => Math.round(v * 10) / 10;

/** Four Metrics in a chain, as the fixture builds them: A drives B, B and A drive C, C drives D (flat levels, compared by value). */
function world(seedValue: number, n: number, noise = 1) {
  const r = lcg(seedValue);
  const a = Array.from({ length: n }, () => tenths(20 + r() * 60));
  const b = a.map((v) => tenths(3 * v + gauss(r) * 45 * noise));
  const c = b.map((v, i) => tenths(2 * v + 0.5 * a[i] + gauss(r) * 24 * noise));
  const d = c.map((v) => tenths(-1.5 * v + gauss(r) * 40 * noise));
  return { a, b, c, d };
}
const link = (target: string, y: number[], drivers: { name: string; x: number[] }[]): FitLink => {
  const f = fit({ target: { name: target, points: pts(y) }, drivers: drivers.map((d) => ({ name: d.name, points: pts(d.x) })), span: "month", basis: "values" });
  if (!f.ok) throw new Error(`refused: ${JSON.stringify(f.refusals)}`);
  return { kind: "fit", fit: f };
};
const refRows = (y: number[], xs: number[][]): ReferenceRow[] => y.map((v, i) => ({ y: exactOf(v), x: xs.map((x) => exactOf(x[i])) }));
const reachedOf = (r: ReturnType<typeof whatIf>) => {
  if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.refusals)}`);
  return r.reached.map((x) => {
    if (!x.ok) throw new Error(`not reached: ${JSON.stringify(x)}`);
    return x;
  });
};
const run = (links: WhatIfLink[], by: number, latest = 50, name = "A") => whatIf({ start: { name, latest }, change: { by }, links });
const refused = (r: ReturnType<typeof whatIf>) => {
  if (r.ok) throw new Error("not refused");
  return r.refusals;
};

describe("the fixture", () => {
  it("was made by the current script (what-if.py), and names the tools", () => {
    const script = readFileSync(new URL("../test/reference/fixtures/what-if.py", import.meta.url));
    expect(fixture.script, "run python3 packages/core/src/test/reference/fixtures/what-if.py again").toBe(createHash("sha256").update(script).digest("hex"));
    expect(fixture.version).toBe(1);
    expect(Object.keys(fixture.tools)).toEqual(["numpy", "scipy"]);
  });
});

describe("the fixtures of NumPy and SciPy", () => {
  for (const f of fixture.cases) {
    const [fb, fc, fca] = [link("B", f.b, [{ name: "A", x: f.a }]), link("C", f.c, [{ name: "B", x: f.b }]), link("C", f.c, [{ name: "A", x: f.a }, { name: "B", x: f.b }])];
    it(`seed ${f.seed}, ${f.n} periods: one step, and two steps, equal NumPy's effects and SciPy's t points, to a relative 1e-9`, () => {
      const one = reachedOf(run([fb], f.x))[0];
      expect(one.step).toBe(1);
      expect(close(one.effect, f.one.effect), `${one.effect} vs ${f.one.effect}`).toBe(true);
      expect(close(one.lo!, f.one.lo, 1e-9, 1e-6) && close(one.hi!, f.one.hi, 1e-9, 1e-6), `${one.lo} ${one.hi} vs ${f.one.lo} ${f.one.hi}`).toBe(true);
      const [b, c] = reachedOf(run([fb, fc], f.x));
      expect([b.name, b.step, c.name, c.step]).toEqual(["B", 1, "C", 2]);
      expect(close(c.effect, f.two.effect, 1e-9, 1e-6)).toBe(true);
      expect(close(c.lo!, f.two.lo, 1e-9, 1e-6) && close(c.hi!, f.two.hi, 1e-9, 1e-6), `${c.lo} ${c.hi} vs ${f.two.lo} ${f.two.hi}`).toBe(true);
      expect([c.coefficients, c.level]).toEqual([2, 0.95]);
      // B's own range does not widen for C resting on two effects: it rests on one.
      expect(b.coefficients).toBe(1);
      expect(close(b.lo!, f.one.lo, 1e-9, 1e-6)).toBe(true);
    });
    it(`seed ${f.seed}: C reached directly and through B is the sum of both paths, each effect cut at the share 1 − 1 ÷ 30 of the t curve`, () => {
      const [b, c] = reachedOf(run([fb, fca], f.x));
      expect(b.name).toBe("B");
      expect(c.step).toBe(2);
      expect(c.coefficients).toBe(3);
      expect(c.level).toBeCloseTo(1 - 0.1 / 3, 15);
      expect(close(c.effect, f.paths.effect, 1e-9, 1e-6)).toBe(true);
      expect(close(c.lo!, f.paths.lo, 1e-9, 1e-6) && close(c.hi!, f.paths.hi, 1e-9, 1e-6), `${c.lo} ${c.hi} vs ${f.paths.lo} ${f.paths.hi}`).toBe(true);
    });
    it(`seed ${f.seed}: a third step is refused in words, not cut short: D, which C drives, would be 3 steps from A`, () => {
      expect(refused(run([fb, fc, link("D", f.d, [{ name: "C", x: f.c }])], f.x))).toEqual([{ case: "refuse-what-if-deep", slots: { most: 2, name: "D" } }]);
      expect(MOST_STEPS).toBe(2);
    });
  }
});

describe("a hand-worked chain", () => {
  // B = 2A + 1 and C = 3B − 4 exactly: every effect is exact, there are no misses, so a change of 1.5 in A is 3 in B and 9 in C, with no width.
  const a = [1, 3, 2, 5, 4, 9, 6, 8, 12, 10, 11, 14, 13, 7];
  const b = a.map((v) => 2 * v + 1);
  const c = b.map((v) => 3 * v - 4);
  const links = [link("B", b, [{ name: "A", x: a }]), link("C", c, [{ name: "B", x: b }])];
  it("gives 3 in B and 9 in C, exactly, and ranges of no width", () => {
    const [rb, rc] = reachedOf(run(links, 1.5, 7));
    expect([rb.effect, rb.lo, rb.hi]).toEqual([3, 3, 3]);
    expect([rc.effect, rc.lo, rc.hi]).toEqual([9, 9, 9]);
    expect([rb.exact, rc.exact]).toEqual([false, false]);
  });
  it("a percent is a part of the latest value: 10 % of 7 is 0.7, and a fall is a negative change", () => {
    const r = whatIf({ start: { name: "A", latest: 7 }, change: { percent: 10 }, links });
    if (!r.ok) throw new Error("refused");
    expect(r.by).toBe(0.7);
    expect(reachedOf(r).map((x) => x.effect)).toEqual([1.4, 4.2]);
    const down = whatIf({ start: { name: "A", latest: 7 }, change: { percent: -50 }, links });
    expect(reachedOf(down).map((x) => x.effect)).toEqual([-7, -21]);
  });
});


describe("the worked example of docs/guides/methods.md", () => {
  // A is 1 to 12 in this order; B = 3A + a miss and C = 2B + a miss. A rises by 2, from its latest value of 7.
  const order = [7, 2, 10, 0, 5, 11, 1, 8, 4, 9, 3, 6];
  const A = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const B = [4, 5, 9, 14, 13, 19, 20, 24, 28, 29, 35, 34];
  const C = [10, 10, 16, 29, 25, 38, 42, 46, 57, 57, 70, 70];
  const [a, b, c] = [A, B, C].map((s) => order.map((i) => s[i]));
  it("is 5.90 in B, likely between 5.56 and 6.24, and 11.86 in C, likely between 10.53 and 13.25: the effects 422/143 and 2545/1267, exactly", () => {
    const [rb, rc] = reachedOf(run([link("B", b, [{ name: "A", x: a }]), link("C", c, [{ name: "B", x: b }])], 2, 7));
    expect(a[a.length - 1]).toBe(7);
    expect(isNearestDouble(rb.effect, { num: 2n * 422n, den: 143n })).toBe(true);
    expect(isNearestDouble(rc.effect, { num: 2n * 422n * 2545n, den: 143n * 1267n })).toBe(true);
    expect([rb.lo!, rb.hi!, rc.lo!, rc.hi!].map((v) => Math.round(v * 100) / 100)).toEqual([5.56, 6.24, 10.53, 13.25]);
    expect([rb.coefficients, rc.coefficients, rc.level]).toEqual([1, 2, 0.95]);
  });
});

describe("a chain of one step is the fit's own effect times the change, and the difference `predict` gives", () => {
  const w = world(3, 30);
  const l = link("B", w.b, [{ name: "A", x: w.a }]);
  it("is exactly the fit's effect times the change and its range, and is predict's value at the changed driver less its value at the latest", () => {
    for (const x of [1, -3.5, 0.2]) {
      const [r] = reachedOf(run([l], x, w.a[w.a.length - 1]));
      const d = l.fit.drivers[0];
      expect(close(r.effect, d.effect * x, 1e-12)).toBe(true);
      expect(close(r.lo!, Math.min(d.lo * x, d.hi * x), 1e-12)).toBe(true);
      expect(close(r.hi!, Math.max(d.lo * x, d.hi * x), 1e-12)).toBe(true);
      const latest = w.a[w.a.length - 1];
      const [p1, p0] = [predict(l.fit, [latest + x]), predict(l.fit, [latest])];
      if (!p1.ok || !p0.ok) throw new Error("refused");
      expect(close(r.effect, p1.value - p0.value, 1e-9, 1e-9)).toBe(true);
    }
  });
});

describe("the reference", () => {
  const w = world(9, 24);
  const [lb, lc, lca] = [link("B", w.b, [{ name: "A", x: w.a }]), link("C", w.c, [{ name: "B", x: w.b }]), link("C", w.c, [{ name: "A", x: w.a }, { name: "B", x: w.b }])];
  const ref = (which: "chain" | "paths", x: number) => {
    const links: ReferenceLink[] = [{ kind: "fit", target: "B", drivers: ["A"], rows: refRows(w.b, [w.a]) }, which === "chain" ? { kind: "fit", target: "C", drivers: ["B"], rows: refRows(w.c, [w.b]) } : { kind: "fit", target: "C", drivers: ["A", "B"], rows: refRows(w.c, [w.a, w.b]) }];
    return referenceWhatIf(links, "A", exactOf(x));
  };
  it("is itself right: a chain of one is the fit's effect times the change, by hand on exact data", () => {
    const a = [1, 3, 2, 7, 5, 4, 9, 6, 8, 12, 10, 11, 14];
    const rows = refRows(a.map((v) => 2 * v + 1), [a]);
    const [r] = referenceWhatIf([{ kind: "fit", target: "B", drivers: ["A"], rows }], "A", exactOf("1.5"));
    expect(r).toMatchObject({ name: "B", step: 1, m: 1, level: 0.9 });
    expect(r.effect).toEqual(exactOf(3));
    expect([r.lo, r.hi]).toEqual([exactOf(3), exactOf(3)]);
  });
  for (const which of ["chain", "paths"] as const) {
    it(`gives the Method's effect as the double nearest to the exact sum over the paths, and the ranges to 1e-9 (${which})`, () => {
      const rs = reachedOf(run(which === "chain" ? [lb, lc] : [lb, lca], 4.5));
      const refs = ref(which, 4.5);
      expect(rs.map((r) => r.name)).toEqual(refs.map((r) => r.name));
      rs.forEach((r, i) => {
        expect(isNearestDouble(r.effect, refs[i].effect), `${r.name} ${r.effect}`).toBe(true);
        expect(r.coefficients).toBe(refs[i].m);
        const [lo, hi] = [Number(refs[i].lo.num) / Number(refs[i].lo.den), Number(refs[i].hi.num) / Number(refs[i].hi.den)];
        expect(close(r.lo!, lo, 1e-9, 1e-6), `${r.name} lo ${r.lo} vs ${lo}`).toBe(true);
        expect(close(r.hi!, hi, 1e-9, 1e-6), `${r.name} hi ${r.hi} vs ${hi}`).toBe(true);
      });
    });
  }
  it(`agrees over generated worlds, and its effect is exactly the double nearest (${numRuns} worlds, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), fc.integer({ min: 18, max: 40 }), fc.double({ min: -20, max: 20, noNaN: true }).filter((x) => Math.abs(x) > 0.01), (s, n, x) => {
        const v = world(s, n);
        const links = [link("B", v.b, [{ name: "A", x: v.a }]), link("C", v.c, [{ name: "A", x: v.a }, { name: "B", x: v.b }])];
        const refs = referenceWhatIf([{ kind: "fit", target: "B", drivers: ["A"], rows: refRows(v.b, [v.a]) }, { kind: "fit", target: "C", drivers: ["A", "B"], rows: refRows(v.c, [v.a, v.b]) }], "A", exactOf(x));
        const res = run(links, x, v.a[v.a.length - 1]);
        if (!res.ok) throw new Error("refused");
        res.reached.forEach((r, i) => {
          // A link that looks curved gives nothing outside what was seen, and a big change in A is outside (that is said, not worked out).
          if (!r.ok) return expect(r.refusal.case).toBe("refuse-curved-outside");
          expect(isNearestDouble(r.effect, refs[i].effect)).toBe(true);
          if (r.lo !== null) {
            const [lo, hi] = [Number(refs[i].lo.num) / Number(refs[i].lo.den), Number(refs[i].hi.num) / Number(refs[i].hi.den)];
            expect(close(r.lo, lo, 1e-9, 1e-6) && close(r.hi!, hi, 1e-9, 1e-6), `${r.name} ${r.lo} ${r.hi} vs ${lo} ${hi}`).toBe(true);
          }
        });
      }),
      { numRuns: Math.min(numRuns, 60), seed },
    );
  });
});

describe("an exact link: a Derived Metric's formula, worked out", () => {
  const worked = (over: Partial<WorkedLink> = {}): WorkedLink => ({ kind: "worked", target: "Revenue per visit", formula: "{revenue} / {visits}", names: { revenue: "Revenue", visits: "Visits" }, levels: { Revenue: 120000, Visits: 40000 }, ...over });
  it("is f(after) − f(before) exactly: 10 % more Visits on 40,000 changes 3 € per visit by 3 ÷ 1.1 − 3", () => {
    const r = whatIf({ start: { name: "Visits", latest: 40000 }, change: { percent: 10 }, links: [worked()] });
    const [x] = reachedOf(r);
    // 120000 / 44000 − 120000 / 40000 = 30/11 − 3 = −3/11.
    expect(x.exact).toBe(true);
    expect([x.lo, x.hi, x.coefficients, x.level, x.strength, x.outside, x.through]).toEqual([null, null, 0, 0, null, [], []]);
    expect(isNearestDouble(x.effect, minusExact(referenceEvaluate("{revenue} / {visits}", { revenue: exactOf(120000), visits: exactOf(44000) })!, exactOf(3)))).toBe(true);
    expect(x.effect).toBe(-3 / 11);
  });
  it("is exact however awkward the numbers: 0.3 − 0.1 is 0.2 (a double sum would not be), and a change in an input it does not read is none", () => {
    const [x] = reachedOf(whatIf({ start: { name: "A", latest: 0.1 }, change: { by: 0.2 }, links: [{ kind: "worked", target: "S", formula: "{a} + {b}", names: { a: "A", b: "B" }, levels: { A: 0.1, B: 0.2 } }] }));
    expect(x.effect).toBe(0.2);
    expect(isNearestDouble(x.effect, exactOf("0.2"))).toBe(true);
  });
  it("matches the reference formula evaluator on generated formulas of one use of each Metric", () => {
    const formulas = ["{a} * {b}", "{a} / {b}", "({a} - {b}) / {b} * 100", "{a} + {b} * 2", "{b} / ({a} + 1)"];
    fc.assert(
      fc.property(fc.constantFrom(...formulas), fc.integer({ min: 1, max: 5_000 }), fc.integer({ min: 1, max: 5_000 }), fc.integer({ min: -400, max: 400 }), (formula, a, b, by) => {
        fc.pre(by !== 0 && a + by > -1 && a + by !== 0);
        const r = whatIf({ start: { name: "A", latest: a }, change: { by }, links: [{ kind: "worked", target: "T", formula, names: { a: "A", b: "B" }, levels: { A: a, B: b } }] });
        if (!r.ok) throw new Error(JSON.stringify(r.refusals));
        const x = r.reached[0];
        if (!x.ok) throw new Error("not reached");
        const f = (v: number) => referenceEvaluate(formula, { a: exactOf(v), b: exactOf(b) })!;
        expect(isNearestDouble(x.effect, minusExact(f(a + by), f(a)))).toBe(true);
      }),
      { numRuns, seed },
    );
  });
  it("says in words that a formula gives no value for the change (a division by 0), and for one that cannot be read", () => {
    const zero = whatIf({ start: { name: "Visits", latest: 40000 }, change: { by: -40000 }, links: [worked()] });
    const [x] = zero.ok ? zero.reached : [];
    expect(x).toEqual({ ok: false, name: "Revenue per visit", step: 1, refusal: { case: "refuse-what-if-formula", slots: { name: "Revenue per visit" } } });
    const unreadable = whatIf({ start: { name: "Visits", latest: 1 }, change: { by: 1 }, links: [worked({ formula: "{revenue} /" })] });
    expect(unreadable.ok && unreadable.reached[0].ok).toBe(false);
  });
  it("after an estimated link: the formula is worked out on the range of the change, and the Metric rests on that one estimated effect", () => {
    // B moves with A (estimated); S = B ÷ X with X fixed at 4: its change is the change in B ÷ 4, range and all.
    const w = world(5, 24);
    const lb = link("B", w.b, [{ name: "A", x: w.a }]);
    const s: WorkedLink = { kind: "worked", target: "S", formula: "{b} / {x}", names: { b: "B", x: "X" }, levels: { B: 100, X: 4 } };
    const [rb, rs] = reachedOf(run([lb, s], 5, 50));
    expect(rs.step).toBe(2);
    expect([rs.exact, rs.coefficients, rs.level, rs.through]).toEqual([false, 1, 0.9, ["B"]]);
    expect(close(rs.effect, rb.effect / 4, 1e-12)).toBe(true);
    expect(close(rs.lo!, rb.lo! / 4, 1e-12) && close(rs.hi!, rb.hi! / 4, 1e-12)).toBe(true);
    const refs = referenceWhatIf([{ kind: "fit", target: "B", drivers: ["A"], rows: refRows(w.b, [w.a]) }, { kind: "worked", target: "S", formula: "{b} / {x}", names: { b: "B", x: "X" }, levels: { B: exactOf(100), X: exactOf(4) } }], "A", exactOf(5));
    expect(isNearestDouble(rs.effect, refs[1].effect)).toBe(true);
    expect(close(rs.lo!, Number(refs[1].lo.num) / Number(refs[1].lo.den), 1e-9, 1e-6)).toBe(true);
  });
  it("before an estimated link: the change is exact and the next link is the fit's effect with its own range at the level of one effect", () => {
    const w = world(5, 24);
    const lc = link("C", w.c, [{ name: "D0", x: w.b }]);
    const d: WorkedLink = { kind: "worked", target: "D0", formula: "{a} * 2 + {k}", names: { a: "A", k: "K" }, levels: { A: 50, K: 7 } };
    const [rd, rc] = reachedOf(run([d, lc], 5, 50));
    expect([rd.exact, rd.effect, rd.name, rd.step]).toEqual([true, 10, "D0", 1]);
    expect([rc.exact, rc.coefficients, rc.level, rc.through]).toEqual([false, 1, 0.9, ["D0"]]);
    const e = lc.fit.drivers[0];
    expect(close(rc.effect, e.effect * 10, 1e-12) && close(rc.lo!, Math.min(e.lo * 10, e.hi * 10), 1e-12)).toBe(true);
  });
});


describe("a formula worked out on ranges (the part of a what-if that follows an estimated link)", () => {
  const f = (n: number | string) => exactOf(n);
  const range = (formula: string, vars: Record<string, [number | string, number | string]>) => {
    const r = evaluateRange(formula, Object.fromEntries(Object.entries(vars).map(([k, [lo, hi]]) => [k, { lo: fractionOf(Number(lo)), hi: fractionOf(Number(hi)) }])));
    return r && { lo: r.lo.num * 1000n / r.lo.den, hi: r.hi.num * 1000n / r.hi.den };
  };
  it("gives, for each operator, the lowest and highest result: a sum, a difference, a product of ranges either side of 0, a negation and a quotient", () => {
    expect(range("{a} + {b}", { a: [1, 2], b: [10, 20] })).toEqual({ lo: 11000n, hi: 22000n });
    expect(range("{a} - {b}", { a: [1, 2], b: [10, 20] })).toEqual({ lo: -19000n, hi: -8000n });
    expect(range("{a} * {b}", { a: [-2, 3], b: [-5, 4] })).toEqual({ lo: -15000n, hi: 12000n });
    expect(range("{a} * {b}", { a: [2, 3], b: [4, 5] })).toEqual({ lo: 8000n, hi: 15000n });
    expect(range("-{a}", { a: [-2, 3] })).toEqual({ lo: -3000n, hi: 2000n });
    expect(range("{a} / {b}", { a: [2, 6], b: [2, 4] })).toEqual({ lo: 500n, hi: 3000n });
    expect(range("{a} / {b}", { a: [2, 6], b: [-4, -2] })).toEqual({ lo: -3000n, hi: -500n });
    expect(range("12 / (3 + {a}) * 0.5", { a: [1, 3] })).toEqual({ lo: 1000n, hi: 1500n });
  });
  it("is the formula's own value for a range of no width, and for a Metric named twice holds every result (never less)", () => {
    expect(range("({a} - {b}) / {b} * 100", { a: [120, 120], b: [100, 100] })).toEqual({ lo: 20000n, hi: 20000n });
    const twice = range("{a} * {a}", { a: [-2, 3] })!;
    expect(twice.lo <= 0n && twice.hi >= 9000n).toBe(true);
  });
  it("has no range where a division is by a range that holds or touches 0, an input has none, the formula reaches back or cannot be read, or the numbers pass 8,192 bits", () => {
    for (const b of [[-1, 1], [0, 1], [-1, 0], [0, 0]] as [number, number][]) expect(range("{a} / {b}", { a: [1, 2], b })).toBeNull();
    expect(range("{a} + {b}", { a: [1, 2] })).toBeNull();
    expect(range("{a} + prev({a})", { a: [1, 2] })).toBeNull();
    // Only the ranges given count: a Metric named like something every object has is no range.
    expect(range("{constructor} + 1", { a: [1, 2] })).toBeNull();
    expect(range("{a} +", { a: [1, 2] })).toBeNull();
    const big = Array.from({ length: 9 }, () => "{a}").join(" * ");
    expect(range(big, { a: [1e308, 1e308] })).toBeNull();
    expect(range(Array.from({ length: 7 }, () => "{a}").join(" * "), { a: [1e308, 1e308] })).not.toBeNull();
  });
  it(`equals the corners of the ranges, by the reference formula evaluator, for formulas that name each Metric once (${numRuns} generated)`, () => {
    const formulas = ["{a} * {b}", "{a} / {b}", "({a} - 7) / {b} * 100", "{a} + {b} * 2", "{b} / ({a} + 100)"];
    fc.assert(
      fc.property(fc.constantFrom(...formulas), fc.integer({ min: -50, max: 50 }), fc.integer({ min: 0, max: 40 }), fc.integer({ min: 1, max: 80 }), fc.integer({ min: 0, max: 40 }), (formula, alo, aw, blo, bw) => {
        const [a, b] = [[alo, alo + aw], [blo, blo + bw]];
        const got = evaluateRange(formula, { a: { lo: fractionOf(a[0]), hi: fractionOf(a[1]) }, b: { lo: fractionOf(b[0]), hi: fractionOf(b[1]) } });
        const corners = a.flatMap((x) => b.map((y) => referenceEvaluate(formula, { a: f(x), b: f(y) })));
        if (corners.some((c) => c === null)) return expect(got).toBeNull();
        const values = corners as NonNullable<(typeof corners)[number]>[];
        const [lo, hi] = [values.reduce((m, v) => (v.num * m.den < m.num * v.den ? v : m)), values.reduce((m, v) => (v.num * m.den > m.num * v.den ? v : m))];
        expect(got).not.toBeNull();
        expect(got!.lo.num * lo.den).toBe(lo.num * got!.lo.den);
        expect(got!.hi.num * hi.den).toBe(hi.num * got!.hi.den);
      }),
      { numRuns, seed },
    );
  });
});

describe("the strength, cautions and what was seen", () => {
  const w = world(3, 30);
  const lb = link("B", w.b, [{ name: "A", x: w.a }]);
  it("is the weakest link's word, and a chain is never strong with a caution carried", () => {
    const lc = link("C", w.c, [{ name: "B", x: w.b }]);
    const [b, c] = reachedOf(run([lb, lc], 3));
    expect(b.strength).toBe(lb.fit.drivers[0].strength);
    expect(c.strength).not.toBeNull();
    const weak = { ...lb, fit: { ...lb.fit, verdict: { refusals: [], switches: [], cautions: [{ case: "caution-spread" as const, slots: {} }] } } };
    const [capped] = reachedOf(run([weak], 3));
    expect(capped.verdict.cautions).toEqual([{ case: "caution-spread", slots: {} }]);
    expect(capped.strength).not.toBe("strong");
  });
  it("carries the lines of the fits that hold for a what-if (gaps, curve, spread, crowded) and not the others, each once", () => {
    const f = lb.fit;
    const cautions: Finding[] = [{ case: "caution-skew", slots: { name: "A" } }, { case: "caution-spread", slots: {} }, { case: "caution-spread", slots: {} }];
    const [r] = reachedOf(run([{ kind: "fit", fit: { ...f, verdict: { refusals: [], switches: [], cautions } } }], 3));
    expect(r.verdict.cautions).toEqual([{ case: "caution-spread", slots: {} }]);
  });
  it("gives only the point, and names what was outside, where the driver would be higher or lower than it has ever been", () => {
    const high = Math.max(...w.a);
    const [r] = reachedOf(run([lb], 100, high));
    expect([r.lo, r.hi]).toEqual([null, null]);
    expect(r.outside).toEqual([{ name: "A", side: "above", limit: high, change: false }]);
    expect(r.effect).toBeCloseTo(lb.fit.drivers[0].effect * 100, 6);
    const [down] = reachedOf(run([lb], -100, Math.min(...w.a)));
    expect(down.outside[0]).toMatchObject({ side: "below", limit: Math.min(...w.a) });
    const [inside] = reachedOf(run([lb], 1, Math.min(...w.a) + 1));
    expect(inside.outside).toEqual([]);
    expect(inside.lo).not.toBeNull();
  });
  it("the edge of what was seen is inside: a driver exactly at its highest has been there", () => {
    const high = Math.max(...w.a);
    const latest = lb.fit.last.x[0];
    const [r] = reachedOf(run([lb], high - latest, latest));
    expect(r.outside).toEqual([]);
    const [over] = reachedOf(run([lb], high - latest + 0.1, latest));
    expect(over.outside).toHaveLength(1);
  });
  it("refuses, for that Metric only, where the link looks curved and the value is outside what was seen, and carries the caution inside", () => {
    const a = Array.from({ length: 24 }, (_, i) => i + 1);
    const curved = link("B", a.map((v) => v * v), [{ name: "A", x: a }]);
    expect(curved.fit.verdict.cautions.map((c) => c.case)).toContain("caution-curved");
    const outside = whatIf({ start: { name: "A", latest: 24 }, change: { by: 30 }, links: [curved, link("Z", a.map((v) => 5 * v + (v % 3)), [{ name: "A", x: a }])] });
    if (!outside.ok) throw new Error("refused");
    expect(outside.reached.find((r) => r.name === "B")).toEqual({ ok: false, name: "B", step: 1, refusal: { case: "refuse-curved-outside", slots: { name: "A" } } });
    expect(outside.reached.find((r) => r.name === "Z")!.ok).toBe(true);
    const [inside] = reachedOf(run([curved], -2, 24));
    expect(inside.verdict.cautions.map((c) => c.case)).toContain("caution-curved");
  });
  it("counts a driver compared by change against the changes it has had, and says the change is from the latest level", () => {
    const r = lcg(4);
    const a = Array.from({ length: 30 }, (_, t) => tenths(100 + 6 * t + gauss(r) * 3));
    const b = a.map((v, t) => tenths(2 * v + 4 * t + gauss(r) * 5));
    const f = fit({ target: { name: "B", points: pts(b) }, drivers: [{ name: "A", points: pts(a) }], span: "month" });
    if (!f.ok) throw new Error(JSON.stringify(f.refusals));
    expect(f.basis).toBe("changes");
    const [small] = reachedOf(run([{ kind: "fit", fit: f }], 1, a[a.length - 1]));
    expect(small.byChange).toBe(true);
    expect(small.outside).toEqual([]);
    const [big] = reachedOf(run([{ kind: "fit", fit: f }], 500, a[a.length - 1]));
    expect(big.outside).toEqual([{ name: "A", side: "above", limit: f.drivers[0].high, change: true }]);
    expect(big.lo).toBeNull();
  });
});

describe("the limits", () => {
  const w = world(3, 30);
  const mk = (names: string[], drivers: (i: number) => string[]) =>
    names.map((n, i) => link(n, w.b.map((v, t) => tenths(v + i * 3 + ((t * 7 + i) % 5))), drivers(i).map((d) => ({ name: d, x: w.a.map((v, t) => tenths(v * (d === "A" ? 1 : 2) + ((t * 3 + d.length) % 7))) }))));
  it("follows at most 12 Metrics, the one changed included: 11 reached is worked out, 12 is refused in words", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `M${i + 1}`);
    const eleven = run(mk(names(11), () => ["A"]), 1, 50);
    expect(eleven.ok && eleven.reached).toHaveLength(11);
    const twelve = run(mk(names(12), () => ["A"]), 1, 50);
    expect(refused(twelve)).toEqual([{ case: "refuse-what-if-many", slots: { n: 13, most: 12 } }]);
    expect(MOST_METRICS).toBe(12);
  });
  it("looks through at most 120 links: 120 is read, 121 is refused in words, and a link that moves nothing is not a Metric reached", () => {
    const base = mk(["M1"], () => ["A"])[0];
    const other = (i: number): WhatIfLink => ({ kind: "worked", target: `T${i}`, formula: "{x} + 1", names: { x: "X" }, levels: { X: 1 } });
    const some = (n: number) => [base, ...Array.from({ length: n - 1 }, (_, i) => other(i))];
    expect(run(some(MOST_LINKS), 1).ok).toBe(true);
    expect(refused(run(some(MOST_LINKS + 1), 1))).toEqual([{ case: "refuse-what-if-links", slots: { most: 120 } }]);
  });
  it("reaches nothing in words when no link starts from the Metric changed, and ignores a link into the Metric changed", () => {
    const l = mk(["M1"], () => ["Q"]);
    expect(refused(run(l, 1))).toEqual([{ case: "refuse-what-if-none", slots: { name: "A" } }]);
    const into = link("A", w.a, [{ name: "B", x: w.b }]);
    expect(refused(run([into], 1))).toEqual([{ case: "refuse-what-if-none", slots: { name: "A" } }]);
  });
  it("follows a Metric of the first step one step further: C reached directly and through B is at step 2 with both paths", () => {
    const lb = link("B", w.b, [{ name: "A", x: w.a }]);
    const lca = link("C", w.c, [{ name: "A", x: w.a }, { name: "B", x: w.b }]);
    const rs = reachedOf(run([lb, lca], 2));
    expect(rs.map((r) => [r.name, r.step])).toEqual([["B", 1], ["C", 2]]);
    expect(rs.map((r) => r.through)).toEqual([[], ["B"]]);
  });
  it("refuses in words links that drive each other, and links that run three steps, instead of a number cut short", () => {
    const lb = link("B", w.b, [{ name: "A", x: w.a }, { name: "C", x: w.c }]);
    const lc = link("C", w.c, [{ name: "A", x: w.a }, { name: "B", x: w.b }]);
    expect(refused(run([lb, lc], 2))).toEqual([{ case: "refuse-what-if-cycle", slots: {} }]);
    const lb1 = link("B", w.b, [{ name: "A", x: w.a }]);
    const lc1 = link("C", w.c, [{ name: "A", x: w.a }, { name: "B", x: w.b }]);
    const ld1 = link("D", w.d, [{ name: "C", x: w.c }]);
    expect(refused(run([lb1, lc1, ld1], 2))).toEqual([{ case: "refuse-what-if-deep", slots: { most: 2, name: "D" } }]);
  });
  it("works a Metric out once from every Metric that drives it: C driven by A, B1 and B2 uses each one's change as its own row shows it", () => {
    const r = lcg(99);
    const [b1, b2] = [w.b, w.a.map((v) => tenths(0.3 * v + gauss(r) * 40 + 20))];
    const links = [link("B1", b1, [{ name: "A", x: w.a }]), link("B2", b2, [{ name: "A", x: w.a }]), link("C", w.c, [{ name: "A", x: w.a }, { name: "B1", x: b1 }, { name: "B2", x: b2 }])];
    const rs = reachedOf(run(links, 1.5, 50));
    const [r1, r2, rc] = ["B1", "B2", "C"].map((n) => rs.find((r) => r.name === n)!);
    const c = links[2].fit.drivers;
    const expected = c[0].effect * 1.5 + c[1].effect * r1.effect + c[2].effect * r2.effect;
    expect(rc.step).toBe(2);
    expect(close(rc.effect, expected, 1e-9, 1e-9), `${rc.effect} vs ${expected}`).toBe(true);
    expect(rc.through).toEqual(["B1", "B2"]);
    const refs = referenceWhatIf([{ kind: "fit", target: "B1", drivers: ["A"], rows: refRows(b1, [w.a]) }, { kind: "fit", target: "B2", drivers: ["A"], rows: refRows(b2, [w.a]) }, { kind: "fit", target: "C", drivers: ["A", "B1", "B2"], rows: refRows(w.c, [w.a, b1, b2]) }], "A", exactOf("1.5"));
    expect(isNearestDouble(rc.effect, refs[2].effect)).toBe(true);
  });
  it("a formula that reads a Metric the change reaches uses that Metric's change: the same as re-working every formula on the changed inputs (generated)", () => {
    const formsB = ["{a} * {x}", "{a} + {x}", "{a} * 3 - {x}"];
    const formsC = ["{a} + {b}", "{b} * {a}", "{b} / {y}", "({a} - {b}) * 2", "{b} - {y} + {a}"];
    {
      fc.assert(
        fc.property(fc.constantFrom(...formsB), fc.constantFrom(...formsC), fc.integer({ min: 1, max: 60 }), fc.integer({ min: 1, max: 60 }), fc.integer({ min: 1, max: 60 }), fc.integer({ min: -9, max: 9 }), (formB, formC, a, x, y, by) => {
          fc.pre(by !== 0);
          const ev = (f: string, v: Record<string, number>) => referenceEvaluate(f, Object.fromEntries(Object.entries(v).map(([k, n]) => [k, exactOf(n)])))!;
          const bBefore = ev(formB, { a, x });
          const bAfter = ev(formB, { a: a + by, x });
          const toNumber = (e: { num: bigint; den: bigint }) => Number(e.num) / Number(e.den);
          fc.pre(Number.isInteger(toNumber(bBefore)) && !(formC.includes("/ {y}") && y === 0));
          const cBefore = referenceEvaluate(formC, { a: exactOf(a), b: bBefore, y: exactOf(y) })!;
          const cAfter = referenceEvaluate(formC, { a: exactOf(a + by), b: bAfter, y: exactOf(y) })!;
          const links: WhatIfLink[] = [
            { kind: "worked", target: "B", formula: formB, names: { a: "A", x: "X" }, levels: { A: a, X: x } },
            { kind: "worked", target: "C", formula: formC, names: { a: "A", b: "B", y: "Y" }, levels: { A: a, B: toNumber(bBefore), Y: y } },
          ];
          const rs = reachedOf(run(links, by, a));
          expect(isNearestDouble(rs[0].effect, minusExact(bAfter, bBefore))).toBe(true);
          const c = rs.find((r) => r.name === "C")!;
          expect(isNearestDouble(c.effect, minusExact(cAfter, cBefore))).toBe(true);
          expect(c.step).toBe(formC.includes("{b}") ? 2 : 1);
        }),
        { numRuns, seed },
      );
    }
  });
});

describe("hostile input is refused in words and never gives a number", () => {
  const w = world(3, 30);
  const lb = link("B", w.b, [{ name: "A", x: w.a }]);
  const input = (over: Partial<WhatIfInput> = {}): WhatIfInput => ({ start: { name: "A", latest: 50 }, change: { by: 1 }, links: [lb], ...over });
  const what = (r: ReturnType<typeof whatIf>) => refused(r)[0];
  it("refuses a change that is not a number, is nothing, or is a percent of nothing", () => {
    for (const change of [{ by: NaN }, { by: Infinity }, { percent: -Infinity }, { by: "1" }, null, undefined, 5, {}, { percent: NaN }] as unknown[]) {
      expect(what(whatIf(input({ change: change as WhatIfInput["change"] }))), JSON.stringify(change)).toEqual({ case: "refuse-input", slots: { what: "the change" } });
    }
    expect(what(whatIf(input({ change: { by: 0 } })))).toEqual({ case: "refuse-input", slots: { what: "the change" } });
    expect(what(whatIf(input({ change: { percent: 0 } })))).toEqual({ case: "refuse-input", slots: { what: "the change" } });
    expect(what(whatIf(input({ start: { name: "A", latest: 0 }, change: { percent: 5 } })))).toEqual({ case: "refuse-what-if-percent", slots: { name: "A" } });
    expect(whatIf(input({ start: { name: "A", latest: 0 }, change: { by: 5 } })).ok).toBe(true);
  });
  it("refuses a Metric changed that is not given, and links that are not links", () => {
    for (const start of [undefined, null, { name: "", latest: 1 }, { name: 5, latest: 1 }, { name: "A", latest: NaN }, { name: "A" }] as unknown[]) {
      expect(what(whatIf(input({ start: start as WhatIfInput["start"] }))), JSON.stringify(start)).toEqual({ case: "refuse-input", slots: { what: "the Metric changed" } });
    }
    expect(what(whatIf(undefined as unknown as WhatIfInput))).toEqual({ case: "refuse-input", slots: { what: "the Metric changed" } });
    expect(what(whatIf(input({ links: undefined as unknown as WhatIfLink[] })))).toEqual({ case: "refuse-input", slots: { what: "the links" } });
    for (const l of [null, 5, {}, { kind: "other" }, { kind: "fit" }, { kind: "fit", fit: {} }, { kind: "worked" }, { kind: "fit", fit: { ...lb.fit, ok: false } }]) {
      expect(what(whatIf(input({ links: [l as WhatIfLink] }))), JSON.stringify(l)).toMatchObject({ case: "refuse-input" });
    }
  });
  it("refuses a fit that was tampered with: no rows, rows that are not numbers, a driver that is its own target, a name given twice, a strength that is not a word", () => {
    const f = lb.fit;
    const bad: Fit[] = [
      { ...f, rows: [] },
      { ...f, rows: f.rows.map((r, i) => (i === 3 ? { ...r, y: NaN } : r)) },
      { ...f, drivers: [{ ...f.drivers[0], name: "B" }] },
      { ...f, drivers: [{ ...f.drivers[0], name: "" }] },
      { ...f, target: "" },
      { ...f, drivers: [f.drivers[0], f.drivers[0]] },
      { ...f, drivers: [{ ...f.drivers[0], strength: "huge" as never }] },
      { ...f, drivers: [{ ...f.drivers[0], low: NaN }] },
      { ...f, last: { y: 1, x: [] } },
      { ...f, rows: f.rows.map((r) => ({ ...r, x: [1] })) },
    ];
    for (const b of bad) expect(what(whatIf(input({ links: [{ kind: "fit", fit: b }] }))), JSON.stringify(b).slice(0, 80)).toEqual({ case: "refuse-input", slots: { what: "a fit" } });
  });
  it("refuses a formula link that is not sound: a name or a level missing, its own target as an input, reaching back, a name of an object's own", () => {
    const ok: WorkedLink = { kind: "worked", target: "T", formula: "{a} * 2", names: { a: "A" }, levels: { A: 50 } };
    expect(whatIf(input({ links: [ok] })).ok).toBe(true);
    const bad: unknown[] = [
      { ...ok, target: "" },
      { ...ok, formula: 5 },
      { ...ok, names: null },
      { ...ok, levels: null },
      { ...ok, formula: "2 * 3" },
      { ...ok, names: {} },
      { ...ok, names: { a: "T" } },
      { ...ok, names: { a: "" } },
      { ...ok, names: { a: 5 } },
      { ...ok, levels: {} },
      { ...ok, levels: { A: NaN } },
      { ...ok, formula: "prev({a}) + {a}" },
      { ...ok, names: { a: "__proto__" }, levels: {} },
      { ...ok, formula: "{constructor} + 1" },
    ];
    for (const b of bad) expect(what(whatIf(input({ links: [b as WhatIfLink] }))), JSON.stringify(b)).toEqual({ case: "refuse-input", slots: { what: "a formula" } });
  });
  it("refuses Metrics that are not told apart by name, and fits counted by different periods", () => {
    const dup = whatIf(input({ links: [lb, { kind: "worked", target: "B", formula: "{a} * 2", names: { a: "A" }, levels: { A: 5 } }] }));
    expect(what(dup)).toEqual({ case: "refuse-input", slots: { what: "the Metrics' names" } });
    const quarterly: FitLink = { kind: "fit", fit: { ...link("C", w.c, [{ name: "A", x: w.a }]).fit, span: "quarter" } };
    expect(refused(whatIf(input({ links: [lb, quarterly] })))).toEqual([{ case: "refuse-what-if-periods", slots: {} }]);
  });
  it("refuses values too large to work with, for that Metric, and does not change its input", () => {
    const before = JSON.stringify(input());
    const huge = whatIf(input({ change: { by: 1e308 } }));
    const [r] = huge.ok ? huge.reached : [];
    expect(r).toEqual({ ok: false, name: "B", step: 1, refusal: { case: "refuse-too-large", slots: {} } });
    expect(JSON.stringify(input())).toBe(before);
    const tiny = whatIf(input({ change: { by: 1e-300 } }));
    expect(tiny.ok).toBe(true);
  });
  it("is the same bytes twice", () => {
    expect(JSON.stringify(whatIf(input()))).toBe(JSON.stringify(whatIf(input())));
  });
});


describe("values too large for a range, and a formula that fails inside a chain", () => {
  const w = world(3, 30);
  it("refuses, for that Metric, where the numbers of a range are beyond the doubles: the effect is worked out but its range is not", () => {
    const l = link("B", w.b, [{ name: "A", x: w.a }]);
    // The periods of the fit tampered with to be enormous: finite, and valid, but the spread of its misses is past a double.
    const huge: FitLink = { kind: "fit", fit: { ...l.fit, rows: l.fit.rows.map((r) => ({ ...r, y: r.y * 1e200 })) } };
    const [r] = whatIf({ start: { name: "A", latest: 50 }, change: { by: 1 }, links: [huge] }).ok ? (run([huge], 1).ok ? (run([huge], 1) as { reached: unknown[] }).reached : []) : [];
    expect(r).toEqual({ ok: false, name: "B", step: 1, refusal: { case: "refuse-too-large", slots: {} } });
  });
  it("gives the Metric that rests on a formula that failed the same words, and leaves the others as they were", () => {
    const l = link("C", w.c, [{ name: "B", x: w.b }]);
    const b: WorkedLink = { kind: "worked", target: "B", formula: "{k} / {a}", names: { k: "K", a: "A" }, levels: { K: 1, A: 40 } };
    const res = whatIf({ start: { name: "A", latest: 40 }, change: { by: -40 }, links: [b, l] });
    if (!res.ok) throw new Error("refused");
    expect(res.reached).toEqual([
      { ok: false, name: "B", step: 1, refusal: { case: "refuse-what-if-formula", slots: { name: "B" } } },
      { ok: false, name: "C", step: 2, refusal: { case: "refuse-what-if-driver", slots: { name: "B" } } },
    ]);
  });
  it("says 'beyond' and gives no range where the point is inside what a driver has been but the end of its range is not", () => {
    const lb = link("B", w.b, [{ name: "A", x: w.a }]);
    const lc = link("C", w.c, [{ name: "B", x: w.b }]);
    const latest = (Math.min(...w.a) + Math.max(...w.a)) / 2;
    const found = Array.from({ length: 60 }, (_, i) => (i + 1) / 2).map((x) => reachedOf(run([lb, lc], x, latest))).find((rs) => rs[1].outside.length === 0 && rs[1].beyond.length > 0 && rs[0].outside.length === 0);
    expect(found, "a change whose point is inside and range end is outside").toBeDefined();
    const [b, c] = found!;
    expect([c.lo, c.hi, c.noRange]).toEqual([null, null, false]);
    expect(c.beyond[0]).toMatchObject({ name: "B" });
    expect(b.beyond).toEqual([]);
  });
  it("is never strong with a caution: a link of strong strength with the spread caution is moderate", () => {
    const a = [1, 3, 2, 5, 4, 9, 6, 8, 12, 10, 11, 14, 13, 7];
    const l = link("B", a.map((v) => 2 * v + 1), [{ name: "A", x: a }]);
    expect(l.fit.drivers[0].strength).toBe("strong");
    const cautious: FitLink = { kind: "fit", fit: { ...l.fit, verdict: { refusals: [], switches: [], cautions: [{ case: "caution-spread", slots: {} }] } } };
    const [r] = reachedOf(run([cautious], 1, 7));
    expect(r.strength).toBe("moderate");
    expect(reachedOf(run([l], 1, 7))[0].strength).toBe("strong");
  });
});


describe("a fit handed over is checked against its own rows", () => {
  const w = world(3, 30);
  const f = link("B", w.b, [{ name: "A", x: w.a }]).fit;
  const input = (fit: unknown): WhatIfInput => ({ start: { name: "A", latest: 50 }, change: { by: 1 }, links: [{ kind: "fit", fit: fit as Fit }] });
  const bad = (fit: unknown) => refused(whatIf(input(fit)))[0];
  it("refuses a lowest or highest value that the rows do not give, so that a value far outside what was seen cannot be given a range", () => {
    for (const d of [{ ...f.drivers[0], low: -1e9, high: 1e9 }, { ...f.drivers[0], low: f.drivers[0].low - 1 }, { ...f.drivers[0], high: f.drivers[0].high + 1 }]) expect(bad({ ...f, drivers: [d] })).toEqual({ case: "refuse-input", slots: { what: "a fit" } });
  });
  it("works the strength word out again: a word that is not the fit's own is refused", () => {
    const other = (["strong", "moderate", "weak", "cant-tell"] as const).find((x) => x !== f.drivers[0].strength)!;
    expect(bad({ ...f, drivers: [{ ...f.drivers[0], strength: other }] })).toEqual({ case: "refuse-input", slots: { what: "a fit" } });
    expect(bad({ ...f, crowded: [f.drivers[0].name] })).toEqual(f.drivers[0].strength === "strong" ? { case: "refuse-input", slots: { what: "a fit" } } : bad({ ...f, crowded: [f.drivers[0].name] }));
  });
  it("refuses cautions that are not lines of the wording kind, and a crowded name that is not a driver", () => {
    for (const verdict of [{ refusals: [], switches: [], cautions: [null] }, { refusals: [], switches: [], cautions: [{ case: 5, slots: {} }] }, { refusals: [], switches: [], cautions: [{ case: "caution-spread", slots: null }] }, { refusals: [], switches: [], cautions: [{ case: "caution-spread", slots: { x: {} } }] }]) {
      expect(bad({ ...f, verdict })).toEqual({ case: "refuse-input", slots: { what: "a fit" } });
    }
  });
  it("refuses, and does not throw, a fit with its verdict, last, span, crowded or drivers missing or of the wrong kind", () => {
    const parts: Record<string, unknown> = { verdict: undefined, last: undefined, span: "fortnight", crowded: "x", rows: null, drivers: null, basis: "other" };
    for (const [k, v] of Object.entries(parts)) expect(bad({ ...f, [k]: v }), k).toEqual({ case: "refuse-input", slots: { what: "a fit" } });
    expect(bad({ ...f, verdict: { cautions: "none" } })).toEqual({ case: "refuse-input", slots: { what: "a fit" } });
    expect(bad({ ...f, drivers: [null] })).toEqual({ case: "refuse-input", slots: { what: "a fit" } });
    expect(bad({ ok: true, get target() { throw new Error("boom"); } })).toEqual({ case: "refuse-input", slots: { what: "a link" } });
  });
  it("accepts a fit whose misses are all 0 and whose effect is 0 (its link is worked out again as nothing), and a driver that does not change", () => {
    const flat = { ...f, rows: f.rows.map((r) => ({ ...r, y: 5 })), drivers: [{ ...f.drivers[0], strength: "cant-tell" as const }] };
    const [r] = reachedOf(whatIf(input(flat)));
    expect([r.effect, r.strength]).toEqual([0, "cant-tell"]);
    // A second driver that nothing changes is held, and a name given twice is refused.
    const w2 = world(5, 30);
    const two = link("B", w2.b, [{ name: "A", x: w2.a }, { name: "X", x: w2.d }]).fit;
    expect(reachedOf(whatIf(input(two)))).toHaveLength(1);
    expect(bad({ ...two, drivers: [two.drivers[0], { ...two.drivers[1], name: two.drivers[0].name }] })).toEqual({ case: "refuse-input", slots: { what: "a fit" } });
  });
  it("says in words where a formula has no value even at the levels given, before any change", () => {
    const s: WorkedLink = { kind: "worked", target: "S", formula: "1 / {k}", names: { k: "K" }, levels: { K: 0 } };
    const r = whatIf({ start: { name: "K", latest: 0 }, change: { by: 1 }, links: [s] });
    expect(r.ok && r.reached[0]).toEqual({ ok: false, name: "S", step: 1, refusal: { case: "refuse-what-if-formula", slots: { name: "S" } } });
  });
  it("refuses levels that disagree: the Metric changed at another level than its latest, or one Metric at two levels in two formulas", () => {
    const one: WorkedLink = { kind: "worked", target: "T", formula: "{a} * {k}", names: { a: "A", k: "K" }, levels: { A: 50, K: 2 } };
    const two: WorkedLink = { kind: "worked", target: "U", formula: "{a} + {k}", names: { a: "A", k: "K" }, levels: { A: 50, K: 3 } };
    expect(refused(whatIf({ start: { name: "A", latest: 50 }, change: { by: 1 }, links: [one, two] }))).toEqual([{ case: "refuse-input", slots: { what: "the levels" } }]);
    expect(refused(whatIf({ start: { name: "A", latest: 49 }, change: { by: 1 }, links: [one] }))).toEqual([{ case: "refuse-input", slots: { what: "the levels" } }]);
  });
  it("gives the point only, with no range, where only the range of a formula divides by 0", () => {
    const l = link("B", w.b, [{ name: "A", x: w.a }]);
    const point = reachedOf(run([l], 5, 50))[0].effect;
    const s: WorkedLink = { kind: "worked", target: "S", formula: "1 / {b}", names: { b: "B" }, levels: { B: 0.001 - point } };
    const res = whatIf({ start: { name: "A", latest: 50 }, change: { by: 5 }, links: [l, s] });
    if (!res.ok) throw new Error("refused");
    const r = res.reached[1];
    expect(r).toMatchObject({ ok: true, name: "S", step: 2, noRange: true, lo: null, hi: null, exact: false });
    expect(r.ok && r.effect).toBeCloseTo(1 / 0.001 - 1 / (0.001 - point), 6 - 3);
  });
});

describe("every check on what is handed over, one at a time (so that none can be dropped unseen)", () => {
  const w = world(3, 30);
  const w2 = world(5, 30);
  const f = link("B", w.b, [{ name: "A", x: w.a }]).fit;
  const two = link("B", w2.b, [{ name: "A", x: w2.a }, { name: "X", x: w2.d }]).fit;
  const input = (l: unknown): WhatIfInput => ({ start: { name: "A", latest: 50 }, change: { by: 1 }, links: [l as WhatIfLink] });
  const what = (l: unknown) => refused(whatIf(input(l)))[0];
  const asFit = (fit: unknown) => ({ kind: "fit", fit });
  const FIT = { case: "refuse-input", slots: { what: "a fit" } };
  const FORMULA = { case: "refuse-input", slots: { what: "a formula" } };
  const LINK = { case: "refuse-input", slots: { what: "a link" } };
  it("names what is wrong with a link that is not one: not a thing, not a kind", () => {
    for (const l of [null, undefined, 5, "x", { kind: "other" }, {}]) expect(what(l)).toEqual(LINK);
  });
  it("refuses a fit for each of its checks alone", () => {
    const bad: unknown[] = [
      { ...f, ok: false }, { ...f, ok: undefined }, { ...f, target: 5 }, { ...f, target: "" }, { ...f, drivers: "x" }, { ...f, rows: "x" }, { ...f, last: null }, { ...f, last: { x: "x" } },
      { ...f, rows: f.rows.slice(0, 3) }, { ...f, drivers: [null] }, { ...two, drivers: [two.drivers[0], null] }, { ...two, drivers: [two.drivers[0], { ...two.drivers[1], name: 5 }] }, { ...two, drivers: [two.drivers[0], { ...two.drivers[1], name: "" }] }, { ...two, drivers: [two.drivers[0], { ...two.drivers[1], name: two.target }] }, { ...f, drivers: [{ ...f.drivers[0], name: 5 }] }, { ...f, drivers: [{ ...f.drivers[0], name: "" }] }, { ...f, drivers: [{ ...f.drivers[0], name: f.target }] },
      { ...f, rows: f.rows.map((r) => ({ ...r, x: [1] })) },
      { ...f, span: "fortnight" }, { ...f, verdict: null }, { ...f, verdict: {} }, { ...f, crowded: null },
      { ...two, drivers: [two.drivers[0], { ...two.drivers[1], name: two.drivers[0].name }] },
      { ...f, verdict: { cautions: [{ case: "caution-spread", slots: "x" }] } }, { ...f, verdict: { cautions: [{ case: "caution-spread", slots: { a: undefined } }] } },
    ];
    for (const b of bad) expect(what(asFit(b)), JSON.stringify(b).slice(0, 90)).toEqual(FIT);
  });
  it("refuses a fit whose rows leave nothing to work out again (the effects have no inverse)", () => {
    expect(what(asFit({ ...f, rows: f.rows.map((r) => ({ ...r, x: [3] })), drivers: [{ ...f.drivers[0], low: 3, high: 3 }] }))).toEqual(FIT);
  });
  it("accepts a fit as the fit made it, and cautions with plain slots", () => {
    expect(whatIf(input(asFit(two))).ok).toBe(true);
    expect(whatIf(input(asFit({ ...f, verdict: { refusals: [], switches: [], cautions: [{ case: "caution-spread", slots: { n: 1, s: "x" } }] } }))).ok).toBe(true);
  });
  it("refuses a formula for each of its checks alone", () => {
    const ok = { kind: "worked", target: "T", formula: "{a} * 2", names: { a: "A" }, levels: { A: 50 } };
    const bad: unknown[] = [
      { ...ok, target: 5 }, { ...ok, target: "" }, { ...ok, formula: 5 }, { ...ok, names: "x" }, { ...ok, levels: "x" }, { ...ok, names: null }, { ...ok, levels: null },
      { ...ok, formula: "2 * 3" }, { ...ok, formula: "prev({a})" }, { ...ok, names: {} }, { ...ok, names: { a: 5 }, levels: { 5: 3 } }, { ...ok, names: { a: "" }, levels: { "": 3 } }, { ...ok, names: { a: "T" }, levels: { T: 3 } },
      { ...ok, levels: {} }, { ...ok, levels: { A: Infinity } }, { ...ok, levels: { A: "5" } },
      { ...ok, formula: "{a} + {b}", names: { a: "A", b: 5 }, levels: { A: 50, 5: 3 } }, { ...ok, formula: "{a} + {b}", names: { a: "A", b: "" }, levels: { A: 50, "": 3 } }, { ...ok, formula: "{a} + {b}", names: { a: "A", b: "T" }, levels: { A: 50, T: 3 } },
      { ...ok, formula: "{a} + {b}", names: { a: "A", b: "K" }, levels: { A: 50 } }, { ...ok, formula: "{a} + {b}", names: { a: "A", b: "K" }, levels: { A: 50, K: NaN } },
    ];
    for (const b of bad) expect(what(b), JSON.stringify(b)).toEqual(FORMULA);
    expect(whatIf(input(ok)).ok).toBe(true);
  });
  it("finds a bad link wherever it stands among good ones", () => {
    const good = { kind: "worked", target: "T", formula: "{a} * 2", names: { a: "A" }, levels: { A: 50 } };
    expect(refused(whatIf({ start: { name: "A", latest: 50 }, change: { by: 1 }, links: [good as WorkedLink, { ...good, target: "" } as WorkedLink] }))).toEqual([FORMULA]);
  });
  it("refuses a change for each of its checks alone", () => {
    const ch = (change: unknown) => refused(whatIf({ start: { name: "A", latest: 50 }, change: change as WhatIfInput["change"], links: [] }))[0];
    for (const c of [{ by: undefined }, { by: "2" }, { by: NaN }, { percent: "2" }, { percent: Infinity }, { other: 1 }, [], "x", 3]) expect(ch(c), JSON.stringify(c)).toEqual({ case: "refuse-input", slots: { what: "the change" } });
  });
  it("gives the percent asked for, and none for an amount", () => {
    const l = link("B", w.b, [{ name: "A", x: w.a }]);
    const r = (change: WhatIfInput["change"]) => whatIf({ start: { name: "A", latest: 50 }, change, links: [l] });
    expect(r({ percent: 10 })).toMatchObject({ ok: true, percent: 10, by: 5 });
    expect(r({ by: 5 })).toMatchObject({ ok: true, percent: null, by: 5 });
  });
  it("ignores a link into the Metric changed even where another Metric is driven by it", () => {
    const lb = link("B", w.b, [{ name: "A", x: w.a }]);
    const into = link("A", w.a, [{ name: "B", x: w.b }]);
    expect(reachedOf(run([lb, into], 1)).map((r) => r.name)).toEqual(["B"]);
  });
  it("says whether links can be followed, and why not", () => {
    const lb = link("B", w.b, [{ name: "A", x: w.a }]);
    expect(planOf("A", [lb])).toEqual({ ok: true });
    expect(planOf("A", [])).toEqual({ case: "refuse-what-if-none", slots: { name: "A" } });
    expect(planOf("A", [lb, link("C", w.c, [{ name: "B", x: w.b }]), link("D", w.d, [{ name: "C", x: w.c }])])).toEqual({ case: "refuse-what-if-deep", slots: { most: 2, name: "D" } });
  });
  it("keeps the order of the Metrics whatever the order of the links, names at the same step in order", () => {
    const [lb, lc] = [link("B", w.b, [{ name: "A", x: w.a }]), link("C", w.c, [{ name: "A", x: w.a }])];
    expect(reachedOf(run([lc, lb], 1)).map((r) => r.name)).toEqual(["B", "C"]);
  });
  it("carries what was seen through a formula, and what upstream links went beyond", () => {
    const lb = link("B", w.b, [{ name: "A", x: w.a }]);
    const cautious: FitLink = { kind: "fit", fit: { ...lb.fit, verdict: { refusals: [], switches: [], cautions: [{ case: "caution-spread", slots: {} }] } } };
    const s: WorkedLink = { kind: "worked", target: "S", formula: "{b} * 2", names: { b: "B" }, levels: { B: 100 } };
    const [, rs] = reachedOf(run([cautious, s], 1, 50));
    expect(rs.verdict.cautions).toEqual([{ case: "caution-spread", slots: {} }]);
    const lc = link("C", w.c, [{ name: "B", x: w.b }]);
    const high = reachedOf(run([lb, lc], 100, Math.max(...w.a)));
    expect(high[1].outside.map((o) => o.name)).toContain("A");
  });
  it("does not name as 'through' a driver that nothing changes", () => {
    const [r] = reachedOf(whatIf(input(asFit(two))));
    expect(r.through).toEqual([]);
  });
  it("is as weak as the weakest, and a caution lowers only a strong word: a link that cannot be told from chance stays that", () => {
    const noise = link("B", w.d, [{ name: "A", x: w.b.map((v) => v * 0 + (v % 7)) }]);
    const cautious: FitLink = { kind: "fit", fit: { ...noise.fit, verdict: { refusals: [], switches: [], cautions: [{ case: "caution-spread", slots: {} }] } } };
    const [r] = reachedOf(run([cautious], 1, 50));
    expect(r.strength).toBe(noise.fit.drivers[0].strength);
    expect(["cant-tell", "weak"]).toContain(r.strength);
  });
  it("is compared by change for one link and by value for the other: the Metric reached through both says it counts a change", () => {
    const r = lcg(4);
    const a = Array.from({ length: 30 }, (_, t) => tenths(100 + 6 * t + gauss(r) * 3));
    const b = a.map((v, t) => tenths(2 * v + 4 * t + gauss(r) * 5));
    const flat = Array.from({ length: 30 }, () => tenths(20 + r() * 60));
    const c = flat.map((v) => tenths(3 * v + gauss(r) * 30));
    const lb = fit({ target: { name: "B", points: pts(b) }, drivers: [{ name: "A", points: pts(a) }], span: "month" });
    const lc = fit({ target: { name: "C", points: pts(c) }, drivers: [{ name: "B", points: pts(flat) }], span: "month", basis: "values" });
    if (!lb.ok || !lc.ok) throw new Error("refused");
    expect([lb.basis, lc.basis]).toEqual(["changes", "values"]);
    const rs = reachedOf(run([{ kind: "fit", fit: lb }, { kind: "fit", fit: lc }], 1, a[a.length - 1]));
    expect(rs.map((x) => x.byChange)).toEqual([true, true]);
    const only = reachedOf(run([{ kind: "fit", fit: lc }, { kind: "worked", target: "B", formula: "{a} * 2", names: { a: "A" }, levels: { A: a[a.length - 1] } }], 1, a[a.length - 1]));
    expect(only.find((x) => x.name === "C")!.byChange).toBe(false);
  });
  it("names the Metrics a change came through in order of their names, whatever order the drivers are listed in", () => {
    const [b1, b2] = [w.b, w.a.map((v, i) => tenths(0.3 * v + ((i * 13) % 17) * 3))];
    const c = link("C", w.c, [{ name: "B2", x: b2 }, { name: "B1", x: b1 }]);
    const rs = reachedOf(run([link("B1", b1, [{ name: "A", x: w.a }]), link("B2", b2, [{ name: "A", x: w.a }]), c], 1));
    expect(rs.find((r) => r.name === "C")!.through).toEqual(["B1", "B2"]);
  });
  it("refuses a range that overflows although the effect itself does not", () => {
    const l = link("B", w.b, [{ name: "A", x: w.a }]);
    const r = whatIf({ start: { name: "A", latest: 50 }, change: { by: 6e307 }, links: [l] });
    expect(r.ok && r.reached[0]).toEqual({ ok: false, name: "B", step: 1, refusal: { case: "refuse-too-large", slots: {} } });
  });
  it("names a driver once: beyond is only what the point leaves inside, and a driver outside at the point is not also beyond", () => {
    const lb = link("B", w.b, [{ name: "A", x: w.a }]);
    const lc = link("C", w.c, [{ name: "B", x: w.b }]);
    const rs = reachedOf(run([lb, lc], 40, Math.max(...w.a) - 40));
    const c = rs[1];
    expect(c.outside.map((o) => o.name)).toEqual(["B"]);
    expect(c.beyond).toEqual([]);
    const lca = link("C", w.c, [{ name: "A", x: w.a }, { name: "B", x: w.b }]);
    const both = Array.from({ length: 120 }, (_, i) => (i + 1) / 2).map((x) => reachedOf(run([lb, lca], x, 50))[1]).find((r) => r.outside.some((o) => o.name === "A") && r.beyond.some((o) => o.name === "B"));
    expect(both, "a driver outside at the point beside another whose range reaches beyond").toBeDefined();
  });
  it("gives the period the fits are counted by, and none where every link is a formula", () => {
    const lb = link("B", w.b, [{ name: "A", x: w.a }]);
    expect(whatIf({ start: { name: "A", latest: 50 }, change: { by: 1 }, links: [lb] })).toMatchObject({ ok: true, span: "month" });
    const s: WorkedLink = { kind: "worked", target: "S", formula: "{a} * 2", names: { a: "A" }, levels: { A: 50 } };
    expect(whatIf({ start: { name: "A", latest: 50 }, change: { by: 1 }, links: [s] })).toMatchObject({ ok: true, span: null });
  });
  it("refuses outside what was seen for every Metric a curved link feeds, not only the one it is the link of", () => {
    const a = Array.from({ length: 24 }, (_, i) => i + 1);
    const curved = link("B", a.map((v) => v * v), [{ name: "A", x: a }]);
    expect(curved.fit.verdict.cautions.map((c) => c.case)).toContain("caution-curved");
    const next = link("Z", a.map((v) => 2 * v * v + (v % 5) * 9), [{ name: "B", x: a.map((v) => v * v) }]);
    expect(next.fit.verdict.cautions.map((c) => c.case)).not.toContain("caution-curved");
    const res = whatIf({ start: { name: "A", latest: 24 }, change: { by: 30 }, links: [curved, next] });
    if (!res.ok) throw new Error("refused");
    expect(res.reached.map((r) => (r.ok ? "ok" : r.refusal.case))).toEqual(["refuse-curved-outside", "refuse-curved-outside"]);
  });
  it("counts the lowest value a driver has been as inside, and one step below it as outside", () => {
    const l = link("B", w.b, [{ name: "A", x: w.a }]);
    const low = Math.min(...w.a);
    const latest = l.fit.last.x[0];
    expect(reachedOf(run([l], low - latest, latest))[0].outside).toEqual([]);
    expect(reachedOf(run([l], low - latest - 0.1, latest))[0].outside).toHaveLength(1);
  });
});

describe("properties", () => {
  const worlds = fc.record({ s: fc.integer({ min: 1, max: 1_000_000 }), n: fc.integer({ min: 18, max: 36 }) });
  it(`does not depend on the order the links are given in, and a Metric given twice is refused (${numRuns} worlds, seed ${seed})`, () => {
    fc.assert(
      fc.property(worlds, fc.integer({ min: 0, max: 1000 }), ({ s, n }, k) => {
        const v = world(s, n);
        const links = [link("B", v.b, [{ name: "A", x: v.a }]), link("C", v.c, [{ name: "A", x: v.a }, { name: "B", x: v.b }]), link("D", v.d, [{ name: "B", x: v.b }])];
        const rotated = [...links.slice(k % 3), ...links.slice(0, k % 3)];
        expect(JSON.stringify(run(rotated, 2, 50))).toBe(JSON.stringify(run(links, 2, 50)));
        expect(JSON.stringify(run([...links].reverse(), 2, 50))).toBe(JSON.stringify(run(links, 2, 50)));
      }),
      { numRuns: Math.min(numRuns, 40), seed },
    );
  });
  it(`scales with the change: a change of k·x gives k times the effect and the range, its ends swapped for a negative k; the effect lies in its range (${numRuns} worlds)`, () => {
    fc.assert(
      fc.property(worlds, fc.double({ min: 0.5, max: 3, noNaN: true }), fc.boolean(), ({ s, n }, k, flip) => {
        const v = world(s, n);
        const links = [link("B", v.b, [{ name: "A", x: v.a }]), link("C", v.c, [{ name: "B", x: v.b }])];
        const latest = v.a[v.a.length - 1];
        const [x, sign] = [0.3, flip ? -1 : 1];
        const one = reachedOf(run(links, x, latest));
        const scaled = reachedOf(run(links, sign * k * x, latest));
        one.forEach((r, i) => {
          const s2 = scaled[i];
          expect(close(s2.effect, sign * k * r.effect, 1e-9, 1e-12)).toBe(true);
          if (r.lo !== null && s2.lo !== null) {
            const [lo, hi] = sign > 0 ? [k * r.lo, k * r.hi!] : [-k * r.hi!, -k * r.lo];
            expect(close(s2.lo, lo, 1e-9, 1e-9) && close(s2.hi!, hi, 1e-9, 1e-9)).toBe(true);
          }
          if (r.lo !== null) {
            expect(r.lo).toBeLessThanOrEqual(r.effect + 1e-12 * Math.abs(r.effect));
            expect(r.hi!).toBeGreaterThanOrEqual(r.effect - 1e-12 * Math.abs(r.effect));
          }
        });
      }),
      { numRuns: Math.min(numRuns, 40), seed },
    );
  });
  it(`gives a wider range to a Metric that rests on more estimated effects, and never one narrower than the effect of the first link alone (${numRuns} worlds)`, () => {
    fc.assert(
      fc.property(worlds, ({ s, n }) => {
        const v = world(s, n);
        const lb = link("B", v.b, [{ name: "A", x: v.a }]);
        const lc = link("C", v.c, [{ name: "B", x: v.b }]);
        const [b, c] = reachedOf(run([lb, lc], 1, v.a[v.a.length - 1]));
        // The same two links, but with C's own range cut as a single effect: its half width at one effect is narrower than at two.
        const [, cOne] = reachedOf(run([lb, { kind: "worked", target: "C", formula: "{b} * 2", names: { b: "B" }, levels: { B: 3 } }], 1, v.a[v.a.length - 1]));
        expect(c.hi! - c.lo!).toBeGreaterThanOrEqual(0);
        expect(b.coefficients).toBe(1);
        expect(c.coefficients).toBe(2);
        expect(cOne.coefficients).toBe(1);
      }),
      { numRuns: Math.min(numRuns, 30), seed },
    );
  });
});

describe("the coverage of the stated range on simulated data", () => {
  // A drives B (3 per unit), B drives C (2 per unit): the true effect of a change x in A on B is 3x and on C is 6x. Each series is fitted
  // with its own noise; a range "likely between" should hold the true effect about four times in five for B, and at least that for C,
  // where the chain's ranges are cut wider and no independence between the links is assumed. Seeded, and over a size that CI can afford.
  it(`holds the true effect at least four times in five for one link (within sampling error) and for a chain (${Math.max(numRuns, 200)} simulated worlds, seed ${seed})`, () => {
    const sims = Math.max(numRuns, 200);
    let [one, two, done] = [0, 0, 0];
    const r = lcg(seed + 17);
    for (let i = 0; i < sims; i++) {
      const n = 24 + Math.floor(r() * 24);
      const a = Array.from({ length: n }, () => tenths(20 + r() * 60));
      const b = a.map((v) => tenths(3 * v + gauss(r) * 14));
      const c = b.map((v) => tenths(2 * v + gauss(r) * 30));
      const [fb, fc] = [fit({ target: { name: "B", points: pts(b) }, drivers: [{ name: "A", points: pts(a) }], span: "month", basis: "values" }), fit({ target: { name: "C", points: pts(c) }, drivers: [{ name: "B", points: pts(b) }], span: "month", basis: "values" })];
      if (!fb.ok || !fc.ok) continue;
      const x = 2;
      const res = whatIf({ start: { name: "A", latest: 50 }, change: { by: x }, links: [{ kind: "fit", fit: fb }, { kind: "fit", fit: fc }] });
      if (!res.ok) continue;
      const [rb, rc] = res.reached;
      if (!rb.ok || !rc.ok || rb.lo === null || rc.lo === null) continue;
      done++;
      if (rb.lo <= 3 * x && 3 * x <= rb.hi!) one++;
      if (rc.lo <= 6 * x && 6 * x <= rc.hi!) two++;
    }
    expect(done).toBeGreaterThan(sims * 0.9);
    const se = Math.sqrt((0.8 * 0.2) / done);
    // One link: the fit's own 80 % range, so about 0.8 (within four standard errors); a chain: at least 0.8, whatever the dependence.
    expect(Math.abs(one / done - 0.8), `one link ${one / done}`).toBeLessThan(4 * se);
    expect(two / done, `two links ${two / done}`).toBeGreaterThan(0.8 - 4 * se);
  });
});
