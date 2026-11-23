// The what-if chain (GLOSSARY: Takeaway; spec 0041, "What-if chain": ticket 5): if one Metric changes by an amount, what happens to
// each Metric that has gone with it (the first step), and to each that has gone with those (the second), at most two steps and
// 12 Metrics in all. Every step is a link a Method already worked out: a Derived Metric's formula gives an exact link (worked
// out, with no range: the formula says), a fit from methods/fit.ts gives an estimated one, with a range. Pure.
//
// What is exact. Each link is linear in the change that goes into it: an estimated link gives the target a change of b·x for a change of x
// in the driver with the others held the same, the effects b worked out on fractions of the values' text (fit.ts); a formula is worked out
// on fractions too, so a Derived Metric's change is f(inputs after) − f(inputs before), exactly. Each Metric reached is worked out ONCE, from
// the changes of every Metric that drives it, in an order in which each comes after its drivers, and that change is the one shown and the one
// used further on. So a chain's point is exact arithmetic (a product along a path, a sum over paths), and only the last step to a double is not.
// Links that drive each other, or run more than two steps from the Metric changed, are refused in words, not cut short. The chain of one link
// is the fit's own effect times the change, which is `predict`'s value at the changed driver less its value at the latest one.
//
// How the range is propagated (nothing is added or multiplied as if independent). A range is a "likely between" that holds the true effect
// about four times in five (an 80 % range). The links of a chain are estimated from the same periods, so their errors are not independent, and
// nothing here assumes they are. Instead, for a Metric that rests on M estimated effects (the distinct effects b of its fits, along every path to
// it), each effect's own range is cut so that it fails at most 1 time in 5·M, and the true effect is then within the range of every one of them at
// once at least 4 times in 5, whatever their dependence (the union bound). The range of the chain is what those ranges give when multiplied and
// added as ranges (interval arithmetic, on exact fractions), which holds the true effect whenever each effect is within its range. So a Metric
// reached through one estimated effect has its fit's own 80 % range (M = 1: the 90 % point of the t curve), one reached through two the 95 %
// point of each, and so on. This holds for the links as they are given: if they were picked because they stood out, their effects tend to be
// overstated and the claim is weaker (the Takeaway says so). Where a formula follows an estimated link, it is worked out on the range of that
// Metric's change, again as a range.
//
// Outside what was seen (rule 7): where the driver's new value (or any end of its range) is higher or lower than the driver has been in the fit,
// there is no range, only the point, and the Takeaway says to treat it as a guess; where the link looks curved there is nothing outside what was
// seen at all (a refusal for that Metric). The cautions of the fits that are used (gaps, curve, spread, crowded drivers) are carried. A Metric
// whose links are exact only is "worked out"; one with any estimated link is "estimated". A fit handed over is checked against its own rows.
import { fractionOf, lowestTerms, minus, nearest, over, plus, times, type Fraction } from "../exact";
import type { Span } from "../periods";
import { evaluateRange, formulaInputs, usesPrevious, type Bounds } from "../formula";
import type { Finding, Verdict } from "../suitability";
import { strengthOf, type StrengthWord } from "../takeaways/strength";
import { tQuantile } from "./distributions";
import { again, carried, modelProblem, partialPeriods, type Again, type Fit, type Outside, type Refused } from "./fit";

/** The most steps a what-if follows: the Metrics the change reaches, and the Metrics those reach (spec 0041, "Limits"). */
export const MOST_STEPS = 2;
/** The most Metrics in a what-if, the one changed included. */
export const MOST_METRICS = 12;
/** The most links a what-if is given to look through: a program's input is bounded, not trusted. */
export const MOST_LINKS = 120;

/** A link from a Derived Metric's formula, worked out exactly: the Derived Metric (`target`), its formula, the Metric each {slug}
 * stands for, and the level of each of those Metrics (by Metric name) that the change is counted from. */
export type WorkedLink = { kind: "worked"; target: string; formula: string; names: Record<string, string>; levels: Record<string, number> };
/** A link from a fit: the fit's target is the Metric reached, its drivers are the Metrics that move it. */
export type FitLink = { kind: "fit"; fit: Fit };
/** One link of the chain. */
export type WhatIfLink = WorkedLink | FitLink;

/** The change asked about: an amount in the Metric's own unit (negative for a fall), or a percent of its latest value. */
export type WhatIfChange = { by: number } | { percent: number };

