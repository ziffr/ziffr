// Updating and uninstalling Packs against the real database (spec 0030, #276): unchanged items replaced, changed ones
// kept with the new version offered, removed items removed or kept by the same rule, Take the new version keeping the
// old one in Versions; uninstalling removes what nobody changed and nothing uses, and never touches what was made.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { installPackFile, PACK_CAPS } from "./packs";
import { offeredItems, readPackUpdate, readUninstall, takeNewVersion, uninstallPack, updatePackFile } from "./pack-updates";
import { saveTheme } from "./workspace-themes";
import { renameTemplate } from "./templates";
import { createMetric } from "./metrics";
import { metricCatalog } from "./page-data";
import { createDashboard } from "./dashboards";
import { PACK } from "./pack.test";
import { opened, workspace } from "./test/db-fixtures";
import type { Pack } from "./pack";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const file = (p: unknown = PACK) => JSON.stringify(p);
const yes = { unsigned: true, assistantTexts: true };
const count = async (table: string, workspaceId: string) => (await db().from(table).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId)).count ?? 0;

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

/** A /2 version of the Pack that adds a Total over a repeated entry. */
const WITH_TOTAL: Pack = {
  ...NEXT,
  format: "ziffr.pack/2",
  repeats: [{ key: "team", name: "Team" }],
  contents: {
    ...NEXT.contents,
    metrics: [
      ...NEXT.contents.metrics!,
      { key: "commit", per: "team", metric: { format: "ziffr.metric/1", name: "Commit", period: "week", aggregation: "last", polarity: "higher" } },
      { key: "team-commit", total: { of: "commit", targets: "parts" }, metric: { format: "ziffr.metric/1", name: "Team commit", period: "week", aggregation: "last", polarity: "higher" } },
    ],
  },
};

describe("updating a Pack", () => {
  // Until #1226 builds Totals (spec 0058): refused whole, so no Total ever becomes a Metric that takes values.
  it("refuses a Pack with a Total, installed or as a new version, and stores nothing of it", async () => {
    const { w, actor, id } = await setUp();
    const before = await count("catalog_metrics", w.id);
    const res = await readPackUpdate(actor, id, file(WITH_TOTAL));
    expect(res.ok && res.plan.blocked).toContain("holds a Total");
    await expect(updatePackFile(actor, id, file(WITH_TOTAL), yes)).rejects.toThrow("holds a Total");
    await expect(installPackFile(actor, file({ ...WITH_TOTAL, id: "ziffr/team-commit" }), yes)).rejects.toThrow("holds a Total");
    expect(await count("catalog_metrics", w.id)).toBe(before);
    expect(await count("pack_installs", w.id)).toBe(1);
    expect((await db().from("pack_installs").select("version").eq("id", id).single()).data!.version).toBe("1.2.0");
  });

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
    const events = await opened("audit_events", w.id, (await db().from("audit_events").select("id, details").eq("workspace_id", w.id).eq("kind", "pack.updated")).data, { dropId: true });
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
    // An Admin neither sees nor takes the new version of a template someone else installed and changed.
    const ada = await w.person("admin");
    expect(await offeredItems(w.actor(ada, "admin"))).toEqual([]);
    await expect(takeNewVersion(w.actor(ada, "admin"), "templates", tpl!.id)).rejects.toThrow("Only whoever installed the Pack");
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

  it("stops when a copy it would replace changed meanwhile, and changes nothing", async () => {
    const { w, actor, id } = await setUp();
    const tpl = await row("team_templates", w.id, "saas-overview");
    const ops = { catalog: { insert: [], replace: [], offer: [], delete: [], unmark: [] }, templates: { insert: [], replace: [{ id: tpl!.id, kind: "dashboard", name: "Overwritten", description: "", slots: [], body: { widgets: [] }, hash: "0".repeat(64) }], offer: [], delete: [], unmark: [] }, designs: { insert: [], replace: [], offer: [], delete: [], unmark: [] }, themes: { insert: [], replace: [], offer: [], delete: [], unmark: [] }, guard: [{ table: "templates", id: tpl!.id, updated_at: "2000-01-01T00:00:00Z" }] };
    const { error } = await db().rpc("update_pack", { p_workspace: w.id, p_install: id, p_by: actor.personId, p_install_row: { version: "9.9.9", license: "MIT", manifest: {}, item_keys: [] }, p_ops: ops });
    expect(error?.code).toBe("40001");
    expect((await row("team_templates", w.id, "saas-overview"))!.name).toBe("Monthly overview");
  });

  it("sees a Deck Template pointed at another Theme as changed", async () => {
    const { w, actor, id } = await setUp();
    const { data: other } = await db().from("themes").insert({ owner_id: actor.personId, name: "Other", tokens: {}, slides: {}, workspace_id: w.id }).select("id").single();
    const deck = await row("team_templates", w.id, "board-deck");
    await db().from("team_templates").update({ body: { ...(deck!.body as object), themeId: other!.id } }).eq("id", deck!.id);
    const res = await readPackUpdate(actor, id, file(NEXT));
    expect(res.ok && res.plan.items.find((i) => i.key === "board-deck")?.changedHere).toBe(true);
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
    expect(await opened("metrics", w.id, (await db().from("metrics").select("id, name, from_catalog_id").eq("id", metric.id)).data, { dropId: true })).toEqual([{ name: "MRR", from_catalog_id: null }]);
    const events = await opened("audit_events", w.id, (await db().from("audit_events").select("id, details").eq("workspace_id", w.id).eq("kind", "pack.uninstalled")).data, { dropId: true });
    expect(events).toEqual([{ details: { pack: "ziffr/saas-metrics", version: "1.2.0", removed: 7, kept: 2 } }]);
  });

  it("needs an Owner for a Pack with Themes, and refuses Members", async () => {
    const { w, id } = await setUp();
    const ada = await w.person("admin"); const sara = await w.person("member");
    await expect(uninstallPack(w.actor(ada, "admin"), id)).rejects.toThrow("only Owners change Themes");
    await expect(uninstallPack(w.actor(sara, "member"), id)).rejects.toEqual(forbidden);
  });
});

