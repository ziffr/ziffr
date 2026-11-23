// @ts-nocheck
// Making a Derived Metric (GLOSSARY: Derived Metric, Metric, Formula; ticket #619): a Metric computed by a formula from
// other Metrics, made in the app's new-Metric flow and by programs and the MCP Server. Like every Metric it is made
// through createMetric (Workspace Limit, trial cap, Audit Log); this module adds what only a Derived Metric needs.
// Who may use which input is decided here and nowhere else: the inputs are looked up among the Metrics the actor
// sees, so a Metric they may not see answers exactly as one that does not exist.
import { assertCan, Refused, type Actor } from "./actor";
import { db } from "./db";
import { getShares, visibleMetricIds } from "./access";
import { checkFormula, formulaInputs, FORMULA_MAX_LENGTH, type FormulaInput } from "./formula";
import { createMetric, deleteMetric, editableMetric, metricEffects, type MetricEffects } from "./metrics";
import { audit } from "./audit-log";
import { recordVersion } from "./versions";
import { getMetrics } from "./workspace-data";
import type { Metric, Period } from "./types";

const PERIODS: Period[] = ["day", "week", "month", "quarter", "year"];

/** A new Derived Metric as it is described, before it is checked. Left out: the period is the inputs' own, the unit
 * is the inputs' when they share one and the formula adds or subtracts (a difference of kilometres is kilometres),
 * the decimals are 2 where the formula divides and the inputs' most otherwise, and higher is better. */
export type DerivedMetricInput = {
  name: string;
  /** Like "({revenue} - {cost}) / {revenue} * 100" or "change({odometer}) / 7": the slugs of the Metrics it reads. */
  formula: string;
  description?: string;
  unit?: string;
  unitPosition?: string;
  format?: string;
  decimals?: number;
  period?: string;
  polarity?: string;
  targetMin?: number | null;
  targetMax?: number | null;
  attainmentMethod?: string | null;
};

/** What was made, and what was chosen for the person where they left a field out (in plain words, for the answer). */
export type DerivedMetricMade = { id: number; slug: string; name: string; period: Period; defaults: string[] };

/** The Metrics the actor may share, which is what lets a Derived Metric be calculated from them: the ones they own and
 * the ones they edit through a Share (directly or by Group). A Derived Metric is the actor's to share and shows its
 * inputs' values, so a Metric someone only sees (a view Share, a widget on a shared dashboard, a Stand-in's Token) is
 * not one: they could republish it wider than its owner allowed, and keep receiving it after the access ended. */
async function shareableBy(ws: string, person: string, all: Metric[]): Promise<Set<number>> {
  const edited = new Set((await getShares(ws)).filter((s) => s.object_type === "metric" && s.user_id === person && s.role === "editor").map((s) => s.object_id));
  return new Set(all.filter((m) => m.owner_id === person || edited.has(m.id)).map((m) => m.id));
}

/** The words for a formula's input the actor sees but may not share, or null. Said only of Metrics they see, so it
 * tells them nothing new; one they do not see is "not a Metric of this Workspace", as one that is not there. */
function viewOnly(formula: string, all: Metric[], seen: Set<number>, mayShare: Set<number>): string | null {
  for (const slug of formulaInputs(formula)) {
    const m = all.find((x) => x.slug === slug);
    if (m && seen.has(m.id) && !mayShare.has(m.id)) return `{${slug}} is not yours to share: you can only calculate from Metrics you own or edit, since a calculated Metric shows their values to whoever you share it with.`;
  }
  return null;
}

/** Makes a Derived Metric owned by the actor, only from Metrics the actor sees (Guests create nothing). The formula is
 * checked as everywhere it is written (checkFormula): read whole, every input one of the visible Metrics, no input a
 * Derived Metric itself (so no Metric can depend on itself, however far round), all inputs counted by one period and
 * the Metric's own. Refused for a reason the actor can be told: `Refused`. Nothing stays behind when it is refused. */
