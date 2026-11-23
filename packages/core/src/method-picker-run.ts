// Running a picked Method (GLOSSARY: Method, Recipe, Takeaway; spec 0041, ticket 16). Every entry of the picker runs through the Takeaway
// layer: the very function that writes the Takeaway of its Recipe (whatMoves, whatNeeds, forecastTakeaway, ...), with the Slots and
// settings the person gave, so a picked Method and its Recipe give the same Takeaway and none can skip a rule (the minimums, the
// basis, the range, the strength word, the footer). Pure: it works on the Metrics it is given, which the caller took from what the
// person may see. Settings come from a browser, so they are read here with their limits and refused in words.
import { basisFor, changes, type Basis } from "./basis";
import { commonPeriod, correlate } from "./correlation";
import { latestOfEach, seriesBy, type Resolver } from "./display-periods";
import { ENTRIES, type EntryId, type PickerEntry, type SettingDef } from "./method-picker";
import { afterDateTakeaway } from "./methods/before-after";
import { bridgeTakeaway, type Part } from "./methods/bridge";
import { changePointTakeaway } from "./methods/change-point";
import { paretoTakeaway, topShareTakeaway, type Row } from "./methods/concentration";
import { laggedTakeaway } from "./methods/lagged-correlation";
import { partialTakeaway } from "./methods/partial-correlation";
import { usualRangeTakeaway } from "./methods/quantiles";
import { spearmanTakeaway } from "./methods/spearman";
import { shiftPeriod, type Span } from "./periods";
import { ANALYSIS_FORMAT_2, type AnalysisRecipe2 } from "./analysis-recipe";
import { forecastTakeaway, endsOf, maxAhead } from "./takeaways/forecast";
import { whatMoves, whatNeeds } from "./takeaways/fit-takeaway";
import { whatIfRecipe } from "./takeaways/what-if-takeaway";
import { correlationTakeaway, refusalTakeaway, sayIn, type Takeaway, type TakeawayContext } from "./takeaways/takeaway";
import type { CaseKey } from "./takeaways/wording";
import type { BreakdownRow, Metric, Point } from "./types";
import type { YearStart } from "./periods";

/** What a run reads: the Metrics the person may see (and only those), their values and Breakdowns, and how to write numbers. */
export type PickWorld = {
  metrics: Metric[];
  series: Record<string, Point[]>;
  breakdowns: Record<number, Record<string, BreakdownRow[]>>;
  ctx: TakeawayContext;
  yearStart: YearStart;
  /** The day it is (yyyy-mm-dd), for the period that is still running; left out, the current day. */
  today?: string;
};

/** The Metrics for each Slot, and the settings, as a run reads them. */
export type Picked = { slots: Record<string, Metric[]>; settings: Record<string, number | string> };

const resolverOf = (w: PickWorld): Resolver => (slug) => {
  const metric = w.metrics.find((m) => m.slug === slug);
  // Stryker disable next-line ArrayDeclaration: a Metric whose values were not read has none; a single made-up element is one value, far below every minimum, and is refused in the same words
  return metric && { metric, points: w.series[slug] ?? [] };
};

// A Metric's own values by its own period, whole periods only.
// Stryker disable next-line ArrayDeclaration: a Metric whose values were not read has none; a single made-up element is one value, far below every minimum, and is refused in the same words
const ownPoints = (w: PickWorld, m: Metric): Point[] => latestOfEach(w.series[m.slug] ?? []).map((p) => ({ period: p.period, value: p.value }));

// What a refusal of the picker's own says: the Method's name and the reason.
const refuse = (key: CaseKey, w: PickWorld, why: string): Takeaway => refusalTakeaway(sayIn(key, {}, w.ctx), [why]);

// The Metrics put on their common period (the longest), whole periods only; the reason where one cannot be combined.
function onCommon(w: PickWorld, metrics: Metric[]): { span: Span; series: Point[][] } | string {
  const span = metrics.map((m) => m.period as Span).reduce(commonPeriod);
  const series: Point[][] = [];
  for (const m of metrics) {
    const s = seriesBy(m, resolverOf(w), span, { yearStart: w.yearStart, today: w.today });
    if (!s.ok) return s.reason;
    series.push(s.points.filter((p) => !p.toDate).map((p) => ({ period: p.period, value: p.value })));
  }
  return { span, series };
}

