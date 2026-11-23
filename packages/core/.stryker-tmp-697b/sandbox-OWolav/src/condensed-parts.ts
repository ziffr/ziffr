// @ts-nocheck
// Condensed Values and values together (spec 0033, ticket #380; GLOSSARY: Condensed Value, Display Period, Aggregation,
// Target Series): what a period contributes to a longer one, whether it is a value or a Condensed Value, and how parts
// combine into the value of a longer span, exactly as spec 0022's Display Periods do. Pure, and free of the Display
// Period code so that code can use it. The Target of a span condenses the same way (a sum and a count of targets).
import { fractionOf, fractionOfText, nearestDouble, plus, type Fraction } from "./exact";
import type { Aggregation, Point } from "./types";

const ZERO = BigInt(0);
const NONE: Fraction = { num: ZERO, den: BigInt(1) };

/** The sum of fractions, exactly. */
export const sumOf = (parts: readonly Fraction[]): Fraction => parts.reduce(plus, NONE);

/** A sum of values as text, without trailing zeros: 1.25 is "1.25", 3.00 is "3". Every value is a decimal, so the
 * denominator is a power of ten whose zeros are the places. */
export function decimalText({ num, den }: Fraction): string {
  const places = den.toString().length - 1;
  // Stryker disable next-line EqualityOperator: for a BigInt, -0 and 0 are the same number, so `<=` changes nothing
  const all = (num < ZERO ? -num : num).toString().padStart(places + 1, "0");
  const decimals = all.slice(all.length - places).replace(/0+$/, "");
  return `${num < ZERO ? "-" : ""}${all.slice(0, all.length - places)}${decimals ? `.${decimals}` : ""}`;
}

/** What a period contributes to a longer one: a Condensed Value, or one value as a part of its own. */
export type Part = { period: string; held: number; sum: string | null; last: { value: string; day: string } | null };

/** One stored value as a part, so values and Condensed Values combine the same way. */
export function partOfPoint(p: Point): Part {
  return { period: p.period, held: 1, sum: decimalText(fractionOf(p.value)), last: { value: String(p.value), day: p.period } };
}

/** The value of parts (oldest first) over a span that has `expected` Metric periods, by the Aggregation: the same
 * rule as a series by a Display Period. It counts once at least half of the periods have a value; a sum adds the
 * sums, an average divides them by the count of values held, the last value is that of the latest part. Undefined
 * when it does not count, and for Aggregation none over more than one value. */
export function valueOfParts(aggregation: Aggregation, parts: readonly Part[], expected: number): number | undefined {
  const held = parts.reduce((n, p) => n + p.held, 0);
  if (!held || held < Math.ceil(expected / 2)) return undefined;
  if (aggregation === "last") return Number(parts[parts.length - 1].last!.value);
  // A part that is a single value has no sum for Aggregation last value only; sum and average always carry one.
  const sum = sumOf(parts.map((p) => fractionOfText(p.sum!)));
  if (held === 1) return nearestDouble(sum.num, sum.den);
  if (aggregation === "none") return undefined;
  return nearestDouble(sum.num, sum.den * BigInt(aggregation === "sum" ? 1 : held));
}

/** The periods a Condensed Value can stand for (the Display Periods but half-years). */
export type CondensedSpan = "week" | "month" | "quarter" | "year";

/** The Targets of a span's Metric periods, condensed: how many had one, their exact sum, and the last one and its day.
 * It counts for a span only where every Metric period had one (the rule for a Target by Display Period). */
export type TargetPart = { held: number; sum: string; last: { value: string; day: string } };

/** A Condensed Value as stored and read (GLOSSARY: Condensed Value): the span, how many of its periods had a value,
 * the exact sum or the last value, the Target, and the day it was made. Its numbers are sealed in the database. */
export type CondensedPoint = {
  /** The span's first day, and its last. */
  period: string;
  periodEnd: string;
  into: CondensedSpan;
  held: number;
  of: number;
  sum: string | null;
  last: { value: string; day: string } | null;
  target: TargetPart | null;
  locked: boolean;
  /** The day it was made, for "This period was condensed on …". */
  condensedOn: string;
};

/** Whether a day lies inside a condensed span: the originals of such a period are no longer shown (the job deletes
 * them in the same step it stores the Condensed Value; until then the Condensed Value stands for them). */
export function inCondensed(spans: readonly Pick<CondensedPoint, "period" | "periodEnd">[], day: string): boolean {
  return spans.some((c) => day >= c.period && day <= c.periodEnd);
}

/** A Condensed Value as a part of the longer spans and series it takes the place of. */
export function partOfCondensed(c: Pick<CondensedPoint, "period" | "held" | "sum" | "last">): Part {
  return { period: c.period, held: c.held, sum: c.sum, last: c.last };
}

/** The Targets of a span's Metric periods (latest of each, oldest first) as one part, or null when there are none. */
export function targetPartOf(targets: readonly Point[]): TargetPart | null {
  if (!targets.length) return null;
  const newest = targets[targets.length - 1];
  return { held: targets.length, sum: decimalText(sumOf(targets.map((t) => fractionOf(t.value)))), last: { value: String(newest.value), day: newest.period } };
}

/** The Target of a span by an Aggregation, from the Targets of its periods kept as they are and Condensed Values'
 * Target parts, when together they cover all `expected` periods; undefined otherwise (as `targetsBy`: no Target is
 * made up for a period that has none). A sum adds, an average is the sum over the count, the last is the latest's. */
export function targetOfParts(aggregation: Aggregation, values: readonly Point[], parts: readonly TargetPart[], expected: number): number | undefined {
  const held = values.length + parts.reduce((n, p) => n + p.held, 0);
  if (!held || held !== expected || aggregation === "none") return undefined;
  if (aggregation === "last") {
    const latest = [...values.map((v) => ({ value: String(v.value), day: v.period })), ...parts.map((p) => p.last)].sort((a, b) => a.day.localeCompare(b.day)).pop()!;
    return Number(latest.value);
  }
  const sum = sumOf([...values.map((v) => fractionOf(v.value)), ...parts.map((p) => fractionOfText(p.sum))]);
  return nearestDouble(sum.num, sum.den * BigInt(aggregation === "sum" ? 1 : held));
}
