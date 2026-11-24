// Look-alike (GLOSSARY: Look-alike, Analysis, Common Period; spec 0053, ticket 1, Method `lookAlike`): the periods of 2 to 6 Metrics put
// into 2 to 4 kinds by how the Metrics stood in them, each kind named by what marks it, the same way every time. Pure.
//
// What is worked out, every decision on exact fractions of the values' text (no square root, no double, no random start):
//  - the series: the periods in which every Metric has a value (the latest 60 of them), each Metric read as its values or, where a
//    straight line through it explains more than half of its variance (`trendsClearly`), as its distance from that line;
//  - one scale: Metric j weighs 1 ÷ v_j, v_j its population variance, and a distance is only ever used squared;
//  - Ward's method: every period starts as a kind of its own and, step by step, the two kinds whose joining adds least to the spread
//    inside the kinds are joined, the cost of joining A and B being |A|·|B| ÷ (|A| + |B|) · Σ w_j (mean_Aj − mean_Bj)², worked out from the
//    kinds' sums every time. Equal costs are decided by the earlier earliest period of the pair, then of the other kind. The kinds at
//    4, 3 and 2 are the states after n − 4, n − 3 and n − 2 joins, so they are nested;
//  - the gap of two kinds: gap² = (dᵀd)² ÷ (dᵀSd) with d the difference of their means and S their pooled spread, a fraction (two kinds
//    with no spread along d have an endless gap; two kinds with the same middle have a gap of 0); of a set of kinds, the smallest gap of
//    any two;
//  - the count: a count the person asks for is used as far as every kind holds at least max(3, ⌈n ÷ 6⌉) periods (else the largest smaller
//    count that can be made); with none asked, the count of 2, 3 and 4 with the largest gap, the smaller on a tie;
//  - what marks a kind: for each Metric, Cliff's count of the kind's periods against the others (how often a period of the kind is higher
//    less how often lower, over all pairs), which reads "very high", "high", "low" or "very low" at 4/5 and 1/2; at most the two Metrics
//    with the largest size, ties by id; kinds that would be named alike are told apart by a third Metric, else by their order;
//  - a kind that keeps to the same time of year (months, quarters of the Fiscal Year, days of the week) and its periods as runs.
// The shuffles that say whether the kinds are clearer than chance, the work bound and the words are other tickets' (spec 0053).
import { detrended, readSeries, trendsClearly } from "../basis";
import { fractionOf, lowestTerms, type Fraction } from "../exact";
import { JANUARY, periodsBetween, type Span, type YearStart } from "../periods";
import type { Point } from "../types";
import { wideReason } from "../work-bound";

/** The numbers of the Method, once: periods wanted and used, Metrics, the counts of kinds, the smallest kind and the bars of Cliff's count. */
export const LOOK_ALIKE = {
  fewest: 24,
  most: 60,
  metrics: { fewest: 2, most: 6, periodsEach: 6 },
  counts: [2, 3, 4],
  smallest: { least: 3, share: 6 },
  /** Cliff's count at or above `high` reads "high", at or above `very` "very high" (and the same below zero), as fractions num ÷ den. */
  cliff: { high: { num: 1, den: 2 }, very: { num: 4, den: 5 } },
  /** A place in the season belongs to a kind with at least `places.least` of its periods and `places.share` of the periods there; a kind is seasonal with `season` of its periods in its places. */
  seasonal: { least: 2, share: { num: 3, den: 4 } },
} as const;

const [ZERO, ONE] = [BigInt(0), BigInt(1)];
const whole = (n: number | bigint): Fraction => ({ num: BigInt(n), den: ONE });

/** One Metric's series for a Look-alike: its id (the order the Metrics are taken in) and its values by period. */
type LookAlikeSeries = { id: string; points: Point[] };

/** How a Metric is read: as its values, or as its distance from its own straight-line trend. */
type Reading = "values" | "trend";

/** What a Look-alike works on: the periods in which every Metric has a value (oldest first), the Metrics' ids in order, how each is read and its values, `values[j][i]` exactly. */
export type Prepared = { span: Span; periods: string[]; ids: string[]; reading: Reading[]; values: Fraction[][] };

