// What a new Trial Workspace starts with, against the real database (spec 0021, ticket 263): the Test Metric only,
// without made-up history, a Workflow that asks its Owner each day and a small dashboard, and not a single message sent.
import { opened } from "./test/db-fixtures";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { waysFor } from "./deliveries";
import { createWorkspace } from "./page-data";

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
  return { id, owner };
}

describe("a new Trial Workspace", () => {
  it("has the Test Metric only: daily, by hand, without history", async () => {
    const t = await newTrial();
    const { data: metrics } = await db().from("metrics").select("id, name, unit, period, sources, owner_id, workflow_id").eq("workspace_id", t.id);
    expect(metrics).toHaveLength(1);
    const read = await opened("metrics", t.id, metrics);
    const { data: ws } = await db().from("workspaces").select("trial_test_metric_id, trial_guide_step").eq("id", t.id).single();
    expect(ws!.trial_guide_step).toBe("welcome");
    const m = read[0];
    expect(m.id).toBe(ws!.trial_test_metric_id);
    expect(m).toMatchObject({ name: "Cups of coffee", unit: "cups", period: "day", owner_id: t.owner });
    expect(m.workflow_id).not.toBeNull();
    expect(m.sources).not.toContain("api");
    const { count: values } = await db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", t.id);
    expect(values).toBe(0);
    const { count: targets } = await db().from("series_values").select("metric_id", { count: "exact", head: true }).eq("metric_id", m.id);
    expect(targets).toBe(0);
  });

  it("asks its Owner for it each day through one Workflow, and making it sends nothing", async () => {
    const t = await newTrial();
    const { data: workflows } = await db().from("workflows").select("id, owner_id, config").eq("workspace_id", t.id);
    expect(workflows).toHaveLength(1);
    expect(workflows![0].owner_id).toBe(t.owner);
    const { data: metrics } = await db().from("metrics").select("id, workflow_id").eq("workspace_id", t.id);
    expect(metrics![0].workflow_id).toBe(workflows![0].id);
    const { data: tokens } = await db().from("tokens").select("submitter_id").eq("metric_id", metrics![0].id);
    expect(tokens!.map((x) => x.submitter_id)).toEqual([t.owner]);
    const { count } = await db().from("deliveries").select("id", { count: "exact", head: true }).eq("workspace_id", t.id);
    expect(count).toBe(0);
    // Questions, tasks and updates go by email, the team default; Prompts have no team default, so they go by every way
    // that reaches the person (#614).
    const { data: prefs } = await db().from("delivery_preferences").select("kind, connector").eq("workspace_id", t.id).is("user_id", null);
    expect(prefs!.map((p) => p.connector)).toEqual(["email", "email", "email"]);
    expect(await waysFor(t.id, t.owner, "prompt")).toEqual(["slack", "telegram", "email"]);
  });

  it("shows it on one small dashboard", async () => {
    const t = await newTrial();
    const { data: dashboards } = await db().from("dashboards").select("id").eq("workspace_id", t.id);
    expect(dashboards).toHaveLength(1);
    const { data: metric } = await db().from("metrics").select("id").eq("workspace_id", t.id).single();
    const { data: widgets } = await db().from("widgets").select("metric_ids").eq("dashboard_id", dashboards![0].id);
    expect(widgets!.length).toBeGreaterThanOrEqual(1);
    expect(widgets!.length).toBeLessThanOrEqual(4);
    expect(widgets!.every((w) => JSON.stringify(w.metric_ids) === JSON.stringify([metric!.id]))).toBe(true);
  });

  it("is not filled outside a trial", async () => {
    const owner = `t-${randomUUID()}`;
    made.people.push(owner);
    await db().from("profiles").insert({ id: owner, name: "Owner", role: "", color: "#000" });
    const id = await createWorkspace(owner, "Ordinary");
    made.workspaces.push(id);
    const { count } = await db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", id);
    expect(count).toBe(0);
  });
});