// Two series compared on the basis the rule gives (by change where both grow), as the Recipes do.
function pairOn(a: Point[], b: Point[], span: Span): { basis: Basis; a: Point[]; b: Point[] } {
  const basis = basisFor(a, b, span);
  return { basis, a: basis === "changes" ? changes(a, span) : a, b: basis === "changes" ? changes(b, span) : b };
}

const one = (p: Picked, slot: string): Metric => p.slots[slot][0];

type Runner = (w: PickWorld, p: Picked) => Takeaway;

// A comparison of Metrics on their common period, or the refusal that says why they cannot be put on one.
function compared(key: CaseKey, w: PickWorld, ms: Metric[], run: (span: Span, series: Point[][]) => Takeaway): Takeaway {
  const on = onCommon(w, ms);
  return typeof on === "string" ? refuse(key, w, on) : run(on.span, on.series);
}

// The latest Breakdown of a Metric as rows, or why there are none.
function rowsOf(w: PickWorld, m: Metric, period: string | undefined): Row[] | null {
  // Stryker disable next-line ConditionalExpression: a Metric has no rows under an undefined period either, so the lookup without this test finds none
  const rows = period === undefined ? undefined : w.breakdowns[m.id]?.[period];
  return rows && rows.length > 0 ? rows.map((r) => ({ label: r.label, value: r.value })) : null;
}

const latestPeriod = (points: Point[]): string | undefined => points.at(-1)?.period;

function bridgeOf(key: CaseKey, w: PickWorld, p: Picked): Takeaway {
  const m = one(p, "metric");
  const pts = ownPoints(w, m);
  const [was, now] = [rowsOf(w, m, pts.at(-2)?.period), rowsOf(w, m, pts.at(-1)?.period)];
  // Rows for both periods mean both periods have a value.
  if (!was || !now) return refuse(key, w, `${m.name} needs a Breakdown for its latest period and the one before.`);
  const labels = [...new Set([...was, ...now].map((r) => r.label))];
  const at = (rows: Row[], l: string) => rows.find((r) => r.label === l)?.value ?? null;
  const parts: Part[] = labels.map((label) => ({ label, before: at(was, label), after: at(now, label) }));
  return bridgeTakeaway(m.name, parts, m, w.ctx, { before: pts.at(-2)!.value, after: pts.at(-1)!.value });
}

function shareOf(key: CaseKey, w: PickWorld, p: Picked, take: (name: string, rows: Row[]) => Takeaway): Takeaway {
  const m = one(p, "metric");
  const period = latestPeriod(ownPoints(w, m));
  const rows = period ? rowsOf(w, m, period) : null;
  return rows ? take(m.name, rows) : refuse(key, w, `${m.name} has no Breakdown for its latest period.`);
}

function reachOf(w: PickWorld, p: Picked): Takeaway {
  const m = one(p, "metric");
  const ends = endsOf(m);
  if (ends.min === null && ends.max === null) return refuse("numbers-method-holt", w, `${m.name} has no Target Range, so there is nothing to reach.`);
  const pts = ownPoints(w, m);
  const last = latestPeriod(pts);
  const ahead = p.settings.ahead;
  // Without a number of periods the Recipe's own look ahead is used (the end of the default horizon).
  const by = typeof ahead === "number" && last ? shiftPeriod(last, m.period as Span, Math.min(ahead, maxAhead(m.period as Span))) : undefined;
  return forecastTakeaway(m, pts, w.ctx, { ends, ...(by ? { by } : {}) });
}

// The Metrics a fit takes besides its target: the ones chosen, in the order chosen.
const driversOf = (p: Picked): Metric[] => p.slots.drivers;

