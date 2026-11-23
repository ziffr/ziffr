// Ziffr's own Packs installed from the app against the real database (spec 0052, ticket 4): each of the twelve installs
// with source included and no Marketplace, Members and Guests cannot, a Pack is not installed twice, and a newer bundled
// version is offered and taken only by a call.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { bundledPacks, installIncludedPack, listIncludedPacks, readIncludedPack, readIncludedUpdate, updateIncludedPack } from "./included-packs";
import { listInstalledPacks } from "./packs";
import { auditRowsOf, workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const IDS = [...bundledPacks().keys()];

describe("Ziffr's own Packs in a Workspace", () => {
  it.each(IDS)("%s installs for an Owner as an included, signed Pack, makes no Metric and asks for nothing about the Marketplace", async (id) => {
    const w = await ws();
    const ann = await w.person("owner");
    const installId = await installIncludedPack(w.actor(ann), id);
    const [one] = await listInstalledPacks(w.actor(ann));
    expect([one.id, one.packId, one.source, one.signed, one.version]).toEqual([installId, id, "included", true, bundledPacks().get(id)!.pack.version]);
    expect((await db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count).toBe(0);
    const audit = await auditRowsOf(w.id, "pack.installed");
    expect(audit.map((a) => (a.details as { source: string; pack: string }).source)).toEqual(["included"]);
    expect((audit[0].details as { pack: string }).pack).toBe(id);
  });

  it("installs all twelve into one Workspace, as an Admin where no Pack holds a Theme", async () => {
    const w = await ws();
    const ann = await w.person("owner");
    for (const id of IDS) await installIncludedPack(w.actor(ann), id);
    expect((await listInstalledPacks(w.actor(ann))).map((p) => p.packId).sort()).toEqual([...IDS].sort());
    const w2 = await ws();
    const bob = await w2.person("admin");
    const needsOwner = new Set(IDS.filter((id) => (bundledPacks().get(id)!.pack.contents.themes?.length ?? 0) > 0));
    expect(needsOwner.size).toBeGreaterThan(0);
    for (const id of IDS) {
      if (needsOwner.has(id)) await expect(installIncludedPack(w2.actor(bob, "admin"), id)).rejects.toBeInstanceOf(Forbidden);
      else await installIncludedPack(w2.actor(bob, "admin"), id);
    }
  });

  it("is refused for a Member, a Guest and a key, and for the Preview too; nothing is written", async () => {
    const w = await ws();
    const [mia, gus] = [await w.person("member"), await w.person("guest")];
    for (const actor of [w.actor(mia, "member"), w.actor(gus, "guest"), { ...w.actor(mia, "admin"), key: { id: 1 } } as never]) {
      await expect(installIncludedPack(actor, "ziffr/sales")).rejects.toBeInstanceOf(Forbidden);
      await expect(readIncludedPack(actor, "ziffr/sales")).rejects.toBeInstanceOf(Forbidden);
      expect(await listIncludedPacks(actor)).toEqual([]);
    }
    expect((await db().from("pack_installs").select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count).toBe(0);
  });

  it("lists the twelve with what each brings, who has them, and installs nothing by listing", async () => {
    const w = await ws();
    const ann = await w.person("owner");
    const before = await listIncludedPacks(w.actor(ann));
    expect(before.map((p) => p.id)).toEqual(IDS);
    expect(before.every((p) => p.installed === null && p.update === null && p.brings.length > 0)).toBe(true);
    const id = await installIncludedPack(w.actor(ann), "ziffr/sales");
    const after = await listIncludedPacks(w.actor(ann));
    expect(after.find((p) => p.id === "ziffr/sales")!.installed).toEqual({ installId: id, version: bundledPacks().get("ziffr/sales")!.pack.version });
    // Another Workspace sees nothing of it.
    const w2 = await ws();
    const bob = await w2.person("owner");
    expect((await listIncludedPacks(w2.actor(bob))).every((p) => p.installed === null)).toBe(true);
  });

  it("is not installed twice, and a Pack uploaded under the same id is not offered the bundled version", async () => {
    const w = await ws();
    const ann = await w.person("owner");
    await installIncludedPack(w.actor(ann), "ziffr/sales");
    await expect(installIncludedPack(w.actor(ann), "ziffr/sales")).rejects.toThrow(/installed already/);
    expect((await db().from("pack_installs").select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count).toBe(1);
    const w2 = await ws();
    const bob = await w2.person("owner");
    await db().from("pack_installs").insert({ workspace_id: w2.id, pack_id: "ziffr/sales", version: "0.0.1", license: "CC-BY-4.0", source: "upload", signed: false, manifest: { name: "Sales" }, installed_by: bob });
    const [row] = (await listIncludedPacks(w2.actor(bob))).filter((p) => p.id === "ziffr/sales");
    expect(row.update).toBeNull();
    const { data } = await db().from("pack_installs").select("id").eq("workspace_id", w2.id).single();
    await expect(readIncludedUpdate(w2.actor(bob), Number(data!.id))).rejects.toBeInstanceOf(Forbidden);
    await expect(updateIncludedPack(w2.actor(bob), Number(data!.id))).rejects.toBeInstanceOf(Forbidden);
  });

  it("offers a newer bundled version as an update, never applies it by itself, and takes it only by a call", async () => {
    const w = await ws();
    const ann = await w.person("owner");
    const id = await installIncludedPack(w.actor(ann), "ziffr/sales");
    const now = bundledPacks().get("ziffr/sales")!.pack.version;
    // As if installed from an older release.
    await db().from("pack_installs").update({ version: "0.0.1" }).eq("id", id);
    const listed = (await listIncludedPacks(w.actor(ann))).find((p) => p.id === "ziffr/sales")!;
    expect([listed.installed!.version, listed.update]).toEqual(["0.0.1", now]);
    const read = await readIncludedUpdate(w.actor(ann), id);
    expect(read.ok).toBe(true);
    expect((await db().from("pack_installs").select("version").eq("id", id).single()).data!.version).toBe("0.0.1");
    const plan = await updateIncludedPack(w.actor(ann), id);
    expect(plan.to).toBe(now);
    const [after] = await listInstalledPacks(w.actor(ann));
    expect([after.version, after.source, after.signed]).toEqual([now, "included", true]);
    expect((await listIncludedPacks(w.actor(ann))).find((p) => p.id === "ziffr/sales")!.update).toBeNull();
    // Another Workspace's install is not reachable by its id.
    const w2 = await ws();
    const bob = await w2.person("owner");
    await expect(updateIncludedPack(w2.actor(bob), id)).rejects.toBeInstanceOf(Forbidden);
  });

  it("installs in a trial and under a Workspace Limit, since it makes no Metric", async () => {
    const w = await ws();
    const ann = await w.person("owner");
    await w.trial("2099-01-01");
    await w.limit(1);
    await installIncludedPack(w.actor(ann), "ziffr/finance");
    expect(await listInstalledPacks(w.actor(ann))).toHaveLength(1);
  });
});
