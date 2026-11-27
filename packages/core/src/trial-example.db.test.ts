// What people see of a trial's example and what removing it does, against the real database (#1292): when Home asks
// where to start, which choices each role gets, the line on the example dashboard, and that removing it never deletes a
// recorded value or anything another thing shows.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, Refused, type Actor } from "./actor";
import { db } from "./db";
import { createDashboard, placeWidget } from "./dashboards";
import { homeDashboard, setHomeDashboard, switchableDashboards } from "./home";
import { startSetupGuide } from "./setup-guide";
import { firstMetricStep } from "./setup-first-metric";
import { DEMO_WORKSPACE_ID } from "./team";
import { chooseTrialExample, exampleNote, removeTrialExample, startChoices } from "./trial-example";
import { makeTrialExample } from "./trial-seed";
import { workspace } from "./test/db-fixtures";

const made: Awaited<ReturnType<typeof workspace>>[] = [];
afterEach(async () => {
  delete process.env.ZIFFR_CLOUD_KEY;
  for (const w of made.splice(0)) await w.cleanup();
});

async function trial() {
  process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
  const w = await workspace("Trial Co");
  made.push(w);
  await w.trial("2099-01-01");
  const owner = await w.person("owner", { email: `o-${randomUUID().slice(0, 8)}@example.test` });
  return { w, owner, o: w.actor(owner, "owner") };
}
const home = async (a: Actor) => startChoices(a, await switchableDashboards(a));
const count = async (table: "metrics" | "workflows" | "dashboards", ws: string) => (await db().from(table).select("id", { count: "exact", head: true }).eq("workspace_id", ws)).count;
const record = (ws: string, metricId: number, by: string) => db().from("observations").insert({ metric_id: metricId, period_start: "2027-01-01", value: 2, submitter_id: by, source: "web_form", workspace_id: ws });

describe("where to start", () => {
  it("offers the Owner of an empty trial every choice, and others only what they may use", async () => {
    const { w, o } = await trial();
    expect(await home(o)).toEqual({ pack: true, example: true, setup: null, askColleague: false });
    // A Workspace First Steps made leads its Owner back to the next open step; no other Owner or Admin is offered one.
    await startSetupGuide(o);
    expect((await home(o))!.setup).toBeNull();
    await db().from("setup_guides").update({ first_steps_at: new Date().toISOString() }).eq("workspace_id", w.id);
    expect((await home(o))!.setup).toBe("/first-steps?step=start");
    const admin = w.actor(await w.person("admin"), "admin");
    expect(await home(admin)).toMatchObject({ pack: true, example: false, askColleague: true });
    expect((await home(admin))!.setup).toBeNull();
    const member = w.actor(await w.person("member"), "member");
    expect(await home(member)).toMatchObject({ pack: false, example: false, askColleague: true, setup: "/setup" });
    expect(await home(w.actor(await w.person("guest"), "guest"))).toBeNull();
    expect(await startChoices({ ...o, workspaceId: DEMO_WORKSPACE_ID }, [])).toBeNull();
  });

  it("stays while the example is untouched, also in a trial that has had it since it was made", async () => {
    const { o } = await trial();
    await makeTrialExample(o);
    expect(await home(o)).toMatchObject({ example: true });
  });

  it("goes once something was chosen or made: the example as Home, a value in it, a dashboard or a Metric", async () => {
    const chosen = await trial();
    const id = await chooseTrialExample(chosen.o);
    expect((await homeDashboard(chosen.o))!.id).toBe(id);
    expect(await home(chosen.o)).toBeNull();
    // Choosing again changes nothing.
    expect(await chooseTrialExample(chosen.o)).toBe(id);
    await setHomeDashboard(chosen.o, null);
    expect(await home(chosen.o)).not.toBeNull();

    const valued = await trial();
    const e = await makeTrialExample(valued.o);
    await record(valued.w.id, e.metricId, valued.owner);
    expect(await home(valued.o)).toBeNull();

    const own = await trial();
    await createDashboard(own.o, "Mine");
    expect(await home(own.o)).toBeNull();

    const metric = await trial();
    await makeTrialExample(metric.o);
    await metric.w.metric(metric.owner, { name: "Visits" });
    expect(await home(metric.o)).toBeNull();

    const widened = await trial();
    const x = await makeTrialExample(widened.o);
    const tea = await widened.w.metric(widened.owner, { name: "Tea" });
    await placeWidget(widened.o, x.dashboardId, { type: "metric", id: tea.id });
    expect(await home(widened.o)).toBeNull();
    expect(await exampleNote(widened.o, x.dashboardId)).toBeNull();
  });

  it("is not chosen for anyone but the trial's Owner", async () => {
    const { w } = await trial();
    const admin = w.actor(await w.person("admin"), "admin");
    await expect(chooseTrialExample(admin)).rejects.toBeInstanceOf(Forbidden);
    expect(await count("metrics", w.id)).toBe(0);
  });
});

