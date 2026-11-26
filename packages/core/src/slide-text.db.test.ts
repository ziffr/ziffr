// Live values in a slide's text boxes against the real database (ticket #1172; GLOSSARY: Placeholder, Share, View Link,
// Deck Template): the Metrics a box's words name are held to what widgets' are, and templates keep Slots, no figures.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createDeck, saveDeck } from "./decks";
import { createDeckFromTemplate, deckTemplateSeed } from "./deck-templates";
import { share } from "./sharing";
import { fromDeckTemplate } from "./team-templates";
import { saveDeckTemplate, saveSlideLayout } from "./templates";
import { createViewLink, openViewLink } from "./view-links";
import { visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import { workspace } from "./test/db-fixtures";
import type { SlideShape } from "./types";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);

const rich = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const box = (text: string, metrics: number[]) => ({ type: "text", props: { richText: rich(text), w: 600, autoSize: false }, meta: { metrics } });
/** A deck's document with one slide holding these text boxes. */
function document(...boxes: ReturnType<typeof box>[]) {
  const store: Record<string, unknown> = {
    "page:page": { id: "page:page", typeName: "page", name: "Page 1", index: "a1", meta: {} },
    "shape:f": { id: "shape:f", typeName: "shape", type: "frame", parentId: "page:page", index: "a1", x: 0, y: 0, rotation: 0, opacity: 1, meta: {}, props: { w: 1280, h: 720, name: "Slide 1" } },
  };
  boxes.forEach((b, i) => { store[`shape:t${i}`] = { id: `shape:t${i}`, typeName: "shape", parentId: "shape:f", index: `a${i + 1}`, x: 64, y: 64 + i * 100, rotation: 0, opacity: 1, ...b }; });
  return { store, schema: {} };
}
const seesNow = async (workspaceId: string, person: string) => visibleMetricIds(workspaceId, person, await getMetrics(workspaceId));

describe("a deck's text boxes", () => {
  it("name only Metrics the saver sees, by whatever word asks for them", async () => {
    const w = await ws(); const sara = await w.person("member"); const ben = await w.person("member");
    const theirs = await w.metric(sara, { name: "Commit" }); const mine = await w.metric(ben, { name: "Sales" });
    const deck = await createDeck(w.actor(ben, "member"), "Mine");
    await expect(saveDeck(w.actor(ben, "member"), deck, document(box("{latest}", [theirs.id])))).rejects.toEqual(forbidden);
    // Listed but asked for by no word: nothing of it is drawn or opened, until a word asks.
    await saveDeck(w.actor(ben, "member"), deck, document(box("{latest 2}", [theirs.id, mine.id])));
    await expect(saveDeck(w.actor(ben, "member"), deck, document(box("{latest 2} {top row}", [theirs.id, mine.id])))).rejects.toEqual(forbidden);
    await expect(saveDeck(w.actor(ben, "member"), deck, document(box("{latest}", ["x" as unknown as number])))).rejects.toThrow("cannot read");
  });

  it("open their Metrics through the deck's Share, those the words ask for and no other", async () => {
    const w = await ws(); const sara = await w.person("member"); const ben = await w.person("member");
    const named = await w.metric(sara, { name: "Commit" }); const listed = await w.metric(sara, { name: "Secret" });
    const deck = await createDeck(w.actor(sara, "member"), "Forecast");
    await saveDeck(w.actor(sara, "member"), deck, document(box("{latest}", [named.id, listed.id])));
    await share(w.actor(sara, "member"), "deck", deck, ben, "viewer");
    const seen = await seesNow(w.id, ben);
    expect([seen.has(named.id), seen.has(listed.id)]).toEqual([true, false]);
  });

  it("stay off a View Link when they name a Metric the link does not show", async () => {
    const w = await ws(); const sara = await w.person("member");
    const first = await w.metric(sara, { name: "Commit" }); const later = await w.metric(sara, { name: "Added later" });
    await w.value(first.id, "2026-09-01", 120);
    const deck = await createDeck(w.actor(sara, "member"), "Forecast");
    await saveDeck(w.actor(sara, "member"), deck, document(box("{latest}", [first.id]), box("Next", [])));
    const expires = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const link = await createViewLink(w.actor(sara, "member"), "deck", deck, { label: "Board", expires, frozen: false });
    await saveDeck(w.actor(sara, "member"), deck, document(box("{latest}", [first.id]), box("Plan: {latest}", [later.id])));
    const view = await openViewLink(link);
    expect(JSON.stringify(view!.document)).toContain("{latest}");
    expect(JSON.stringify(view!.document)).not.toContain("Plan:");
    expect(view!.data.metrics.map((m) => m.id)).toEqual([first.id]);
  });
});

describe("a template made from text boxes", () => {
  it("keeps Slots and Placeholders, leaves typed figures out, and a deck made from it is filled with the maker's Metrics", async () => {
    const w = await ws(); const sara = await w.person("member"); const ben = await w.person("member");
    const m = await w.metric(sara, { name: "Commit" });
    const deck = await createDeck(w.actor(sara, "member"), "Forecast");
    await saveDeck(w.actor(sara, "member"), deck, document(box("Commit {latest}, was 4,711 €", [m.id])));
    const t = await saveDeckTemplate(w.actor(sara, "member"), { deckId: deck, name: "Forecast", description: "", labels: ["Commit"], choices: {} });
    const { data: row } = await db().from("team_templates").select("slots, body").eq("id", t).single();
    const kept = JSON.stringify(row!.body);
    expect(kept).toContain("{metric} {latest}, was …");
    expect(kept).not.toContain("4,711");
    expect(kept).not.toContain('"metrics"');
    const mine = await w.metric(ben, { name: "Sales" });
    await expect(createDeckFromTemplate(w.actor(ben, "member"), { template: t, name: "x", fills: [[m.id]] })).rejects.toEqual(forbidden);
    const seed = await deckTemplateSeed(w.actor(ben, "member"), t, [[mine.id]]);
    expect(fromDeckTemplate({ slides: seed!.slides }, seed!.fills)[0][0].meta).toEqual({ metrics: [mine.id] });
  });

  it("is saved as a layout only by someone who sees what its words name", async () => {
    const w = await ws(); const sara = await w.person("member"); const ben = await w.person("member");
    const m = await w.metric(sara, { name: "Commit" });
    const deck = await createDeck(w.actor(ben, "member"), "Mine");
    const shapes: SlideShape[] = [{ x: 0, y: 0, rotation: 0, opacity: 1, ...box("{metric}", [m.id]) }];
    await expect(saveSlideLayout(w.actor(ben, "member"), { deckId: deck, shapes, name: "x", description: "", labels: [], choices: {} })).rejects.toEqual(forbidden);
  });
});
