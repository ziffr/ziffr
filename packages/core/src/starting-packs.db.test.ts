// The seven starting Packs installed (spec 0030, #279): all of them into one Workspace, by upload, as a self-hoster
// without the Marketplace would. They add catalog entries, templates, designs and a Theme, and make no Metric.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { installPackFile, listInstalledPacks } from "./packs";
import { metricCatalog } from "./page-data";
import { STARTING_PACKS, startingPack } from "./starting-packs.test";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

describe("installing the starting Packs", () => {
  it("installs all seven into one Workspace, shared names and all, and makes no Metric", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const ann = await w.person("owner");
    for (const file of STARTING_PACKS) await installPackFile(w.actor(ann), startingPack(file), { unsigned: true, assistantTexts: true });
    const installed = await listInstalledPacks(w.actor(ann));
    expect(installed.map((p) => p.packId).sort()).toEqual(STARTING_PACKS.map((f) => `ziffr/${f.replace(".pack.json", "")}`));
    // Revenue is described by two of them; the catalog has both, each under its Pack.
    const own = (await metricCatalog(w.actor(ann))).filter((c) => c.pack_install_id);
    expect(own.filter((c) => c.name === "Revenue")).toHaveLength(2);
    for (const t of ["metrics", "dashboards", "decks", "workflows"]) expect((await db().from(t).select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count, t).toBe(0);
    expect((await db().from("team_templates").select("kind").eq("workspace_id", w.id)).data!.map((r) => r.kind).sort()).toEqual(["dashboard", "dashboard", "dashboard", "dashboard", "dashboard", "deck", "workflow", "workflow", "workflow", "workflow", "workflow"]);
  });
});
