// First Steps' clean slate through the core (spec 0067; GLOSSARY: First Steps, Metric, Metric Catalog, Dashboard): the
// Owner's first Metric, picked from the catalog or defined by name, unit, how often and Polarity, put on a dashboard named after
// the Workspace and kept as the guide's first Metric. It asks nobody: no Submitter, so no Token and no message. Nothing
// calculated is accepted. What the browser sends is untrusted and checked here. Only the Owner of a Workspace First
// Steps made may make one.
import { type Actor, Forbidden, Refused } from "./actor";
import { createDashboard, placeWidget } from "./dashboards";
import { db } from "./db";
import { ownersFirstSteps } from "./first-steps";
import { FIRST_METRIC_NAME_FIELD, OWN_PERIODS, OWN_POLARITIES, OWN_UNITS, SUGGESTED_PERIODS, type FirstMetricPick, type OwnUnit } from "./first-steps-screens";
import { createMetric, type MetricInput } from "./metrics";
import { metricCatalog } from "./page-data";
import { HIDDEN_CHARACTERS } from "./profile";
import { seenFirstMetric, startSetupGuide } from "./setup-guide";
import { trialEnded } from "./trials";
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

/** The pick from untrusted input: a catalog id, with how often where one was chosen, or a name, a unit, how often and which way
 * is good. */
export function checkFirstMetric(input: unknown): FirstMetricPick {
  const again = () => new FirstMetricRefused("Pick a suggestion or define your own.");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw again();
  const raw = input as Record<string, unknown>;
  const only = (...keys: string[]) => Object.keys(raw).every((k) => keys.includes(k));
  if (Object.hasOwn(raw, "catalogId")) {
    const id = raw.catalogId;
    if (!only("catalogId", "period") || typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) throw again();
    if (raw.period === undefined) return { catalogId: id };
    const chosen = SUGGESTED_PERIODS.find((p) => p === raw.period);
    if (!chosen) throw new FirstMetricRefused("Pick how often.");
    return { catalogId: id, period: chosen };
  }
  if (!only("name", "unit", "period", "polarity")) throw again();
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
  const polarity = OWN_POLARITIES.find((p) => p === raw.polarity);
  if (!polarity) throw new FirstMetricRefused("Pick which way is good.");
  return { name, unit, period, polarity };
}

