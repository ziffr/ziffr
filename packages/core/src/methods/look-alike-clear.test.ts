// The check of a Look-alike (spec 0053, ticket 2): SplitMix64 from its published values, Fisher-Yates and the seeds of the shuffles, the von Neumann ratio at its
// bar, c and the two bars at the step either side (with the real gap chosen from the shuffles' own), the gap of 3, a shuffle with no count of kinds, the stop at
// the first shuffle that decides, the work bound, hostile inputs, equal to the reference exactly, and properties.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fractionOf, type Fraction } from "../exact";
import { WORK_BUDGET } from "../work-bound";
import { runs } from "../test/reference/check";
import { fraction } from "../test/reference/exact";
import { drawsOf, NOISE } from "../test/reference/look-alike-sim";
import { referenceClearness, referenceOrder, referenceSlow, referenceSplitMix } from "../test/reference/look-alike-shuffles";
import { choiceOf, preparedFor, type Gap, type Prepared } from "./look-alike";
import { changesSlowly, CLEARNESS, clearnessOf, lookAlikeChecked, runWork, seedOf, shuffleOrder, shuffled, splitMix64, type CheckedLookAlike } from "./look-alike-clear";

const { seed } = runs();
// (Each case is worked out 99 times by the reference's plain search from the definitions: a few cases by default, more in a full-strength run.)
const cases = !process.env.NUMBERS_RUNS ? 6 : Number(process.env.NUMBERS_RUNS) < 100 ? 3 : Math.max(6, Math.min(60, Math.floor(Number(process.env.NUMBERS_RUNS) / 10)));

// ---- helpers ----

const month = (k: number) => new Date(Date.UTC(2020, k, 1)).toISOString().slice(0, 10);
const series = (columns: number[][]) => columns.map((c, j) => ({ id: `m${j + 1}`, points: c.map((value, k) => ({ period: month(k), value })) }));
const cents = (xs: number[][]) => xs.map((c) => c.map((x) => Math.round(x * 100) / 100));
const prepared = (columns: number[][]): Prepared => {
  const p = preparedFor(series(columns), "month");
  if ("ok" in p) throw new Error(`refused: ${p.why}`);
  return p;
};
/** Skewed Metrics (many of their shuffles have no kinds of the smallest size): a seeded case. */
const skewed = (n: number, m: number, run: number) => cents(NOISE.skewed(n, m, drawsOf(run * 13 + 5)));
const bell = (n: number, m: number, run: number) => cents(NOISE.bell(n, m, drawsOf(run * 17 + 3)));
const checked = (r: ReturnType<typeof lookAlikeChecked>): CheckedLookAlike => {
  if (!("clearness" in r)) throw new Error(`no check: ${r.why}`);
  return r;
};
const asText = (g: Gap) => (g === "endless" ? g : `${g.num}/${g.den}`);

// ---- SplitMix64 ----

describe("SplitMix64", () => {
  const take = (seed: bigint, n: number) => {
    const next = splitMix64(seed);
    return Array.from({ length: n }, next);
  };
  it("gives the published values of the reference implementation for seed 0 (hex) and seed 1234567 (decimal, as the Rust and Java ports print them)", () => {
    expect(take(BigInt(0), 3).map((x) => x.toString(16))).toEqual(["e220a8397b1dcdaf", "6e789e6aa1b965f4", "6c45d188009454f"]);
    expect(take(BigInt(1234567), 5).map(String)).toEqual(["6457827717110365317", "3203168211198807973", "9817491932198370423", "4593380528125082431", "16408922859458223821"]);
  });
  it("gives the values another implementation (Python) gave for the seeds of the shuffles and for the largest seed, and wraps modulo 2^64", () => {
    expect(take(BigInt(18), 3).map((x) => x.toString(16))).toEqual(["1120b3d00955f032", "b6d46a242257c018", "6e372283acb06862"]);
    expect(take(BigInt("0xffffffffffffffff"), 3).map((x) => x.toString(16))).toEqual(["e4d971771b652c20", "e99ff867dbf682c9", "382ff84cb27281e9"]);
    // A seed beyond 64 bits is its remainder modulo 2^64.
    expect(take((BigInt(1) << BigInt(64)) + BigInt(18), 3)).toEqual(take(BigInt(18), 3));
  });
  it("is the same sequence every time from one seed, and a different one from another", () => {
    expect(take(BigInt(99), 20)).toEqual(take(BigInt(99), 20));
    expect(take(BigInt(99), 1)).not.toEqual(take(BigInt(100), 1));
  });
  it("equals the reference on limbs of 16 bits for generated seeds", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 40 }), (s) => {
        expect(take(BigInt(s), 6).map((x) => x.toString(16).padStart(16, "0"))).toEqual(referenceSplitMix(s, 6));
      }),
      { numRuns: 300, seed },
    );
  });
});

