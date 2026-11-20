// The Usage page's loader against the real database (spec 0031, ticket #364; GLOSSARY: Usage): who may see it, that
// nothing is called unused before 90 days of counting, what counts as opened, and the all-or-nothing archive.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { archiveMetrics, workspaceUsage } from "./usage-report";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const dayAgo = (n: number) => daysAgo(n).slice(0, 10);

/** A Workspace counted since some days ago, with an Owner, a Member and a Guest; Metrics are made 120 days ago. */
async function setup(countedDaysAgo = 120) {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
  await db().from("workspaces").update({ usage_since: dayAgo(countedDaysAgo) }).eq("id", w.id);
  const metric = async (name: string, over: Record<string, unknown> = {}) => w.metric(sara, { name, created_at: daysAgo(120), ...over });
  const view = async (kind: string, id: number, ago: number, via: "n_app" | "n_api" = "n_app") =>
    db().from("view_counts").insert({ workspace_id: w.id, day: dayAgo(ago), subject_kind: kind, subject_id: id, [via]: 1 });
  const dashboard = async (name: string, metricIds: number[], opened?: number) => {
    const { data } = await db().from("dashboards").insert({ name, owner_id: sara, workspace_id: w.id, created_at: daysAgo(120) }).select("id").single();
    const id = (data as { id: number }).id;
    if (metricIds.length) await db().from("widgets").insert({ owner_id: sara, dashboard_id: id, template: "number", metric_ids: metricIds, workspace_id: w.id });
    if (opened !== undefined) await view("dashboard", id, opened);
    return id;
  };
  return { w, sara, ben, gus, metric, dashboard, view };
}

