// Made decks against the real database (spec 0069, ticket #1364; GLOSSARY: Deck, Deck Description, Share): what each
// person reads of one, who may change it, which Metrics making and sharing one opens, and bringing back a Version.
import { afterEach, describe, expect, it, vi } from "vitest";
import { visibleMetricIds } from "./access";
import { Forbidden, Refused } from "./actor";
import { createDashboard, placeWidget } from "./dashboards";
import { db } from "./db";
import { readDeck } from "./deck-read";
import { clearDeckAnswers, makeDeckFromDashboard, saveMadeDeck } from "./deck-write";
import { saveDeck } from "./decks";
import { share, shareWithGroup } from "./sharing";
import { createGroup, setGroupMember } from "./team";
import { workspace } from "./test/db-fixtures";
import { listVersions, restoreVersion } from "./version-history";
import { getMetrics } from "./workspace-data";

vi.mock("./made-decks-on", () => ({ MADE_DECKS_ON: true }));

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const noEffects = { restoreWorkflow: async () => {} };

/** Sara's deck about two Metrics, with words on the chart of each; Ben sees the first Metric only. */
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ben = await w.person("member");
  const open = await w.metric(sara, { name: "Open visits" });
  const secret = await w.metric(sara, { name: "Secret churn" });
  for (const [m, v] of [[open, 10], [secret, 99]] as const) await w.value(m.id, "2026-01-01", v);
  await share(w.actor(sara), "metric", open.id, ben, "viewer");
  const dashboard = await createDashboard(w.actor(sara), "Board");
  for (const m of [open, secret]) await placeWidget(w.actor(sara), dashboard, { type: "metric", id: m.id });
  const deck = await makeDeckFromDashboard(w.actor(sara), dashboard);
  const slideOf = async (metricId: number) => (await readDeck(w.actor(sara), deck)).deck.description.slides.find((s) => s.type === "chart" && s.metrics[0] === metricId)!.id;
  const openSlide = await slideOf(open.id), secretSlide = await slideOf(secret.id);
  await saveMadeDeck(w.actor(sara), deck, { slides: [
    { id: openSlide, headline: "Visits held", answers: [{ question: "Why?", text: "Same team." }] },
    { id: secretSlide, headline: "Hidden headline", answers: [{ question: "Hidden question", text: "Hidden answer" }] },
  ] });
  const stored = async () => (await db().from("decks").select("document").eq("id", deck).single()).data!.document;
  return { w, sara, ben, open, secret, dashboard, deck, openSlide, secretSlide, stored };
}