describe("Fisher-Yates", () => {
  it("gives the orders another implementation (Python, the published definition) gave", () => {
    expect(shuffleOrder(10, BigInt(18))).toEqual([6, 5, 8, 7, 1, 9, 4, 2, 3, 0]);
    expect(shuffleOrder(24, BigInt(17))).toEqual([11, 4, 19, 13, 2, 0, 1, 9, 14, 16, 7, 22, 23, 20, 18, 10, 15, 8, 17, 21, 12, 6, 5, 3]);
    expect(shuffleOrder(12, BigInt(1585))).toEqual([0, 7, 9, 1, 5, 8, 4, 11, 3, 6, 2, 10]);
  });
  it("leaves nothing to shuffle for no place or one", () => {
    expect(shuffleOrder(0, BigInt(1))).toEqual([]);
    expect(shuffleOrder(1, BigInt(1))).toEqual([0]);
  });
  it("is always every place once, the same every time, and equal to the reference", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 70 }), fc.integer({ min: 0, max: 100000 }), (n, s) => {
        const order = shuffleOrder(n, BigInt(s));
        expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
        expect(shuffleOrder(n, BigInt(s))).toEqual(order);
        expect(order).toEqual(referenceOrder(n, s));
      }),
      { numRuns: 300, seed },
    );
  });
  it("puts every place in every position about equally often (24 places, 4,800 orders, each place in position 0 at least 120 and at most 280 times)", () => {
    const first = new Array(24).fill(0);
    for (let s = 0; s < 4800; s++) first[shuffleOrder(24, BigInt(s))[0]]++;
    expect(Math.min(...first)).toBeGreaterThanOrEqual(120);
    expect(Math.max(...first)).toBeLessThanOrEqual(280);
  });
});

describe("the shuffles of a Look-alike", () => {
  it("seeds shuffle r of the Metric in place j (2 and up) with r · 16 + j", () => {
    expect(seedOf(1, 2)).toBe(BigInt(18));
    expect(seedOf(99, 6)).toBe(BigInt(1590));
    expect(CLEARNESS.shuffles).toBe(99);
  });
  it("leaves the first Metric as it is and puts each other Metric in the order of its own seed", () => {
    const p = prepared(bell(24, 3, 1));
    for (const r of [1, 2, 50, 99]) {
      const s = shuffled(p, r);
      expect(s.values[0]).toBe(p.values[0]);
      for (const j of [1, 2]) expect(s.values[j]).toEqual(shuffleOrder(24, seedOf(r, j + 1)).map((i) => p.values[j][i]));
      expect({ ...s, values: [] }).toEqual({ ...p, values: [] });
    }
  });
  it("keeps every Metric's values (only their order changes), so its spread and weight are the same", () => {
    const p = prepared(bell(36, 4, 2));
    const s = shuffled(p, 7);
    p.values.forEach((col, j) => expect([...s.values[j]].map((f) => `${f.num}/${f.den}`).sort()).toEqual([...col].map((f) => `${f.num}/${f.den}`).sort()));
  });
});

// ---- Metrics that change slowly ----

