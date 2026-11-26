// Slide Elements against the real database (spec 0057): an element is checked wherever a deck is saved, a dashboard
// refuses one, and a Deck Template keeps elements and covers while each Slot is filled only with Metrics the actor sees.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { createDashboard, placeWidget } from "./dashboards";
import { db } from "./db";
import { createDeck, saveDeck } from "./decks";
import { createDeckFromTemplate, deckTemplateSeed } from "./deck-templates";
import { saveDeckTemplate } from "./templates";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }

/** A deck's document with one cover slide holding one element that reads the Metrics given. */
function document(element: unknown, metricIds: number[]) {
  return {
    store: {
      "page:page": { id: "page:page", typeName: "page", name: "Page 1", index: "a1", meta: {} },
      "shape:f": { id: "shape:f", typeName: "shape", type: "frame", parentId: "page:page", index: "a1", x: 0, y: 0, rotation: 0, opacity: 1, meta: { cover: true }, props: { w: 1280, h: 720, name: "Slide 1" } },
      "shape:e": { id: "shape:e", typeName: "shape", type: "ziffr-widget", parentId: "shape:f", index: "a1", x: 64, y: 147, rotation: 0, opacity: 1, meta: {}, props: { w: 276, h: 112, template: "slide", metricIds, settings: JSON.stringify({ element }), title: "" } },
    },
  };
}

describe("Slide Elements", () => {
  it("are saved on a deck only when they pass their checks, and only with Metrics the saver sees", async () => {
    const w = await ws(); const sara = await w.person("member"); const ben = await w.person("member");
    const m = await w.metric(sara, { name: "Commit" });
    const deck = await createDeck(w.actor(sara, "member"), "Forecast");
    await saveDeck(w.actor(sara, "member"), deck, document({ kind: "figure", note: "{change} on last week" }, [m.id]));
    await expect(saveDeck(w.actor(sara, "member"), deck, document({ kind: "logo", src: "https://example.com/a.png" }, []))).rejects.toThrow("element Ziffr cannot keep");
    const theirs = await createDeck(w.actor(ben, "member"), "Mine");
    await expect(saveDeck(w.actor(ben, "member"), theirs, document({ kind: "figure" }, [m.id]))).rejects.toEqual(expect.any(Forbidden));
  });

  it("stay off dashboards", async () => {
    const w = await ws(); const sara = await w.person("owner"); const m = await w.metric(sara);
    const dash = await createDashboard(w.actor(sara), "Numbers");
    await expect(placeWidget(w.actor(sara), dash, { type: "spec", template: "slide", metricIds: [m.id], settings: { element: { kind: "figure" } } })).rejects.toEqual(expect.any(Forbidden));
  });

  it("travel into a Deck Template with their cover, and a deck made from it takes only Metrics the actor sees", async () => {
    const w = await ws(); const sara = await w.person("member"); const ben = await w.person("member");
    const m = await w.metric(sara, { name: "Commit" });
    const deck = await createDeck(w.actor(sara, "member"), "Forecast");
    await saveDeck(w.actor(sara, "member"), deck, document({ kind: "figure" }, [m.id]));
    const t = await saveDeckTemplate(w.actor(sara, "member"), { deckId: deck, name: "Forecast", description: "", labels: ["Commit"], choices: {} });
    const { data: row } = await db().from("team_templates").select("body").eq("id", t).single();
    expect(row!.body.slides[0]).toMatchObject({ cover: true, shapes: [{ type: "ziffr-widget", widget: { metricSlots: [0], settings: { element: { kind: "figure" } } } }] });
    await expect(createDeckFromTemplate(w.actor(ben, "member"), { template: t, name: "x", fills: [[m.id]] })).rejects.toEqual(expect.any(Forbidden));
    const mine = await w.metric(ben, { name: "Sales" });
    const seed = await deckTemplateSeed(w.actor(ben, "member"), t, [[mine.id]]);
    expect(seed?.slides[0].cover).toBe(true);
  });
});
