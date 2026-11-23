// @ts-nocheck
// Dashboards by Tag against the real database (GLOSSARY: Tag; spec 0038, ticket #660): a widget of "all Metrics tagged X"
// shows each viewer only the tagged Metrics they may see themselves, a dashboard's Share never opens a Metric through a Tag,
// a View Link needs the list fixed first, a deck and a Snapshot record the Metrics of the moment, and a template makes a Slot.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Forbidden, Refused } from "./actor";
import { deckSeed } from "./conversions";
import { createDashboard, placeWidget, updateWidget } from "./dashboards";
import { createDeck, saveDeck } from "./decks";
import { createDashboardFromTemplate, listDashboardTemplates } from "./dashboard-templates";
import { visibleMetricIds } from "./access";
import { dashboardWidgets } from "./page-data";
import { share } from "./sharing";
import { fixTagLists } from "./tag-lists";
import { visibleTags } from "./tag-sight";
import { deleteTag, mergeTags, setMetricTags } from "./tags";
import { saveDashboardTemplate } from "./templates";
import { workspace } from "./test/db-fixtures";
import { buildView, createViewLink } from "./view-links";
import { getMetrics } from "./workspace-data";
import { forgetWorkspaceKey } from "./workspace-keys";
import { db } from "./db";

const saved = process.env.ZIFFR_SECRETS_KEY;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 60).toString("base64"); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY;
  else process.env.ZIFFR_SECRETS_KEY = saved;
}, 120_000);

/** Sara owns three Metrics tagged `shop` and a dashboard with a Tag widget, shared with Mia, who sees one of the Metrics on her own. */
async function setup() {
  const w = await workspace("Tag dashboards");
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  const sara = await w.person("owner");
  const mia = await w.person("member");
  const a = await w.metric(sara, { name: "Alpha" });
  const b = await w.metric(sara, { name: "Bravo" });
  const c = await w.metric(sara, { name: "Charlie" });
  const as = { sara: w.actor(sara, "owner"), mia: w.actor(mia, "member") };
  for (const m of [a, b, c]) await setMetricTags(as.sara, m.id, ["shop"]);
  await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: b.id, user_id: mia, role: "viewer" });
  const shop = (await visibleTags(as.sara))[0].id;
  const dashboard = await createDashboard(as.sara, "Shops");
  const widget = await placeWidget(as.sara, dashboard, { type: "spec", template: "matrix", metricIds: [], settings: { tagSource: { id: shop } } });
  await share(as.sara, "dashboard", dashboard, mia, "viewer");
  return { ...w, sara, mia, a, b, c, as, shop, dashboard, widget };
}

const drawn = async (t: Awaited<ReturnType<typeof setup>>, who: "sara" | "mia") => (await dashboardWidgets(t.as[who], t.dashboard))[0];