describe("a Metric that changes slowly", () => {
  const slow = (values: number[], periods = values.map((_, i) => month(i))) => changesSlowly(values.map(fractionOf), periods, "month");
  it("is one whose von Neumann ratio is below 1/2: exactly 1/2 is not slow, below it is, above it is not", () => {
    // 0 0 1 2 2: steps 1 + 1 = 2, spread 4: ratio 1/2.
    expect(slow([0, 0, 1, 2, 2])).toBe(false);
    expect(slow([0, 0, 1, 1, 2, 2])).toBe(false);
    // 0 0 0 1 2 2 2: steps 2, spread 6: ratio 1/3.
    expect(slow([0, 0, 0, 1, 2, 2, 2])).toBe(true);
    // 0 0 2 2 2 0 2 2: more steps than half the spread.
    expect(slow([0, 0, 1, 2, 3, 3])).toBe(true);
    expect(slow([0, 1, 0, 1, 0, 1])).toBe(false);
  });
  it("reads a running total as slow and values that do not follow their own past as not slow", () => {
    expect(slow(Array.from({ length: 30 }, (_, i) => i * i))).toBe(true);
    expect(slow(Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 10 : 0)))).toBe(false);
  });
  it("counts only steps between periods that follow one another: a missing period breaks the step", () => {
    const values = [0, 0, 0, 1, 1, 1];
    // The jump from 0 to 1 is a step (ratio 2/3, not slow) with no period missing between, and none (ratio 0, slow) with three missing.
    expect(slow(values, ["2020-01-01", "2020-02-01", "2020-03-01", "2020-04-01", "2020-05-01", "2020-06-01"])).toBe(false);
    expect(slow(values, ["2020-01-01", "2020-02-01", "2020-03-01", "2020-06-01", "2020-07-01", "2020-08-01"])).toBe(true);
    // A year end is a step (December to January follow one another), and a period skipped just before it is not.
    expect(slow(values, ["2020-10-01", "2020-11-01", "2020-12-01", "2021-01-01", "2021-02-01", "2021-03-01"])).toBe(false);
    expect(slow(values, ["2020-10-01", "2020-11-01", "2020-12-01", "2021-02-01", "2021-03-01", "2021-04-01"])).toBe(true);
  });
  it("is worked out on exact fractions of any decimals, and a Metric that does not vary is never slow", () => {
    expect(slow([0, 0.1, 0.30000000000000004, 0.4, 0.6, 0.7, 0.9, 1])).toBe(true);
    expect(slow([5, 5, 5, 5])).toBe(false);
  });
  it("equals the reference on generated values and periods", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -9, max: 9 }), { minLength: 3, maxLength: 24 }), fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 24, maxLength: 24 }), (values, skips) => {
        let k = 0;
        const periods = values.map((_, i) => month((k += 1 + (skips[i] === 2 ? 1 : 0))));
        expect(slow(values, periods)).toBe(referenceSlow(values.map((v) => fraction(BigInt(v), 1n)), periods, "month"));
      }),
      { numRuns: 400, seed },
    );
  });
});

// ---- c and the bars ----