/** What a what-if takes: the Metric changed with its latest value, the change, and every link there is to look through. */
export type WhatIfInput = { start: { name: string; latest: number }; change: WhatIfChange; links: WhatIfLink[] };

/** A Metric the change reaches, with what happens to it. */
export type Reached = {
  ok: true;
  name: string;
  /** How many steps from the Metric changed: 1 for one it reaches directly, 2 for one reached through another (also where it is reached directly as well). */
  step: 1 | 2;
  /** True where every link is a formula: the effect is worked out, with no range, and nothing is estimated. */
  exact: boolean;
  /** The change in the Metric, in its own unit: the one number that is the answer. */
  effect: number;
  /** The 80 % range of the effect ("likely between"); null where it is worked out, or where it is a guess (outside what was seen). */
  lo: number | null;
  hi: number | null;
  /** The values outside what their driver has been at the point, which is why there is no range. */
  outside: Outside[];
  /** Drivers whose value is inside what they have been at the point but whose range reaches beyond it: the range is then not offered either. */
  beyond: Outside[];
  /** True where a formula after an estimated link could not be worked out on a range (it divides by something that could be 0): the point only. */
  noRange: boolean;
  /** The Metrics of the first step the change came through to reach this one (none where it came directly). */
  through: string[];
  /** How many estimated effects this rests on, and so how far each one's range is cut (1 − 1 ÷ (10·M) of the t curve). */
  coefficients: number;
  /** The share of the t curve each effect's range is cut at: 0.9 for one effect, 0.95 for two. 0 where worked out. */
  level: number;
  /** The weakest strength word among the links it rests on (never strong with a caution); null where worked out. */
  strength: StrengthWord | null;
  /** True where any fit it rests on is compared by change: the change is then in the next period, from the latest level. */
  byChange: boolean;
  /** The cautions of the fits it rests on that still hold for a what-if. */
  verdict: Verdict;
};
/** A Metric the change reaches for which nothing can be said, in words. */
export type NotReached = { ok: false; name: string; step: 1 | 2; refusal: Finding };

/** The result of a what-if: the change as an amount and the Metrics reached, step 1 first, then by name; or a refusal in words. */
export type WhatIf = { ok: true; start: string; by: number; /** The percent asked for, where the change was given as one. */ percent: number | null; span: Span | null; reached: (Reached | NotReached)[] } | Refused;

const [ZERO, ONE] = [BigInt(0), BigInt(1)];
type F = Fraction;
const zero: F = { num: ZERO, den: ONE };
const add = (a: F, b: F) => lowestTerms(plus(a, b));
const sub = (a: F, b: F) => lowestTerms(minus(a, b));
const mul = (a: F, b: F) => lowestTerms(times(a, b));
const cmp = (a: F, b: F) => {
  const [l, r] = [a.num * b.den, b.num * a.den];
  return l < r ? -1 : l > r ? 1 : 0;
};
const pointOf = (f: F): Bounds => ({ lo: f, hi: f });
const sumB = (a: Bounds, b: Bounds): Bounds => ({ lo: add(a.lo, b.lo), hi: add(a.hi, b.hi) });
const productB = (a: Bounds, b: Bounds): Bounds => {
  const ends = [mul(a.lo, b.lo), mul(a.lo, b.hi), mul(a.hi, b.lo), mul(a.hi, b.hi)];
  return { lo: ends.reduce((x, y) => (cmp(y, x) < 0 ? y : x)), hi: ends.reduce((x, y) => (cmp(y, x) > 0 ? y : x)) };
};
const refuse = (c: Finding["case"], slots: Finding["slots"] = {}): Refused => ({ ok: false, refusals: [{ case: c, slots }] });
const refuseInput = (what: string) => refuse("refuse-input", { what });
const finiteAll = (xs: number[]) => xs.every((v) => Number.isFinite(v));

// The weakest of the strength words, in the order a person reads them.
const WEAKEST: readonly StrengthWord[] = ["cant-tell", "weak", "moderate", "strong"];

// One estimated effect: driver `j` of a fit, identified by the fit's target and the driver's name, with its fit worked out again.
type Coef = { id: string; link: FitLink; j: number; again: Again };
// What a change has come to at a Metric: its range (a point where nothing is in doubt), the estimated effects it rests on, and the
// fits and the changes in their drivers that it went through, for the checks on what was seen.
type Eval = { iv: Bounds; used: Map<string, Coef>; seen: { link: FitLink; changes: Map<number, Bounds> }[] };

