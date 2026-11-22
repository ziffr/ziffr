// The words of every Takeaway (GLOSSARY: Takeaway; spec 0041, rule 10): data keyed by case, so it can be translated, and
// one writer, so a dashboard widget, a View Link, a deck, an email and the API all show the same sentence. English is the
// only language so far. Numbers are written through the Workspace's Number Style and each Metric's unit (format.ts),
// never by hand. No text here may hold a word a non-analyst would have to look up (the forbidden-word test lists them);
// the footer is the one line that says "caused", because it says that nothing here is a cause.
import { formatNumber, formatValue, type ValueUnit } from "../format";
import type { NumberStyle } from "../number-style";
import type { StrengthWord } from "./strength";
import { periodLabel, type Span, type YearStart } from "../periods";

/** The languages Takeaways are written in. */
export type Language = "en";
/** Every language that exists, for the tests that walk the wording. */
export const LANGUAGES: readonly Language[] = ["en"];

const EN = {
  "strength-strong": "strong",
  "strength-moderate": "moderate",
  "strength-weak": "weak",
  "strength-cant-tell": "can't tell from chance",
  footer: "This shows what has gone together, not what caused what.",
  "basis-values": "compared by value",
  "basis-changes": "compared by change, growth removed",
  "basis-over": "{basis}, over {n} {periodsOf|n}",
  "basis-combined": "{basis}, by {period} ({n} {periodsOf|n})",
  "corr-together": "{a} and {b} tend to move together over {n} {periodsOf|n} ({strength}).",
  "corr-opposite": "{a} and {b} tend to move in opposite directions over {n} {periodsOf|n} ({strength}).",
  "corr-cant-tell": "Over {n} {periodsOf|n}, {a} and {b} do not clearly move together: {strength}.",
  "drivers-some": "Over {n} {periodsOf|n}, {names} moved with {target} the most.",
  "drivers-none": "Over {n} {periodsOf|n}, no Metric moved with {target} clearly enough to tell from chance.",
  "drivers-empty": "No other Metric has enough in common with {target} to compare.",
  "drivers-row": "{name}: {strength}",
  "list-and": " and ",
  "list-comma": ", ",
  "refuse-periods": "Not enough {periods} yet: {have} of {need} needed.",
  "refuse-vary": "{name} has hardly changed, so there is nothing to compare.",
  "refuse-gaps": "{name}: no value for {missing} of {total} {periods}, too many to go on.",
  "refuse-gap-run": "{name}: no value for {run} {periods} in a row, too many to go on.",
  "refuse-mixed-none": "{name} has Aggregation none, so it is compared only with Metrics counted the same way, and {other} is not.",
  "refuse-built-from": "{name} is worked out from {other}, so comparing them tells nothing.",
  "refuse-too-many": "{drivers} Metrics are too many for {have} {periods}: at most {allowed} can be weighed.",
  "caution-gaps": "{name}: no value for {missing} of {total} {periods}, left out.",
  "caution-far-off": "This result is pulled by {count} {periodsOf|count} far from the rest; without them it reads {without}.",
  "caution-skew": "A few values of {name} are far larger or smaller than most, so this reading is rough.",
  "caution-ties": "Many values of {name} repeat, so this reading is rough.",
  "switch-rank": "The values of {name} are very uneven, so their ranks are compared instead of the values.",
  "caution-curved": "The link looks curved, so a straight-line reading is rough.",
  "caution-link-weaker": "This link was stronger earlier than it has been since; the latest half reads {latest}.",
  "caution-link-stronger": "This link was weaker earlier than it has been since; the latest half reads {latest}.",
  "caution-link-flipped": "This link pointed the other way earlier; the latest half reads {latest}.",
  "caution-level-shift": "The level of {name} changed around {from}, so older values may mislead.",
  "switch-after-shift": "The level of {name} changed around {from}, so only the {count} {periodsOf|count} since then are used.",
  "caution-season": "The yearly pattern did not repeat the same way each year, so a seasonal reading is rough.",
  "switch-holt": "The yearly pattern did not repeat the same way each year, so a plain trend is used instead.",
  "caution-spread": "The misses grow as the level grows, so the ranges are rough.",
  "switch-percent": "The misses grow as the level grows, so ranges are worked out as a share of the level.",
  "switch-first-pass": "{drivers} Metrics are more than {have} {periods} can weigh, so the {allowed} that matter most were chosen first and the others left out.",
  "refuse-controls": "{name} and {other} need 1 to 4 other Metrics held the same: {have} were given.",
  "refuse-collinear": "The Metrics held the same move so closely together that they cannot be told apart, so nothing can be held the same.",
  "refuse-explained": "Once the others are held the same, nothing of {name} or {other} is left to compare.",
  "refuse-season": "{name} has no values at that point of the year to go by.",
  "refuse-rows": "{name}: {have} of {need} rows needed.",
  "refuse-not-a-number": "{name} has a row that is not a number, so nothing is worked out.",
  "refuse-negative": "{name} has a row below zero, so a share of the whole means nothing.",
  "refuse-nothing": "{name} adds up to nothing, so there is no share to give.",
  "refuse-ask": "{name}: that number of rows or that share cannot be worked out here.",
  "refuse-weight": "{name}: a part must count for or against the whole.",
  "basis-rank-values": "compared by rank of value",
  "basis-rank-changes": "compared by rank of change, growth removed",
  "basis-held": "compared by value, with {held} held the same",
  "basis-season": "from the {n} values at the same point of the year",
  "basis-history": "from {n} {periodsOf|n} of history",
  "partial-together": "With {held} held the same, {a} and {b} tend to move together over {n} {periodsOf|n} ({strength}).",
  "partial-opposite": "With {held} held the same, {a} and {b} tend to move in opposite directions over {n} {periodsOf|n} ({strength}).",
  "partial-cant-tell": "With {held} held the same, over {n} {periodsOf|n}, {a} and {b} do not clearly move together: {strength}.",
  "lag-leads": "{a} tends to move {lag} {periodsOf|lag} before {b} does, over {n} {periodsOf|n} ({strength}).",
  "lag-leads-opposite": "{a} tends to move the other way {lag} {periodsOf|lag} before {b} does, over {n} {periodsOf|n} ({strength}).",
  "lag-same": "{a} and {b} tend to move together in the same {period}, with no delay, over {n} {periodsOf|n} ({strength}).",
  "lag-same-opposite": "{a} and {b} tend to move in opposite directions in the same {period}, with no delay, over {n} {periodsOf|n} ({strength}).",
  "lag-cant-tell": "Over {n} {periodsOf|n}, no delay of 0 to {max} {periods} between {a} and {b} clearly shows a link: {strength}.",
  "usual-range": "{name} is usually between {low} and {high}, going by {n} {periodsOf|n}.",
  "usual-below": "The value asked about, {value}, is below that.",
  "usual-within": "The value asked about, {value}, is within that.",
  "usual-above": "The value asked about, {value}, is above that.",
  "share-top": "Worked out: the {k} largest of {rows} rows make up {share} of {name}: {names}.",
  "share-pareto": "Worked out: {k} of {rows} rows make up {share} of {name}, the fewest that reach {target}: {names}.",
  "note-tied": "Rows of the same size stand at the cut, so which of them is named is arbitrary; the count is not.",
  "bridge-up": "Worked out: {name} rose by {change}: {parts}.",
  "bridge-down": "Worked out: {name} fell by {change}: {parts}.",
  "bridge-flat": "Worked out: {name} did not change: {parts}.",
  "bridge-missing": "{names} had no value in one of the two periods, so it counts as 0 there.",
  "bridge-unexplained": "{value} of the change is not in these rows.",
  "numbers-method-spearman": "Spearman's rank correlation",
  "numbers-method-partial": "Partial correlation",
  "numbers-method-lag": "Lagged correlation",
  "numbers-method-usual": "Usual range",
  "numbers-method-share": "Share of the largest rows",
  "numbers-method-pareto": "Pareto",
  "numbers-method-bridge": "Bridge",
  "numbers-rho": "Rank correlation",
  "numbers-held": "Held the same",
  "numbers-lag": "Delay (periods)",
  "numbers-tries": "Delays looked at",
  "numbers-low": "Usual low",
  "numbers-high": "Usual high",
  "numbers-asked": "Value asked about",
  "numbers-median": "Middle",
  "numbers-quartiles": "Middle half",
  "numbers-usual": "Usual range",
  "numbers-values": "Values used",
  "numbers-share": "Share",
  "numbers-change": "Change",
  "numbers-method": "Method",
  "numbers-method-pearson": "Pearson's r",
  "numbers-r": "r",
  "numbers-pairs": "Pairs of periods",
  "numbers-periods": "Periods",
  "numbers-basis": "Compared on",
  "numbers-strength": "Strength",
} as const;

