// When the data does not suit a Method (GLOSSARY: Takeaway; spec 0041, rule 12 and "When the data does not suit a
// Method"). Every Method calls `checkSuitability(method, inputs)` on every run and gets back refusals, cautions and
// switches to another Method, in words as data (wording.ts), never a quiet number. Pure.
//
// What never happens here: a value is never removed, smoothed or filled in (the input is only read; "leaving out" is a
// question put to the Method's `rerun`), a Method's minimum is never lowered, and a refusal is not turned into a number
// by asking again. All thresholds are in one table, `SUITABILITY`, and every check is exact where arithmetic allows:
// medians, skewness, ranks, the runs test and the step in a level shift are worked out on fractions of the values' text.
import { readSeries } from "./basis";
import { builtFrom, MIN_PAIRS, pearson } from "./correlation";
import { fractionOf, lowestTerms, minus, nearest, over, plus, times, type Fraction } from "./exact";
import { FORECAST_MIN_POINTS } from "./forecast";
import { periodsBetween, type Span } from "./periods";
import { RANK_SPREAD, strengthOf } from "./takeaways/strength";
import type { CaseKey, Slots } from "./takeaways/wording";
import type { Metric, Point } from "./types";
import { wideFindings } from "./work-bound";

/** The Methods that run the checks; a Method's entry in `APPLIES` says which. */
export type MethodId = "correlation" | "spearman" | "partial" | "drivers" | "lag" | "fit" | "predict" | "needs" | "whatIf" | "forecast" | "trend" | "seasonal" | "changePoint" | "afterDate" | "usualRange";
/** Another Method a check may ask for instead: the Method says which it can use through `canSwitchTo`. */
export type SwitchTo = "rank-correlation" | "data-after" | "holt" | "percent-ranges" | "first-pass";
/** The checks, in the order they are run. */
export type CheckId = "periods" | "vary" | "gaps" | "mixed" | "far-off" | "skew-ties" | "straight-line" | "changing" | "level-shift" | "season" | "spread" | "too-many";

/** One thing a check found: the wording case that says it and the numbers and names that go into it. */
export type Finding = { case: CaseKey; slots: Slots };
/** A finding that asks for another Method. */
export type Switch = Finding & { to: SwitchTo };
/** What the checks found: refusals (no result), cautions (a result with a line above it) and switches (another Method). */
export type Verdict = { refusals: Finding[]; cautions: Finding[]; switches: Switch[] };

/** Every threshold of the checks, once (spec 0041: reviewed with analysts, tuned by the trial). Each is tested one step
 * either side. */
export const SUITABILITY = {
  /** Minimum periods per Method; a fit needs `fit.base` + `fit.perDriver` for each driver. */
  minimum: { correlation: MIN_PAIRS, drivers: MIN_PAIRS, lag: 12, fit: { base: 8, perDriver: 4 }, forecast: FORECAST_MIN_POINTS, trend: FORECAST_MIN_POINTS, seasons: 2, segments: 2, afterDate: 6, usualRange: 8 },
  // Shares are written as "one in k" (`oneIn: 5` is a fifth), so that a comparison is a whole-number multiplication and
  // decided exactly.
  /** A series needs at least `distinct` different values, and at least one step in `changedOneIn` (half) must change. */
  vary: { distinct: 4, changedOneIn: 2 },
  /** Refuse above one in `oneIn` of the window's periods without a value, or a gap of `run` in a row. */
  gaps: { oneIn: 5, run: 3 },
  /** A value is far off beyond `mads` median absolute deviations; the 1 to `most` most extreme are left out in turn, and
   * the result must move by more than one in `oneIn` of its own range (or flip its sign). */
  farOff: { mads: 4, most: 3, oneIn: 5 },
  /** Skewness above `skewness` (the moment coefficient, as SciPy's `skew`), or more than one in `tiesOneIn` of the values repeats. */
  skew: { skewness: 2, tiesOneIn: 2 },
  /** The runs test of the misses ordered by level, at one in `oneIn` (one-sided: too few changes of sign). */
  curve: { oneIn: 20 },
  /** Halves of the history of at least `half` pairs; a flip needs both |r| at `sign`; a drop is below one in `dropOneIn` of a link at `clear`. */
  changing: { half: MIN_PAIRS, sign: 0.3, clear: 0.4, dropOneIn: 2 },
  /** A step in level of `misses` typical misses or more, with at least `segment` values each side. */
  shift: { misses: 3, segment: 4 },
  /** The yearly patterns of the two halves differ by more than one in `oneIn` of their combined size. */
  season: { oneIn: 2 },
  /** A rank correlation of level and size of miss above one in `oneIn`. */
  spread: { oneIn: 2 },
  /** At most one driver per `perPeriods` periods, and at most `most`. */
  drivers: { perPeriods: 6, most: 6 },
} as const;

