// Making a Total and changing what it adds up (GLOSSARY: Total; spec 0058, "Team totals", ticket #1225). A Total is made
// like every Metric, through createMetric; its list is changed only here, by someone at the screen who may change the
// Total, and never by a program. Adding a Metric needs the right to share it, as for any Derived Metric, and the Total's
// owner needs it too. While a Total is open, only its owner changes the list, saying they know who learns what: a
// number added or taken away can be read off the sum.
import { assertCan, Forbidden, Refused, type Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { audit } from "./audit-log";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { shareableBy } from "./derived-metrics";
import { createMetric, deleteMetric, editableMetric, metricEffects, type MetricEffects } from "./metrics";
import { periodStart } from "./periods";
import { sealedPatch } from "./sealed-columns";
import { partsProblem, TOTAL_MAX_PARTS } from "./total-rules";
import { recordVersion } from "./versions";
import { getMetrics } from "./workspace-data";
import { yearStartFor } from "./fiscal-year";
import type { Metric, Period, Polarity } from "./types";

/** A new Total as it is described, before it is checked. `parts` are the ids of the Metrics it adds up, `from` a day in
 * the first period they count in (left out: the first any of them has a value for, else the running one). Unit, number
 * format, period and Aggregation are the parts'. */
export type TotalInput = {
  name: string;
  description?: string;
  calculationNote?: string | null;
  parts: unknown;
  from?: string | null;
  targets?: string;
  targetMin?: number | null;
  targetMax?: number | null;
  polarity?: string;
  /** The decimals shown; left out, the most any part shows. */
  decimals?: number;
  /** The Metric Catalog entry it is made from, as for any Metric. */
  fromCatalogId?: number | null;
};

/** What is said where someone other than the owner would change an open Total, or its owner has not confirmed it. */
export const OPEN_OWNER_ONLY = "This Total is open to people who do not see every Metric it adds up, so only its owner changes what it adds up.";
/** What the owner of an open Total confirms before changing its list. */
export const OPEN_CONFIRM = "Confirm that the people who see this open Total will learn the changed sums, and through them a single Metric's numbers.";

const NOT_A_METRIC = "One of the Metrics you picked is not a Metric of this Workspace.";

// The database's own refusals (migration 20270205180000), in words for people.
const REFUSALS: Record<string, string> = {
  ZF470: "Only a Total has a list of Metrics.",
  ZF471: "That Metric cannot be added up here: a Total adds up Metrics that take values, with its own period, unit, number format and Aggregation.",
  ZF475: `A Total adds up at most ${TOTAL_MAX_PARTS} Metrics.`,
  ZF476: OPEN_OWNER_ONLY,
  "23505": "The Total adds that Metric up already.",
  "23514": "The last period cannot be before the first.",
};
const refusal = (error: { code?: string }, otherwise: string) => (error.code && REFUSALS[error.code] ? new Refused(REFUSALS[error.code]) : new Error(otherwise));

// A day sent by a browser, as the first day of its period.
async function periodOf(ws: string, period: Period, day: unknown): Promise<string> {
  const at = typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00`) : null;
  if (!at || Number.isNaN(at.getTime()) || at.getFullYear() < 1900 || at.getFullYear() > 2200) throw new Refused("Pick a day for the period.");
  return periodStart(at, period, await yearStartFor(ws, period));
}

/** The Metrics picked to be added up, each one the actor sees, may share and that is not Archived. One they do not see
 * is refused in the words of one that is not there. */
async function pickable(actor: Actor, all: Metric[], ids: number[]): Promise<Metric[]> {
  const ws = actor.workspaceId;
  const [seen, mine] = await Promise.all([visibleMetricIds(ws, actor.personId, all), shareableBy(ws, actor.personId, all)]);
  return ids.map((id) => {
    const m = all.find((x) => x.id === id);
    if (!m || !seen.has(id)) throw new Refused(NOT_A_METRIC);
    if (!mine.has(id)) throw new Refused(`${m.name} is not yours to share: you can only add up Metrics you own or edit, since a Total can show their numbers to others.`);
    if (m.archived_at) throw new Refused(`${m.name} is archived.`);
    return m;
  });
}

/** Makes a Total owned by the actor from Metrics they own or edit. Refused with a reason they can be told (`Refused`),
 * and nothing stays behind then. Not open: nobody learns a number they could not add up themselves. */
export async function createTotal(actor: Actor, input: TotalInput, effects: MetricEffects = metricEffects): Promise<{ id: number; slug: string; tagsLeftOut: string[] }> {
  assertCan(actor, "create");
  if (actor.key) throw new Forbidden();
  refuseInDemo(actor);
  const ws = actor.workspaceId;
  // From a browser: whole numbers, each once, and no more than a Total holds.
  const ids = Array.isArray(input.parts) ? [...new Set(input.parts.map(Number))] : [];
  if (!ids.every((id) => Number.isSafeInteger(id) && id > 0)) throw new Refused(NOT_A_METRIC);
  if (ids.length > TOTAL_MAX_PARTS) throw new Refused(`A Total adds up at most ${TOTAL_MAX_PARTS} Metrics.`);
  const parts = await pickable(actor, await getMetrics(ws), ids);
  const why = partsProblem(parts);
  if (why) throw new Refused(why);
  const first = parts[0];
  let from: string;
  if (input.from) from = await periodOf(ws, first.period, input.from);
  else {
    const { data, error } = await db().from("observations").select("period_start").eq("workspace_id", ws).in("metric_id", ids).order("period_start").limit(1);
    if (error) throw new Error("The Total could not be made.");
    from = (data?.[0]?.period_start as string | undefined) ?? periodStart(new Date(), first.period, await yearStartFor(ws, first.period));
  }
  const targets = input.targets === "parts" ? "parts" : "own";
  const name = String(input.name ?? "").trim().slice(0, 120);
  // Made with Aggregation none, so no default Retention condenses a Metric that holds no values; the parts' follows.
  const made = await createMetric(actor, {
    name, description: input.description, calculationNote: input.calculationNote, unit: first.unit, unitPosition: first.unit_position, format: first.format, decimals: input.decimals ?? Math.max(...parts.map((p) => p.decimals)), fromCatalogId: input.fromCatalogId,
    period: first.period, polarity: (input.polarity ?? first.polarity) as Polarity, aggregation: "none", attainmentMethod: first.attainment_method, sources: [],
    ...(targets === "own" ? { targetMin: input.targetMin, targetMax: input.targetMax } : {}),
  }, effects);
  const turned = await db().from("metrics").update({ formula: "{-}", total_targets: targets, aggregation: first.aggregation, sources: [], inputs_checked: true }).eq("id", made.id).eq("workspace_id", ws);
  const listed = turned.error ? turned : await db().from("total_parts").insert(ids.map((part) => ({ total_id: made.id, part_id: part, workspace_id: ws, first_period: from })));
  if (listed.error) {
    // It was made a moment ago and holds nothing, so no Metric that looks like a Total is left without its list.
    await deleteMetric(actor, made.id, name).catch(() => undefined);
    throw refusal(listed.error, "The Total could not be made.");
  }
  await recordVersion("metric", made.id, actor.personId, { message: "Made to add up other Metrics" });
  await audit(actor, { kind: "metric.total_changed", object: { type: "metric", id: made.id, name }, details: { change: "made" } });
  return { id: made.id, slug: made.slug, tagsLeftOut: made.tagsLeftOut };
}

/** The Total, when the actor may change it: its owner and its Editors, at the screen, never in the demo. */
async function changeable(actor: Actor, totalId: number) {
  refuseInDemo(actor);
  const m = await editableMetric(actor, totalId, "what it adds up");
  if (!m.total_targets) throw new Refused("Only a Total has a list of Metrics.");
  return m as { id: number; name: string; owner_id: string; period: Period; unit: string; format: Metric["format"]; aggregation: Metric["aggregation"]; total_targets: "own" | "parts"; total_opened_at: string | null };
}

// An open Total is changed by its owner only, who confirms it; the database asks the same under its lock.
function assertOpenRule(actor: Actor, total: { owner_id: string; total_opened_at: string | null }, confirmOpen: boolean) {
  if (!total.total_opened_at) return;
  if (total.owner_id !== actor.personId) throw new Refused(OPEN_OWNER_ONLY);
  if (!confirmOpen) throw new Refused(OPEN_CONFIRM);
}

type Window = { first: string | null; last: string | null };

async function changeList(actor: Actor, total: Awaited<ReturnType<typeof changeable>>, partId: number, change: "add" | "window" | "remove", window: Window, confirmOpen: boolean): Promise<void> {
  const { error } = await db().rpc("change_total_part", { ws: actor.workspaceId, total: total.id, part: partId, change, from_period: window.first, to_period: window.last, actor: actor.personId, confirmed_open: confirmOpen });
  if (error) throw refusal(error, "The change could not be saved.");
  // Neither says which Metric or how many: both are read by people who do not see every part.
  await recordVersion("metric", total.id, actor.personId, { message: "Changed which Metrics it adds up", always: true });
  await audit(actor, { kind: "metric.total_changed", object: { type: "metric", id: total.id, name: total.name }, details: { change: change === "window" ? "periods" : change === "add" ? "added" : "removed" } });
}

// A Metric may be counted (added, or counted for more periods) only by someone who may share it, into a Total whose
// owner may share it too, and only if it is counted as the Total is.
async function assertMayCount(actor: Actor, total: Awaited<ReturnType<typeof changeable>>, partId: number): Promise<void> {
  const all = await getMetrics(actor.workspaceId);
  const [part] = await pickable(actor, all, [partId]);
  const why = partsProblem([{ name: total.name, formula: null, period: total.period, unit: total.unit, format: total.format, aggregation: total.aggregation }, part]);
  if (why) throw new Refused(why);
  if (!(await shareableBy(actor.workspaceId, total.owner_id, all)).has(partId)) throw new Refused(`The Total's owner does not own or edit ${part.name}, so the Total would show no values. Make them its owner or Editor first.`);
}

/** Adds a Metric to a Total, counted from the period of the day `from`. */
export async function addTotalPart(actor: Actor, totalId: number, partId: number, from: string, confirmOpen = false): Promise<void> {
  const total = await changeable(actor, totalId);
  assertOpenRule(actor, total, confirmOpen);
  await assertMayCount(actor, total, partId);
  await changeList(actor, total, partId, "add", { first: await periodOf(actor.workspaceId, total.period, from), last: null }, confirmOpen);
}

/** The stored periods of a part the actor sees. One they do not see answers as one the Total does not add up. */
async function seenPart(actor: Actor, totalId: number, partId: number): Promise<{ first_period: string; last_period: string | null }> {
  const all = await getMetrics(actor.workspaceId);
  const { data } = Number.isInteger(partId) && (await visibleMetricIds(actor.workspaceId, actor.personId, all)).has(partId)
    ? await db().from("total_parts").select("first_period, last_period").eq("workspace_id", actor.workspaceId).eq("total_id", totalId).eq("part_id", partId).maybeSingle()
    : { data: null };
  if (!data) throw new Refused("That is not a Metric you can change in this Total.");
  return data as { first_period: string; last_period: string | null };
}

/** Sets the periods a part counts in: `first` the day of its first (left out: unchanged), `last` of its last, or null to
 * count it from then on. Ending it needs the right to change the Total; counting it in more periods, the right to add
 * it. */
export async function setTotalPartPeriods(actor: Actor, totalId: number, partId: number, periods: { first?: string | null; last: string | null }, confirmOpen = false): Promise<void> {
  const total = await changeable(actor, totalId);
  assertOpenRule(actor, total, confirmOpen);
  const now = await seenPart(actor, total.id, partId);
  const first = periods.first ? await periodOf(actor.workspaceId, total.period, periods.first) : now.first_period;
  const last = periods.last ? await periodOf(actor.workspaceId, total.period, periods.last) : null;
  if (last !== null && last < first) throw new Refused(REFUSALS["23514"]);
  const wider = first < now.first_period || (now.last_period !== null && (last === null || last > now.last_period));
  if (wider) await assertMayCount(actor, total, partId);
  await changeList(actor, total, partId, "window", { first, last }, confirmOpen);
}

/** Takes a part out of a Total altogether: past totals change. */
export async function removeTotalPart(actor: Actor, totalId: number, partId: number, confirmOpen = false): Promise<void> {
  const total = await changeable(actor, totalId);
  assertOpenRule(actor, total, confirmOpen);
  await seenPart(actor, total.id, partId);
  await changeList(actor, total, partId, "remove", { first: null, last: null }, confirmOpen);
}

/** Chooses where a Total's target comes from: its own Target Series and range, or its parts' targets added up (which
 * takes its own range away). */
export async function setTotalTargets(actor: Actor, totalId: number, targets: string, confirmOpen = false): Promise<void> {
  const total = await changeable(actor, totalId);
  if (targets !== "own" && targets !== "parts") throw new Refused("Pick the Total's own target, or its Metrics' targets added up.");
  if (targets === total.total_targets) return;
  assertOpenRule(actor, total, confirmOpen);
  const patch = await sealedPatch("metrics", actor.workspaceId, total.id, { total_targets: targets, ...(targets === "parts" ? { target_min: null, target_max: null } : {}) });
  let write = db().from("metrics").update(patch).eq("id", total.id).eq("workspace_id", actor.workspaceId);
  // One that was opened meanwhile is the owner's to change.
  if (total.owner_id !== actor.personId) write = write.is("total_opened_at", null);
  const { data, error } = await write.select("id");
  if (error || !data?.length) throw new Error("The change could not be saved.");
  await recordVersion("metric", total.id, actor.personId, { message: "Changed where its target comes from", always: true });
  await audit(actor, { kind: "metric.total_changed", object: { type: "metric", id: total.id, name: total.name }, details: { change: "targets" } });
}

/** Makes a Metric just made from a Workspace Export the Total the file says it is: its list as the file has it, closed.
 * For the import only, which acts as the new Workspace's Owner on Metrics of its own; the database checks that every
 * Metric of the list takes values and goes with the Total. */
export async function restoreTotal(actor: Actor, totalId: number, targets: "own" | "parts", parts: { id: number; first: string; last: string | null }[]): Promise<void> {
  assertCan(actor, "create");
  const m = await editableMetric(actor, totalId, "what it adds up");
  const patch = await sealedPatch("metrics", actor.workspaceId, m.id as number, { formula: "{-}", sources: [], inputs_checked: true, total_targets: targets, ...(targets === "parts" ? { target_min: null, target_max: null } : {}) });
  const turned = await db().from("metrics").update(patch).eq("id", totalId).eq("workspace_id", actor.workspaceId);
  const rows = parts.map((p) => ({ total_id: totalId, part_id: p.id, workspace_id: actor.workspaceId, first_period: p.first, last_period: p.last }));
  const listed = turned.error || !rows.length ? turned : await db().from("total_parts").insert(rows);
  if (listed.error) throw refusal(listed.error, "A Total could not be made.");
  await recordVersion("metric", totalId, actor.personId, { message: "Imported from a Workspace Export" });
}