describe("reading a made deck", () => {
  it("gives the owner every slide and only the data of its Metrics", async () => {
    const { w, sara, open, secret, deck } = await setup();
    await w.metric(sara, { name: "Elsewhere" });
    const read = await readDeck(w.actor(sara), deck);
    expect(read.leftOut).toBe(0);
    expect(read.deck.role).toBe("owner");
    expect(read.data.metrics.map((m) => m.id).sort()).toEqual([open.id, secret.id].sort());
    expect(read.data.people).toEqual([]);
    expect(JSON.stringify(read)).not.toContain("Elsewhere");
  });

  it("opens the listed Metrics to a Viewer, a Guest and a Group the deck is shared with, and sends no hidden slide", async () => {
    const { w, sara, ben, deck, secretSlide } = await setup();
    const guest = await w.person("guest"); const inGroup = await w.person("member");
    await share(w.actor(sara), "deck", deck, ben, "viewer");
    await share(w.actor(sara), "deck", deck, guest, "viewer");
    const group = await createGroup(w.actor(sara), "Leads");
    await setGroupMember(w.actor(sara), group, inGroup, true);
    await shareWithGroup(w.actor(sara), "deck", deck, group, "viewer");
    await saveMadeDeck(w.actor(sara), deck, { slides: [{ id: secretSlide, hidden: true }] });
    for (const actor of [w.actor(ben, "member"), w.actor(guest, "guest"), w.actor(inGroup, "member")]) {
      const read = await readDeck(actor, deck);
      expect(read.leftOut).toBe(0);
      expect(read.deck.description.slides.map((s) => s.id)).not.toContain(secretSlide);
      expect(JSON.stringify(read)).not.toContain("Hidden");
      await expect(saveMadeDeck(actor, deck, { design: "plain" } as never)).rejects.toThrow(Forbidden);
      await expect(clearDeckAnswers(actor, deck)).rejects.toThrow(Forbidden);
    }
  });

  // A deck's Share opens the Metrics its slides list, so only the deck's own owner can come to miss one.
  it("leaves no title, headline or answer of a slide with a Metric the person no longer sees, and refuses a change of it", async () => {
    const { w, ben, secret } = await setup();
    await w.share(secret.id, ben);
    const bens = w.actor(ben, "member");
    const dashboard = await createDashboard(bens, "Ben's board");
    await placeWidget(bens, dashboard, { type: "metric", id: secret.id });
    const deck = await makeDeckFromDashboard(bens, dashboard);
    const slide = (await readDeck(bens, deck)).deck.description.slides.find((s) => s.type === "chart")!.id;
    await saveMadeDeck(bens, deck, { slides: [{ id: slide, headline: "Hidden headline", answers: [{ question: "Hidden question", text: "Hidden answer" }] }] });
    await w.unshare(secret.id, ben);

    const read = await readDeck(bens, deck);
    expect(read.leftOut).toBeGreaterThan(0);
    expect(read.deck.description.slides.map((s) => s.type)).toEqual(["cover", "about"]);
    for (const word of ["Hidden", "Secret churn", secret.slug]) expect(JSON.stringify(read)).not.toContain(word);
    await expect(saveMadeDeck(bens, deck, { slides: [{ id: slide, headline: "Mine" }] })).rejects.toThrow(Forbidden);
    await clearDeckAnswers(bens, deck);
    const { data } = await db().from("decks").select("document").eq("id", deck).single();
    expect(JSON.stringify(data!.document)).toContain("Hidden answer");
    // A dashboard that shows it makes no slides any more, and leaves no empty deck.
    await expect(makeDeckFromDashboard(bens, dashboard)).rejects.toThrow(Refused);
    expect((await db().from("decks").select("id").eq("workspace_id", w.id).eq("owner_id", ben)).data).toHaveLength(1);
    // Nor does Ben bring back a Version that holds words about it.
    const [latest] = (await listVersions(bens, "deck", deck)).versions;
    await expect(restoreVersion(bens, latest.id, noEffects)).rejects.toThrow();
  });

  it("lets an Editor of the deck change it", async () => {
    const { w, sara, ben, deck, openSlide } = await setup();
    await share(w.actor(sara), "deck", deck, ben, "editor");
    await saveMadeDeck(w.actor(ben, "member"), deck, { slides: [{ id: openSlide, headline: "Ben's" }] });
    expect((await readDeck(w.actor(sara), deck)).deck.description.slides.find((s) => s.id === openSlide)!.headline).toBe("Ben's");
  });

  it("is refused to someone without a Share and to another Workspace", async () => {
    const { w, ben, deck } = await setup();
    const other = await workspace("Other"); cleanups.push(other.cleanup);
    const stranger = await other.person("owner");
    await expect(readDeck(w.actor(ben, "member"), deck)).rejects.toThrow(Forbidden);
    await expect(readDeck(other.actor(stranger), deck)).rejects.toThrow(Forbidden);
    await expect(saveMadeDeck(other.actor(stranger), deck, {})).rejects.toThrow(Forbidden);
  });

  it("opens no Metric a formula on a slide gains later", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner"); const ben = await w.person("member");
    const base = await w.metric(sara, { name: "Base" });
    const later = await w.metric(sara, { name: "Gained later" });
    const sum = await w.metric(sara, { name: "Sum", formula: `{${base.slug}} * 1`, sources: [], inputs_checked: true });
    await w.value(base.id, "2026-01-01", 3); await w.value(later.id, "2026-01-01", 4);
    const dashboard = await createDashboard(w.actor(sara), "Board");
    await placeWidget(w.actor(sara), dashboard, { type: "metric", id: sum.id });
    const deck = await makeDeckFromDashboard(w.actor(sara), dashboard);
    await share(w.actor(sara), "deck", deck, ben, "viewer");
    await w.patchMetric(sum.id, { formula: `{${base.slug}} + {${later.slug}}` });
    const read = await readDeck(w.actor(ben, "member"), deck);
    expect((await visibleMetricIds(w.id, ben, await getMetrics(w.id))).has(later.id)).toBe(false);
    expect(JSON.stringify(read)).not.toContain(later.slug);
    expect(JSON.stringify(read)).not.toContain("Gained later");
  });

  it("gives a Total's sums and parts only as far as the person may have them", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner"); const ben = await w.person("member");
    const part = await w.metric(sara, { name: "Hidden part", aggregation: "last" });
    const total = await w.metric(sara, { name: "Commit", aggregation: "last", sources: [], formula: "{-}", total_targets: "own" });
    expect((await db().from("total_parts").insert([{ total_id: total.id, part_id: part.id, workspace_id: w.id, first_period: "2026-01-01" }])).error).toBeNull();
    await w.value(part.id, "2026-01-01", 41);
    const dashboard = await createDashboard(w.actor(sara), "Board");
    await placeWidget(w.actor(sara), dashboard, { type: "metric", id: total.id });
    const deck = await makeDeckFromDashboard(w.actor(sara), dashboard);
    await share(w.actor(sara), "deck", deck, ben, "viewer");
    const read = await readDeck(w.actor(ben, "member"), deck);
    // Not open and a part unseen: no sum, and nothing that names the part.
    expect(read.data.series[total.slug]).toEqual([]);
    expect(JSON.stringify(read)).not.toContain(part.slug);
    expect(JSON.stringify(read)).not.toContain("Hidden part");
  });
});

