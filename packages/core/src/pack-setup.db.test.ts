// Setting up from a Pack against the real database (spec 0030, ticket 277; GLOSSARY: Pack, Derived Metric, Slot,
// Workflow Template, Workspace Limit): Metrics through createMetric within the Workspace Limit, Derived Metrics after
// their inputs, a dashboard with its Slots filled, a Workflow with its people picked; only Owners and Admins, only
// with an install of their own Workspace, and nothing made when anything asked for is refused.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { installPackFile } from "./packs";
import { packSetupOptions, setUpFromPack } from "./pack-setup";
import { repoFile } from "./test/repo-file";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const pack = (name: string) => readFileSync(repoFile(`packs/${name}.pack.json`), "utf8");

async function withPack(name: string) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  const install = await installPackFile(w.actor(sara), pack(name), { unsigned: true, assistantTexts: true });
  return { w, sara, install };
}
const metricsOf = async (ws: string) => (await db().from("metrics").select("id, slug, name, formula, sources, from_catalog_id, workflow_id").eq("workspace_id", ws).order("id")).data ?? [];
const count = async (table: string, ws: string) => (await db().from(table).select("id", { count: "exact", head: true }).eq("workspace_id", ws)).count ?? 0;

describe("setting up Metrics from a Pack", () => {
  it("makes a Derived Metric after its inputs, from their entries, with its formula over their slugs", async () => {
    const { w, sara, install } = await withPack("online-shop");
    const options = await packSetupOptions(w.actor(sara), install);
    expect(options.entries.find((e) => e.key === "aov")).toMatchObject({ derived: true, inputs: ["revenue", "orders"] });
    const made = await setUpFromPack(w.actor(sara), install, { metrics: ["aov"] });
    expect(made.metrics.map((m) => m.name)).toEqual(["Orders", "Online revenue", "Average order value"]);
    const rows = await metricsOf(w.id);
    const by = new Map(rows.map((m) => [m.name, m]));
    expect(by.get("Average order value")!.formula).toBe(`{${by.get("Online revenue")!.slug}} / {${by.get("Orders")!.slug}}`);
    expect(by.get("Average order value")!.sources).toEqual([]);
    // Each records the entry it came from, of this install.
    const { data: entries } = await db().from("catalog_metrics").select("id, pack_key").eq("pack_install_id", install);
    const entryId = new Map((entries ?? []).map((e) => [e.pack_key as string, e.id as number]));
    expect(by.get("Orders")!.from_catalog_id).toBe(entryId.get("orders"));
    // Made as any new Metric: audited, no Submitter and so no Prompt unless asked.
    const { data: events } = await db().from("audit_events").select("kind").eq("workspace_id", w.id);
    expect(events!.filter((e) => e.kind === "metric.created")).toHaveLength(3);
    expect(events!.some((e) => e.kind === "pack.set_up")).toBe(true);
    expect(await count("tokens", w.id)).toBe(0);
    expect(await count("deliveries", w.id)).toBe(0);
  });

  it("fills the dashboard's Slots with the Metrics made, and refuses one left empty before making anything", async () => {
    const { w, sara, install } = await withPack("online-shop");
    await expect(setUpFromPack(w.actor(sara), install, { metrics: ["orders", "revenue"], dashboard: { key: "shop-weekly" } })).rejects.toThrow(/Fill the Slot “Average order value”/);
    expect(await count("metrics", w.id)).toBe(0);
    const made = await setUpFromPack(w.actor(sara), install, { metrics: ["aov", "conversion", "return-rate", "sessions"], dashboard: { key: "shop-weekly", name: "Our week" }, workflow: { key: "monday-numbers", approvers: [] }, submitters: [sara] });
    expect(made.metrics).toHaveLength(6);
    const { data: d } = await db().from("dashboards").select("name").eq("id", made.dashboardId!).single();
    expect(d!.name).toBe("Our week");
    const { data: widgets } = await db().from("widgets").select("metric_ids").eq("dashboard_id", made.dashboardId!);
    const ids = new Set(made.metrics.map((m) => m.id));
    expect(widgets!.length).toBeGreaterThan(0);
    expect(widgets!.every((x) => (x.metric_ids as number[]).every((id) => ids.has(id)))).toBe(true);
    // The Metrics that take values take the Workflow and ask their Submitter; the Derived one neither.
    const rows = await metricsOf(w.id);
    expect(rows.filter((m) => !m.formula).every((m) => m.workflow_id === made.workflowId)).toBe(true);
    expect(rows.find((m) => m.formula)!.workflow_id).toBeNull();
    expect(await count("tokens", w.id)).toBe(5);
  });

  it("fills a Slot no entry made with a Metric the person sees, and never one they do not", async () => {
    const { w, sara, install } = await withPack("online-shop");
    const ben = await w.person("member");
    const bens = await w.metric(ben, { name: "Ben's sessions", period: "week" });
    const own = await w.metric(sara, { name: "Visits", period: "week" });
    const fills = [null, null, null, [own.id], [own.id], [bens.id]];
    await expect(setUpFromPack(w.actor(sara), install, { metrics: ["aov"], dashboard: { key: "shop-weekly", fills } })).rejects.toThrow();
    expect(await count("dashboards", w.id)).toBe(0);
    const made = await setUpFromPack(w.actor(sara), install, { metrics: ["aov"], dashboard: { key: "shop-weekly", fills: [null, null, null, [own.id], [own.id], [own.id]] } });
    expect(made.dashboardId).not.toBeNull();
  });

  it("asks for the Workflow's Approvers, members only, and makes nothing without them", async () => {
    const { w, sara, install } = await withPack("saas-metrics");
    const ada = await w.person("admin");
    const contact = await w.contact({ email: "c@example.test" });
    expect((await packSetupOptions(w.actor(sara), install)).workflows).toEqual([expect.objectContaining({ key: "monthly-close", approvers: 1 })]);
    await expect(setUpFromPack(w.actor(sara), install, { metrics: ["mrr"], workflow: { key: "monthly-close", approvers: [] } })).rejects.toThrow(/Pick each Approver/);
    await expect(setUpFromPack(w.actor(sara), install, { metrics: ["mrr"], workflow: { key: "monthly-close", approvers: [contact] } })).rejects.toThrow();
    expect(await count("metrics", w.id)).toBe(0);
    expect(await count("workflows", w.id)).toBe(0);
    const made = await setUpFromPack(w.actor(sara), install, { metrics: ["mrr"], workflow: { key: "monthly-close", name: "Close", approvers: [ada] } });
    const { data: wf } = await db().from("workflows").select("name, config").eq("id", made.workflowId!).single();
    expect(wf!.name).toBe("Close");
    expect(JSON.stringify(wf!.config)).toContain(ada);
  });
});

