// What a new Trial Workspace starts with (spec 0021, ticket 263; GLOSSARY: Trial Workspace, Test Metric): the Test
// Metric the Trial Guide asks for, a Workflow that asks its Owner for it each day, and a small dashboard showing it.
// Nothing made up: the first value the trial holds is the Owner's own. Made with the core's own operations, so a
// trial is no different from a workspace someone filled by hand.
import { db } from "./db";
import type { Actor } from "./actor";
import { createDashboard, placeWidget } from "./dashboards";
import { createMetric, type MetricEffects } from "./metrics";
import { recordVersion } from "./versions";
import { saveWorkflow } from "./workflows";
import { setPreference } from "./questions";
import { chooseExploreOnMyOwn } from "./setup-guide";
import type { PreferenceKind } from "./connectors/types";
import type { WidgetSettings } from "./types";

/** The Test Metric (GLOSSARY: Test Metric): asked daily of the Owner, without history, answered by hand. The Trial
 * Guide asks for it, so the first value a new trial records is the Owner's own. */
export const TEST_METRIC = {
  name: "Cups of coffee", description: "Cups of coffee you had today. Ziffr asks for it so you can see how asking works.",
  unit: "cups", format: "number", decimals: 0, period: "day", submissionRule: "overwrite", polarity: "higher", aggregation: "sum",
} as const;

// Making the Metric sends no first Prompt: the Owner asks for one with the guide's Ask me now, and the Workflow asks
// them from the next day on.
const quiet: MetricEffects = {
  recordCreated: async (metricId, by, message) => { await recordVersion("metric", metricId, by, { message }); },
  promptSubmitter: async () => {},
};

/** Fills a new Trial Workspace for its Owner. Returns the Test Metric's, the Workflow's and the dashboard's ids. */
export async function seedTrialWorkspace(actor: Actor): Promise<{ metricId: number; workflowId: number; dashboardId: number }> {
  const workflowId = await saveWorkflow(actor, null, "Ask me each day", {
    dueWorkingDays: 3,
    steps: [{ type: "remind", daysBefore: 1 }, { type: "check", changePct: 40, outsideTarget: true }, { type: "publish", lock: false }],
  }, { message: "Made with the trial" });

  // Email is the team default for everything but Prompts, stored so the Connectors page shows it. Prompts have none: they
  // go by every way that reaches the person, so connecting Slack or Telegram adds it by itself (#614).
  for (const kind of ["question", "task", "update"] as PreferenceKind[]) await setPreference(actor, null, kind, "email");

  // By hand only (no API), kept with the workspace by id so the guide finds it even after the Owner renames it.
  const { id: metricId } = await createMetric(actor, {
    ...TEST_METRIC, targetMin: null, targetMax: null,
    sources: ["web_form", "mail", "slack", "telegram"], submitters: [actor.personId], workflowId,
  }, quiet);
  await db().from("workspaces").update({ trial_test_metric_id: metricId, trial_guide_step: "welcome" }).eq("id", actor.workspaceId);

  const dashboardId = await createDashboard(actor, "Your coffee");
  const widgets: { template: "bars" | "number"; settings?: WidgetSettings; title: string }[] = [
    { template: "number", title: "Cups today" },
    { template: "bars", settings: { window: 14 }, title: "Cups per day" },
    { template: "bars", settings: { display: "week", window: 8 }, title: "Cups per week" },
  ];
  for (const w of widgets) {
    await placeWidget(actor, dashboardId, { type: "spec", template: w.template, metricIds: [metricId], settings: w.settings, title: w.title });
  }
  // A trial starts from its Test Metric, which is the Setup Guide's starting point (spec 0052): it ticks the step by itself.
  await chooseExploreOnMyOwn(actor);
  return { metricId, workflowId, dashboardId };
}
