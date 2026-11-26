// Look-alike (spec 0053, ticket 1, Method `lookAlike`): the hand-worked case of the spec with every cost as a fraction (checked in Python's `fractions`),
// ties, a count that cannot be made, the naming table one step either side, the time of year, the periods as runs, the series (the common periods, the
// basis of each Metric, the minimums), equal to the reference exactly on generated cases, and properties.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Fraction } from "../exact";
import { fractionOf } from "../exact";
import type { Span, YearStart } from "../periods";
import { runs } from "../test/reference/check";
import { dayOf, monthsLater, textOf } from "../test/reference/calendar";
import { fraction } from "../test/reference/exact";
import { referenceGap, referenceKinds, referenceLookAlike, type ReferenceView } from "../test/reference/look-alike";
import { choiceOf, cliffLevel, compareGaps, gapOf, kindsOf, LOOK_ALIKE, lookAlike, nameKinds, periodRuns, readLookAlike, seasonOf, type Gap, type LookAlike, type LookAlikeRefusal, type Prepared } from "./look-alike";

const { seed } = runs();
// Generated cases: 500 by default; a full-strength run (NUMBERS_RUNS of 200 or more) takes the larger of that and 500; mutation testing (a few) takes what it is given.
const cases = !process.env.NUMBERS_RUNS ? 500 : Number(process.env.NUMBERS_RUNS) >= 200 ? Math.max(500, Number(process.env.NUMBERS_RUNS)) : Number(process.env.NUMBERS_RUNS);

// ---- helpers ----

const frac = (f: Fraction) => `${f.num}/${f.den}`;
const gapText = (g: Gap) => (g === "endless" ? g : frac(g));
const month = (i: number) => textOf(monthsLater(dayOf("2020-01-01"), i));

/** Prepared values from columns of numbers: monthly from January 2020, the Metrics "a", "b", … in order. */
function prep(columns: number[][], over: Partial<Prepared> = {}): Prepared {
  return { span: "month", periods: columns[0].map((_, i) => month(i)), ids: columns.map((_, j) => "abcdefgh"[j]), reading: columns.map(() => "values"), values: columns.map((c) => c.map(fractionOf)), ...over };
}

const ok = <T extends { ok?: boolean }>(r: T | LookAlikeRefusal): T => {
  if ("why" in r) throw new Error(`refused: ${r.why}`);
  return r as T;
};

/** A result as the reference writes it. */
function view(r: LookAlike): ReferenceView {
  return {
    periods: r.periods,
    ids: r.ids,
    reading: r.reading,
    asked: r.asked,
    shown: r.shown,
    smallest: r.smallest,
    labels: r.labels,
    gap: gapText(r.gap),
    pairs: r.pairs.map((p) => [p.a, p.b, gapText(p.gap)]),
    tried: r.tried.map((t) => [t.count, gapText(t.gap)]),
    merges: r.merges.map((m) => [m.left, m.right, frac(m.cost)]),
    kinds: r.kinds.map((k) => ({
      number: k.number,
      periods: k.periods,
      runs: k.runs.map((x) => [x.from, x.to]),
      counts: k.counts.map(frac),
      marks: k.marks.map((m) => [m.metric, m.level, frac(m.count)]),
      ordinal: k.ordinal,
      season: k.season && { places: k.season.places, runs: k.season.runs.map((x) => [x.from, x.to]) },
    })),
  };
}

/** The reference's rows for the same prepared values. */
const rowsOf = (p: Prepared) => p.periods.map((_, i) => p.values.map((col) => fraction(col[i].num, col[i].den)));

function same(p: Prepared, asked: number | null, yearStart: YearStart = 1) {
  const got = kindsOf(p, { kinds: asked, yearStart });
  const ref = referenceKinds({ span: p.span, periods: p.periods, ids: p.ids, reading: p.reading, values: rowsOf(p) }, asked, yearStart);
  if ("refused" in ref) {
    expect("why" in got ? got.why : "kinds").toBe(ref.refused);
    return null;
  }
  expect(view(ok(got) as LookAlike)).toEqual(ref);
  return got as LookAlike;
}

// ---- the hand-worked case of the spec ----

describe("the hand-worked case: 6 periods, 2 Metrics", () => {
  // Returns 10, 12, 11, 30, 32, 31 and Support tickets 5, 6, 5, 20, 21, 19 (every fraction worked out in Python's `fractions`).
  const p = prep([[10, 12, 11, 30, 32, 31], [5, 6, 5, 20, 21, 19]]);
  const result = ok(kindsOf(p)) as LookAlike;

  it("joins periods 1 and 3, 4 and 6, {1, 3} and 2, {4, 6} and 5, and the two kinds, at these costs", () => {
    expect(result.merges.map((m) => [m.left.map((i) => i + 1), m.right.map((i) => i + 1), frac(m.cost)])).toEqual([
      [[1], [3], "3/604"],
      [[4], [6], "2091/147376"],
      [[1, 3], [2], "501/18422"],
      [[4, 6], [5], "6273/147376"],
      [[1, 2, 3], [4, 5, 6], "109713/9211"],
    ]);
  });

  it("has the gap squared 10699504328/24093453 (a gap of about 21.1) between {1, 2, 3} and {4, 5, 6}, and shows 2 kinds", () => {
    expect(result.shown).toBe(2);
    expect(result.labels).toEqual([1, 1, 1, 2, 2, 2]);
    expect(gapText(result.gap)).toBe("10699504328/24093453");
    expect(Math.sqrt(10699504328 / 24093453)).toBeCloseTo(21.07, 2);
    expect(result.tried.map((t) => t.count)).toEqual([2]);
    expect(result.smallest).toBe(3);
  });

  it("marks the first kind very low and the second very high on both Metrics, Returns first on a tie of sizes", () => {
    expect(result.kinds.map((k) => k.counts.map(frac))).toEqual([["-1/1", "-1/1"], ["1/1", "1/1"]]);
    expect(result.kinds.map((k) => k.marks.map((m) => [m.metric, m.level]))).toEqual([[["a", "very-low"], ["b", "very-low"]], [["a", "very-high"], ["b", "very-high"]]]);
    expect(result.kinds.map((k) => k.ordinal)).toEqual([null, null]);
  });

  it("shows 2 kinds for a count asked of 3 or 4 (a third kind could hold at most 2 periods), and 2 asked for", () => {
    for (const asked of [2, 3, 4]) {
      const r = ok(kindsOf(p, { kinds: asked })) as LookAlike;
      expect([r.asked, r.shown]).toEqual([asked, 2]);
    }
  });

  it("is the reference's, down to every fraction", () => {
    same(p, null);
  });
});