describe("the caps on what Packs add, kept in the database", () => {
  const fill = async (table: "catalog_metrics" | "team_templates", workspaceId: string, owner: string, n: number) => {
    const rows = Array.from({ length: n }, (_, i) => table === "catalog_metrics"
      ? { workspace_id: workspaceId, category: "x", name: `Filler ${i}`, description: "", format: "number", period: "month", submission_rule: "reject", polarity: "higher" }
      : { workspace_id: workspaceId, owner_id: owner, kind: "dashboard", name: `Filler ${i}`, description: "", view: "dashboard", slots: [], body: {}, w: 0, h: 0 });
    for (let i = 0; i < rows.length; i += 500) { const { error } = await db().from(table).insert(rows.slice(i, i + 500)); expect(error).toBeNull(); }
  };
  const emptyOps = () => ({ catalog: { insert: [] as unknown[], replace: [], offer: [], delete: [], unmark: [] }, templates: { insert: [] as unknown[], replace: [], offer: [], delete: [], unmark: [] }, designs: { insert: [], replace: [], offer: [], delete: [], unmark: [] }, themes: { insert: [], replace: [], offer: [], delete: [], unmark: [] }, guard: [] });
  const entry = (name: string) => ({ key: name.toLowerCase().replace(/ /g, "-"), category: "x", name, description: "", unit: "", unit_position: "after", format: "number", decimals: 0, period: "month", submission_rule: "reject", polarity: "higher", sources: [], aggregation: "sum", hash: "0".repeat(64) });
  const small = (id: string): Pack => ({ ...PACK, id, contents: { metrics: [PACK.contents.metrics![0]] } });

  it("refuses an update that takes the Metric Catalog past its cap, and the app says so first", async () => {
    const { w, ann, id, actor } = await setUp();
    await fill("catalog_metrics", w.id, ann, PACK_CAPS.entries - (await count("catalog_metrics", w.id)));
    const more = { ...NEXT, contents: { ...NEXT.contents, metrics: [...NEXT.contents.metrics!, { key: "nrr", metric: { ...PACK.contents.metrics![0].metric, name: "NRR" } }, { key: "grr", metric: { ...PACK.contents.metrics![0].metric, name: "GRR" } }] } };
    const res = await readPackUpdate(actor, id, file(more));
    expect(res.ok && res.plan.blocked).toMatch(/at most 1000 Metric Catalog entries/);
    // The database refuses it even when the app-side check is skipped.
    const ops = emptyOps(); ops.catalog.insert.push(entry("One too many"));
    const { error } = await db().rpc("update_pack", { p_workspace: w.id, p_install: id, p_by: ann, p_install_row: { version: "9.9.9", license: "MIT", manifest: {}, item_keys: [] }, p_ops: ops });
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/at most 1000/);
    expect(await count("catalog_metrics", w.id)).toBe(PACK_CAPS.entries);
    expect((await db().from("pack_installs").select("version").eq("id", id).single()).data!.version).toBe("1.2.0");
  });

  it("lets an update that makes room by removing as many as it adds pass at the cap", async () => {
    const { w, ann, id } = await setUp();
    await fill("catalog_metrics", w.id, ann, PACK_CAPS.entries - (await count("catalog_metrics", w.id)));
    const mrr = await row("catalog_metrics", w.id, "mrr");
    const ops = emptyOps(); ops.catalog.insert.push(entry("Swapped in")); (ops.catalog as { delete: number[] }).delete.push(mrr!.id);
    const { error } = await db().rpc("update_pack", { p_workspace: w.id, p_install: id, p_by: ann, p_install_row: { version: "9.9.9", license: "MIT", manifest: {}, item_keys: [] }, p_ops: ops });
    expect(error).toBeNull();
    expect(await count("catalog_metrics", w.id)).toBe(PACK_CAPS.entries);
  });

  it("refuses an update past the template cap", async () => {
    const { w, ann, id } = await setUp();
    await fill("team_templates", w.id, ann, PACK_CAPS.templates - (await count("team_templates", w.id)));
    const ops = emptyOps(); ops.templates.insert.push({ key: "extra", kind: "dashboard", name: "Extra", description: "", slots: [], body: {}, hash: "0".repeat(64) });
    const { error } = await db().rpc("update_pack", { p_workspace: w.id, p_install: id, p_by: ann, p_install_row: { version: "9.9.9", license: "MIT", manifest: {}, item_keys: [] }, p_ops: ops });
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/at most 1000/);
    expect(await count("team_templates", w.id)).toBe(PACK_CAPS.templates);
  });

  it("lets parallel installs pass only up to the cap, never past it", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    await fill("catalog_metrics", w.id, ann, PACK_CAPS.entries - 2);
    // Each Pack adds one entry under another name; the app-side check reads the same count for all of them.
    const packs = Array.from({ length: 6 }, (_, i) => small(`someone/p${i}`)).map((p, i) => ({ ...p, contents: { metrics: [{ key: `m${i}`, metric: { ...PACK.contents.metrics![0].metric, name: `Parallel ${i}` } }] } }));
    const results = await Promise.allSettled(packs.map((p) => installPackFile(actor, file(p), yes)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await count("catalog_metrics", w.id)).toBe(PACK_CAPS.entries);
  });

  it("lets parallel installs pass only up to the most Packs, never past it", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    await db().from("pack_installs").insert(Array.from({ length: PACK_CAPS.installs - 2 }, (_, i) => ({ workspace_id: w.id, pack_id: `someone/q${i}`, version: "1.0.0", license: "MIT", source: "upload", signed: false, manifest: {} })));
    const packs = Array.from({ length: 6 }, (_, i) => small(`someone/r${i}`)).map((p, i) => ({ ...p, contents: { metrics: [{ key: `m${i}`, metric: { ...PACK.contents.metrics![0].metric, name: `Parallel ${i}` } }] } }));
    const results = await Promise.allSettled(packs.map((p) => installPackFile(actor, file(p), yes)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await count("pack_installs", w.id)).toBe(PACK_CAPS.installs);
  });
});
