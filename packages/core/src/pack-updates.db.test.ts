// Updating and uninstalling Packs against the real database (spec 0030, #276): unchanged items replaced, changed ones
// kept with the new version offered, removed items removed or kept by the same rule, Take the new version keeping the
// old one in Versions; uninstalling removes what nobody changed and nothing uses, and never touches what was made.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { installPackFile } from "./packs";
import { offeredItems, readPackUpdate, readUninstall, takeNewVersion, uninstallPack, updatePackFile } from "./pack-updates";
import { saveTheme } from "./workspace-themes";
import { renameTemplate } from "./templates";
import { createMetric } from "./metrics";
import { metricCatalog } from "./page-data";
import { createDashboard } from "./dashboards";
import { PACK } from "./pack.test";
import { workspace } from "./test/db-fixtures";
import type { Pack } from "./pack";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const file = (p: unknown = PACK) => JSON.stringify(p);
const yes = { unsigned: true, assistantTexts: true };

/** Version 1.3.0: MRR described anew, the dashboard and Theme changed, Customers gone, a new entry added. */
const NEXT: Pack = {
  ...PACK,
  version: "1.3.0",
  contents: {
    ...PACK.contents,
    metrics: [
      { key: "mrr", metric: { ...PACK.contents.metrics![0].metric, description: "Recurring revenue per month, net of discounts." } },
      { key: "churn", metric: { ...PACK.contents.metrics![0].metric, name: "Churned MRR", polarity: "lower" } },
    ],
    dashboards: [{ ...PACK.contents.dashboards![0], template: { ...PACK.contents.dashboards![0].template, name: "Monthly overview, revised", slots: [{ label: "MRR", suggests: "mrr" }, { label: "Churn", suggests: "churn" }] } }],
    themes: [{ key: "board", theme: { ...PACK.contents.themes![0].theme, name: "Board, darker", radius: 2 } }],
  },
};

async function setUp() {
  const w = await ws(); const ann = await w.person("owner");
  const id = await installPackFile(w.actor(ann), file(), yes);
  return { w, ann, id, actor: w.actor(ann) };
}
const row = async (table: string, workspaceId: string, key: string) => (await db().from(table).select("*").eq("workspace_id", workspaceId).eq("pack_key", key).maybeSingle()).data;

describe("updating a Pack", () => {
  it("sees every copy as installed as unchanged", async () => {
    const { actor, id } = await setUp();
    const res = await readPackUpdate(actor, id, file({ ...PACK, version: "1.2.1" }));
    expect(res.ok && res.plan.items.every((i) => i.change === "same" && !i.changedHere && i.outcome === "none")).toBe(true);
  });

  it("replaces unchanged items, adds new ones, and removes what the new version dropped", async () => {
    const { w, actor, id } = await setUp();
    const res = await readPackUpdate(actor, id, file(NEXT));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const by = Object.fromEntries(res.plan.items.map((i) => [i.key, `${i.change}/${i.outcome}`]));
    expect(by).toMatchObject({ mrr: "changed/replace", churn: "added/add", customers: "removed/delete", "saas-overview": "changed/replace", board: "changed/replace", trend: "same/none" });
    await updatePackFile(actor, id, file(NEXT), yes);
    expect((await row("catalog_metrics", w.id, "mrr"))!.description).toBe("Recurring revenue per month, net of discounts.");
    expect(await row("catalog_metrics", w.id, "churn")).not.toBeNull();
    expect(await row("catalog_metrics", w.id, "customers")).toBeNull();
    expect((await row("team_templates", w.id, "saas-overview"))!.name).toBe("Monthly overview, revised");
    expect((await row("themes", w.id, "board"))!.name).toBe("Board, darker");
    const { data: install } = await db().from("pack_installs").select("version").eq("id", id).single();
    expect(install!.version).toBe("1.3.0");
    // The updated copies are unchanged as far as the next update can tell.
    const again = await readPackUpdate(actor, id, file({ ...NEXT, version: "1.3.1" }));
    expect(again.ok && again.plan.items.every((i) => !i.changedHere)).toBe(true);
    const { data: events } = await db().from("audit_events").select("details").eq("workspace_id", w.id).eq("kind", "pack.updated");
    expect(events).toEqual([{ details: { pack: "ziffr/saas-metrics", from: "1.2.0", version: "1.3.0", source: "upload" } }]);
  });

  it("keeps a copy the Workspace changed, offers the new version, and Take the new version keeps the old in Versions", async () => {
    const { w, actor, id } = await setUp();
    const theme = await row("themes", w.id, "board");
    await saveTheme(actor, theme!.id, "Our board", theme!.tokens, theme!.slides);
    const tpl = await row("team_templates", w.id, "saas-overview");
    await renameTemplate(actor, tpl!.id, "Our overview", "");
    const res = await readPackUpdate(actor, id, file(NEXT));
    expect(res.ok && res.plan.items.filter((i) => i.changedHere).map((i) => `${i.key}/${i.outcome}`).sort()).toEqual(["board/offer", "saas-overview/offer"]);
    await updatePackFile(actor, id, file(NEXT), yes);
    expect((await row("themes", w.id, "board"))!.name).toBe("Our board");
    expect((await offeredItems(actor)).map((o) => o.name).sort()).toEqual(["Our board", "Our overview"]);

    await takeNewVersion(actor, "themes", theme!.id);
    const taken = (await db().from("themes").select("name, pack_offer").eq("id", theme!.id).single()).data!;
    expect(taken).toEqual({ name: "Board, darker", pack_offer: null });
    const { data: versions } = await db().from("versions").select("snapshot, message").eq("object_type", "theme").eq("object_id", theme!.id).order("id");
    expect(versions!.some((v) => (v.snapshot as { name?: string }).name === "Our board")).toBe(true);
    expect(versions!.at(-1)!.message).toBe("Took the Pack's new version");
    // A Member sees nothing to take, and cannot take it.
    const sara = await w.person("member");
    expect(await offeredItems(w.actor(sara, "member"))).toEqual([]);
    await expect(takeNewVersion(w.actor(sara, "member"), "templates", tpl!.id)).rejects.toEqual(forbidden);
  });

  it("keeps an item the new version drops when the Workspace changed it, without its mark", async () => {
    const { w, actor, id } = await setUp();
    const theme = await row("themes", w.id, "board");
    await saveTheme(actor, theme!.id, "Ours now", theme!.tokens, theme!.slides);
    const dropped = { ...NEXT, contents: { ...NEXT.contents, themes: undefined, decks: [{ ...PACK.contents.decks![0], template: { ...PACK.contents.decks![0].template, theme: undefined } }] } };
    await updatePackFile(actor, id, file(dropped), yes);
    const kept = (await db().from("themes").select("name, pack_install_id, pack_key").eq("id", theme!.id).single()).data;
    expect(kept).toEqual({ name: "Ours now", pack_install_id: null, pack_key: null });
  });

  it("does not add again what the Workspace removed, and refuses a lower version, another Pack, and Members", async () => {
    const { w, actor, id } = await setUp();
    await db().from("view_designs").delete().eq("workspace_id", w.id).eq("pack_key", "trend");
    const res = await readPackUpdate(actor, id, file(NEXT));
    expect(res.ok && res.plan.items.find((i) => i.key === "trend")?.outcome).toBe("skip");
    await expect(updatePackFile(actor, id, file({ ...PACK, version: "1.1.0" }), yes)).rejects.toThrow("needs a higher version");
    await expect(updatePackFile(actor, id, file({ ...NEXT, id: "someone/else" }), yes)).rejects.toThrow("not “ziffr/saas-metrics”");
    const sara = await w.person("member");
    await expect(readPackUpdate(w.actor(sara, "member"), id, file(NEXT))).rejects.toEqual(forbidden);
    const major = await readPackUpdate(actor, id, file({ ...NEXT, version: "2.0.0" }));
    expect(major.ok && major.plan.major).toBe(true);
  });

  it("touches only installs of the actor's Workspace", async () => {
    const { id } = await setUp();
    const other = await ws("B"); const zoe = await other.person("owner");
    await expect(readPackUpdate(other.actor(zoe), id, file(NEXT))).rejects.toEqual(forbidden);
    await expect(uninstallPack(other.actor(zoe), id)).rejects.toEqual(forbidden);
  });
});

