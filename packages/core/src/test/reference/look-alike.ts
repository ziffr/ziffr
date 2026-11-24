// The reference for the Look-alike (GLOSSARY: Look-alike; spec 0053, Testing Decisions), written from the definitions on exact fractions and sharing
// nothing with methods/look-alike.ts (it does not even use whole numbers on one denominator): every kind is a plain list of periods, each cost
// of joining is worked out from explicit means at every step, over every pair, the pooled spread is summed period by period, Cliff's count
// is counted pair by pair, and the time of year is read off the reference calendar. It gives its result as plain text, so that the code's result
// can be laid beside it with toEqual: a fraction is "p/q" in lowest terms.
import { dayOf, monthsLater, partsOf, weekday, type Day } from "./calendar";
import { compareExact, exactOf, fraction, nearestDoubleOf, ZERO, type Exact } from "./exact";
import { referenceLine, referenceTrending } from "./basis";
import type { Span, YearStart } from "../../periods";

const ONE = fraction(1n, 1n);
const times = (a: Exact, b: Exact) => fraction(a.num * b.num, a.den * b.den);
const divide = (a: Exact, b: Exact) => fraction(a.num * b.den, a.den * b.num);
const add = (a: Exact, b: Exact) => fraction(a.num * b.den + b.num * a.den, a.den * b.den);
const sub = (a: Exact, b: Exact) => add(a, { num: -b.num, den: b.den });
const whole = (n: number) => fraction(BigInt(n), 1n);
const text = (x: Exact) => `${x.num}/${x.den}`;
const total = (xs: readonly Exact[]) => xs.reduce(add, ZERO);

/** What the reference gives for one Look-alike, as plain text. */
export type ReferenceView = {
  periods: string[];
  ids: string[];
  reading: string[];
  asked: number | null;
  shown: number;
  smallest: number;
  labels: number[];
  gap: string;
  pairs: [number, number, string][];
  tried: [number, string][];
  merges: [number[], number[], string][];
  kinds: {
    number: number;
    periods: string[];
    runs: [string, string][];
    counts: string[];
    marks: [string, string, string][];
    ordinal: number | null;
    season: { places: number[]; runs: [number, number][] } | null;
  }[];
};

/** A Look-alike's input as the reference reads it: values as numbers, by period. */
export type ReferenceSeries = { id: string; points: { period: string; value: number }[] };

// ---- the series ----

// The next period start after one: the calendar's own step.
function nextPeriod(day: Day, span: Span): Day {
  if (span === "day") return day + 1;
  if (span === "week") return day + 7;
  return monthsLater(day, { month: 1, quarter: 3, half: 6, year: 12 }[span]);
}

// How many periods lie from one start to a later one, counted by stepping.
function stepsBetween(from: Day, to: Day, span: Span): number {
  let [d, n] = [from, 0];
  while (d < to) [d, n] = [nextPeriod(d, span), n + 1];
  return n;
}

/** The periods in which every Metric has a value (the latest 60), the Metrics' ids in order, how each is read and its values (`values[period][metric]`), exactly: a Metric whose straight line explains more than half of its variance is read as its distance from that line (the leftovers as the double nearest to them, as the code passes them on). */
export function referencePrepared(series: readonly ReferenceSeries[], span: Span) {
  const sorted = [...series].sort((a, b) => (a.id < b.id ? -1 : 1));
  // A value that is not a number is no value; a period given twice keeps the value given last.
  const given = sorted.map((s) => {
    const m = new Map<string, number>();
    for (const p of s.points) if (Number.isFinite(p.value)) m.set(p.period, p.value);
    return m;
  });
  const common = [...(given[0]?.keys() ?? [])].filter((p) => given.every((g) => g.has(p))).sort();
  const periods = common.slice(Math.max(0, common.length - 60));
  const days = periods.map(dayOf);
  const xs = days.map((d) => stepsBetween(days[0], d, span));
  const reading: string[] = [];
  const columns = given.map((g) => {
    const ys = periods.map((p) => exactOf(g.get(p)!));
    if (periods.length >= 2 && referenceTrending(xs, ys)) {
      reading.push("trend");
      return referenceLine(xs, ys)!.leftovers.map((e) => exactOf(nearestDoubleOf(e)));
    }
    reading.push("values");
    return ys;
  });
  return { span, periods, ids: sorted.map((s) => s.id), reading, values: periods.map((_, i) => columns.map((c) => c[i])) };
}

