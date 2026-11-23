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

/** The what-if worked out by listing the paths and trying every corner of the effects' ranges. */
export function referenceWhatIf(links: ReferenceLink[], start: string, change: Exact): ReferenceReached[] {
  const by = new Map(links.filter((l) => l.target !== start).map((l) => [l.target, l]));
  const fits = new Map([...by.values()].flatMap((l) => (l.kind === "fit" ? [[l.target, estimate(l)] as const] : [])));
  const first = [...by.keys()].filter((t) => driversOf(by.get(t)!).includes(start));
  const reached = [...by.keys()].filter((t) => first.includes(t) || driversOf(by.get(t)!).some((d) => first.includes(d) && d !== t));
  const out: ReferenceReached[] = [];
  for (const t of reached) {
    const link = by.get(t)!;
    // The Metrics whose change goes into this one: the changed Metric and the first-step Metrics that drive it.
    const via = driversOf(link).filter((d) => d !== t && first.includes(d));
    const changing = [start, ...via];
    // The distinct estimated effects its change rests on.
    const ids: { owner: string; driver: string }[] = [];
    const rest = (owner: string, drivers: string[]) => {
      if (!fits.has(owner)) return;
      for (const d of drivers) if (fits.get(owner)!.drivers.includes(d)) ids.push({ owner, driver: d });
    };
    rest(t, changing);
    for (const b of via) rest(b, [start]);
    const m = ids.length;
    const level = m === 0 ? 0 : 1 - 1 / (10 * m);
    const coefficients: Coefficient[] = ids.map(({ owner, driver }) => {
      const f = fits.get(owner)!;
      const j = f.drivers.indexOf(driver);
      const effect = f.effects[j];
      const effectD = Number(effect.num) / Number(effect.den);
      const half = m === 0 ? 0 : referenceTQuantile(level, f.df) * f.se[j];
      return { id: `${owner}|${driver}`, effect, lo: exactOfDouble(effectD - half), hi: exactOfDouble(effectD + half) };
    });
    // The change at each Metric of the first step, then at this one, for one choice of the effects (an exact value for each).
    const delta = (name: string, pick: (owner: string, driver: string) => Exact, deltas: Map<string, Exact>): Exact => {
      const l = by.get(name)!;
      if (l.kind === "fit") {
        return driversOf(l).reduce((sum, d) => (deltas.has(d) ? plus(sum, times(pick(name, d), deltas.get(d)!)) : sum), ZERO);
      }
      const names = l.names;
      const vars = (moved: boolean) => Object.fromEntries(Object.entries(names).map(([slug, n]) => [slug, moved && deltas.has(n) ? plus(l.levels[n], deltas.get(n)!) : l.levels[n]]));
      return minus(referenceEvaluate(l.formula, vars(true))!, referenceEvaluate(l.formula, vars(false))!);
    };
    const total = (pick: (owner: string, driver: string) => Exact): Exact => {
      const deltas = new Map<string, Exact>([[start, change]]);
      for (const b of via) deltas.set(b, delta(b, pick, new Map([[start, change]])));
      return delta(t, pick, deltas);
    };
    const point = total((owner, driver) => coefficients.find((c) => c.id === `${owner}|${driver}`)!.effect);
    let [lo, hi] = [point, point];
    for (let corner = 0; corner < 2 ** m; corner++) {
      const v = total((owner, driver) => {
        const i = coefficients.findIndex((c) => c.id === `${owner}|${driver}`);
        return (corner >> i) & 1 ? coefficients[i].hi : coefficients[i].lo;
      });
      if (compareExact(v, lo) < 0) lo = v;
      if (compareExact(v, hi) > 0) hi = v;
    }
    out.push({ name: t, step: via.length > 0 ? 2 : 1, effect: point, lo, hi, m, level });
  }
  return out.sort((a, b) => a.step - b.step || (a.name < b.name ? -1 : 1));
}

/** A chain of one step by hand: a driver's effect on its target times the change. */
export function referenceOneStep(rows: ReferenceRow[], change: Exact): Exact {
  const f = referenceFit(rows, [0])!;
  return times(f.effects[0], change);
}

export { exactOf };
