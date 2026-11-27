// What a person sees of a trial's example, and what they do with it (spec 0021, #1292; GLOSSARY: Test Metric, Home
// dashboard): the start screen Home shows while there is nothing but an untouched example (or nothing at all), the line
// that says what the example's dashboard is, choosing the example and removing it. Visibility is the product: the start
// screen answers only which choices the viewer may use and counts of their own Setup Guide; the line names only a Metric
// the viewer's dashboard already draws; whether values were recorded is told only to the one who may remove it.
import { db } from "./db";
import { can, Forbidden, Refused, type Actor } from "./actor";
import { visibleMetricIds, type DashboardAccess } from "./access";
import { audit } from "./audit-log";
import { dashboardRole } from "./dashboards";
import { refuseInDemo } from "./demo";
import { chosenHomeId, setHomeDashboard } from "./home";
import { deleteMetric, MetricKept } from "./metrics";
import { openOne } from "./sealed-columns";
import { openFirstSteps, ownersFirstSteps } from "./first-steps";
import { FIRST_STEPS_PATH } from "./first-steps-screens";
import { setupLine } from "./setup-guide";
import { DEMO_WORKSPACE_ID } from "./team";
import { drawsOnly, EXAMPLE_DASHBOARD, EXAMPLE_WORKFLOW, isRunningTrialOwner, makeTrialExample, testMetricId } from "./trial-seed";
import { deleteWorkflow } from "./workflows";
import { getMetrics } from "./workspace-data";

/** The choices of "Where would you like to start?", each only when the viewer may use it. */
export type StartChoices = {
  /** Install a Pack: Owners and Admins. */
  pack: boolean;
  /** Try the example: the Owner of a running trial. */
  example: boolean;
  /** Where "Continue setting up" leads: an Owner's unfinished First Steps, or a Member's Setup Guide while its line is
   * shown. */
  setup: string | null;
  /** Someone else could share something with the viewer. */
  askColleague: boolean;
};