/** Why there is no Look-alike: fewer than 2 Metrics, more than the Method takes, too few periods in common, a Metric that does not vary (`metric`), values too wide to work out exactly, a count not from 2 to 4, or no count whose kinds are big enough. */
export type LookAlikeRefusal = { ok: false; why: "metrics" | "too-many" | "periods" | "constant" | "wide" | "kinds" | "no-split"; metric?: string };

// ---- the series ----

// (Two series never share an id: an id is one Metric's.)
// Stryker disable next-line EqualityOperator: with two equal ids, which comes first changes nothing, and no two Metrics share one.
const byId = (a: LookAlikeSeries, b: LookAlikeSeries) => (a.id < b.id ? -1 : 1);

/** The periods in which every Metric has a value (the latest 60) and each Metric's values there, the Metrics in the order of their ids: a Metric whose straight-line trend explains more than half of its variance is read as its distance from that line. No minimum is asked here. */
export function readLookAlike(series: readonly LookAlikeSeries[], span: Span): Prepared {
  const ordered = [...series].sort(byId);
  const read = ordered.map((s) => readSeries(s.points));
  const sets = read.map((s) => new Set(s.map((p) => p.period)));
  // (`readSeries` gives the periods oldest first, and a set keeps the order it was given in.)
  const common = sets.length === 0 ? [] : [...sets[0]].filter((p) => sets.every((s) => s.has(p))).slice(-LOOK_ALIKE.most);
  const kept = new Set(common);
  const windows = read.map((s) => s.filter((p) => kept.has(p.period)));
  const reading = windows.map((w): Reading => (trendsClearly(w, span) ? "trend" : "values"));
  const values = windows.map((w, j) => (reading[j] === "trend" ? detrended(w, span) : w).map((p) => fractionOf(p.value)));
  return { span, periods: common, ids: ordered.map((s) => s.id), reading, values };
}

// ---- one scale, exactly ----

// The greatest common divisor of two positive whole numbers (the denominators of fractions).
const gcd = (a: bigint, b: bigint): bigint => {
  let [x, y] = [a, b];
  while (y) [x, y] = [y, x % y];
  return x;
};

/** The values of every Metric as whole numbers on one denominator each (`a[j][i]`), the Metric's n·Σa² − (Σa)² (`q[j]`, n² · its variance · denominator²: 0 for a Metric that does not vary), and P ÷ q[j] (`pc[j]`) with P the product of the q.
 * A distance in scaled values is then n² · (Δa)² ÷ q[j] summed over the Metrics: the denominators cancel, so nothing but whole numbers is multiplied. */
type Scaled = { n: number; a: bigint[][]; q: bigint[]; pc: bigint[] };

function scaled(values: readonly (readonly Fraction[])[], n: number): Scaled | { constant: number } {
  const a = values.map((col) => {
    // Stryker disable next-line ArithmeticOperator: any common multiple of the denominators does, and a column multiplied by a whole number changes no cost, gap or count.
    const lcm = col.reduce((l, f) => (l / gcd(l, f.den)) * f.den, ONE);
    return col.map((f) => f.num * (lcm / f.den));
  });
  // Stryker disable next-line ArithmeticOperator: the sum is only ever used squared, so turning its sign cannot change a result.
  const sum = (col: readonly bigint[]) => col.reduce((t, x) => t + x, ZERO);
  const q = a.map((col) => BigInt(n) * col.reduce((t, x) => t + x * x, ZERO) - sum(col) ** BigInt(2));
  const constant = q.findIndex((x) => x === ZERO);
  if (constant >= 0) return { constant };
  const all = q.reduce((p, x) => p * x, ONE);
  return { n, a, q, pc: q.map((x) => all / x) };
}

// ---- Ward's method ----

/** One join of Ward's method: the periods (their places in `periods`, ascending) of the two kinds, the one with the earlier earliest period first, and what the joining cost. */
type Merge = { left: number[]; right: number[]; cost: Fraction };

