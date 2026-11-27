// The method picker on the Analysis Canvas, for a person (GLOSSARY: Analysis Canvas, Method, Takeaway; spec 0041, ticket 16). `listPicker`
// gives the list of Methods grouped by what the person wants to know, fitted to the Metrics on their canvas; `runPicker` runs the one they
// picked through the Takeaway layer. Both take the Actor first and work only on Metrics that Actor may see (their Shares, Groups, Tokens
// and Stand-ins, through visibleMetricIds): a Metric they may not see is not on the list of Slots, not named in a reason, not counted, and
// an id for one gets the same words as an id that does not exist. What the browser sends (ids, settings) is untrusted: read with limits in
// method-picker-run.ts and refused in words. The screen only calls these.
import { format } from "date-fns";
import type { Actor } from "./actor";
import { seriesFor, visibleMetricIds } from "./access";
import { explainedFirst } from "./canvas-roles";
import { yearStartOf } from "./fiscal-year";
import { questionFor, sentenceFor, type Picked } from "./method-picker-names";
import { entryOf, textsOf, type EntryId, type PickerEntry, type SettingDef, type SlotDef } from "./method-picker";
import { fitList, groupsFor, metricsNeeded, periodsShort, type CanvasFact, type EntryFit } from "./method-picker-fit";
import { exampleRun, type Example } from "./method-picker-example";
import { shortWords, type History } from "./method-picker-short";
import { readSettings, readSlotIds, recipeFileOf, runEntry, type PickWorld } from "./method-picker-run";
import { pasteMetrics } from "./paste-values";
import { endsOf } from "./takeaways/forecast";
import type { AnalysisRecipe2 } from "./analysis-recipe";
import { seriesBy, type Resolver } from "./display-periods";
import { JANUARY, type Span, type YearStart } from "./periods";
import type { NumberStyle } from "./number-style";
import type { Takeaway } from "./takeaways/takeaway";
import type { Metric, Period } from "./types";
import { numberStyleOf } from "./workspace-settings";
import { getMetrics } from "./workspace-data";

/** The most Metrics one request may name; a canvas is a handful. */
export const MOST_PICKED = 50;
/** The most values of one Metric a picked Method reads (the latest). */
export const MOST_POINTS = 1000;
/** What a person is told for an id that is not theirs to use: the same words whether the Metric is hidden or does not exist. */
export const NOT_AVAILABLE = "One of those Metrics is not available to you.";

/** A Metric on the canvas as the list shows it: its name and period, nothing else. */
export type CanvasMetric = { id: number; name: string; period: Span };

/** An entry as the list shows it. */
export type EntryView = {
  id: EntryId;
  /** The question in the words of the Metrics it starts on ("What moves Cost?"); the generic words where none is chosen. */
  name: string;
  /** The generic question ("What moves B?"), for the screen to word again once the person has chosen other Metrics. */
  generic: string;
  sentence: string;
  technical: string;
  useWhen: string;
  dontUseWhen: string[];
  slots: SlotDef[];
  settings: SettingDef[];
  /** How many Metrics it needs on the canvas, in words. */
  needs: string;
  fit: EntryFit;
  /** Where too little history stops it: how close it is, said in place of the reason. */
  short?: ShortView;
  /** The Metrics each Slot is filled with from the canvas where the entry fits (ids, in canvas order); a Slot the person may change. */
  defaults: Record<string, number[]>;
  /** Whether the result can be had as an Analysis Recipe file. */
  recipeFile: boolean;
  /** The widget that shows the same Takeaway, so that the result can be saved as one the existing way. */
  widget: PickerEntry["widget"];
};

/** How close an entry is: the line to show, and the Metric (one the person sees) whose history is short, with its period. */
export type ShortView = { words: string; metric: { id: number; name: string; slug: string }; span: Span; /** Whether this person may paste earlier values for that Metric, by the paste page's own rule. */ mayAddEarlier: boolean };

/** The list: the canvas Metrics the person sees, and the groups of entries. */
export type PickerList = { canvas: CanvasMetric[]; /** Why there is no list, in words, where there is a reason. */ notice?: string; groups: { want: string; question: string; entries: EntryView[] }[] };

/** The result of running an entry: a Takeaway, or why it could not be asked for. */
export type PickerRun =
  | { ok: true; entry: EntryId; takeaway: Takeaway; recipe: AnalysisRecipe2 | null; widget: { template: "forecast" | "correlation"; metricIds: number[]; showTarget: boolean } | null }
  | { ok: false; message: string };

