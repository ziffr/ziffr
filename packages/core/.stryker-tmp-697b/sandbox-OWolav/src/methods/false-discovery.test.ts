// @ts-nocheck
// Benjamini and Hochberg's rule (spec 0041, ticket 13): held to SciPy's `false_discovery_control` (adjusted chances and the pairs
// reported at four rates), to a reference that decides the rule on exact fractions, to cases worked by hand, to properties
// (order, the rate, the size of the list) and to a simulation of the one thing the rule promises: when nothing is related, a
// pair is reported in at most about q of the runs.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runs } from "../test/reference/check";
import { FIXTURE } from "../test/reference/heads-up-fixture";
import { referenceBH } from "../test/reference/heads-up";
import { adjustedChances, benjaminiHochberg } from "./false-discovery";

const { numRuns, seed } = runs();
const decimals = (n: number) => fc.array(fc.integer({ min: 0, max: 10_000 }).map((v) => v / 10_000), { minLength: 0, maxLength: n });

describe("against SciPy", () => {
  it("gives SciPy's adjusted chances (method bh) to a relative 1e-12, and the pairs it reports at 5, 10, 20 and 50 %", () => {
    expect(FIXTURE.benjaminiHochberg.length).toBe(10);
    for (const c of FIXTURE.benjaminiHochberg) {
      const adjusted = adjustedChances(c.ps);
      adjusted.forEach((a, i) => expect(Math.abs(a - c.adjusted[i]) <= 1e-12 * c.adjusted[i] + 1e-300, `adjusted ${i}: ${a} against ${c.adjusted[i]}`).toBe(true));
      for (const [q, reported] of Object.entries(c.reported)) {
        // SciPy's adjusted chance is a rate; a pair is reported at q when it is at most q. A pair right at the rate is decided by
        // rounding in both, so only the pairs a hair from it are not compared.
        const got = benjaminiHochberg(c.ps, Number(q));
        c.adjusted.forEach((a, i) => { if (Math.abs(a - Number(q)) > 1e-12) expect(got[i], `q ${q} pair ${i} adjusted ${a}`).toBe(reported[i]); });
      }
    }
  });
});

describe("worked by hand", () => {
  it("reports the textbook case: 0.005, 0.01, 0.03, 0.04 at 10 % are all reported, at 5 % only the first two", () => {
    // m = 4: ranks 1..4 have bounds 0.025, 0.05, 0.075, 0.1: 0.005 ≤ 0.025, 0.01 ≤ 0.05, 0.03 ≤ 0.075, 0.04 ≤ 0.1.
    expect(benjaminiHochberg([0.01, 0.04, 0.03, 0.005], 0.1)).toEqual([true, true, true, true]);
    // q = 0.05: bounds 0.0125, 0.025, 0.0375, 0.05: 0.005 ≤ .0125, 0.01 ≤ .025, 0.03 ≤ .0375 yes, 0.04 ≤ .05 yes: all four.
    expect(benjaminiHochberg([0.01, 0.04, 0.03, 0.005], 0.05)).toEqual([true, true, true, true]);
    // A later rank rescues an earlier miss: 0.06 is over its own bound 0.05 but 0.07 is within the last bound 0.1, so both are reported.
    expect(benjaminiHochberg([0.06, 0.07], 0.1)).toEqual([true, true]);
    expect(benjaminiHochberg([0.03, 0.04], 0.1)).toEqual([true, true]);
    expect(benjaminiHochberg([0.03, 0.2], 0.1)).toEqual([true, false]);
    expect(benjaminiHochberg([0.06, 0.2], 0.1)).toEqual([false, false]);
  });
  it("reports nothing for a list of 1s, nothing for no list, and a lone chance at or below q", () => {
    expect(benjaminiHochberg([], 0.1)).toEqual([]);
    expect(benjaminiHochberg([1, 1, 1], 0.1)).toEqual([false, false, false]);
    expect(benjaminiHochberg([0.1], 0.1)).toEqual([true]);
    expect(benjaminiHochberg([0.10000000000000002], 0.1)).toEqual([false]);
    expect(benjaminiHochberg([0], 1e-300)).toEqual([true]);
  });
  it("is decided at the boundary the way the exact rule decides it: a chance exactly at q·k/m is reported, a step above is not", () => {
    expect(benjaminiHochberg([0.05, 0.9], 0.1)).toEqual([true, false]);
    expect(benjaminiHochberg([0.050000000000000003, 0.9], 0.1)).toEqual([true, false]);
    expect(benjaminiHochberg([0.05000000000000001, 0.9], 0.1)).toEqual([false, false]);
    expect(benjaminiHochberg([0.09, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9], 0.1)).toEqual([false, ...Array(9).fill(false)]);
    expect(benjaminiHochberg([0.01, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9], 0.1)).toEqual([true, ...Array(9).fill(false)]);
    expect(benjaminiHochberg([0.0100000000000001, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9], 0.1)).toEqual([false, ...Array(9).fill(false)]);
  });
  it("holds a chance outside 0 to 1 to the nearest end and counts one that is not a number as 1", () => {
    expect(benjaminiHochberg([-0.5, 0.2, 7], 0.1)).toEqual([true, false, false]);
    expect(benjaminiHochberg([0.001, NaN, NaN, NaN], 0.1)).toEqual([true, false, false, false]);
    expect(adjustedChances([-1, 2, NaN])).toEqual([0, 1, 1]);
  });
  it("refuses a rate that is not above 0 and at most 1", () => {
    for (const q of [0, -0.1, 1.5, NaN, Infinity]) expect(() => benjaminiHochberg([0.1], q), String(q)).toThrow(new RangeError("The rate must be above 0 and at most 1."));
    expect(benjaminiHochberg([0.5, 0.9], 1)).toEqual([true, true]);
  });
});