const driversOf = (l: WhatIfLink): string[] => (l.kind === "fit" ? l.fit.drivers.map((d) => d.name) : [...new Set(formulaInputs(l.formula).map((s) => l.names[s]))]);
const targetOf = (l: WhatIfLink): string => (l.kind === "fit" ? l.fit.target : l.target);

const SPANS: readonly string[] = ["day", "week", "month", "quarter", "half", "year"];
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// A fit handed over is checked in full, never trusted: its shape, and what it says about itself against what its rows give (the lowest and
// highest a driver has been, the strength word of each driver), so that a number or a word made up by a program is refused.
function fitProblem(f: Fit): string | null {
  if (!f || f.ok !== true || typeof f.target !== "string" || f.target === "" || !Array.isArray(f.drivers) || !Array.isArray(f.rows) || !f.last || !Array.isArray(f.last.x)) return "a fit";
  if (!SPANS.includes(f.span) || !f.verdict || !Array.isArray(f.verdict.cautions) || !Array.isArray(f.crowded)) return "a fit";
  // The cautions are taken as the fit gave them (only a fit that `fit` made carries the right ones) but must be lines of the wording kind, with plain slots.
  const plain = (v: unknown) => typeof v === "string" || typeof v === "number";
  if (f.verdict.cautions.some((c) => !c || typeof c.case !== "string" || !c.slots || typeof c.slots !== "object" || !Object.values(c.slots).every(plain))) return "a fit";
  if (f.crowded.some((n) => !f.drivers.some((d) => d?.name === n))) return "a fit";
  if (modelProblem(f) !== null || f.drivers.some((d) => !d || typeof d.name !== "string" || d.name === "" || d.name === f.target)) return "a fit";
  if (new Set(f.drivers.map((d) => d.name)).size !== f.drivers.length) return "a fit";
  const m = again(f);
  if (m === null) return "a fit";
  const k = f.drivers.length;
  for (const [j, d] of f.drivers.entries()) {
    const xs = f.rows.map((r) => r.x[j]);
    if (d.low !== Math.min(...xs) || d.high !== Math.max(...xs)) return "a fit";
    // The strength word is worked out again from the effect and the misses, as `fit` does.
    const b = m.sol.beta[j];
    const b2 = mul(b, b);
    const den = add(b2, mul(m.sol.sse, m.sol.m[j][j]));
    const partial = den.num === ZERO ? 0 : (b.num < ZERO ? -1 : 1) * Math.sqrt(nearest(over(b2, den)));
    if (d.strength !== strengthOf(partial, partialPeriods(f.rows.length, k), f.crowded.includes(d.name))) return "a fit";
  }
  return null;
}

// A link handed over is checked, never trusted: the shape, the names and the numbers. Null where it is sound, else what is wrong.
function linkProblem(l: unknown): string | null {
  try {
    const x = l as Partial<WhatIfLink> | null;
    if (!x || typeof x !== "object") return "a link";
    if (x.kind === "fit") return fitProblem(x.fit as Fit);
    if (x.kind === "worked") {
      const w = x;
      if (typeof w.target !== "string" || w.target === "" || typeof w.formula !== "string" || !w.names || typeof w.names !== "object" || !w.levels || typeof w.levels !== "object") return "a formula";
      const slugs = formulaInputs(w.formula);
      const named = slugs.map((s) => (own(w.names!, s) ? w.names![s] : null));
      if (slugs.length === 0 || usesPrevious(w.formula) || named.some((n) => typeof n !== "string" || n === "" || n === w.target)) return "a formula";
      if (named.some((n) => !own(w.levels!, n as string) || !Number.isFinite(w.levels![n as string]))) return "a formula";
      return null;
    }
    return "a link";
  } catch {
    // Anything that throws on its way through is not a link this module made.
    return "a link";
  }
}

/** What a what-if is made of before it is worked out: the Metrics a change reaches in the order they can be worked out (each after every Metric
 * that drives it), how many steps from the changed one each is, and the links by Metric; or why it cannot be followed. */
type Plan = { order: string[]; depth: Map<string, number>; links: Map<string, WhatIfLink> } | Finding;

/** Whether a set of links can be followed from a Metric: the order and steps, or why not (a Finding): used to choose links that can. */
export function planOf(start: string, links: WhatIfLink[]): { ok: true } | Finding {
  const p = plan(start, links);
  return "case" in p ? p : { ok: true };
}