// ---- Ward's method, from the definition ----

type Rows = Exact[][];
const meanOf = (rows: Rows, kind: readonly number[], j: number) => divide(total(kind.map((i) => rows[i][j])), whole(kind.length));
const firstOf = (kind: readonly number[]) => Math.min(...kind);

// What joining two kinds costs: |A|·|B| ÷ (|A| + |B|) times the weighted squared distance of their means.
function joinCost(rows: Rows, w: readonly Exact[], a: readonly number[], b: readonly number[]): Exact {
  const far = total(
    w.map((wj, j) => {
      const d = sub(meanOf(rows, a, j), meanOf(rows, b, j));
      return times(wj, times(d, d));
    }),
  );
  return times(divide(whole(a.length * b.length), whole(a.length + b.length)), far);
}

function wardFromScratch(rows: Rows, w: readonly Exact[]) {
  let kinds: number[][] = rows.map((_, i) => [i]);
  const merges: [number[], number[], Exact][] = [];
  const states = new Map<number, number[][]>();
  while (kinds.length > 1) {
    if (kinds.length <= 4) states.set(kinds.length, [...kinds].sort((p, q) => firstOf(p) - firstOf(q)));
    let best: { a: number; b: number; cost: Exact } | null = null;
    for (let a = 0; a < kinds.length; a++) {
      for (let b = a + 1; b < kinds.length; b++) {
        const cost = joinCost(rows, w, kinds[a], kinds[b]);
        const [fa, fb] = [Math.min(firstOf(kinds[a]), firstOf(kinds[b])), Math.max(firstOf(kinds[a]), firstOf(kinds[b]))];
        let better = best === null;
        if (best) {
          const c = compareExact(cost, best.cost);
          const [ga, gb] = [Math.min(firstOf(kinds[best.a]), firstOf(kinds[best.b])), Math.max(firstOf(kinds[best.a]), firstOf(kinds[best.b]))];
          better = c < 0 || (c === 0 && (fa < ga || (fa === ga && fb < gb)));
        }
        if (better) best = { a, b, cost };
      }
    }
    const { a, b, cost } = best!;
    const [x, y] = firstOf(kinds[a]) < firstOf(kinds[b]) ? [kinds[a], kinds[b]] : [kinds[b], kinds[a]];
    merges.push([[...x].sort((p, q) => p - q), [...y].sort((p, q) => p - q), cost]);
    kinds = [...kinds.filter((_, k) => k !== a && k !== b), [...x, ...y].sort((p, q) => p - q)];
  }
  return { merges, states };
}

// The weights 1 ÷ v_j, v_j the population variance of Metric j; null where one Metric does not vary.
function weightsOf(rows: Rows): Exact[] | null {
  const [n, m] = [rows.length, rows[0]?.length ?? 0];
  const w: Exact[] = [];
  for (let j = 0; j < m; j++) {
    const mean = meanOf(rows, [...rows.keys()], j);
    const variance = divide(total(rows.map((r) => times(sub(r[j], mean), sub(r[j], mean)))), whole(n));
    if (variance.num === 0n) return null;
    w.push(divide(ONE, variance));
  }
  return w;
}

/** The gap squared of two kinds (lists of places in the rows) as text, "endless" or a fraction; null where a Metric does not vary. */
export function referenceGap(rows: Rows, a: readonly number[], b: readonly number[]): string | null {
  const w = weightsOf(rows);
  return w === null ? null : gapText(gapFromScratch(rows, w, a, b));
}

// ---- the gap, from the definition ----

// gap² of two kinds: (dᵀd)² ÷ (dᵀSd), d the difference of the means, S the pooled spread (centred products over both kinds, over nA + nB − 2);
// dᵀd with the weights w_j, dᵀSd with w_j · w_l. "endless" where dᵀSd is 0 and d is not; 0 where d is.
function gapFromScratch(rows: Rows, w: readonly Exact[], a: readonly number[], b: readonly number[]): Exact | "endless" {
  const m = w.length;
  const d = Array.from({ length: m }, (_, j) => sub(meanOf(rows, a, j), meanOf(rows, b, j)));
  const along = total(d.map((dj, j) => times(w[j], times(dj, dj))));
  let spread = ZERO;
  for (let j = 0; j < m; j++) {
    for (let l = 0; l < m; l++) {
      let s = ZERO;
      for (const kind of [a, b]) {
        const [mj, ml] = [meanOf(rows, kind, j), meanOf(rows, kind, l)];
        for (const i of kind) s = add(s, times(sub(rows[i][j], mj), sub(rows[i][l], ml)));
      }
      spread = add(spread, times(times(times(w[j], w[l]), times(d[j], d[l])), divide(s, whole(a.length + b.length - 2))));
    }
  }
  const numerator = times(along, along);
  if (spread.num === 0n) return numerator.num === 0n ? ZERO : "endless";
  return divide(numerator, spread);
}