describe("a widget of all Metrics tagged X", () => {
  it("shows each viewer the tagged Metrics they see themselves, by name, and says nothing of the others", async () => {
    const t = await setup();
    expect((await drawn(t, "sara")).metric_ids).toEqual([t.a.id, t.b.id, t.c.id]);
    const mia = await drawn(t, "mia");
    expect(mia.metric_ids).toEqual([t.b.id]);
    expect(mia.settings.tagView).toEqual({ name: "shop", more: 0, removed: false });
    // Stored without a list: nothing of what anyone sees is kept in the widget.
    const { data } = await db().from("widgets").select("metric_ids").eq("id", t.widget).single();
    expect(data?.metric_ids).toEqual([]);
  });

  it("never opens a Metric through the dashboard's Share, also for one tagged after it was shared", async () => {
    const t = await setup();
    const hidden = await t.metric(t.sara, { name: "Delta" });
    await setMetricTags(t.as.sara, hidden.id, ["shop"]);
    const seen = await visibleMetricIds(t.id, t.mia, await getMetrics(t.id));
    expect([...seen]).toEqual([t.b.id]);
    expect((await drawn(t, "mia")).metric_ids).toEqual([t.b.id]);
    // A fixed widget on the same dashboard still opens its Metric, as it always did.
    await placeWidget(t.as.sara, t.dashboard, { type: "metric", id: t.c.id });
    expect([...(await visibleMetricIds(t.id, t.mia, await getMetrics(t.id)))].sort((x, y) => x - y)).toEqual([t.b.id, t.c.id].sort((x, y) => x - y));
  });

  it("can be set only to a Tag the person sees, and only on a view of a list of Metrics", async () => {
    const t = await setup();
    const other = await t.metric(t.sara, { name: "Hidden" });
    await setMetricTags(t.as.sara, other.id, ["secret"]);
    const secret = (await visibleTags(t.as.sara)).find((x) => x.name === "secret")!.id;
    const mine = await createDashboard(t.as.mia, "Mine");
    await expect(placeWidget(t.as.mia, mine, { type: "spec", template: "matrix", metricIds: [], settings: { tagSource: { id: secret } } })).rejects.toBeInstanceOf(Forbidden);
    await expect(placeWidget(t.as.mia, mine, { type: "spec", template: "matrix", metricIds: [], settings: { tagSource: { id: "not a tag" } } })).rejects.toBeInstanceOf(Refused);
    await expect(placeWidget(t.as.mia, mine, { type: "spec", template: "number", metricIds: [], settings: { tagSource: { id: t.shop } } })).rejects.toBeInstanceOf(Refused);
    await placeWidget(t.as.mia, mine, { type: "spec", template: "matrix", metricIds: [], settings: { tagSource: { id: t.shop } } });
    // A viewer of a dashboard changes nothing on it.
    await expect(updateWidget(t.as.mia, t.widget, { settings: { tagSource: { id: t.shop } } })).rejects.toBeInstanceOf(Forbidden);
  });

  it("keeps no list when a browser sends one back, and refuses to drop the Tag without a list", async () => {
    const t = await setup();
    await updateWidget(t.as.sara, t.widget, { settings: { tagSource: { id: t.shop }, tagView: { name: "x", more: 1, removed: false } }, metricIds: [t.a.id] });
    const { data } = await db().from("widgets").select("metric_ids, settings").eq("id", t.widget).single();
    expect(data?.metric_ids).toEqual([]);
    expect(data?.settings.tagView).toBeUndefined();
    await expect(updateWidget(t.as.sara, t.widget, { settings: {} })).rejects.toBeInstanceOf(Refused);
    await updateWidget(t.as.sara, t.widget, { settings: {}, metricIds: [t.a.id, t.b.id] });
    // The list is now fixed, so the dashboard's Share opens what it names, as it does for any fixed widget.
    expect((await drawn(t, "mia")).metric_ids).toEqual([t.a.id, t.b.id]);
  });

  it("follows a merged Tag, and says a removed Tag was removed to those who edit the dashboard only", async () => {
    const t = await setup();
    const extra = await t.metric(t.sara, { name: "Echo" });
    await setMetricTags(t.as.sara, extra.id, ["store"]);
    const store = (await visibleTags(t.as.sara)).find((x) => x.name === "store")!.id;
    await mergeTags(t.as.sara, t.shop, store);
    expect((await drawn(t, "sara")).metric_ids).toEqual([t.a.id, t.b.id, t.c.id, extra.id]);
    await deleteTag(t.as.sara, store);
    const owner = await drawn(t, "sara");
    expect(owner.metric_ids).toEqual([]);
    expect(owner.settings.tagView).toEqual({ name: null, more: 0, removed: true });
    // A viewer is told the same as for a Tag whose Metrics they cannot see.
    expect((await drawn(t, "mia")).settings.tagView).toEqual({ name: null, more: 0, removed: false });
  });
});

