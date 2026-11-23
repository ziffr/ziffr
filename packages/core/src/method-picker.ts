// The method picker's registry (GLOSSARY: Method, Recipe, Analysis Canvas; spec 0041, "Choose the method yourself", ticket 16): every
// Method a person can choose on the Analysis Canvas, once. An entry has what the person wants to know (the list is grouped by
// that, not by statistical family), its plain name with the technical name after it, one sentence, its Use it when / Don't use it
// when (word for word the Methods guide's, through method-picker-texts.json), the Slots it asks for and the settings it takes,
// both in words, what it needs of the canvas, and the suitability checks it runs. Pure data and types: how an entry fits a canvas
// is method-picker-fit.ts, how it runs is method-picker-run.ts, and who may see what is analysis-picker.ts.
//
// Adding a Method means adding its entry here; the tests fail for an entry without its texts, without a Takeaway rule (a
// runner in method-picker-run.ts) or that disagrees with the Methods guide. What-if (spec 0041, ticket 5) and an Extension
// (spec 0042) register here the same way, with no change to the screen.
import type { MethodId } from "./suitability";
import texts from "./method-picker-texts.json";

/** What a person wants to know: the groups of the list, in the order shown. */
export const WANTS = [
  { id: "heading", question: "Where is it heading?" },
  { id: "together", question: "What moves with what?" },
  { id: "need", question: "What would it take?" },
  { id: "if", question: "What would happen if?" },
  { id: "changed", question: "What changed?" },
  { id: "usual", question: "What is usual?" },
  { id: "concentrated", question: "Where is it concentrated?" },
] as const;
/** The id of a group of the list. */
export type WantId = (typeof WANTS)[number]["id"];

/** The id of a picker entry. */
export type EntryId = "forecast" | "reach-target" | "correlation" | "rank" | "partial" | "lag" | "moves" | "needs" | "what-if" | "after-date" | "change-point" | "bridge" | "usual" | "top-share" | "pareto";

/** A Metric the Method asks for, in words: "Which Metric do you want to explain?". A `many` Slot takes several. An optional Slot may stay empty. */
export type SlotDef = { id: string; question: string; many?: { min: number; max: number }; optional?: boolean };

/** A setting the Method takes, asked as a plain question with its default and range; nothing takes a number the Method cannot use. */
export type SettingDef =
  | { id: string; question: string; hint: string; kind: "whole"; min: number; max: number; default: number | null }
  | { id: string; question: string; hint: string; kind: "number"; required: boolean }
  | { id: string; question: string; hint: string; kind: "date"; required: boolean };

/** What an entry needs of the canvas besides Metrics and periods. */
export type Need = "target-range" | "breakdown" | "breakdown-before";

/** One Method of the picker. */
export type PickerEntry = {
  id: EntryId;
  want: WantId;
  /** The name as a person says it: "Does A move with B?". */
  name: string;
  /** What it tells you, in one sentence. */
  sentence: string;
  /** The technical name, shown after the name in small type. */
  technical: string;
  /** The heading of the Method's entry in docs/guides/methods.md, where its Use it when and Don't use it when are. */
  catalogue: keyof typeof texts;
  /** The suitability checks it runs (suitability.ts), or null where it has its own (a share of rows). */
  checks: MethodId | null;
  /** The Recipe that is this Method with its Slots and settings filled in for a question, or null where there is none. */
  recipe: string | null;
  slots: SlotDef[];
  settings: SettingDef[];
  needs: Need[];
  /** Settings of which exactly one must be given (an amount or a percent). */
  oneOf?: string[];
  /** The widget template that shows the same Takeaway, so the result can be saved as a widget the existing way, or null. */
  widget: "forecast" | "correlation" | null;
  /** The shortcuts on the canvas that start this entry (quick-starts.ts): a test holds them to that list. */
  quick?: readonly ("tile" | "chip")[];
};

const metric = (question: string, o: Partial<SlotDef> = {}): SlotDef => ({ id: "metric", question, ...o });
const NONE: SettingDef[] = [];