export async function createDerivedMetric(actor: Actor, input: DerivedMetricInput, effects: MetricEffects = metricEffects, origin: { accessKeyId?: number } = {}): Promise<DerivedMetricMade> {
  assertCan(actor, "create");
  const formula = typeof input.formula === "string" ? input.formula.trim() : "";
  if (!formula) throw new Refused("Write the formula, such as {revenue} / {orders}.");
  if (formula.length > FORMULA_MAX_LENGTH) throw new Refused(`The formula is longer than ${FORMULA_MAX_LENGTH} characters.`);
  if (input.period !== undefined && !PERIODS.includes(input.period as Period)) throw new Refused(`The period must be one of ${PERIODS.join(", ")}.`);
  // Only the Metrics the actor sees are inputs: one they may not see is "not a Metric of this Workspace", the same
  // words as for one that is not there, so a formula never tells them which Metrics exist.
  const all = await getMetrics(actor.workspaceId);
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, all);
  const mayShare = await shareableBy(actor.workspaceId, actor.personId, all);
  const inputs = all.filter((m) => mayShare.has(m.id));
  const named = formulaInputs(formula).map((s) => inputs.find((m) => m.slug === s)).filter((m): m is Metric => m !== undefined);
  const period = (input.period as Period | undefined) ?? named[0]?.period ?? "month";
  const why = viewOnly(formula, all, seen, mayShare) ?? checkFormula(formula, inputs.map((m): FormulaInput => m), { slug: "-", period });
  if (why) throw new Refused(why);

  const defaults: string[] = [];
  if (input.period === undefined) defaults.push(`Counted by ${period}, like the Metrics it is calculated from.`);
  // A sum or difference of Metrics with one unit has that unit; a ratio, a product or a mix has none unless given.
  const sameUnit = new Set(named.map((m) => `${m.unit_position} ${m.unit}`)).size === 1 && !/[*/]/.test(formula) ? named[0] : null;
  const decimals = input.decimals ?? (/\//.test(formula) ? 2 : Math.max(0, ...named.map((m) => m.decimals)));
  if (input.decimals === undefined) defaults.push(`Shown with ${decimals} decimal${decimals === 1 ? "" : "s"}.`);
  const unit = input.unit !== undefined ? { unit: input.unit, unitPosition: input.unitPosition }
    : input.format === undefined && sameUnit?.unit ? { unit: sameUnit.unit, unitPosition: sameUnit.unit_position }
    : null;
  if (input.unit === undefined && unit) defaults.push(`The unit is ${unit.unit}, as its inputs have.`);
  if (input.polarity === undefined) defaults.push("Higher is better.");

  // A Derived Metric takes no values: no Source, no Submitter, no Workflow. Aggregation none keeps a default Retention
  // from condensing what it does not hold; it combines into longer periods through its inputs anyway.
  const made = await createMetric(actor, {
    name: input.name, description: input.description, format: input.format, decimals, period, polarity: input.polarity, aggregation: "none",
    targetMin: input.targetMin, targetMax: input.targetMax, attainmentMethod: input.attainmentMethod, sources: [],
    ...(unit ?? {}),
  }, effects, origin);
  // Written after it exists, and checked once more against the Metrics as they are now: a Metric another person
  // deleted in between must not leave this one with a formula that reads nothing. Refused, it goes again (it was made
  // a moment ago and holds nothing), so no Metric that looks derived is left without its formula.
  const now = await getMetrics(actor.workspaceId);
  const self = now.find((m) => m.id === made.id);
  const stillWhy = self ? checkFormula(formula, now.filter((m) => mayShare.has(m.id)), self) : "it is gone";
  const { error } = stillWhy ? { error: null } : await db().from("metrics").update({ formula, sources: [], inputs_checked: true }).eq("id", made.id).eq("workspace_id", actor.workspaceId);
  if (stillWhy || error) {
    if (self) await deleteMetric(actor, made.id, self.name).catch(() => undefined);
    if (stillWhy) throw new Refused(stillWhy);
    throw new Error("The Metric could not be made.");
  }
  await recordVersion("metric", made.id, actor.personId, { message: "Calculated from other Metrics" });
  return { id: made.id, slug: made.slug, name: self!.name, period, defaults };
}

