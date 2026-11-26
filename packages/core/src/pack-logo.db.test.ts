// Installing a Pack's logo against the real database (spec 0039, ticket 2; GLOSSARY: Pack, Theme): the logo is checked
// again at install and only its cleaned form is stored, a Theme saying "pack" gets it, nothing becomes the team default,
// the item hash covers it, and an Owner's own changes are never overwritten.
import { afterEach, describe, expect, it } from "vitest";
import { PACK_LOGO_MAX_BYTES } from "@ziffr/pack/logo";
import { db } from "./db";
import { installPackFile, itemHash, packLogoOf, storedItems, themeHashInput } from "./packs";
import { readPackUpdate, readUninstall, takeNewVersion, updatePackFile, uninstallPack } from "./pack-updates";
import { brandLogo, hashOf } from "./brand-logo";
import { saveTheme, setDefaultTheme } from "./workspace-themes";
import { PACK } from "./pack.test";
import { workspace, opened } from "./test/db-fixtures";
import type { Pack } from "./pack";
import type { ThemeSlides, ThemeTokens } from "./types";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const yes = { unsigned: true, assistantTexts: true };
const file = (p: unknown) => JSON.stringify(p);

const b64 = (b: Uint8Array | string) => Buffer.from(b).toString("base64");
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number, text = "") => `data:image/png;base64,${b64(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...be32(text.length), ...Buffer.from("tEXt"), ...Buffer.from(text), 0, 0, 0, 0]))}`;
const svg = (s: string) => `data:image/svg+xml;base64,${b64(s)}`;
const LOGO = png(200, 100);
const OTHER = png(300, 100);

const THEME = PACK.contents.themes![0].theme;
const withLogo = (logo: string | undefined, themeLogo: boolean = true, version = "1.2.0"): Pack => ({
  ...PACK, version, ...(logo === undefined ? {} : { logo }),
  contents: { ...PACK.contents, themes: [{ key: "board", theme: { ...THEME, slides: { ...THEME.slides, ...(themeLogo ? { logo: "pack" as const } : {}) } } }] },
});
const theme = async (workspaceId: string) => (await db().from("themes").select("id, is_default, slides, tokens, name, pack_hash, pack_install_id").eq("workspace_id", workspaceId).eq("pack_key", "board").maybeSingle()).data;