/** Which checks each Method runs ("Applies to" in the spec's table); periods, variation and gaps apply to every Method. */
export const APPLIES: Record<MethodId, readonly CheckId[]> = {
  correlation: ["periods", "vary", "gaps", "far-off", "skew-ties", "changing"],
  // Ranks are not pulled by a far-off value or skew, so only what is left of the checks applies to a rank correlation.
  spearman: ["periods", "vary", "gaps", "far-off", "changing"],
  partial: ["periods", "vary", "gaps", "far-off", "too-many"],
  drivers: ["periods", "vary", "gaps", "far-off", "skew-ties", "changing"],
  lag: ["periods", "vary", "gaps", "far-off", "skew-ties", "changing"],
  fit: ["periods", "vary", "gaps", "mixed", "far-off", "skew-ties", "straight-line", "changing", "spread", "too-many"],
  predict: ["periods", "vary", "gaps", "mixed", "straight-line", "spread"],
  needs: ["periods", "vary", "gaps", "mixed", "straight-line", "spread"],
  whatIf: ["periods", "vary", "gaps", "mixed", "straight-line", "spread"],
  forecast: ["periods", "vary", "gaps", "far-off", "level-shift"],
  trend: ["periods", "vary", "gaps", "level-shift"],
  seasonal: ["periods", "vary", "gaps", "far-off", "season"],
  changePoint: ["periods", "vary", "gaps", "far-off"],
  afterDate: ["periods", "vary", "gaps"],
  usualRange: ["periods", "vary", "gaps", "level-shift"],
};

/** The length of a season in periods, by the Metric's period. */
export const SEASON_LENGTH: Record<Span, number> = { day: 7, week: 52, month: 12, quarter: 4, half: 2, year: 1 };

/** The result of a Method with some periods left out, for the far-off check: its value and, where it has one, the width of its range. */
export type Rerun = { value: number; range?: number } | null;

/** What a Method hands the checks: the series it uses (on its own basis, as it will use them), and what the Method knows. */
export type SuitabilityInputs = {
  /** The series the Method uses, each with its Metric's name; the points are only read. */
  series: { name: string; points: Point[] }[];
  /** The period the series are in. */
  span: Span;
  /** The window the Method looks at, if not each series' first to last period; gaps are counted inside it. */
  window?: { from: string; to: string };
  /** How many periods the Method uses, where that is not the length of the shortest series (pairs of changes, periods before a date). */
  periods?: number;
  /** How many drivers a fit has. */
  drivers?: number;
  /** A season's length in periods, where not the usual for the span. */
  seasonLength?: number;
  /** The Method's result with these periods left out (empty: the result itself); null where it cannot say. Without it, far-off values are not judged. */
  rerun?: (left: ReadonlySet<string>) => Rerun;
  /** That the Method's answer is a rank correlation, so a link that changed is judged by ranks too. */
  rank?: boolean;
  /** The width of the scale of a result that has no range of its own (for r, 1). */
  scale?: number;
  /** A fit's misses with the level they belong to (the fitted value), for the straight-line and spread checks. */
  misses?: { level: number; miss: number }[];
  /** The Metrics a what-if or fit uses, for the mixed-periods check. */
  metrics?: Pick<Metric, "slug" | "name" | "formula" | "period" | "aggregation">[];
  /** The other Methods this one can switch to when a check asks; where it cannot, the check is a caution (or, too many drivers, a refusal). */
  canSwitchTo?: readonly SwitchTo[];
};

/** The one word for what a verdict comes to, in order of weight: refusal, switch, caution or ok. */
export function verdictOutcome(v: Verdict): "refusal" | "switch" | "caution" | "ok" {
  if (v.refusals.length > 0) return "refusal";
  if (v.switches.length > 0) return "switch";
  return v.cautions.length > 0 ? "caution" : "ok";
}

/** How many periods a Method needs before it says anything (spec 0041, rule 1): a fit with k drivers 8 + 4k, a seasonal
 * forecast two full seasons, a lag 12. */