/** A Metric a new Derived Metric may be calculated from, as the new-Metric form lists it: only what the person needs to
 * pick it (never values, owners or Shares). */
export type FormulaChoice = { slug: string; name: string; period: Period; unit: string };

/** The Metrics the actor may share that can be an input (their own and those they edit): not Archived, not a Derived Metric itself (a formula reads Metrics
 * that take values), oldest first. Guests are given nothing, as they create nothing. */
export async function formulaChoices(actor: Actor): Promise<FormulaChoice[]> {
  assertCan(actor, "create");
  const all = await getMetrics(actor.workspaceId);
  const mayShare = await shareableBy(actor.workspaceId, actor.personId, all);
  return all.filter((m) => mayShare.has(m.id) && !m.formula && !m.archived_at).map((m) => ({ slug: m.slug, name: m.name, period: m.period, unit: m.unit }));
}

/** Changes the formula of a Derived Metric the actor may edit (its owner and Editors), with the checks of creating one:
 * only Metrics the actor sees, read whole, the Metric's own period, no Derived input, never itself. Refused with
 * `Refused`; a Metric that is not derived is not given a formula here. The Metric's history and the Audit Log say it. */
export async function setMetricFormula(actor: Actor, metricId: number, formula: string, origin: { accessKeyId?: number } = {}): Promise<void> {
  assertCan(actor, "create");
  const m = await editableMetric(actor, metricId, "its formula");
  if (!m.formula) throw new Refused("Only a Derived Metric has a formula.");
  const next = await checkedFormula(actor, m, formula);
  const { error } = await db().from("metrics").update({ formula: next, inputs_checked: true }).eq("id", m.id).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The formula could not be saved.");
  await recordVersion("metric", m.id, actor.personId, { message: "Changed its formula" });
  await audit(actor, { kind: "metric.details_changed", object: { type: "metric", id: m.id, name: m.name }, accessKeyId: Number.isInteger(origin.accessKeyId) ? origin.accessKeyId : null, details: { fields: ["formula"] } });
}

/** A formula as it may be written into the Derived Metric `m` by the actor, trimmed, or `Refused` with the reason: read
 * whole, the Metric's own period, never the Metric itself or a Derived Metric (so no cycle), and every input one the
 * actor sees and may share and one the Metric's owner may share too. Used when changing a formula and when restoring an
 * old version of the Metric, so an old formula cannot bring back what a change would be refused. */
export async function checkedFormula(actor: Actor, m: Pick<Metric, "id" | "slug" | "period" | "owner_id">, formula: unknown): Promise<string> {
  const next = typeof formula === "string" ? formula.trim() : "";
  if (!next) throw new Refused("Write the formula, such as {revenue} / {orders}.");
  const all = await getMetrics(actor.workspaceId);
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, all);
  const mayShare = await shareableBy(actor.workspaceId, actor.personId, all);
  // An Editor changes the formula too, but every input must be one its owner may share as well: the Derived Metric is
  // the owner's, and shows its inputs' values to whoever they share it with. One the owner may not share is refused
  // as one that is not there.
  const ownerMay = m.owner_id === actor.personId ? mayShare : await shareableBy(actor.workspaceId, m.owner_id, all);
  const why = viewOnly(next, all, seen, mayShare) ?? checkFormula(next, all.filter((x) => mayShare.has(x.id) && ownerMay.has(x.id) && x.id !== m.id).map((x): FormulaInput => x), { slug: m.slug, period: m.period });
  if (why) throw new Refused(why);
  return next;
}
