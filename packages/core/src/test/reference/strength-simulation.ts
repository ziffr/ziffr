// Simulation of the plain correlation Takeaway on pairs of INDEPENDENT Metrics (GLOSSARY: Takeaway; spec 0041, ticket 17): how often
// the real code path (correlate, with its basis choice, then correlationTakeaway) gives a strength word other than "can't tell
// from chance" for two series that have nothing to do with each other. Seeded and deterministic; used by a test and by the
// measurement that the methods guide quotes.
import { resolverFrom } from "../../compare";
import { correlate } from "../../correlation";
import { JANUARY } from "../../periods";
import { strengthOf } from "../../takeaways/strength";
import { correlationTakeaway } from "../../takeaways/takeaway";
import { metric, months } from "../fixtures";

/** A seeded uniform generator (mulberry32). */
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

/** A seeded standard normal generator (Box-Muller). */
export const normalsOf = (state: number) => { const r = rng(state); return () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); };

/** A kind of series: `n` values from a normal generator and a uniform one. */
export type Family = (n: number, z: () => number, u: () => number) => number[];

const ar = (phi: number): Family => (n, z) => { let v = 0; for (let i = 0; i < 50; i++) v = phi * v + z(); return Array.from({ length: n }, () => (v = phi * v + z())); };

/** The kinds of independent series the simulation draws from. */
export const FAMILIES: Record<string, Family> = {
  white: (n, z) => Array.from({ length: n }, () => 100 + 10 * z()),
  "ar0.5": ar(0.5),
  "ar0.8": ar(0.8),
  "ar0.95": ar(0.95),
  walk: (n, z) => { let v = 100; return Array.from({ length: n }, () => (v += z())); },
  seasonal: (n, z, u) => { const phase = 2 * Math.PI * u(); return Array.from({ length: n }, (_, k) => 100 + 5 * Math.sin((2 * Math.PI * k) / 12 + phase) + z()); },
};

const a = metric({ id: 1, slug: "visits", name: "Visits", period: "month", decimals: 2 });
const b = metric({ id: 2, slug: "revenue", name: "Revenue", period: "month", decimals: 2 });
const cents = (v: number[]) => v.map((x) => Math.round(x * 100) / 100);

/** What two independent series of one kind come to through the real code path: the strength word (null where it refused), and the basis. */
export function takeawayOfPair(family: string, n: number, seed: number) {
  const z = normalsOf(seed);
  const u = rng(seed ^ 0x5bd1e995);
  const [xs, ys] = [cents(FAMILIES[family](n, z, u)), cents(FAMILIES[family](n, z, u))];
  const resolve = resolverFrom([a, b], { [a.slug]: months("2020-01", xs), [b.slug]: months("2020-01", ys) });
  const c = correlate(a, b, resolve, { yearStart: JANUARY });
  const t = correlationTakeaway(a, b, c, { style: "1,234.5" });
  // The word the chance rule gave before it allowed for the Metrics following their own past: Fisher's z over the real number of pairs.
  const before = c.ok ? strengthOf(c.r, c.n, false) : null;
  return { strength: t.kind === "answer" ? t.strength : null, before, basis: c.ok ? c.basis : null };
}

/** Of `pairs` independent pairs, the share that get a strength word other than "can't tell from chance" (`claimed`), the share the rule
 * before the correction would have given one (`before`), and the share compared on changes. */
export function falseClaimRate(family: string, n: number, pairs: number, seed = 1): { claimed: number; before: number; changes: number } {
  let [claimed, before, changes] = [0, 0, 0];
  for (let i = 0; i < pairs; i++) {
    const r = takeawayOfPair(family, n, seed * 1_000_003 + i * 7919 + n);
    if (r.strength !== null && r.strength !== "cant-tell") claimed++;
    if (r.before !== null && r.before !== "cant-tell") before++;
    if (r.basis === "changes") changes++;
  }
  return { claimed: claimed / pairs, before: before / pairs, changes: changes / pairs };
}