export function minimumPeriods(method: MethodId, opts: { drivers?: number; seasonLength?: number; span?: Span } = {}): number {
  const m = SUITABILITY.minimum;
  switch (method) {
    case "correlation":
    case "spearman":
    case "drivers":
      return m.correlation;
    case "lag":
      return m.lag;
    // Held-the-same Metrics count as drivers of a fit with the pair's second Metric: one more than the Metrics held the same.
    case "partial":
    case "fit":
    case "predict":
    case "needs":
    case "whatIf":
      return m.fit.base + m.fit.perDriver * Math.max(1, opts.drivers ?? 1);
    case "forecast":
    case "trend":
      return m.forecast;
    case "seasonal":
      return m.seasons * (opts.seasonLength ?? SEASON_LENGTH[opts.span ?? "month"]);
    case "changePoint":
      return m.segments * SUITABILITY.shift.segment;
    case "afterDate":
      return m.afterDate;
    case "usualRange":
      return m.usualRange;
  }
}

/** How many drivers a history can carry: one per 6 periods, and at most 6 (spec 0041, rule 8). */
export function driversAllowed(periods: number): number {
  return Math.min(SUITABILITY.drivers.most, Math.floor(periods / SUITABILITY.drivers.perPeriods));
}

// ---- exact arithmetic on fractions (exact.ts), kept in lowest terms ----
const ZERO = BigInt(0);
const ONE = BigInt(1);
const zero: Fraction = { num: ZERO, den: ONE };
const whole = (n: number | bigint): Fraction => ({ num: BigInt(n), den: ONE });
const add = (a: Fraction, b: Fraction) => lowestTerms(plus(a, b));
const sub = (a: Fraction, b: Fraction) => lowestTerms(minus(a, b));
const mul = (a: Fraction, b: Fraction) => lowestTerms(times(a, b));
const div = (a: Fraction, b: Fraction) => lowestTerms(over(a, b));
const total = (fs: Fraction[]) => fs.reduce(add, zero);
const cmp = (a: Fraction, b: Fraction) => {
  const [l, r] = [a.num * b.den, b.num * a.den];
  return l < r ? -1 : l > r ? 1 : 0;
};
// Everything this is used for (the median absolute deviation, a ratio of distances, the size of the yearly patterns) is the
// same whichever way round the sign of a size is read, since each is a ratio of sizes read the same way.
// Stryker disable next-line EqualityOperator: for 0 the sign does not matter, and a size read negative everywhere gives every ratio of sizes unchanged.
const abs = (a: Fraction): Fraction => (a.num < ZERO ? { num: -a.num, den: a.den } : a);

/** The middle value of sorted fractions: the one in the middle, or the mean of the two. */
function median(sorted: Fraction[]): Fraction {
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : div(add(sorted[mid - 1], sorted[mid]), whole(2));
}
const ascending = (fs: Fraction[]) => [...fs].sort(cmp);

/** A series' values as fractions of their text, with their periods, oldest first. */
const read = (points: Point[]) => readSeries(points).map((p) => ({ period: p.period, value: fractionOf(p.value) }));

// ---- the checks ----

// How many periods the Method uses: what it says, or the shortest series (none for no series).
const periodsUsed = (inputs: SuitabilityInputs, counts: number[]) => inputs.periods ?? (counts.length > 0 ? Math.min(...counts) : 0);

// Enough periods: the Method's minimum, with how many it has.
function enoughPeriods(method: MethodId, inputs: SuitabilityInputs, counts: number[]): Finding[] {
  const need = minimumPeriods(method, { drivers: inputs.drivers, seasonLength: inputs.seasonLength, span: inputs.span });
  const have = periodsUsed(inputs, counts);
  return have < need ? [{ case: "refuse-periods", slots: { have, need, span: inputs.span } }] : [];
}

// Enough that vary: at least 4 different values, and at least half of the steps change.
function enoughVary(inputs: SuitabilityInputs): Finding[] {
  return inputs.series.flatMap((s) => {
    const vs = readSeries(s.points).map((p) => p.value);
    const changed = vs.filter((v, i) => i > 0 && v !== vs[i - 1]).length;
    const hardly = new Set(vs).size < SUITABILITY.vary.distinct || changed * SUITABILITY.vary.changedOneIn < vs.length - 1;
    return hardly ? [{ case: "refuse-vary" as const, slots: { name: s.name } }] : [];
  });
}

