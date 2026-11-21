// A View Link shows no people's names unless its maker ticked "Show names" (ticket #590; GLOSSARY: View Link): one
// Workspace with people everywhere a name can sit (owner, Metric names, the dashboard's introduction, widget words,
// slides, a Snapshot's people and words, a frozen copy), every View Link read walked with names off and on.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createDashboard, placeWidget, saveDashboardText } from "./dashboards";
import { createDeck, saveDeck } from "./decks";
import { share } from "./sharing";
import { showSnapshot, takeSnapshot } from "./snapshots";
import { createViewLink, listViewLinks, openViewLink, setViewLinkNames } from "./view-links";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const dayInput = { label: "Board", expires: inDays(10) };

async function setUp() {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const tag = randomUUID().slice(0, 8);
  const sara = await w.person("owner", { email: `sara-${tag}@example.test`, slack_handle: `@sara-${tag}` });
  const ben = await w.person("member", { email: `ben-${tag}@example.test`, slack_handle: `@ben-${tag}` });
  const cleo = await w.person("member", { email: `cleo-${tag}@example.test` });
  for (const [id, name] of [[sara, `Sara Ownerly ${tag}`], [ben, `Ben Builder ${tag}`], [cleo, `Cleo Hidden ${tag}`]] as const) await db().from("profiles").update({ name }).eq("id", id);
  const owner = w.actor(sara);
  // Ben owns and submits a Metric, and a Metric's own name carries a colleague's name.
  const visits = await w.metric(ben, { name: `Field visits of Cleo Hidden ${tag}` });
  await w.value(visits.id, "2026-10-01", 10, ben);
  await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: visits.id, user_id: sara, role: "viewer" });
  await w.token(visits.id, ben);
  const dash = await createDashboard(owner, `Overview by Sara Ownerly ${tag}`);
  await saveDashboardText(owner, dash, { intro: `Written by Ben Builder ${tag}, mail ben-${tag}@example.test.` });
  await placeWidget(owner, dash, { type: "spec", template: "story", metricIds: [visits.id], settings: { headline: `Cleo ${tag} said it grew`, panels: [] } });
  await placeWidget(owner, dash, { type: "spec", template: "number", metricIds: [visits.id], settings: {} });
  const snap = await takeSnapshot(owner, dash, { kind: "month", start: "2026-10-01" });
  await showSnapshot(owner, snap);
  const deck = await createDeck(owner, "Board");
  await saveDeck(owner, deck, { store: { "shape:1": { type: "ziffr-widget", props: { metricIds: [visits.id], settings: "{}" } }, "shape:2": { type: "text", props: { text: `Thanks to Ben Builder ${tag} and @ben-${tag}` } } } });
  const others = [
    { id: sara, name: `Sara Ownerly ${tag}`, email: `sara-${tag}@example.test`, handle: `@sara-${tag}` },
    { id: ben, name: `Ben Builder ${tag}`, email: `ben-${tag}@example.test`, handle: `@ben-${tag}` },
    { id: cleo, name: `Cleo Hidden ${tag}`, email: `cleo-${tag}@example.test`, handle: "" },
  ];
  return { w, owner, dash, deck, snap, others, tag, ben, visits };
}

/** The names, first names, emails, handles and ids of people found anywhere in a View Link's content. */
function leaks(content: unknown, others: { id: string; name: string; email: string; handle: string }[]): string[] {
  const text = JSON.stringify(content);
  return others.flatMap((o) => [o.name, o.name.split(" ")[0] + " " + o.name.split(" ")[1] === o.name ? o.name.split(" ")[0] : o.name.split(" ")[0], o.email, o.handle, o.id].filter((n) => n && text.includes(n)));
}

describe("a View Link and people's names", () => {
  it("shows none of them by default, on every kind of link, and all of them when names are on", async () => {
    const { owner, dash, deck, snap, others } = await setUp();
    const links = {
      liveDashboard: await createViewLink(owner, "dashboard", dash, { ...dayInput, frozen: false }),
      liveDeck: await createViewLink(owner, "deck", deck, { ...dayInput, frozen: false }),
      frozenDeck: await createViewLink(owner, "deck", deck, { ...dayInput, frozen: true }),
      snapshot: await createViewLink(owner, "dashboard", dash, { ...dayInput, frozen: false, snapshotId: snap }),
    };
    const off: string[] = [];
    for (const [name, token] of Object.entries(links)) {
      const view = await openViewLink(token);
      expect(view, name).not.toBeNull();
      for (const l of leaks(view, others)) off.push(`${name}: ${l}`);
      expect(view!.data.people, name).toEqual([]);
    }
    expect(off).toEqual([]);
    // The same links with names on: the people and their words are there, still without contact details.
    for (const l of await listViewLinks(owner, "dashboard", dash)) expect(l.showNames).toBe(false);
    for (const [name, token] of Object.entries(links)) {
      const { data: row } = await db().from("view_links").select("id").eq("token", token).single();
      await setViewLinkNames(owner, row!.id, true);
      const view = await openViewLink(token);
      // Words the owner wrote stay as written; the people the page carries never hold contact details.
      expect(view!.data.people.every((p) => p.email === "" && p.slack_handle === "" && p.phone === null), name).toBe(true);
      expect(view!.data.people.length, name).toBeGreaterThan(0);
      expect(leaks(view, others).length, name).toBeGreaterThan(0);
    }
    expect((await listViewLinks(owner, "deck", deck)).every((l) => l.showNames)).toBe(true);
  });

  it("is on only when its maker asked for it, and only its owner changes it", async () => {
    const { w, owner, dash, others, ben } = await setUp();
    const token = await createViewLink(owner, "dashboard", dash, { ...dayInput, frozen: false, showNames: true });
    expect(leaks(await openViewLink(token), others).length).toBeGreaterThan(0);
    const { data: row } = await db().from("view_links").select("id").eq("token", token).single();
    await expect(setViewLinkNames(w.actor(ben, "member"), row!.id, false)).rejects.toEqual(expect.any(Forbidden));
    await setViewLinkNames(owner, row!.id, false);
    expect(leaks(await openViewLink(token), others)).toEqual([]);
    // A link that exists before the switch has names off.
    await db().from("view_links").update({ show_names: false }).eq("id", row!.id);
    expect((await listViewLinks(owner, "dashboard", dash))[0].showNames).toBe(false);
    await share(owner, "dashboard", dash, ben, "viewer");
  });
});