describe("Ward's tie rule", () => {
  // Costs equal to the last fraction: the pair with the earlier earliest period goes first (periods 1 and 2 before 4 and 5, then 3 joins {1, 2} before 6 joins {4, 5}), then the pair whose other kind has the earlier earliest period.
  it("joins the pair with the earlier earliest period first when two costs are equal", () => {
    const r = ok(choiceOf(prep([[0, 2, 5, 40, 42, 45]]), null));
    expect(r.merges.map((m) => [m.left.map((i) => i + 1), m.right.map((i) => i + 1), frac(m.cost)])).toEqual([
      [[1], [2], "9/1819"],
      [[4], [5], "9/1819"],
      [[1, 2], [3], "48/1819"],
      [[4, 5], [6], "48/1819"],
      [[1, 2, 3], [4, 5, 6], "10800/1819"],
    ]);
  });
  it("joins period 1 with period 3 rather than 4 when both cost the same (the other kind's earlier earliest period)", () => {
    const r = ok(choiceOf(prep([[0, 100, 3, -3, 200, 300]]), null));
    expect(r.merges.map((m) => [m.left.map((i) => i + 1), m.right.map((i) => i + 1), frac(m.cost)])).toEqual([
      [[1], [3], "27/80018"],
      [[1, 3], [4], "81/80018"],
      [[2], [5], "15000/40009"],
      [[2, 5], [6], "45000/40009"],
      [[1, 3, 4], [2, 5, 6], "180000/40009"],
    ]);
    same(prep([[0, 100, 3, -3, 200, 300]]), null);
  });
  it("gives the same kinds in whatever order the periods are given, and numbers them by their earliest period", () => {
    const [a, b] = [[0, 100, 3, -3, 200, 300], [1, 9, 2, 1, 8, 9]];
    const series = (order: number[]) => [
      { id: "a", points: order.map((i) => ({ period: month(i), value: a[i] })) },
      { id: "b", points: order.map((i) => ({ period: month(i), value: b[i] })) },
    ];
    const [x, y] = [readLookAlike(series([0, 1, 2, 3, 4, 5]), "month"), readLookAlike(series([5, 3, 1, 4, 0, 2]), "month")];
    expect(y).toEqual(x);
    const r = ok(kindsOf(x)) as LookAlike;
    expect(r.labels).toEqual([1, 2, 1, 1, 2, 2]);
  });
});

describe("the count of kinds", () => {
  // 12 periods and 2 Metrics where the kinds at 3 and at 4 stand equally far apart (a gap squared of 12) and further than 2 (about 9.6).
  const p = prep([[1, 1, 0, 3, 2, 3, 3, 0, 0, 0, 2, 2], [0, 2, 0, 3, 2, 3, 3, 1, 3, 2, 1, 2]]);
  it("takes the count whose kinds stand furthest apart, the smaller on a tie", () => {
    const r = ok(kindsOf(p)) as LookAlike;
    expect(r.tried.map((t) => [t.count, gapText(t.gap)])).toEqual([[2, "76667536/8016231"], [3, "12/1"], [4, "12/1"]]);
    expect(r.shown).toBe(3);
    expect(r.kinds.map((k) => k.places.map((i) => i + 1))).toEqual([[1, 3, 8], [2, 9, 10], [4, 5, 6, 7, 11, 12]]);
    same(p, null);
  });
  it("uses the count asked for, and is nested: each kind of 4 lies inside a kind of 3, each of 3 inside one of 2", () => {
    const [two, three, four] = [2, 3, 4].map((k) => ok(kindsOf(p, { kinds: k })) as LookAlike);
    expect([two.asked, three.asked, four.asked]).toEqual([2, 3, 4]);
    expect([two.shown, three.shown, four.shown]).toEqual([2, 3, 4]);
    expect(four.tried.map((t) => t.count)).toEqual([4]);
    const inside = (fine: LookAlike, coarse: LookAlike) => fine.kinds.every((k) => new Set(k.places.map((i) => coarse.labels[i])).size === 1);
    expect(inside(four, three)).toBe(true);
    expect(inside(three, two)).toBe(true);
  });
  it("refuses a count that is not a whole number from 2 to 4", () => {
    for (const asked of [1, 5, 2.5, NaN, -3]) expect(kindsOf(p, { kinds: asked })).toEqual({ ok: false, why: "kinds" });
  });
  it("shows a smaller count when the asked one would leave a kind under the minimum, and none when no count fits", () => {
    // 36 periods ask for kinds of at least 6: a kind of 5 in the split into 4 leaves 5.
    const [a, b] = [Array.from({ length: 36 }, (_, i) => (i < 5 ? 0 : i < 20 ? 50 : 100) + (i % 3)), Array.from({ length: 36 }, (_, i) => (i % 5))];
    const r = ok(kindsOf(prep([a, b]), { kinds: 4 })) as LookAlike;
    expect(r.smallest).toBe(6);
    expect(r.kinds.every((k) => k.places.length >= 6)).toBe(true);
    expect(r.shown).toBeLessThanOrEqual(4);
    // 5 periods cannot make two kinds of 3.
    expect(kindsOf(prep([[1, 2, 3, 40, 50], [1, 2, 4, 40, 55]]))).toEqual({ ok: false, why: "no-split" });
    expect(kindsOf(prep([[1, 2, 3, 40, 50, 60, 1], [1, 2, 4, 40, 55, 5, 6]]), { kinds: 2 })).toMatchObject({ ok: true });
  });
  it("asks for kinds of at least 3 periods up to 30 periods and at least n ÷ 6 rounded up above that", () => {
    const smallest = (n: number) => ok(kindsOf(prep([Array.from({ length: n }, (_, i) => i * i % 17), Array.from({ length: n }, (_, i) => (i * 7) % 13)]))) as LookAlike;
    const tried = (n: number) => {
      const r = kindsOf(prep([Array.from({ length: n }, (_, i) => (i % 2) * 40 + (i % 5)), Array.from({ length: n }, (_, i) => ((i + 1) % 2) * 30 + (i % 3))]));
      return "smallest" in r ? r.smallest : 0;
    };
    expect([6, 18, 24, 25, 30, 31, 36, 37, 60].map(tried)).toEqual([3, 3, 3, 3, 3, 6, 6, 7, 10]);
    expect(smallest(24).smallest).toBe(3);
  });
});

describe("the gap", () => {
  it("is endless for two kinds with no spread at all along the line that joins their middles", () => {
    const p = prep([[0, 0, 0, 5, 5, 5], [1, 1, 1, 7, 7, 7]]);
    expect(gapOf(p, [0, 1, 2], [3, 4, 5])).toBe("endless");
    const r = ok(kindsOf(p)) as LookAlike;
    expect(r.gap).toBe("endless");
    expect(r.pairs).toEqual([{ a: 1, b: 2, gap: "endless" }]);
  });
  it("is 0 for two kinds with the same middle", () => {
    const p = prep([[0, 2, 1, 0, 2, 1]]);
    expect(gapText(gapOf(p, [0, 1, 2], [3, 4, 5]) as Gap)).toBe("0/1");
    expect(referenceGap(rowsOf(p), [0, 1, 2], [3, 4, 5])).toBe("0/1");
  });
  it("is the reference's for kinds given by hand, and refused for a Metric that does not vary", () => {
    const p = prep([[1, 4, 2, 9, 7, 8, 3], [2, 2, 5, 1, 7, 3, 3]]);
    expect(gapText(gapOf(p, [0, 1, 2], [3, 4, 5, 6]) as Gap)).toBe(referenceGap(rowsOf(p), [0, 1, 2], [3, 4, 5, 6]));
    expect(gapOf(prep([[1, 2, 3, 4], [5, 5, 5, 5]]), [0, 1], [2, 3])).toEqual({ ok: false, why: "constant", metric: "b" });
  });
  it("orders gaps with an endless one above every fraction", () => {
    const [a, b] = [{ num: BigInt(1), den: BigInt(3) }, { num: BigInt(2), den: BigInt(6) }];
    const c = { num: BigInt(2), den: BigInt(5) };
    expect([compareGaps(a, b), compareGaps(a, c), compareGaps(c, a), compareGaps("endless", a), compareGaps(a, "endless"), compareGaps("endless", "endless")]).toEqual([0, -1, 1, 1, -1, 0]);
  });
});