// Gaps: periods of the window without a value. The count, the longest run, and what is a refusal.
function gapsOf(inputs: SuitabilityInputs): { refusals: Finding[]; cautions: Finding[] } {
  const out = { refusals: [] as Finding[], cautions: [] as Finding[] };
  for (const s of inputs.series) {
    const pts = readSeries(s.points);
    if (pts.length === 0 && !inputs.window) continue;
    const from = inputs.window?.from ?? pts[0].period;
    const to = inputs.window?.to ?? pts[pts.length - 1].period;
    const size = Math.max(0, periodsBetween(from, to, inputs.span) + 1);
    const at = pts.filter((p) => p.period >= from && p.period <= to).map((p) => periodsBetween(from, p.period, inputs.span));
    const missing = Math.max(0, size - at.length);
    // The runs of missing periods: before the first value, between values, after the last.
    const edges = [-1, ...at, size];
    const run = edges.reduce((longest, p, i) => (i === 0 ? 0 : Math.max(longest, p - edges[i - 1] - 1)), 0);
    const slots = { name: s.name, missing, total: size, span: inputs.span };
    const found: [Finding[], Finding] | null = missing * SUITABILITY.gaps.oneIn > size ? [out.refusals, { case: "refuse-gaps", slots }] : run >= SUITABILITY.gaps.run ? [out.refusals, { case: "refuse-gap-run", slots: { ...slots, run } }] : missing > 0 ? [out.cautions, { case: "caution-gaps", slots }] : null;
    if (!found) continue;
    // Series that lack the same periods (the two sides of a pair) are one finding naming them all.
    // Within one list, the same count of missing periods in the same window and the same run is the same case.
    const same = found[0].find((f) => ["missing", "total", "run"].every((k) => f.slots[k] === found[1].slots[k]));
    if (same) same.slots.name = `${same.slots.name} and ${s.name}`;
    else found[0].push(found[1]);
  }
  return out;
}

// Mixed units or periods: a Metric with Aggregation none next to one of another period; an input built from another input.
function mixed(inputs: SuitabilityInputs): Finding[] {
  const ms = inputs.metrics;
  if (!ms) return [];
  const out: Finding[] = [];
  for (const m of ms) {
    const other = ms.find((o) => o.period !== m.period);
    if (m.aggregation === "none" && other) out.push({ case: "refuse-mixed-none", slots: { name: m.name, other: other.name } });
  }
  for (const [i, a] of ms.entries()) {
    const b = ms.slice(i + 1).find((o) => builtFrom(a, o));
    if (!b) continue;
    // The Metric that is worked out from the other is the one named first.
    const [derived, source] = a.formula?.includes(`{${b.slug}}`) ? [a, b] : [b, a];
    out.push({ case: "refuse-built-from", slots: { name: derived.name, other: source.name } });
  }
  return out;
}

// Far-off values: the exact distances in median absolute deviations, and whether leaving out the 1 to 3 most extreme moves the result.
function farOff(inputs: SuitabilityInputs): Finding[] {
  if (!inputs.rerun) return [];
  const far = new Map<string, Fraction>();
  for (const s of inputs.series) {
    // Every series that gets this far varies (the check before refuses a series with fewer than 4 different values).
    const rows = read(s.points);
    const mid = median(ascending(rows.map((r) => r.value)));
    const mad = median(ascending(rows.map((r) => abs(sub(r.value, mid)))));
    if (mad.num === ZERO) continue;
    for (const r of rows) {
      const distance = div(abs(sub(r.value, mid)), mad);
      if (cmp(distance, whole(SUITABILITY.farOff.mads)) <= 0) continue;
      const known = far.get(r.period);
      // Stryker disable next-line EqualityOperator: an equal distance replaces a distance with itself.
      if (!known || cmp(distance, known) > 0) far.set(r.period, distance);
    }
  }
  // The most extreme first; the same distance, the earlier period.
  // Stryker disable next-line EqualityOperator: two entries never have the same period, since the periods are the keys of the map.
  const order = [...far.entries()].sort(([pa, a], [pb, b]) => cmp(b, a) || (pa < pb ? -1 : 1)).map(([p]) => p).slice(0, SUITABILITY.farOff.most);
  const base = inputs.rerun(new Set());
  if (!base) return [];
  const range = base.range ?? inputs.scale ?? 0;
  for (let k = 1; k <= order.length; k++) {
    const alt = inputs.rerun(new Set(order.slice(0, k)));
    if (!alt) continue;
    const moved = range > 0 && Math.abs(alt.value - base.value) * SUITABILITY.farOff.oneIn > range;
    if (moved || alt.value * base.value < 0) {
      return [{ case: "caution-far-off", slots: { count: k, without: alt.value, span: inputs.span } }];
    }
  }
  return [];
}

/** The skewness of values (the moment coefficient g1 = m3 ÷ m2^1.5, as SciPy's `skew`), or null where they do not vary.
 * Decided exactly: g1² = n · S3² ÷ S2³ with S2 and S3 the sums of squared and cubed distances from the mean. */
