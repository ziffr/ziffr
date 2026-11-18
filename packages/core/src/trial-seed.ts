// What a new Trial Workspace starts with (spec 0021, GLOSSARY: Trial Workspace): its starting Metrics with history up
// to today, a Workflow that asks its Owner, Target Series and a dashboard that shows every period and aggregation.
// Made with the core's own operations where a person could do the same, so a trial is no different from a workspace
// someone filled by hand. The history is written in one go as Imports, which is what a Feed's past values are.
import { db } from "./db";
import type { Actor } from "./actor";
import { createDashboardFromTemplate } from "./dashboard-templates";
import { placeWidget } from "./dashboards";
import { createMetric, saveSeriesRows, type MetricEffects } from "./metrics";
import { recordVersion } from "./versions";
import { saveWorkflow } from "./workflows";
import { setPreference } from "./questions";
import type { PreferenceKind } from "./connectors/types";
import { yearStartFor } from "./fiscal-year";
import { STARTING_METRICS, startingTargets, startingValues } from "./trial-starting-values";
import type { WidgetSettings } from "./types";

// Making the Metrics sends no first Prompt: a new trial's Owner must not get thirteen messages at once. They ask for
// a Prompt with Ask me now, and the Workflow asks them from the next period on.
const quiet: MetricEffects = {
  recordCreated: async (metricId, by, message) => { await recordVersion("metric", metricId, by, { message }); },
  promptSubmitter: async () => {},
};

/** Fills a new Trial Workspace for its Owner. Returns the starting Metrics' ids by slug and the dashboard's id. */
export async function seedTrialWorkspace(actor: Actor, now: Date = new Date(), seed = 1): Promise<{ metrics: Record<string, number>; dashboardId: number }> {
  const workflowId = await saveWorkflow(actor, null, "Ask me each period", {
    dueWorkingDays: 3,
    steps: [{ type: "remind", daysBefore: 1 }, { type: "check", changePct: 40, outsideTarget: true }, { type: "publish", lock: false }],
  }, { message: "Made with the trial" });

  // Email is the team default, stored so the Connectors page shows it: the Owner gets requests where they signed in,
  // and picks Slack or Telegram once they connect one.
  for (const kind of ["question", "task", "reminder", "update"] as PreferenceKind[]) await setPreference(actor, null, kind, "email");

  const ids: Record<string, number> = {};
  const slugs: Record<string, string> = {};
  for (const m of STARTING_METRICS) {
    const derived = Boolean(m.formula);
    const { id, slug } = await createMetric(actor, {
      name: m.name, description: m.description, unit: m.unit, format: m.format, decimals: m.decimals, period: m.period,
      submissionRule: m.submissionRule, polarity: m.polarity, aggregation: m.aggregation,
      targetMin: m.targetMin ?? null, targetMax: m.targetMax ?? null,
      // A Derived Metric takes no values; every other one takes them from every Source, so each Connector can be tried.
      sources: derived ? [] : ["web_form", "mail", "slack", "telegram", "api"],
      submitters: derived ? [] : [actor.personId],
      workflowId: derived ? null : workflowId,
    }, quiet);
    ids[m.slug] = id;
    slugs[m.slug] = slug;
  }
  // The core has no operation for a formula yet (the demo's are seeded in SQL). A formula names Metrics by slug, so
  // the starting ones' keys become the slugs createMetric gave them.
  for (const m of STARTING_METRICS.filter((x) => x.formula)) {
    const formula = m.formula!.replace(/\{([a-z0-9-]+)\}/g, (_, key: string) => {
      if (!slugs[key]) throw new Error(`No starting Metric ${key}.`);
      return `{${slugs[key]}}`;
    });
    await db().from("metrics").update({ formula }).eq("id", ids[m.slug]).eq("workspace_id", actor.workspaceId);
  }

  const today = now.toISOString().slice(0, 10);
  const yearStart = await yearStartFor(actor.workspaceId, "quarter");
  const values = startingValues(today, yearStart, seed);
  const rows = values.map((v) => ({
    metric_id: ids[v.slug], period_start: v.period, value: v.value, submitter_id: actor.personId,
    // Made-up values, so never "by the web form": the Try it page ticks a way off only once a real value came by it.
    source: "api", imported: v.imported, workspace_id: actor.workspaceId,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const part = values.slice(i, i + 500);
    const { data, error } = await db().from("observations").insert(rows.slice(i, i + 500)).select("id, metric_id, period_start");
    if (error || !data) throw new Error("The trial's starting values could not be written.");
    const breakdown = part.flatMap((v, j) => (v.breakdown ?? []).map((b, position) => ({ observation_id: data[j].id, label: b.label, value: b.value, position })));
    if (breakdown.length) await db().from("breakdown_rows").insert(breakdown);
  }
  for (const t of startingTargets(today, yearStart)) await saveSeriesRows(actor, ids[t.slug], "target", t.rows, "Budget");

  const dashboardId = await createDashboardFromTemplate(actor, {
    template: "overview", name: "Your trial at a glance",
    fills: [[ids.revenue], [ids["sign-ups"]], [ids.nps], [ids.margin]],
  });
  // Each aggregation shown over a longer period than its own, so rolling up and "to date" are on the dashboard.
  const widgets: { template: "bars" | "line" | "number" | "share"; metric: string; settings?: WidgetSettings; title: string }[] = [
    { template: "bars", metric: "sign-ups", settings: { display: "month", window: 6 }, title: "Sign-ups by month (sum)" },
    { template: "line", metric: "nps", settings: { display: "quarter", window: 4 }, title: "NPS by quarter (average)" },
    { template: "bars", metric: "revenue", settings: { display: "quarter", window: 6 }, title: "Revenue by quarter, to date" },
    { template: "line", metric: "cash-balance", settings: { display: "quarter", window: 6 }, title: "Cash balance by quarter (last value)" },
    { template: "number", metric: "average-order-value", title: "Average order value (derived)" },
    { template: "bars", metric: "new-customers", settings: { display: "year", window: 3 }, title: "New customers by year" },
    { template: "bars", metric: "return-rate", title: "Return rate (not combined)" },
    { template: "bars", metric: "emissions", title: "CO₂ emissions per year" },
    { template: "line", metric: "delivery-time", title: "Delivery time, with a missing week" },
    { template: "share", metric: "revenue", title: "Revenue by country" },
  ];
  for (const w of widgets) {
    await placeWidget(actor, dashboardId, { type: "spec", template: w.template, metricIds: [ids[w.metric]], settings: w.settings, title: w.title });
  }
  return { metrics: ids, dashboardId };
}
