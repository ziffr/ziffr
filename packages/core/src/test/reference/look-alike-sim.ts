// The simulations of the Look-alike's check (GLOSSARY: Look-alike; spec 0053, Testing Decisions, ticket 2): series of Metrics that have nothing to do with
// one another, of several shapes, and series with kinds planted in them, drawn from a seeded generator and run through the real, exact path
// (`lookAlikeChecked`, with the shuffles stopped at the first that decides: the verdict is the same as with all 99, which a test shows).
// The full size (2,000 runs of each case) runs where NUMBERS_RUNS is 1,000 or more, a plain test run uses a quicker size of the same runs.
import { lookAlikeChecked } from "../../methods/look-alike-clear";

/** Whether the simulations run at full size (2,000 runs of each case): in the `numbers` job on `main` and every night, where NUMBERS_RUNS is 1,000 or more. */
export const FULL = Number(process.env.NUMBERS_RUNS) >= 1000;

/** A seeded generator of numbers from 0 up to but not 1 (mulberry32): the same runs on every machine. */
function uniforms(state: number): () => number {
  let a = state;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The draws of one run: uniform, standard normal, and the others made from them. */
export type Draws = { u: () => number; z: () => number; t3: () => number; poisson: () => number };

/** The draws of a run, from its seed. */
export function drawsOf(seed: number): Draws {
  const u = uniforms(seed);
  const z = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
  // Student's t with 3 degrees of freedom: a normal over the root of a chi-square of 3 over 3.
  const t3 = () => z() / Math.sqrt((z() ** 2 + z() ** 2 + z() ** 2) / 3);
  // Poisson with mean 1 (Knuth): multiply uniforms until the product falls below e^-1.
  const poisson = () => {
    let [k, p] = [0, 1];
    do {
      k++;
      p *= u();
    } while (p > Math.exp(-1));
    return k - 1;
  };
  return { u, z, t3, poisson };
}

/** The shapes of the Metrics of one run: each draws `m` series of `n` values. */
export type Shape = (n: number, m: number, d: Draws) => number[][];

const cents = (x: number) => Math.round(x * 100) / 100;
const each = (m: number, f: (j: number) => number[]) => Array.from({ length: m }, (_, j) => f(j));
const noise = (n: number, m: number, one: () => number) => each(m, () => Array.from({ length: n }, one));
// A Metric that follows its own past: x_t = phi · x_(t-1) + a normal, from its steady state.
const following = (phi: number): Shape => (n, m, d) =>
  each(m, () => {
    let x = d.z() / Math.sqrt(1 - phi * phi);
    return Array.from({ length: n }, () => (x = phi * x + d.z()));
  });
// Metrics that move together in a line: a shared normal and a normal of each, correlated at r.
const together = (r: number, wrap: (x: number) => number): Shape => (n, m, d) => {
  const shared = Array.from({ length: n }, d.z);
  return each(m, () => shared.map((f) => wrap(Math.sqrt(r) * f + Math.sqrt(1 - r) * d.z())));
};

/** What the Metrics are made of when they have nothing to do with one another (or only move together in a line): spec 0053's cases. */
export const NOISE: Record<string, Shape> = {
  bell: (n, m, d) => noise(n, m, () => 100 + 10 * d.z()),
  flat: (n, m, d) => noise(n, m, () => 100 * d.u()),
  skewed: (n, m, d) => noise(n, m, () => 100 * Math.exp(d.z())),
  heavy: (n, m, d) => noise(n, m, () => 100 + 10 * d.t3()),
  counts: (n, m, d) => noise(n, m, d.poisson),
  line: together(0.8, (x) => 100 + 10 * x),
  linkedSkewed: together(0.5, (x) => 100 * Math.exp(x)),
  ar5: (n, m, d) => following(0.5)(n, m, d).map((s) => s.map((x) => 100 + 10 * x)),
  ar8: (n, m, d) => following(0.8)(n, m, d).map((s) => s.map((x) => 100 + 10 * x)),
  ar95: (n, m, d) => following(0.95)(n, m, d).map((s) => s.map((x) => 100 + 10 * x)),
  walk: (n, m, d) =>
    each(m, () => {
      let x = 1000;
      return Array.from({ length: n }, () => (x += 10 * d.z()));
    }),
  // Running totals: what is added each month is never negative, so the total only grows (and is read for its distance from its trend).
  totals: (n, m, d) =>
    each(m, () => {
      let x = 0;
      return Array.from({ length: n }, () => (x += 50 + 20 * d.u() + 10 * d.z()));
    }),
  // A smooth yearly wave (a sine with its own phase) and a little noise.
  wave: (n, m, d) =>
    each(m, () => {
      const phase = 2 * Math.PI * d.u();
      return Array.from({ length: n }, (_, k) => 100 + 20 * Math.sin((2 * Math.PI * k) / 12 + phase) + 2 * d.z());
    }),
};

/** What is planted: values of spread 1 (`n` periods, `m` Metrics) with kinds set apart on some Metrics, by `apart` spreads. */
export type Planting = (n: number, m: number, d: Draws, apart: number) => number[][];

// Which periods are in a planted kind: months 10 to 12 (places 9, 10 and 11).
const lateMonths = (k: number) => k >= 9 && k <= 11;

/** The planted cases of spec 0053. */
export const PLANTED: Record<string, Planting> = {
  // Months 10 to 12 higher on every Metric.
  shared: (n, m, d, apart) => each(m, () => Array.from({ length: n }, (_, k) => 100 + 10 * (d.z() + (lateMonths(k) ? apart : 0)))),
  // Months 10 to 12 higher on the first Metric alone.
  alone: (n, m, d, apart) => each(m, (j) => Array.from({ length: n }, (_, k) => 100 + 10 * (d.z() + (j === 0 && lateMonths(k) ? apart : 0)))),
  // Three kinds of equal size in a random order of the periods, set apart on the first two Metrics: the first kind at 0 and 0, the second `apart` up on both, the third `apart` down on the first and up on the second.
  // (Kinds that differ on one Metric each, or along one line, are not what the shuffles can tell from chance: a shuffle of one of two Metrics keeps the other's levels.)
  three: (n, m, d, apart) => {
    const order = Array.from({ length: n }, (_, i) => i % 3);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(d.u() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const centre = [[0, 0], [1, 1], [-1, 1]];
    return each(m, (j) => order.map((kind) => 100 + 10 * (d.z() + (j < 2 ? apart * centre[kind][j] : 0))));
  },
};

const month = (k: number) => new Date(Date.UTC(2020, k, 1)).toISOString().slice(0, 10);
const series = (values: number[][]) => values.map((v, j) => ({ id: `m${j + 1}`, points: v.map((x, k) => ({ period: month(k), value: cents(x) })) }));

/** A cell's own seed, from its name, so that every cell has runs of its own and no run is shared. */
const seedOf = (name: string) => [...name].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

/** The share of `runs` runs of a case that the check calls clear (the real, exact path; seeded), with `n` periods and `m` Metrics: `make` draws one run's values. */
export function clearShare(name: string, runs: number, n: number, m: number, make: (d: Draws) => number[][], options: { kinds?: number } = {}): number {
  let clear = 0;
  for (let run = 0; run < runs; run++) {
    const r = lookAlikeChecked(series(make(drawsOf(seedOf(`${name} ${n} ${m}`) + run * 7919))), "month", { ...options, early: true });
    // Months that do not split into kinds of the smallest size are a "can't tell", not a claim; any other refusal here would be a mistake of the simulation.
    if ("clearness" in r) clear += r.clearness.clear ? 1 : 0;
    else if (r.why !== "no-split") throw new Error(`${name} ${n} ${m} run ${run}: no check (${r.why})`);
  }
  return clear / runs;
}

/** The share of runs of a noise shape that the check calls clear. */
export const falseClaimShare = (shape: string, runs: number, n: number, m: number): number => clearShare(`noise ${shape}`, runs, n, m, (d) => NOISE[shape](n, m, d));

/** The share of runs of a planted case that the check calls clear. */
export const plantedShare = (planting: string, apart: number, runs: number, n: number, m: number): number => clearShare(`planted ${planting} ${apart}`, runs, n, m, (d) => PLANTED[planting](n, m, d, apart));

/** How many runs of each case: 2,000 at full size, 100 at the quick size (the first 100 of the same seeded runs). */
export const RUNS = FULL ? 2000 : 100;

/** The cells of the grid, [periods, Metrics]: at full size 9 of the 11 the Method allows (24 periods take up to 4 Metrics, 36 up to 6; 3 Metrics are left out at 36 and 60 periods), at the quick size three. */
export const CELLS: [number, number][] = FULL ? [[24, 2], [24, 3], [24, 4], [36, 2], [36, 4], [36, 6], [60, 2], [60, 4], [60, 6]] : [[24, 2], [36, 4], [60, 3]];

/** The most runs of `runs` that may be claimed clear where the rate is at most `rate`: at full size exactly the rate (the spec's own line), at the quick size the rate and three standard deviations of a sample of that size (the runs are seeded, so the answer is the same every time). */
export function mostClear(rate: number, runs: number = RUNS): number {
  const exact = runs * rate;
  return FULL ? exact : Math.floor(exact + 3 * Math.sqrt(runs * rate * (1 - rate)));
}