export function skewness(values: Fraction[]): { above: (limit: number) => boolean; value: number } | null {
  const n = whole(values.length);
  const mean = div(total(values), n);
  const ds = values.map((v) => sub(v, mean));
  const s2 = total(ds.map((d) => mul(d, d)));
  if (s2.num === ZERO) return null;
  const s3 = total(ds.map((d) => mul(d, mul(d, d))));
  const g2 = div(mul(n, mul(s3, s3)), mul(s2, mul(s2, s2)));
  return { above: (limit) => cmp(g2, mul(fractionOf(limit), fractionOf(limit))) > 0, value: (s3.num < ZERO ? -1 : 1) * Math.sqrt(nearest(g2)) };
}

// Skew and ties: for Pearson's r a switch to ranks where the Method can, else a caution.
function skewAndTies(method: MethodId, inputs: SuitabilityInputs): { cautions: Finding[]; switches: Switch[] } {
  const out = { cautions: [] as Finding[], switches: [] as Switch[] };
  const rankable = (method === "correlation" || method === "drivers" || method === "lag") && inputs.canSwitchTo?.includes("rank-correlation");
  for (const s of inputs.series) {
    const vs = readSeries(s.points).map((p) => p.value);
    // A series that gets this far varies, so it has a skewness.
    const skewed = skewness(vs.map(fractionOf))!.above(SUITABILITY.skew.skewness);
    const ties = new Set(vs).size * SUITABILITY.skew.tiesOneIn < vs.length;
    if ((skewed || ties) && rankable) out.switches.push({ case: "switch-rank", slots: { name: s.name }, to: "rank-correlation" });
    else if (skewed) out.cautions.push({ case: "caution-skew", slots: { name: s.name } });
    else if (ties) out.cautions.push({ case: "caution-ties", slots: { name: s.name } });
  }
  return out;
}

// The number of ways to choose k of n, for 0 ≤ k; for k above n a factor n − k + i is 0, so the result is 0, as it should be.
const choose = (n: number, k: number): bigint => {
  let c = ONE;
  for (let i = 1; i <= k; i++) c = (c * BigInt(n - k + i)) / BigInt(i);
  return c;
};

/** The exact chance of this few runs or fewer among `n1` plus and `n2` minus signs in random order (the runs test, one-sided:
 * too few changes of sign), as [at most, all] counts of arrangements. A run is an unbroken stretch of one sign. */
export function runsTail(n1: number, n2: number, runs: number): { atMost: bigint; all: bigint } {
  let atMost = ZERO;
  for (let r = 2; r <= runs; r++) {
    const j = r >> 1;
    atMost += r % 2 === 0 ? BigInt(2) * choose(n1 - 1, j - 1) * choose(n2 - 1, j - 1) : choose(n1 - 1, j - 1) * choose(n2 - 1, j) + choose(n1 - 1, j) * choose(n2 - 1, j - 1);
  }
  return { atMost, all: choose(n1 + n2, n1) };
}

// Not a straight line: the signs of the misses, ordered by the fitted value, change fewer times than a straight line would give.
function straightLine(inputs: SuitabilityInputs): Finding[] {
  if (!inputs.misses) return [];
  // The sort is stable, so misses at the same level keep the order they were given in: the same verdict every time.
  const ordered = inputs.misses.filter((m) => Number.isFinite(m.level) && Number.isFinite(m.miss) && m.miss !== 0).sort((a, b) => a.level - b.level);
  // Stryker disable next-line EqualityOperator: zero misses are left out above, and reading every sign the other way swaps the two counts and keeps the number of runs.
  const signs = ordered.map((m) => m.miss > 0);
  const [n1, n2] = [signs.filter(Boolean).length, signs.filter((s) => !s).length];
  if (n1 === 0 || n2 === 0) return [];
  // The runs: one, and one more for every change of sign.
  const runs = 1 + signs.filter((s, i) => i > 0 && s !== signs[i - 1]).length;
  const { atMost, all } = runsTail(n1, n2, runs);
  return atMost * BigInt(SUITABILITY.curve.oneIn) <= all ? [{ case: "caution-curved", slots: {} }] : [];
}