describe("values with different numbers of decimals", () => {
  it("are put on one denominator per Metric without changing a result", () => {
    const p = prep([[0.5, 0.25, 0.125, 10, 10.5, 11.25], [1, 2.5, 1.75, 8, 9.125, 7]]);
    const r = same(p, null)!;
    expect(r.labels).toEqual([1, 1, 1, 2, 2, 2]);
  });
});

describe("a Metric that does not vary", () => {
  it("makes no kinds from fewer than 4 periods, and does not fail", () => {
    expect(kindsOf(prep([[1, 5, 9], [2, 7, 1]]))).toEqual({ ok: false, why: "no-split" });
    expect(kindsOf(prep([[1], [2]]))).toEqual({ ok: false, why: "constant", metric: "a" });
  });
  it("is refused by its id, and no kinds are made", () => {
    expect(kindsOf(prep([[1, 2, 3, 4, 5, 6], [7, 7, 7, 7, 7, 7]]))).toEqual({ ok: false, why: "constant", metric: "b" });
    expect(choiceOf(prep([[3, 3, 3, 3, 3, 3], [1, 2, 3, 4, 5, 6]]), null)).toEqual({ ok: false, why: "constant", metric: "a" });
  });
  it("is refused when no Metric is given", () => {
    expect(kindsOf({ span: "month", periods: [], ids: [], reading: [], values: [] })).toEqual({ ok: false, why: "metrics" });
  });
});

// ---- naming ----

describe("Cliff's count and its words", () => {
  const f = (n: number, d: number): Fraction => ({ num: BigInt(n), den: BigInt(d) });
  it("reads 4/5 as very high, 1/2 as high, −1/2 as low, −4/5 as very low, and one step either side of each", () => {
    const table: [Fraction, string | null][] = [
      [f(1, 1), "very-high"],
      [f(4, 5), "very-high"],
      [f(79, 100), "high"],
      [f(3, 4), "high"],
      [f(1, 2), "high"],
      [f(49, 100), null],
      [f(0, 1), null],
      [f(-49, 100), null],
      [f(-1, 2), "low"],
      [f(-3, 4), "low"],
      [f(-79, 100), "low"],
      [f(-4, 5), "very-low"],
      [f(-1, 1), "very-low"],
      [f(8, 10), "very-high"],
      [f(-8, 10), "very-low"],
    ];
    for (const [count, word] of table) expect(cliffLevel(count), frac(count)).toBe(word);
  });
  it("is counted over every pair of a period in the kind and a period outside it", () => {
    // Kind {1, 2, 3} on values 5, 5, 9 against 5, 7, 8: pairs: 5 against 5, 7, 8 is 0 − 1 − 1; 5 the same; 9 against 5, 7, 8 is +3; net −3 + ... = −2 + 3 = −1 of 9.
    const r = ok(kindsOf(prep([[5, 5, 9, 5, 7, 8], [1, 1, 1, 9, 9, 9]]), { kinds: 2 })) as LookAlike;
    expect(r.kinds[0].periods).toEqual([month(0), month(1), month(2)]);
    expect(r.kinds[0].counts.map(frac)).toEqual(["-1/9", "-1/1"]);
  });
  it("names a kind by at most two Metrics: the largest sizes first, a tie by the id, a third Metric with a word left out", () => {
    // Kind 1 is −1 on a and on c, −7/9 (low) on b: a and c are named, b is not, though it has a word.
    const p = prep([[0, 1, 2, 10, 11, 12], [0, 1, 2, 3, 4, 1.5], [5, 6, 7, 20, 21, 22]]);
    const r = ok(kindsOf(p, { kinds: 2 })) as LookAlike;
    expect(r.kinds[0].counts.map(frac)).toEqual(["-1/1", "-7/9", "-1/1"]);
    expect(r.kinds[0].marks.map((m) => [m.metric, m.level, frac(m.count)])).toEqual([["a", "very-low", "-1/1"], ["c", "very-low", "-1/1"]]);
    expect(r.kinds[1].marks.map((m) => [m.metric, m.level])).toEqual([["a", "very-high"], ["c", "very-high"]]);
    same(p, 2);
  });
  it("names a kind with no Metric at 1/2 or more by none", () => {
    // Two interleaved kinds on a Metric: neither stands out, and nothing else marks them.
    const p = prep([[0, 5, 1, 6, 2, 7, 3, 8, 4, 9, 0, 5], [3, 3, 4, 4, 3, 3, 4, 4, 3, 4, 3, 4]]);
    const r = ok(kindsOf(p, { kinds: 2 })) as LookAlike;
    expect(r.kinds.every((k) => k.marks.length === 0 || k.marks.every((m) => m.level !== null))).toBe(true);
    same(p, 2);
  });
  it("numbers kinds that would be named alike by their earliest period: two kinds both high on one Metric", () => {
    // Four kinds over 3 Metrics; kinds 1 and 2 are both "high" on a (79/102 and 53/102) and nothing else has a word for them.
    const cols = [
      [10, 14, 13, 13, 14, 11, 12, 11, 13, 13, 11, 10, 3, 0, 1, 3, 3, 2, 1, 2, 1, 1, 4],
      [11, 12, 10, 14, 13, 12, 10, 14, 11, 11, 12, 13, 11, 10, 12, 10, 14, 11, 2, 2, 4, 3, 4],
      [11, 11, 12, 11, 13, 12, 4, 3, 2, 4, 1, 2, 24, 22, 21, 23, 24, 24, 0, 1, 1, 0, 0],
    ];
    const r = ok(kindsOf(prep(cols), { kinds: 4 })) as LookAlike;
    expect(r.labels).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4]);
    expect(r.kinds.map((k) => k.marks.map((m) => [m.metric, m.level, frac(m.count)]))).toEqual([
      [["a", "high", "79/102"]],
      [["a", "high", "53/102"]],
      [["c", "very-high", "1/1"], ["a", "low", "-2/3"]],
      [["b", "very-low", "-1/1"], ["c", "very-low", "-44/45"]],
    ]);
    expect(r.kinds.map((k) => k.ordinal)).toEqual([1, 2, null, null]);
    same(prep(cols), 4);
  });
  it("numbers kinds that no Metric marks the same way: two kinds close to the usual on every Metric", () => {
    const cols = [
      [2, 1, 2, 4, 4, 3, 4, 3, 4, 4, 4, 4, 20, 20, 20, 20, 23, 21, 3, 3, 3, 1, 2, 2],
      [13, 12, 13, 13, 10, 13, 13, 10, 12, 10, 13, 10, 3, 4, 1, 2, 3, 4, 20, 20, 24, 21, 23, 24],
    ];
    const r = ok(kindsOf(prep(cols), { kinds: 4 })) as LookAlike;
    expect(r.kinds.map((k) => k.marks.map((m) => [m.metric, m.level]))).toEqual([[], [], [["a", "very-high"], ["b", "very-low"]], [["b", "very-high"], ["a", "low"]]]);
    expect(r.kinds.map((k) => k.ordinal)).toEqual([1, 2, null, null]);
    same(prep(cols), 4);
  });
  it("tells kinds named alike apart by a third Metric that one of them has and the others do not", () => {
    // Kinds 1 and 2 are both high on a and b (2/3 each); on c kind 1 is high (5/9) and kind 2 low (−5/9): c is each one's third mark.
    const high = [20, 21, 20, 21, 20, 21];
    const low = Array.from({ length: 12 }, (_, i) => i % 2);
    const a = [...high, ...high, ...low];
    const b = [...high.map((x) => x + 5), ...high.map((x) => x + 5), ...low];
    const c = [...Array(6).fill(10), ...Array(6).fill(-10), ...Array(4).fill(-20), ...Array(4).fill(0), ...Array(4).fill(20)];
    const p = prep([a, b, c]);
    const r = ok(kindsOf(p, { kinds: 4 })) as LookAlike;
    expect(r.labels).toEqual([...Array(6).fill(1), ...Array(6).fill(2), ...Array(8).fill(3), ...Array(4).fill(4)]);
    expect(r.kinds.map((k) => k.counts.map(frac))).toEqual([["2/3", "2/3", "5/9"], ["2/3", "2/3", "-5/9"], ["-3/4", "-3/4", "-5/8"], ["-3/5", "-3/5", "1/1"]]);
    expect(r.kinds.map((k) => k.marks.map((m) => [m.metric, m.level]))).toEqual([
      [["a", "high"], ["b", "high"], ["c", "high"]],
      [["a", "high"], ["b", "high"], ["c", "low"]],
      [["a", "low"], ["b", "low"]],
      [["c", "very-high"], ["a", "low"]],
    ]);
    expect(r.kinds.map((k) => k.ordinal)).toEqual([null, null, null, null]);
    same(p, 4);
  });
});

