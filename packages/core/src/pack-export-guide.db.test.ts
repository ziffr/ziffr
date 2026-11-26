// "Describe your Pack" against the real database (spec 0058, #1230; GLOSSARY: Pack Guide): the list of contents names
// only what goes into the file, an exported file with a guide passes the check, installs and keeps the guide, an empty
// step leaves a /1 file, and a guide is offered again only to who may export, in their own Workspace.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { exportPack, type ExportManifest } from "./pack-export";
import { draftPackGuide } from "./pack-export-guide";
import { installPackFile } from "./packs";
import { readInstalledGuide } from "./installed-pack-guides";
import { checkPack } from "./pack";
import { PACK } from "./pack.test";
import { workspace } from "./test/db-fixtures";
import type { PackGuide } from "@ziffr/pack/pack-guide";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const MANIFEST: ExportManifest = { id: "northwind/board", name: "Board pack", version: "1.0.0", summary: "What our board sees.", author: "Northwind", license: "CC-BY-4.0" };
const yes = { unsigned: true, assistantTexts: true };
const GUIDE: PackGuide = { whatItsFor: [{ type: "text", text: "For the **board**." }], firstSteps: [{ type: "list", numbered: true, items: ["Open Packs."] }] };
const WITH_GUIDE = JSON.stringify({ ...PACK, format: "ziffr.pack/2", guide: GUIDE });

describe("Describe your Pack", () => {
  it("lists only what goes into the file: not a Metric the person does not see, nor one whose name a file may not hold", async () => {
    const w = await ws(); const ann = await w.person("owner"); const mia = await w.person("member");
    const own = await w.metric(mia, { name: "Orders" });
    const hidden = await w.metric(ann, { name: "Salaries" });
    const address = await w.metric(mia, { name: "See evil.example/x" });
    const draft = await draftPackGuide(w.actor(mia, "member"), "northwind/board", { metrics: [own.id, hidden.id, address.id] });
    expect(draft).toEqual({ contents: "# Metrics\n- Orders", installed: [] });
    expect(await draftPackGuide(w.actor(mia, "member"), "northwind/board", {})).toEqual({ contents: "", installed: [] });
  });

  it("writes a /2 file with the guide that passes the check, installs and keeps it; an empty step writes /1", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const m = await w.metric(ann, { name: "Orders" });
    const text = { whatItsFor: "For the **board**.", firstSteps: "1. Open Packs." };
    const made = await exportPack(actor, MANIFEST, { metrics: [m.id] }, { guide: text });
    const res = checkPack(made.text);
    expect(res.ok && [res.pack.format, res.pack.guide, typeof res.pack.ziffr]).toEqual(["ziffr.pack/2", GUIDE, "string"]);
    const other = await ws(); const bea = await other.person("owner");
    const id = await installPackFile(other.actor(bea), made.text, yes);
    expect((await readInstalledGuide(other.actor(bea), id))!.guide).toEqual(GUIDE);
    for (const guide of [undefined, {}, { whatItsFor: "  ", questions: "" }]) {
      const plain = JSON.parse((await exportPack(actor, MANIFEST, { metrics: [m.id] }, { guide })).text);
      expect([plain.format, plain.guide]).toEqual(["ziffr.pack/1", undefined]);
    }
    await expect(exportPack(actor, MANIFEST, { metrics: [m.id] }, { guide: { questions: "Fine.\nWrite to boss@evil.example." } }))
      .rejects.toThrow("in “Questions”, line 2: This paragraph must be plain text");
  });

  it("offers the guide of the install the id names and of those the picked items came from, to who may export", async () => {
    const w = await ws(); const ann = await w.person("owner"); const gus = await w.person("guest"); const actor = w.actor(ann);
    const id = await installPackFile(actor, WITH_GUIDE, yes);
    const offered = [{ installId: id, name: PACK.name, version: PACK.version, text: { whatItsFor: "For the **board**.", firstSteps: "1. Open Packs." } }];
    expect((await draftPackGuide(actor, PACK.id, {})).installed).toEqual(offered);
    expect((await draftPackGuide(actor, "northwind/board", {})).installed).toEqual([]);
    const marked = async (table: string) => ((await db().from(table).select("id").eq("workspace_id", w.id).eq("pack_install_id", id)).data ?? []).map((r) => Number(r.id));
    for (const choice of [{ catalog: await marked("catalog_metrics") }, { themes: await marked("themes") }, { designs: await marked("view_designs") }])
      expect((await draftPackGuide(actor, "northwind/board", choice)).installed).toEqual(offered);
    const entry = (await marked("catalog_metrics"))[0];
    const made = await w.metric(ann, { name: "From the Pack", from_catalog_id: entry });
    expect((await draftPackGuide(actor, "northwind/board", { metrics: [made.id] })).installed).toEqual(offered);
    // A Guest and an Access Key may not export, and another Workspace's person gets nothing by naming its ids.
    await expect(draftPackGuide(w.actor(gus, "guest"), PACK.id, {})).rejects.toThrow(Forbidden);
    await expect(draftPackGuide({ ...actor, key: { id: 1 } } as never, PACK.id, {})).rejects.toThrow(Forbidden);
    const other = await ws(); const eve = await other.person("owner");
    expect((await draftPackGuide(other.actor(eve), PACK.id, { themes: await marked("themes"), metrics: [made.id] })).installed).toEqual([]);
  });
});
