// What the pages need of a Pack's logo (spec 0039, ticket 3; GLOSSARY: Pack, Theme): the installed Pack's logo as a checked
// address for people of the Workspace only, the preview and the update plan carrying the checked logo, and the question
// asked before a Theme that shows a Pack's logo becomes the team default.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { installPackFile, listInstalledPacks, previewPack } from "./packs";
import { readPackUpdate } from "./pack-updates";
import { packLogo, packLogoAddress } from "./brand-logo";
import { saveTheme, themeLogoSource } from "./workspace-themes";
import { PACK } from "./pack.test";
import { workspace } from "./test/db-fixtures";
import type { Pack } from "./pack";
import type { ThemeSlides } from "./types";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const yes = { unsigned: true, assistantTexts: true };
const file = (p: unknown) => JSON.stringify(p);
const b64 = (b: Uint8Array | string) => Buffer.from(b).toString("base64");
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number) => `data:image/png;base64,${b64(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))}`;
const LOGO = png(200, 100);
const NEW = png(300, 100);
const THEME = PACK.contents.themes![0].theme;
const withLogo = (logo: string | undefined, version = "1.2.0"): Pack => ({
  ...PACK, version, ...(logo === undefined ? {} : { logo }),
  contents: { ...PACK.contents, themes: [{ key: "board", theme: { ...THEME, slides: { ...THEME.slides, ...(logo === undefined ? {} : { logo: "pack" as const }) } } }] },
});

describe("the installed Pack's logo address", () => {
  it("is listed for the Packs page and serves only people of the Workspace, never a Guest or another Workspace", async () => {
    const w = await ws(); const o = await ws();
    const ann = await w.person("owner"); const guest = await w.person("guest"); const eve = await o.person("owner");
    const id = await installPackFile(w.actor(ann), file(withLogo(LOGO)), yes);
    const [pack] = await listInstalledPacks(w.actor(ann));
    expect(pack.logo).toMatch(new RegExp(`^/api/packs/${id}/logo/[0-9a-f]{16}$`));
    const hash = pack.logo!.split("/").pop()!;
    expect(await packLogo(w.actor(ann), id, hash)).toMatchObject({ contentType: "image/png" });
    expect(await packLogo(w.actor(guest, "guest"), id, hash)).toBeNull();
    expect(await packLogo(o.actor(eve), id, hash)).toBeNull();
    expect(await packLogo(w.actor(ann), id, "0".repeat(16))).toBeNull();
    expect(await packLogo(w.actor(ann), id + 1, hash)).toBeNull();
    expect(await packLogo(w.actor(ann), id, "../../x")).toBeNull();
  });
  it("names no address for a Pack without a logo, and refuses a stored logo that no longer passes", async () => {
    const w = await ws(); const ann = await w.person("owner");
    const id = await installPackFile(w.actor(ann), file(PACK), yes);
    expect((await listInstalledPacks(w.actor(ann)))[0].logo).toBeNull();
    expect(packLogoAddress(w.id, id, "data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(packLogoAddress(w.id, id, undefined)).toBeNull();
  });
  it("changes with the picture, so a cached address never shows another picture", () => {
    expect(packLogoAddress("w", 1, LOGO)).not.toBe(packLogoAddress("w", 1, NEW));
    expect(packLogoAddress("w", 1, LOGO)).not.toBe(packLogoAddress("w", 2, LOGO));
  });
});

describe("the preview and the update plan", () => {
  it("carry the checked logo, and say which Theme comes with it", async () => {
    const w = await ws(); const ann = await w.person("owner");
    const res = await previewPack(w.actor(ann), file(withLogo(LOGO)), { source: "upload", signed: false });
    if (!res.ok) throw new Error("not ok");
    expect(res.preview.logo).toBe(LOGO);
    expect(res.preview.items.find((i) => i.kind === "theme")).toMatchObject({ logo: true });
    const none = await previewPack(w.actor(ann), file(PACK), { source: "upload", signed: false });
    if (!none.ok) throw new Error("not ok");
    expect(none.preview.logo).toBeNull();
  });
  it("show the old logo by its address and the new one, and whether it changed", async () => {
    const w = await ws(); const ann = await w.person("owner");
    const id = await installPackFile(w.actor(ann), file(withLogo(LOGO)), yes);
    const changed = await readPackUpdate(w.actor(ann), id, file(withLogo(NEW, "1.3.0")));
    if (!changed.ok) throw new Error("not ok");
    expect(changed.plan.logo).toMatchObject({ after: NEW, changed: true });
    expect(changed.plan.logo.before).toMatch(/^\/api\/packs\//);
    expect(changed.plan.author).toBe(PACK.author.name);
    const same = await readPackUpdate(w.actor(ann), id, file(withLogo(LOGO, "1.3.0")));
    if (!same.ok) throw new Error("not ok");
    expect(same.plan.logo.changed).toBe(false);
    const dropped = await readPackUpdate(w.actor(ann), id, file({ ...withLogo(undefined, "1.3.0") }));
    if (!dropped.ok) throw new Error("not ok");
    expect(dropped.plan.logo).toMatchObject({ after: null, changed: true });
  });
});

describe("whose logo a Theme shows", () => {
  it("names the Pack's author while the Theme's logo is exactly the Pack's, and nobody once it is another", async () => {
    const w = await ws(); const ann = await w.person("owner"); const bob = await w.person("member");
    await installPackFile(w.actor(ann), file(withLogo(LOGO)), yes);
    const t = (await db().from("themes").select("id, name, tokens, slides").eq("workspace_id", w.id).eq("pack_key", "board").single()).data!;
    expect(await themeLogoSource(w.actor(ann), t.id)).toEqual({ pack: PACK.name, author: PACK.author.name });
    await expect(themeLogoSource(w.actor(bob, "member"), t.id)).rejects.toThrow();
    await saveTheme(w.actor(ann), t.id, t.name, t.tokens, { ...(t.slides as ThemeSlides), logo: NEW });
    expect(await themeLogoSource(w.actor(ann), t.id)).toBeNull();
  });
});