describe("the bars", () => {
  // The gaps of every shuffle of a case, largest first (a shuffle with no count of kinds has none).
  const gapsOf = (p: Prepared) => {
    const out: Gap[] = [];
    for (let r = 1; r <= 99; r++) {
      const c = choiceOf(shuffled(p, r), null);
      if (c.ok) out.push(c.gap);
    }
    return out;
  };
  const value = (g: Gap) => (g === "endless" ? Infinity : Number(g.num) / Number(g.den));
  const p = prepared(bell(24, 3, 7));
  const sorted = gapsOf(p).sort((a, b) => value(b) - value(a));
  const real = (k: number): Gap => sorted[k - 1];

  it("has distinct gaps among the shuffles of the case used below (so c is the position of the real gap)", () => {
    expect(new Set(sorted.map(asText)).size).toBe(sorted.length);
    expect(sorted.length).toBeGreaterThan(90);
  });
  it("counts c as the shuffles whose gap² is at least the real gap²: a real gap equal to a shuffle's counts that shuffle", () => {
    const c = (k: number) => clearnessOf(p, real(k), null, false, 0).reached;
    expect([1, 2, 3, 4, 10, 90].map(c)).toEqual([1, 2, 3, 4, 10, 90]);
  });
  it("beats the shuffles with c of 3 and not with c of 4 ((1 + c) ÷ 100 at most 1/25), whatever the gap is, and works all 99", () => {
    const [yes, no] = [clearnessOf(p, real(3), null, false, 0), clearnessOf(p, real(4), null, false, 0)];
    expect([yes.beaten, no.beaten]).toEqual([true, false]);
    expect([yes.allowed, no.allowed]).toEqual([3, 3]);
    expect([yes.ran, no.ran, yes.shuffles]).toEqual([99, 99, 99]);
  });
  it("is clear only with the gap at least 3 as well: gap² of 9 passes, a hair below does not, an endless gap passes", () => {
    const top: Gap = { num: BigInt(1000), den: BigInt(1) };
    expect(clearnessOf(p, top, null, false, 0)).toMatchObject({ reached: 0, beaten: true, wide: true, clear: true });
    const nine: Gap = { num: BigInt(9), den: BigInt(1) };
    const below: Gap = { num: BigInt(8999), den: BigInt(1000) };
    const [a, b] = [clearnessOf(p, nine, null, false, 0), clearnessOf(p, below, null, false, 0)];
    // (Both have more than 3 shuffles at or above them: beaten is false there, so only `wide` is read.)
    expect([a.wide, b.wide]).toEqual([true, false]);
    expect(clearnessOf(p, "endless", null, false, 0)).toMatchObject({ reached: 0, beaten: true, wide: true, clear: true });
    // Beaten but narrow: not clear.
    const quiet = clearnessOf(p, { num: BigInt(5), den: BigInt(1) }, null, false, 0);
    expect(quiet.wide).toBe(false);
    expect(quiet.clear).toBe(false);
    // Wide but not beaten: not clear.
    expect(clearnessOf(p, real(4), null, false, 0)).toMatchObject({ beaten: false, clear: false });
  });
  it("asks for no more than c = 0 when a Metric changes slowly (the bar 1/100), and says which Metrics are slow", () => {
    // The second Metric is a running total: its trend is read away and what is left stays slow; the first is noise.
    const columns = bell(36, 2, 3);
    columns[1] = columns[1].map((_, i) => i * i);
    const q = prepared(columns);
    const sortedGaps = gapsOf(q).sort((a, b) => value(b) - value(a));
    const one = clearnessOf(q, sortedGaps[0], null, false, 0);
    expect(one.slow).toEqual(["m2"]);
    expect(one).toMatchObject({ allowed: 0, reached: 1, beaten: false });
    const above = sortedGaps[0] as Fraction;
    const none = clearnessOf(q, { num: above.num * BigInt(2), den: above.den }, null, false, 0);
    expect(none).toMatchObject({ allowed: 0, reached: 0, beaten: true });
    // Without a slow Metric the same c of 1 is let through.
    expect(clearnessOf(p, real(1), null, false, 0)).toMatchObject({ slow: [], allowed: 3, beaten: true });
  });
  it("counts a shuffle that has no count of kinds big enough as one that does not reach the real gap", () => {
    const sk = prepared(skewed(24, 2, 5));
    let none = 0;
    for (let r = 1; r <= 99; r++) if (!choiceOf(shuffled(sk, r), null).ok) none++;
    expect(none).toBeGreaterThan(0);
    const reached = clearnessOf(sk, { num: BigInt(0), den: BigInt(1) }, null, false, 0).reached;
    expect(reached).toBe(99 - none);
  });
  it("stops at the first shuffle that decides when asked (more than `allowed` reached it), with the same verdict as the full run", () => {
    const k = clearnessOf(p, real(4), null, true, 0);
    expect(k).toMatchObject({ beaten: false, clear: false, reached: 4 });
    expect(k.ran).toBeLessThan(99);
    // Clear cases are always worked out in full.
    expect(clearnessOf(p, real(3), null, true, 0)).toMatchObject({ ran: 99, reached: 3, beaten: true });
    expect(clearnessOf(p, real(3), null, true, 0)).toEqual(clearnessOf(p, real(3), null, false, 0));
  });
});

// ---- the whole, and the work bound ----

