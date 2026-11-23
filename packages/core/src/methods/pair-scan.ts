// The pair scan (GLOSSARY: Heads-up, Common Period; spec 0041, "Heads-ups", "Moving together" and "Stopped moving together"):
// for every pair of a Workspace's Metrics, how their changes correlate, over delays of 0 to 3 periods either way, in the
// whole history, in the history before its last 6 periods, and in those 6. The pair table keeps what this finds; who may
// read which row is decided elsewhere (heads-ups.ts). Pure.
//
// What is worked out for a pair of series on their Common Period (the changes of each, never the levels: growth removed):
//  - for each delay from -3 to 3 (positive: the first Metric moves first), the pairs "the leader's change `delay` periods
//    before the follower's" with at least 12 pairs and both series changing; Pearson's r of them, how many pairs count once
//    the way each series follows its own past is allowed for (the effective count, Bartlett's rule), and the chance of that
//    r by luck (p-value.ts). The pair's chance is the smallest of the delays' chances times the number of delays looked at
//    (never above 1), and its delay is the one with the smallest chance. The effective count is read from how each whole
//    series follows its own past (its autocorrelations), so a Metric that is itself a moving average or a running total is
//    not mistaken for a link;
//  - the same for the history before the last 6 periods (needs 12 pairs again), and the correlation at that delay over the
//    last 6 periods, with the chance that the link dropped (the difference of the two Fisher z values against the spread
//    of both);
//  - whether a pair meets the Heads-up conditions that do not depend on the other pairs: at least 12 pairs, |r| at least 0.7
//    over all of them and in each half of them (the same sign), the chance within the correction's rate, and every
//    suitability check of a lag passed with nothing to say (a Heads-up is only for a pair that passes cleanly). The
//    thresholds are decided exactly (on the values' text), and only for a pair that comes near them.
// What the other pairs decide (the correction for the number of pairs looked at) is not here: it is worked out per
// person over the pairs that person may see (heads-up.ts).
import { changes, readSeries } from "../basis";
import { AUTO_LAGS, autocorrelations, effectiveCount } from "../effective-count";
import { fractionOf, lowestTerms, minus, plus, times, type Fraction } from "../exact";
import { periodStart, periodsBetween, shiftPeriod, type Span, type YearStart } from "../periods";
import { checkSuitability, verdictOutcome } from "../suitability";
import { SCAN_PAIRS_BUDGET, tryWork, wideReason, withWork } from "../work-bound";
import type { Point } from "../types";
import { normalCdf } from "./normal-curve";
import { pValueOfR } from "./p-value";

/** Every threshold of the Heads-ups, once. */
export const HEADS_UP = {
  /** The correlation a link must reach, and the one under which it has stopped. */
  strong: 0.7,
  low: 0.3,
  /** Pairs of periods a result needs (the lag minimum), and in each half of them at least 6. */
  minPairs: 12,
  /** The longest delay looked at, either way, and the periods that count as "recent". */
  maxLag: 3,
  recent: 6,
  /** The share of the pairs reported that may be luck (Benjamini-Hochberg). */
  rate: 0.1,
  /** The latest periods of a series that are used, a Metric's value counts as current within this many periods of today. */
  window: 120,
  current: 6,
  /** What a scan looks at: at most this many Metrics and pairs. */
  maxMetrics: 200,
  maxPairs: 20_000,
  /** Fewer effective pairs than this say nothing (Fisher's z needs more than 3). */
  minEffective: 4,
  /** The autocorrelations that are allowed for: a third of the pairs, at most 12 (a year of months). */
  autoLags: AUTO_LAGS,
} as const;

/** A series of changes laid out by position on an axis: the change of the period `u` periods after the axis's first
 * period is at index `u`, NaN where there is none. */
export type Axis = { span: Span; first: string; length: number };

/** The axis the changes of several series lie on: from the earliest to the latest period, null where there are none. */
export function axisOf(series: readonly (readonly Point[])[], span: Span): Axis | null {
  const periods = series.flat().map((p) => p.period).sort();
  if (periods.length === 0) return null;
  return { span, first: periods[0], length: periodsBetween(periods[0], periods[periods.length - 1], span) + 1 };
}

/** A series of changes laid out on an axis (see Axis), with how it follows its own past: its autocorrelations at delays 1 to 12. */
export type Laid = { values: number[]; rho: number[] };