const gapText = (g: Exact | "endless") => (g === "endless" ? "endless" : text(g));
const gapLess = (a: Exact | "endless", b: Exact | "endless") => (a === "endless" ? false : b === "endless" ? true : compareExact(a, b) < 0);

// ---- what marks a kind ----

type Marked = { j: number; level: string; count: Exact };
const levelOf = (c: Exact): string | null => {
  if (compareExact(c, fraction(4n, 5n)) >= 0) return "very-high";
  if (compareExact(c, fraction(1n, 2n)) >= 0) return "high";
  if (compareExact(c, fraction(-4n, 5n)) <= 0) return "very-low";
  if (compareExact(c, fraction(-1n, 2n)) <= 0) return "low";
  return null;
};
const keyOf = (ms: readonly Marked[]) => ms.map((m) => `${m.j}:${m.level}`).sort().join(",");

// ---- the time of year and the runs ----

function seasonFromScratch(periods: readonly string[], kind: readonly number[], span: Span, yearStart: YearStart) {
  const places = { month: 12, quarter: 4, day: 7 }[span as "month" | "quarter" | "day"];
  if (places === undefined) return null;
  const placeOf = (p: string) => {
    const day = dayOf(p);
    if (span === "month") return partsOf(day).m;
    if (span === "quarter") return Math.floor(((partsOf(day).m - yearStart + 12) % 12) / 3) + 1;
    return weekday(day) + 1;
  };
  const belongs: boolean[] = [];
  let held = 0;
  for (let place = 1; place <= places; place++) {
    const there = periods.filter((p) => placeOf(p) === place).length;
    const mine = kind.filter((i) => placeOf(periods[i]) === place).length;
    belongs[place] = mine >= 2 && mine * 4 >= there * 3;
    if (belongs[place]) held += mine;
  }
  if (held * 4 < kind.length * 3) return null;
  const chosen = Array.from({ length: places }, (_, k) => k + 1).filter((p) => belongs[p]);
  // A run starts at a place whose place before it (round the end) is not one.
  const before = (p: number) => (p === 1 ? places : p - 1);
  const starts = chosen.filter((p) => !belongs[before(p)]);
  const runs: [number, number][] =
    starts.length === 0
      ? [[1, places]]
      : starts.map((from) => {
          let to = from;
          while (belongs[(to % places) + 1] && (to % places) + 1 !== from) to = (to % places) + 1;
          return [from, to] as [number, number];
        });
  return { places: chosen, runs };
}

function runsFromScratch(periods: readonly string[], span: Span): [string, string][] {
  const runs: [string, string][] = [];
  periods.forEach((p, i) => {
    if (i > 0 && nextPeriod(dayOf(periods[i - 1]), span) === dayOf(p)) runs[runs.length - 1][1] = p;
    else runs.push([p, p]);
  });
  return runs;
}

// ---- the whole ----

