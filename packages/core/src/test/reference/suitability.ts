// The reference for the suitability checks (spec 0041, "When the data does not suit a Method"; GLOSSARY: Takeaway), written
// from the definitions on exact fractions and sharing nothing with suitability.ts:
// - the median is the middle value of the sorted values (the mean of the two middle ones); the median absolute deviation is
//   the median of the distances from it; a value is far off when its distance is more than 4 of them;
// - skewness is m3 ÷ m2^1.5 with m2 and m3 the means of the squared and cubed distances from the mean, so its square is
//   m3² ÷ m2³ (no root);
// - the runs test counts the arrangements of the signs by listing every one of them (the places of the plus signs), and the
//   chance of this few runs is the share of arrangements with as few;
// - Spearman's r is Pearson's r of the ranks, a tied value taking the mean of the ranks it covers (found by counting the
//   values below and equal to it); its square is Sxy² ÷ (Sxx · Syy);
// - the step in level solves the three normal equations of y = a + b·x + c·s by Cramer's rule and sums the squared misses;
// - the yearly pattern of a half is the mean over its seasons of each value's distance from its season's mean, and the
//   difference is Σ|p − q| ÷ Σ(|p| + |q|);
// - a gap is a period of the window with no value; the longest run of them is found by walking the window.
import { compareExact, fraction, minus, plus, sumOf, ZERO, type Exact } from "./exact";

const times = (a: Exact, b: Exact) => fraction(a.num * b.num, a.den * b.den);
const divide = (a: Exact, b: Exact) => fraction(a.num * b.den, a.den * b.num);
const whole = (n: number) => fraction(BigInt(n), 1n);
const abs = (a: Exact) => (a.num < 0n ? fraction(-a.num, a.den) : a);
const mean = (xs: readonly Exact[]) => divide(sumOf(xs), whole(xs.length));

/** The median of values. */
export function referenceMedian(xs: readonly Exact[]): Exact {
  const s = [...xs].sort(compareExact);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2] : divide(plus(s[n / 2 - 1], s[n / 2]), whole(2));
}

/** The median absolute deviation: the median of the distances from the median. */
export function referenceMad(xs: readonly Exact[]): Exact {
  const m = referenceMedian(xs);
  return referenceMedian(xs.map((x) => abs(minus(x, m))));
}

/** The positions of the far-off values: more than `mads` median absolute deviations from the median (none when the deviation is 0). */
export function referenceFarOff(xs: readonly Exact[], mads = 4): number[] {
  const m = referenceMedian(xs);
  const mad = referenceMad(xs);
  if (mad.num === 0n) return [];
  return xs.flatMap((x, i) => (compareExact(abs(minus(x, m)), times(whole(mads), mad)) > 0 ? [i] : []));
}

/** The squared skewness m3² ÷ m2³, null for values that do not vary; the sign is that of m3. */
export function referenceSkewSquared(xs: readonly Exact[]): { squared: Exact; negative: boolean } | null {
  const mu = mean(xs);
  const m2 = mean(xs.map((x) => times(minus(x, mu), minus(x, mu))));
  if (m2.num === 0n) return null;
  const m3 = mean(xs.map((x) => times(minus(x, mu), times(minus(x, mu), minus(x, mu)))));
  return { squared: divide(times(m3, m3), times(m2, times(m2, m2))), negative: m3.num < 0n };
}

/** How many runs a list of signs has: stretches of one sign. */
export function referenceRuns(signs: readonly boolean[]): number {
  let runs = signs.length > 0 ? 1 : 0;
  for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) runs++;
  return runs;
}

/** The arrangements of `n1` plus and `n2` minus signs with at most `runs` runs, and all of them, by listing every one. */
export function referenceRunsTail(n1: number, n2: number, runs: number): { atMost: bigint; all: bigint } {
  const n = n1 + n2;
  let [atMost, all] = [0n, 0n];
  const place = (from: number, left: number, signs: boolean[]) => {
    if (left === 0) {
      all++;
      if (referenceRuns(signs) <= runs) atMost++;
      return;
    }
    for (let i = from; i <= n - left; i++) {
      signs[i] = true;
      place(i + 1, left - 1, signs);
      signs[i] = false;
    }
  };
  place(0, n1, Array.from({ length: n }, () => false));
  return { atMost, all };
}

