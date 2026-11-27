// What a new Trial Workspace starts with, and the making of its example (spec 0021; GLOSSARY: Trial Workspace, Test
// Metric). A trial starts without any Metric or dashboard: nobody is shown something they did not ask for (#1292). The
// example, which is the Test Metric, a Workflow that asks its Owner for it each day and a small dashboard showing it,
// is made only when the Owner chooses it or reaches the Setup Guide's First Metric step. Nothing in it is made up: the
// first value it holds is the Owner's own. Made with the core's own operations, so it is no different from what
// someone made by hand.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { createDashboard, placeWidget } from "./dashboards";
import { createMetric, deleteMetric, type MetricEffects } from "./metrics";
import { recordVersion } from "./versions";
import { deleteWorkflow, saveWorkflow } from "./workflows";
import { setPreference } from "./questions";
import { chooseExploreOnMyOwn, startSetupGuide } from "./setup-guide";
import { trialEndsAt } from "./trials";
import type { PreferenceKind } from "./connectors/types";
import { openRows } from "./sealed-columns";
import { isTagWidget } from "./tag-widgets";
import { widgetMetricIds } from "./widget-metrics";
import type { Widget, WidgetSettings } from "./types";

/** The Test Metric (GLOSSARY: Test Metric): asked daily of the Owner, without history, answered by hand, so the
 * first value it records is the Owner's own. */
export const TEST_METRIC = {
  name: "Cups of coffee", description: "Cups of coffee you had today. Ziffr asks for it so you can see how asking works.",
  unit: "cups", format: "number", decimals: 0, period: "day", submissionRule: "overwrite", polarity: "higher", aggregation: "sum",
} as const;
/** The name of the example's dashboard, by which it is found again. */
export const EXAMPLE_DASHBOARD = "Your coffee";
/** The name of the Workflow that asks for the Test Metric. */
export const EXAMPLE_WORKFLOW = "Ask me each day";

// Making the Metric sends no first Prompt: the Owner asks for one with the Setup Guide's Ask me now, and the Workflow asks
// them from the next day on.
const quiet: MetricEffects = {
  recordCreated: async (metricId, by, message) => { await recordVersion("metric", metricId, by, { message }); },
  promptSubmitter: async () => {},
};

/** Prepares a new Trial Workspace for its Owner: the ways messages go and the Setup Guide's starting point. It makes
 * no Metric, Workflow or dashboard. */
export async function startTrialWorkspace(actor: Actor): Promise<void> {
  // Email is the team default for everything but Prompts, stored so the Connectors page shows it. Prompts have none: they
  // go by every way that reaches the person, so connecting Slack or Telegram adds it by itself (#614).
  for (const kind of ["question", "task", "update"] as PreferenceKind[]) await setPreference(actor, null, kind, "email");
  // A trial asks nothing about where to start: the Setup Guide's Starting point ticks by itself (spec 0052).
  await chooseExploreOnMyOwn(actor);
}

/** The Test Metric of a Workspace, or null when its example was not made (or was removed). */
export async function testMetricId(workspaceId: string): Promise<number | null> {
  const { data, error } = await db().from("workspaces").select("trial_test_metric_id").eq("id", workspaceId).maybeSingle();
  if (error) throw new Error("The Workspace could not be read.");
  return (data?.trial_test_metric_id as number | null | undefined) ?? null;
}

/** Whether the actor is the Owner of a trial that still runs: the only one who may have its example made. */
export async function isRunningTrialOwner(actor: Actor): Promise<boolean> {
  if (actor.key || actor.role !== "owner") return false;
  const ends = await trialEndsAt(actor.workspaceId);
  return Boolean(ends && ends.getTime() > Date.now());
}

/** The trial's example: its Test Metric and the dashboard showing it. */
export type TrialExample = { metricId: number; dashboardId: number };

// One making at a time per trial in this server, so a double press makes one example.
const making = new Map<string, Promise<TrialExample>>();

/** Makes the trial's example, or what is missing of it, and gives it: for the Owner of a running trial only. Calling it
 * again makes no second one. It sends nothing. */
