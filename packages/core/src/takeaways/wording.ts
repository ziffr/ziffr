// The words of every Takeaway (GLOSSARY: Takeaway; spec 0041, rule 10): data keyed by case, so it can be translated, and
// one writer, so a dashboard widget, a View Link, a deck, an email and the API all show the same sentence. English is the
// only language so far. Numbers are written through the Workspace's Number Style and each Metric's unit (format.ts),
// never by hand. No text here may hold a word a non-analyst would have to look up (the forbidden-word test lists them);
// the footer of a link between Metrics is the one line that says "caused", because it says that nothing here is a cause; a forecast has its own footer.
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
  "footer-forecast": "This carries the past forward; it is not a promise.",
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
  "moves-some": "Over {n} {periodsOf|n}, {names} moved with {target} the most, with the others held the same.",
  "moves-one": "Over {n} {periodsOf|n}, {names} moved with {target} the most.",
  "moves-none": "Over {n} {periodsOf|n}, none of the other Metrics clearly moved with {target}: can't tell from chance.",
  "moves-row": "{name}: {share} of what moved, {strength}",
  "moves-effect": "When {driver} goes up by {step}, {target} has {direction} by about {effect} (likely between {lo} and {hi}){held}.",
  "moves-held": ", with {others} held the same",
  "moves-unclear": "{driver}: it cannot be told whether {target} goes up or down with it.",
  "word-up": "gone up",
  "word-down": "gone down",
  "share-nearly-all": "nearly all",
  "share-most": "most",
  "share-half": "about half",
  "share-third": "about a third",
  "share-quarter": "about a quarter",
  "share-some": "some",
  "share-little": "little",
  "note-merged": "{names} move so closely that Ziffr cannot tell which matters; treated as one.",
  "predict-range": "With {given}, {target} is likely between {lo} and {hi}.",
  "predict-guess": "With {given}, {target} comes to about {value}. {outside}, so treat it as a guess.",
  "needs-range": "To reach {goal}, {driver} would need to be around {value} (likely between {lo} and {hi}), {compared}.",
  "needs-guess": "To reach {goal}, {driver} would need to be around {value}, {compared}. {outside}, so treat it as a guess.",
  "needs-point": "To reach {goal}, {driver} would need to be around {value}, {compared}; how far off that could be cannot be told from the data, so treat it as a guess.",
  "compared-above": "{pct} above today",
  "compared-below": "{pct} below today",
  "compared-same": "the same as today",
  "compared-zero": "against 0 today",
  "given-at": "{name} at {value}",
  "needs-none": "Over {n} {periodsOf|n}, none of the other Metrics clearly moved with {target}, so no value of them can be read as reaching {goal}.",
  "outside-above": "This is higher than {name} has ever been (highest {limit})",
  "outside-below": "This is lower than {name} has ever been (lowest {limit})",
  "outside-rise": "This is a bigger rise in one {period} than {name} has ever had (largest {limit})",
  "outside-fall": "This is a bigger fall in one {period} than {name} has ever had (largest {limit})",
  "refuse-collinear": "{names} move in exact step, so there is no telling which of them matters.",
  "refuse-no-drivers": "{target} needs at least one other Metric to be compared with.",
  "refuse-too-large": "The values are too large to work with.",
  "refuse-input": "{what} cannot be used as it was given.",
  "refuse-no-effect": "{target} has not moved with {name} at all, so no value of {name} reaches the goal.",
  "refuse-curved-outside": "The link looks curved, so nothing can be read from it for a value of {name} outside what it has been.",
  "refuse-goal-input": "The value you want must be a number.",
  "refuse-goal-far": "{goal} is more than 1,000 times the largest value {target} has had, so it is not worked out.",
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
  "fc-expected": "{name} is expected to be {value} in {from} (likely between {lo} and {hi}).",
  "fc-reach-min": "At this pace {name} reaches {min} or more in {from}: {chance}.",
  "fc-reach-max": "At this pace {name} stays at {max} or less in {from}: {chance}.",
  "fc-reach-between": "At this pace {name} lands between {min} and {max} in {from}: {chance}.",
  "chance-about": "about {k} in 10",
  "chance-under": "under 1 in 20",
  "chance-over": "at least 19 in 20",
  "fc-method-holt": "a plain trend (Holt)",
  "fc-method-holt-winters": "the trend and the yearly pattern (Holt-Winters)",
  "fc-method-holt-winters-weekly": "the trend and the weekly pattern (Holt-Winters)",
  "fc-basis": "worked out with {method}, over {n} {periodsOf|n}",
  "fc-track": "Over the last {tested} {periodsOf|tested}, the range for the next {period} would have held {inside} of {tested} times.",
  "fc-track-none": "Too few {periods} yet to check how this forecast did on the past.",
  "fc-assumes": "This assumes the pattern of the past carries on.",
  "fc-note-holt-better": "A plain trend missed no more than the {pattern} pattern on the last third of the {periods}, so the plain trend is used.",
  "fc-note-too-few": "Too few {periods} to check the {pattern} pattern against a plain trend, so a plain trend is used.",
  "fc-note-start-gap": "The {pattern} pattern needs the first two seasons without a gap, so a plain trend is used.",
  "pattern-yearly": "yearly",
  "pattern-weekly": "weekly",
  "caution-no-misses": "The past values fit this pattern with no miss at all, so the range and the chance may be too sure.",
  "refuse-too-far": "{name} cannot be looked at {ahead} {periodsOf|ahead} ahead; at most {most} {periodsOf|most}.",
  "refuse-by-past": "That date is not ahead: the latest value is for {from}.",
  "refuse-no-target": "{name} has no Target to reach.",
  "refuse-target-ends": "The Target of {name} cannot be read: its lower end is above its upper end, or an end is not a number.",
  "refuse-huge": "The values of {name} are too large to look ahead from.",
  "numbers-method": "Method",
  "numbers-method-holt": "Holt's linear trend",
  "numbers-method-holt-winters": "Holt-Winters, additive",
  "numbers-smoothing": "Smoothing (level, trend, pattern)",
  "numbers-expected": "Expected",
  "numbers-range": "Likely between",
  "numbers-chance": "Chance of reaching the Target",
  "numbers-target-min": "Target, at least",
  "numbers-target-max": "Target, at most",
  "numbers-in-ten": "In ten",
  "numbers-tested": "Periods tested",
  "numbers-inside": "Inside the range",
  "numbers-miss": "Typical miss",
  "numbers-third-holt": "Typical miss on the last third, plain trend",
  "numbers-third-holt-winters": "Typical miss on the last third, with the pattern",
  "numbers-third-n": "Periods compared",
  "numbers-method-pearson": "Pearson's r",
  "numbers-r": "r",
  "numbers-pairs": "Pairs of periods",
  "numbers-periods": "Periods",
  "numbers-basis": "Compared on",
  "numbers-strength": "Strength",
  "numbers-method-fit": "Straight line through several Metrics, by least squares",
  "numbers-method-predict": "A value read from that line, with the range of a single period",
  "numbers-method-needs": "That line turned round for one driver",
  "numbers-explained": "How much of the movement the line explains",
  "numbers-effect": "Effect per {step}",
  "numbers-share": "Share of what is explained",
  "numbers-moves-with": "Moves with the other drivers (variance inflation)",
  "numbers-goal": "Goal",
  "numbers-needed": "Value needed",
  "numbers-given": "Values given",
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
