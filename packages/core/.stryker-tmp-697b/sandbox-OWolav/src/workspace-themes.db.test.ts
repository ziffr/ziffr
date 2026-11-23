// @ts-nocheck
// Standard Themes and Theme files against the real database (#506): only Owners and Admins add a standard Theme or
// import a file, both audited; every file is checked on the server; what is stored is only what the editor could save.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { auditLog } from "./audit-log";
import { db } from "./db";
import { STANDARD_THEMES } from "./standard-themes";
import { themeFileText, themeToFile } from "./theme-file";
import { cleanTokens } from "./theme-tokens";
import { workspace } from "./test/db-fixtures";
import { addStandardTheme, duplicateTheme, importTheme, MAX_WORKSPACE_THEMES, saveTheme } from "./workspace-themes";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }

const tokyo = STANDARD_THEMES.find((t) => t.key === "tokyo")!;
const file = JSON.stringify(themeToFile("Our look", tokyo.tokens, { ...tokyo.slides, footer: "Board meeting" }));
const themesOf = async (workspaceId: string) => ((await db().from("themes").select("id, name, tokens, slides").eq("workspace_id", workspaceId).order("id")).data ?? []);

describe("standard Themes and Theme files", () => {
  it("are added by Owners and Admins only, as ordinary Themes of the Workspace, and audited", async () => {
    const w = await ws(); const sara = await w.person("owner"); const adam = await w.person("admin"); const ben = await w.person("member");
    const id = await addStandardTheme(w.actor(adam, "admin"), "paris");
    await expect(addStandardTheme(w.actor(ben, "member"), "paris")).rejects.toThrow(Forbidden);
    await expect(addStandardTheme(w.actor(sara), "nope")).rejects.toThrow("no such standard Theme");
    const stored = (await themesOf(w.id)).find((t) => t.id === id)!;
    expect(stored.name).toBe("Paris");
    expect(cleanTokens(stored.tokens)).toEqual(STANDARD_THEMES.find((t) => t.key === "paris")!.tokens);
    const res = await importTheme(w.actor(sara), file);
    expect(res.ok).toBe(true);
    await expect(importTheme(w.actor(ben, "member"), file)).rejects.toThrow(Forbidden);
    const { events } = await auditLog(w.actor(sara));
    expect(events.filter((e) => e.kind.startsWith("theme.")).map((e) => [e.kind, e.objectName])).toEqual([["theme.imported", "Our look"], ["theme.added", "Paris"]]);
  });

  it("imports a file exactly as it describes the Theme: no image, the slide settings kept", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const res = await importTheme(w.actor(sara), file);
    const stored = (await themesOf(w.id)).find((t) => t.id === (res.ok ? res.id : 0))!;
    expect(stored.name).toBe("Our look");
    expect(stored.tokens).toEqual(tokyo.tokens);
    expect(stored.slides).toMatchObject({ logo: null, background_image: null, footer: "Board meeting" });
    // Round trip: the file of the imported Theme is the file that was imported.
    expect(themeFileText(themeToFile(stored.name, stored.tokens, stored.slides)).text).toBe(`${JSON.stringify(JSON.parse(file), null, 2)}\n`);
  });

  it("checks every file on the server and stores nothing that fails", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const base = JSON.parse(file);
    const bad: unknown[] = [
      "{", 42, "x".repeat(9_000),
      { ...base, name: "<script>alert(1)</script>" }, { ...base, name: "evil.example/x" },
      { ...base, colors: { ...base.colors, ink: "red; background:url(x)" } }, { ...base, colors: { ...base.colors, ink: "#12345" } },
      { ...base, colors: { ...base.colors, data: [] } }, { ...base, colors: { ...base.colors, data: Array(7).fill("#000000") } },
      { ...base, fonts: { ...base.fonts, body: "Comic Sans'; } body { display:none" } }, { ...base, fonts: { ...base.fonts, body: "https://evil.example/f.css" } },
      { ...base, slides: { logo: "data:image/svg+xml;base64,AAAA" } }, { ...base, slides: { footer: "see https://evil.example" } },
      { ...base, radius: 99 }, { ...base, cards: "glow" }, { ...base, extra: 1 }, { ...base, format: "ziffr.theme/9" },
    ];
    const before = (await themesOf(w.id)).length;
    for (const b of bad) expect((await importTheme(w.actor(sara), typeof b === "string" ? b : typeof b === "number" ? (b as never) : JSON.stringify(b))).ok, JSON.stringify(b)?.slice(0, 60)).toBe(false);
    expect((await themesOf(w.id)).length).toBe(before);
    const res = await importTheme(w.actor(sara), "{\n  \"format\": \"ziffr.theme/1\", \"name\": \"x\", \"colors\": { \"ink\": \"nope\" }\n}");
    expect(res.ok ? [] : res.problems.map((p) => p.line).filter(Boolean).length).toBeGreaterThan(0);
  });

  it("keeps a standard Theme's designed dark variant and the Appearance setting, and drops a dark variant that is not valid (#583)", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const paris = STANDARD_THEMES.find((t) => t.key === "paris")!;
    const id = await addStandardTheme(w.actor(sara), "paris");
    expect((await themesOf(w.id)).find((t) => t.id === id)!.tokens.dark).toEqual(paris.tokens.dark);
    await saveTheme(w.actor(sara), id, "Paris", { ...paris.tokens, appearance: "fixed" }, paris.slides);
    const fixed = (await themesOf(w.id)).find((t) => t.id === id)!.tokens;
    expect(fixed.appearance).toBe("fixed");
    expect(fixed.dark).toEqual(paris.tokens.dark);
    await saveTheme(w.actor(sara), id, "Paris", { ...paris.tokens, dark: { ...paris.tokens.dark!, ink: "nope" } }, paris.slides);
    const after = (await themesOf(w.id)).find((t) => t.id === id)!.tokens;
    expect(after).not.toHaveProperty("dark");
    expect(after).not.toHaveProperty("appearance");
  });

  it("keeps a Workspace to a sensible number of Themes", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const have = (await themesOf(w.id)).length;
    await db().from("themes").insert(Array.from({ length: MAX_WORKSPACE_THEMES - have }, (_, i) => ({ owner_id: sara, name: `T${i}`, tokens: tokyo.tokens, slides: tokyo.slides, workspace_id: w.id })));
    await expect(addStandardTheme(w.actor(sara), "oslo")).rejects.toThrow("at most");
    await expect(importTheme(w.actor(sara), file)).rejects.toThrow("at most");
    await expect(duplicateTheme(w.actor(sara), (await themesOf(w.id))[0].id)).rejects.toThrow("at most");
  });
});