describe("the First Metric step of a trial without Metrics", () => {
  it("has the example due for the Owner, makes nothing by being read, and has it due no more once removed", async () => {
    const { w, o } = await trial();
    expect(await firstMetricStep(o)).toMatchObject({ metric: null, canTryExample: true, exampleDue: true });
    expect(await count("metrics", w.id)).toBe(0);
    // What the page's action does.
    const e = await makeTrialExample(o);
    expect(await firstMetricStep(o)).toMatchObject({ metric: { name: "Cups of coffee", example: true }, canTryExample: false, exampleDue: false });
    await removeTrialExample(o, e.dashboardId);
    expect(await firstMetricStep(o)).toMatchObject({ metric: null, canTryExample: true, exampleDue: false });
    expect(await count("metrics", w.id)).toBe(0);
  });

  it("has nothing due for an Admin, or where the trial has a Metric", async () => {
    const { w, owner, o } = await trial();
    const admin = w.actor(await w.person("admin"), "admin");
    expect(await firstMetricStep(admin)).toMatchObject({ metric: null, canTryExample: false, exampleDue: false });
    expect(await count("metrics", w.id)).toBe(0);
    await w.metric(owner, { name: "Visits" });
    expect(await firstMetricStep(o)).toMatchObject({ metric: null, exampleDue: false });
  });
});

describe("the line on the example dashboard, and removing it", () => {
  it("names the Metric, and offers Remove only to who owns both", async () => {
    const { w, o } = await trial();
    const e = await makeTrialExample(o);
    expect(await exampleNote(o, e.dashboardId)).toEqual({ metricName: "Cups of coffee", remove: { hasValues: false } });
    const member = await w.person("member");
    await expect(exampleNote(w.actor(member, "member"), e.dashboardId)).resolves.toBeNull();
    await db().from("shares").insert({ workspace_id: w.id, object_type: "dashboard", object_id: e.dashboardId, user_id: member, role: "editor" });
    expect(await exampleNote(w.actor(member, "member"), e.dashboardId)).toEqual({ metricName: "Cups of coffee", remove: null });
    await expect(removeTrialExample(w.actor(member, "member"), e.dashboardId)).rejects.toBeInstanceOf(Forbidden);
    const other = await trial();
    await expect(removeTrialExample(other.o, e.dashboardId)).rejects.toBeInstanceOf(Forbidden);
    expect(await count("dashboards", w.id)).toBe(1);
  });

  it("deletes the dashboard, the Metric and its Workflow when no value was recorded", async () => {
    const { w, o } = await trial();
    const e = await makeTrialExample(o);
    expect(await removeTrialExample(o, e.dashboardId)).toEqual({ metricDeleted: true, words: "The example is removed." });
    for (const table of ["metrics", "workflows", "dashboards"] as const) expect(await count(table, w.id), table).toBe(0);
    expect((await db().from("setup_guides").select("first_metric_id").eq("workspace_id", w.id).single()).data).toEqual({ first_metric_id: null });
    // It can be tried again.
    await makeTrialExample(o);
    expect(await count("metrics", w.id)).toBe(1);
  });

  it("keeps the Metric, its values and its Workflow once a value was recorded", async () => {
    const { w, owner, o } = await trial();
    const e = await makeTrialExample(o);
    await record(w.id, e.metricId, owner);
    expect((await exampleNote(o, e.dashboardId))!.remove).toEqual({ hasValues: true });
    expect(await removeTrialExample(o, e.dashboardId)).toMatchObject({ metricDeleted: false });
    expect(await count("dashboards", w.id)).toBe(0);
    expect(await count("metrics", w.id)).toBe(1);
    expect(await count("workflows", w.id)).toBe(1);
    expect((await db().from("observations").select("id", { count: "exact", head: true }).eq("metric_id", e.metricId)).count).toBe(1);
  });

  it("keeps a Metric that another dashboard shows", async () => {
    const { w, o } = await trial();
    const e = await makeTrialExample(o);
    const other = await createDashboard(o, "Mine");
    await placeWidget(o, other, { type: "metric", id: e.metricId });
    const done = await removeTrialExample(o, e.dashboardId);
    expect(done.metricDeleted).toBe(false);
    expect(done.words).toContain("It is shown in 1 widget");
    expect(await count("metrics", w.id)).toBe(1);
    expect(await count("dashboards", w.id)).toBe(1);
  });

  it("removes nothing while a View Link to the dashboard works", async () => {
    const { w, owner, o } = await trial();
    const e = await makeTrialExample(o);
    const link = await db().from("view_links").insert({ token: randomUUID(), object_type: "dashboard", object_id: e.dashboardId, created_by: owner, label: "", expires_at: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), workspace_id: w.id });
    expect(link.error).toBeNull();
    await expect(removeTrialExample(o, e.dashboardId)).rejects.toBeInstanceOf(Refused);
    expect(await count("dashboards", w.id)).toBe(1);
    expect(await count("metrics", w.id)).toBe(1);
    await db().from("view_links").delete().eq("workspace_id", w.id);
  });
});
