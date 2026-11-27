// What a new Trial Workspace starts with and what its example is, against the real database (spec 0021, #1292): nothing
// at first; then, once chosen, the Test Metric only, without made-up history, a Workflow that asks its Owner each day
// and a small dashboard, made once and without a single message sent.
import { opened } from "./test/db-fixtures";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { waysFor } from "./deliveries";
import { createWorkspace } from "./page-data";
import { makeTrialExample } from "./trial-seed";

const made: { workspaces: string[]; people: string[] } = { workspaces: [], people: [] };
afterEach(async () => {
  delete process.env.ZIFFR_TRIAL_DAYS; delete process.env.ZIFFR_CLOUD_KEY;
  for (const id of made.workspaces.splice(0)) {
    await db().from("observations").delete().eq("workspace_id", id);
    await db().from("workspaces").delete().eq("id", id);
  }
  if (made.people.length) await db().from("profiles").delete().in("id", made.people.splice(0));
});

async function newTrial() {
  process.env.ZIFFR_TRIAL_DAYS = "7";
  process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
  const owner = `t-${randomUUID()}`;
  made.people.push(owner);
  await db().from("profiles").insert({ id: owner, name: "Trial owner", role: "", color: "#000", email: `o-${owner.slice(2, 10)}@example.test` });
  const id = await createWorkspace(owner, "My trial");
  made.workspaces.push(id);
  return { id, owner, actor: { personId: owner, workspaceId: id, role: "owner" } as Actor };
}
const count = async (table: "metrics" | "workflows" | "dashboards" | "deliveries", ws: string) => (await db().from(table).select("id", { count: "exact", head: true }).eq("workspace_id", ws)).count;

describe("a new Trial Workspace", () => {
  it("holds no Metric, Workflow or dashboard, and its guide's Starting point is done", async () => {
    const t = await newTrial();
    for (const table of ["metrics", "workflows", "dashboards", "deliveries"] as const) expect(await count(table, t.id), table).toBe(0);
    const { data: ws } = await db().from("workspaces").select("trial_test_metric_id, trial_guide_step").eq("id", t.id).single();
    // The Setup Guide (spec 0052) is the only guide: the Trial Guide's old column is no longer written.
    expect(ws).toEqual({ trial_test_metric_id: null, trial_guide_step: null });
    const { data: guide } = await db().from("setup_guides").select("starting_point, first_metric_id").eq("workspace_id", t.id).single();
    expect(guide).toEqual({ starting_point: "scratch", first_metric_id: null });
    // Questions, tasks and updates go by email, the team default; Prompts have no team default, so they go by every way
    // that reaches the person (#614).
    const { data: prefs } = await db().from("delivery_preferences").select("kind, connector").eq("workspace_id", t.id).is("user_id", null);
    expect(prefs!.map((p) => p.connector)).toEqual(["email", "email", "email"]);
    expect(await waysFor(t.id, t.owner, "prompt")).toEqual(["slack", "telegram", "email"]);
  });

  it("is prepared by nothing of this outside a trial", async () => {
    const owner = `t-${randomUUID()}`;
    made.people.push(owner);
    await db().from("profiles").insert({ id: owner, name: "Owner", role: "", color: "#000" });
    const id = await createWorkspace(owner, "Ordinary");
    made.workspaces.push(id);
    expect(await count("metrics", id)).toBe(0);
    await expect(makeTrialExample({ personId: owner, workspaceId: id, role: "owner" })).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("the trial's example", () => {
  it("is the Test Metric only: daily, by hand, without history, and the guide's First Metric", async () => {
    const t = await newTrial();
    const example = await makeTrialExample(t.actor);
    const { data: metrics } = await db().from("metrics").select("id, name, unit, period, sources, owner_id, workflow_id").eq("workspace_id", t.id);
    expect(metrics).toHaveLength(1);
    const m = (await opened("metrics", t.id, metrics))[0];
    expect(m.id).toBe(example.metricId);
    expect((await db().from("workspaces").select("trial_test_metric_id").eq("id", t.id).single()).data).toEqual({ trial_test_metric_id: m.id });
    expect((await db().from("setup_guides").select("first_metric_id").eq("workspace_id", t.id).single()).data).toEqual({ first_metric_id: m.id });
    expect(m).toMatchObject({ name: "Cups of coffee", unit: "cups", period: "day", owner_id: t.owner });
    expect(m.workflow_id).not.toBeNull();
    expect(m.sources).not.toContain("api");
    const { count: values } = await db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", t.id);
    expect(values).toBe(0);
    const { count: targets } = await db().from("series_values").select("metric_id", { count: "exact", head: true }).eq("metric_id", m.id);
    expect(targets).toBe(0);
  });

  it("asks its Owner for it each day through one Workflow, shows it on one small dashboard, and sends nothing", async () => {
    const t = await newTrial();
    const example = await makeTrialExample(t.actor);
    const { data: workflows } = await db().from("workflows").select("id, owner_id").eq("workspace_id", t.id);
    expect(workflows).toHaveLength(1);
    expect(workflows![0].owner_id).toBe(t.owner);
    const { data: metrics } = await db().from("metrics").select("id, workflow_id").eq("workspace_id", t.id);
    expect(metrics![0].workflow_id).toBe(workflows![0].id);
    const { data: tokens } = await db().from("tokens").select("submitter_id").eq("metric_id", example.metricId);
    expect(tokens!.map((x) => x.submitter_id)).toEqual([t.owner]);
    const { data: widgets } = await db().from("widgets").select("metric_ids").eq("dashboard_id", example.dashboardId);
    expect(widgets!.length).toBeGreaterThanOrEqual(1);
    expect(widgets!.length).toBeLessThanOrEqual(4);
    expect(widgets!.every((w) => JSON.stringify(w.metric_ids) === JSON.stringify([example.metricId]))).toBe(true);
    expect(await count("deliveries", t.id)).toBe(0);
  });

  it("is made once, also when chosen twice at once", async () => {
    const t = await newTrial();
    const [a, b] = await Promise.all([makeTrialExample(t.actor), makeTrialExample(t.actor)]);
    expect(a).toEqual(b);
    expect(await makeTrialExample(t.actor)).toEqual(a);
    for (const table of ["metrics", "workflows", "dashboards"] as const) expect(await count(table, t.id), table).toBe(1);
  });

  it("is for the trial's Owner only, while the trial runs", async () => {
    const t = await newTrial();
    await expect(makeTrialExample({ ...t.actor, role: "admin" })).rejects.toBeInstanceOf(Forbidden);
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", t.id);
    await expect(makeTrialExample(t.actor)).rejects.toBeInstanceOf(Forbidden);
    expect(await count("metrics", t.id)).toBe(0);
  });
});
