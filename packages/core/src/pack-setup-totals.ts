// Totals in Set up (spec 0058 "Team totals", ticket #1226; GLOSSARY: Total, Pack, Repeat, Metric Catalog): an entry
// that adds up one entry of a Repeat becomes a Total over the Metrics made for every line, and a line added later may be
// counted in the Totals that Set up made, ticked by the person and only where they may change the Total.
// Security: the stored entry is a document read defensively. A Total is made and changed only through the operations
// used by hand (createTotal, addTotalPart), which check who may; nothing here opens one. The record of a Set up only
// says where to look: whether a Total is still there, who sees it, who may change it and whether it is open is asked of
// the Workspace as it is. Only Totals the person sees are named, and the number of its Metrics is never said.
import type { Actor } from "./actor";
import { yearStartFor } from "./fiscal-year";
import { periodLabel, periodStart } from "./periods";
import { createTotal } from "./total-changes";
import { readParts } from "./total-parts";
import { partsProblem, TOTAL_MAX_PARTS } from "./total-rules";
import type { EntryRow } from "./pack-setup-install";
import type { AddingTo, Offer } from "./pack-setup-adding";
import type { PlannedMetric } from "./pack-setup-build";
import type { Metric, Period, Polarity } from "./types";

/** What an entry says to be a Total: the entry of a Repeat it adds up, and where its target comes from. */
export type EntryTotal = { of: string; targets: "own" | "parts" };

/** An entry's Total as stored, or null for an ordinary entry. */
export function entryTotal(e: Pick<EntryRow, "total">): EntryTotal | null {
  const t = e.total as { of?: unknown; targets?: unknown } | null | undefined;
  return t && typeof t.of === "string" ? { of: t.of, targets: t.targets === "parts" ? "parts" : "own" } : null;
}

/** Whether a Metric made from the entry is computed, so it takes no values: no Source, Submitter or Workflow. */
export const isComputed = (e: Pick<EntryRow, "formula" | "total">) => Boolean(e.formula) || e.total !== null && e.total !== undefined;

/** The entries an entry is computed from, by key: a formula's inputs, or the entry a Total adds up. */
export const entryInputs = (e: Pick<EntryRow, "formula" | "total">, formulaInputs: (formula: string) => string[]) => {
  const total = entryTotal(e);
  return total ? [total.of] : e.formula ? formulaInputs(e.formula) : [];
};

/** The planned Metrics in the order they can be made: a Total after every Metric it adds up, and what is computed from a
 * Total after it. Each Total is given the Metrics it counts. */
export function orderTotals(metrics: PlannedMetric[], formulaInputs: (formula: string) => string[]): PlannedMetric[] {
  const totals = new Set(metrics.filter((m) => entryTotal(m.entry)).map((m) => m.entry.pack_key));
  for (const m of metrics) {
    const total = m.slug === undefined ? entryTotal(m.entry) : null;
    if (total) m.parts = metrics.filter((x) => x.entry.pack_key === total.of && x.line !== null).map((x) => x.plan);
  }
  const stage = (m: PlannedMetric) => (entryTotal(m.entry) ? 1 : m.entry.formula && formulaInputs(m.entry.formula).some((k) => totals.has(k)) ? 2 : 0);
  return [...metrics].sort((a, b) => stage(a) - stage(b));
}

/** Makes the Total a planned entry says, over the Metrics just made for it, as "Add up Metrics" does by hand. */
export function makeTotal(actor: Actor, planned: PlannedMetric, parts: number[]) {
  const e = planned.entry;
  const total = entryTotal(e)!;
  return createTotal(actor, {
    name: planned.name, description: e.description, parts, targets: total.targets, polarity: e.polarity as Polarity, decimals: e.decimals,
    targetMin: e.target_min, targetMax: e.target_max, fromCatalogId: e.id,
  });
}

/** What to say of a Metric someone will see whose sums they will not: a planned Total that counts a Metric they do not
 * see, or a Metric computed from such a Total. Null where its numbers are theirs like any other's. */
export function plannedSums(metrics: PlannedMetric[], metric: PlannedMetric, seen: ReadonlySet<number>): string | null {
  const hidden = (m: PlannedMetric) => (m.parts ?? []).some((x) => !seen.has(x));
  if (metric.parts) return hidden(metric) ? "no sums: they do not see every Metric it adds up" : null;
  const inputs = metric.entry.formula ? [...metric.entry.formula.matchAll(/\{([a-z0-9-]+)\}/g)].map((x) => x[1]) : [];
  return metrics.some((m) => inputs.includes(m.entry.pack_key) && hidden(m)) ? "no values: it is computed from a Total whose sums they do not see" : null;
}

/** A new Metric counted in a Total that is there: which Total, which planned Metric, from which period, and whether the
 * Total is open, which the person confirmed with the tick. */