// The ids a browser sent for a canvas: whole positive numbers, at most MOST_PICKED, each once, in the order sent.
function readIds(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length > MOST_PICKED || !raw.every((i) => Number.isSafeInteger(i) && i > 0)) return null;
  return [...new Set(raw as number[])];
}

type Loaded = { world: PickWorld; visible: Map<number, Metric> };

// What the picker reads for these Metrics: the ones the actor sees among them, with their values and Breakdowns, and nothing of any other.
async function load(actor: Actor, ids: number[]): Promise<Loaded> {
  const ws = actor.workspaceId;
  const metrics = await getMetrics(ws);
  const seen = await visibleMetricIds(ws, actor.personId, metrics);
  const visible = new Map(metrics.filter((m) => seen.has(m.id) && !m.archived_at).map((m) => [m.id, m]));
  const wanted = ids.filter((i) => visible.has(i));
  const [data, style, yearStart] = await Promise.all([seriesFor(ws, metrics, seen, wanted), numberStyleOf(ws), yearStartOf(ws)]);
  // Only the Metrics asked for and the visible inputs of their formulas are in `series`; the world holds the visible Metrics only, so a lookup never finds another.
  // At most the latest MOST_POINTS values of each Metric are read: a Method looks at the latest 120 periods, and a very long daily history would only cost work.
  const series = Object.fromEntries(Object.entries(data.series).map(([k, v]) => [k, v.length > MOST_POINTS ? v.slice(-MOST_POINTS) : v]));
  const world: PickWorld = { metrics: [...visible.values()], series, breakdowns: data.breakdowns, ctx: { style }, yearStart, targets: data.targets, condensed: data.condensed };
  return { world, visible };
}

// A Metric's whole periods with a value, by its own period.
function wholePoints(w: PickWorld, m: Metric) {
  const resolve: Resolver = (slug) => {
    const metric = w.metrics.find((x) => x.slug === slug);
    return metric && { metric, points: w.series[slug] ?? [] };
  };
  const own = seriesBy(m, resolve, m.period as Span, { yearStart: w.yearStart });
  return own.ok ? own.points.filter((p) => !p.toDate) : [];
}

// How close an entry is, where history is what stops it. Every Metric in `facts` is one the actor sees.
function shortView(w: PickWorld, entry: PickerEntry, facts: CanvasFact[], visible: Map<number, Metric>, today: string): Omit<ShortView, "mayAddEarlier"> | undefined {
  const short = periodsShort(entry, facts);
  if (!short) return undefined;
  const m = visible.get(short.metric)!;
  const history: History = { starts: wholePoints(w, m).map((p) => p.period), derived: Boolean(m.formula) };
  return { words: shortWords(entry, short, facts, history, w.yearStart, today), metric: { id: m.id, name: m.name, slug: m.slug }, span: short.span };
}

function factOf(w: PickWorld, m: Metric, canvas: Metric[]): CanvasFact {
  const points = wholePoints(w, m);
  const [before, latest] = [points.at(-2)?.period, points.at(-1)?.period];
  const ends = endsOf(m);
  const has = (period: string | undefined) => period !== undefined && (w.breakdowns[m.id]?.[period]?.length ?? 0) > 0;
  return {
    id: m.id, name: m.name, period: m.period as Span, aggregation: m.aggregation, periods: points.length,
    hasTarget: ends.min !== null || ends.max !== null, breakdownLatest: has(latest), breakdownBefore: has(before),
    builtFrom: canvas.filter((x) => x.id !== m.id && m.formula?.includes(`{${x.slug}}`)).map((x) => x.id),
  };
}

// The Metrics each Slot would be filled with from the canvas, as the list's defaults: one for each single Slot, the rest for a Slot that takes several.
function defaultsOf(entry: PickerEntry, canvas: number[], fit: EntryFit): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  // An entry about one Metric starts on the first canvas Metric it can run on.
  if (fit.ok && fit.metric !== undefined) return { ...Object.fromEntries(entry.slots.map((s) => [s.id, [] as number[]])), metric: [fit.metric] };
  let at = 0;
  for (const s of entry.slots) {
    const take = s.optional ? 0 : s.many ? Math.min(s.many.max, Math.max(0, canvas.length - at)) : 1;
    out[s.id] = canvas.slice(at, at + take);
    at += take;
  }
  return out;
}