function plan(start: string, links: WhatIfLink[]): Plan {
  const by = new Map(links.filter((l) => targetOf(l) !== start).map((l) => [targetOf(l), l]));
  // Every Metric the change can reach through the links, however far: found first, then judged.
  const reached = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const [t, l] of by) {
      if (!reached.has(t) && driversOf(l).some((d) => d === start || reached.has(d))) {
        reached.add(t);
        grew = true;
      }
    }
  }
  if (reached.size === 0) return { case: "refuse-what-if-none", slots: { name: start } };
  if (reached.size + 1 > MOST_METRICS) return { case: "refuse-what-if-many", slots: { n: reached.size + 1, most: MOST_METRICS } };
  // Each Metric after the ones that drive it (names in order among those that can go next): Metrics that drive each other have no order.
  const order: string[] = [];
  const depth = new Map<string, number>([[start, 0]]);
  const todo = new Set([...reached].sort());
  while (todo.size > 0) {
    const next = [...todo].find((t) => driversOf(by.get(t)!).every((d) => !todo.has(d) || d === t));
    if (next === undefined) return { case: "refuse-what-if-cycle", slots: {} };
    todo.delete(next);
    order.push(next);
    depth.set(next, 1 + Math.max(...driversOf(by.get(next)!).filter((d) => depth.has(d)).map((d) => depth.get(d)!)));
  }
  // The Metric that is too far is named in the finding for whoever chooses the links (a person is told only how many steps are followed).
  const far = order.find((t) => depth.get(t)! > MOST_STEPS);
  if (far !== undefined) return { case: "refuse-what-if-deep", slots: { most: MOST_STEPS, name: far } };
  return { order, depth, links: by };
}

// The effect of a Metric's own link given what changed in its drivers (name → what that Metric's change has come to). `ranged` is whether a
// range is asked for, as against the point, which says what failed where a formula cannot be worked out on a range.
function applyLink(link: WhatIfLink, changed: Map<string, Eval>, coef: (c: Coef) => Bounds | null, ranged: boolean): Eval | Finding {
  const used = new Map<string, Coef>();
  const seen = new Map<string, Eval["seen"][number]>();
  for (const e of changed.values()) {
    for (const [id, c] of e.used) used.set(id, c);
    for (const s of e.seen) seen.set(s.link.fit.target, s);
  }
  if (link.kind === "fit") {
    const m = again(link.fit)!;
    let iv = pointOf(zero);
    const changes = new Map<number, Bounds>();
    for (const [j, d] of link.fit.drivers.entries()) {
      const delta = changed.get(d.name);
      if (!delta) continue;
      // The id cannot collide whatever the names hold: two effects counted as one would make a range too narrow for what it claims.
      const c: Coef = { id: JSON.stringify([link.fit.target, d.name]), link, j, again: m };
      const b = coef(c);
      if (!b) return { case: "refuse-too-large", slots: {} };
      used.set(c.id, c);
      changes.set(j, delta.iv);
      iv = sumB(iv, productB(b, delta.iv));
    }
    seen.set(link.fit.target, { link, changes });
    return { iv, used, seen: [...seen.values()] };
  }
  // A formula, worked out on exact fractions before and after: the others at their levels, the changed ones moved by their range.
  const vars = (moved: boolean) => {
    const out: Record<string, Bounds> = {};
    for (const s of formulaInputs(link.formula)) {
      const name = link.names[s];
      const level = fractionOf(link.levels[name]);
      const delta = moved ? changed.get(name)?.iv : undefined;
      out[s] = delta ? { lo: add(level, delta.lo), hi: add(level, delta.hi) } : pointOf(level);
    }
    return out;
  };
  const [before, after] = [evaluateRange(link.formula, vars(false)), evaluateRange(link.formula, vars(true))];
  if (!before) return { case: "refuse-what-if-formula", slots: { name: link.target } };
  if (!after) return { case: ranged ? "refuse-what-if-range" : "refuse-what-if-formula", slots: { name: link.target } };
  return { iv: { lo: sub(after.lo, before.lo), hi: sub(after.hi, before.hi) }, used, seen: [...seen.values()] };
}

const isFinding = (e: object): e is Finding => "case" in e;

/** The change of every Metric reached, each worked out once from the changes of all the Metrics that drive it, at the level `p` of the t curve
 * every estimated effect's range is cut at (null: the effects themselves, so a point). A Metric whose driver could not be worked out has none. */