// A kind while the joining runs: its periods, their sums per Metric, and its earliest period (which names it: no two kinds share one).
type Joining = { members: number[]; sums: bigint[]; first: number };
// A cost as N ÷ t, with N the sum over the Metrics of D_j² · pc_j and t = |A|·|B|·(|A| + |B|): the cost is n² · N ÷ (P · t), and n² and P are the same for every pair.
type Cost = { n: bigint; t: bigint };
const lessCost = (x: Cost, y: Cost) => x.n * y.t < y.n * x.t;

/** Ward's joins of the periods from one kind each down to one kind, and the kinds as they stand with 4, 3 and 2 kinds (each a list of periods' places, the kind with the earliest period first). */
function ward(s: Scaled): { merges: Merge[]; states: Map<number, number[][]> } {
  const m = s.a.length;
  const live: Joining[] = Array.from({ length: s.n }, (_, i) => ({ members: [i], sums: s.a.map((col) => col[i]), first: i }));
  const costOf = (x: Joining, y: Joining): Cost => {
    const [nx, ny] = [BigInt(x.members.length), BigInt(y.members.length)];
    let total = ZERO;
    for (let j = 0; j < m; j++) {
      const d = ny * x.sums[j] - nx * y.sums[j];
      total += d * d * s.pc[j];
    }
    return { n: total, t: nx * ny * (nx + ny) };
  };
  const P = s.q.reduce((p, x) => p * x, ONE);
  const [merges, states] = [<Merge[]>[], new Map<number, number[][]>()];
  // The cost of each pair is kept by the earliest periods of the two kinds and worked out again only for a kind that was just made.
  const known = new Map<string, Cost>();
  while (live.length > 1) {
    states.set(live.length, live.map((k) => k.members));
    let best: { i: number; j: number; cost: Cost } | null = null;
    // The kinds are kept by earliest period, so scanning in order and replacing only on a strictly smaller cost is the tie rule.
    // Stryker disable next-line EqualityOperator: for the last kind there is no kind after it, so one more round of the loop does nothing.
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const key = `${live[i].first} ${live[j].first}`;
        let cost = known.get(key);
        // Stryker disable next-line ConditionalExpression: the kept costs only save work; working a cost out again gives the same cost.
        if (!cost) known.set(key, (cost = costOf(live[i], live[j])));
        if (!best || lessCost(cost, best.cost)) best = { i, j, cost };
      }
    }
    const { i, j, cost } = best!;
    const [x, y] = [live[i], live[j]];
    merges.push({ left: x.members, right: y.members, cost: lowestTerms({ num: BigInt(s.n) ** BigInt(2) * cost.n, den: P * cost.t }) });
    live.splice(j, 1);
    live[i] = { members: [...x.members, ...y.members].sort((p, q) => p - q), sums: x.sums.map((v, k) => v + y.sums[k]), first: x.first };
    // The kind just made has new costs against every kind left: the old ones, kept by its earliest period, are dropped.
    // Stryker disable next-line EqualityOperator: for the kind just made the two spellings of its key are the same.
    for (const k of live) known.delete(k.first < x.first ? `${k.first} ${x.first}` : `${x.first} ${k.first}`);
  }
  return { merges, states };
}

// ---- the gap ----

/** A gap squared: a fraction, or "endless" for two kinds with no spread at all along the line that joins their middles. */
export type Gap = Fraction | "endless";

/** −1, 0 or 1 as gap a is smaller than, equal to or larger than gap b; an endless gap is larger than every fraction. */
export function compareGaps(a: Gap, b: Gap): number {
  if (a === "endless" || b === "endless") return a === b ? 0 : a === "endless" ? 1 : -1;
  const d = a.num * b.den - b.num * a.den;
  return d < ZERO ? -1 : d > ZERO ? 1 : 0;
}