// Changing relationship: the link in the first and the last half of the pairs (an equal number each, the middle pair left
// out when there is an odd number).
function changing(inputs: SuitabilityInputs): Finding[] {
  if (inputs.series.length !== 2) return [];
  const [x, y] = inputs.series.map((s) => readSeries(s.points));
  const ys = new Set(y.map((p) => p.period));
  const both = x.filter((p) => ys.has(p.period)).map((p) => p.period);
  const h = both.length >> 1;
  if (h < SUITABILITY.changing.half) return [];
  // The link in a half is the Method's own statistic: Pearson's r, or the rank correlation where the answer is one.
  const [mx, my] = [new Map(x.map((p) => [p.period, p.value])), new Map(y.map((p) => [p.period, p.value]))];
  const halfR = (periods: string[]) => {
    // Each half has at least the 6 pairs a correlation needs.
    if (!inputs.rank) return pearson(periods.map((p) => ({ period: p, value: mx.get(p)! })), periods.map((p) => ({ period: p, value: my.get(p)! })))!.r;
    const found = rankAssociation(periods.map((p) => mx.get(p)!), periods.map((p) => my.get(p)!));
    return found ? (found.negative ? -1 : 1) * Math.sqrt(nearest(found.rho2)) : NaN;
  };
  // A half that does not vary has no r (NaN), and linkChange says nothing of it.
  const [first, last] = [halfR(both.slice(0, h)), halfR(both.slice(both.length - h))];
  const change = linkChange(first, last);
  const cases = { flipped: "caution-link-flipped", weaker: "caution-link-weaker", stronger: "caution-link-stronger" } as const;
  return change ? [{ case: cases[change], slots: { latest: strengthOf(last, inputs.rank ? 3 + (h - 3) / RANK_SPREAD : h) } }] : [];
}

/** How a link changed between the first and the last half of the history, from the two r: "flipped" (opposite signs, both at
 * least 0.3 in size), "weaker" (the first at least 0.4, the last below half of it) or "stronger" (the reverse), else null. */
export function linkChange(first: number, last: number): "flipped" | "weaker" | "stronger" | null {
  const c = SUITABILITY.changing;
  const [a, b] = [Math.abs(first), Math.abs(last)];
  if (Math.sign(first) !== Math.sign(last) && a >= c.sign && b >= c.sign) return "flipped";
  if (a >= c.clear && b * c.dropOneIn < a) return "weaker";
  return b >= c.clear && a * c.dropOneIn < b ? "stronger" : null;
}

// The residuals of values about their least-squares line on `xs`, exactly.
function aboutLine(xs: Fraction[], ys: Fraction[]): Fraction[] {
  const n = whole(xs.length);
  const [mx, my] = [div(total(xs), n), div(total(ys), n)];
  const dx = xs.map((x) => sub(x, mx));
  const slope = div(total(dx.map((d, i) => mul(d, sub(ys[i], my)))), total(dx.map((d) => mul(d, d))));
  return ys.map((y, i) => sub(sub(y, my), mul(slope, dx[i])));
}

/** The most likely step in level of a series that has a straight-line trend: for each split with at least 4 values each side,
 * y = a + b·position + c·(1 from the split on) is fitted exactly (the step and the values both taken about the straight
 * line, so c = Σ s·y ÷ Σ s² on what is left), and the split with the smallest sum of squared misses wins (the earliest on a
 * tie). `big` says the step is `SUITABILITY.shift.misses` typical misses or more, decided exactly as (n − 3) · c² ≥ 9 · SSE
 * (the typical miss is s = √(SSE ÷ (n − 3))); `misses` is the step in typical misses. Null for fewer than 8 values or a best
 * split with no step (c = 0). */
export function levelShift(points: Point[], span: Span): { index: number; period: string; step: number; misses: number; big: boolean } | null {
  const rows = read(points);
  const n = rows.length;
  const segment = SUITABILITY.shift.segment;
  if (n < 2 * segment) return null;
  const xs = rows.map((r) => whole(periodsBetween(rows[0].period, r.period, span)));
  const ry = aboutLine(xs, rows.map((r) => r.value));
  const syy = total(ry.map((r) => mul(r, r)));
  const fits = Array.from({ length: n - 2 * segment + 1 }, (_, i) => {
    const k = segment + i;
    const rs = aboutLine(xs, xs.map((_x, j) => (j >= k ? whole(1) : zero)));
    const ssy = total(rs.map((r, j) => mul(r, ry[j])));
    const c = div(ssy, total(rs.map((r) => mul(r, r))));
    return { index: k, c, sse: sub(syy, mul(c, ssy)) };
  });
  const best = fits.reduce((a, b) => (cmp(b.sse, a.sse) < 0 ? b : a));
  if (best.c.num === ZERO) return null;
  const [c2, sse] = [mul(best.c, best.c), best.sse];
  const big = cmp(mul(whole(n - 3), c2), mul(whole(SUITABILITY.shift.misses ** 2), sse)) >= 0;
  // The typical miss is 0 for a perfect step on a line: the step is then beyond any count of misses.
  const misses = sse.num === ZERO ? Infinity : Math.sqrt(nearest(div(mul(whole(n - 3), c2), sse)));
  return { index: best.index, period: rows[best.index].period, step: nearest(best.c), misses, big };
}