describe("a Pack's logo at install", () => {
  it("keeps the logo with the install and puts it into a Theme that says pack, never as the team default, and audits it", async () => {
    const w = await ws(); const ann = await w.person("owner");
    const id = await installPackFile(w.actor(ann), file(withLogo(LOGO)), yes);
    const { data: install } = await db().from("pack_installs").select("manifest").eq("id", id).single();
    expect((install!.manifest as { logo: string }).logo).toBe(LOGO);
    const t = await theme(w.id);
    expect(t).toMatchObject({ is_default: false });
    expect(t!.slides).toMatchObject({ logo: LOGO, logo_ratio: 2 });
    expect((await db().from("themes").select("id").eq("workspace_id", w.id).eq("is_default", true)).data).toEqual([]);
    expect(t!.pack_hash).toBe(itemHash(themeHashInput(t!.name, t!.tokens, t!.slides, LOGO)));
    expect(t!.pack_hash).not.toBe(itemHash({ name: t!.name, tokens: t!.tokens, slides: t!.slides }));
    const events = await opened("audit_events", w.id, (await db().from("audit_events").select("id, details").eq("workspace_id", w.id).eq("kind", "pack.installed")).data, { dropId: true });
    expect(events).toEqual([{ details: { pack: "ziffr/saas-metrics", version: "1.2.0", source: "upload", signed: false, logo: true, themes_with_logo: 1 } }]);
  });

  it("leaves a Theme without \"pack\" without a logo, and a Pack without a logo as it was", async () => {
    const w = await ws(); const ann = await w.person("owner");
    await installPackFile(w.actor(ann), file(withLogo(LOGO, false)), yes);
    expect((await theme(w.id))!.slides).toMatchObject({ logo: null, logo_ratio: 3 });
    const v = await ws(); const bob = await v.person("owner");
    const id = await installPackFile(v.actor(bob), file(PACK), yes);
    expect((await db().from("pack_installs").select("manifest").eq("id", id).single()).data!.manifest).not.toHaveProperty("logo");
    expect((await theme(v.id))!.pack_hash).toBe(itemHash({ name: PACK.contents.themes![0].theme.name, tokens: (await theme(v.id))!.tokens, slides: (await theme(v.id))!.slides }));
  });

  it("stores an SVG only in the form Ziffr wrote out itself", async () => {
    const w = await ws(); const ann = await w.person("owner");
    const messy = svg('<?xml version="1.0"?><!-- hand made --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><rect width="40" height="10" fill="#2F5BEA"/></svg>');
    await installPackFile(w.actor(ann), file(withLogo(messy)), yes);
    const t = await theme(w.id);
    const stored = (t!.slides as { logo: string }).logo;
    expect(stored).not.toBe(messy);
    expect(Buffer.from(stored.split(",")[1], "base64").toString()).not.toContain("hand made");
    expect((t!.slides as { logo_ratio: number }).logo_ratio).toBe(4);
  });

  it("refuses a hostile logo inside an otherwise valid Pack, and leaves nothing behind", async () => {
    const hostile = [
      svg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      svg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
      svg('<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>'),
      png(4000, 4000), "data:text/html;base64," + b64("<script>1</script>"), "data:image/png;base64," + b64("only text"), "https://evil.example/logo.png",
    ];
    for (const logo of hostile) {
      const w = await ws(); const ann = await w.person("owner");
      // The file may say whatever it likes about itself, such as that it was checked: the server checks it again.
      await expect(installPackFile(w.actor(ann), file({ ...withLogo(logo), checked: true, logoChecked: true }), yes)).rejects.toThrow(/cannot be installed/);
      expect((await db().from("pack_installs").select("id").eq("workspace_id", w.id)).data).toEqual([]);
      expect(await theme(w.id)).toBeNull();
    }
  });

  it("checks the logo again when the Pack was not read from a file, and never stores what fails", () => {
    const bad = { ...withLogo(LOGO), logo: svg('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>') } as Pack;
    expect(() => packLogoOf(bad)).toThrow(/not a picture Ziffr keeps/);
    expect(() => storedItems(bad)).toThrow(/not a picture Ziffr keeps/);
    expect(() => storedItems({ ...bad, logo: png(10, 10, "x".repeat(130_000)) } as Pack)).toThrow(/not a picture/);
    expect(packLogoOf({})).toBeNull();
  });

  it("serves the installed logo only through the checked address of the Workspace that holds it", async () => {
    const w = await ws(); const o = await ws(); const ann = await w.person("owner");
    await installPackFile(w.actor(ann), file(withLogo(LOGO)), yes);
    const { createHash } = await import("node:crypto");
    const plain = createHash("sha256").update(LOGO).digest("hex").slice(0, 16);
    const hash = hashOf(w.id, LOGO);
    expect(await brandLogo(w.id, plain)).toBeNull(); // the plain hash of the picture no longer opens it
    expect(hash).not.toBe(hashOf(o.id, LOGO));
    const got = await brandLogo(w.id, hash);
    expect(got).toMatchObject({ contentType: "image/png" });
    expect(await brandLogo(o.id, hash)).toBeNull();
  });
});

describe("a logo of the largest size a Pack may bring", () => {
  // A PNG of exactly that many bytes (45 of them are the picture's own, the rest a text chunk). The install keeps it in
  // its manifest, so the database needs room for it (#1234).
  const LARGEST = png(200, 100, "x".repeat(PACK_LOGO_MAX_BYTES - 45));
  const kept = async (id: number) => ((await db().from("pack_installs").select("manifest").eq("id", id).single()).data!.manifest as { logo: string }).logo;

  it("is installed, and kept with the install and the Theme", async () => {
    expect(Buffer.from(LARGEST.split(",")[1], "base64")).toHaveLength(PACK_LOGO_MAX_BYTES);
    const w = await ws(); const ann = await w.person("owner");
    const id = await installPackFile(w.actor(ann), file(withLogo(LARGEST)), yes);
    expect(await kept(id)).toBe(LARGEST);
    expect((await theme(w.id))!.slides).toMatchObject({ logo: LARGEST });
  });

  it("comes with an update too", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, file(withLogo(LOGO)), yes);
    await updatePackFile(actor, id, file(withLogo(LARGEST, true, "1.3.0")), yes);
    expect(await kept(id)).toBe(LARGEST);
  });
});