// gap² of two kinds (lists of periods' places): (dᵀd)² ÷ (dᵀSd) with d the difference of the means and S the pooled spread, in scaled
// values, as M² · (nA + nB − 2) ÷ (nA · nB · T) with M = Σ e_j² · pc_j, T = Σ e_j · e_l · V_jl · pc_j · pc_l, e_j = nB·ΣA − nA·ΣB,
// V_jl = nB·U_A,jl + nA·U_B,jl and U the kind's n · Σ a_j·a_l − Σa_j · Σa_l: whole numbers throughout.
function gapBetween(s: Scaled, A: readonly number[], B: readonly number[]): Gap {
  const m = s.a.length;
  const [nA, nB] = [BigInt(A.length), BigInt(B.length)];
  // Stryker disable next-line ArithmeticOperator: a sum turned in sign turns every e below, and e, M and T only use products of two of them.
  const sum = (g: readonly number[], j: number) => g.reduce((t, i) => t + s.a[j][i], ZERO);
  const spread = (g: readonly number[], j: number, l: number) => BigInt(g.length) * g.reduce((t, i) => t + s.a[j][i] * s.a[l][i], ZERO) - sum(g, j) * sum(g, l);
  const e = s.a.map((_, j) => nB * sum(A, j) - nA * sum(B, j));
  let [M, T] = [ZERO, ZERO];
  for (let j = 0; j < m; j++) {
    // Stryker disable next-line AssignmentOperator: M is only used squared and compared with 0, so its sign cannot matter.
    M += e[j] * e[j] * s.pc[j];
    for (let l = 0; l < m; l++) T += e[j] * e[l] * (nB * spread(A, j, l) + nA * spread(B, j, l)) * s.pc[j] * s.pc[l];
  }
  if (T === ZERO) return M === ZERO ? whole(0) : "endless";
  return lowestTerms({ num: M * M * (nA + nB - BigInt(2)), den: nA * nB * T });
}

/** The gap squared of two kinds of prepared values, each a list of periods' places (at least 2 periods in all): a fraction, "endless" where the two kinds have no spread along the line that joins their middles, 0 where they have the same middle. */
export function gapOf(prepared: Prepared, a: readonly number[], b: readonly number[]): Gap | LookAlikeRefusal {
  const s = scaled(prepared.values, prepared.periods.length);
  return "constant" in s ? { ok: false, why: "constant", metric: prepared.ids[s.constant] } : gapBetween(s, a, b);
}

// The smallest gap of any two of some kinds, and every pair's (kinds numbered from 1 by earliest period).
function gapsOf(s: Scaled, kinds: readonly (readonly number[])[]): { gap: Gap; pairs: { a: number; b: number; gap: Gap }[] } {
  const pairs = kinds.flatMap((x, i) => kinds.slice(i + 1).map((y, k) => ({ a: i + 1, b: i + k + 2, gap: gapBetween(s, x, y) })));
  // Stryker disable next-line EqualityOperator: of two equal gaps either is the smallest.
  return { gap: pairs.map((p) => p.gap).reduce((lo, g) => (compareGaps(g, lo) < 0 ? g : lo)), pairs };
}

// ---- the count of kinds ----

/** The kinds a Look-alike settled on, before they are named: how many were asked for and shown, each period's kind number, the kinds' periods, the gaps and the joins. */
type Choice = {
  ok: true;
  n: number;
  /** The count the person asked for (null: left to the rule) and the count shown (below the asked one when that could not be made). */
  asked: number | null;
  shown: number;
  /** The fewest periods a kind may hold. */
  smallest: number;
  /** Each period's kind, 1 to `shown`, kinds numbered by their earliest period. */
  labels: number[];
  /** Each kind's periods (their places in `periods`, ascending), kind 1 first. */
  groups: number[][];
  /** The gap squared of the shown kinds: the smallest of any two, and of every two. */
  gap: Gap;
  pairs: { a: number; b: number; gap: Gap }[];
  /** The gap of every count the rule looked at (the shown one only, where the count was asked for). */
  tried: { count: number; gap: Gap }[];
  /** Ward's joins, down to one kind. */
  merges: Merge[];
};

/** The count of kinds and the kinds: the count asked for (2 to 4) as far as every kind holds at least max(3, ⌈n ÷ 6⌉) periods, else the largest smaller count that can be made; with none asked, the count of 2, 3 and 4 whose kinds stand furthest apart (the largest gap), the smaller on a tie. */
export function choiceOf(prepared: Prepared, asked: number | null): Choice | LookAlikeRefusal {
  const solved = solve(prepared, asked);
  return solved.ok ? solved.choice : solved;
}

