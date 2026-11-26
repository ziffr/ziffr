// Where a Pack's numbers come from, against the real database (spec 0058; GLOSSARY: Comes From, Pack): an install keeps
// the overview for Help and Set up, Set up asks nobody for a number the Pack says comes from elsewhere unless chosen, an
// export says where each number comes from, and an installed Pack's words are offered again.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { installPackFile, listInstalledPacks } from "./packs";
import { packSetupOptions, setUpFromPack } from "./pack-setup";
import { listInstalledGuides, readInstalledGuide } from "./installed-pack-guides";
import { exportPack, type ExportManifest } from "./pack-export";
import { draftPackGuide } from "./pack-export-guide";
import { checkPack, type Pack } from "./pack";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const yes = { unsigned: true, assistantTexts: true };
const metric = (name: string) => ({ format: "ziffr.metric/1" as const, name, period: "week" as const, aggregation: "last" as const, polarity: "higher" as const });
const PACK: Pack = {
  format: "ziffr.pack/2", id: "ziffr/numbers", name: "Numbers", version: "1.0.0", summary: "Three numbers.", author: { name: "Ziffr" }, license: "CC-BY-4.0", ziffr: ">=0.11",
  contents: {
    metrics: [
      { key: "commit", comesFrom: { by: "person" }, metric: metric("Commit") },
      { key: "closed", comesFrom: { by: "system", system: "CRM", note: "The won deals." }, metric: metric("Closed") },
      { key: "quota", comesFrom: { by: "target" }, metric: metric("Quota") },
    ],
  },
};
const asked = async (workspaceId: string) => {
  const [{ data: tokens }, { data: metrics }] = await Promise.all([
    db().from("tokens").select("metric_id").eq("workspace_id", workspaceId),
    db().from("metrics").select("id, from_catalog_id").eq("workspace_id", workspaceId),
  ]);
  const { data: entries } = await db().from("catalog_metrics").select("id, pack_key").eq("workspace_id", workspaceId);
  const keyOf = new Map((metrics ?? []).map((m) => [m.id, entries!.find((e) => e.id === m.from_catalog_id)!.pack_key as string]));
  return (tokens ?? []).map((t) => keyOf.get(t.metric_id)).sort();
};

describe("where a Pack's numbers come from", () => {
  it("is kept with the install, listed in Help also without a guide, and offered at Set up", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, JSON.stringify(PACK), yes);
    expect((await listInstalledPacks(actor))[0].help).toBe("numbers");
    expect((await listInstalledGuides(actor)).map((g) => g.installId)).toEqual([id]);
    const read = (await readInstalledGuide(actor, id))!;
    expect(read.guide).toBeNull();
    expect(read.overview!.numbers.map((n) => [n.key, n.by, n.system])).toEqual([["commit", "person", undefined], ["closed", "system", "CRM"], ["quota", "target", undefined]]);
    const options = await packSetupOptions(actor, id);
    expect(options.entries.map((e) => e.comesFrom?.by)).toEqual(["person", "system", "target"]);
  });

  it("asks nobody for a number that comes from elsewhere, unless chosen", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, JSON.stringify(PACK), yes);
    await setUpFromPack(actor, id, { metrics: ["commit", "closed", "quota"], submitters: [ann] });
    expect(await asked(w.id)).toEqual(["commit"]);
    const v = await ws(); const bea = await v.person("owner");
    const second = await installPackFile(v.actor(bea), JSON.stringify(PACK), yes);
    await setUpFromPack(v.actor(bea), second, { metrics: ["commit", "closed", "quota"], submitters: [bea], askElsewhere: true });
    expect(await asked(v.id)).toEqual(["closed", "commit", "quota"]);
  });

  it("goes into an export as answered, a person where nothing is said, and is refused in words", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const a = await w.metric(ann, { name: "Orders", aggregation: "sum" });
    const b = await w.metric(ann, { name: "Revenue", aggregation: "sum" });
    const manifest: ExportManifest = { id: "northwind/week", name: "Week", version: "1.0.0", summary: "A week.", author: "Northwind", license: "MIT" };
    const choice = { metrics: [a.id, b.id] };
    const made = await exportPack(actor, manifest, choice, { comesFrom: { [`metric:${b.id}`]: { by: "system", system: " shop " } } });
    const res = checkPack(made.text);
    expect(res.ok && res.pack.format).toBe("ziffr.pack/2");
    expect(res.ok && res.pack.contents.metrics!.map((m) => [m.key, m.comesFrom])).toEqual([["orders", { by: "person" }], ["revenue", { by: "system", system: "shop" }]]);
    await expect(exportPack(actor, manifest, choice, { comesFrom: { [`metric:${a.id}`]: { by: "system" } } })).rejects.toThrow("“Orders”: Name the kind of system");
    await expect(exportPack(actor, manifest, choice, { comesFrom: { [`metric:${a.id}`]: { by: "person", note: "See evil.example/x" } } })).rejects.toThrow("“Orders”: The note must be plain text");
    // Without answers (a program that asks nothing) the file says nothing of numbers and stays /1.
    expect(JSON.parse((await exportPack(actor, manifest, choice)).text).format).toBe("ziffr.pack/1");
  });

  it("offers what an installed Pack said of the numbers picked, to the export of its own Workspace only", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, JSON.stringify(PACK), yes);
    const made = await setUpFromPack(actor, id, { metrics: ["closed"] });
    const { data: entry } = await db().from("catalog_metrics").select("id").eq("workspace_id", w.id).eq("pack_key", "commit").single();
    const draft = await draftPackGuide(actor, "northwind/week", { metrics: [made.metrics[0].id], catalog: [Number(entry!.id)] });
    expect(draft.numbers).toEqual([
      { ref: `metric:${made.metrics[0].id}`, name: "Closed", said: { by: "system", system: "CRM", note: "The won deals." } },
      { ref: `catalog:${entry!.id}`, name: "Commit", said: { by: "person" } },
    ]);
    const other = await ws(); const eve = await other.person("owner");
    expect((await draftPackGuide(other.actor(eve), "northwind/week", { metrics: [made.metrics[0].id], catalog: [Number(entry!.id)] })).numbers).toEqual([]);
  });
});