// Values, current or replaced: either means someone recorded something for the Metric. A count that cannot be read
// counts as values, so nothing is deleted or hidden on a guess.
async function hasValues(workspaceId: string, metricId: number): Promise<boolean> {
  const counts = await Promise.all((["observations", "observation_history"] as const).map((table) =>
    db().from(table).select("metric_id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("metric_id", metricId)));
  return counts.some((c) => c.error || c.count !== 0);
}

/** The start screen's choices for the viewer's Home, or null when Home is shown as always. It is shown only while the
 * viewer may create, has no dashboard but an untouched example (not chosen as their Home) and sees no other Metric, and
 * the example holds no value. Never in the demo. `dashboards` are those the viewer may open. */
export async function startChoices(actor: Actor, dashboards: DashboardAccess[]): Promise<StartChoices | null> {
  if (actor.workspaceId === DEMO_WORKSPACE_ID || !can(actor, "create")) return null;
  if (dashboards.some((d) => d.name !== EXAMPLE_DASHBOARD)) return null;
  const ws = actor.workspaceId;
  if (dashboards.length) {
    const chosen = await chosenHomeId(actor);
    if (dashboards.some((d) => d.id === chosen)) return null;
  }
  const test = await testMetricId(ws);
  for (const d of dashboards) if (test === null || !(await drawsOnly(ws, d.id, test))) return null;
  const metrics = await getMetrics(ws);
  const seen = await visibleMetricIds(ws, actor.personId, metrics);
  if ([...seen].some((id) => id !== test)) return null;
  if (test !== null && metrics.some((m) => m.id === test) && (seen.has(test) || dashboards.length)) {
    if (metrics.some((m) => m.id === test && m.archived_at) || (await hasValues(ws, test))) return null;
  }
  const [open, line, mayTry] = await Promise.all([openFirstSteps(actor), setupLine(actor), isRunningTrialOwner(actor)]);
  return {
    pack: actor.role === "owner" || actor.role === "admin",
    // The coffee example is not offered to an Owner whose Workspace First Steps made (spec 0067).
    example: mayTry && !(await ownersFirstSteps(actor)),
    setup: open ? `${FIRST_STEPS_PATH}?step=${open.next}` : line.shown ? "/setup" : null,
    askColleague: actor.role !== "owner",
  };
}

/** "Try the example": makes the trial's example (once) and makes its dashboard the Owner's Home. Returns the
 * dashboard's id. */
export async function chooseTrialExample(actor: Actor): Promise<number> {
  refuseInDemo(actor);
  const { dashboardId } = await makeTrialExample(actor);
  await setHomeDashboard(actor, dashboardId);
  return dashboardId;
}

/** What the line on the example's dashboard says: the Metric's name, and for who may remove it, whether it has values. */
export type ExampleNote = { metricName: string; remove: { hasValues: boolean } | null };

// The example drawn by a dashboard the actor may open, with who owns the two; null when the dashboard is not it.
async function exampleOn(actor: Actor, dashboardId: number) {
  const ws = actor.workspaceId;
  if (ws === DEMO_WORKSPACE_ID || !Number.isInteger(dashboardId)) return null;
  const { data: dashboard } = await db().from("dashboards").select("name, owner_id").eq("id", dashboardId).eq("workspace_id", ws).maybeSingle();
  if (dashboard?.name !== EXAMPLE_DASHBOARD) return null;
  const test = await testMetricId(ws);
  if (test === null || !(await dashboardRole(actor, dashboardId)) || !(await drawsOnly(ws, dashboardId, test))) return null;
  const row = (await db().from("metrics").select("id, name, owner_id, workflow_id").eq("id", test).eq("workspace_id", ws).maybeSingle()).data;
  const metric = await openOne("metrics", ws, row);
  if (!metric) return null;
  return {
    metricId: test, metricName: metric.name as string, workflowId: (metric.workflow_id as number | null) ?? null,
    ownsBoth: dashboard.owner_id === actor.personId && metric.owner_id === actor.personId,
  };
}

/** The line for a dashboard when it is the trial's example, or null. */
export async function exampleNote(actor: Actor, dashboardId: number): Promise<ExampleNote | null> {
  const found = await exampleOn(actor, dashboardId);
  if (!found) return null;
  return { metricName: found.metricName, remove: found.ownsBoth ? { hasValues: await hasValues(actor.workspaceId, found.metricId) } : null };
}

// A Snapshot stays readable by its own people and a View Link shows the dashboard to people outside: neither goes with
// one press.
async function assertNothingStands(workspaceId: string, dashboardId: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const [snapshots, links] = await Promise.all([
    db().from("dashboard_snapshots").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("dashboard_id", dashboardId),
    db().from("view_links").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("object_type", "dashboard").eq("object_id", dashboardId).is("revoked_at", null).gte("expires_at", today),
  ]);
  if (snapshots.error || links.error) throw new Error("The example could not be removed. Try again in a moment.");
  if (snapshots.count) throw new Refused("This dashboard has Snapshots, which stay readable, so it is not removed.");
  if (links.count) throw new Refused("A View Link that still works shows this dashboard. Revoke the link first.");
}

async function removeDashboard(actor: Actor, dashboardId: number): Promise<void> {
  const ws = actor.workspaceId;
  for (const table of ["shares", "access_requests", "view_links"] as const) {
    const { error } = await db().from(table).delete().eq("workspace_id", ws).eq("object_type", "dashboard").eq("object_id", dashboardId);
    if (error) throw new Error("The example could not be removed. Try again in a moment.");
  }
  const { data, error } = await db().from("dashboards").delete().eq("id", dashboardId).eq("workspace_id", ws).eq("owner_id", actor.personId).select("id");
  if (error || !data?.length) throw new Error("The example could not be removed. Try again in a moment.");
  await audit(actor, { kind: "dashboard.deleted", object: { type: "dashboard", id: dashboardId, name: EXAMPLE_DASHBOARD } });
}

// The example's own Workflow, once no Metric uses it any more; any other Workflow stays.
async function removeUnusedWorkflow(actor: Actor, workflowId: number): Promise<boolean> {
  const ws = actor.workspaceId;
  const { data: workflow } = await db().from("workflows").select("name, owner_id").eq("id", workflowId).eq("workspace_id", ws).maybeSingle();
  if (workflow?.name !== EXAMPLE_WORKFLOW || workflow.owner_id !== actor.personId) return false;
  const used = await db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("workflow_id", workflowId);
  if (used.error || used.count !== 0) return false;
  await deleteWorkflow(actor, workflowId);
  return true;
}

/** What removing the example came to, in words for the person. `metricDeleted` is false when the Test Metric stays. */
export type ExampleRemoved = { metricDeleted: boolean; words: string };

/** Removes the example, for the one who owns both its dashboard and its Metric: the dashboard, then the Metric when no
 * value was ever recorded for it and nothing else shows it, then the example's Workflow when no Metric uses it. A
 * Metric with values is never deleted here: its owner deletes it on its own page. */
export async function removeTrialExample(actor: Actor, dashboardId: number): Promise<ExampleRemoved> {
  if (actor.key) throw new Forbidden();
  refuseInDemo(actor);
  const found = await exampleOn(actor, dashboardId);
  if (!found?.ownsBoth) throw new Forbidden("Only the owner of the example removes it.");
  await assertNothingStands(actor.workspaceId, dashboardId);
  await removeDashboard(actor, dashboardId);
  const { metricId, metricName, workflowId } = found;
  const kept = (why: string): ExampleRemoved => ({ metricDeleted: false, words: `The dashboard is removed. ${metricName} is kept${why}` });
  // Read right before deleting, so a value that just arrived keeps the Metric.
  if (await hasValues(actor.workspaceId, metricId)) return kept(" with its values, and Ziffr still asks for it. Delete it on its page, in the ⋯ menu.");
  try {
    await deleteMetric(actor, metricId, metricName);
  } catch (e) {
    if (e instanceof MetricKept) return kept(`. ${e.message}`);
    throw e;
  }
  if (workflowId !== null) await removeUnusedWorkflow(actor, workflowId);
  return { metricDeleted: true, words: "The example is removed." };
}