describe("a Look-alike with its check", () => {
  it("gives the Look-alike of the Method and, with it, the check", () => {
    const r = checked(lookAlikeChecked(series(bell(24, 2, 1)), "month"));
    expect(r.kinds.length).toBe(r.shown);
    expect(r.clearness).toMatchObject({ shuffles: 99, ran: 99 });
    expect(r.clearness.clear).toBe(r.clearness.beaten && r.clearness.wide);
  });
  it("gives the same result twice, whatever order the Metrics were given in, and with the early stop the same verdict", () => {
    const s = series(bell(30, 3, 4));
    const a = lookAlikeChecked(s, "month");
    expect(lookAlikeChecked(s, "month")).toEqual(a);
    expect(lookAlikeChecked([s[2], s[0], s[1]], "month")).toEqual(a);
    const e = checked(lookAlikeChecked(s, "month", { early: true }));
    expect(e.clearness.clear).toBe(checked(a).clearness.clear);
  });
  it("finds kinds planted in four Metrics clear and noise not", () => {
    const d = drawsOf(5);
    const planted = cents(Array.from({ length: 4 }, () => Array.from({ length: 24 }, (_, k) => 100 + 10 * (d.z() + (k % 2 === 0 ? 0 : 5)))));
    expect(checked(lookAlikeChecked(series(planted), "month")).clearness).toMatchObject({ clear: true, reached: 0 });
    expect(checked(lookAlikeChecked(series(bell(24, 4, 11)), "month")).clearness.clear).toBe(false);
  });
  it("passes the person's count on to the shuffles (the same count is asked of every shuffle)", () => {
    const s = series(bell(30, 2, 9));
    const r = checked(lookAlikeChecked(s, "month", { kinds: 3 }));
    expect(r.asked).toBe(3);
    expect(r.shown).toBeLessThanOrEqual(3);
    const p = prepared(bell(30, 2, 9));
    expect(r.clearness.reached).toBe(clearnessOf(p, r.gap, 3, false, 0).reached);
  });
  it("refuses as the Method refuses, with no check: too few or too many Metrics, too few periods, a Metric that does not vary, a count that is not 2 to 4", () => {
    const why = (r: ReturnType<typeof lookAlikeChecked>) => ("why" in r ? r.why : "none");
    expect(why(lookAlikeChecked(series(bell(24, 1, 1)), "month"))).toBe("metrics");
    expect(why(lookAlikeChecked(series(bell(24, 5, 1)), "month"))).toBe("too-many");
    expect(why(lookAlikeChecked(series(bell(18, 2, 1)), "month"))).toBe("periods");
    expect(why(lookAlikeChecked(series([bell(24, 1, 1)[0], Array(24).fill(5)]), "month"))).toBe("constant");
    expect(why(lookAlikeChecked(series(bell(24, 2, 1)), "month", { kinds: 5 }))).toBe("kinds");
    expect(why(lookAlikeChecked(series([[...bell(24, 1, 1)[0].slice(0, 23), 1e40], bell(24, 1, 2)[0]]), "month"))).toBe("wide");
  });
  it("gives no check where no count of kinds has kinds of the smallest size (the Method's refusal `no-split`)", () => {
    const columns = Array.from({ length: 2 }, () => Array.from({ length: 24 }, (_, k) => (k === 3 ? 1000 : 10 + (k % 3))));
    expect("why" in lookAlikeChecked(series(columns), "month")).toBe(true);
  });
});

