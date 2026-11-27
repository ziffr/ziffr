// The Setup Guide's Starting point against the real database (spec 0052, ticket 6; GLOSSARY: Setup Guide, Pack, Trial
// Workspace): "Set up from this Pack" makes the right Metrics through the one set-up path, records the first as the guide's
// Metric, makes nothing twice on a second click, and is refused to Members, keys, the demo and installs of other
// Workspaces; a trial's start ticks by itself; a Metric made from the catalog with the return link becomes the guide's.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { installIncludedPack, recommendedPacks } from "./included-packs";
import { DEMO_WORKSPACE_ID } from "./team";
import { chooseExploreOnMyOwn, setupGuide } from "./setup-guide";
import { adoptSetupFirstMetric, setUpGuideFromPack } from "./setup-from-pack";
import { startTrialWorkspace } from "./trial-seed";
import { opened, workspace } from "./test/db-fixtures";

const made: Awaited<ReturnType<typeof workspace>>[] = [];
afterEach(async () => { for (const w of made.splice(0)) await w.cleanup(); });
async function fresh() {
  const w = await workspace("Start Co");
  made.push(w);
  const owner = await w.person("owner", { email: `o-${randomUUID().slice(0, 8)}@example.test` });
  return { w, owner, o: w.actor(owner, "owner") };
}
const metricsOf = async (ws: string) => opened("metrics", ws, (await db().from("metrics").select("id, name, from_catalog_id").eq("workspace_id", ws).order("id")).data);
const count = async (table: string, ws: string) => (await db().from(table).select("id", { count: "exact", head: true }).eq("workspace_id", ws)).count ?? 0;
const SPORTS = ["members", "joiners", "leavers"];