describe("naming kinds from Cliff's counts", () => {
  const f = (tenths: number): Fraction => ({ num: BigInt(tenths), den: BigInt(10) });
  const ids = ["a", "b", "c", "d"];
  const names = (...kinds: number[][]) => nameKinds(ids, kinds.map((k) => k.map(f))).map((n) => ({ marks: n.marks.map((m) => `${m.metric} ${m.level}`), ordinal: n.ordinal }));
  it("takes the two Metrics with the largest size, a tie by the Metric's place in the order of the ids, whatever the signs", () => {
    expect(names([9, -9, 9, 6])).toEqual([{ marks: ["a very-high", "b very-low"], ordinal: null }]);
    expect(names([6, 9, 9, 6])).toEqual([{ marks: ["b very-high", "c very-high"], ordinal: null }]);
    expect(names([9, 6, 9, -9])).toEqual([{ marks: ["a very-high", "c very-high"], ordinal: null }]);
    expect(names([-6, 9, -9, 0])).toEqual([{ marks: ["b very-high", "c very-low"], ordinal: null }]);
    expect(names([0, 0, 0, 0])).toEqual([{ marks: [], ordinal: null }]);
    expect(names([4, 5, -5, 0])).toEqual([{ marks: ["b high", "c low"], ordinal: null }]);
  });
  it("tells kinds named alike apart by the first further Metric that one has and the others named alike do not", () => {
    // c is high in both kinds: it tells nothing. d is high in one and low in the other.
    expect(names([9, 9, 6, 5], [9, 9, 6, -5])).toEqual([
      { marks: ["a very-high", "b very-high", "d high"], ordinal: null },
      { marks: ["a very-high", "b very-high", "d low"], ordinal: null },
    ]);
  });
  it("gives a third Metric only when no other kind named alike has it, and numbers the kinds still alike by their kind number", () => {
    // Three kinds alike on a and b: d is high in two of them, so it tells none of them apart from all the others.
    expect(names([9, 9, 0, 5], [9, 9, 0, 5], [9, 9, 0, 0])).toEqual([
      { marks: ["a very-high", "b very-high"], ordinal: 1 },
      { marks: ["a very-high", "b very-high"], ordinal: 2 },
      { marks: ["a very-high", "b very-high"], ordinal: 3 },
    ]);
  });
  it("takes kinds with the same Metrics and words in another order of size as alike", () => {
    expect(names([10, 9, 0, 0], [9, 10, 0, 0])).toEqual([
      { marks: ["a very-high", "b very-high"], ordinal: 1 },
      { marks: ["b very-high", "a very-high"], ordinal: 2 },
    ]);
  });
  it("leaves a kind with one name alone and numbers two kinds that no Metric marks", () => {
    expect(names([9, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])).toEqual([
      { marks: ["a very-high"], ordinal: null },
      { marks: [], ordinal: 1 },
      { marks: [], ordinal: 2 },
    ]);
  });
});

// ---- periods and seasons ----

describe("periods as runs", () => {
  it("writes one period alone, a run within a year, and a run across a year end, oldest first", () => {
    expect(periodRuns(["2024-12-01"], "month")).toEqual([{ from: "2024-12-01", to: "2024-12-01" }]);
    expect(periodRuns(["2025-01-01", "2025-02-01", "2025-03-01"], "month")).toEqual([{ from: "2025-01-01", to: "2025-03-01" }]);
    expect(periodRuns(["2024-11-01", "2024-12-01", "2025-01-01", "2025-02-01", "2025-06-01", "2025-08-01", "2025-09-01"], "month")).toEqual([
      { from: "2024-11-01", to: "2025-02-01" },
      { from: "2025-06-01", to: "2025-06-01" },
      { from: "2025-08-01", to: "2025-09-01" },
    ]);
    expect(periodRuns([], "month")).toEqual([]);
  });
  it("follows the Period: quarters, weeks and days follow one another by their own step", () => {
    expect(periodRuns(["2024-10-01", "2025-01-01", "2025-07-01"], "quarter")).toEqual([{ from: "2024-10-01", to: "2025-01-01" }, { from: "2025-07-01", to: "2025-07-01" }]);
    expect(periodRuns(["2024-12-23", "2024-12-30", "2025-01-13"], "week")).toEqual([{ from: "2024-12-23", to: "2024-12-30" }, { from: "2025-01-13", to: "2025-01-13" }]);
    expect(periodRuns(["2024-02-28", "2024-02-29", "2024-03-01", "2024-03-03"], "day")).toEqual([{ from: "2024-02-28", to: "2024-03-01" }, { from: "2024-03-03", to: "2024-03-03" }]);
    expect(periodRuns(["2023-01-01", "2024-01-01", "2026-01-01"], "year")).toEqual([{ from: "2023-01-01", to: "2024-01-01" }, { from: "2026-01-01", to: "2026-01-01" }]);
    expect(periodRuns(["2023-01-01", "2023-07-01", "2024-07-01"], "half")).toEqual([{ from: "2023-01-01", to: "2023-07-01" }, { from: "2024-07-01", to: "2024-07-01" }]);
  });
});