describe("the item hash with a logo", () => {
  async function installed() {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, file(withLogo(LOGO)), yes);
    return { w, actor, id, t: (await theme(w.id))! };
  }
  const changed = async (actor: ReturnType<Awaited<ReturnType<typeof ws>>["actor"]>, id: number, next: Pack) => {
    const res = await readPackUpdate(actor, id, file(next));
    if (!res.ok) throw new Error(JSON.stringify(res.problems));
    return res.plan.items.find((i) => i.key === "board")!;
  };

  it("counts an Owner's own logo, replacing or removing the Pack's, as a change", async () => {
    const { actor, id, t } = await installed();
    const save = (logo: string | null) => saveTheme(actor, t.id, t.name, t.tokens as ThemeTokens, { ...(t.slides as ThemeSlides), logo, logo_ratio: 3 });
    expect((await changed(actor, id, withLogo(LOGO, true, "1.2.1"))).changedHere).toBe(false);
    await save(OTHER);
    expect((await changed(actor, id, withLogo(LOGO, true, "1.2.1"))).changedHere).toBe(true);
    await save(png(9, 9));
    expect((await changed(actor, id, withLogo(LOGO, true, "1.2.1"))).changedHere).toBe(true);
    await save(null);
    expect((await changed(actor, id, withLogo(LOGO, true, "1.2.1"))).changedHere).toBe(true);
    await save(LOGO);
    expect((await changed(actor, id, withLogo(LOGO, true, "1.2.1"))).changedHere).toBe(false);
  });

  it("never overwrites a Theme the Workspace changed with the Pack's new logo, and gives it to an unchanged one", async () => {
    const a = await installed();
    const next = withLogo(OTHER, true, "1.3.0");
    await updatePackFile(a.actor, a.id, file(next), yes);
    expect(((await theme(a.w.id))!.slides as { logo: string }).logo).toBe(OTHER);

    const b = await installed();
    await saveTheme(b.actor, b.t.id, "Ours", b.t.tokens as ThemeTokens, { ...(b.t.slides as ThemeSlides), logo: png(50, 50), logo_ratio: 1 });
    await updatePackFile(b.actor, b.id, file(next), yes);
    expect(((await theme(b.w.id))!.slides as { logo: string }).logo).toBe(png(50, 50));
  });
});

describe("an Owner's own logo through an update", () => {
  it("counts as a change: the Theme stays as the Owner made it, also as the team default, and the new version is offered", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, file(withLogo(undefined, false)), yes);
    const t = (await theme(w.id))!;
    await saveTheme(actor, t.id, t.name, t.tokens as ThemeTokens, { ...(t.slides as ThemeSlides), logo: OTHER, logo_ratio: 3 });
    await setDefaultTheme(actor, t.id);
    const next = withLogo(LOGO, true, "1.3.0");
    next.contents.themes![0].theme = { ...next.contents.themes![0].theme, name: "Board, new" };
    await updatePackFile(actor, id, file(next), yes);
    const after = (await db().from("themes").select("name, slides, is_default, pack_offer").eq("id", t.id).single()).data!;
    expect(after.name).toBe(t.name);
    expect((after.slides as { logo: string }).logo).toBe(OTHER);
    expect(after.is_default).toBe(true);
    expect(after.pack_offer).not.toBeNull();
    const events = await opened("audit_events", w.id, (await db().from("audit_events").select("id, details").eq("workspace_id", w.id).eq("kind", "pack.updated")).data, { dropId: true });
    expect(events).toEqual([{ details: { pack: "ziffr/saas-metrics", from: "1.2.0", version: "1.3.0", source: "upload", logo: "added" } }]);
  });
});

