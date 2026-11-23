// @ts-nocheck
// Decks, Themes, templates and version history through the core, against the real database (ticket #14).
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createDeck, deleteDeck, saveDeck, setDeckTheme } from "./decks";
import { createDashboard, placeWidget, updateWidget } from "./dashboards";
import { share } from "./sharing";
import { deleteTheme, duplicateTheme, saveTheme, setDefaultTheme } from "./workspace-themes";
import { deleteTemplate, renameTemplate, saveTemplate } from "./templates";
import { listVersions, restoreVersion } from "./version-history";
import { STARTER_THEME } from "./themes";
import { workspace } from "./test/db-fixtures";
import { dashboardWidgets, deckDocuments, deckView } from "./page-data";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const deckWith = (metricId: number) => ({ store: { "shape:1": { type: "ziffr-widget", props: { metricIds: [metricId], settings: "{}" } } } });
const noEffects = { restoreWorkflow: async () => {} };
async function theme(w: Awaited<ReturnType<typeof ws>>, owner: string, isDefault = false) {
  const { data } = await db().from("themes").insert({ ...STARTER_THEME, owner_id: owner, is_default: isDefault, workspace_id: w.id }).select("id").single();
  return data!.id as number;
}

describe("decks", () => {
  it("are created by members, not Guests, and changed by owners and Editors, not Viewers", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    await expect(createDeck(w.actor(gus, "guest"), "Mine")).rejects.toEqual(forbidden);
    const d = await createDeck(w.actor(sara), "Board");
    await share(w.actor(sara), "deck", d, ben, "viewer");
    await expect(saveDeck(w.actor(ben, "member"), d, { store: {} })).rejects.toEqual(forbidden);
    await share(w.actor(sara), "deck", d, ben, "editor");
    await saveDeck(w.actor(ben, "member"), d, { store: {} });
    await expect(deleteDeck(w.actor(ben, "member"), d)).rejects.toEqual(forbidden);
  });
  it("take only Metrics the saver sees, and only Themes of the workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const secret = await w.metric(ben); const d = await createDeck(w.actor(sara), "Board");
    await expect(saveDeck(w.actor(sara), d, deckWith(secret.id))).rejects.toEqual(forbidden);
    const other = await ws("Other"); const zoe = await other.person("owner"); const theirs = await theme(other, zoe);
    await expect(setDeckTheme(w.actor(sara), d, theirs)).rejects.toEqual(forbidden);
  });
});

describe("Themes", () => {
  it("are changed by owners and admins of the workspace only", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const t = await theme(w, sara);
    await expect(saveTheme(w.actor(ben, "member"), t, "Mine", STARTER_THEME.tokens, STARTER_THEME.slides)).rejects.toEqual(forbidden);
    await expect(duplicateTheme(w.actor(ben, "member"), t)).rejects.toEqual(forbidden);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(saveTheme(other.actor(zoe), t, "Mine", STARTER_THEME.tokens, STARTER_THEME.slides)).rejects.toEqual(forbidden);
  });
  it("keep the default, and change the default of this workspace only", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const def = await theme(w, sara, true); const other = await theme(w, sara);
    await expect(deleteTheme(w.actor(sara), def)).rejects.toThrow(/default/);
    const b = await ws("B"); const zoe = await b.person("owner"); const theirDefault = await theme(b, zoe, true);
    await setDefaultTheme(w.actor(sara), other);
    expect((await db().from("themes").select("is_default").eq("id", theirDefault).single()).data!.is_default).toBe(true);
    expect((await db().from("themes").select("is_default").eq("id", def).single()).data!.is_default).toBe(false);
  });
  it("refuse tokens that are not valid", async () => {
    const w = await ws(); const sara = await w.person("owner"); const t = await theme(w, sara);
    await expect(saveTheme(w.actor(sara), t, "Bad", { ...STARTER_THEME.tokens, accent: "red; background:url(x)" }, STARTER_THEME.slides)).rejects.toThrow(/not valid/);
  });
});

describe("templates", () => {
  it("are published only from a widget the actor may change, and changed only by their creator", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara); const d = await createDashboard(w.actor(sara), "Board");
    await placeWidget(w.actor(sara), d, { type: "metric", id: m.id });
    const { data: widget } = await db().from("widgets").select("id").eq("dashboard_id", d).single();
    await share(w.actor(sara), "dashboard", d, ben, "viewer");
    await expect(saveTemplate(w.actor(ben, "member"), { widgetId: widget!.id, name: "T", description: "", labels: [], choices: {} })).rejects.toEqual(forbidden);
    const id = await saveTemplate(w.actor(sara), { widgetId: widget!.id, name: "T", description: "", labels: [], choices: {} });
    await expect(renameTemplate(w.actor(ben, "member"), id, "Mine", "")).rejects.toEqual(forbidden);
    await expect(deleteTemplate(w.actor(ben, "member"), id)).rejects.toEqual(forbidden);
  });
});