describe("the work bound", () => {
  const big = (n: number, m: number, f: (z: () => number) => number) => {
    const d = drawsOf(2);
    return Array.from({ length: m }, () => Array.from({ length: n }, () => f(d.z)));
  };
  it("counts one run as n³ · Metrics · (1 + the widest value's size)², the size being 1 for any value in a machine word", () => {
    const p = prepared(bell(24, 3, 1));
    expect(runWork(p)).toBe(24 ** 3 * 3 * 4);
    const wide = prepared([...bell(24, 2, 1).map((c) => c.map((v) => v * 1e25)), Array.from({ length: 24 }, (_, k) => k * 1e14 + (k % 5))]);
    expect(runWork(wide)).toBeGreaterThan(runWork(p));
  });
  it("takes 6 Metrics over 60 periods of values to the cent well within a third of the work budget, and the allowance is the Methods' own", () => {
    const work = runWork(prepared(cents(big(60, 6, (z) => 100 + 10 * z()))));
    expect(work * 100).toBeLessThan(WORK_BUDGET / 3);
  });
  it("refuses in words (`work`) a run that would spend more than its allowance, however small, and never gives fewer shuffles", () => {
    const s = series(bell(30, 3, 1));
    const need = runWork(prepared(bell(30, 3, 1)));
    // The real kinds and the 99 shuffles are 100 runs of `need` each (and what `lowestTerms` counts besides): one run less than that is refused, twice that is not.
    expect(lookAlikeChecked(s, "month", { allowance: need * 100 - 1 })).toEqual({ ok: false, why: "work" });
    expect(checked(lookAlikeChecked(s, "month", { allowance: need * 200 })).clearness.ran).toBe(99);
    expect(lookAlikeChecked(s, "month", { allowance: 0 })).toEqual({ ok: false, why: "work" });
  });
  it("refuses fast a run of the slowest kind (6 Metrics, 60 periods, values of 24 orders of magnitude with 17 digits each) in words, and values wider than that before any arithmetic", () => {
    const d = drawsOf(3);
    // Half the periods large and half small, so that there are two kinds of 30 and the Method gets as far as the shuffles.
    const digits17 = () => Number((1 + d.u()).toPrecision(17));
    const slowest = Array.from({ length: 6 }, () => Array.from({ length: 60 }, (_, k) => digits17() * (k % 2 === 0 ? 1e12 : 1e-12)));
    const t = Date.now();
    const r = lookAlikeChecked(series(slowest), "month");
    expect(r).toEqual({ ok: false, why: "work" });
    // The deterministic guarantee is the refusal above; the time is only looked at where asked for (RECIPE_CALIBRATION=1).
    if (process.env.RECIPE_CALIBRATION === "1") expect(Date.now() - t).toBeLessThan(3000);
    const places = series([bell(24, 1, 1)[0], Array.from({ length: 24 }, (_, k) => (k === 5 ? 1e-41 : k))]);
    expect(lookAlikeChecked(places, "month")).toEqual({ ok: false, why: "wide" });
  });
  it("spends the same on every run (it counts digits, not seconds): the same input is refused or answered the same twice", () => {
    const s = series(bell(24, 2, 1));
    const need = runWork(prepared(bell(24, 2, 1)));
    for (const a of [need * 100 - 1, need * 200]) expect(lookAlikeChecked(s, "month", { allowance: a })).toEqual(lookAlikeChecked(s, "month", { allowance: a }));
  });
  it("measures the time per unit of work only where asked for (RECIPE_CALIBRATION=1): cents, doubles and long values stay within a factor of 4 of each other", () => {
    if (process.env.RECIPE_CALIBRATION !== "1") return;
    const rate = (columns: number[][]) => {
      const s = series(columns);
      const t = process.hrtime.bigint();
      const r = lookAlikeChecked(s, "month", { allowance: Infinity });
      if (!("clearness" in r)) throw new Error("no check");
      return Number(process.hrtime.bigint() - t) / runWork(prepared(columns)) / 100;
    };
    const d = drawsOf(8);
    const rates = [rate(cents(big(36, 3, (z) => 100 + 10 * z()))), rate(big(36, 3, (z) => 100 + 10 * z())), rate(big(36, 3, (z) => 1e-20 * (1 + z() ** 2) + z() * 1e12 * d.u()))];
    expect(Math.max(...rates) / Math.min(...rates)).toBeLessThan(4);
  });
});

// ---- against the reference ----