function evaluate(p0: Extract<Plan, { order: string[] }>, p: number | null, start: string, by: F): Map<string, Eval | Finding> {
  const done = new Map<string, Eval | Finding>([[start, { iv: pointOf(by), used: new Map(), seen: [] }]]);
  const coef = (c: Coef): Bounds | null => {
    const beta = c.again.sol.beta[c.j];
    if (p === null) return pointOf(beta);
    const effect = nearest(beta);
    const half = tQuantile(p, c.again.mo.n - c.again.k - 1) * Math.sqrt(nearest(mul(c.again.sigma2, c.again.sol.m[c.j][c.j])));
    if (!finiteAll([effect, half, effect - half, effect + half])) return null;
    // The range always holds the exact effect, which the doubles round either side of.
    const [lo, hi] = [fractionOf(effect - half), fractionOf(effect + half)];
    return { lo: cmp(lo, beta) < 0 ? lo : beta, hi: cmp(hi, beta) > 0 ? hi : beta };
  };
  for (const name of p0.order) {
    const link = p0.links.get(name)!;
    const drivers = driversOf(link).filter((d) => done.has(d));
    const failed = drivers.find((d) => isFinding(done.get(d)!));
    if (failed !== undefined) {
      // It rests on a Metric nothing can be said of: that is the reason, not the reason that Metric has.
      done.set(name, { case: "refuse-what-if-driver", slots: { name: failed } });
      continue;
    }
    done.set(name, applyLink(link, new Map(drivers.map((d) => [d, done.get(d) as Eval])), coef, p !== null));
  }
  return done;
}

// Where the changes in a fit's drivers lie against what the drivers have been: any end of a range outside is outside.
function outsideOfFit(l: FitLink, changes: Map<number, Bounds>, start: { name: string; latest: number }): Outside[] {
  const out: Outside[] = [];
  const change = l.fit.basis === "changes";
  for (const [j, iv] of changes) {
    const d = l.fit.drivers[j];
    // Compared by value the driver is at its latest level plus the change; compared by change, the change is the value.
    const base = change ? 0 : d.name === start.name ? start.latest : l.fit.last.x[j];
    const [lo, hi] = [base + nearest(iv.lo), base + nearest(iv.hi)];
    if (lo < d.low) out.push({ name: d.name, side: "below", limit: d.low, change });
    if (hi > d.high) out.push({ name: d.name, side: "above", limit: d.high, change });
  }
  return out;
}

/** What happens to the Metrics a change in one Metric reaches, at most two steps and 12 Metrics. Each Metric's change is worked out once from the
 * changes of every Metric that drives it, so the change used further on is the change shown. An exact link (a Derived Metric's formula) is
 * worked out; an estimated one (a fit) carries a range, and the range of a chain holds the true effect at least four times in five, for links as
 * given, without assuming the links' errors are independent (see the top of this file). Never gives a number for what it refuses: a change that
 * is not a number or is no change, a link that is not sound, names that are not told apart, levels that disagree, too many links or Metrics,
 * links that drive each other or run more than two steps, or nothing reached. */