// What createMetric gets for a pick. From the catalog, an entry's description of the number is taken and its target is
// not: a target is the Owner's own to set (an entry may suggest one that means nothing for them, such as a body weight).
// How often is the entry's, except that a monthly one is kept as chosen on the screen.
// Neither kind names Sources, Submitters or a Workflow, so every Source is open and nobody is asked.
async function inputFor(actor: Actor, pick: FirstMetricPick): Promise<MetricInput> {
  if (!("catalogId" in pick)) return { name: pick.name, period: pick.period, submissionRule: "overwrite", polarity: pick.polarity, ...OWN[pick.unit] };
  // The catalog as this Workspace has it, so another Workspace's entry and a calculated one are not there to pick.
  const entry = ((await metricCatalog(actor)) as unknown as CatalogMetric[]).find((c) => c.id === pick.catalogId);
  if (!entry) throw new FirstMetricRefused("That suggestion is not available. Pick another one.");
  return {
    name: entry.name, description: entry.description, calculationNote: entry.calculation_note, format: entry.format, decimals: entry.decimals, period: entry.period === "month" ? (pick.period ?? entry.period) : entry.period,
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

// One press at a time per Workspace, whichever server answers it: the guide's row is marked while the press runs, and
// only if nobody wrote the row since it was read, so one of two presses at once gets through. The mark is the guide's
// word for starting without a ready-made set, with the time it was made. Gives the way to take the mark off again,
// which puts back what the row said before and leaves a mark that another press has made since; null while another
// press holds it.
async function claim(workspaceId: string): Promise<(() => Promise<void>) | null> {
  const guide = () => db().from("setup_guides");
  const { data: was, error } = await guide().select("starting_point, updated_at").eq("workspace_id", workspaceId).single();
  if (error) throw new Error("Your metric could not be added.");
  if (was.starting_point === "scratch" && Date.now() - Date.parse(was.updated_at as string) < CLAIM_MS) return null;
  const mine = new Date().toISOString();
  const taken = await guide().update({ starting_point: "scratch", updated_at: mine }).eq("workspace_id", workspaceId).eq("updated_at", was.updated_at).select("workspace_id");
  if (taken.error) throw new Error("Your metric could not be added.");
  if (!taken.data.length) return null;
  return async () => {
    await guide().update({ starting_point: was.starting_point, updated_at: was.updated_at }).eq("workspace_id", workspaceId).eq("updated_at", mine);
  };
}

// An empty dashboard of the Owner's with that name which nobody was given: what a press left behind whose widget could
// not be placed. One that is shared or already shows something is left alone, because whoever a dashboard is shared with
// sees the Metrics on it.
async function unusedDashboard(actor: Actor, name: string): Promise<number | null> {
  const ws = actor.workspaceId;
  const named = await db().from("dashboards").select("id").eq("workspace_id", ws).eq("owner_id", actor.personId).eq("name", name).order("id");
  if (named.error) throw new Error("The dashboard could not be read.");
  const ids = named.data.map((d) => d.id as number);
  if (!ids.length) return null;
  const [shares, widgets] = await Promise.all([
    db().from("shares").select("object_id").eq("workspace_id", ws).eq("object_type", "dashboard").in("object_id", ids),
    db().from("widgets").select("dashboard_id").eq("workspace_id", ws).in("dashboard_id", ids),
  ]);
  if (shares.error || widgets.error) throw new Error("The dashboard could not be read.");
  const taken = new Set([...shares.data.map((s) => s.object_id as number), ...widgets.data.map((w) => w.dashboard_id as number)]);
  return ids.find((id) => !taken.has(id)) ?? null;
}

// The Metric on a dashboard of the Owner's: nothing when one of theirs shows it already, else on a new one named after
// the Workspace.
async function putOnDashboard(actor: Actor, metricId: number): Promise<void> {
  const ws = actor.workspaceId;
  const own = await db().from("dashboards").select("id").eq("workspace_id", ws).eq("owner_id", actor.personId);
  if (own.error) throw new Error("The dashboard could not be read.");
  if (own.data.length) {
    const shown = await db().from("widgets").select("id").eq("workspace_id", ws).in("dashboard_id", own.data.map((d) => d.id as number)).contains("metric_ids", [metricId]).limit(1);
    if (shown.error) throw new Error("The dashboard could not be read.");
    if (shown.data.length) return;
  }
  const name = await workspaceName(actor);
  const dashboardId = (await unusedDashboard(actor, name)) ?? (await createDashboard(actor, name));
  await placeWidget(actor, dashboardId, { type: "metric", id: metricId });
}

// Keeps a Metric just made as the guide's first. It leaves the row's time alone, which is the running press's mark.
async function keepAsFirst(workspaceId: string, metricId: number): Promise<void> {
  const { error } = await db().from("setup_guides").update({ first_metric_id: metricId }).eq("workspace_id", workspaceId);
  if (error) throw new Error("Your metric was added, but it could not be kept as your first one.");
}

/** The first Metric the Workspace's Owner already has, so that the screens offer no second one; null when there is none.
 * Refuses everyone but the Owner. */
export async function firstStepsMetric(actor: Actor): Promise<{ id: number; name: string } | null> {
  await ownersFirstSteps(actor);
  return chosen(actor);
}

/** Makes the Owner's first Metric from a pick, keeps it as the guide's first Metric and puts it on a dashboard named
 * after the Workspace. Nobody becomes a Submitter and nothing is sent. Pressed again, it makes nothing twice: `made`
 * is false, and the first Metric there already is gets a dashboard if it has none. A pick of null asks for that alone.
 * No other Metric is ever taken for the first one, and no dashboard that is shared or in use gets it. The Metric limits
 * of the Workspace and of a trial apply, and an ended trial adds nothing. */
export async function makeFirstMetric(actor: Actor, input: unknown): Promise<{ metricId: number; made: boolean }> {
  if (!(await ownersFirstSteps(actor))) throw new Forbidden("First Steps did not make this Workspace.");
  if (await trialEnded(actor.workspaceId)) throw new Forbidden("This trial has ended: nothing can be added.");
  const pick = input === null ? null : checkFirstMetric(input);
  await startSetupGuide(actor);
  const release = await claim(actor.workspaceId);
  if (!release) throw new FirstMetricRefused("Your metric is being added. Wait a moment, then try again.");
  try {
    // Read while holding the mark: a press that held it before may have finished meanwhile.
    const there = await chosen(actor);
    let metricId = there?.id;
    if (metricId === undefined) {
      if (!pick) throw new FirstMetricRefused("Pick a suggestion or define your own.");
      metricId = (await createMetric(actor, await inputFor(actor, pick))).id;
      // Kept at once, so that a press that stops from here on is finished by the next one.
      await keepAsFirst(actor.workspaceId, metricId);
    }
    await putOnDashboard(actor, metricId);
    return { metricId, made: !there };
  } finally {
    // Free to press again at once, whether it worked or not.
    await release();
  }
}