/** The Takeaway rule of each entry: the function that writes its Recipe's Takeaway. An entry has no way to run without one, so no Method can skip a rule. */
export const RUNNERS: Record<EntryId, Runner> = {
  /** Where is it heading?: the forecast with its range. */
  forecast: (w, p) => forecastTakeaway(one(p, "metric"), ownPoints(w, one(p, "metric")), w.ctx),
  /** Will we reach the Target?: the forecast and the chance of reaching it. */
  "reach-target": reachOf,
  /** Does A move with B?: Pearson's r on the basis the rule gives. */
  correlation: (w, p) => {
    const [a, b] = [one(p, "first"), one(p, "second")];
    return correlationTakeaway(a, b, correlate(a, b, resolverOf(w), { yearStart: w.yearStart, today: w.today }), w.ctx);
  },
  /** Rank correlation, for skewed values. */
  rank: (w, p) => compared("numbers-method-spearman", w, [one(p, "first"), one(p, "second")], (span, [a, b]) => {
    const pair = pairOn(a, b, span);
    return spearmanTakeaway(one(p, "first").name, one(p, "second").name, pair.a, pair.b, span, pair.basis, w.ctx);
  }),
  /** Partial correlation with the Metrics held the same. */
  partial: (w, p) => compared("numbers-method-partial", w, [one(p, "first"), one(p, "second"), ...p.slots.held], (span, [a, b, ...held]) =>
    partialTakeaway({ a: one(p, "first").name, b: one(p, "second").name, held: p.slots.held.map((m) => m.name) }, a, b, held, span, w.ctx)),
  /** Lagged correlation: which delay fits best. */
  lag: (w, p) => compared("numbers-method-lag", w, [one(p, "first"), one(p, "second")], (span, [a, b]) => {
    const pair = pairOn(a, b, span);
    return laggedTakeaway(one(p, "first").name, one(p, "second").name, pair.a, pair.b, span, pair.basis, w.ctx);
  }),
  /** What moves B?: the multiple fit, as its Recipe. */
  moves: (w, p) => whatMoves(one(p, "metric"), driversOf(p), resolverOf(w), { yearStart: w.yearStart, ctx: w.ctx }),
  /** What if A changes?: the what-if chain over the Metrics chosen, as its Recipe. */
  "what-if": (w, p) => whatIfRecipe(one(p, "metric"), "by" in p.settings ? { by: p.settings.by as number } : { percent: p.settings.percent as number }, p.slots.others, resolverOf(w), { yearStart: w.yearStart, ctx: w.ctx }),
  /** What does B need?: the fit turned round, as its Recipe. */
  needs: (w, p) => whatNeeds(one(p, "metric"), driversOf(p), p.settings.goal as number, resolverOf(w), { yearStart: w.yearStart, ctx: w.ctx }),
  /** Did it work?: the periods after a day against the earlier trend. */
  "after-date": (w, p) => {
    const m = one(p, "metric");
    const beside = p.slots.beside?.[0];
    return afterDateTakeaway(m.name, ownPoints(w, m), m.period as Span, p.settings.date as string, m, w.ctx, beside && { name: beside.name, points: ownPoints(w, beside), unit: beside });
  },
  /** Did something change, and when?: the change point. */
  "change-point": (w, p) => changePointTakeaway(one(p, "metric").name, ownPoints(w, one(p, "metric")), one(p, "metric").period as Span, one(p, "metric"), w.ctx),
  /** Why did it change?: the Breakdown rows of the last two periods as a bridge. */
  bridge: (w, p) => bridgeOf("numbers-method-bridge", w, p),
  /** What is usual?: the usual range and where a value stands. */
  usual: (w, p) => {
    const m = one(p, "metric");
    const value = p.settings.value;
    return usualRangeTakeaway(m.name, ownPoints(w, m), m.period as Span, m, w.ctx, { value: value as number | undefined });
  },
  /** How much do the biggest rows make up?: the share of the top rows. */
  "top-share": (w, p) => shareOf("numbers-method-share", w, p, (name, rows) => topShareTakeaway(name, rows, p.settings.rows as number, w.ctx)),
  /** Which few rows make up most of it?: the Pareto rows. */
  pareto: (w, p) => shareOf("numbers-method-pareto", w, p, (name, rows) => paretoTakeaway(name, rows, w.ctx)),
};