describe("against the exact reference", () => {
  it(`reports what the rule on exact fractions reports (${numRuns} generated lists, four rates)`, () => {
    fc.assert(
      fc.property(decimals(60), fc.constantFrom("0.05", "0.1", "0.2", "0.5"), (ps, q) => {
        expect(benjaminiHochberg(ps, Number(q)), `${JSON.stringify(ps)} at ${q}`).toEqual(referenceBH(ps, q));
      }),
      { numRuns, seed },
    );
  });
  it("agrees on lists with many ties and with the extremes", () => {
    for (const ps of [[0.02, 0.02, 0.02, 0.2], [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05], [0, 0, 0, 1, 1], [0.0001, 0.0002, 0.0003, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1]]) {
      for (const q of ["0.05", "0.1", "0.2"]) expect(benjaminiHochberg(ps, Number(q)), `${ps} ${q}`).toEqual(referenceBH(ps, q));
    }
  });
});

describe("as a rule", () => {
  it(`is the same in any order, reports a superset at a higher rate, and reports every pair at or below q ÷ m (${numRuns} generated)`, () => {
    fc.assert(
      fc.property(decimals(40), fc.integer({ min: 0, max: 1000 }), (ps, shift) => {
        const rotated = ps.length ? [...ps.slice(shift % ps.length), ...ps.slice(0, shift % ps.length)] : ps;
        const [a, b] = [benjaminiHochberg(ps, 0.1), benjaminiHochberg(rotated, 0.1)];
        const key = (list: number[], got: boolean[]) => list.map((p, i) => [p, got[i]]).sort((x, y) => Number(x[0]) - Number(y[0]) || Number(x[1]) - Number(y[1]));
        expect(key(rotated, b)).toEqual(key(ps, a));
        const wider = benjaminiHochberg(ps, 0.2);
        a.forEach((x, i) => { if (x) expect(wider[i]).toBe(true); });
        ps.forEach((p, i) => { if (p <= 0.1 / ps.length) expect(a[i]).toBe(true); });
        // A reported pair has every smaller chance reported too.
        ps.forEach((p, i) => { if (a[i]) ps.forEach((o, j) => { if (o <= p) expect(a[j]).toBe(true); }); });
      }),
      { numRuns, seed },
    );
  });
  it("adjusts to at most 1 and never below the chance itself, and is monotone in the chance", () => {
    fc.assert(
      fc.property(decimals(40), (ps) => {
        const adj = adjustedChances(ps);
        adj.forEach((a, i) => { expect(a).toBeLessThanOrEqual(1); expect(a).toBeGreaterThanOrEqual(ps[i]); });
        ps.forEach((p, i) => ps.forEach((o, j) => { if (p <= o) expect(adj[i]).toBeLessThanOrEqual(adj[j]); }));
        const q = 0.1;
        benjaminiHochberg(ps, q).forEach((x, i) => expect(x).toBe(adj[i] <= q));
      }),
      { numRuns, seed },
    );
  });
  it("reports something in at most about q of 4,000 runs when no pair is related (uniform chances, 100 pairs, 10 %)", () => {
    let state = 424242;
    const next = () => ((state = (state * 1664525 + 1013904223) % 4294967296), state / 4294967296);
    let any = 0;
    for (let run = 0; run < 4000; run++) if (benjaminiHochberg(Array.from({ length: 100 }, next), 0.1).some(Boolean)) any++;
    // Under no link at all the chance of any report is exactly q for this rule; 4,000 runs put it within 0.1 ± 0.012 (4 sd).
    expect(any / 4000).toBeGreaterThan(0.075);
    expect(any / 4000).toBeLessThan(0.125);
  });
});
