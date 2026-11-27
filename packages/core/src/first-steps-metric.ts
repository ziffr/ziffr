// First Steps' clean slate through the core (spec 0067; GLOSSARY: First Steps, Metric, Metric Catalog, Dashboard): the
// Owner's first Metric, picked from the catalog or defined by name, unit and how often, put on a dashboard named after
// the Workspace and kept as the guide's first Metric. It asks nobody: no Submitter, so no Token and no message. Nothing
// calculated is accepted. What the browser sends is untrusted and checked here. Only the Owner of a Workspace First
// Steps made may make one.
import { type Actor, Forbidden, Refused } from "./actor";
import { createDashboard, placeWidget } from "./dashboards";
import { db } from "./db";
import { ownersFirstSteps } from "./first-steps";
import { FIRST_METRIC_NAME_FIELD, OWN_PERIODS, OWN_UNITS, type FirstMetricPick, type OwnUnit } from "./first-steps-screens";
import { createMetric, type MetricInput } from "./metrics";
import { metricCatalog } from "./page-data";
import { HIDDEN_CHARACTERS } from "./profile";
import { seenFirstMetric, setSetupFirstMetric, startSetupGuide } from "./setup-guide";
import type { CatalogMetric } from "./types";
import { workspaceName } from "./workspace-settings";

/** A first Metric refused, in words for the person. */
export class FirstMetricRefused extends Refused {}

// A claim older than this is taken over: the press that made it stopped without saying so.
const CLAIM_MS = 60_000;

// How each unit of "Define your metric" is kept. A money Metric names no unit: it takes the Workspace's currency.
const OWN: Record<OwnUnit, Pick<MetricInput, "format" | "unit" | "unitPosition" | "decimals" | "aggregation">> = {
  number: { format: "number", unit: "", decimals: 0, aggregation: "sum" },
  money: { format: "currency", decimals: 0, aggregation: "sum" },
  percent: { format: "percent", unit: "%", unitPosition: "after", decimals: 1, aggregation: "average" },
  hours: { format: "number", unit: "h", unitPosition: "after", decimals: 1, aggregation: "sum" },
};

/** The pick from untrusted input: a catalog id alone, or a name, a unit and how often alone. */
export function checkFirstMetric(input: unknown): FirstMetricPick {
  const again = () => new FirstMetricRefused("Pick a suggestion or define your own.");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw again();
  const raw = input as Record<string, unknown>;
  const only = (...keys: string[]) => Object.keys(raw).every((k) => keys.includes(k));
  if (Object.hasOwn(raw, "catalogId")) {
    const id = raw.catalogId;
    if (!only("catalogId") || typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) throw again();
    return { catalogId: id };
  }
  if (!only("name", "unit", "period")) throw again();
  // The length is bounded before any work on the text.
  const long = () => new FirstMetricRefused(`Keep the name to ${FIRST_METRIC_NAME_FIELD} characters.`);
  if (typeof raw.name !== "string") throw new FirstMetricRefused("Give the metric a name.");
  if (raw.name.length > FIRST_METRIC_NAME_FIELD * 4) throw long();
  if (HIDDEN_CHARACTERS.test(raw.name)) throw new FirstMetricRefused("Give the metric a name without hidden characters.");
  const name = raw.name.trim().replace(/\s+/g, " ");
  if (!name) throw new FirstMetricRefused("Give the metric a name.");
  if (name.length > FIRST_METRIC_NAME_FIELD) throw long();
  const unit = OWN_UNITS.find((u) => u === raw.unit);
  if (!unit) throw new FirstMetricRefused("Pick a unit.");
  const period = OWN_PERIODS.find((p) => p === raw.period);
  if (!period) throw new FirstMetricRefused("Pick how often.");
  return { name, unit, period };
}

// What createMetric gets for a pick. From the catalog, an entry's description of the number is taken and its target is
// not: a target is the Owner's own to set (an entry may suggest one that means nothing for them, such as a body weight).
// Neither kind names Sources, Submitters or a Workflow, so every Source is open and nobody is asked.
async function inputFor(actor: Actor, pick: FirstMetricPick): Promise<MetricInput> {
  if (!("catalogId" in pick)) return { name: pick.name, period: pick.period, submissionRule: "overwrite", polarity: "higher", ...OWN[pick.unit] };
  // The catalog as this Workspace has it, so another Workspace's entry and a calculated one are not there to pick.
  const entry = ((await metricCatalog(actor)) as unknown as CatalogMetric[]).find((c) => c.id === pick.catalogId);
  if (!entry) throw new FirstMetricRefused("That suggestion is not available. Pick another one.");
  return {
    name: entry.name, description: entry.description, calculationNote: entry.calculation_note, format: entry.format, decimals: entry.decimals, period: entry.period,
    submissionRule: entry.submission_rule, polarity: entry.polarity, aggregation: entry.aggregation, fromCatalogId: entry.id,
    ...(entry.format === "currency" ? {} : { unit: entry.unit, unitPosition: entry.unit_position }),
  };
}

