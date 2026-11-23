// The reference for the what-if chain (spec 0041, ticket 5; GLOSSARY: Takeaway), written another way than methods/what-if.ts and
// sharing no code with it:
// - the effects of an estimated link and their standard errors come from the uncentred normal equations by Cramer's rule
//   (reference/fit.ts), not from the Method's centred moments;
// - the paths from the changed Metric to a Metric reached are listed (one step, two steps) and the change is the sum over the paths of
//   the change at each step, each a sum of effect × change in the driver, on exact fractions;
// - the range is found by trying EVERY corner of the box of the effects' ranges and taking the lowest and highest result, not by
//   multiplying and adding ranges: the change is a sum of products in which each estimated effect stands once, so its extremes are at
//   the corners (and for a formula that names each Metric once, which is monotone in each, the same holds);
// - each effect's range is cut at the share 1 − 1 ÷ (10·M) of the t curve, M the number of distinct estimated effects the Metric
//   rests on, with the t quantile from the reference's numerical integration (reference/distributions.ts).
import { exactOf, exactOfDouble, fraction, minus, plus, ZERO, compareExact, type Exact } from "./exact";
import { referenceEvaluate } from "./formula";
import { referenceTQuantile } from "./distributions";
import { referenceFit, type ReferenceRow } from "./fit";

const times = (a: Exact, b: Exact) => fraction(a.num * b.num, a.den * b.den);

/** A link of the reference: a fit on rows (target and drivers by name), or a formula with the Metrics it names and their levels. */
export type ReferenceLink =
  | { kind: "fit"; target: string; drivers: string[]; rows: ReferenceRow[] }
  | { kind: "worked"; target: string; formula: string; names: Record<string, string>; levels: Record<string, Exact> };

type Coefficient = { id: string; effect: Exact; lo: Exact; hi: Exact };
type Estimated = { target: string; drivers: string[]; effects: Exact[]; se: number[]; df: number };

/** One fit's effects with their standard errors (σ² ÷ XᵀX's inverse, from the uncentred normal equations). */
function estimate(l: Extract<ReferenceLink, { kind: "fit" }>): Estimated {
  const k = l.drivers.length;
  const f = referenceFit(l.rows, Array.from({ length: k }, (_, i) => i))!;
  const df = l.rows.length - k - 1;
  const sigma2 = fraction(f.sse.num, f.sse.den * BigInt(df));
  const se = l.drivers.map((_, j) => Math.sqrt(Number(times(sigma2, f.inverse[j + 1][j + 1]).num) / Number(times(sigma2, f.inverse[j + 1][j + 1]).den)));
  return { target: l.target, drivers: l.drivers, effects: f.effects, se, df };
}

const driversOf = (l: ReferenceLink) => (l.kind === "fit" ? l.drivers : [...new Set(Object.values(l.names))]);

/** What the reference says of one Metric reached: the change and its range, the effects it rests on and the share they are cut at. */
export type ReferenceReached = { name: string; step: 1 | 2; effect: Exact; lo: Exact; hi: Exact; m: number; level: number };

/** The what-if worked out by recursion over the links with a memo: the change of a Metric is its link applied to the changes of all its drivers that the
 * change reaches (the changed Metric's own, and each reached driver's, itself worked out the same way), never a cut-short copy. The links must run one way.
 * The range is found by trying EVERY corner of the box of the effects' ranges (each reached Metric's own set of estimated effects, found by the same
 * recursion) and taking the lowest and highest result. */
export function referenceWhatIf(links: ReferenceLink[], start: string, change: Exact): ReferenceReached[] {
  const by = new Map(links.filter((l) => l.target !== start).map((l) => [l.target, l]));
  const fits = new Map([...by.values()].flatMap((l) => (l.kind === "fit" ? [[l.target, estimate(l)] as const] : [])));
  const reachedMemo = new Map<string, boolean>();
  const isReached = (t: string): boolean => {
    if (!reachedMemo.has(t)) reachedMemo.set(t, driversOf(by.get(t)!).some((d) => d === start || (by.has(d) && isReached(d))));
    return reachedMemo.get(t)!;
  };
  const depthMemo = new Map<string, number>();
  const depth = (t: string): number => {
    if (!depthMemo.has(t)) depthMemo.set(t, 1 + Math.max(0, ...driversOf(by.get(t)!).filter((d) => by.has(d) && isReached(d)).map(depth)));
    return depthMemo.get(t)!;
  };
  // The estimated effects a Metric's change rests on: its own link's effects for the drivers that change, and those of each reached driver.
  const idsOf = (t: string): Set<string> => {
    const ids = new Set<string>();
    for (const d of driversOf(by.get(t)!)) {
      if (d !== start && !(by.has(d) && isReached(d))) continue;
      if (fits.get(t)?.drivers.includes(d)) ids.add(`${t}|${d}`);
      if (d !== start) for (const i of idsOf(d)) ids.add(i);
    }
    return ids;
  };
  const out: ReferenceReached[] = [];
  for (const t of [...by.keys()].filter(isReached)) {
    const ids = [...idsOf(t)];
    const m = ids.length;
    const level = m === 0 ? 0 : 1 - 1 / (10 * m);
    const coefficients = new Map<string, Coefficient>(ids.map((id) => {
      const [owner, driver] = id.split("|");
      const f = fits.get(owner)!;
      const j = f.drivers.indexOf(driver);
      const effect = f.effects[j];
      const effectD = Number(effect.num) / Number(effect.den);
      const half = referenceTQuantile(level, f.df) * f.se[j];
      return [id, { id, effect, lo: exactOfDouble(effectD - half), hi: exactOfDouble(effectD + half) }];
    }));
    const total = (pick: (id: string) => Exact): Exact => {
      const memo = new Map<string, Exact>([[start, change]]);
      const delta = (name: string): Exact => {
        if (memo.has(name)) return memo.get(name)!;
        const l = by.get(name)!;
        const moving = driversOf(l).filter((d) => d === start || (by.has(d) && isReached(d)));
        let v: Exact;
        if (l.kind === "fit") v = moving.reduce((sum, d) => plus(sum, times(pick(`${name}|${d}`), delta(d))), ZERO);
        else {
          const vars = (moved: boolean) => Object.fromEntries(Object.entries(l.names).map(([slug, n]) => [slug, moved && moving.includes(n) ? plus(l.levels[n], delta(n)) : l.levels[n]]));
          v = minus(referenceEvaluate(l.formula, vars(true))!, referenceEvaluate(l.formula, vars(false))!);
        }
        memo.set(name, v);
        return v;
      };
      return delta(t);
    };
    const point = total((id) => coefficients.get(id)!.effect);
    let [lo, hi] = [point, point];
    for (let corner = 0; corner < 2 ** m; corner++) {
      const v = total((id) => (((corner >> ids.indexOf(id)) & 1) ? coefficients.get(id)!.hi : coefficients.get(id)!.lo));
      if (compareExact(v, lo) < 0) lo = v;
      if (compareExact(v, hi) > 0) hi = v;
    }
    out.push({ name: t, step: depth(t) as 1 | 2, effect: point, lo, hi, m, level });
  }
  return out.sort((a, b) => a.step - b.step || (a.name < b.name ? -1 : 1));
}

/** A chain of one step by hand: a driver's effect on its target times the change. */
export function referenceOneStep(rows: ReferenceRow[], change: Exact): Exact {
  const f = referenceFit(rows, [0])!;
  return times(f.effects[0], change);
}

export { exactOf };