export function whatIf(input: WhatIfInput): WhatIf {
  const { start, change, links } = input ?? ({} as WhatIfInput);
  if (!start || typeof start.name !== "string" || start.name === "" || !Number.isFinite(start.latest)) return refuseInput("the Metric changed");
  const c = change as Partial<{ by: number; percent: number }> | null | undefined;
  const kind = c && typeof c === "object" ? ("by" in c ? "by" : "percent" in c ? "percent" : null) : null;
  const amount = kind ? c![kind] : undefined;
  if (kind === null || typeof amount !== "number" || !Number.isFinite(amount)) return refuseInput("the change");
  if (!Array.isArray(links)) return refuseInput("the links");
  if (links.length > MOST_LINKS) return refuse("refuse-what-if-links", { most: MOST_LINKS });
  const bad = links.map(linkProblem).find((p) => p !== null);
  if (bad) return refuseInput(bad);
  // A percent of nothing is nothing: the latest value must say what the change is a part of.
  if (kind === "percent" && start.latest === 0) return refuse("refuse-what-if-percent", { name: start.name });
  const by = kind === "by" ? fractionOf(amount) : lowestTerms(over(mul(fractionOf(start.latest), fractionOf(amount)), { num: BigInt(100), den: ONE }));
  if (by.num === ZERO) return refuseInput("the change");
  const targets = links.map(targetOf);
  if (new Set(targets).size !== targets.length) return refuseInput("the Metrics' names");
  // The levels the changes are counted from are one set: the same Metric is at the same level in every formula, and the one changed at its latest.
  const levels = new Map<string, number>();
  for (const l of links) {
    if (l.kind !== "worked") continue;
    for (const [name, v] of Object.entries(l.levels)) {
      if (levels.has(name) && levels.get(name) !== v) return refuseInput("the levels");
      levels.set(name, v);
    }
  }
  if (levels.has(start.name) && levels.get(start.name) !== start.latest) return refuseInput("the levels");
  // The fits are all counted by one period: a change reaches each in the same period, and periods are not mixed here.
  const spans = [...new Set(links.flatMap((l) => (l.kind === "fit" ? [l.fit.span] : [])))];
  if (spans.length > 1) return refuse("refuse-what-if-periods");
  const p0 = plan(start.name, links);
  if (isFinding(p0)) return { ok: false, refusals: [p0] };
  const exactly = evaluate(p0, null, start.name, by);
  const atLevel = new Map<number, ReturnType<typeof evaluate>>();
  const reached = [...p0.order]
    .sort()
    .map((name): Reached | NotReached => {
      const step = p0.depth.get(name) as 1 | 2;
      const point = exactly.get(name)!;
      if (isFinding(point)) return { ok: false, name, step, refusal: point };
      const m = point.used.size;
      const level = m === 0 ? 0 : 1 - 1 / (10 * m);
      if (m > 0 && !atLevel.has(level)) atLevel.set(level, evaluate(p0, level, start.name, by));
      const atRange = m === 0 ? point : atLevel.get(level)!.get(name)!;
      // A formula that cannot be worked out on a range, where the point can: the point only, said as a guess.
      const noRange = isFinding(atRange) && atRange.case === "refuse-what-if-range";
      const range = noRange ? point : atRange;
      if (isFinding(range)) return { ok: false, name, step, refusal: range };
      const [effect, lo, hi] = [nearest(point.iv.lo), nearest(range.iv.lo), nearest(range.iv.hi)];
      if (!finiteAll([effect, lo, hi])) return { ok: false, name, step, refusal: { case: "refuse-too-large", slots: {} } };
      // The fits it went through (each once): what was seen, the cautions that hold, and the weakest link. A value is outside what was seen where the point
      // is; where only an end of its range is, the range is dropped and it is said that it could go beyond.
      const fits = range.seen;
      const outsides = point.seen.map((sn) => outsideOfFit(sn.link, sn.changes, start));
      const edges = fits.map((sn) => outsideOfFit(sn.link, sn.changes, start));
      const outside = outsides.flat();
      const beyond = edges.flat().filter((o) => !outside.some((x) => x.name === o.name && x.side === o.side));
      const curved = edges.findIndex((o, i) => (o.length > 0 || outsides[i].length > 0) && carried(fits[i].link.fit).cautions.some((f) => f.case === "caution-curved"));
      if (curved >= 0) return { ok: false, name, step, refusal: { case: "refuse-curved-outside", slots: { name: [...edges[curved], ...outsides[curved]][0].name } } };
      const cautions = [...new Map(fits.flatMap((s) => carried(s.link.fit).cautions).map((f) => [JSON.stringify(f), f])).values()];
      const words = [...range.used.values()].map((c) => c.link.fit.drivers[c.j].strength);
      const weakest = words.length === 0 ? null : WEAKEST.find((w) => words.includes(w))!;
      return {
        ok: true,
        name,
        step,
        exact: m === 0,
        effect,
        lo: m === 0 || outside.length > 0 || beyond.length > 0 || noRange ? null : lo,
        hi: m === 0 || outside.length > 0 || beyond.length > 0 || noRange ? null : hi,
        outside,
        beyond,
        noRange,
        through: driversOf(p0.links.get(name)!).filter((d) => d !== name && p0.depth.has(d) && d !== start.name).sort(),
        coefficients: m,
        level,
        byChange: fits.some((f) => f.link.fit.basis === "changes"),
        strength: weakest === "strong" && cautions.length > 0 ? "moderate" : weakest,
        verdict: { refusals: [], cautions, switches: [] },
      };
    })
    .sort((a, b) => a.step - b.step);
  return { ok: true, start: start.name, by: nearest(by), percent: kind === "percent" ? amount : null, span: spans[0] ?? null, reached };
}
