// How the method picker's list fits the Analysis Canvas (GLOSSARY: Analysis Canvas, Method; spec 0041, "Fit to the canvas"): for
// each entry, whether it can run on the Metrics now on the canvas, and if not, the reason in words ("needs 12 months of values;
// Revenue has 7"), never a silent hide. Pure: it reads only what is given, so it can say nothing about a Metric the person may not
// see (the caller gives it the Metrics the person sees, and only those). The reasons come from the same minimums as the Methods'
// suitability checks (suitability.ts), so the list and the Takeaway cannot disagree about "too little history".
import { commonPeriod, periodCountLabel } from "./correlation";
import { WANTS, ENTRIES, type EntryId, type PickerEntry, type WantId } from "./method-picker";
import type { Span } from "./periods";
import { minimumPeriods } from "./suitability";
import type { Aggregation } from "./types";

/** What the picker knows of one Metric on the canvas, and nothing more. */
export type CanvasFact = {
  id: number;
  name: string;
  period: Span;
  aggregation: Aggregation;
  /** Whole periods with a value. */
  periods: number;
  /** Whether the Metric has a Target Range that its Polarity reads as a Target. */
  hasTarget: boolean;
  /** Whether the latest period, and the one before it, have a Breakdown. */
  breakdownLatest: boolean;
  breakdownBefore: boolean;
  /** The slug of a Metric this one is calculated from, as `{slug}` names in its formula; used to refuse a pair one of which is built from the other. */
  builtFrom: number[];
};

/** Whether an entry can run on the canvas, and if not why. */
export type EntryFit = { entry: EntryId; ok: true; /** For an entry that looks at one Metric: the canvas Metric (by id) it can run on, the first that fits. */ metric?: number } | { entry: EntryId; ok: false; reason: string };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// The Metrics each entry would take from the canvas by default: one for each single Slot, and the rest for a Slot that takes several.
function filled(entry: PickerEntry, canvas: CanvasFact[]): CanvasFact[][] {
  let at = 0;
  return entry.slots.map((s) => {
    if (s.optional) return [];
    const take = s.many ? Math.min(s.many.max, Math.max(0, canvas.length - at)) : 1;
    const got = canvas.slice(at, at + take);
    at += take;
    return got;
  });
}

/** How many Metrics the entry needs on the canvas at the least. */
export function metricsNeeded(entry: PickerEntry): number {
  return entry.slots.reduce((n, s) => n + (s.optional ? 0 : (s.many?.min ?? 1)), 0);
}

// The reason an entry cannot run on these Metrics, or null: the checks in the order a person would fix them.
function whyNot(entry: PickerEntry, canvas: CanvasFact[]): string | null {
  if (canvas.length === 0) return "Drop a Metric on the canvas first.";
  // An entry about one Metric can run on any of the canvas Metrics: it is greyed only when none fits, with the first one's reason.
  if (looksAtOne(entry)) return canvas.some((m) => whyNotFor(entry, [m]) === null) ? null : whyNotFor(entry, [canvas[0]]);
  return whyNotFor(entry, canvas);
}

/** Whether the entry takes one Metric (besides an optional one set beside it). */
export function looksAtOne(entry: PickerEntry): boolean {
  return metricsNeeded(entry) === 1 && !entry.slots.some((s) => s.many);
}

function whyNotFor(entry: PickerEntry, canvas: CanvasFact[]): string | null {
  const need = metricsNeeded(entry);
  if (canvas.length < need) return `Needs ${need} Metrics on the canvas; there ${plural(canvas.length, "is", "are")} ${canvas.length}.`;
  const used = filled(entry, canvas).flat();
  return periodsReason(entry, used) ?? targetReason(entry, used) ?? breakdownReason(entry, used) ?? pairReason(entry, used);
}

// The Metrics counted at the longest period set the period of a comparison; the history they have in common is at most theirs.
function periodsReason(entry: PickerEntry, used: CanvasFact[]): string | null {
  if (!entry.checks) return null;
  const span = used.map((m) => m.period).reduce(commonPeriod);
  const held = entry.id === "partial" ? Math.max(1, used.length - 2) + 1 : 1;
  const least = minimumPeriods(entry.checks, { drivers: held, span });
  const short = used.filter((m) => m.period === span).sort((a, b) => a.periods - b.periods)[0];
  return short.periods < least ? `Needs at least ${periodCountLabel(span, least)} of values; ${short.name} has ${short.periods}.` : null;
}

function targetReason(entry: PickerEntry, used: CanvasFact[]): string | null {
  if (!entry.needs.includes("target-range")) return null;
  const without = used.find((m) => !m.hasTarget);
  return without ? `${without.name} has no Target Range, so there is nothing to reach.` : null;
}

function breakdownReason(entry: PickerEntry, used: CanvasFact[]): string | null {
  if (!entry.needs.includes("breakdown")) return null;
  const m = used[0];
  if (!m.breakdownLatest) return `${m.name} has no Breakdown for its latest period.`;
  if (entry.needs.includes("breakdown-before") && !m.breakdownBefore) return `${m.name} has no Breakdown for the period before its latest, so there is nothing to compare with.`;
  return null;
}

// Metrics of different periods are compared on the longest; one that cannot be combined (Aggregation none) cannot be, and a Metric calculated
// from another is never compared with it.
function pairReason(entry: PickerEntry, used: CanvasFact[]): string | null {
  if (used.length < 2 || entry.checks === "forecast") return null;
  const span = used.map((m) => m.period).reduce(commonPeriod);
  // A fit leaves out the drivers it cannot use and says so: only the Metric to explain stops it.
  const fits = entry.id === "moves" || entry.id === "needs";
  const stuck = used.find((m) => m.period !== span && m.aggregation === "none" && (!fits || m === used[0]));
  if (stuck) return `${stuck.name} has Aggregation none, so it cannot be compared with Metrics counted at another period.`;
  for (const a of fits ? [used[0]] : used) {
    const b = used.find((x) => x !== a && a.builtFrom.includes(x.id));
    if (b) return `${a.name} is calculated from ${b.name}, so the two are never compared.`;
  }
  return null;
}

/** Whether every entry can run on these canvas Metrics (in canvas order), with the reason where one cannot. */
export function fitList(canvas: CanvasFact[]): EntryFit[] {
  return ENTRIES.map((e) => {
    const why = whyNot(e, canvas);
    if (why !== null) return { entry: e.id, ok: false, reason: why };
    const metric = looksAtOne(e) ? canvas.find((m) => whyNotFor(e, [m]) === null)?.id : undefined;
    return metric === undefined ? { entry: e.id, ok: true } : { entry: e.id, ok: true, metric };
  });
}

/** The groups of the list, each with its entries and how they fit. */
export function groupsFor(canvas: CanvasFact[]): { want: WantId; question: string; entries: (PickerEntry & { fit: EntryFit })[] }[] {
  const fits = new Map(fitList(canvas).map((f) => [f.entry, f]));
  return WANTS.map((w) => ({ want: w.id, question: w.question, entries: ENTRIES.filter((e) => e.want === w.id).map((e) => ({ ...e, fit: fits.get(e.id)! })) }));
}