export type TotalAddition = { id: number; name: string; part: number; from: string; open: boolean };

const day = (value: unknown): Date | null => {
  const at = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : null;
  return at && !Number.isNaN(at.getTime()) && at.getFullYear() >= 1900 && at.getFullYear() <= 2200 ? at : null;
};

/** What a new line's Metric would be in a Total's list, as the rules of a list read it. */
const asPart = (m: PlannedMetric) => ({ name: m.name, formula: m.entry.formula, period: m.entry.period as Period, unit: m.entry.unit, format: m.entry.format as Metric["format"], aggregation: m.entry.aggregation as Metric["aggregation"] });

type Say = { offer: (id: string, words: string, extra: Pick<Offer, "from" | "suggested">) => boolean; byHand: string[]; problems: string[] };
type Asked = { entries: ReadonlyMap<string, EntryRow>; metrics: PlannedMetric[]; ticked: ReadonlySet<string>; from: unknown };

/** Why this actor cannot add a new Metric to a Total, in words, or null. */
function cannotAdd(actor: Actor, to: AddingTo, total: Metric, part: PlannedMetric, counted: number): string | null {
  const name = total.name;
  const owns = total.owner_id === actor.personId;
  if (!owns && !to.edits.has(total.id)) return `The Total ${name} is not yours to change, so it does not count ${part.name}. Its owner can add it on the Total's page, once they own or edit ${part.name}.`;
  if (!owns && total.total!.open) return `The Total ${name} is open to people who do not see every Metric it adds up, so only its owner adds ${part.name}.`;
  if (!owns) return `The owner of the Total ${name} does not own or edit ${part.name}: make them its Editor, then add it on the Total's page.`;
  const why = partsProblem([{ ...total, formula: null }, asPart(part)]);
  if (why) return `${part.name} cannot be added to the Total ${name}: ${why}`;
  return counted >= TOTAL_MAX_PARTS ? `The Total ${name} adds up as many Metrics as a Total can, so ${part.name} is not added.` : null;
}

/** The Totals a new line's Metrics may be counted in, among those Set up made: each offered, from a first period shown
 * and changeable, only to its owner; the rest listed to do by hand. A Total that is open is offered unticked, saying who
 * learns what, and a tick given before it was opened does not carry over. */
export async function totalAdditions(actor: Actor, to: AddingTo, asked: Asked, say: Say): Promise<TotalAddition[]> {
  const found = to.made.flatMap((t) => {
    const entry = t.kind === "metric" && t.line === null ? asked.entries.get(t.key) : undefined;
    const total = entry ? entryTotal(entry) : null;
    const part = total ? asked.metrics.find((m) => m.entry.pack_key === total.of && m.line !== null) : undefined;
    const metric = part ? to.active.get(t.id) : undefined;
    return part && metric ? [{ id: t.id, metric, part }] : [];
  });
  const unseen = found.filter((f) => !to.seen.has(f.id)).length;
  if (unseen) say.byHand.push(`${unseen} Total${unseen === 1 ? "" : "s"} of this set that you cannot see ${unseen === 1 ? "is" : "are"} left as ${unseen === 1 ? "it is" : "they are"}.`);
  const seen = found.filter((f) => to.seen.has(f.id) && f.metric.total);
  if (!seen.length) return [];
  const lists = await readParts(actor.workspaceId);
  const out: TotalAddition[] = [];
  const dates = (asked.from && typeof asked.from === "object" ? asked.from : {}) as Record<string, unknown>;
  for (const { id, metric, part } of seen) {
    const open = metric.total!.open;
    const key = open ? `total:${id}:open` : `total:${id}`;
    const why = cannotAdd(actor, to, metric, part, lists[id]?.length ?? 0);
    if (why) { say.byHand.push(why); continue; }
    if (open && asked.ticked.has(`total:${id}`)) say.byHand.push(`The Total ${metric.name} was opened meanwhile, so nothing was added to it.`);
    const yearStart = await yearStartFor(actor.workspaceId, metric.period);
    const picked = Object.hasOwn(dates, key) ? day(dates[key]) : new Date();
    if (!picked) say.problems.push(`Pick the day of the first period the Total ${metric.name} counts ${part.name} in.`);
    const from = periodStart(picked ?? new Date(), metric.period, yearStart);
    const label = periodLabel(from, metric.period, yearStart);
    const words = open
      ? `Count ${part.name} in the Total ${metric.name} from ${label}. The Total is open: everyone who sees it will have this Metric's numbers inside the sums they see, also people who do not see the Metric.`
      : `Count ${part.name} in the Total ${metric.name} from ${label}. A period that counts it is shown only to people who also see this Metric.`;
    if (say.offer(key, words, { from, suggested: !open })) out.push({ id, name: metric.name, part: part.plan, from, open });
  }
  return out;
}
