// The demo walk's database side (apps/web/src/app/demo-read-only.db.test.ts, #271): the web app's tests may not query
// the database themselves (.github/scripts/app-db-access.mjs), so the ids the walk calls the server actions with and
// the fingerprint of the demo it compares are read here. Tests only.
import { createHash } from "node:crypto";
import { db } from "../db";
import { seedDemoSnapshots } from "../demo-snapshots";
import { DEMO_WORKSPACE_ID } from "../team";

/** One row per demo row of every table with a workspace, and the demo's people: changed by anything at all. */
export async function demoFingerprint(): Promise<Record<string, string>> {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } });
  const spec = (await res.json()) as { definitions: Record<string, { properties?: Record<string, unknown> }> };
  const tables = Object.entries(spec.definitions).filter(([, d]) => d.properties && "workspace_id" in d.properties).map(([t]) => t).sort();
  const out: Record<string, string> = {};
  for (const t of tables) {
    const { data, error } = await db().from(t).select("*").eq("workspace_id", DEMO_WORKSPACE_ID);
    if (error) continue; // A view that cannot be filtered so; its tables are counted on their own.
    out[t] = createHash("sha256").update(JSON.stringify([...(data ?? [])].map((r) => JSON.stringify(r)).sort())).digest("hex");
  }
  const { data: people } = await db().from("profiles").select("*").in("id", ["sara", "ben", "anna"]);
  out.profiles = createHash("sha256").update(JSON.stringify(people)).digest("hex");
  const { count } = await db().from("profiles").select("id", { count: "exact", head: true });
  out["profiles (count)"] = String(count);
  const { count: ws } = await db().from("workspaces").select("id", { count: "exact", head: true });
  out["workspaces (count)"] = String(ws);
  return out;
}

/** What the walk needs from the demo's seed, or a clear failure when the seed lacks it. */
function must<T>(data: T | null | undefined): T {
  if (data === null || data === undefined) throw new Error("The demo seed lacks what the walk needs.");
  return data;
}

/** The demo's rows the walk calls each server action with, as Sara, its Owner. */
export async function demoWalkIds(): Promise<Record<string, unknown>> {
  const D = DEMO_WORKSPACE_ID;
  const metric = must((await db().from("metrics").select("id, name").eq("workspace_id", D).eq("owner_id", "sara").is("formula", null).order("id").limit(1).single()).data);
  const dashboard = must((await db().from("dashboards").select("id").eq("workspace_id", D).eq("owner_id", "sara").order("id").limit(1).single()).data);
  const otherDashboard = await db().from("dashboards").select("id").eq("workspace_id", D).neq("owner_id", "sara").order("id").limit(1).maybeSingle();
  const widget = must((await db().from("widgets").select("id").eq("workspace_id", D).eq("dashboard_id", dashboard.id).order("id").limit(1).single()).data);
  const deck = must((await db().from("decks").select("id").eq("workspace_id", D).order("id").limit(1).single()).data);
  const template = await db().from("team_templates").select("id").eq("workspace_id", D).order("id").limit(1).maybeSingle();
  const savedWidget = await db().from("widgets").select("id").eq("workspace_id", D).is("dashboard_id", null).order("id").limit(1).maybeSingle();
  const group = await db().from("groups").select("id").eq("workspace_id", D).eq("everyone", false).order("id").limit(1).maybeSingle();
  const themes = (await db().from("themes").select("id, tokens, slides, is_default").eq("workspace_id", D).order("id")).data ?? [];
  const workflow = must((await db().from("workflows").select("id, config").eq("workspace_id", D).order("id").limit(1).single()).data);
  // The SQL seed makes no Snapshots (the nightly job's core seed does): make them as it would, if there are none.
  const live = await db().from("dashboard_snapshots").select("id", { count: "exact", head: true }).eq("workspace_id", D).is("deleted_at", null);
  if (!live.count) await seedDemoSnapshots();
  const snapshot = await db().from("dashboard_snapshots").select("id, dashboard_id").eq("workspace_id", D).is("deleted_at", null).order("id").limit(1).maybeSingle();
  const action = await db().from("actions").select("id").eq("workspace_id", D).eq("kind", "question").order("id").limit(1).maybeSingle();
  const task = await db().from("actions").select("id").eq("workspace_id", D).eq("kind", "task").eq("assignee_id", "sara").eq("status", "open").order("id").limit(1).maybeSingle();
  const approval = await db().from("actions").select("id").eq("workspace_id", D).eq("purpose", "approval").order("id").limit(1).maybeSingle();
  const message = await db().from("thread_messages").select("id").eq("workspace_id", D).order("id").limit(1).maybeSingle();
  const token = await db().from("tokens").select("code").eq("workspace_id", D).order("id").limit(1).maybeSingle();
  const version = await db().from("versions").select("id").eq("workspace_id", D).order("id").limit(1).maybeSingle();
  const target = await db().from("series_values").select("metric_id, period_start").eq("workspace_id", D).eq("kind", "target").order("id").limit(1).maybeSingle();
  const canvas = await db().from("analysis_canvas").select("metric_id").eq("workspace_id", D).limit(1).maybeSingle();
  const deliveries = (await db().from("deliveries").select("id, connector, kind, action_id").eq("workspace_id", D).order("id")).data ?? [];
  const m = new Date();
  const ids: Record<string, unknown> = {
    metric: metric.id, ownMetric: metric.id, ownMetricName: metric.name, dashboard: dashboard.id, otherDashboard: otherDashboard.data?.id ?? dashboard.id,
    widget: widget.id, deck: deck.id, template: template.data?.id ?? 1, savedWidget: savedWidget.data?.id ?? 1, group: group.data?.id ?? 1,
    theme: themes[0]?.id ?? 1, otherTheme: themes.find((t) => !t.is_default)?.id ?? 1, workflow: workflow.id, snapshot: snapshot.data?.id ?? 1, snapshotDashboard: snapshot.data?.dashboard_id ?? dashboard.id,
    action: action.data?.id ?? 1, task: task.data?.id ?? 1, approval: approval.data?.id ?? 1, message: message.data?.id ?? 1, formCode: token.data?.code ?? "tk-none",
    version: version.data?.id ?? 1, targetMetric: target.data?.metric_id ?? metric.id, targetPeriod: target.data?.period_start ?? new Date().toISOString().slice(0, 10),
    canvasMetric: canvas.data?.metric_id ?? metric.id,
    actionDelivery: deliveries.find((d) => d.action_id && d.connector !== "tickets")?.id ?? 0, ticketDelivery: deliveries.find((d) => d.connector === "tickets")?.id ?? 0,
    promptDelivery: deliveries.find((d) => d.kind === "prompt")?.id ?? 0,
    period: new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1)).toISOString().slice(0, 10),
    lastMonth: new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 1, 1)).toISOString().slice(0, 10),
  };
  Object.assign(ids, { workflowConfig: workflow.config, themeTokens: themes[0]?.tokens ?? {}, themeSlides: themes[0]?.slides ?? {} });
  return ids;
}