describe("the check against the reference", () => {
  // Noise columns and columns in kinds (so there are clear cases among them), a few ties, trending Metrics and gaps in the periods.
  const columnsArb = (n: number, m: number) =>
    fc.oneof(
      fc.array(fc.array(fc.integer({ min: 0, max: 40 }), { minLength: n, maxLength: n }), { minLength: m, maxLength: m }),
      fc
        .tuple(fc.array(fc.integer({ min: 0, max: 2 }), { minLength: n, maxLength: n }), fc.array(fc.array(fc.integer({ min: -30, max: 30 }), { minLength: 3, maxLength: 3 }), { minLength: m, maxLength: m }), fc.array(fc.array(fc.integer({ min: -4, max: 4 }), { minLength: n, maxLength: n }), { minLength: m, maxLength: m }))
        .map(([kind, centres, noise]) => centres.map((c, j) => kind.map((k, i) => c[k] + noise[j][i]))),
      fc
        .tuple(fc.array(fc.array(fc.integer({ min: -9, max: 9 }), { minLength: n, maxLength: n }), { minLength: m, maxLength: m }), fc.array(fc.integer({ min: 0, max: 3 }), { minLength: m, maxLength: m }))
        .map(([noise, slopes]) => noise.map((c, j) => c.map((v, i) => v + slopes[j] * i))),
    );
  it("agrees exactly with the reference: c, the Metrics that change slowly, the gap and the verdict, on all 99 shuffles", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 24, max: 30 }).chain((n) => fc.integer({ min: 2, max: 3 }).chain((m) => fc.tuple(columnsArb(n, m), fc.constantFrom<number | null>(null, null, 2, 3, 4)))),
        ([columns, asked]) => {
          const s = series(columns);
          const ref = referenceClearness(s, "month", asked);
          const got = lookAlikeChecked(s, "month", { kinds: asked });
          if (ref === null) {
            expect("clearness" in got).toBe(false);
            return;
          }
          const r = checked(got);
          expect({ reached: r.clearness.reached, slow: r.clearness.slow, allowed: r.clearness.allowed, beaten: r.clearness.beaten, wide: r.clearness.wide, clear: r.clearness.clear, gap: asText(r.gap) }).toEqual(ref);
        },
      ),
      { numRuns: cases, seed },
    );
  }, 900_000);
  it("agrees exactly with the reference on skewed values, where many shuffles have no count of kinds big enough", () => {
    for (const run of [1, 2, 4, 5]) {
      const s = series(skewed(24, 2, run));
      const ref = referenceClearness(s, "month", null);
      const got = lookAlikeChecked(s, "month");
      if (ref === null) expect("clearness" in got).toBe(false);
      else expect(checked(got).clearness.reached).toBe(ref.reached);
    }
  }, 300_000);
});

// ---- properties ----

describe("properties", () => {
  const caseArb = fc.integer({ min: 0, max: 400 }).map((run) => series(bell(24, 3, run)));
  const same = (a: ReturnType<typeof lookAlikeChecked>, b: ReturnType<typeof lookAlikeChecked>) => {
    expect("clearness" in a).toBe("clearness" in b);
    if ("clearness" in a && "clearness" in b) expect(b.clearness).toEqual(a.clearness);
    else expect(b).toEqual(a);
  };
  it("is unchanged by a positive factor or an added number on a Metric, and by the Metrics in another order", () => {
    fc.assert(
      fc.property(caseArb, fc.integer({ min: 1, max: 9 }), fc.integer({ min: -500, max: 500 }), fc.integer({ min: 0, max: 2 }), (s, factor, shift, which) => {
        const base = lookAlikeChecked(s, "month", { early: true });
        const changed = s.map((x, j) => (j === which ? { ...x, points: x.points.map((p) => ({ ...p, value: p.value * factor + shift })) } : x));
        // (A factor and a shift on cents keep them exact only to a double's rounding; compare on whole numbers.)
        const whole = s.map((x) => ({ ...x, points: x.points.map((p) => ({ ...p, value: Math.round(p.value * 100) })) }));
        const wholeBase = lookAlikeChecked(whole, "month", { early: true });
        const scaled = whole.map((x, j) => (j === which ? { ...x, points: x.points.map((p) => ({ ...p, value: p.value * factor + shift })) } : x));
        same(wholeBase, lookAlikeChecked(scaled, "month", { early: true }));
        same(base, lookAlikeChecked([...s].reverse(), "month", { early: true }));
        expect(changed.length).toBe(s.length);
      }),
      { numRuns: Math.min(cases, 20), seed },
    );
  }, 300_000);
  it("never says clear with a caution that it cannot back: clear needs c of at most 3 (0 with a slow Metric) and a gap² of at least 9, and the early stop never changes the verdict", () => {
    fc.assert(
      fc.property(caseArb, (s) => {
        const [full, early] = [lookAlikeChecked(s, "month"), lookAlikeChecked(s, "month", { early: true })];
        if (!("clearness" in full) || !("clearness" in early)) return;
        const c = full.clearness;
        expect(c.clear).toBe(c.reached <= (c.slow.length > 0 ? 0 : 3) && (full.gap === "endless" || full.gap.num >= BigInt(9) * full.gap.den));
        expect(early.clearness.clear).toBe(c.clear);
        expect(early.clearness.reached).toBeLessThanOrEqual(c.reached);
      }),
      { numRuns: Math.min(cases * 2, 30), seed },
    );
  }, 300_000);
});
