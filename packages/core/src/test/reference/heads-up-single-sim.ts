// What the simulations of the Heads-ups about one Metric share (spec 0041, ticket 15): seeded series of every kind, the Targets that
// are met about as often as not, and the call that gives the Heads-ups of a Workspace of them. Test support only.
import { metric } from "../fixtures";
import type { Metric } from "../../types";
import { singleHeadsUpsFrom } from "../../methods/heads-up-single";

// The full size (100 runs of each kind, 12 of each planted case) runs in the `numbers` job (NUMBERS_RUNS of 1,000 or more); a plain
// test run, which has a time limit, uses a quicker size. The runs are seeded, so each size gives the same answer every time: the quick
// one is the first runs of the full one.
export const FULL = Number(process.env.NUMBERS_RUNS) >= 1000;
export const RUNS = FULL ? 100 : 12;
export const PLANT = FULL ? 12 : 4;
export const ctx = { style: "1,234.5" as const, today: "" };

export function rng(state: number) {
  let a = state;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const normalsOf = (state: number) => { const r = rng(state); return () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); };
export const month = (k: number) => new Date(Date.UTC(2020, k, 1)).toISOString().slice(0, 10);

type Family = (n: number, z: () => number) => number[];
export const FAMILIES: Record<string, Family> = {
  white: (n, z) => Array.from({ length: n }, () => 100 + 10 * z()),
  walk: (n, z) => { let v = 100; return Array.from({ length: n }, () => (v += z())); },
  drift: (n, z) => { let v = 100; return Array.from({ length: n }, () => (v += 1 + z())); },
  ar3: (n, z) => { let v = 0; return Array.from({ length: n }, () => (v = 0.3 * v + z())); },
  ar7: (n, z) => { let v = 0; return Array.from({ length: n }, () => (v = 0.7 * v + z())); },
  ar5: (n, z) => { let v = 0; return Array.from({ length: n }, () => (v = 0.5 * v + z())); },
  ar9: (n, z) => { let v = 0; return Array.from({ length: n }, () => (v = 0.9 * v + z())); },
  ar97: (n, z) => { let v = 0; return Array.from({ length: n }, () => (v = 0.97 * v + z())); },
  trendAr: (n, z) => { let v = 0; return Array.from({ length: n }, (_, k) => 2 * k + (v = 0.7 * v + 3 * z())); },
  growth: (n, z) => { let v = 0; return Array.from({ length: n }, (_, k) => 50 * 1.02 ** k + (v = 0.5 * v + z())); },
  ma3: (n, z) => { const w = Array.from({ length: n + 2 }, z); return Array.from({ length: n }, (_, k) => (w[k] + w[k + 1] + w[k + 2]) / 3); },
  ma12: (n, z) => { const w = Array.from({ length: n + 11 }, z); return Array.from({ length: n }, (_, k) => w.slice(k, k + 12).reduce((s, x) => s + x, 0) / 12); },
  twice: (n, z) => { let v = 100; let d = 0; return Array.from({ length: n }, () => (v += d += 0.3 * z())); },
  // A steady yearly pattern with noise: what "usual for the season" is made for.
  season: (n, z) => Array.from({ length: n }, (_, k) => 100 + 20 * Math.sin((2 * Math.PI * k) / 12) + 5 * z()),
};
export const SCENARIOS: Record<string, string[]> = {
  "independent noise": ["white"],
  "trends and random walks": ["walk", "drift", "trendAr", "growth", "white"],
  "autocorrelated noise": ["ar5", "ar9", "ar97", "ma3", "ma12", "twice"],
  "a steady yearly pattern": ["season", "white"],
};

export const round = (v: number) => Math.round(v * 100) / 100;
export const points = (values: number[]) => values.map((v, k) => ({ period: month(k), value: round(v) }));

/** The Metric with a Target that is met about as often as not, or more often: higher is better with at least the lower of where it ends and its mean; for a series that stays around its
 * level (`steady`), every third one lower is better with at most the higher of the two. (A rising series with a ceiling at where it ends really does miss it.) */
export function nullMetric(id: number, values: number[], steady: boolean): Metric {
  const last = round(values[values.length - 1]);
  const mean = round(values.reduce((s, v) => s + v, 0) / values.length);
  return steady && id % 3 === 0 ? metric({ id, name: `Metric ${id}`, period: "month", polarity: "lower", target_min: null, target_max: Math.max(last, mean) }) : metric({ id, name: `Metric ${id}`, period: "month", polarity: "higher", target_min: Math.min(last, mean), target_max: null });
}
export const STEADY = new Set(["white", "ar5", "ar9", "ar97", "ma3", "ma12", "season"]);

export const headsUpsFor = (series: Map<number, number[]>, n: number, planted: Map<number, Metric> = new Map(), steady: (id: number) => boolean = () => false) => {
  const looks = [...series].map(([id, values]) => ({ metric: planted.get(id) ?? nullMetric(id, values, steady(id)), points: points(values) }));
  return singleHeadsUpsFrom(looks, { ...ctx, today: month(n + 1) });
};

