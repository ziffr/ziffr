// The guide kept with an install, against the real database (spec 0058, #1231; GLOSSARY: Pack Guide, Pack): the largest
// guide beside the largest logo is installed and updated, read by everyone who sees the installed Packs and by nobody
// else, replaced by an update and gone with the uninstall.
import { afterEach, describe, expect, it } from "vitest";
import { PACK_LOGO_MAX_BYTES } from "@ziffr/pack/logo";
import { PACK_GUIDE_LIMITS, type PackGuide } from "@ziffr/pack/pack-guide";
import { db } from "./db";
import { installPackFile, listInstalledPacks } from "./packs";
import { uninstallPack, updatePackFile } from "./pack-updates";
import { listInstalledGuides, readInstalledGuide } from "./installed-pack-guides";
import { PACK } from "./pack.test";
import { workspace } from "./test/db-fixtures";
import type { Actor } from "./actor";
import type { Pack } from "./pack";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const yes = { unsigned: true, assistantTexts: true };

const size = (g: PackGuide) => new TextEncoder().encode(JSON.stringify(g)).length;
/** A guide within 100 bytes of the largest size the format allows, starting with `word`. */
function largestGuide(word: string): PackGuide {
  const questions: NonNullable<PackGuide["questions"]> = [{ type: "text", text: word }];
  const guide: PackGuide = { questions };
  const room = () => PACK_GUIDE_LIMITS.bytes - size(guide);
  while (room() > 700) questions.push({ type: "text", text: "x".repeat(600) });
  const last = { type: "text" as const, text: "x" };
  questions.push(last);
  last.text = "x".repeat(1 + Math.min(room(), PACK_GUIDE_LIMITS.text - 1));
  return guide;
}

// A PNG of exactly the largest size a Pack's logo may have (as in pack-logo.db.test.ts).
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const LOGO = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(200), ...be32(100), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...be32(PACK_LOGO_MAX_BYTES - 45), ...Buffer.from("tEXt"), ...Buffer.from("x".repeat(PACK_LOGO_MAX_BYTES - 45)), 0, 0, 0, 0]).toString("base64")}`;

const withGuide = (guide: PackGuide | undefined, version = "1.2.0", logo?: string): string =>
  JSON.stringify({ ...PACK, format: "ziffr.pack/2", version, ...(logo ? { logo } : {}), ...(guide ? { guide } : {}) } satisfies Pack);
const short = (text: string): PackGuide => ({ whatItsFor: [{ type: "text", text }] });

describe("the guide an install keeps", () => {
  it("holds the largest guide beside the largest logo, at install and at update", async () => {
    const first = largestGuide("First");
    expect(size(first)).toBeGreaterThan(PACK_GUIDE_LIMITS.bytes - 100);
    expect(size(first)).toBeLessThanOrEqual(PACK_GUIDE_LIMITS.bytes);
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, withGuide(first, "1.2.0", LOGO), yes);
    expect(await readInstalledGuide(actor, id)).toEqual({ installId: id, name: PACK.name, version: "1.2.0", author: PACK.author.name, guide: first });
    const second = largestGuide("Second");
    await updatePackFile(actor, id, withGuide(second, "1.3.0", LOGO), yes);
    expect((await readInstalledGuide(actor, id))!.guide).toEqual(second);
    expect(((await db().from("pack_installs").select("manifest").eq("id", id).single()).data!.manifest as { logo: string }).logo).toBe(LOGO);
  });

  it("is replaced or removed by an update, and goes with the uninstall", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, withGuide(short("Old.")), yes);
    expect(await listInstalledGuides(actor)).toEqual([{ installId: id, name: PACK.name, version: "1.2.0" }]);
    expect((await listInstalledPacks(actor))[0].hasGuide).toBe(true);
    await updatePackFile(actor, id, withGuide(short("New."), "1.3.0"), yes);
    expect((await readInstalledGuide(actor, id))!.guide).toEqual(short("New."));
    await updatePackFile(actor, id, withGuide(undefined, "1.4.0"), yes);
    expect(await readInstalledGuide(actor, id)).toBeNull();
    expect(await listInstalledGuides(actor)).toEqual([]);
    expect((await listInstalledPacks(actor))[0].hasGuide).toBe(false);
    await updatePackFile(actor, id, withGuide(short("Back."), "1.5.0"), yes);
    await uninstallPack(actor, id);
    expect(await readInstalledGuide(actor, id)).toBeNull();
    expect(await listInstalledGuides(actor)).toEqual([]);
  });

  it("is read by those who see the installed Packs, in their own Workspace only", async () => {
    const w = await ws(); const o = await ws();
    const ann = await w.person("owner"); const mia = await w.person("member"); const gus = await w.person("guest"); const eve = await o.person("owner");
    const id = await installPackFile(w.actor(ann), withGuide(short("Ours.")), yes);
    expect((await readInstalledGuide(w.actor(mia, "member"), id))!.guide).toEqual(short("Ours."));
    expect((await listInstalledGuides(w.actor(mia, "member"))).map((g) => g.installId)).toEqual([id]);
    // A Guest, an Access Key of an Owner, and an Owner of another Workspace who names the install's id.
    const key = { ...w.actor(ann), key: { id: 1 } } as unknown as Actor;
    for (const actor of [w.actor(gus, "guest"), key, o.actor(eve)]) {
      expect(await readInstalledGuide(actor, id)).toBeNull();
      expect(await listInstalledGuides(actor)).toEqual([]);
    }
  });

  it("is not shown when what is stored no longer passes the checks", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, withGuide(short("Ours.")), yes);
    const { data } = await db().from("pack_installs").select("manifest").eq("id", id).single();
    await db().from("pack_installs").update({ manifest: { ...(data!.manifest as object), guide: short("<b>Not</b> text.") } }).eq("id", id);
    expect(await readInstalledGuide(actor, id)).toBeNull();
    expect(await listInstalledGuides(actor)).toEqual([]);
  });
});