/** The Look-alike of prepared values by the definitions in the spec: the result as text, or the reason there is none ("constant", "kinds", "no-split"). */
export function referenceKinds(prepared: { span: Span; periods: string[]; ids: string[]; reading: string[]; values: Rows }, asked: number | null, yearStart: YearStart = 1): ReferenceView | { refused: string } {
  const { periods, ids, values: rows } = prepared;
  const [n, m] = [periods.length, ids.length];
  if (asked !== null && ![2, 3, 4].includes(asked)) return { refused: "kinds" };
  if (m === 0) return { refused: "metrics" };
  const w = weightsOf(rows);
  if (w === null) return { refused: "constant" };
  const { merges, states } = wardFromScratch(rows, w);
  const smallest = Math.max(3, Math.ceil(n / 6));
  const possible = [2, 3, 4].filter((c) => states.has(c) && states.get(c)!.every((k) => k.length >= smallest));
  const candidates = asked === null ? possible : possible.filter((c) => c <= asked);
  if (candidates.length === 0) return { refused: "no-split" };
  const looked = asked === null ? candidates : [Math.max(...candidates)];
  const gapsOf = (count: number) => {
    const kinds = states.get(count)!;
    const pairs: [number, number, Exact | "endless"][] = [];
    for (let a = 0; a < kinds.length; a++) for (let b = a + 1; b < kinds.length; b++) pairs.push([a + 1, b + 1, gapFromScratch(rows, w, kinds[a], kinds[b])]);
    return { pairs, gap: pairs.map((p) => p[2]).reduce((lo, g) => (gapLess(g, lo) ? g : lo)) };
  };
  const results = looked.map((count) => ({ count, ...gapsOf(count) }));
  // The largest gap; the smaller count on a tie.
  const chosen = results.reduce((best, r) => (gapLess(best.gap, r.gap) ? r : best));
  const kinds = states.get(chosen.count)!;
  const labels = periods.map((_, i) => kinds.findIndex((k) => k.includes(i)) + 1);

  // Cliff's count of each kind on each Metric, pair by pair.
  const counts = kinds.map((kind) =>
    Array.from({ length: m }, (_, j) => {
      let net = 0;
      let pairs = 0;
      for (const i of kind) {
        for (let o = 0; o < n; o++) {
          if (kind.includes(o)) continue;
          pairs++;
          net += compareExact(rows[i][j], rows[o][j]);
        }
      }
      return fraction(BigInt(net), BigInt(pairs));
    }),
  );
  const ranked: Marked[][] = counts.map((cs) =>
    cs
      .map((count, j) => ({ j, level: levelOf(count), count }))
      .filter((x): x is Marked => x.level !== null)
      .sort((a, b) => compareExact(abs(b.count), abs(a.count)) || a.j - b.j),
  );
  const first = ranked.map((r) => r.slice(0, 2));
  const final = first.map((ms, k) => {
    const twins = first.map((o, i) => (i !== k && keyOf(o) === keyOf(ms) ? i : -1)).filter((i) => i >= 0);
    if (twins.length === 0) return ms;
    for (const x of ranked[k].slice(2)) {
      if (!twins.some((o) => ranked[o].some((y) => y.j === x.j && y.level === x.level))) return [...ms, x];
    }
    return ms;
  });
  return {
    periods,
    ids,
    reading: prepared.reading,
    asked,
    shown: chosen.count,
    smallest,
    labels,
    gap: gapText(chosen.gap),
    pairs: chosen.pairs.map(([a, b, g]) => [a, b, gapText(g)]),
    tried: results.map((r) => [r.count, gapText(r.gap)]),
    merges: merges.map(([a, b, c]) => [a, b, text(c)]),
    kinds: kinds.map((kind, k) => {
      const alike = final.map((o, i) => (keyOf(o) === keyOf(final[k]) ? i : -1)).filter((i) => i >= 0);
      const mine = kind.map((i) => periods[i]);
      return {
        number: k + 1,
        periods: mine,
        runs: runsFromScratch(mine, prepared.span),
        counts: counts[k].map(text),
        marks: final[k].map((x) => [ids[x.j], x.level, text(x.count)]),
        ordinal: alike.length === 1 ? null : alike.indexOf(k) + 1,
        season: seasonFromScratch(periods, kind, prepared.span, yearStart),
      };
    }),
  };
}

const abs = (x: Exact) => fraction(x.num < 0n ? -x.num : x.num, x.den);

/** The Look-alike of series by the definitions in the spec, with the minimums the Method asks (2 to 6 Metrics, 24 periods, one Metric to 6 periods): the result as text, or the reason there is none. */
export function referenceLookAlike(series: readonly ReferenceSeries[], span: Span, asked: number | null = null, yearStart: YearStart = 1): ReferenceView | { refused: string } {
  if (series.length < 2) return { refused: "metrics" };
  if (series.length > 6) return { refused: "too-many" };
  const prepared = referencePrepared(series, span);
  if (prepared.periods.length < 24) return { refused: "periods" };
  if (series.length * 6 > prepared.periods.length) return { refused: "too-many" };
  return referenceKinds(prepared, asked, yearStart);
}
