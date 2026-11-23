// @ts-nocheck
// The references for the library's first Methods (spec 0041, ticket 3; GLOSSARY: Analysis), written from the definitions on
// exact fractions and sharing nothing with src/methods/:
// - a partial correlation is the correlation of what is left of A and of B after each is fitted on the controls by least
//   squares (the normal equations solved by Cramer's rule, determinants by expansion along the first row); what the code
//   does instead is one elimination on the sums of products;
// - a lagged correlation pairs a[i] with b[i + lag] by position in a list, and correlates each lag's pairs;
// - a quantile is Hyndman and Fan's type 7, (1 − g)·x[j] + g·x[j + 1] with j the whole part and g the rest of (n − 1)·p + 1
//   counted from 1 in the sorted values (the code takes its position counted from 0 and adds g·(x[j + 1] − x[j]));
// - the share of the n largest rows is the largest sum of any n of the rows (every choice tried), over the whole, and a
//   Pareto count the fewest rows of which some choice reaches the share (every choice tried);
// - a bridge's parts are the later value minus the earlier one for each part, and the whole change is the sum of the later
//   values less the sum of the earlier ones (the code adds the parts' differences).
import { referencePearson } from "./analyses";
import { compareExact, fraction, minus, plus, sumOf, ZERO, type Exact } from "./exact";

const times = (a: Exact, b: Exact) => fraction(a.num * b.num, a.den * b.den);
const divide = (a: Exact, b: Exact) => fraction(a.num * b.den, a.den * b.num);
const whole = (n: number) => fraction(BigInt(n), 1n);

/** The determinant of a square matrix, by expansion along the first row. */
export function referenceDet(m: readonly (readonly Exact[])[]): Exact {
  if (m.length === 1) return m[0][0];
  return m[0].reduce((total, v, j) => {
    const minor = m.slice(1).map((row) => row.filter((_, c) => c !== j));
    const term = times(v, referenceDet(minor));
    return j % 2 === 0 ? plus(total, term) : minus(total, term);
  }, ZERO);
}

/** What is left of `y` after a least-squares fit on a constant and the controls (the normal equations by Cramer's rule); null where the controls cannot be told apart. */
export function referenceResiduals(y: readonly Exact[], controls: readonly (readonly Exact[])[]): Exact[] | null {
  const columns = [y.map(() => whole(1)), ...controls];
  const dot = (p: readonly Exact[], q: readonly Exact[]) => sumOf(p.map((v, i) => times(v, q[i])));
  const normal = columns.map((p) => columns.map((q) => dot(p, q)));
  const rhs = columns.map((p) => dot(p, y));
  const d = referenceDet(normal);
  if (d.num === 0n) return null;
  const beta = columns.map((_, col) => divide(referenceDet(normal.map((row, i) => row.map((v, j) => (j === col ? rhs[i] : v)))), d));
  return y.map((v, i) => minus(v, sumOf(columns.map((c, k) => times(beta[k], c[i])))));
}

/** The partial correlation of a and b held the controls: its exact square and sign, or why there is none. */
export function referencePartial(a: readonly Exact[], b: readonly Exact[], controls: readonly (readonly Exact[])[]): { kind: "ok"; r2: Exact; negative: boolean } | { kind: "collinear" | "explained" } {
  const [ra, rb] = [referenceResiduals(a, controls), referenceResiduals(b, controls)];
  if (!ra || !rb) return { kind: "collinear" };
  const r = referencePearson(ra, rb);
  return r ? { kind: "ok", ...r } : { kind: "explained" };
}

/** Each lag from 0 to `max` with at least `least` pairs: a[i] with b[i + lag] for the positions where both have a value (null is none), as r² and sign. */
export function referenceLagged(a: readonly (Exact | null)[], b: readonly (Exact | null)[], max: number, least = 6): { lag: number; n: number; r: { r2: Exact; negative: boolean } | null }[] {
  const out: { lag: number; n: number; r: { r2: Exact; negative: boolean } | null }[] = [];
  for (let lag = 0; lag <= max; lag++) {
    const xs: Exact[] = [];
    const ys: Exact[] = [];
    for (let i = 0; i + lag < b.length && i < a.length; i++) {
      const [x, y] = [a[i], b[i + lag]];
      if (x !== null && y !== null) {
        xs.push(x);
        ys.push(y);
      }
    }
    if (xs.length >= least) out.push({ lag, n: xs.length, r: referencePearson(xs, ys) });
  }
  return out;
}

/** The p-quantile (type 7) of values, from the definition with positions counted from 1. */
export function referenceQuantile(values: readonly Exact[], p: Exact): Exact {
  const x = [...values].sort(compareExact);
  const position = plus(times(whole(x.length - 1), p), whole(1));
  const j = Number(position.num / position.den);
  const g = minus(position, whole(j));
  if (j >= x.length) return x[x.length - 1];
  return plus(times(minus(whole(1), g), x[j - 1]), times(g, x[j]));
}

// Every choice of `k` of the values' positions.
function* choices(n: number, k: number, from = 0): Generator<number[]> {
  if (k === 0) return yield [];
  for (let i = from; i <= n - k; i++) for (const rest of choices(n, k - 1, i + 1)) yield [i, ...rest];
}

/** The largest sum of any `k` of the values, by trying every choice. */
export function referenceBestSum(values: readonly Exact[], k: number): Exact {
  let best: Exact | null = null;
  for (const pick of choices(values.length, k)) {
    const s = sumOf(pick.map((i) => values[i]));
    if (best === null || compareExact(s, best) > 0) best = s;
  }
  return best!;
}

/** The share of the `k` largest rows: the best sum of k rows over the whole, exactly. */
export function referenceTopShare(values: readonly Exact[], k: number): Exact {
  return divide(referenceBestSum(values, k), sumOf(values));
}

/** The fewest rows of which some choice reaches `target` of the whole (the first count whose best sum does). */
export function referenceParetoCount(values: readonly Exact[], target: Exact): number {
  const goal = times(target, sumOf(values));
  for (let k = 1; k <= values.length; k++) if (compareExact(referenceBestSum(values, k), goal) >= 0) return k;
  throw new Error("The rows never reach the share");
}

/** A bridge: each part's weighted change, and the whole change as the sum of the later values less the sum of the earlier ones. */
export function referenceBridge(parts: readonly { before: Exact | null; after: Exact | null; weight?: 1 | -1 }[]): { changes: Exact[]; total: Exact } {
  const at = (v: Exact | null) => v ?? ZERO;
  const w = (p: { weight?: 1 | -1 }) => whole(p.weight ?? 1);
  return {
    changes: parts.map((p) => times(w(p), minus(at(p.after), at(p.before)))),
    total: minus(sumOf(parts.map((p) => times(w(p), at(p.after)))), sumOf(parts.map((p) => times(w(p), at(p.before))))),
  };
}