describe("the Workspace Limit", () => {
  it("refuses a set-up that would go past it, before any Metric is made", async () => {
    const { w, sara, install } = await withPack("online-shop");
    // A limit of 1 has room for 2 for a while (spec 0029): three are refused, and none is made.
    await w.limit(1);
    await expect(setUpFromPack(w.actor(sara), install, { metrics: ["aov"] })).rejects.toThrow(/room is left for 2/);
    expect(await count("metrics", w.id)).toBe(0);
    expect((await packSetupOptions(w.actor(sara), install)).refusal).toBeNull();
    // Within its room it goes through, as any new Metric would, and then the page says no more fit.
    expect((await setUpFromPack(w.actor(sara), install, { metrics: ["orders", "revenue"] })).metrics).toHaveLength(2);
    expect((await packSetupOptions(w.actor(sara), install)).refusal).toMatch(/holds 2 Metrics/);
  });

  it("holds a trial to its 25 Metrics", async () => {
    const { w, sara, install } = await withPack("saas-metrics");
    await w.trial(new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10));
    for (let i = 0; i < 24; i++) await w.metric(sara, { name: `M${i}` });
    await expect(setUpFromPack(w.actor(sara), install, { metrics: ["arpa"] })).rejects.toThrow(/A trial holds at most 25/);
    expect(await count("metrics", w.id)).toBe(24);
  });
});

describe("who sets up", () => {
  it("is an Owner or Admin of the Workspace the Pack is installed in, never a Member, a key or another Workspace", async () => {
    const { w, install } = await withPack("online-shop");
    const ben = await w.person("member");
    const ada = await w.person("admin");
    await expect(setUpFromPack(w.actor(ben, "member"), install, { metrics: ["orders"] })).rejects.toThrow(/Only Owners and Admins/);
    await expect(packSetupOptions(w.actor(ben, "member"), install)).rejects.toThrow(/Only Owners and Admins/);
    await expect(setUpFromPack({ ...w.actor(ada, "admin"), key: { id: 1 } } as never, install, { metrics: ["orders"] })).rejects.toThrow();
    const other = await workspace("Other"); cleanups.push(other.cleanup);
    const zoe = await other.person("owner");
    await expect(setUpFromPack(other.actor(zoe), install, { metrics: ["orders"] })).rejects.toThrow();
    await expect(packSetupOptions(other.actor(zoe), install)).rejects.toThrow();
    expect(await count("metrics", other.id)).toBe(0);
    expect((await setUpFromPack(w.actor(ada, "admin"), install, { metrics: ["orders"] })).metrics).toHaveLength(1);
  });

  it("takes only keys of this Pack's entries and templates", async () => {
    const { w, sara, install } = await withPack("online-shop");
    for (const metrics of [["mrr"], ["__proto__"], ["constructor"], ["Orders"], Array.from({ length: 51 }, () => "orders")]) {
      await expect(setUpFromPack(w.actor(sara), install, { metrics })).rejects.toThrow(/Pick entries of this Pack/);
    }
    await expect(setUpFromPack(w.actor(sara), install, { metrics: [], dashboard: { key: "saas-monthly" } })).rejects.toThrow(/Dashboard Templates/);
    await expect(setUpFromPack(w.actor(sara), install, { metrics: [], workflow: { key: "constructor", approvers: [] } })).rejects.toThrow(/Workflow Templates/);
    await expect(setUpFromPack(w.actor(sara), install, { metrics: [] })).rejects.toThrow(/Pick something/);
    expect(await count("metrics", w.id)).toBe(0);
  });
});