// The choice with the scaled values it was worked out from (the kinds are named from them).
function solve(prepared: Prepared, asked: number | null): { ok: true; choice: Choice; s: Scaled } | LookAlikeRefusal {
  const [lo, hi] = [LOOK_ALIKE.counts[0], LOOK_ALIKE.counts[LOOK_ALIKE.counts.length - 1]];
  if (asked !== null && !(Number.isInteger(asked) && asked >= lo && asked <= hi)) return { ok: false, why: "kinds" };
  const n = prepared.periods.length;
  if (prepared.values.length === 0) return { ok: false, why: "metrics" };
  const s = scaled(prepared.values, n);
  if ("constant" in s) return { ok: false, why: "constant", metric: prepared.ids[s.constant] };
  const { merges, states } = ward(s);
  const smallest = Math.max(LOOK_ALIKE.smallest.least, Math.ceil(n / LOOK_ALIKE.smallest.share));
  const feasible = LOOK_ALIKE.counts.filter((c) => states.get(c)?.every((k) => k.length >= smallest));
  const options = asked === null ? feasible : feasible.filter((c) => c <= asked);
  if (options.length === 0) return { ok: false, why: "no-split" };
  const tried = (asked === null ? options : [options[options.length - 1]]).map((count) => ({ count, ...gapsOf(s, states.get(count)!) }));
  const best = tried.reduce((b, t) => (compareGaps(t.gap, b.gap) > 0 ? t : b));
  const kinds = states.get(best.count)!;
  const labels = Array.from({ length: n }, (_, p) => kinds.findIndex((k) => k.includes(p)) + 1);
  const choice: Choice = { ok: true, n, asked, shown: best.count, smallest, labels, groups: kinds, gap: best.gap, pairs: best.pairs, tried: tried.map((t) => ({ count: t.count, gap: t.gap })), merges };
  return { ok: true, choice, s };
}

// ---- what marks a kind ----

/** How a kind stands on a Metric: far above the other periods, above them, below them or far below. */
type Level = "very-high" | "high" | "low" | "very-low";


const atLeast = (f: Fraction, bar: { num: number; den: number }) => f.num * BigInt(bar.den) >= BigInt(bar.num) * f.den;

/** A word for Cliff's count: 4/5 or more is "very high", 1/2 or more "high", −1/2 or less "low", −4/5 or less "very low", between −1/2 and 1/2 none (null). */
export function cliffLevel(count: Fraction): Level | null {
  const down = { num: -count.num, den: count.den };
  if (atLeast(count, LOOK_ALIKE.cliff.very)) return "very-high";
  if (atLeast(count, LOOK_ALIKE.cliff.high)) return "high";
  if (atLeast(down, LOOK_ALIKE.cliff.very)) return "very-low";
  return atLeast(down, LOOK_ALIKE.cliff.high) ? "low" : null;
}

// Cliff's count of a kind on one Metric: over every pair of a period in the kind and a period outside it, how often the one in the kind
// is higher less how often it is lower, over the number of pairs (a fraction from −1 to 1). Scaling is monotone, so the whole numbers do.
function cliffCount(values: readonly bigint[], kind: readonly number[]): Fraction {
  const inside = new Set(kind);
  const outside = values.map((_, i) => i).filter((i) => !inside.has(i));
  let net = 0;
  for (const i of kind) for (const o of outside) net += values[i] > values[o] ? 1 : values[i] < values[o] ? -1 : 0;
  return lowestTerms({ num: BigInt(net), den: BigInt(kind.length * outside.length) });
}

/** One Metric that marks a kind: the Metric's id, how the kind stands on it and Cliff's count behind the word. */
type Mark = { metric: string; level: Level; count: Fraction };

const markKey = (marks: readonly Mark[]) => JSON.stringify(marks.map((m) => [m.metric, m.level]).sort());
// Whether a count is larger in size than another (compared as squares, so no sign has to be taken off).
const bigger = (x: Fraction, y: Fraction) => x.num * x.num * y.den * y.den > y.num * y.num * x.den * x.den;
// The Metrics a kind has a word on, the largest size of Cliff's count first, a tie by the Metric's place in the order of the ids: the largest is taken
// again and again from those left, the first of equals staying where it is.
function ranked(ids: readonly string[], counts: readonly Fraction[]): Mark[] {
  const left = counts.map((count, j) => ({ metric: ids[j], level: cliffLevel(count), count })).filter((m): m is Mark => m.level !== null);
  const out: Mark[] = [];
  while (left.length > 0) {
    let best = 0;
    left.forEach((m, i) => {
      if (bigger(m.count, left[best].count)) best = i;
    });
    out.push(...left.splice(best, 1));
  }
  return out;
}