/** The ranks of values, ties sharing the mean of the ranks they cover: 1 + (values below) + (values equal, besides itself) ÷ 2. */
export function referenceRanks(xs: readonly number[]): Exact[] {
  return xs.map((x) => {
    const below = xs.filter((y) => y < x).length;
    const equal = xs.filter((y) => y === x).length;
    return plus(whole(1 + below), divide(whole(equal - 1), whole(2)));
  });
}

/** Spearman's r squared, and whether it is negative; null where either list has all ranks equal. */
export function referenceSpearman(a: readonly number[], b: readonly number[]): { squared: Exact; negative: boolean } | null {
  const [ra, rb] = [referenceRanks(a), referenceRanks(b)];
  const [ma, mb] = [mean(ra), mean(rb)];
  const sxy = sumOf(ra.map((x, i) => times(minus(x, ma), minus(rb[i], mb))));
  const sxx = sumOf(ra.map((x) => times(minus(x, ma), minus(x, ma))));
  const syy = sumOf(rb.map((y) => times(minus(y, mb), minus(y, mb))));
  if (sxx.num === 0n || syy.num === 0n) return null;
  return { squared: divide(times(sxy, sxy), times(sxx, syy)), negative: sxy.num < 0n };
}

const det3 = (m: Exact[][]) =>
  minus(
    plus(plus(times(m[0][0], times(m[1][1], m[2][2])), times(m[0][1], times(m[1][2], m[2][0]))), times(m[0][2], times(m[1][0], m[2][1]))),
    plus(plus(times(m[0][2], times(m[1][1], m[2][0])), times(m[0][1], times(m[1][0], m[2][2]))), times(m[0][0], times(m[1][2], m[2][1]))),
  );

/** y = a + b·x + c·s with s = 1 from position `k` on, by the normal equations and Cramer's rule: the step c and the sum of squared misses. */
export function referenceStep(xs: readonly number[], ys: readonly Exact[], k: number): { c: Exact; sse: Exact } | null {
  const x = xs.map(whole);
  const s = xs.map((_, i) => (i >= k ? whole(1) : ZERO));
  const dot = (p: readonly Exact[], q: readonly Exact[]) => sumOf(p.map((v, i) => times(v, q[i])));
  const one = xs.map(() => whole(1));
  const normal = [
    [dot(one, one), dot(one, x), dot(one, s)],
    [dot(x, one), dot(x, x), dot(x, s)],
    [dot(s, one), dot(s, x), dot(s, s)],
  ];
  const rhs = [dot(one, ys), dot(x, ys), dot(s, ys)];
  const d = det3(normal);
  if (d.num === 0n) return null;
  const solve = (col: number) => divide(det3(normal.map((row, i) => row.map((v, j) => (j === col ? rhs[i] : v)))), d);
  const [a, b, c] = [solve(0), solve(1), solve(2)];
  const sse = sumOf(ys.map((y, i) => { const miss = minus(y, plus(a, plus(times(b, x[i]), times(c, s[i])))); return times(miss, miss); }));
  return { c, sse };
}

/** The difference of the yearly pattern of the first and the last half of the seasons, Σ|p − q| ÷ Σ(|p| + |q|); null where it is 0 ÷ 0. */
export function referenceSeasonDifference(ys: readonly Exact[], length: number): Exact | null {
  const years = Math.floor(ys.length / length);
  const half = Math.floor(years / 2);
  const pattern = (from: number) =>
    Array.from({ length }, (_, j) => mean(Array.from({ length: half }, (_, i) => { const row = ys.slice((from + i) * length, (from + i + 1) * length); return minus(row[j], mean(row)); })));
  const [p, q] = [pattern(0), pattern(years - half)];
  const size = sumOf(p.map((v, j) => plus(abs(v), abs(q[j]))));
  return size.num === 0n ? null : divide(sumOf(p.map((v, j) => abs(minus(v, q[j])))), size);
}

/** How many periods of a window of `size` have no value, and the longest run of such periods, by walking the window. */
export function referenceGaps(present: readonly number[], size: number): { missing: number; run: number } {
  const has = new Set(present);
  let [missing, run, now] = [0, 0, 0];
  for (let i = 0; i < size; i++) {
    if (has.has(i)) now = 0;
    else {
      missing++;
      run = Math.max(run, ++now);
    }
  }
  return { missing, run };
}

/** Whether a series has too little variation: fewer than 4 different values, or fewer than half the steps differ from the one before. */
export function referenceTooFlat(vs: readonly number[]): boolean {
  const steps = vs.slice(1).filter((v, i) => v !== vs[i]).length;
  return new Set(vs).size < 4 || 2 * steps < vs.length - 1;
}