/** The changes laid out on the axis, with their autocorrelations (`rho`). A period outside the axis or given twice does not occur in changes of one series. */
export function layOut(changed: readonly Point[], axis: Axis): Laid {
  const values = new Array<number>(axis.length).fill(NaN);
  for (const p of changed) values[periodsBetween(axis.first, p.period, axis.span)] = p.value;
  // Read over the laid-out values, so a delay of k is k periods in time even across a missing period.
  return { values, rho: autocorrelations(values) };
}

// ---- doubles: the screening of every pair ----

const mean = (v: readonly number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const same = (v: readonly number[]) => v.every((x) => x === v[0]);

// Pearson's r in two passes over the centred values; NaN where one series does not vary.
function correlation(xs: readonly number[], ys: readonly number[]): number {
  if (same(xs) || same(ys)) return NaN;
  const [mx, my] = [mean(xs), mean(ys)];
  let [sxy, sxx, syy] = [0, 0, 0];
  for (let i = 0; i < xs.length; i++) {
    const [dx, dy] = [xs[i] - mx, ys[i] - my];
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return Math.min(1, Math.max(-1, sxy / (Math.sqrt(sxx) * Math.sqrt(syy))));
}

// ---- exact: the thresholds ----

const ZERO: Fraction = { num: BigInt(0), den: BigInt(1) };
const sumOf = (fs: Fraction[]) => fs.reduce((a, b) => lowestTerms(plus(a, b)), ZERO);

/** Whether |r| of the pairs is at least `num` ÷ `den`, decided exactly on the values' text, and the sign of r (null where
 * either series does not vary or there are no pairs): r² ≥ (num ÷ den)² as Sxy²·den² ≥ num²·Sxx·Syy on exact fractions. */
export function exactAtLeast(xs: readonly number[], ys: readonly number[], num: number, den: number): { atLeast: boolean; sign: 1 | -1 } | null {
  const n = BigInt(xs.length);
  const [fx, fy] = [xs.map(fractionOf), ys.map(fractionOf)];
  const [sx, sy] = [sumOf(fx), sumOf(fy)];
  const about = (as: Fraction[], bs: Fraction[], sa: Fraction, sb: Fraction) => lowestTerms(minus(times({ num: n, den: BigInt(1) }, sumOf(as.map((a, i) => times(a, bs[i])))), times(sa, sb)));
  const [sxy, sxx, syy] = [about(fx, fy, sx, sy), about(fx, fx, sx, sx), about(fy, fy, sy, sy)];
  if (sxx.num === BigInt(0) || syy.num === BigInt(0)) return null;
  const [a, b] = [BigInt(num), BigInt(den)];
  const left = times(times(sxy, sxy), { num: b * b, den: BigInt(1) });
  const right = times(times({ num: a * a, den: BigInt(1) }, sxx), syy);
  return { atLeast: minus(left, right).num >= BigInt(0), sign: sxy.num < BigInt(0) ? -1 : 1 };
}

// ---- windows of pairs ----

/** The pairs of one delay: the leader's change `delay` periods before the follower's, by the follower's position. */
type Pairs = { at: number[]; lead: number[]; follow: number[] };

/** One delay's result in a window: how many pairs, r (NaN where a series does not vary or there are fewer than 12 pairs), the
 * effective count and the chance of this delay alone. */
type Lagged = { lag: number; n: number; r: number; nEff: number; p: number };

// The delays in the order they are preferred on a tie: none first, then the first Metric leading by 1, the second by 1, and so on.
const DELAYS: readonly number[] = [0, ...Array.from({ length: HEADS_UP.maxLag }, (_, i) => [i + 1, -(i + 1)]).flat()];

// Which series leads and by how many places: the first Metric for a positive delay.
// Stryker disable next-line EqualityOperator: with no delay the two series are paired place for place, and which is called the leader changes nothing a result reads.
const roles = (a: readonly number[], b: readonly number[], lag: number) => (lag >= 0 ? { leader: a, follower: b, gap: lag } : { leader: b, follower: a, gap: -lag });

// The pairs of a delay with the follower's position from `from` to `to`.
function pairsAt(a: readonly number[], b: readonly number[], lag: number, from: number, to: number): Pairs {
  const { leader, follower, gap } = roles(a, b, lag);
  const out: Pairs = { at: [], lead: [], follow: [] };
  // (`to` is never past the last place of the series, and a place past it would read undefined, which is skipped.)
  for (let u = Math.max(from, gap); u <= to; u++) {
    const [l, f] = [leader[u - gap], follower[u]];
    if (Number.isFinite(l) && Number.isFinite(f)) {
      out.at.push(u);
      out.lead.push(l);
      out.follow.push(f);
    }
  }
  return out;
}

// How many pairs a delay has in a window and their r, without building the pairs (a scan looks at millions): two passes over the
// positions, the second on the centred values. A series whose pairs are all one value has no r, found by comparing, not by a sum
// that rounding could leave a hair above 0.
function lagStats(a: readonly number[], b: readonly number[], lag: number, to: number): { n: number; r: number } | null {
  const { leader, follower, gap } = roles(a, b, lag);
  // A delay's pairs start at the first place the leader has one `gap` places back.
  const start = gap;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let firstX = NaN;
  let firstY = NaN;
  let variesX = false;
  let variesY = false;
  for (let u = start; u <= to; u++) {
    const l = leader[u - gap];
    const f = follower[u];
    if (!Number.isFinite(l) || !Number.isFinite(f)) continue;
    if (n === 0) [firstX, firstY] = [l, f];
    n++;
    sx += l;
    sy += f;
    variesX = variesX || l !== firstX;
    variesY = variesY || f !== firstY;
  }
  if (n < HEADS_UP.minPairs || !variesX || !variesY) return null;
  const mx = sx / n;
  const my = sy / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let u = start; u <= to; u++) {
    const l = leader[u - gap];
    const f = follower[u];
    if (!Number.isFinite(l) || !Number.isFinite(f)) continue;
    const dx = l - mx;
    const dy = f - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  // The two roots are taken before the product, so squares that are too large for a double for the product do not turn r into 0.
  return { n, r: Math.min(1, Math.max(-1, sxy / (Math.sqrt(sxx) * Math.sqrt(syy)))) };
}

// The delays of a window with enough pairs and series that change, the best of them (with its pairs), and how many were looked at.
function lagWindow(a: Laid, b: Laid, to: number): { best: Lagged; pairs: Pairs; tries: number } | null {
  const found: Lagged[] = [];
  for (const lag of DELAYS) {
    const stats = lagStats(a.values, b.values, lag, to);
    // (A sum of squares too large for a double makes r NaN: no result for that delay.)
    if (!stats || Number.isNaN(stats.r)) continue;
    const { n, r } = stats;
    const nEff = effectiveCount(n, a.rho, b.rho);
    if (Number.isNaN(nEff)) continue;
    found.push({ lag, n, r, nEff, p: nEff < HEADS_UP.minEffective ? 1 : pValueOfR(r, nEff) });
  }
  if (found.length === 0) return null;
  // Strictly smaller wins, so the earlier in DELAYS keeps a tie.
  const best = found.reduce((top, l) => (l.p < top.p ? l : top));
  return { best, pairs: pairsAt(a.values, b.values, best.lag, 0, to), tries: found.length };
}

/** What one window of a pair comes to. `lag` is positive where the first Metric moves first. `pDelays` is the chance of the best delay
 * by luck, multiplied by the number of delays looked at (`tries`) and held to 1. `p` is the chance of the link being this strong in
 * both halves as well: the larger of `pDelays` and the chances of each half on its own (a link is only as sure as its weakest
 * half), the number the correction for the pairs looked at reads. The halves are the pairs in time order, the first the smaller
 * where n is odd; a half that does not vary has no r (null). `meets`: every condition of a Heads-up that does not depend on the
 * other pairs holds (see the file's header). */
export type Window = { lag: number; r: number; n: number; nEff: number; pDelays: number; p: number; tries: number; meets: boolean; rFirst: number | null; nFirst: number; rSecond: number | null; nSecond: number };

/** The last periods: the correlation at the delay of the earlier window, the chance that the link dropped, and whether
 * |r| is under 0.3 (decided exactly; false for an earlier window that did not meet the conditions, where it is never read). Null where the last 6 periods do not all have a pair or one series is constant. */
export type Recent = { r: number; n: number; low: boolean; dropP: number };

/** A pair's result: the period it runs to, the whole history, and the history before the last 6 periods. */
export type PairScan = { through: string; full: Window; before: (Window & { recent: Recent | null }) | null };

// The labels the suitability checks and the exact checks read the pairs by: the leader's own period.
const labelled = (axis: Axis, positions: readonly number[], values: readonly number[]): Point[] => positions.map((u, i) => ({ period: shiftPeriod(axis.first, axis.span, u), value: values[i] }));

/** Whether `r` and the r of each half (NaN: a half that does not vary) are all at least the strong threshold away from 0, with a
 * hair to spare for the double (the exact answer decides near it), and all on the same side of 0. */
export function strongAndAgreeing(r: number, halves: readonly number[]): boolean {
  const sign = Math.sign(r);
  return [r, ...halves].every((x) => Math.abs(x) >= HEADS_UP.strong - 1e-9 && Math.sign(x) === sign);
}

/** Whether the pairs (the leader's values and the follower's, in time order) are strong in the whole and in each half: |r| at least 0.7
 * over all of them and over each half (the first the smaller where the count is odd), all on the same side of 0. The doubles screen
 * and the exact answer decides (exactAtLeast), so a link of exactly 0.7 is strong and one a hair under is not. */
export function strongInBoth(lead: readonly number[], follow: readonly number[]): boolean {
  const cut = Math.floor(lead.length / 2);
  const parts = [[lead, follow], [lead.slice(0, cut), follow.slice(0, cut)], [lead.slice(cut), follow.slice(cut)]];
  const [whole, ...halves] = parts.map(([x, y]) => correlation(x, y));
  // Past the screen every series varies (r is a number), so the exact answer exists.
  return strongAndAgreeing(whole, halves) && parts.every(([x, y]) => exactAtLeast(x, y, 7, 10)!.atLeast);
}

// Whether a window with these pairs meets the conditions that do not depend on the other pairs. `lead` and `follow` are the
// pairs in time order at `at` (the follower's position), and `gap` the delay's size.
function meetsConditions(pairs: Pairs, p: number, axis: Axis): boolean {
  const { at, lead, follow } = pairs;
  // Stryker disable next-line EqualityOperator: a chance of exactly 0.1 is a measure-zero event in doubles, and which side of it counts is a convention (within the rate).
  if (p > HEADS_UP.rate || !strongInBoth(lead, follow)) return false;
  // Both series are labelled by the follower's place: the checks only need the same label for the two values of a pair.
  const [x, y] = [labelled(axis, at, lead), labelled(axis, at, follow)];
  const verdict = checkSuitability("lag", {
    // Stryker disable next-line StringLiteral: the names only go into the text of a finding, which is thrown away.
    series: [{ name: "a", points: x }, { name: "b", points: y }],
    span: axis.span,
    periods: at.length,
    scale: 1,
    // The result with some periods left out, for the far-off check: r by doubles is enough to see whether it moves.
    // (A far-off check only takes out 1 to 3 of at least 12 pairs; a result that is then NaN moves nothing.)
    rerun: (left) => {
      const keep = at.map((u) => !left.has(shiftPeriod(axis.first, axis.span, u)));
      return { value: correlation(lead.filter((_, i) => keep[i]), follow.filter((_, i) => keep[i])) };
    },
  });
  return verdictOutcome(verdict) === "ok";
}

// The first and last position with a change.
// The last place with a change (−1 where there is none, which no delay can make a pair of).
const lastOf = (v: readonly number[]) => {
  // Stryker disable next-line UnaryOperator: a series with no change has no pair, so the starting value is never what decides.
  let last = -1;
  v.forEach((x, i) => { if (Number.isFinite(x)) last = i; });
  return last;
};

/** The result for a pair of Metrics: `a` and `b` are their changes laid out on the same `axis` (layOut). Null where the pair
 * cannot be looked at: no delay has 12 pairs of changes with both series changing, or the two series end more than the
 * longest delay apart. A window's pairs are counted by the later of the two periods of each pair. */
export function scanPair(a: Laid, b: Laid, axis: Axis): PairScan | null {
  const [ea, eb] = [lastOf(a.values), lastOf(b.values)];
  if (Math.abs(ea - eb) > HEADS_UP.maxLag) return null;
  // Stryker disable next-line ArithmeticOperator: a place past the end reads undefined, which is skipped.
  const all = lagWindow(a, b, axis.length - 1);
  if (!all) return null;
  const last = Math.min(ea, eb);
  const earlier = lagWindow(a, b, last - HEADS_UP.recent);
  const before = earlier && windowOf(earlier, a, b, axis);
  return { through: shiftPeriod(axis.first, axis.span, last), full: windowOf(all, a, b, axis), before: before ? { ...before, recent: recentOf(a, b, earlier!, last, before.meets) } : null };
}

// A window's result: the best delay, its halves and the chance of the link in both of them.
function windowOf(w: NonNullable<ReturnType<typeof lagWindow>>, a: Laid, b: Laid, axis: Axis): Window {
  const pDelays = Math.min(1, w.tries * w.best.p);
  const cut = Math.floor(w.best.n / 2);
  const half = (from: number, to: number) => {
    const [x, y] = [w.pairs.lead.slice(from, to), w.pairs.follow.slice(from, to)];
    const r = correlation(x, y);
    const nEff = effectiveCount(to - from, a.rho, b.rho);
    // A half that does not vary has no r, and no chance to speak of: 1.
    return { r: Number.isNaN(r) ? null : r, n: to - from, p: Number.isNaN(r) || nEff < HEADS_UP.minEffective ? 1 : pValueOfR(r, nEff) };
  };
  const [first, second] = [half(0, cut), half(cut, w.best.n)];
  const p = Math.max(pDelays, first.p, second.p);
  return { lag: w.best.lag, r: w.best.r, n: w.best.n, nEff: w.best.nEff, pDelays, p, tries: w.tries, meets: meetsConditions(w.pairs, p, axis), rFirst: first.r, nFirst: first.n, rSecond: second.r, nSecond: second.n };
}

// The last 6 periods at the earlier window's delay, and the chance that the link dropped from what the earlier window had.
function recentOf(a: Laid, b: Laid, earlier: { best: Lagged }, last: number, strong: boolean): Recent | null {
  const { lag, r: before, nEff } = earlier.best;
  const pairs = pairsAt(a.values, b.values, lag, last - HEADS_UP.recent + 1, last);
  if (pairs.at.length !== HEADS_UP.recent) return null;
  const r = correlation(pairs.lead, pairs.follow);
  if (Number.isNaN(r)) return null;
  // The drop of the link's strength in Fisher's z, one-sided, against the spread of the two: the earlier window's
  // effective count and the 6 of the last periods.
  // Stryker disable next-line EqualityOperator: only the drop of a link that met the conditions (|r| of at least 0.7, never 0) is ever read.
  const sign = before < 0 ? -1 : 1;
  const drop = Math.atanh(Math.abs(before)) - Math.atanh(sign * r);
  const spread = Math.sqrt(1 / (nEff - 3) + 1 / (HEADS_UP.recent - 3));
  const dropP = nEff < HEADS_UP.minEffective || Number.isNaN(drop) ? 1 : normalCdf(-drop / spread);
  // Whether |r| is under 0.3 is decided exactly, and only for an earlier history that met the conditions: nothing else reads it.
  return { r, n: pairs.at.length, low: strong && !exactAtLeast(pairs.lead, pairs.follow, 3, 10)!.atLeast, dropP };
}

/** A Metric as the scan needs it: its id and its Period. */
export type ScanMetric = { id: number; period: Span };

/** One row of the pair table: two Metrics (`a` below `b`), the Common Period they were compared on and what `scanPair` found. */
export type PairRow = { a: number; b: number; span: Span } & PairScan;

const ORDER: readonly Span[] = ["day", "week", "month", "quarter", "year"];

/** Whether two Periods may be compared: the same, or one step apart (week and month, not week and quarter). */
export function adjacent(x: Span, y: Span): boolean {
  return Math.abs(ORDER.indexOf(x) - ORDER.indexOf(y)) <= 1 && ORDER.includes(x) && ORDER.includes(y);
}

/** The Metrics a scan looks at: the `most` whose latest value is the most recent, the lower id first on a tie. */
export function capMetrics<T extends { id: number; latest: string }>(metrics: readonly T[], most: number = HEADS_UP.maxMetrics): T[] {
  return [...metrics].sort((x, y) => (x.latest < y.latest ? 1 : x.latest > y.latest ? -1 : x.id - y.id)).slice(0, Math.max(0, most));
}

/** Every pair of the Metrics that may be compared, scanned: the levels of each Metric on a Common Period come from
 * `levels(id, span)` (null where it cannot be combined to that period); a pair is left out when either is missing, when one
 * is built from the other (`related`), when the two series have not both a value within the last 6 periods before `today`, or
 * when no delay has enough pairs, or when a Metric's changes need more than 40 decimal places or span more than 30 orders of magnitude (work-bound.ts). Only the latest 120 periods of each series are used. At most `HEADS_UP.maxPairs` pairs are
 * scanned (the ones of the lower ids first); the rest are left out. */
export function scanPairs(metrics: readonly ScanMetric[], levels: (id: number, span: Span) => Point[] | null, related: (a: number, b: number) => boolean, today: string, yearStart: YearStart): PairRow[] {
  return scanPairsCounted(metrics, levels, related, today, yearStart).rows;
}

/** `scanPairs` under a work allowance for the whole scan (work-bound.ts): the pairs are scanned in the order of their Metrics' ids, and where the allowance is spent
 * the pairs that still need exact work are not scanned (a pair that needs none, screened in doubles, is scanned whenever its turn comes, so the pairs scanned are a subset of what a full scan
 * scans, not a prefix in the order of ids). `skipped` names the pairs not scanned and `notScanned` counts them (the scan is then as a capped one is, and the correction counts each as a
 * pair of chance 1, which can only make it stricter). */
export function scanPairsCounted(metrics: readonly ScanMetric[], levels: (id: number, span: Span) => Point[] | null, related: (a: number, b: number) => boolean, today: string, yearStart: YearStart, allowance: number = SCAN_PAIRS_BUDGET): { rows: PairRow[]; notScanned: number; skipped: [number, number][] } {
  const ordered = [...metrics].sort((x, y) => x.id - y.id);
  // Stryker disable next-line EqualityOperator: with the same Period the two are equal, and either is the Common Period.
  const spanOf = (a: ScanMetric, b: ScanMetric): Span => (ORDER.indexOf(a.period) > ORDER.indexOf(b.period) ? a.period : b.period);
  const pairs = ordered.flatMap((a, i) => ordered.slice(i + 1).filter((b) => adjacent(a.period, b.period) && !related(a.id, b.id)).map((b) => ({ a, b, span: spanOf(a, b) }))).slice(0, HEADS_UP.maxPairs);
  // Each Metric's changes on each Common Period it is compared on, read once, and the series of each Common Period together.
  const changed = new Map<string, Point[]>();
  const ofSpan = new Map<Span, Point[][]>();
  const key = (m: ScanMetric, span: Span) => `${m.id}:${span}`;
  for (const { a, b, span } of pairs) {
    for (const m of [a, b]) {
      // Stryker disable next-line ConditionalExpression: a Metric met again gives the same changes; this only saves the work.
      if (changed.has(key(m, span))) continue;
      const points = levels(m.id, span);
      const made = points === null ? [] : changes(readSeries(points).slice(-HEADS_UP.window), span);
      // Changes too wide to work out exactly (work-bound.ts) are no changes here: such a Metric is left out, as one that cannot be combined is.
      const c = wideReason(made.map((p) => p.value)) ? [] : made;
      changed.set(key(m, span), c);
      ofSpan.set(span, [...(ofSpan.get(span) ?? []), c]);
    }
  }
  // One axis for every series of a Common Period, and each series laid out on it once.
  // (A Common Period whose series have no change at all has no axis, and no pair.)
  const axes = new Map<Span, Axis>([...ofSpan].flatMap(([span, all]) => { const axis = axisOf(all, span); return axis ? [[span, axis] as const] : []; }));
  const laid = new Map<string, Laid>();
  const laidOut = (m: ScanMetric, span: Span) => {
    const k = key(m, span);
    // Stryker disable next-line ConditionalExpression: laying a series out again gives the same arrays; this only saves the work.
    if (!laid.has(k)) laid.set(k, layOut(changed.get(k)!, axes.get(span)!));
    return laid.get(k)!;
  };
  const out: PairRow[] = [];
  const skipped: [number, number][] = [];
  withWork(() => {
    for (const { a, b, span } of pairs) {
      const axis = axes.get(span);
      if (!axis) continue;
      const done = tryWork(() => ({ scan: scanPair(laidOut(a, span), laidOut(b, span), axis) }));
      if (done === null) {
        skipped.push([a.id, b.id]);
        continue;
      }
      const { scan } = done;
      // Both Metrics current: the pair's last period is within a few periods of today.
      if (scan && periodsBetween(scan.through, periodStart(today, span, yearStart), span) <= HEADS_UP.current) out.push({ a: a.id, b: b.id, span, ...scan });
    }
  }, allowance);
  return { rows: out, notScanned: skipped.length, skipped };
}