describe("Set up from this Pack in the guide", () => {
  it("makes the ticked Metrics of an installed Pack, the first becomes the guide's Metric, and the step ticks", async () => {
    const { w, owner, o } = await fresh();
    const install = await installIncludedPack(o, "ziffr/sports-club");
    const r = await setUpGuideFromPack(o, install, { metrics: SPORTS, submitters: [owner] });
    expect(r.metrics.map((m) => m.name)).toEqual(["Members", "Joiners", "Leavers"]);
    expect(r.existing).toEqual([]);
    // Ordinary Metrics of this Workspace made from the Pack's entries, audited as any set-up.
    const rows = await metricsOf(w.id);
    expect(rows.map((m) => m.name)).toEqual(["Members", "Joiners", "Leavers"]);
    expect(rows.every((m) => m.from_catalog_id !== null)).toBe(true);
    const { data: events } = await db().from("audit_events").select("kind").eq("workspace_id", w.id);
    expect(events!.filter((e) => e.kind === "metric.created")).toHaveLength(3);
    expect(events!.filter((e) => e.kind === "pack.set_up")).toHaveLength(1);
    // The guide's Metric is the first one made; the start is a Pack; the viewer sees both.
    expect(r.firstMetricId).toBe(r.metrics[0]!.id);
    const g = (await setupGuide(o))!;
    expect(g.startingPoint).toBe("pack");
    expect(g.firstMetric).toEqual({ id: r.metrics[0]!.id, name: "Members" });
    expect(g.steps.find((s) => s.id === "start")!.ticked).toBe(true);
  });

  it("makes nothing twice on a second click, and keeps the guide's Metric", async () => {
    const { w, owner, o } = await fresh();
    const install = await installIncludedPack(o, "ziffr/sports-club");
    const first = await setUpGuideFromPack(o, install, { metrics: SPORTS, submitters: [owner], workflow: { key: "after-training", approvers: [] } });
    expect(first.workflowId).not.toBeNull();
    const again = await setUpGuideFromPack(o, install, { metrics: SPORTS, submitters: [owner], workflow: { key: "after-training", approvers: [] } });
    expect(again.metrics).toEqual([]);
    expect(again.workflowId).toBeNull();
    expect(again.existing.map((m) => m.name)).toEqual(["Members", "Joiners", "Leavers"]);
    expect(again.firstMetricId).toBe(first.firstMetricId);
    expect(await count("metrics", w.id)).toBe(3);
    expect(await count("workflows", w.id)).toBe(1);
    // Another entry on a later click is made, and the guide's Metric stays the first.
    const more = await setUpGuideFromPack(o, install, { metrics: [...SPORTS, "attendance"] });
    expect(more.metrics.map((m) => m.name)).toEqual(["Attendance per training"]);
    expect(more.firstMetricId).toBe(first.firstMetricId);
    expect(await count("metrics", w.id)).toBe(4);
  });

  it("is refused to a Member, a key, the demo and for an install of another Workspace, and makes nothing", async () => {
    const a = await fresh();
    const b = await fresh();
    const install = await installIncludedPack(a.o, "ziffr/sports-club");
    const otherInstall = await installIncludedPack(b.o, "ziffr/sports-club");
    const member = a.w.actor(await a.w.person("member"), "member");
    const guest = a.w.actor(await a.w.person("guest"), "guest");
    await expect(setUpGuideFromPack(member, install, { metrics: SPORTS })).rejects.toBeInstanceOf(Forbidden);
    await expect(setUpGuideFromPack(guest, install, { metrics: SPORTS })).rejects.toBeInstanceOf(Forbidden);
    await expect(setUpGuideFromPack({ ...a.o, key: { id: "k" } } as never, install, { metrics: SPORTS })).rejects.toBeInstanceOf(Forbidden);
    await expect(setUpGuideFromPack({ personId: a.owner, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, install, { metrics: SPORTS })).rejects.toBeInstanceOf(Forbidden);
    await expect(setUpGuideFromPack(a.o, otherInstall, { metrics: SPORTS })).rejects.toBeInstanceOf(Forbidden);
    await expect(setUpGuideFromPack(a.o, -1, { metrics: SPORTS })).rejects.toBeInstanceOf(Forbidden);
    expect(await count("metrics", a.w.id)).toBe(0);
    expect(await count("metrics", b.w.id)).toBe(0);
    // An Admin may.
    const admin = a.w.actor(await a.w.person("admin"), "admin");
    expect((await setUpGuideFromPack(admin, install, { metrics: ["members"] })).metrics).toHaveLength(1);
  });

  it("checks the keys: an entry the Pack does not have makes nothing", async () => {
    const { w, o } = await fresh();
    const install = await installIncludedPack(o, "ziffr/sports-club");
    await expect(setUpGuideFromPack(o, install, { metrics: ["members", "nope"] })).rejects.toThrow(/Pick entries/);
    await expect(setUpGuideFromPack(o, install, { metrics: ["__proto__"] })).rejects.toThrow(/Pick entries/);
    expect(await count("metrics", w.id)).toBe(0);
    expect((await setupGuide(o))!.startingPoint).toBeNull();
  });

  it("a Derived Metric asked for after its inputs exist is refused in words, not made twice", async () => {
    const { w, o } = await fresh();
    const install = await installIncludedPack(o, "ziffr/online-shop");
    await setUpGuideFromPack(o, install, { metrics: ["orders", "revenue"] });
    await expect(setUpGuideFromPack(o, install, { metrics: ["aov"] })).rejects.toThrow(/Packs page/);
    expect(await count("metrics", w.id)).toBe(2);
  });

  it("a Trial Limit applies as it does on the Packs page: nothing is made when the Metrics do not fit", async () => {
    const { w, owner, o } = await fresh();
    await w.trial("2099-01-01");
    for (let i = 0; i < 23; i++) await w.metric(owner, { name: `Filler ${i}` });
    const install = await installIncludedPack(o, "ziffr/sports-club");
    await expect(setUpGuideFromPack(o, install, { metrics: SPORTS })).rejects.toThrow(/A trial holds at most 25 Metrics/);
    expect(await count("metrics", w.id)).toBe(23);
    expect((await setUpGuideFromPack(o, install, { metrics: ["members", "joiners"] })).metrics).toHaveLength(2);
  });
});

describe("the ranked list names the install", () => {
  it("gives an installed Pack its install id and says whether an Owner is needed", async () => {
    const { o } = await fresh();
    const install = await installIncludedPack(o, "ziffr/sports-club");
    const list = await recommendedPacks(o);
    expect(list.find((p) => p.id === "ziffr/sports-club")).toMatchObject({ installed: true, installId: install, needsOwner: false });
    expect(list.find((p) => p.id === "ziffr/saas-metrics")).toMatchObject({ installed: false, installId: null });
  });
});

describe("a trial's start", () => {
  it("ticks by itself, and makes no Metric", async () => {
    const { w, o } = await fresh();
    await startTrialWorkspace(o);
    const g = (await setupGuide(o))!;
    expect(g.startingPoint).toBe("scratch");
    expect(g.steps.find((s) => s.id === "start")).toMatchObject({ ticked: true });
    expect(await count("metrics", w.id)).toBe(0);
  });
});

describe("Explore on my own and the catalog's return link", () => {
  it("a Metric made from the catalog becomes the guide's Metric only when it has none, and only for an Owner or Admin", async () => {
    const { w, owner, o } = await fresh();
    await chooseExploreOnMyOwn(o);
    const m1 = await w.metric(owner, { name: "First" });
    const m2 = await w.metric(owner, { name: "Second" });
    const member = w.actor(await w.person("member"), "member");
    await adoptSetupFirstMetric(member, m1.id);
    expect((await setupGuide(o))!.firstMetric).toBeNull();
    await adoptSetupFirstMetric(o, m1.id);
    await adoptSetupFirstMetric(o, m2.id);
    expect((await setupGuide(o))!.firstMetric).toEqual({ id: m1.id, name: "First" });
    // A Metric of another Workspace, or none, is never taken.
    const other = await fresh();
    const stranger = await other.w.metric(other.owner, { name: "Stranger" });
    const c = await fresh();
    await adoptSetupFirstMetric(c.o, stranger.id);
    await adoptSetupFirstMetric(c.o, -5);
    expect((await setupGuide(c.o))!.firstMetric).toBeNull();
    expect((await db().from("setup_guides").select("first_metric_id").eq("workspace_id", c.w.id).maybeSingle()).data?.first_metric_id ?? null).toBeNull();
  });
});
