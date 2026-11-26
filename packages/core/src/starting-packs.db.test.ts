// The thirteen starting Packs installed (spec 0030, #279): all of them into one Workspace, by upload, as a self-hoster
// without the Marketplace would. They add catalog entries, templates, designs and a Theme, and make no Metric.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { installPackFile, listInstalledPacks } from "./packs";
import { setUpFromPack } from "./pack-setup";
import { metricCatalog } from "./page-data";
import { STARTING_PACKS, startingPack } from "./starting-packs.test";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

describe("installing the starting Packs", () => {
  it("installs all thirteen into one Workspace, shared names and all, and makes no Metric", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const ann = await w.person("owner");
    for (const file of STARTING_PACKS) await installPackFile(w.actor(ann), startingPack(file), { unsigned: true, assistantTexts: true });
    const installed = await listInstalledPacks(w.actor(ann));
    expect(installed.map((p) => p.packId).sort()).toEqual(STARTING_PACKS.map((f) => `ziffr/${f.replace(".pack.json", "")}`).sort());
    // Several describe Revenue; the catalog has each, under its Pack.
    const parsed = STARTING_PACKS.map((f) => JSON.parse(startingPack(f)) as { contents: { metrics?: { metric: { name: string } }[]; dashboards?: unknown[]; decks?: unknown[]; workflows?: unknown[] } });
    const own = (await metricCatalog(w.actor(ann))).filter((c) => c.pack_install_id);
    expect(own.filter((c) => c.name === "Revenue")).toHaveLength(parsed.filter((p) => p.contents.metrics?.some((e) => e.metric.name === "Revenue")).length);
    for (const t of ["metrics", "dashboards", "decks", "workflows"]) expect((await db().from(t).select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count, t).toBe(0);
    expect((await db().from("team_templates").select("kind").eq("workspace_id", w.id)).data!.map((r) => r.kind).sort()).toEqual([
      ...parsed.flatMap((p) => (p.contents.dashboards ?? []).map(() => "dashboard")), ...parsed.flatMap((p) => (p.contents.decks ?? []).map(() => "deck")), ...parsed.flatMap((p) => (p.contents.workflows ?? []).map(() => "workflow")),
    ].sort());
  });

  it("sets up SaaS metrics 2.0 whole: its Metrics, the monthly dashboard and the quarter's Workflow", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const ann = await w.person("owner");
    const install = await installPackFile(w.actor(ann), startingPack("saas-metrics.pack.json"), { unsigned: true, assistantTexts: true });
    const keys = ["mrr", "arr", "new-mrr", "expansion-mrr", "churned-mrr", "customers", "logo-churn", "nrr", "cac", "cac-payback", "arpa", "cash", "runway"];
    const made = await setUpFromPack(w.actor(ann), install, { metrics: keys, dashboard: { key: "saas-monthly" }, workflow: { key: "quarter-close", approvers: [ann] } });
    expect(made.metrics).toHaveLength(keys.length);
    expect(made.tagsLeftOut).toEqual([]);
    const { data: widgets } = await db().from("widgets").select("id").eq("dashboard_id", made.dashboardId!);
    expect(widgets!.length).toBe(16);
    expect(made.workflowId).not.toBeNull();
  });

  // Sales forecast asks who does what, so it is set up in forecast-pack.db.test.ts.
  it.each(["sales", "finance", "people", "customer-support", "fulfilment"])("sets up the %s Pack whole: every Metric, its dashboard with all its widgets and its Workflow", async (id) => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const ann = await w.person("owner");
    const file = `${id}.pack.json`;
    const pack = JSON.parse(startingPack(file)) as { contents: { metrics: { key: string }[]; dashboards: { key: string; template: { widgets: unknown[] } }[]; workflows: { key: string; template: { steps: { type: string }[] } }[] } };
    const install = await installPackFile(w.actor(ann), startingPack(file), { unsigned: true, assistantTexts: true });
    const made = await setUpFromPack(w.actor(ann), install, { metrics: pack.contents.metrics.map((m) => m.key), dashboard: { key: pack.contents.dashboards[0].key }, workflow: { key: pack.contents.workflows[0].key, approvers: pack.contents.workflows[0].template.steps.some((t) => t.type === "approve") ? [ann] : [] } });
    expect(made.metrics).toHaveLength(pack.contents.metrics.length);
    expect(made.tagsLeftOut).toEqual([]);
    const { data: widgets } = await db().from("widgets").select("id").eq("dashboard_id", made.dashboardId!);
    expect(widgets!.length).toBe(pack.contents.dashboards[0].template.widgets.length);
    expect(made.workflowId).not.toBeNull();
  });
});