describe("workspaceUsage", () => {
  it("is for Owners and Admins of the Workspace only, and never in the demo", async () => {
    const { w, ben, gus } = await setup();
    await expect(workspaceUsage(w.actor(ben, "member"))).rejects.toThrow(Forbidden);
    await expect(workspaceUsage(w.actor(gus, "guest"))).rejects.toThrow(Forbidden);
    await expect(workspaceUsage({ personId: ben, workspaceId: DEMO_WORKSPACE_ID, role: "owner" })).rejects.toThrow(Forbidden);
  });

  it("calls nothing unused before 90 days of counting, and says when the lists fill in", async () => {
    const { w, sara, metric, dashboard } = await setup(30);
    await metric("Quiet"); await dashboard("Old", []);
    const u = await workspaceUsage(w.actor(sara));
    expect(u.countingSince).toBe(dayAgo(30));
    expect(u.fillsInOn).toBe(dayAgo(-60));
    expect(u.notOpened).toEqual({ dashboards: [], decks: [], metrics: [] });
    expect(u.suggested).toEqual([]);
  });

  it("lists what was not opened; a Metric on an opened dashboard or opened itself counts as opened", async () => {
    const { w, sara, metric, dashboard, view } = await setup();
    const quiet = await metric("Quiet"); const onDash = await metric("On a dashboard"); const own = await metric("Opened itself");
    await w.metric(sara, { name: "Fresh" });
    const stale = await dashboard("Stale", [quiet.id]); const live = await dashboard("Live", [onDash.id], 1);
    await view("metric", own.id, 5);
    const u = await workspaceUsage(w.actor(sara));
    expect(u.notOpened.dashboards.map((d) => d.id)).toEqual([stale]);
    expect(u.notOpened.dashboards.map((d) => d.id)).not.toContain(live);
    const names = u.notOpened.metrics.map((m) => m.name);
    expect(names).toContain("Quiet");
    for (const n of ["On a dashboard", "Opened itself", "Fresh"]) expect(names).not.toContain(n);
  });

  it("keeps a Metric only a program reads out of the list and the suggestions", async () => {
    const { w, sara, metric, view } = await setup();
    const read = await metric("Read by an assistant");
    await view("metric", read.id, 2, "n_api");
    const u = await workspaceUsage(w.actor(sara));
    expect(u.readByProgram.map((m) => m.name)).toEqual(["Read by an assistant"]);
    expect(u.notOpened.metrics).toEqual([]);
    expect(u.suggested).toEqual([]);
  });

  it("suggests only Metrics nobody depends on", async () => {
    const { w, sara, metric } = await setup();
    const free = await metric("Free"); const input = await metric("Input", { slug: "input" }); const aimed = await metric("Aimed", { target_min: 5 });
    await metric("Derived", { formula: "{input} * 2" });
    const u = await workspaceUsage(w.actor(sara));
    expect(u.suggested.map((m) => m.id)).toContain(free.id);
    expect(u.suggested.map((m) => m.id)).not.toContain(input.id);
    expect(u.suggested.map((m) => m.id)).not.toContain(aimed.id);
    expect(u.kept.map((k) => k.id).sort()).toEqual([aimed.id, input.id].sort());
  });

  it("lists Metrics without values by their cadence, and never a Derived or a young Metric", async () => {
    const { w, sara, metric } = await setup();
    await metric("Never"); const yearly = await metric("Yearly", { period: "year" }); const recent = await metric("Recent");
    await metric("Young", { created_at: daysAgo(10) }); await metric("Calc", { formula: "x" });
    await w.value(yearly.id, `${new Date().getUTCFullYear() - 1}-06-01`, 1);
    await w.value(recent.id, `${dayAgo(10).slice(0, 8)}01`, 1);
    const listed = (await workspaceUsage(w.actor(sara))).noValues.map((m) => m.name);
    expect(listed).toContain("Never");
    for (const n of ["Yearly", "Recent", "Young", "Calc"]) expect(listed).not.toContain(n);
  });

  it("lists Submitters with no value in 90 days, not those who sent one", async () => {
    const { w, sara, ben, metric } = await setup();
    const m = await metric("Asked");
    const cleo = await w.contact({ email: "cleo@field.test" });
    await db().from("tokens").insert([{ code: "tk-a", metric_id: m.id, submitter_id: ben, workspace_id: w.id, created_at: daysAgo(120) }, { code: "tk-b", metric_id: m.id, submitter_id: cleo, workspace_id: w.id, created_at: daysAgo(120) }]);
    await w.value(m.id, `${dayAgo(10).slice(0, 8)}01`, 3, ben);
    const u = await workspaceUsage(w.actor(sara));
    expect(u.submitters.map((s) => s.id)).toEqual([cleo]);
    expect(u.submitters[0].metrics.map((x) => x.name)).toEqual(["Asked"]);
  });

  it("shows only Metrics the actor sees", async () => {
    const { w, ben, view } = await setup();
    const hidden = await w.metric(ben, { name: "Ben private", created_at: daysAgo(120) });
    await view("metric", hidden.id, 3);
    const admin = await w.person("admin");
    expect(JSON.stringify(await workspaceUsage(w.actor(admin, "admin")))).not.toContain("Ben private");
  });
});

describe("archiveMetrics", () => {
  it("archives all, or nothing when one is refused", async () => {
    const { w, sara, ben, metric } = await setup();
    const a = await metric("A"); const b = await metric("B");
    const hidden = await w.metric(ben, { name: "Hidden" });
    await expect(archiveMetrics(w.actor(sara), [a.id, hidden.id])).rejects.toThrow(Forbidden);
    const left = async () => ((await db().from("metrics").select("id").eq("workspace_id", w.id).is("archived_at", null)).data ?? []).length;
    expect(await left()).toBe(3);
    expect(await archiveMetrics(w.actor(sara), [a.id, b.id, a.id])).toBe(2);
    expect(await left()).toBe(1);
  });

  it("refuses Members and a malformed list", async () => {
    const { w, ben, sara, metric } = await setup();
    const a = await metric("A");
    await expect(archiveMetrics(w.actor(ben, "member"), [a.id])).rejects.toThrow(Forbidden);
    await expect(archiveMetrics(w.actor(sara), "x")).rejects.toThrow();
    await expect(archiveMetrics(w.actor(sara), [])).rejects.toThrow();
  });
});