/** What marks each kind, from Cliff's count of each kind on each Metric (`counts[kind][metric]`, the Metrics in the order of their ids): the two Metrics with the largest size and a word; for kinds that would be named alike (the same Metrics and words) a third Metric that the kind has a word on and the others named alike do not; those still alike are numbered (`ordinal`) by their kind number. */
export function nameKinds(ids: readonly string[], counts: readonly (readonly Fraction[])[]): { marks: Mark[]; ordinal: number | null }[] {
  const all = counts.map((c) => ranked(ids, c));
  const marks = all.map((r) => r.slice(0, 2));
  const alike = marks.map((m) => marks.filter((o) => markKey(o) === markKey(m)));
  const named = marks.map((m, k) => {
    if (alike[k].length === 1) return m;
    const others = all.filter((_, o) => o !== k && markKey(marks[o]) === markKey(m));
    // (The kind's top two are the twins' too, so they are never a Metric the others lack.)
    const third = all[k].find((x) => others.every((o) => !o.some((y) => y.metric === x.metric && y.level === x.level)));
    return third ? [...m, third] : m;
  });
  return named.map((m, k) => {
    const same = named.filter((o) => markKey(o) === markKey(m));
    return { marks: m, ordinal: same.length === 1 ? null : same.indexOf(named[k]) + 1 };
  });
}

// ---- the periods of a kind ----

/** A run of periods that follow one another: the first and the last. */
type PeriodRun = { from: string; to: string };

/** The periods (oldest first) as runs of periods that follow one another in the calendar; one alone is a run of its own. */
export function periodRuns(periods: readonly string[], span: Span): PeriodRun[] {
  const runs: PeriodRun[] = [];
  for (const p of periods) {
    const last = runs[runs.length - 1];
    if (last && periodsBetween(last.to, p, span) === 1) last.to = p;
    else runs.push({ from: p, to: p });
  }
  return runs;
}

/** A run of places in the season, the first and the last (the first after the last where the run goes round the end: November to January is 11 to 1). */
type PlaceRun = { from: number; to: number };

/** The time of year a kind keeps to: the places (month of the year 1 to 12, quarter of the Fiscal Year 1 to 4, day of the week 1 to 7 from Monday) and them as runs. */
type Season = { places: number[]; runs: PlaceRun[] };

const PLACES: Partial<Record<Span, number>> = { month: 12, quarter: 4, day: 7 };