// The guide's first Metric, when there is one to see.
async function chosen(actor: Actor): Promise<{ id: number; name: string } | null> {
  const { data, error } = await db().from("setup_guides").select("first_metric_id").eq("workspace_id", actor.workspaceId).maybeSingle();
  if (error) throw new Error("First Steps could not be read.");
  return seenFirstMetric(actor, (data?.first_metric_id as number | null | undefined) ?? null);
}

// The Owner's oldest Metric that takes values: what a press that stopped halfway left behind.
async function leftBehind(actor: Actor): Promise<number | null> {
  const { data, error } = await db().from("metrics").select("id").eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId)
    .is("archived_at", null).is("formula", null).is("total_targets", null).order("id").limit(1);
  if (error) throw new Error("First Steps could not be read.");
  return (data[0]?.id as number | undefined) ?? null;
}

// One press at a time per Workspace, whichever server answers it: the guide's row is marked while the Metric is made,
// in one statement, which only one of two presses at once gets through. The mark is the guide's word for starting
// without a ready-made set.
async function claim(workspaceId: string): Promise<boolean> {
  const take = () => db().from("setup_guides").update({ starting_point: "scratch", updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId);
  const ways = [
    () => take().is("starting_point", null),
    () => take().neq("starting_point", "scratch"),
    () => take().lt("updated_at", new Date(Date.now() - CLAIM_MS).toISOString()),
  ];
  for (const way of ways) {
    const { data, error } = await way().select("workspace_id");
    if (error) throw new Error("Your metric could not be added.");
    if (data.length) return true;
  }
  return false;
}

// The Metric on a dashboard of the Owner's, named after the Workspace; nothing when a dashboard of theirs shows it.
async function putOnDashboard(actor: Actor, metricId: number): Promise<void> {
  const ws = actor.workspaceId;
  const shown = await db().from("widgets").select("id").eq("workspace_id", ws).eq("owner_id", actor.personId).not("dashboard_id", "is", null).contains("metric_ids", [metricId]).limit(1);
  if (shown.error) throw new Error("The dashboard could not be read.");
  if (shown.data.length) return;
  const name = await workspaceName(actor);
  // A dashboard made a moment before its widget failed is used again.
  const named = await db().from("dashboards").select("id").eq("workspace_id", ws).eq("owner_id", actor.personId).eq("name", name).order("id").limit(1);
  if (named.error) throw new Error("The dashboard could not be read.");
  const dashboardId = (named.data[0]?.id as number | undefined) ?? (await createDashboard(actor, name));
  await placeWidget(actor, dashboardId, { type: "metric", id: metricId });
}

/** The first Metric the Workspace's Owner already has, so that the screens offer no second one; null when there is none.
 * Refuses everyone but the Owner. */
export async function firstStepsMetric(actor: Actor): Promise<{ id: number; name: string } | null> {
  await ownersFirstSteps(actor);
  return chosen(actor);
}

/** Makes the Owner's first Metric from a pick, puts it on a dashboard named after the Workspace and keeps it as the
 * guide's first Metric. Nobody becomes a Submitter and nothing is sent. Pressed again, it makes nothing twice: `made`
 * is false and the Metric is the one there already is. The Metric limits of the Workspace and of a trial apply. */
export async function makeFirstMetric(actor: Actor, input: unknown): Promise<{ metricId: number; made: boolean }> {
  if (!(await ownersFirstSteps(actor))) throw new Forbidden("First Steps did not make this Workspace.");
  const pick = checkFirstMetric(input);
  const before = await chosen(actor);
  if (before) return { metricId: before.id, made: false };
  await startSetupGuide(actor);
  if (!(await claim(actor.workspaceId))) throw new FirstMetricRefused("Your metric is being added. Wait a moment, then try again.");
  try {
    // Read again: the press that held the claim before may have finished meanwhile.
    const done = await chosen(actor);
    if (done) return { metricId: done.id, made: false };
    const kept = await leftBehind(actor);
    const metricId = kept ?? (await createMetric(actor, await inputFor(actor, pick))).id;
    await putOnDashboard(actor, metricId);
    // Set last: once it is there, everything before it is.
    await setSetupFirstMetric(actor, metricId);
    return { metricId, made: kept === null };
  } finally {
    // Free to press again at once, whether it worked or not.
    await db().from("setup_guides").update({ starting_point: null }).eq("workspace_id", actor.workspaceId);
  }
}