export async function makeTrialExample(actor: Actor): Promise<TrialExample> {
  if (!(await isRunningTrialOwner(actor))) throw new Forbidden("Only the Owner of a running trial tries the example.");
  const key = `${actor.workspaceId} ${actor.personId}`;
  let job = making.get(key);
  if (!job) {
    job = build(actor).finally(() => making.delete(key));
    making.set(key, job);
  }
  return job;
}

async function build(actor: Actor): Promise<TrialExample> {
  const metricId = (await testMetricId(actor.workspaceId)) ?? (await makeTestMetric(actor));
  const dashboardId = (await ownExampleDashboard(actor, metricId)) ?? (await makeExampleDashboard(actor, metricId));
  // The Setup Guide's First Metric is the example's, unless the guide already tries another one.
  await startSetupGuide(actor);
  await db().from("setup_guides").update({ first_metric_id: metricId, updated_at: new Date().toISOString() }).eq("workspace_id", actor.workspaceId).is("first_metric_id", null);
  return { metricId, dashboardId };
}

async function makeTestMetric(actor: Actor): Promise<number> {
  const workflowId = await saveWorkflow(actor, null, EXAMPLE_WORKFLOW, {
    dueWorkingDays: 3,
    steps: [{ type: "remind", daysBefore: 1 }, { type: "check", changePct: 40, outsideTarget: true }, { type: "publish", lock: false }],
  }, { message: "Made with the trial's example" });
  // By hand only (no API), kept with the workspace by id so the guide finds it even after the Owner renames it.
  const { id } = await createMetric(actor, {
    ...TEST_METRIC, targetMin: null, targetMax: null,
    sources: ["web_form", "mail", "slack", "telegram"], submitters: [actor.personId], workflowId,
  }, quiet);
  // Claimed only while the trial has none, so two servers making it at once still leave one.
  const { data: claimed, error } = await db().from("workspaces").update({ trial_test_metric_id: id }).eq("id", actor.workspaceId).is("trial_test_metric_id", null).select("id");
  if (!error && claimed?.length) return id;
  await deleteMetric(actor, id, TEST_METRIC.name);
  await deleteWorkflow(actor, workflowId);
  const first = await testMetricId(actor.workspaceId);
  if (first === null) throw new Error("The example could not be made. Try again in a moment.");
  return first;
}

// The actor's own dashboard with the example's name that draws nothing but the Test Metric.
async function ownExampleDashboard(actor: Actor, metricId: number): Promise<number | null> {
  const { data } = await db().from("dashboards").select("id").eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).eq("name", EXAMPLE_DASHBOARD).order("id");
  for (const d of data ?? []) if (await drawsOnly(actor.workspaceId, d.id as number, metricId)) return d.id as number;
  return null;
}

/** Whether every widget of a dashboard draws the one Metric and nothing else (a dashboard without widgets does too). */
export async function drawsOnly(workspaceId: string, dashboardId: number, metricId: number): Promise<boolean> {
  const { data, error } = await db().from("widgets").select("*").eq("workspace_id", workspaceId).eq("dashboard_id", dashboardId);
  if (error) return false;
  const widgets = (await openRows("widgets", workspaceId, data)) as unknown as Widget[];
  return widgets.every((w) => {
    const drawn = widgetMetricIds(w.metric_ids ?? [], w.settings);
    return !isTagWidget(w) && drawn.length > 0 && drawn.every((id) => id === metricId);
  });
}

async function makeExampleDashboard(actor: Actor, metricId: number): Promise<number> {
  const dashboardId = await createDashboard(actor, EXAMPLE_DASHBOARD);
  const widgets: { template: "bars" | "number"; settings?: WidgetSettings; title: string }[] = [
    { template: "number", title: "Cups today" },
    { template: "bars", settings: { window: 14 }, title: "Cups per day" },
    { template: "bars", settings: { display: "week", window: 8 }, title: "Cups per week" },
  ];
  for (const w of widgets) {
    await placeWidget(actor, dashboardId, { type: "spec", template: w.template, metricIds: [metricId], settings: w.settings, title: w.title });
  }
  return dashboardId;
}