describe("the time of year", () => {
  const months = Array.from({ length: 36 }, (_, i) => month(i)); // January 2020 to December 2022
  const at = (...picks: [number, number][]) => picks.map(([y, m]) => (y - 2020) * 12 + m - 1);
  it("calls a kind seasonal when its places hold at least 3/4 of its periods, and gives them as a range round the year end", () => {
    const kind = at([2020, 11], [2020, 12], [2021, 1], [2021, 11], [2021, 12], [2022, 1], [2022, 11], [2022, 12]).sort((a, b) => a - b);
    // January 2020 is in the window but not in the kind: January has 3 periods, 2 in the kind (2/3, under 3/4), so it does not belong.
    expect(seasonOf(months, kind, "month")).toEqual({ places: [11, 12], runs: [{ from: 11, to: 12 }] });
    const wrap = [...kind, ...at([2020, 1])].sort((a, b) => a - b);
    expect(seasonOf(months, wrap, "month")).toEqual({ places: [1, 11, 12], runs: [{ from: 11, to: 1 }] });
  });
  it("holds the line at 3/4 of the kind's periods: 9 of 12 is seasonal, 9 of 13 is not", () => {
    const base = at([2020, 11], [2020, 12], [2021, 1], [2021, 11], [2021, 12], [2022, 1], [2022, 11], [2022, 12], [2020, 1]);
    const three = at([2020, 3], [2021, 5], [2022, 7]);
    expect(seasonOf(months, [...base, ...three].sort((a, b) => a - b), "month")).toEqual({ places: [1, 11, 12], runs: [{ from: 11, to: 1 }] });
    expect(seasonOf(months, [...base, ...three, ...at([2021, 8])].sort((a, b) => a - b), "month")).toBeNull();
  });
  it("needs at least 2 of a place's periods in the kind, and 3/4 of the periods of that place", () => {
    // One period alone in a place (June 2021) belongs to nothing, however alone it is: 1 of 3.
    expect(seasonOf(months, at([2021, 6]), "month")).toBeNull();
    // Two of the three Julys, and nothing else: the place belongs at 2 of 3? 2 ÷ 3 is under 3/4, so no.
    expect(seasonOf(months, at([2020, 7], [2021, 7]), "month")).toBeNull();
    // A window where a place has 2 periods and both are in the kind: 2 of 2 is enough.
    expect(seasonOf(months.slice(0, 26), at([2020, 7], [2021, 7]), "month")).toEqual({ places: [7], runs: [{ from: 7, to: 7 }] });
    // 3 of 4 is enough: a place with 4 periods and 3 in the kind.
    const four = Array.from({ length: 4 }, (_, k) => month(k * 12 + 2)); // Mays... months 2, 14, 26, 38 are March
    expect(seasonOf(four, [0, 1, 2], "month")).toEqual({ places: [3], runs: [{ from: 3, to: 3 }] });
    expect(seasonOf(four, [0, 1], "month")).toBeNull();
  });
  it("lists places that do not follow one another by their first place, and goes all round when every place is in", () => {
    const every = Array.from({ length: 24 }, (_, i) => month(i));
    expect(seasonOf(every, every.map((_, i) => i), "month")).toEqual({ places: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], runs: [{ from: 1, to: 12 }] });
    const apart = every.map((_, i) => i).filter((i) => [0, 1, 4, 9, 10, 11].includes(i % 12));
    expect(seasonOf(every, apart, "month")).toEqual({ places: [1, 2, 5, 10, 11, 12], runs: [{ from: 5, to: 5 }, { from: 10, to: 2 }] });
    const inside = every.map((_, i) => i).filter((i) => [1, 2, 4, 8, 9].includes(i % 12));
    expect(seasonOf(every, inside, "month")).toEqual({ places: [2, 3, 5, 9, 10], runs: [{ from: 2, to: 3 }, { from: 5, to: 5 }, { from: 9, to: 10 }] });
    const split = every.map((_, i) => i).filter((i) => [0, 1, 4, 10, 11].includes(i % 12));
    expect(seasonOf(every, split, "month")).toEqual({ places: [1, 2, 5, 11, 12], runs: [{ from: 5, to: 5 }, { from: 11, to: 2 }] });
  });
  it("lists the places of a kind in the order of the season, and joins a run round the year end only where one ends at the last place and one starts at the first", () => {
    // A window from November 2020 to October 2022: every place has 2 periods, and a kind in November, December and January in both years.
    const window = Array.from({ length: 24 }, (_, i) => month(10 + i));
    const winter = window.map((_, i) => i).filter((i) => [10, 11, 0].includes((i + 10) % 12));
    expect(seasonOf(window, winter, "month")).toEqual({ places: [1, 11, 12], runs: [{ from: 11, to: 1 }] });
    const ends = window.map((_, i) => i).filter((i) => [4, 11].includes((i + 10) % 12));
    expect(seasonOf(window, ends, "month")).toEqual({ places: [5, 12], runs: [{ from: 5, to: 5 }, { from: 12, to: 12 }] });
    const starts = window.map((_, i) => i).filter((i) => [0, 4].includes((i + 10) % 12));
    expect(seasonOf(window, starts, "month")).toEqual({ places: [1, 5], runs: [{ from: 1, to: 1 }, { from: 5, to: 5 }] });
  });
  it("has no season for weeks even where every week is in the same place of the calendar", () => {
    const mondays = Array.from({ length: 3 }, (_, i) => textOf(dayOf("2024-01-01") + 7 * i));
    expect(seasonOf(mondays, [0, 1, 2], "week")).toBeNull();
    expect(seasonOf(mondays, [0, 1, 2], "day")).toEqual({ places: [1], runs: [{ from: 1, to: 1 }] });
  });
  it("reads quarters by the Fiscal Year and days by the day of the week from Monday, and none for weeks, halves and years", () => {
    const quarters = Array.from({ length: 12 }, (_, i) => textOf(monthsLater(dayOf("2020-04-01"), 3 * i)));
    // A Fiscal Year from April: April is the first quarter, January the fourth.
    expect(seasonOf(quarters, [0, 4, 8], "quarter", 4)).toEqual({ places: [1], runs: [{ from: 1, to: 1 }] });
    expect(seasonOf(quarters, [3, 7, 11], "quarter", 4)).toEqual({ places: [4], runs: [{ from: 4, to: 4 }] });
    expect(seasonOf(quarters, [3, 7, 11], "quarter")).toEqual({ places: [1], runs: [{ from: 1, to: 1 }] });
    expect(seasonOf(quarters, [0, 4, 8], "quarter", 10)).toEqual({ places: [3], runs: [{ from: 3, to: 3 }] });
    const days = Array.from({ length: 28 }, (_, i) => textOf(dayOf("2024-01-01") + i)); // 1 January 2024 is a Monday
    const weekend = days.map((_, i) => i).filter((i) => i % 7 >= 5);
    expect(seasonOf(days, weekend, "day")).toEqual({ places: [6, 7], runs: [{ from: 6, to: 7 }] });
    expect(seasonOf(days, days.map((_, i) => i).filter((i) => i % 7 === 0 || i % 7 === 6), "day")).toEqual({ places: [1, 7], runs: [{ from: 7, to: 1 }] });
    for (const span of ["week", "half", "year"] as Span[]) expect(seasonOf(months, [0, 1, 2], span)).toBeNull();
  });
});

