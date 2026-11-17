// A new Trial Workspace's starting Metrics, against the real database (spec 0021, ticket 2): made through the core
// when a trial is made, with history as Imports, a Breakdown, a Target Series, a Derived Metric, a Workflow that asks
// the Owner and a dashboard, and without a single message sent.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { createWorkspace } from "./page-data";
import { STARTING_METRICS } from "./trial-starting-values";

const made: { workspaces: string[]; people: string[] } = { workspaces: [], people: [] };
afterEach(async () => {
  delete process.env.ZIFFR_TRIAL_DAYS;
  for (const id of made.workspaces.splice(0)) {
    await db().from("breakdown_rows").delete().eq("workspace_id", id);
    await db().from("observations").delete().eq("workspace_id", id);
    await db().from("workspaces").delete().eq("id", id);
  }
  if (made.people.length) await db().from("profiles").delete().in("id", made.people.splice(0));
});

async function newTrial() {
  process.env.ZIFFR_TRIAL_DAYS = "7";
  const owner = `t-${randomUUID()}`;
  made.people.push(owner);
  await db().from("profiles").insert({ id: owner, name: "Trial owner", role: "", color: "#000", email: `o-${owner.slice(2, 10)}@example.test` });
  const id = await createWorkspace(owner, "My trial");
  made.workspaces.push(id);
  return { id, owner };
}

describe("a new Trial Workspace's starting Metrics", () => {
  it("are made with their history, a Breakdown, a Target Series and a Derived Metric", async () => {
    const t = await newTrial();
    const { data: metrics } = await db().from("metrics").select("id, slug, name, period, aggregation, formula, workflow_id, owner_id, sources").eq("workspace_id", t.id);
    expect(metrics).toHaveLength(STARTING_METRICS.length);
    expect(new Set(metrics!.map((m) => m.period))).toEqual(new Set(["day", "week", "month", "quarter", "year"]));
    expect(new Set(metrics!.map((m) => m.aggregation))).toEqual(new Set(["sum", "average", "last", "none"]));
    expect(metrics!.every((m) => m.owner_id === t.owner)).toBe(true);
    // The formula names the slugs createMetric gave out, so it computes.
    const aov = metrics!.find((m) => m.formula)!;
    const slugs = new Set(metrics!.map((m) => m.slug));
    expect([...aov.formula!.matchAll(/\{([a-z0-9-]+)\}/g)].every((x) => slugs.has(x[1]))).toBe(true);
    expect(aov.sources).toEqual([]);

    const { data: obs } = await db().from("observations").select("id, metric_id, period_start, imported, source").eq("workspace_id", t.id);
    expect(obs!.length).toBeGreaterThan(400);
    const today = new Date().toISOString().slice(0, 10);
    expect(obs!.every((o) => o.period_start <= today)).toBe(true);
    expect(obs!.some((o) => o.imported) && obs!.some((o) => !o.imported)).toBe(true);
    const revenue = metrics!.find((m) => m.name === "Revenue")!;
    const { count: rows } = await db().from("breakdown_rows").select("id", { count: "exact", head: true }).in("observation_id", obs!.filter((o) => o.metric_id === revenue.id).map((o) => o.id));
    expect(rows).toBeGreaterThan(50);
    const { count: targets } = await db().from("series_values").select("metric_id", { count: "exact", head: true }).eq("metric_id", revenue.id).eq("kind", "target");
    expect(targets).toBeGreaterThan(10);
  });

  it("are asked of the Owner by one Workflow, and making them sends nothing", async () => {
    const t = await newTrial();
    const { data: workflows } = await db().from("workflows").select("id").eq("workspace_id", t.id);
    expect(workflows).toHaveLength(1);
    const { data: metrics } = await db().from("metrics").select("id, formula, workflow_id").eq("workspace_id", t.id);
    expect(metrics!.filter((m) => !m.formula).every((m) => m.workflow_id === workflows![0].id)).toBe(true);
    const { data: tokens } = await db().from("tokens").select("metric_id, submitter_id").in("metric_id", metrics!.map((m) => m.id));
    expect(new Set(tokens!.map((x) => x.submitter_id))).toEqual(new Set([t.owner]));
    const { count } = await db().from("deliveries").select("id", { count: "exact", head: true }).eq("workspace_id", t.id);
    expect(count).toBe(0);
    // Requests go by email, the team default, until the Owner picks another Connector.
    const { data: prefs } = await db().from("delivery_preferences").select("kind, connector").eq("workspace_id", t.id).is("user_id", null);
    expect(prefs!.map((p) => p.connector)).toEqual(["email", "email", "email", "email"]);
  });

  it("are on a dashboard that shows each aggregation over a longer period", async () => {
    const t = await newTrial();
    const { data: dashboards } = await db().from("dashboards").select("id, name").eq("workspace_id", t.id);
    expect(dashboards).toHaveLength(1);
    const { data: widgets } = await db().from("widgets").select("template, settings").eq("dashboard_id", dashboards![0].id);
    expect(widgets!.length).toBeGreaterThanOrEqual(12);
    expect(new Set(widgets!.map((w) => (w.settings as { display?: string })?.display).filter(Boolean))).toEqual(new Set(["month", "quarter", "year"]));
  });

  it("are not made outside a trial", async () => {
    const owner = `t-${randomUUID()}`;
    made.people.push(owner);
    await db().from("profiles").insert({ id: owner, name: "Owner", role: "", color: "#000" });
    const id = await createWorkspace(owner, "Ordinary");
    made.workspaces.push(id);
    const { count } = await db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", id);
    expect(count).toBe(0);
  });
});