/** Every entry, in the order shown within its group. */
export const ENTRIES: readonly PickerEntry[] = [
  { id: "forecast", want: "heading", name: "Where is it heading?", sentence: "Carries the Metric's past forward a few periods, with the range it is likely to land in.", technical: "Holt and Holt-Winters forecast", catalogue: "Seasonal forecast (Holt-Winters)", checks: "forecast", recipe: null, slots: [metric("Which Metric do you want to look ahead for?")], settings: NONE, needs: [], widget: "forecast" , quick: ["tile", "chip"] },
  { id: "reach-target", want: "heading", name: "Will we reach the Target?", sentence: "Says how likely the Metric is to end where its Target Range wants it, and how often the same range held on the past.", technical: "Forecast with reach chance", catalogue: "Seasonal forecast (Holt-Winters)", checks: "forecast", recipe: "reach-target", slots: [metric("Which Metric has the Target?")], settings: [{ id: "ahead", question: "How many periods ahead?", hint: "Leave empty for the usual look ahead.", kind: "whole", min: 1, max: 60, default: null }], needs: ["target-range"], widget: "forecast" , quick: ["chip"] },
  { id: "correlation", want: "together", name: "Does A move with B?", sentence: "Says whether two Metrics have gone up and down together, and how clearly.", technical: "Correlation", catalogue: "Correlation", checks: "correlation", recipe: null, slots: [{ id: "first", question: "Which is the first Metric?" }, { id: "second", question: "Which is the second Metric?" }], settings: NONE, needs: [], widget: "correlation" , quick: ["tile", "chip"] },
  { id: "rank", want: "together", name: "Do A and B rise and fall in step, whatever their size?", sentence: "Compares only the order of the values, so a few very large values cannot pull the result.", technical: "Rank correlation", catalogue: "Rank correlation", checks: "spearman", recipe: null, slots: [{ id: "first", question: "Which is the first Metric?" }, { id: "second", question: "Which is the second Metric?" }], settings: NONE, needs: [], widget: null },
  { id: "partial", want: "together", name: "Do A and B still move together when C is held the same?", sentence: "Takes the Metrics you name out of the picture and says what is left of the link between two.", technical: "Partial correlation", catalogue: "Partial correlation", checks: "partial", recipe: null, slots: [{ id: "first", question: "Which is the first Metric?" }, { id: "second", question: "Which is the second Metric?" }, { id: "held", question: "Which Metrics should be held the same?", many: { min: 1, max: 4 } }], settings: NONE, needs: [], widget: null },
  { id: "lag", want: "together", name: "Does A come before B? By how long?", sentence: "Tries delays of 0 to 6 periods and says which one fits best, if any stands out.", technical: "Lagged correlation", catalogue: "Lagged correlation", checks: "lag", recipe: null, slots: [{ id: "first", question: "Which Metric might come first?" }, { id: "second", question: "Which Metric might follow?" }], settings: NONE, needs: [], widget: null },
  { id: "moves", want: "together", name: "What moves B?", sentence: "Says which of the other Metrics matter most for B, and by how much, with the others held the same.", technical: "Multiple linear fit", catalogue: "Multiple fit (What moves B?)", checks: "fit", recipe: "what-moves", slots: [metric("Which Metric do you want to explain?"), { id: "drivers", question: "Which Metrics might move it?", many: { min: 1, max: 12 } }], settings: NONE, needs: [], widget: null , quick: ["tile", "chip"] },
  { id: "needs", want: "need", name: "What does B need to reach a value?", sentence: "Says what each Metric that moved with B would need to be for B to reach the value you want.", technical: "Multiple linear fit, turned round", catalogue: "Needs (What does B need?)", checks: "needs", recipe: "what-needs", slots: [metric("Which Metric do you want to reach a value?"), { id: "drivers", question: "Which Metrics might get it there?", many: { min: 1, max: 12 } }], settings: [{ id: "goal", question: "Which value should it reach?", hint: "A number, in the Metric's own unit.", kind: "number", required: true }], needs: [], widget: null },
  { id: "what-if", want: "if", name: "What if A changes?", sentence: "Moves one Metric by an amount or a percent and says what follows for the Metrics that went with it, the ones worked out exactly set apart from the estimated.", technical: "What-if chain", catalogue: "What-if chain (What if A changes?)", checks: "whatIf", recipe: "what-if", slots: [metric("Which Metric do you want to change?"), { id: "others", question: "Which Metrics might follow it?", many: { min: 1, max: 12 } }], settings: [{ id: "by", question: "Change it by how much?", hint: "An amount in the Metric's own unit, such as 1000 or -250. Give this or a percent.", kind: "number", required: false }, { id: "percent", question: "Or by how many percent?", hint: "A number, such as 10 or -5. Give this or an amount.", kind: "number", required: false }], needs: [], oneOf: ["by", "percent"], widget: null },
  { id: "after-date", want: "changed", name: "Did it work?", sentence: "Compares the periods after a day with where the Metric's own trend pointed, as a range and not a verdict.", technical: "Before and after", catalogue: "Before and after", checks: "afterDate", recipe: "did-it-work", slots: [metric("Which Metric do you want to look at?"), { id: "beside", question: "A Metric it should not have touched (optional)", optional: true }], settings: [{ id: "date", question: "Which day did it start?", hint: "A day, such as 2026-03-01.", kind: "date", required: true }], needs: [], widget: null , quick: ["chip"] },
  { id: "change-point", want: "changed", name: "Did something change, and when?", sentence: "Finds the one day at which the Metric's level or trend most likely changed, or says that nothing stands out.", technical: "Change point", catalogue: "Change point", checks: "changePoint", recipe: "did-it-work", slots: [metric("Which Metric do you want to look at?")], settings: NONE, needs: [], widget: null },
  { id: "bridge", want: "changed", name: "Why did it change from last period?", sentence: "Splits the change since the period before into what each row of the Metric's Breakdown added or took away.", technical: "Bridge", catalogue: "Bridge", checks: null, recipe: null, slots: [metric("Which Metric has a Breakdown?")], settings: NONE, needs: ["breakdown", "breakdown-before"], widget: null },
  { id: "usual", want: "usual", name: "What is usual for it? Is this value unusual?", sentence: "Says what range the Metric has usually been in, and where a value you name stands against it.", technical: "Usual range", catalogue: "Quantiles and the usual range", checks: "usualRange", recipe: null, slots: [metric("Which Metric do you want to look at?")], settings: [{ id: "value", question: "A value to check (optional)", hint: "A number, in the Metric's own unit.", kind: "number", required: false }], needs: [], widget: null },
  { id: "top-share", want: "concentrated", name: "How much do the biggest rows make up?", sentence: "Adds up the share of the largest rows of the Metric's latest Breakdown.", technical: "Share of the largest rows", catalogue: "Share of the largest rows and Pareto", checks: null, recipe: null, slots: [metric("Which Metric has a Breakdown?")], settings: [{ id: "rows", question: "How many of the largest rows?", hint: "A whole number from 1 to 10.", kind: "whole", min: 1, max: 10, default: 3 }], needs: ["breakdown"], widget: null },
  { id: "pareto", want: "concentrated", name: "Which few rows make up most of it?", sentence: "Finds the fewest rows of the latest Breakdown that make up about 70 % of the whole.", technical: "Pareto", catalogue: "Share of the largest rows and Pareto", checks: null, recipe: null, slots: [metric("Which Metric has a Breakdown?")], settings: NONE, needs: ["breakdown"], widget: null },
];

/** The entry with this id, or undefined (an id from a browser is never trusted). */
export function entryOf(id: unknown): PickerEntry | undefined {
  return typeof id === "string" ? ENTRIES.find((e) => e.id === id) : undefined;
}

/** What an entry's Use it when and Don't use it when say: the Methods guide's own words. */
export function textsOf(entry: Pick<PickerEntry, "catalogue">): { useWhen: string; dontUseWhen: string[] } {
  const t = texts[entry.catalogue];
  return { useWhen: t.use, dontUseWhen: t.dont };
}

/** The Methods the suitability checks know that the picker does not offer as an entry of their own, and why: a check or a part of another entry. */
export const NOT_OFFERED: Readonly<Partial<Record<MethodId, string>>> = {
  drivers: "the Drivers Analysis on the canvas ranks pairs and is offered there, not as a Method",
  predict: "reading B off the line for values you give belongs to what-if (spec 0041, ticket 5), which registers here when it ships",
  trend: "the straight-line trend is part of the forecast and of Before and after",
  seasonal: "the seasonal forecast is chosen by the forecast's own rule, and says so",
};