// ---- the series ----

const points = (values: (number | null)[], from = 0, step = 1) => values.flatMap((value, i) => (value === null ? [] : [{ period: month(from + i * step), value }]));
const wave = (n: number, k: number) => Array.from({ length: n }, (_, i) => ((i * k) % 7) + (i % 3));

describe("the series a Look-alike works on", () => {
  it("takes the periods in which every Metric has a value, the Metrics in the order of their ids", () => {
    const r = readLookAlike([{ id: "z", points: points([1, 9, null, 2, 8]) }, { id: "a", points: points([null, 5, 1, 2, 8]) }], "month");
    expect(r.ids).toEqual(["a", "z"]);
    expect(r.periods).toEqual([month(1), month(3), month(4)]);
    expect(r.values.map((c) => c.map(frac))).toEqual([["5/1", "2/1", "8/1"], ["9/1", "2/1", "8/1"]]);
    expect(r.reading).toEqual(["values", "values"]);
  });
  it("takes the latest 60 of the periods in common", () => {
    const r = readLookAlike([{ id: "a", points: points(wave(70, 2)) }, { id: "b", points: points(wave(70, 3)) }], "month");
    expect(r.periods.length).toBe(60);
    expect(r.periods[0]).toBe(month(10));
    expect(r.periods[59]).toBe(month(69));
  });
  it("reads values as they are, a value given twice once with the value given last, and no value for NaN or Infinity", () => {
    const r = readLookAlike([{ id: "a", points: [{ period: month(1), value: 1 }, { period: month(0), value: 9 }, { period: month(1), value: 2 }, { period: month(2), value: NaN }, { period: month(3), value: Infinity }, { period: month(4), value: 3 }] }, { id: "b", points: points([5, 1, 7, 8, 2]) }], "month");
    expect(r.periods).toEqual([month(0), month(1), month(4)]);
    expect(r.values.map((c) => c.map(frac))).toEqual([["9/1", "2/1", "3/1"], ["5/1", "1/1", "2/1"]]);
  });
  it("reads a Metric whose straight line explains more than half of its variance as its distance from that line", () => {
    // y = x + e with e = 1, −1, 0, 0, −1, 1: slope 1, intercept 0 (the leftovers are e), R² = 1 − 4 ÷ 21.5 above 1/2.
    const r = readLookAlike([{ id: "a", points: points([1, 0, 2, 3, 3, 6]) }, { id: "b", points: points([5, 1, 4, 1, 5, 2]) }], "month");
    expect(r.reading).toEqual(["trend", "values"]);
    expect(r.values[0].map(frac)).toEqual(["1/1", "-1/1", "0/1", "0/1", "-1/1", "1/1"]);
    expect(r.values[1].map(frac)).toEqual(["5/1", "1/1", "4/1", "1/1", "5/1", "2/1"]);
  });
  it("reads a Metric by its trend only past R² of 1/2: 1/2 exactly is read as its values, a step above as its trend, a step below as its values", () => {
    const reading = (y: number[]) => readLookAlike([{ id: "a", points: points(y) }, { id: "b", points: points([5, 1, 4, 1]) }], "month").reading[0];
    expect([reading([0, 3, 1, 4]), reading([0, 3, 1, 5]), reading([0, 3, 0, 4])]).toEqual(["values", "trend", "values"]);
  });
  it("follows the calendar: a missing period leaves a gap in the positions of the trend", () => {
    // Values at positions 0, 1, 3, 4, 6, 7 on the line y = x: no leftovers, which a line through them as if they were 6 neighbours would not leave.
    const at = [0, 1, 3, 4, 6, 7];
    const r = readLookAlike([{ id: "a", points: at.map((x) => ({ period: month(x), value: x })) }, { id: "b", points: at.map((x, i) => ({ period: month(x), value: [5, 1, 4, 1, 5, 2][i] })) }], "month");
    expect(r.reading).toEqual(["trend", "values"]);
    expect(r.values[0].map(frac)).toEqual(Array(6).fill("0/1"));
  });
  it("is exact on the prepared series only: a trending Metric is detrended by the house helper in doubles, and its kinds hold under a perturbation within that rounding", () => {
    const n = 30;
    const trend = Array.from({ length: n }, (_, i) => 2 * i + (i % 10 < 5 ? 0 : 40) + (i % 3));
    const other = Array.from({ length: n }, (_, i) => (i % 10 < 5 ? 1 : 9) + (i % 2));
    const run = (nudge: number) => lookAlike([{ id: "a", points: points(trend.map((v, i) => v + nudge * i / 3)) }, { id: "b", points: points(other) }], "month", { kinds: 2 });
    const base = ok(run(0)) as LookAlike;
    expect(base.reading).toEqual(["trend", "values"]);
    // The leftovers are the decimal text of doubles, so on a power of ten, not the exact thirds of the line.
    expect(readLookAlike([{ id: "a", points: points(trend.map((v, i) => v + i / 3)) }, { id: "b", points: points(other) }], "month").values[0].every((f) => /^10*$/.test(f.den.toString()))).toBe(true);
    for (const nudge of [1e-12, -1e-12]) {
      const moved = ok(run(nudge)) as LookAlike;
      expect([moved.labels, moved.shown]).toEqual([base.labels, base.shown]);
    }
  });
  it("has no periods and no Metrics for nothing", () => {
    expect(readLookAlike([], "month")).toEqual({ span: "month", periods: [], ids: [], reading: [], values: [] });
    expect(readLookAlike([{ id: "a", points: [] }, { id: "b", points: points([1, 2]) }], "month").periods).toEqual([]);
  });
});