// The names of the Metrics each Slot starts on, for wording an entry's question: only canvas Metrics the actor sees are in `names`.
function pickedOf(defaults: Record<string, number[]>, names: Map<number, string>): Picked {
  const one = (slot: string) => names.get(defaults[slot]?.[0] ?? -1);
  return { metric: one("metric"), first: one("first"), second: one("second"), held: (defaults.held ?? []).flatMap((i) => names.get(i) ?? []), metrics: (defaults.metrics ?? []).flatMap((i) => names.get(i) ?? []) };
}

// What fits the canvas comes first: a group with an entry that fits before one with none, and inside a group the entries that fit first;
// otherwise the order of the registry. Nothing is left out, a Method that does not fit stays, greyed, after them.
function ranked<G extends { entries: { fit: { ok: boolean } }[] }>(groups: G[]): G[] {
  const fits = (g: G) => g.entries.some((e) => e.fit.ok);
  return groups
    .map((g) => ({ ...g, entries: [...g.entries.filter((e) => e.fit.ok), ...g.entries.filter((e) => !e.fit.ok)] }))
    .map((g, i) => ({ g, i }))
    .sort((a, b) => Number(fits(b.g)) - Number(fits(a.g)) || a.i - b.i)
    .map((x) => x.g);
}

const needsText = (e: PickerEntry): string => {
  const n = metricsNeeded(e);
  return `${n} Metric${n === 1 ? "" : "s"} on the canvas`;
};

/** The method picker's list for the Metrics on this person's canvas (`canvasIds` as sent; the ones they may not see are left out as if absent). `explains` is the Metric to explain: the Slots that ask which Metric to explain start on it (one that is not on the canvas counts as none). */
export async function listPicker(actor: Actor, canvasIds: unknown, explains?: unknown): Promise<PickerList> {
  const read = readIds(canvasIds);
  const ids = read && explainedFirst(read, typeof explains === "number" ? explains : null);
  if (!ids) return { canvas: [], groups: [], notice: read === null && Array.isArray(canvasIds) && canvasIds.length > MOST_PICKED ? `Ziffr can look at ${MOST_PICKED} Metrics at a time: take some off the canvas.` : undefined };
  const { world, visible } = await load(actor, ids);
  const canvas = ids.flatMap((i) => visible.get(i) ?? []);
  const facts = canvas.map((m) => factOf(world, m, canvas));
  const on = canvas.map((m) => m.id);
  const names = new Map(canvas.map((m) => [m.id, m.name]));
  const today = format(new Date(), "yyyy-MM-dd");
  const shorts = new Map(fitList(facts).flatMap((f) => {
    const short = f.ok ? undefined : shortView(world, entryOf(f.entry)!, facts, visible, today);
    return short ? [[f.entry, short] as const] : [];
  }));
  // Asked only where something is short: the same rule as the paste page, so the button is shown to nobody it would turn away.
  const pasteable = new Set(shorts.size && actor.personId && !actor.key ? (await pasteMetrics(actor)).map((m) => m.id) : []);
  return {
    canvas: canvas.map((m) => ({ id: m.id, name: m.name, period: m.period as Span })),
    groups: ranked(groupsFor(facts)).map((g) => ({
      want: g.want,
      question: g.question,
      entries: g.entries.map((e): EntryView => {
        const defaults = defaultsOf(e, on, e.fit);
        const picked = pickedOf(defaults, names);
        const short = shorts.get(e.id);
        return {
        id: e.id, name: questionFor(e.id, picked, e.name), generic: e.name, sentence: sentenceFor(e.id, e.sentence, picked), technical: e.technical, ...textsOf(e), slots: e.slots, settings: e.settings,
        needs: needsText(e), fit: e.fit, defaults, recipeFile: recipeFileOf(e) !== null, widget: e.widget, ...(short ? { short: { ...short, mayAddEarlier: pasteable.has(short.metric.id) } } : {}),
        };
      }),
    })),
  };
}