describe("uninstalling with a logo", () => {
  it("removes the install's record and logo, and a kept Theme keeps the logo it holds", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, file(withLogo(LOGO)), yes);
    const t = (await theme(w.id))!;
    await saveTheme(actor, t.id, "Ours", t.tokens as ThemeTokens, t.slides as ThemeSlides);
    await uninstallPack(actor, id);
    expect((await db().from("pack_installs").select("id").eq("id", id)).data).toEqual([]);
    const kept = (await db().from("themes").select("slides, pack_install_id").eq("id", t.id).single()).data!;
    expect(kept.pack_install_id).toBeNull();
    expect((kept.slides as { logo: string }).logo).toBe(LOGO);
  });
});

describe("a new version without a logo, or with another, for the Themes", () => {
  it("takes the logo away from an unchanged Theme, and leaves a changed one as it is", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, file(withLogo(LOGO)), yes);
    await updatePackFile(actor, id, file(withLogo(undefined, false, "1.3.0")), yes);
    expect(((await theme(w.id))!.slides as { logo: unknown }).logo).toBeNull();

    const w2 = await ws(); const bea = await w2.person("owner"); const actor2 = w2.actor(bea);
    const id2 = await installPackFile(actor2, file(withLogo(LOGO)), yes);
    const t = (await theme(w2.id))!;
    await saveTheme(actor2, t.id, "Ours", t.tokens as ThemeTokens, t.slides as ThemeSlides);
    await updatePackFile(actor2, id2, file(withLogo(undefined, false, "1.3.0")), yes);
    expect(((await theme(w2.id))!.slides as { logo: string }).logo).toBe(LOGO);
  });

  it("Take the new version gives the Pack's new logo to a Theme that still has the old one, and never replaces the Owner's own", async () => {
    const make = async (own: string | null | undefined) => {
      const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
      const id = await installPackFile(actor, file(withLogo(LOGO)), yes);
      const t = (await theme(w.id))!;
      await saveTheme(actor, t.id, "Ours", t.tokens as ThemeTokens, { ...(t.slides as ThemeSlides), ...(own === undefined ? {} : { logo: own, logo_ratio: 3 }) });
      const next = withLogo(OTHER, true, "1.3.0");
      await updatePackFile(actor, id, file(next), yes);
      await takeNewVersion(actor, "themes", t.id);
      return (await theme(w.id))!;
    };
    const kept = await make(undefined);
    expect((kept.slides as { logo: string }).logo).toBe(OTHER);
    expect(kept.name).toBe(THEME.name);
    expect(((await make(png(50, 50))).slides as { logo: string }).logo).toBe(png(50, 50));
    expect(((await make(null)).slides as { logo: unknown }).logo).toBeNull();
  });
});

const byId = async (id: number) => (await db().from("themes").select("slides").eq("id", id).single()).data!;
describe("uninstalling and the Pack's logo in kept Themes", () => {
  async function kept(own?: string) {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, file(withLogo(LOGO)), yes);
    const t = (await theme(w.id))!;
    await saveTheme(actor, t.id, "Ours", t.tokens as ThemeTokens, { ...(t.slides as ThemeSlides), ...(own ? { logo: own, logo_ratio: 3 } : {}) });
    return { w, actor, id, t };
  }
  it("lists the Themes that still show it, and removes it only when asked", async () => {
    const a = await kept();
    expect((await readUninstall(a.actor, a.id)).logo).toEqual({ author: PACK.author.name, themes: ["Ours"] });
    await uninstallPack(a.actor, a.id);
    expect(((await byId(a.t.id)).slides as { logo: string }).logo).toBe(LOGO);

    const b = await kept();
    await uninstallPack(b.actor, b.id, { removeLogo: true });
    expect((await byId(b.t.id)).slides).toMatchObject({ logo: null, logo_ratio: 3 });
    const events = await opened("audit_events", b.w.id, (await db().from("audit_events").select("id, details").eq("workspace_id", b.w.id).eq("kind", "pack.uninstalled")).data, { dropId: true });
    expect(events).toEqual([{ details: { pack: "ziffr/saas-metrics", version: "1.2.0", removed: 8, kept: 1, logo_removed_from: 1 } }]);
  });
  it("never touches a logo the Owner chose", async () => {
    const c = await kept(OTHER);
    expect((await readUninstall(c.actor, c.id)).logo).toBeNull();
    await uninstallPack(c.actor, c.id, { removeLogo: true });
    expect(((await byId(c.t.id)).slides as { logo: string }).logo).toBe(OTHER);
  });
});