describe("the minimums of a Look-alike", () => {
  const series = (m: number, n: number) => Array.from({ length: m }, (_, j) => ({ id: `m${j}`, points: points(Array.from({ length: n }, (_, i) => ((i * (j + 3)) % 11) + (i % (j + 2)) * 5)) }));
  it("refuses fewer than 2 Metrics and more than 6 in codes, without a number", () => {
    expect(lookAlike(series(1, 30), "month")).toEqual({ ok: false, why: "metrics" });
    expect(lookAlike([], "month")).toEqual({ ok: false, why: "metrics" });
    const two = series(2, 30);
    expect(lookAlike([two[0], { ...two[1], id: two[0].id }], "month")).toEqual({ ok: false, why: "metrics" });
    expect(lookAlike(series(7, 60), "month")).toEqual({ ok: false, why: "too-many" });
    expect(lookAlike(series(6, 36), "month")).toMatchObject({ ok: true });
  });
  it("needs 24 periods in common: 23 is refused, 24 is not", () => {
    expect(lookAlike(series(2, 23), "month")).toEqual({ ok: false, why: "periods" });
    expect(lookAlike(series(2, 24), "month")).toMatchObject({ ok: true });
    const without = (every: number) => {
      const gap = series(2, 30);
      gap[1] = { id: "m1", points: gap[1].points.filter((_, i) => i % every !== 2) };
      return lookAlike(gap, "month");
    };
    // Leaving out every fifth value of 30 keeps 24 in common, every fourth keeps 23.
    expect(without(5)).toMatchObject({ ok: true });
    expect(without(4)).toEqual({ ok: false, why: "periods" });
  });
  it("takes at most one Metric to every 6 periods: 4 Metrics over 24 periods, 5 over 30, but not 5 over 29", () => {
    expect(lookAlike(series(4, 24), "month")).toMatchObject({ ok: true });
    expect(lookAlike(series(5, 24), "month")).toEqual({ ok: false, why: "too-many" });
    expect(lookAlike(series(5, 29), "month")).toEqual({ ok: false, why: "too-many" });
    expect(lookAlike(series(5, 30), "month")).toMatchObject({ ok: true });
  });
  it("refuses values too wide to work out exactly, before any arithmetic", () => {
    const s = series(2, 30);
    s[0].points[3] = { period: month(3), value: 1e50 };
    s[0].points[4] = { period: month(4), value: 1e-50 };
    expect(lookAlike(s, "month")).toEqual({ ok: false, why: "wide" });
    const t = series(2, 30);
    t[1].points[3] = { period: month(3), value: 1.2345e-41 };
    expect(lookAlike(t, "month")).toEqual({ ok: false, why: "wide" });
  });
  it("names a Metric that does not vary, and a count that is not from 2 to 4", () => {
    const s = series(3, 30);
    s[1] = { id: "m1", points: points(Array.from({ length: 30 }, () => 7)) };
    expect(lookAlike(s, "month")).toEqual({ ok: false, why: "constant", metric: "m1" });
    expect(lookAlike(series(2, 30), "month", { kinds: 5 })).toEqual({ ok: false, why: "kinds" });
  });
  it("gives the same result whatever the order of the Metrics and of the points", () => {
    const s = series(3, 36);
    const [a, b] = [lookAlike(s, "month"), lookAlike([s[2], s[0], s[1]].map((x) => ({ ...x, points: [...x.points].reverse() })), "month")];
    expect(b).toEqual(a);
  });
});

// ---- the reference ----

describe("the code against the reference", () => {
  // Values: small whole numbers with many ties, clusters around a few centres (so there are kinds to find), decimals, and wide ones.
  const valueArb = (n: number, m: number): fc.Arbitrary<number[][]> =>
    fc.oneof(
      fc.array(fc.array(fc.integer({ min: 0, max: 3 }), { minLength: n, maxLength: n }), { minLength: m, maxLength: m }),
      fc.array(fc.array(fc.integer({ min: -2000, max: 2000 }).map((v) => v / 100), { minLength: n, maxLength: n }), { minLength: m, maxLength: m }),
      fc
        .tuple(fc.integer({ min: 2, max: 4 }), fc.array(fc.integer({ min: 0, max: 3 }), { minLength: n, maxLength: n }), fc.array(fc.array(fc.integer({ min: -30, max: 30 }), { minLength: 4, maxLength: 4 }), { minLength: m, maxLength: m }), fc.array(fc.array(fc.integer({ min: -3, max: 3 }), { minLength: n, maxLength: n }), { minLength: m, maxLength: m }))
        .map(([k, kind, centres, noise]) => centres.map((c, j) => kind.map((x, i) => c[x % k] + noise[j][i]))),
      fc.array(fc.array(fc.integer({ min: 100000, max: 9999999 }).map((v) => v / 100), { minLength: n, maxLength: n }), { minLength: m, maxLength: m }),
    );
  const spanArb = fc.constantFrom<Span>("day", "week", "month", "month", "month", "quarter", "half", "year");

  // The periods of a Period from a start, stepping by 1 or more now and then (a missing period leaves a gap).
  function periodsFor(span: Span, n: number, skips: number[], yearStart: number): string[] {
    const first = span === "week" ? "2023-01-02" : span === "day" ? "2024-02-26" : `2019-${String(((yearStart - 1) % 12) + 1).padStart(2, "0")}-01`;
    const out: string[] = [];
    let day = dayOf(first);
    for (let i = 0; i < n; i++) {
      out.push(textOf(day));
      const k = 1 + (skips[i] ?? 0);
      day = span === "day" ? day + k : span === "week" ? day + 7 * k : monthsLater(day, { month: 1, quarter: 3, half: 6, year: 12 }[span] * k);
    }
    return out;
  }

  it("agrees exactly with the reference on generated prepared values: the kinds, every cost and gap as a fraction, the counts, the names and the seasons", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 6, max: 24 }).chain((n) => fc.integer({ min: 1, max: 4 }).chain((m) => fc.tuple(valueArb(n, m), spanArb, fc.array(fc.integer({ min: 0, max: 2 }).map((v) => (v === 2 ? 1 : 0)), { minLength: n, maxLength: n }), fc.integer({ min: 1, max: 12 }), fc.constantFrom<number | null>(null, null, 2, 3, 4)))),
        ([columns, span, skips, yearStart, asked]) => {
          const periods = periodsFor(span, columns[0].length, skips, yearStart);
          same({ span, periods, ids: columns.map((_, j) => `m${j}`), reading: columns.map(() => "values"), values: columns.map((c) => c.map(fractionOf)) }, asked, yearStart as YearStart);
        },
      ),
      { numRuns: cases, seed },
    );
  }, 600_000);

  it("agrees exactly with the reference on values in a few kinds with levels that tie (kinds named alike, third Metrics, seasons), months and quarters", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 18, max: 30 }).chain((n) =>
          fc.integer({ min: 2, max: 3 }).chain((m) => fc.tuple(fc.integer({ min: 3, max: 4 }), fc.array(fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 4, maxLength: 4 }), { minLength: m, maxLength: m }), fc.array(fc.integer({ min: 0, max: 4 }), { minLength: n * m, maxLength: n * m }), fc.constantFrom<Span>("month", "month", "quarter", "day"), fc.integer({ min: 1, max: 12 }), fc.constantFrom<number | null>(null, 3, 4), fc.array(fc.integer({ min: 0, max: 3 }), { minLength: n, maxLength: n }))),
        ),
        ([k, levels, noise, span, yearStart, asked, order]) => {
          const n = order.length;
          // Kinds in blocks, as a series has them, or mixed through the periods.
          const kindOf = (i: number) => (order[i] % 2 === 0 ? Math.floor((i * k) / n) : order[i] % k);
          const columns = levels.map((l, j) => Array.from({ length: n }, (_, i) => l[kindOf(i) % 4] * 10 + noise[j * n + i]));
          same({ span, periods: periodsFor(span, n, [], yearStart), ids: columns.map((_, j) => `m${j}`), reading: columns.map(() => "values"), values: columns.map((c) => c.map(fractionOf)) }, asked, yearStart as YearStart);
        },
      ),
      { numRuns: Math.min(cases, 400), seed },
    );
  }, 600_000);

  it("agrees exactly with the reference from the series: the common periods, the basis of each Metric (a trend read as its distance from the line) and the minimums", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 36 }).chain((n) => fc.integer({ min: 1, max: 4 }).chain((m) => fc.tuple(valueArb(n, m), fc.array(fc.integer({ min: 0, max: 6 }), { minLength: n * m, maxLength: n * m }), fc.array(fc.integer({ min: 0, max: 3 }), { minLength: m, maxLength: m }), fc.constantFrom<number | null>(null, null, 2, 3, 4)))),
        ([columns, holes, slopes, asked]) => {
          const n = columns[0].length;
          const series = columns.map((c, j) => ({
            id: `s${j}`,
            // A trend is added to some Metrics (slope 0 to 3 a period), and some periods are left out.
            points: c.flatMap((v, i) => (holes[j * n + i] === 0 ? [] : [{ period: month(i), value: Math.round((v + slopes[j] * i) * 100) / 100 }])),
          }));
          const got = lookAlike(series, "month", { kinds: asked });
          const ref = referenceLookAlike(series, "month", asked);
          if ("refused" in ref) expect("why" in got ? got.why : "kinds").toBe(ref.refused);
          else expect(view(ok(got) as LookAlike)).toEqual(ref);
        },
      ),
      { numRuns: Math.min(cases, 300), seed },
    );
  }, 600_000);
});

