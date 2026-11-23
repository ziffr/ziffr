// @ts-nocheck
// Adding a widget to a deck from its menu against the real database (ticket #1; GLOSSARY: Widget, Deck, Share): only
// onto a deck the person may change, only a widget they may open, and only Metrics they see; a refused one leaves no
// new deck behind.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { deckAddition, deckTargets, newDeckFor, slidesOf } from "./deck-additions";
import { saveDeck } from "./decks";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const frame = (id: string, name: string, y: number) => ({ [id]: { typeName: "shape", type: "frame", id, x: 0, y, props: { name, w: 1280, h: 720 } } });
const DOC = { store: { ...frame("shape:b", "Results", 840), ...frame("shape:a", "Title", 0), "page:page": { typeName: "page", id: "page:page" } }, schema: {} };

async function setUp() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  const ben = await w.person("member");
  const ann = await w.person("member");
  const gus = await w.person("guest");
  const revenue = await w.metric(sara, { name: "Revenue" });
  const { data: d } = await db().from("dashboards").insert({ name: "Sales", owner_id: sara, workspace_id: w.id }).select("id").single();
  const widget = async (metricIds: number[], title: string) => (await db().from("widgets").insert({ owner_id: sara, dashboard_id: d!.id, template: "line", metric_ids: metricIds, settings: {}, title, x: 0, y: 0, w: 6, h: 4, workspace_id: w.id }).select("id").single()).data!.id as number;
  const shown = await widget([revenue.id], "Revenue by month");
  const { data: deck } = await db().from("decks").insert({ name: "Board", owner_id: sara, document: DOC, workspace_id: w.id }).select("id").single();
  // Ben sees the dashboard and Revenue, and edits the deck; Ann only views the deck.
  await db().from("shares").insert([
    { workspace_id: w.id, object_type: "dashboard", object_id: d!.id, user_id: ben, role: "viewer" },
    { workspace_id: w.id, object_type: "dashboard", object_id: d!.id, user_id: ann, role: "viewer" },
    { workspace_id: w.id, object_type: "metric", object_id: revenue.id, user_id: ben, role: "viewer" },
    { workspace_id: w.id, object_type: "metric", object_id: revenue.id, user_id: ann, role: "viewer" },
    { workspace_id: w.id, object_type: "deck", object_id: deck!.id, user_id: ben, role: "editor" },
    { workspace_id: w.id, object_type: "deck", object_id: deck!.id, user_id: ann, role: "viewer" },
  ]);
  return { w, sara, ben, ann, gus, deck: deck!.id as number, shown, revenue };
}

