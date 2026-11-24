// The Python reference of the Look-alike (spec 0053, ticket 3, GLOSSARY: Look-alike): 200 cases worked out by fixtures/look-alike.py on exact fractions and
// laid beside the code, which must equal them EXACTLY (kinds, counts, every join and its cost, every gap squared, Cliff's counts, the words, the runs and
// the time of year), and what SciPy's Ward said in the same script (the fixture records it, so CI needs neither Python nor SciPy).
import { describe, expect, it } from "vitest";
import type { Fraction } from "../exact";
import { FIXTURE, HASHES, type FixtureAsked, type FixtureCase } from "../test/reference/look-alike-fixture";
import { lookAlike, type Gap, type LookAlike } from "./look-alike";

const frac = (f: Fraction) => `${f.num}/${f.den}`;
const gapText = (g: Gap) => (g === "endless" ? g : frac(g));
const series = (c: FixtureCase) => c.series.map((s) => ({ id: s.id, points: s.points.map(([period, value]) => ({ period, value: Number(value) })) }));
const sorted = (runs: { from: number; to: number }[]) => runs.map((r): [number, number] => [r.from, r.to]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

/** What the code gives for one count asked, written as the script writes its result. */
function asScript(r: LookAlike): Omit<Extract<FixtureAsked, { kinds: unknown }>, never> {
  return {
    asked: r.asked,
    shown: r.shown,
    smallest: r.smallest,
    labels: r.labels,
    gap: gapText(r.gap),
    pairs: r.pairs.map((p) => [p.a, p.b, gapText(p.gap)]),
    tried: r.tried.map((t) => [t.count, gapText(t.gap)]),
    kinds: r.kinds.map((k) => ({
      periods: k.periods,
      runs: k.runs.map((x): [string, string] => [x.from, x.to]),
      counts: k.counts.map(frac),
      marks: k.marks.map((m): [string, string, string] => [m.metric, m.level, frac(m.count)]),
      ordinal: k.ordinal,
      season: k.season ? { places: k.season.places, runs: sorted(k.season.runs) } : null,
    })),
  };
}

describe("the Python and SciPy fixture of the Look-alike", () => {
  it("was made by the current script (look-alike.py), and names its tools", () => {
    expect(HASHES.fixture, "run python3 packages/core/src/test/reference/fixtures/look-alike.py again").toBe(HASHES.script);
    expect(FIXTURE.version).toBe(1);
    expect(Object.keys(FIXTURE.tools).sort()).toEqual(["numpy", "scipy"]);
  });

  it("holds 200 cases of every shape: spans, 2 to 6 Metrics, the refusals, trending Metrics, counts of 2, 3 and 4 kinds, words with a third Metric or a number, seasons", () => {
    const cases = FIXTURE.cases;
    expect(cases).toHaveLength(200);
    expect(new Set(cases.map((c) => c.id)).size).toBe(200);
    expect(new Set(cases.map((c) => c.span))).toEqual(new Set(["day", "week", "month", "quarter"]));
    const results = cases.map((c) => c.expected.result);
    const used = results.flatMap((r) => ("refused" in r ? [] : [r]));
    expect(new Set(used.map((r) => r.ids.length))).toEqual(new Set([2, 3, 4, 5, 6]));
    expect(new Set(used.map((r) => r.periods.length)).size).toBeGreaterThan(20);
    expect(Math.min(...used.map((r) => r.periods.length))).toBe(24);
    expect(Math.max(...used.map((r) => r.periods.length))).toBe(60);
    expect(Object.keys(FIXTURE.refusals).sort()).toEqual(["constant", "metrics", "periods", "too-many"]);
    expect(used.filter((r) => r.reading.includes("trend")).length).toBeGreaterThanOrEqual(20);
    const asked = used.flatMap((r) => Object.values(r.asked)).flatMap((a) => ("refused" in a ? [] : [a]));
    expect(new Set(asked.map((a) => a.shown))).toEqual(new Set([2, 3, 4]));
    expect(used.some((r) => Object.values(r.asked).some((a) => "refused" in a))).toBe(true);
    const kinds = asked.flatMap((a) => a.kinds);
    expect(kinds.some((k) => k.marks.length === 3)).toBe(true);
    expect(kinds.some((k) => k.ordinal !== null)).toBe(true);
    expect(kinds.some((k) => k.season !== null)).toBe(true);
    expect(kinds.some((k) => k.runs.length > 1)).toBe(true);
  });

  const cases = FIXTURE.cases.map((c): [string, FixtureCase] => [c.id, c]);
  it.each(cases)("%s: the code equals the script exactly", (_id, c) => {
    const want = c.expected.result;
    const given = (kinds: number | null) => lookAlike(series(c), c.span, { kinds, yearStart: c.yearStart as 1 });
    if ("refused" in want) {
      expect(given(null)).toMatchObject({ ok: false, why: want.refused, ...(want.metric ? { metric: want.metric } : {}) });
      return;
    }
    // Where no count can be made (every count asked is refused "no-split"), the code gives no joins or periods to compare: only the refusal.
    for (const [key, expected] of Object.entries(want.asked)) {
      const r = given(key === "null" ? null : Number(key));
      if ("refused" in expected) {
        expect(r, `asked ${key}`).toMatchObject({ ok: false, why: expected.refused });
        continue;
      }
      if ("why" in r) throw new Error(`asked ${key}: refused ${r.why}`);
      expect(r.periods).toEqual(want.periods);
      expect(r.ids).toEqual(want.ids);
      expect(r.reading).toEqual(want.reading);
      expect(r.merges.map((m) => [m.left, m.right, frac(m.cost)])).toEqual(want.merges);
      expect(asScript(r), `asked ${key}`).toEqual(expected);
    }
  });
});

describe("SciPy's Ward against the same cases (made by the script, recorded in the fixture)", () => {
  const worked = FIXTURE.cases.filter((c) => !("refused" in c.expected.result));
  it("agreed on every join and on the kinds at 2, 3 and 4 in every case that has no near tie: 3 cuts each", () => {
    const checked = FIXTURE.cases.filter((c) => c.expected.scipy?.status === "matched").map((c) => c.id);
    expect(FIXTURE.scipy.checked).toEqual(checked);
    expect(FIXTURE.cases.filter((c) => c.expected.scipy?.status === "differs")).toEqual([]);
    expect(FIXTURE.scipy.cutsMatched).toBe(3 * checked.length);
    expect(checked.length).toBeGreaterThanOrEqual(150);
    for (const c of FIXTURE.cases.filter((x) => checked.includes(x.id))) expect(c.expected.scipy).toMatchObject({ cuts: [2, 3, 4] });
  });
  it("names the cases it skipped for a near tie (two costs of joining equal or within 1e-9 at some step), and every worked case is one or the other", () => {
    expect(FIXTURE.nearTie).toContain("1e-9");
    const skipped = FIXTURE.cases.filter((c) => c.expected.scipy?.status === "skipped").map((c) => c.id);
    expect(FIXTURE.scipy.skipped.map((s) => s.case)).toEqual(skipped);
    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped.length + FIXTURE.scipy.checked.length).toBe(worked.length);
    for (const s of FIXTURE.scipy.skipped) {
      expect(s.step).toBeGreaterThanOrEqual(1);
      // the two smallest costs, exact: the second is the first or within one part in 10^9 of it
      const [a, b] = [s.smallest, s.second].map((t) => t.split("/").map(BigInt));
      const gap = (b[0] * a[1] - a[0] * b[1]) * BigInt(10) ** BigInt(9);
      expect(b[0] * a[1] >= a[0] * b[1] && (gap === BigInt(0) || gap < a[0] * b[1])).toBe(true);
    }
  });
  it("found the rounding of a trending Metric to the nearest double change no kind, except where the exact costs tie", () => {
    expect(FIXTURE.trendRounding.cases.length).toBeGreaterThanOrEqual(20);
    for (const id of FIXTURE.trendRounding.changedAtATie) expect(FIXTURE.cases.find((c) => c.id === id)!.expected.trendRounding).toEqual({ sameDecisions: false, exactNearTie: true });
  });
});