/** Runs an entry on what the person picked, through its Takeaway rule. */
export function runEntry(entry: PickerEntry, w: PickWorld, picked: Picked): Takeaway {
  return RUNNERS[entry.id](w, picked);
}

// ---- Reading what a browser sent --------------------------------------------------------------------------------------------

/** The largest number a setting takes (a value wanted, a value to check): beyond it a number is not a Metric's value. */
export const MOST_NUMBER = 1e15;
const NUMBER_TEXT = /^-?\d{1,16}(\.\d{1,12})?$/;
const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A number a person typed: whole or decimal digits with a minus, no exponent, no spaces, at most 1e15 in size; null for anything else. */
export function readNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && NUMBER_TEXT.test(v.trim()) ? Number(v) : Number.NaN;
  return Number.isFinite(n) && Math.abs(n) <= MOST_NUMBER ? n : null;
}

/** A day written yyyy-mm-dd that exists, from 1970 to 2100; null for anything else. */
export function readDay(v: unknown): string | null {
  // Anything that is not text is read as text and never equals the day written back, so it comes out as no day.
  const m = DATE_TEXT.exec(v as string);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // A day that does not exist (30 February) comes back as another day when written again.
  const written = new Date(Date.UTC(y, mo - 1, d)).toISOString().slice(0, 10);
  return y >= 1970 && y <= 2100 && written === v ? written : null;
}

const empty = (v: unknown) => v === undefined || v === null || v === "";

function readOne(def: SettingDef, v: unknown): { ok: true; value: number | string | null } | { ok: false; message: string } {
  const bad = (message: string) => ({ ok: false as const, message });
  if (def.kind === "whole") {
    if (empty(v)) return { ok: true, value: def.default };
    const n = readNumber(v) ?? Number.NaN;
    return Number.isInteger(n) && n >= def.min && n <= def.max ? { ok: true, value: n } : bad(`${def.question} Use a whole number from ${def.min} to ${def.max}.`);
  }
  if (def.kind === "number") {
    if (empty(v)) return def.required ? bad(`${def.question} Give a number.`) : { ok: true, value: null };
    const n = readNumber(v);
    return n === null ? bad(`${def.question} Give a number with digits only, no larger than 1,000,000,000,000,000.`) : { ok: true, value: n };
  }
  if (empty(v)) return def.required ? bad(`${def.question} Give a day.`) : { ok: true, value: null };
  const day = readDay(v);
  return day === null ? bad(`${def.question} Give a day that exists, written like 2026-03-01.`) : { ok: true, value: day };
}

/** The settings of an entry as a browser sent them: each one read with its limits, an unknown one refused, one that was not given set to its default. */
export function readSettings(entry: PickerEntry, raw: unknown): { ok: true; settings: Picked["settings"] } | { ok: false; message: string } {
  const sent = raw === undefined || raw === null ? {} : raw;
  if (typeof sent !== "object" || Array.isArray(sent)) return { ok: false, message: "The settings were not sent in a form Ziffr can read." };
  const known = new Set(entry.settings.map((s) => s.id));
  if (Object.keys(sent).some((k) => !known.has(k))) return { ok: false, message: "A setting was sent that this Method does not take." };
  const settings: Picked["settings"] = {};
  for (const def of entry.settings) {
    const got = readOne(def, (sent as Record<string, unknown>)[def.id]);
    if (!got.ok) return got;
    if (got.value !== null) settings[def.id] = got.value;
  }
  if (entry.oneOf && entry.oneOf.filter((id) => id in settings).length !== 1) return { ok: false, message: `${entry.name} Give exactly one of: ${entry.oneOf.map((id) => entry.settings.find((d) => d.id === id)!.question).join(" or ")}` };
  return { ok: true, settings };
}