/** Runs the entry a person picked, with the Metrics they chose for its Slots and its settings, through its Takeaway rule. Anything that is not theirs to use is refused in the same words. */
export async function runPicker(actor: Actor, request: unknown): Promise<PickerRun> {
  const r = (typeof request === "object" && request !== null && !Array.isArray(request) ? request : {}) as { entry?: unknown; slots?: unknown; settings?: unknown };
  const entry = entryOf(r.entry);
  if (!entry) return { ok: false, message: "Ziffr does not know that Method." };
  const slotIds = readSlotIds(entry, r.slots);
  if (!slotIds.ok) return slotIds;
  const settings = readSettings(entry, r.settings);
  if (!settings.ok) return settings;
  const all = Object.values(slotIds.ids).flat();
  const { world, visible } = await load(actor, all);
  if (all.some((i) => !visible.has(i))) return { ok: false, message: NOT_AVAILABLE };
  const slots = Object.fromEntries(Object.entries(slotIds.ids).map(([k, v]) => [k, v.map((i) => visible.get(i)!)]));
  const early = beside(entry, slots);
  if (early) return { ok: false, message: early };
  // The picker asks for the picture of the result (result-chart.ts): drawn from the very numbers of the sentence, of the Metrics the person chose and sees.
  const takeaway = runEntry(entry, { ...world, ctx: { ...world.ctx, charts: true } }, { slots, settings: settings.settings });
  const main = all.slice(0, entry.widget === "correlation" ? 2 : 1);
  return {
    ok: true,
    entry: entry.id,
    takeaway,
    recipe: recipeFileOf(entry, slots.held?.length, slots.drivers?.length),
    widget: entry.widget && settings.settings.ahead === undefined ? { template: entry.widget, metricIds: main, showTarget: entry.id === "reach-target" } : null,
  };
}

/** An example of one question, or why there is none. */
export type PickerExample = ({ ok: true; style: NumberStyle; yearStart: YearStart } & Example) | { ok: false; message: string };

const PERIODS: readonly Period[] = ["day", "week", "month", "quarter", "year"];

/**
 * The question run on Sample Data (method-picker-example.ts), counted at `span`. It takes no Metric id: no Metric or value of the
 * Workspace is read, only how the Workspace writes numbers, and nothing is saved.
 */
export async function exampleFor(actor: Actor, entryId: unknown, span: unknown): Promise<PickerExample> {
  const entry = entryOf(entryId);
  const at = PERIODS.find((p) => p === span);
  if (!entry || !at) return { ok: false, message: "Ziffr has no such example." };
  const style = await numberStyleOf(actor.workspaceId);
  return { ok: true, style, yearStart: JANUARY, ...exampleRun(entry.id, at, style) };
}

// A Metric set beside another must be counted at the same period: both are cut at the same date, period by period.
function beside(entry: PickerEntry, slots: Record<string, Metric[]>): string | null {
  const b = slots.beside?.[0];
  return entry.id === "after-date" && b && b.period !== slots.metric[0].period ? `${b.name} is not counted at the same period as ${slots.metric[0].name}, so it cannot be set beside it.` : null;
}

/** One analysis that is ready for a Metric: its question in the Metric's words, its Takeaway, and the widget that shows the same where there is one. */
export type ReadyCard = { entry: EntryId; title: string; takeaway: Takeaway; widget: { template: "forecast" | "correlation"; metricIds: number[]; showTarget: boolean } | null };

/** The single-Metric analyses worked out for a Metric's page, in the order shown: the forecast, the usual range, whether it will reach its Target Range (only where it has one), and when it changed. */
const READY: readonly EntryId[] = ["forecast", "usual", "reach-target", "change-point"];

/**
 * What Ziffr already knows about one Metric, for its page (GLOSSARY: Metric, Method, Takeaway; ticket #988). Each analysis runs on the
 * Metric's own values and is kept only when it answers: a refusal (too few values, a flat Metric, nothing to reach) is left out and
 * nothing is said about it. At most four analyses run for a page view, each under its own work bound (work-bound.ts: WORK_BUDGET), so a
 * page can never cost more than four bounded runs. The Metric must be one the actor sees, otherwise the list is empty, the same as
 * for a Metric that does not exist.
 */
export async function readyFor(actor: Actor, metricId: unknown): Promise<ReadyCard[]> {
  const ids = readIds([metricId]);
  if (!ids) return [];
  const { world, visible } = await load(actor, ids);
  const m = visible.get(ids[0]);
  if (!m) return [];
  const fact = factOf(world, m, [m]);
  const cards: ReadyCard[] = [];
  for (const id of READY) {
    const entry = entryOf(id)!;
    if (id === "reach-target" && !fact.hasTarget) continue;
    const takeaway = runEntry(entry, world, { slots: { metric: [m] }, settings: {} });
    if (takeaway.kind !== "answer") continue;
    cards.push({ entry: id, title: questionFor(id, { metric: m.name }, entry.name), takeaway, widget: entry.widget ? { template: entry.widget, metricIds: [m.id], showTarget: id === "reach-target" } : null });
  }
  return cards;
}