// Level shifts: a step of 3 typical misses or more; the data after it is used where it still has the Method's minimum.
function levelShifts(method: MethodId, inputs: SuitabilityInputs): { cautions: Finding[]; switches: Switch[] } {
  const out = { cautions: [] as Finding[], switches: [] as Switch[] };
  // Only the Methods that look at the level run this check, and their minimum does not depend on drivers or seasons.
  const minimum = minimumPeriods(method);
  for (const s of inputs.series) {
    const found = levelShift(s.points, inputs.span);
    if (!found?.big) continue;
    const after = readSeries(s.points).length - found.index;
    const slots = { name: s.name, from: found.period, count: after, span: inputs.span };
    if (after >= minimum && inputs.canSwitchTo?.includes("data-after")) out.switches.push({ case: "switch-after-shift", slots, to: "data-after" });
    else out.cautions.push({ case: "caution-level-shift", slots });
  }
  return out;
}

// The yearly pattern of one half: each position's mean distance from its season's mean, over the seasons of the half.
function pattern(values: Fraction[], length: number, seasons: number[]): Fraction[] {
  const sums = Array.from({ length }, () => zero);
  for (const s of seasons) {
    const part = values.slice(s * length, (s + 1) * length);
    const mean = div(total(part), whole(length));
    part.forEach((v, j) => (sums[j] = add(sums[j], sub(v, mean))));
  }
  return sums.map((v) => div(v, whole(seasons.length)));
}

// How far the yearly pattern of the first half of the seasons is from the last half's, exactly, as a share of their combined size.
function seasonShare(points: Point[], span: Span, length: number): Fraction | null {
  const rows = read(points);
  const seasons = Math.floor(rows.length / length);
  const unbroken = rows.length > 0 && periodsBetween(rows[0].period, rows[rows.length - 1].period, span) + 1 === rows.length;
  // A season of 1 has no pattern (every value is its season's mean), which comes out as no size below.
  if (seasons < 2 || !unbroken) return null;
  const values = rows.map((r) => r.value);
  const h = seasons >> 1;
  const idx = (from: number) => Array.from({ length: h }, (_, i) => from + i);
  const [p, q] = [pattern(values, length, idx(0)), pattern(values, length, idx(seasons - h))];
  const size = total(p.map((v, j) => add(abs(v), abs(q[j]))));
  return size.num === ZERO ? null : div(total(p.map((v, j) => abs(sub(v, q[j])))), size);
}

/** How far the yearly pattern of the first half of the seasons is from the last half's, as a share of their combined size
 * (0 the same, 1 as different as can be); null where there are fewer than two full seasons, a gap, or no pattern at all.
 * A season's pattern is each position's distance from its season's mean. */
export function seasonDifference(points: Point[], span: Span, length: number): number | null {
  const f = seasonShare(points, span, length);
  return f && nearest(f);
}

// Seasonality that does not repeat: the pattern's share above 1/2, decided exactly.
function seasonRepeats(inputs: SuitabilityInputs): { cautions: Finding[]; switches: Switch[] } {
  const out = { cautions: [] as Finding[], switches: [] as Switch[] };
  const diff = seasonShare(inputs.series[0].points, inputs.span, inputs.seasonLength ?? SEASON_LENGTH[inputs.span]);
  if (!diff || cmp(diff, { num: ONE, den: BigInt(SUITABILITY.season.oneIn) }) <= 0) return out;
  if (inputs.canSwitchTo?.includes("holt")) out.switches.push({ case: "switch-holt", slots: { span: inputs.span }, to: "holt" });
  else out.cautions.push({ case: "caution-season", slots: { span: inputs.span } });
  return out;
}

/** Spearman's rank correlation of two lists, worked out exactly: ranks (ties share their mean rank, held as twice the rank
 * so they stay whole numbers), then the sums of products about the means. Returns r² and the sign as a fraction pair, or
 * null where either list does not vary. */
