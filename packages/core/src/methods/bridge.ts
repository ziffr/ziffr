// Bridge (GLOSSARY: Breakdown, Derived Metric, Takeaway; spec 0041, Method `bridge`): what each part contributed to a change,
// from one period to another. The parts are a Breakdown's rows, or the inputs of a Derived Metric that adds and subtracts them
// (a part with weight −1 counts against the whole). A part's contribution is its weight times (value after − value before),
// worked out exactly on the values' text (exact.ts), so the contributions add up to the change exactly; only each is then the
// double nearest to its exact value. The Takeaway says "worked out", not "estimated". Pure.
//
// Nothing is filled in: a part with a value on one side only counts as 0 on the other and is named as appeared or gone; where
// the whole's own change is given and the parts do not add up to it, the rest is said as "not in these rows".
import { fractionOf, lowestTerms, minus, nearest, plus, times, type Fraction } from "../exact";
import { formatValue, type ValueUnit } from "../format";
import { emptyTakeaway, listOf, refusalTakeaway, sayIn, type Takeaway, type TakeawayContext } from "../takeaways/takeaway";

/** One part: its label, its value in the earlier and the later period (null where it has none), and its weight (1 unless it counts against the whole). */
export type Part = { label: string; before: number | null; after: number | null; weight?: 1 | -1 };

/** Why there is no bridge: no parts, a value that is not a number, or a weight that is not 1 or −1. */
export type NoBridge = "none" | "not-a-number" | "weight";

/** A part's contribution to the change, largest size first. `appeared` and `gone` say a value was missing before or after. */
export type Contribution = { label: string; change: number; before: number | null; after: number | null; appeared: boolean; gone: boolean };

/** The bridge: each part's contribution, the `total` change they come to, and, where the whole's own change was given, what is
 * `unexplained` by the parts (0 when they account for all of it). */
export type Bridge = { ok: true; parts: Contribution[]; total: number; unexplained: number | null } | { ok: false; why: NoBridge };

const ZERO = BigInt(0);
const zero: Fraction = { num: ZERO, den: BigInt(1) };
// The size of a fraction, for ordering: for 0, `<` and `<=` give the same size.
// Stryker disable next-line EqualityOperator: a fraction of 0 has the size 0 whether it is read as negative or not.
const sizeOf = (f: Fraction) => (f.num < ZERO ? -f.num : f.num);

/** What each part contributed to the change from before to after, and the total. With `whole` (the whole's own value in both
 * periods), `unexplained` is the whole's change less the parts', exactly. Parts are sorted by the size of their contribution,
 * the order given on a tie. */
export function bridge(parts: Part[], whole?: { before: number; after: number }): Bridge {
  if (parts.length === 0) return { ok: false, why: "none" };
  const bad = (v: number | null) => v !== null && !Number.isFinite(v);
  if (parts.some((p) => bad(p.before) || bad(p.after)) || (whole && (!Number.isFinite(whole.before) || !Number.isFinite(whole.after)))) return { ok: false, why: "not-a-number" };
  if (parts.some((p) => p.weight !== undefined && p.weight !== 1 && p.weight !== -1)) return { ok: false, why: "weight" };
  const read = (v: number | null) => (v === null ? zero : fractionOf(v));
  const rows = parts.map((p) => ({ p, change: lowestTerms(times({ num: BigInt(p.weight ?? 1), den: BigInt(1) }, minus(read(p.after), read(p.before)))) }));
  const total = rows.reduce((t, r) => lowestTerms(plus(t, r.change)), zero);
  // Largest size first; parts of the same size keep the order given (a sort is stable).
  const ordered = [...rows].sort((a, b) => Number(sizeOf(b.change) * a.change.den - sizeOf(a.change) * b.change.den));
  const unexplained = whole ? nearest(lowestTerms(minus(minus(fractionOf(whole.after), fractionOf(whole.before)), total))) : null;
  return {
    ok: true,
    parts: ordered.map(({ p, change }) => ({ label: p.label, change: nearest(change), before: p.before, after: p.after, appeared: p.before === null && p.after !== null, gone: p.after === null && p.before !== null })),
    total: nearest(total),
    unexplained,
  };
}

/** The Takeaway of a bridge: "Worked out: Revenue fell by 42 €: Germany −35 €, Austria −9 €, France +2 €." in the Metric's unit,
 * with a note naming parts that had no value on one side and, where the whole's change was given, what the parts leave out. */
export function bridgeTakeaway(name: string, parts: Part[], unit: ValueUnit, ctx: TakeawayContext, whole?: { before: number; after: number }): Takeaway {
  const method = sayIn("numbers-method-bridge", {}, ctx);
  const result = bridge(parts, whole);
  if (!result.ok) return refusalTakeaway(method, [sayIn(result.why === "none" ? "refuse-rows" : result.why === "weight" ? "refuse-weight" : "refuse-not-a-number", { name, have: 0, need: 1 }, ctx)]);
  const write = (v: number) => formatValue(unit, v, ctx.style);
  const signed = (v: number) => `${v > 0 ? "+" : ""}${write(v)}`;
  const key = result.total > 0 ? "bridge-up" : result.total < 0 ? "bridge-down" : "bridge-flat";
  const list = result.parts.map((p) => `${p.label} ${signed(p.change)}`).join(sayIn("list-comma", {}, ctx));
  const missing = result.parts.filter((p) => p.appeared || p.gone).map((p) => p.label);
  const notes = [
    ...(missing.length > 0 ? [sayIn("bridge-missing", { names: listOf(missing, ctx) }, ctx)] : []),
    ...(result.unexplained ? [sayIn("bridge-unexplained", { value: { value: result.unexplained, unit } }, ctx)] : []),
  ];
  return {
    ...emptyTakeaway(method),
    kind: "answer",
    sentence: sayIn(key, { name, change: { value: Math.abs(result.total), unit }, parts: list }, ctx),
    notes,
    figures: [{ label: sayIn("numbers-change", {}, ctx), value: Math.abs(result.total), text: write(Math.abs(result.total)) }],
    numbers: [{ label: sayIn("numbers-method", {}, ctx), text: method }, { label: sayIn("numbers-change", {}, ctx), text: signed(result.total) }, ...result.parts.map((p) => ({ label: p.label, text: signed(p.change) }))],
  };
}