describe("a View Link, a deck and a template", () => {
  it("needs the list fixed before a View Link, and fixing it is for the owner and Editors", async () => {
    const t = await setup();
    const input = { label: "Board", expires: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), frozen: false };
    await expect(createViewLink(t.as.sara, "dashboard", t.dashboard, input)).rejects.toBeInstanceOf(Refused);
    await expect(fixTagLists(t.as.mia, t.dashboard)).rejects.toBeInstanceOf(Forbidden);
    expect(await fixTagLists(t.as.sara, t.dashboard)).toBe(1);
    const fixed = await drawn(t, "mia");
    expect(fixed.settings.tagSource).toBeUndefined();
    expect(fixed.metric_ids).toEqual([t.a.id, t.b.id, t.c.id]);
    expect(await createViewLink(t.as.sara, "dashboard", t.dashboard, input)).toMatch(/\S+/);
  });

  it("records the Metrics of the person doing it when a dashboard becomes a deck", async () => {
    const t = await setup();
    const seed = await deckSeed(t.as.mia, t.dashboard);
    expect(seed.widgets[0].metric_ids).toEqual([t.b.id]);
    expect(seed.widgets[0].settings.tagSource).toBeUndefined();
  });

  it("becomes a Slot with a neutral name that no one reads the Tag in, which a person fills with a Tag again", async () => {
    const t = await setup();
    const id = await saveDashboardTemplate(t.as.sara, { dashboardId: t.dashboard, name: "Weekly", description: "", labels: [] });
    const [tpl] = (await listDashboardTemplates(t.as.sara)).filter((x) => x.id === id);
    expect(tpl.slots).toEqual([{ label: "Tagged Metrics", multiple: true, exampleIds: [] }]);
    // A Member who sees no Metric with the Tag reads the template and finds neither its name nor its id.
    const nia = t.actor(await t.person("member"), "member");
    expect(JSON.stringify(await listDashboardTemplates(nia))).not.toMatch(/shop/i);
    expect(JSON.stringify(await listDashboardTemplates(nia))).not.toContain(t.shop);
    expect(tpl.tagFillable).toEqual([true]);
    // Filled by a Tag: a Tag widget. Filled by hand: a list. A Tag the person does not see is refused.
    const viaTag = await createDashboardFromTemplate(t.as.mia, { template: id, name: "By Tag", fills: [[]], tagFills: [t.shop] });
    const { data: w1 } = await db().from("widgets").select("metric_ids, settings").eq("dashboard_id", viaTag);
    expect(w1?.[0].metric_ids).toEqual([]);
    expect(w1?.[0].settings.tagSource).toEqual({ id: t.shop });
    const byHand = await createDashboardFromTemplate(t.as.mia, { template: id, name: "By hand", fills: [[t.b.id]] });
    const { data: w2 } = await db().from("widgets").select("metric_ids, settings").eq("dashboard_id", byHand);
    expect(w2?.[0].metric_ids).toEqual([t.b.id]);
    expect(w2?.[0].settings.tagSource).toBeUndefined();
    await expect(createDashboardFromTemplate(t.as.mia, { template: id, name: "x", fills: [[]], tagFills: ["00000000-0000-4000-8000-000000000000"] })).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("a Tag widget placed inside another thing", () => {
  it("keeps no Tag and no Tag name when it sits in a free layout or on a deck slide", async () => {
    const t = await setup();
    const inner = { template: "matrix", metricIds: [t.b.id], settings: JSON.stringify({ tagSource: { id: t.shop }, tagView: { name: "shop", more: 0, removed: false } }) };
    const layout = { canvas: { document: { store: { "shape:w": { type: "ziffr-widget", props: inner } } }, stamp: {} } };
    const mine = await createDashboard(t.as.mia, "Layouts");
    const canvasWidget = await placeWidget(t.as.mia, mine, { type: "spec", template: "canvas", metricIds: [], settings: layout as never });
    const { data } = await db().from("widgets").select("settings").eq("id", canvasWidget).single();
    expect(JSON.stringify(data?.settings)).not.toMatch(/tagSource|tagView|shop/);
    const deck = await createDeck(t.as.mia, "Deck");
    await saveDeck(t.as.mia, deck, layout.canvas.document);
    const { data: stored } = await db().from("decks").select("document").eq("id", deck).single();
    expect(JSON.stringify(stored?.document)).not.toMatch(/tagSource|tagView|shop/);
    // A deck stored before this rule, with the Tag in it, still carries none through a View Link.
    const old = { store: { "shape:w": { type: "ziffr-widget", props: { template: "matrix", metricIds: [t.b.id], settings: ` { "tagView": { "name": "shop", "more": 3 }, "tagSource": { "id": "${t.shop}" } }` } } } };
    await db().from("decks").update({ document: old }).eq("id", deck);
    const view = await buildView("deck", deck);
    expect(JSON.stringify(view?.document)).not.toMatch(/tagSource|tagView|shop/);
  });
});