describe("adding a widget to a deck", () => {
  it("lists the decks the person may change, with their slides in reading order", async () => {
    const { w, ben, ann, gus, deck } = await setUp();
    expect(await deckTargets(w.actor(ben, "member"))).toEqual([{ id: deck, name: "Board", slides: [{ id: "shape:a", name: "Title" }, { id: "shape:b", name: "Results" }] }]);
    expect(await deckTargets(w.actor(ann, "member"))).toEqual([]);
    expect(await deckTargets(w.actor(gus, "guest"))).toEqual([]);
  });

  it("gives an Editor the copy to place, on a slide the deck has or a new one", async () => {
    const { w, ben, deck, shown, revenue } = await setUp();
    expect(await deckAddition(w.actor(ben, "member"), deck, shown, "shape:b")).toEqual({ widget: { template: "line", metric_ids: [revenue.id], settings: {}, title: "Revenue by month" }, slide: "shape:b" });
    // A slide the deck does not have, or something that is no slide id, becomes a new slide.
    for (const slide of ["shape:zzz", "page:page", "<script>", null]) expect((await deckAddition(w.actor(ben, "member"), deck, shown, slide)).slide).toBeNull();
    // Saving the deck with the copy placed passes saveDeck's own check of the Metrics.
    const placed = { ...DOC, store: { ...DOC.store, "shape:w": { typeName: "shape", type: "ziffr-widget", id: "shape:w", parentId: "shape:b", x: 64, y: 150, props: { w: 560, h: 320, template: "line", metricIds: [revenue.id], settings: "{}", title: "" } } } };
    await expect(saveDeck(w.actor(ben, "member"), deck, placed)).resolves.toBeUndefined();
  });

  it("refuses a Viewer of the deck, a Guest, and someone who cannot open the widget", async () => {
    const { w, ann, gus, deck, shown, sara } = await setUp();
    await expect(deckAddition(w.actor(ann, "member"), deck, shown)).rejects.toThrow(/owner and its Editors/);
    await expect(deckAddition(w.actor(gus, "guest"), deck, shown)).rejects.toThrow();
    // A widget of a dashboard Eve may not open, onto a deck of her own.
    const eve = await w.person("member");
    const { data: own } = await db().from("decks").insert({ name: "Mine", owner_id: eve, workspace_id: w.id }).select("id").single();
    await expect(deckAddition(w.actor(eve, "member"), own!.id, shown)).rejects.toThrow();
    // Another Workspace's deck or widget is not found.
    const other = await workspace("Other"); cleanups.push(other.cleanup);
    const zoe = await other.person("owner");
    await expect(deckAddition(other.actor(zoe), deck, shown)).rejects.toThrow();
    expect(await deckTargets(w.actor(sara))).toHaveLength(1);
    // Someone else's saved widget (the Pool), and a widget of another Workspace onto this one's deck.
    const { data: pool } = await db().from("widgets").insert({ owner_id: sara, dashboard_id: null, saved: true, template: "line", metric_ids: [], settings: {}, title: "Sara's", x: 0, y: 0, w: 6, h: 4, workspace_id: w.id }).select("id").single();
    const ben = (await db().from("shares").select("user_id").eq("object_id", deck).eq("role", "editor").single()).data!.user_id as string;
    await expect(deckAddition(w.actor(ben, "member"), deck, pool!.id)).rejects.toThrow();
    const { data: theirs } = await db().from("widgets").insert({ owner_id: zoe, dashboard_id: null, saved: true, template: "line", metric_ids: [], settings: {}, title: "Zoe's", x: 0, y: 0, w: 6, h: 4, workspace_id: other.id }).select("id").single();
    await expect(deckAddition(w.actor(sara), deck, theirs!.id)).rejects.toThrow();
  });

  it("refuses a widget drawing a Metric the person does not see, also onto a new deck, and makes no deck then", async () => {
    const { w, ben, deck, shown } = await setUp();
    // A dashboard shared with Ben shows him every Metric on it; his own saved widget (the Pool) does not: one that
    // draws a Metric no longer shared with him, or never, is refused.
    const payroll = await w.metric((await w.person("owner")), { name: "Bonus pool" });
    const { data: pool } = await db().from("widgets").insert({ owner_id: ben, dashboard_id: null, saved: true, template: "line", metric_ids: [payroll.id], settings: {}, title: "Bonus", x: 0, y: 0, w: 6, h: 4, workspace_id: w.id }).select("id").single();
    const hidden = pool!.id as number;
    await expect(deckAddition(w.actor(ben, "member"), deck, hidden)).rejects.toThrow();
    const decks = async () => (await db().from("decks").select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count;
    const before = await decks();
    await expect(newDeckFor(w.actor(ben, "member"), hidden)).rejects.toThrow();
    expect(await decks()).toBe(before);
    // A widget they may copy makes a deck of their own, named after it, which they may then add to.
    const made = await newDeckFor(w.actor(ben, "member"), shown);
    const { data: row } = await db().from("decks").select("name, owner_id").eq("id", made).single();
    expect(row).toEqual({ name: "Revenue by month", owner_id: ben });
    expect((await deckAddition(w.actor(ben, "member"), made, shown)).slide).toBeNull();
  });
});

describe("a deck's slides", () => {
  it("are its frames in reading order, named, and nothing else", () => {
    expect(slidesOf(DOC)).toEqual([{ id: "shape:a", name: "Title" }, { id: "shape:b", name: "Results" }]);
    expect(slidesOf({ store: { ...frame("shape:c", "", 0), ...frame("bad id", "X", 10) } })).toEqual([{ id: "shape:c", name: "Slide 1" }]);
    for (const doc of [null, "text", { store: null }, { store: [1, 2] }]) expect(slidesOf(doc)).toEqual([]);
  });
});