/** The ids a browser named for each Slot, with their counts held to the Slot's own: whole positive ids, no id twice across Slots. Nothing about what may be seen is decided here. */
export function readSlotIds(entry: PickerEntry, raw: unknown): { ok: true; ids: Record<string, number[]> } | { ok: false; message: string } {
  const sent = raw === undefined || raw === null ? {} : raw;
  if (typeof sent !== "object" || Array.isArray(sent)) return { ok: false, message: "The Metrics were not sent in a form Ziffr can read." };
  const known = new Set(entry.slots.map((s) => s.id));
  if (Object.keys(sent).some((k) => !known.has(k))) return { ok: false, message: "A Metric was named for a place this Method does not have." };
  const ids: Record<string, number[]> = {};
  const used = new Set<number>();
  for (const s of entry.slots) {
    const list = (sent as Record<string, unknown>)[s.id];
    const given = list === undefined ? [] : list;
    const [least, most] = s.many ? [s.many.min, s.many.max] : [s.optional ? 0 : 1, 1];
    const valid = Array.isArray(given) && given.length <= most && given.every((i) => Number.isSafeInteger(i) && i > 0);
    if (!valid) return { ok: false, message: `${s.question} Choose ${most === 1 ? "one Metric" : `up to ${most} Metrics`}.` };
    if ((given as number[]).length < least) return { ok: false, message: `${s.question} Choose ${least === 1 ? "a Metric" : `at least ${least} Metrics`}.` };
    for (const i of given as number[]) {
      if (used.has(i)) return { ok: false, message: "A Metric can be chosen once for each Method." };
      used.add(i);
    }
    ids[s.id] = given as number[];
  }
  return { ok: true, ids };
}

// ---- The Recipe as a file ---------------------------------------------------------------------------------------------------

/** The Analysis Recipe (format /2) that is this entry with its Slots filled in, for the entries a recipe file can say with its functions; null for the others.
 * A person can paste it in the Playground, add it to the Workspace and put it in a Pack. */
export function recipeFileOf(entry: PickerEntry, held = 1, drivers = 1): AnalysisRecipe2 | null {
  const slot = (n: number) => `slot${n}`;
  const base = { format: ANALYSIS_FORMAT_2 as typeof ANALYSIS_FORMAT_2, name: entry.name };
  const takeaway = (step: string) => [{ step, label: entry.technical, shows: "takeaway" as const }];
  const labels = (...l: string[]) => l.map((label) => ({ label }));
  switch (entry.id) {
    case "rank": return { ...base, slots: labels("First Metric", "Second Metric"), steps: [{ id: "link", fn: "spearman", of: slot(1), with: slot(2) }], outputs: takeaway("link") };
    case "lag": return { ...base, slots: labels("First Metric", "Second Metric"), steps: [{ id: "link", fn: "laggedCorrelation", of: slot(1), with: slot(2), maxLag: 6 }], outputs: takeaway("link") };
    case "usual": return { ...base, slots: labels("Metric"), steps: [{ id: "usual", fn: "usualRange", of: slot(1) }], outputs: takeaway("usual") };
    case "partial": return { ...base, slots: labels("First Metric", "Second Metric", ...Array.from({ length: held }, (_, i) => `Held the same ${i + 1}`)), steps: [{ id: "link", fn: "partialCorrelation", of: slot(1), with: slot(2), controls: Array.from({ length: held }, (_, i) => slot(i + 3)) }], outputs: takeaway("link") };
    case "moves": return { ...base, slots: labels("Metric to explain", ...Array.from({ length: drivers }, (_, i) => `Might move it ${i + 1}`)), steps: [{ id: "fit", fn: "fit", of: slot(1), drivers: Array.from({ length: drivers }, (_, i) => slot(i + 2)) }], outputs: takeaway("fit") };
    default: return null;
  }
}

/** The ids of the entries a recipe file can be made for. */
export const WITH_RECIPE_FILE: readonly EntryId[] = ENTRIES.filter((e) => recipeFileOf(e) !== null).map((e) => e.id);