describe("uninstalling a Pack", () => {
  it("removes what nobody changed, keeps changed and used items unmarked, and leaves Metrics made from it", async () => {
    const { w, actor, id } = await setUp();
    const tpl = await row("team_templates", w.id, "monthly-close");
    await renameTemplate(actor, tpl!.id, "Our close", "");
    const theme = await row("themes", w.id, "board");
    const dash = await createDashboard(actor, "Board");
    await db().from("dashboards").update({ theme_id: theme!.id }).eq("id", dash);
    const entry = (await metricCatalog(actor)).find((c) => c.name === "MRR")!;
    const metric = await createMetric(actor, { name: "MRR", fromCatalogId: entry.id });

    const plan = await readUninstall(actor, id);
    expect(plan.keep.map((k) => `${k.name}/${k.why}`).sort()).toEqual(["Board/in use", "Our close/changed"]);
    expect(plan.remove.length).toBe(7);
    await uninstallPack(actor, id);
    expect(await db().from("pack_installs").select("id").eq("id", id).maybeSingle().then((r) => r.data)).toBeNull();
    expect((await db().from("team_templates").select("name, pack_install_id").eq("id", tpl!.id).single()).data).toEqual({ name: "Our close", pack_install_id: null });
    expect((await db().from("themes").select("pack_install_id").eq("id", theme!.id).single()).data).toEqual({ pack_install_id: null });
    expect(await db().from("catalog_metrics").select("id").eq("workspace_id", w.id).then((r) => r.data)).toEqual([]);
    expect((await db().from("metrics").select("name, from_catalog_id").eq("id", metric.id).single()).data).toEqual({ name: "MRR", from_catalog_id: null });
    const { data: events } = await db().from("audit_events").select("details").eq("workspace_id", w.id).eq("kind", "pack.uninstalled");
    expect(events).toEqual([{ details: { pack: "ziffr/saas-metrics", version: "1.2.0", removed: 7, kept: 2 } }]);
  });

  it("needs an Owner for a Pack with Themes, and refuses Members", async () => {
    const { w, id } = await setUp();
    const ada = await w.person("admin"); const sara = await w.person("member");
    await expect(uninstallPack(w.actor(ada, "admin"), id)).rejects.toThrow("only Owners change Themes");
    await expect(uninstallPack(w.actor(sara, "member"), id)).rejects.toEqual(forbidden);
  });
});