// ---- properties ----

describe("properties", () => {
  const smallArb = fc.integer({ min: 6, max: 18 }).chain((n) => fc.integer({ min: 1, max: 3 }).chain((m) => fc.array(fc.array(fc.integer({ min: 0, max: 40 }), { minLength: n, maxLength: n }), { minLength: m, maxLength: m })));
  const transformed = (p: Prepared, f: (v: Fraction, j: number) => Fraction): Prepared => ({ ...p, values: p.values.map((c, j) => c.map((v) => f(v, j))) });

  it("gives the same result twice", () => {
    fc.assert(
      fc.property(smallArb, (columns) => {
        expect(kindsOf(prep(columns))).toEqual(kindsOf(prep(columns)));
      }),
      { numRuns: Math.min(cases, 200), seed },
    );
  });
  it("numbers the kinds 1 to the count in the order of their earliest period, and keeps every kind at the minimum", () => {
    fc.assert(
      fc.property(smallArb, (columns) => {
        const r = kindsOf(prep(columns));
        if ("why" in r) return;
        const firsts = r.kinds.map((k) => k.places[0]);
        expect(firsts).toEqual([...firsts].sort((a, b) => a - b));
        expect(r.labels.map((l) => l)).toEqual(r.labels.map((_, i) => r.kinds.findIndex((k) => k.places.includes(i)) + 1));
        expect(r.kinds.every((k) => k.places.length >= r.smallest)).toBe(true);
        expect(r.kinds.reduce((t, k) => t + k.places.length, 0)).toBe(r.labels.length);
        expect(r.shown).toBe(r.kinds.length);
        expect(r.shown).toBeGreaterThanOrEqual(LOOK_ALIKE.counts[0]);
        expect(r.shown).toBeLessThanOrEqual(LOOK_ALIKE.counts[LOOK_ALIKE.counts.length - 1]);
      }),
      { numRuns: Math.min(cases, 300), seed },
    );
  });
  it("is not changed by a positive factor or an added number on a Metric: the same kinds, costs, gaps and counts", () => {
    fc.assert(
      fc.property(smallArb, fc.integer({ min: 1, max: 9 }), fc.integer({ min: -50, max: 50 }), (columns, factor, shift) => {
        const p = prep(columns);
        const moved = transformed(p, (v, j) => (j === 0 ? { num: v.num * BigInt(factor) + BigInt(shift) * v.den, den: v.den } : v));
        const [a, b] = [kindsOf(p), kindsOf(moved)];
        if ("why" in a) expect("why" in b ? b.why : "").toBe(a.why);
        else expect(b).toEqual(a);
      }),
      { numRuns: Math.min(cases, 300), seed },
    );
  });
  it("only swaps high and low where a Metric's sign is turned: the same kinds and gaps, the counts turned", () => {
    fc.assert(
      fc.property(smallArb, (columns) => {
        const p = prep(columns);
        const turned = transformed(p, (v, j) => (j === 0 ? { num: -v.num, den: v.den } : v));
        const [a, b] = [kindsOf(p), kindsOf(turned)];
        if ("why" in a || "why" in b) {
          expect("why" in b).toBe("why" in a);
          return;
        }
        expect(b.labels).toEqual(a.labels);
        expect(b.gap).toEqual(a.gap);
        expect(b.merges).toEqual(a.merges);
        expect(b.kinds.map((k) => k.counts[0])).toEqual(a.kinds.map((k) => ({ num: -k.counts[0].num, den: k.counts[0].den })));
        expect(b.kinds.map((k) => k.counts.slice(1))).toEqual(a.kinds.map((k) => k.counts.slice(1)));
      }),
      { numRuns: Math.min(cases, 300), seed },
    );
  });
  it("gives the same kinds for the Metrics in another order and for the points in another order", () => {
    fc.assert(
      fc.property(fc.integer({ min: 24, max: 30 }).chain((n) => fc.array(fc.array(fc.integer({ min: 0, max: 30 }), { minLength: n, maxLength: n }), { minLength: 2, maxLength: 4 })), fc.integer({ min: 0, max: 1000 }), (columns, turn) => {
        const series = columns.map((c, j) => ({ id: `m${j}`, points: points(c) }));
        const mixed = series.map((_, k) => series[(k + (turn % series.length)) % series.length]).map((s, k) => ({ ...s, points: k % 2 ? [...s.points].reverse() : s.points }));
        expect(lookAlike(mixed, "month")).toEqual(lookAlike(series, "month"));
      }),
      { numRuns: Math.min(cases, 100), seed },
    );
  });
  it("makes nested kinds for 2, 3 and 4: each kind of a larger count lies inside one of the smaller", () => {
    fc.assert(
      fc.property(fc.integer({ min: 12, max: 24 }).chain((n) => fc.array(fc.array(fc.integer({ min: 0, max: 60 }), { minLength: n, maxLength: n }), { minLength: 1, maxLength: 3 })), (columns) => {
        const p = prep(columns);
        const results = [2, 3, 4].map((k) => kindsOf(p, { kinds: k })).filter((r): r is LookAlike => !("why" in r));
        for (let i = 1; i < results.length; i++) {
          const [coarse, fine] = [results[i - 1], results[i]];
          if (fine.shown === coarse.shown) continue;
          expect(fine.kinds.every((k) => new Set(k.places.map((x) => coarse.labels[x])).size === 1)).toBe(true);
          expect(fine.kinds.every((k) => k.places.length >= fine.smallest)).toBe(true);
        }
      }),
      { numRuns: Math.min(cases, 200), seed },
    );
  });
  it("never carries a number with a refusal", () => {
    for (const r of [lookAlike([], "month"), kindsOf(prep([[1, 2, 3, 4, 5, 6], [1, 1, 1, 1, 1, 1]])), kindsOf(prep([[1, 2, 3, 4, 5], [1, 2, 3, 4, 5]]))]) {
      expect(Object.keys(r).every((k) => ["ok", "why", "metric"].includes(k))).toBe(true);
    }
  });
});