describe("version history", () => {
  it("is seen by those who see the object, and restored by those who may edit it", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara); const d = await createDashboard(w.actor(sara), "Board");
    await placeWidget(w.actor(sara), d, { type: "metric", id: m.id });
    await expect(listVersions(w.actor(ben, "member"), "dashboard", d)).rejects.toEqual(forbidden);
    await share(w.actor(sara), "dashboard", d, ben, "viewer");
    const { versions, canRestore } = await listVersions(w.actor(ben, "member"), "dashboard", d);
    expect(canRestore).toBe(false);
    await expect(restoreVersion(w.actor(ben, "member"), versions[0].id, noEffects)).rejects.toEqual(forbidden);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(restoreVersion(other.actor(zoe), versions[0].id, noEffects)).rejects.toEqual(forbidden);
  });
  it("brings back no Metric the restorer does not see, also when named in a widget's settings", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const own = await w.metric(sara, { name: "Open" }); const secret = await w.metric(sara, { name: "Secret" });
    const d = await createDashboard(w.actor(sara), "Board");
    await share(w.actor(sara), "dashboard", d, ben, "editor");
    await share(w.actor(sara), "metric", own.id, ben, "viewer");
    await share(w.actor(sara), "metric", secret.id, ben, "viewer");
    // Ben, an Editor who sees Secret for now, puts it into a story panel's settings.
    await placeWidget(w.actor(ben, "member"), d, { type: "metric", id: own.id });
    const { data: widget } = await db().from("widgets").select("id").eq("dashboard_id", d).single();
    await updateWidget(w.actor(ben, "member"), widget!.id, { settings: { panels: [{ type: "period-bars", metricIds: [secret.id] }] } as never });
    // Sara edits next (edits by one person within ten minutes merge into one version, so this makes a new one).
    await updateWidget(w.actor(sara), widget!.id, { settings: {} });
    const { versions } = await listVersions(w.actor(sara), "dashboard", d);
    const withSecret = versions.find((v, i) => i > 0 && v.author === ben)!;
    // Secret is no longer shared with Ben: restoring the version that showed it is refused.
    await share(w.actor(sara), "metric", secret.id, ben, null);
    await expect(restoreVersion(w.actor(ben, "member"), withSecret.id, noEffects)).rejects.toThrow(/not shared with you/);
  });
});

describe("after the review of #14", () => {
  it("refuses version types Ziffr does not know", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await expect(listVersions(w.actor(sara), "foo" as never, 1)).rejects.toEqual(forbidden);
  });
  it("leaves slides that draw left-out Metrics out of a deck's View Link", async () => {
    const { createViewLink, openViewLink } = await import("./view-links");
    const w = await ws(); const sara = await w.person("owner");
    const shown = await w.metric(sara, { name: "Revenue" }); const later = await w.metric(sara, { name: "Payroll" });
    const d = await createDeck(w.actor(sara), "Board");
    await saveDeck(w.actor(sara), d, deckWith(shown.id));
    const token = await createViewLink(w.actor(sara), "deck", d, { label: "", expires: new Date(Date.now() + 86400000).toISOString().slice(0, 10), frozen: false });
    await saveDeck(w.actor(sara), d, { store: { ...deckWith(shown.id).store, "shape:2": { type: "ziffr-widget", props: { metricIds: [later.id], settings: "{}" } } } });
    const view = await openViewLink(token);
    expect(Object.keys((view!.document as { store: object }).store)).toEqual(["shape:1"]);
    // Nor text added later: the link remembers the deck's shapes.
    await saveDeck(w.actor(sara), d, { store: { ...deckWith(shown.id).store, "shape:3": { type: "text", props: { text: "Layoffs next month" } }, "page:page": { type: "page" } } });
    const later2 = JSON.stringify((await openViewLink(token))!.document);
    expect(later2).not.toMatch(/Layoffs/);
    expect(later2).not.toMatch(/page:page/); // added after the link was made, so it stays out too
  });
});

describe("content from other sites (spec 0009)", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgo=";
  const outside = { store: { "asset:x": { id: "asset:x", typeName: "asset", type: "image", props: { src: "https://tracker.example/p.png" } }, "shape:x": { id: "shape:x", typeName: "shape", type: "image", props: { assetId: "asset:x" } } } };
  it("refuses it in a deck or a free layout, keeps uploaded images, and leaves it out when shown", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const d = await createDeck(w.actor(sara), "Board");
    await expect(saveDeck(w.actor(sara), d, outside)).rejects.toThrow(/another site/);
    await saveDeck(w.actor(sara), d, { store: { "asset:a": { id: "asset:a", typeName: "asset", type: "image", props: { src: PNG } } } });

    // A deck saved before the rule (written directly here) loads nothing from elsewhere.
    await db().from("decks").update({ document: outside }).eq("id", d);
    expect((await deckView(w.actor(sara), d))?.deck?.document).toEqual({ store: {} });
    expect((await deckDocuments(w.actor(sara)))[0].document).toEqual({ store: {} });

    // A free layout on a dashboard: refused on save, left out when shown.
    const dash = await createDashboard(w.actor(sara), "Main");
    const m = await w.metric(sara);
    await placeWidget(w.actor(sara), dash, { type: "metric", id: m.id });
    const [widget] = await dashboardWidgets(w.actor(sara), dash);
    await expect(updateWidget(w.actor(sara), widget.id, { settings: { canvas: { document: outside } } as never })).rejects.toThrow(/another site/);
    await db().from("widgets").update({ settings: { canvas: { document: outside } } }).eq("id", widget.id);
    const [shown] = await dashboardWidgets(w.actor(sara), dash);
    expect((shown.settings as { canvas: { document: unknown } }).canvas.document).toEqual({ store: {} });
  });
});