export function rankAssociation(a: number[], b: number[]): { rho2: Fraction; negative: boolean } | null {
  // Twice the rank, less 1: a shift of every rank by the same amount changes no correlation.
  const rank2 = (vs: number[]) => vs.map((v) => BigInt(2 * vs.filter((w) => w < v).length + vs.filter((w) => w === v).length));
  const [ra, rb] = [rank2(a), rank2(b)];
  const n = BigInt(a.length);
  const sum = (xs: bigint[]) => xs.reduce((s, x) => s + x, ZERO);
  const about = (xs: bigint[], ys: bigint[]) => n * sum(xs.map((x, i) => x * ys[i])) - sum(xs) * sum(ys);
  const [sxy, sxx, syy] = [about(ra, rb), about(ra, ra), about(rb, rb)];
  if (sxx === ZERO || syy === ZERO) return null;
  return { rho2: lowestTerms({ num: sxy * sxy, den: sxx * syy }), negative: sxy < ZERO };
}

// Spread that grows: a rank correlation of the level and the size of the misses above 1/2.
function spreadGrows(inputs: SuitabilityInputs): { cautions: Finding[]; switches: Switch[] } {
  const out = { cautions: [] as Finding[], switches: [] as Switch[] };
  if (!inputs.misses) return out;
  const rows = inputs.misses.filter((m) => Number.isFinite(m.level) && Number.isFinite(m.miss));
  const rho = rankAssociation(rows.map((m) => m.level), rows.map((m) => Math.abs(m.miss)));
  if (!rho || rho.negative || cmp(rho.rho2, { num: ONE, den: BigInt(SUITABILITY.spread.oneIn ** 2) }) <= 0) return out;
  if (inputs.canSwitchTo?.includes("percent-ranges") && rows.every((m) => m.level > 0)) out.switches.push({ case: "switch-percent", slots: {}, to: "percent-ranges" });
  else out.cautions.push({ case: "caution-spread", slots: {} });
  return out;
}

// Too many Metrics for the history: at most one driver per 6 periods, at most 6. The numbers of the finding, or none.
function tooMany(inputs: SuitabilityInputs, have: number): Slots | null {
  const allowed = driversAllowed(have);
  const drivers = inputs.drivers ?? 0;
  return drivers > allowed ? { drivers, have, allowed, span: inputs.span } : null;
}

/** Runs the checks a Method is held to on the series it will use, and says what is found: refusals first (nothing else is
 * judged once the data is too thin), then cautions and switches to another Method. Reading the inputs changes none of them. */
export function checkSuitability(method: MethodId, inputs: SuitabilityInputs): Verdict {
  // Values that cannot be worked out exactly in reasonable time (work-bound.ts) are refused before anything else is done with them.
  const wide = wideFindings(inputs.series);
  if (wide.length > 0) return { refusals: wide, cautions: [], switches: [] };
  const applies = new Set(APPLIES[method]);
  const counts = inputs.series.map((s) => readSeries(s.points).length);
  const thin = enoughPeriods(method, inputs, counts);
  if (thin.length > 0) return { refusals: thin, cautions: [], switches: [] };
  const have = periodsUsed(inputs, counts);
  const gaps = gapsOf(inputs);
  const refusals = [...enoughVary(inputs), ...gaps.refusals, ...(applies.has("mixed") ? mixed(inputs) : [])];
  const crowd = applies.has("too-many") ? tooMany(inputs, have) : null;
  const firstPass = inputs.canSwitchTo?.includes("first-pass") === true;
  if (crowd && !firstPass) refusals.push({ case: "refuse-too-many", slots: crowd });
  if (refusals.length > 0) return { refusals, cautions: [], switches: [] };
  const rank = applies.has("skew-ties") ? skewAndTies(method, inputs) : { cautions: [], switches: [] };
  const shift = applies.has("level-shift") ? levelShifts(method, inputs) : { cautions: [], switches: [] };
  const season = applies.has("season") ? seasonRepeats(inputs) : { cautions: [], switches: [] };
  const spread = applies.has("spread") ? spreadGrows(inputs) : { cautions: [], switches: [] };
  return {
    refusals: [],
    cautions: [
      ...gaps.cautions,
      ...(applies.has("far-off") ? farOff(inputs) : []),
      ...rank.cautions,
      ...(applies.has("straight-line") ? straightLine(inputs) : []),
      ...(applies.has("changing") ? changing(inputs) : []),
      ...shift.cautions,
      ...season.cautions,
      ...spread.cautions,
    ],
    switches: [...rank.switches, ...shift.switches, ...season.switches, ...spread.switches, ...(crowd && firstPass ? [{ case: "switch-first-pass" as const, slots: crowd, to: "first-pass" as const }] : [])],
  };
}