// A period's place in its season, from its first day (yyyy-mm-dd).
function placeOf(period: string, span: Span, yearStart: YearStart): number {
  const [y, m, d] = [Number(period.slice(0, 4)), Number(period.slice(5, 7)), Number(period.slice(8, 10))];
  if (span === "month") return m;
  if (span === "quarter") return Math.floor(((m - yearStart + 12) % 12) / 3) + 1;
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

// Places in order as runs of places that follow one another, by their first place; the run that ends at the last place of the season and the one
// that starts at its first are one run, which goes round the end.
function placeRuns(places: readonly number[], total: number): PlaceRun[] {
  const runs: PlaceRun[] = [];
  for (const p of places) {
    const last = runs[runs.length - 1];
    if (last && last.to === p - 1) last.to = p;
    else runs.push({ from: p, to: p });
  }
  if (runs.length > 1 && runs[0].from === 1 && runs[runs.length - 1].to === total) runs.push({ from: runs.pop()!.from, to: runs.shift()!.to });
  return runs;
}

/** Whether a kind keeps to the same time of year, for months, quarters and days (weeks, halves and years have no season here): a place belongs to the kind when at least 2 of its periods in the window, and at least 3/4 of them, are in the kind; the kind is seasonal when its places hold at least 3/4 of its periods. `members` are the kind's places in `periods`. */
export function seasonOf(periods: readonly string[], members: readonly number[], span: Span, yearStart: YearStart = JANUARY): Season | null {
  const total = PLACES[span];
  if (total === undefined) return null;
  const count = (places: Map<number, number>, p: string) => places.set(placeOf(p, span, yearStart), (places.get(placeOf(p, span, yearStart)) ?? 0) + 1);
  const [inWindow, inKind] = [new Map<number, number>(), new Map<number, number>()];
  for (const p of periods) count(inWindow, p);
  for (const i of members) count(inKind, periods[i]);
  const { least, share } = LOOK_ALIKE.seasonal;
  const places = [...inKind].filter(([p, k]) => k >= least && k * share.den >= share.num * inWindow.get(p)!).map(([p]) => p).sort((a, b) => a - b);
  const held = places.reduce((t, p) => t + inKind.get(p)!, 0);
  return held * share.den >= share.num * members.length ? { places, runs: placeRuns(places, total) } : null;
}

// ---- the Method ----

/** A kind as a Look-alike names it: its number (1 to the count, by earliest period), its periods and them as runs, Cliff's count on each Metric (in the order of the ids), the Metrics that mark it, its number among kinds named alike (null where it is the only one), and its season. */
type Kind = { number: number; places: number[]; periods: string[]; runs: PeriodRun[]; counts: Fraction[]; marks: Mark[]; ordinal: number | null; season: Season | null };

/** The result of a Look-alike: the choice (without its lists of places), the periods used, the Metrics' ids and how each was read, and the named kinds. */
export type LookAlike = Omit<Choice, "groups"> & { periods: string[]; ids: string[]; reading: Reading[]; kinds: Kind[] };

/** What a person may ask of a Look-alike: how many kinds (2 to 4; none leaves it to the rule), and the month the Fiscal Year starts in (January where none). */
type LookAlikeOptions = { kinds?: number | null; yearStart?: YearStart };

/** The Look-alike of prepared values: the count and the kinds, each named by what marks it and the time of year it keeps to. */
export function kindsOf(prepared: Prepared, options: LookAlikeOptions = {}): LookAlike | LookAlikeRefusal {
  const solved = solve(prepared, options.kinds ?? null);
  if (!solved.ok) return solved;
  const { choice, s } = solved;
  const { groups, ...rest } = choice;
  const counts = groups.map((g) => s.a.map((col) => cliffCount(col, g)));
  const named = nameKinds(prepared.ids, counts);
  const kinds = groups.map((g, k): Kind => {
    const periods = g.map((i) => prepared.periods[i]);
    return { number: k + 1, places: g, periods, runs: periodRuns(periods, prepared.span), counts: counts[k], ...named[k], season: seasonOf(prepared.periods, g, prepared.span, options.yearStart) };
  });
  return { ...rest, periods: prepared.periods, ids: prepared.ids, reading: prepared.reading, kinds };
}

/** The Look-alike of Metrics' series on one Period: refused (in codes, never a number) with fewer than 2 or more than 6 Metrics, fewer than 24 periods in common, more than one Metric to 6 periods, values too wide to work out exactly, or a Metric that does not vary; else `kindsOf` the latest 60 periods they have in common. */
export function lookAlike(series: readonly LookAlikeSeries[], span: Span, options: LookAlikeOptions = {}): LookAlike | LookAlikeRefusal {
  const { metrics, fewest } = LOOK_ALIKE;
  // A Metric is not compared with itself: two series with one id are one Metric too few.
  if (series.length < metrics.fewest || new Set(series.map((x) => x.id)).size < series.length) return { ok: false, why: "metrics" };
  if (series.length > metrics.most) return { ok: false, why: "too-many" };
  if (series.some((s) => wideReason(readSeries(s.points).map((p) => p.value)) !== null)) return { ok: false, why: "wide" };
  const prepared = readLookAlike(series, span);
  if (prepared.periods.length < fewest) return { ok: false, why: "periods" };
  if (series.length > Math.floor(prepared.periods.length / metrics.periodsEach)) return { ok: false, why: "too-many" };
  return kindsOf(prepared, options);
}