/** One case of wording: a sentence, line or label. */
export type CaseKey = keyof typeof EN;

/** Every line of every language, keyed by case. */
export const WORDING: Record<Language, Record<CaseKey, string>> = { en: EN };

const NOUNS: Record<Language, Record<Span, readonly [string, string]>> = {
  en: { day: ["day", "days"], week: ["week", "weeks"], month: ["month", "months"], quarter: ["quarter", "quarters"], half: ["half-year", "half-years"], year: ["year", "years"] },
};

/** What a slot in a line can hold: text, a count or number, or a value in a Metric's unit. */
export type Slot = string | number | { value: number; unit: ValueUnit };
/** The slots of one line, by name. */
export type Slots = Record<string, Slot>;

/** How a line is written: the Number Style for numbers, the Fiscal Year start for period names, the language, and how
 * a Method's own result is shown where a line quotes one (`without`). */
export type SayContext = { style: NumberStyle; language?: Language; yearStart?: YearStart; result?: (value: number) => string };

/** A line of wording with its slots filled in. `{periods}` is the plural noun of the slot `span`, `{period}` the singular,
 * `{periodsOf|n}` the noun for the count in slot `n` (singular for 1); a slot named `from` is a period's name. */
export function say(key: CaseKey, slots: Slots, ctx: SayContext): string {
  const language = ctx.language ?? "en";
  const noun = (plural: boolean) => NOUNS[language][slots.span as Span][plural ? 1 : 0];
  return WORDING[language][key].replace(/\{(\w+)(?:\|(\w+))?\}/g, (_, name: string, count?: string) => {
    if (name === "periods") return noun(true);
    if (name === "periodsOf") return noun(slots[count as string] !== 1);
    if (name === "period") return noun(false);
    const slot = slots[name];
    if (name === "latest") return WORDING[language][`strength-${slot as StrengthWord}`];
    if (name === "from") return periodLabel(String(slot), slots.span as Span, ctx.yearStart ?? 1);
    if (name === "without") return ctx.result ? ctx.result(Number(slot)) : formatNumber(Number(slot), 2, ctx.style);
    if (typeof slot === "object") return formatValue(slot.unit, slot.value, ctx.style);
    return typeof slot === "number" ? formatNumber(slot, Number.isInteger(slot) ? 0 : 2, ctx.style) : slot;
  });
}