describe("making and changing a made deck", () => {
  it("makes none for a Guest, nor from a dashboard the person has no role on", async () => {
    const { w, sara, dashboard } = await setup();
    const guest = await w.person("guest");
    await share(w.actor(sara), "dashboard", dashboard, guest, "viewer");
    await expect(makeDeckFromDashboard(w.actor(guest, "guest"), dashboard)).rejects.toThrow(Forbidden);
    const other = await w.person("member");
    await expect(makeDeckFromDashboard(w.actor(other, "member"), dashboard)).rejects.toThrow(Forbidden);
    expect((await db().from("decks").select("id").eq("workspace_id", w.id)).data).toHaveLength(1);
  });

  it("is not saved over by the slide editor, nor made by it", async () => {
    const { w, sara, deck, stored } = await setup();
    const before = await stored();
    await expect(saveDeck(w.actor(sara), deck, { store: {} })).rejects.toThrow(Refused);
    expect(await stored()).toEqual(before);
    const { data } = await db().from("decks").insert({ name: "Drawn", owner_id: sara, workspace_id: w.id }).select("id").single();
    await expect(saveDeck(w.actor(sara), data!.id, before)).rejects.toThrow(Refused);
    await expect(readDeck(w.actor(sara), data!.id)).rejects.toThrow(Refused);
  });

  it("keeps the words of cleared answers in the Version before, and brings them back", async () => {
    const { w, sara, deck, stored } = await setup();
    await clearDeckAnswers(w.actor(sara), deck);
    expect(JSON.stringify(await stored())).not.toContain("Hidden answer");
    const { versions } = await listVersions(w.actor(sara), "deck", deck);
    expect(JSON.stringify(versions)).not.toContain("Hidden answer");
    const before = [...versions].sort((a, b) => b.version - a.version)[1];
    await restoreVersion(w.actor(sara), before.id, noEffects);
    expect(JSON.stringify(await stored())).toContain("Hidden answer");
  });
});
