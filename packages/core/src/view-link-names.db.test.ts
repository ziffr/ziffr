// A View Link shows no people's names unless its maker ticked "Show names" (ticket #590; GLOSSARY: View Link): one
// Workspace with people everywhere a name can sit (owner, Metric names, the dashboard's introduction, widget words,
// slides, a Snapshot's people and words, a frozen copy), every View Link read walked with names off and on.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createDashboard, placeWidget, saveDashboardText } from "./dashboards";
import { createDeck, saveDeck } from "./decks";
import { showSnapshot, takeSnapshot } from "./snapshots";
import { createViewLink, listViewLinks, openViewLink, revokeViewLink, setViewLinkNames, viewForLink, type ViewPayload } from "./view-links";
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
  // Dan left the Workspace after he submitted a value: his name still sits in words, and the link must not tell it.
  const dan = await w.person("member", { email: `dan-${tag}@example.test`, slack_handle: `@dan-${tag}` });
  for (const [id, name] of [[sara, `Sara Ownerly ${tag}`], [ben, `Ben Builder ${tag}`], [cleo, `Cleo Hidden ${tag}`], [dan, `Dan Departed ${tag}`]] as const) await db().from("profiles").update({ name }).eq("id", id);
  const owner = w.actor(sara);
  // Ben owns and submits a Metric, and a Metric's own name carries a colleague's name.
  const visits = await w.metric(ben, { name: `Field visits of Cleo Hidden ${tag}` });
  await w.value(visits.id, "2026-10-01", 10, ben);
  await w.value(visits.id, "2026-09-01", 8, dan);
  await db().from("memberships").delete().eq("workspace_id", w.id).eq("user_id", dan);
  await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: visits.id, user_id: sara, role: "viewer" });
  await w.token(visits.id, ben);
  const dash = await createDashboard(owner, `Overview by Sara Ownerly ${tag}`);
  await saveDashboardText(owner, dash, { intro: `Written by Ben Builder ${tag} after Dan Departed ${tag} (DAN-${tag}@Example.test, @dan-${tag}) left, mail ${`ben-${tag}@example.test`.toUpperCase()}.` });
  await placeWidget(owner, dash, { type: "spec", template: "story", metricIds: [visits.id], settings: { headline: `Cleo ${tag} said it grew`, panels: [] } });
  await placeWidget(owner, dash, { type: "spec", template: "number", metricIds: [visits.id], settings: {} });
  // A Theme made by a colleague, with a footer that names one and a name in capitals.
  const { data: theme } = await db().from("themes").insert({ owner_id: ben, workspace_id: w.id, name: `Look by Ben Builder ${tag}`, tokens: {}, slides: { footer: `Prepared by Cleo Hidden ${tag}` }, is_default: true }).select("id").single();
  await db().from("dashboards").update({ theme_id: theme!.id }).eq("id", dash);
  const snap = await takeSnapshot(owner, dash, { kind: "month", start: "2026-10-01" });
  await showSnapshot(owner, snap);
  const deck = await createDeck(owner, "Board");
  await saveDeck(owner, deck, { store: { "shape:1": { type: "ziffr-widget", props: { metricIds: [visits.id], settings: "{}" } }, "shape:2": { type: "text", props: { text: `Thanks to Ben Builder ${tag} and @ben-${tag}` } } } });
  const others = [
    { id: sara, name: `Sara Ownerly ${tag}`, email: `sara-${tag}@example.test`, handle: `@sara-${tag}` },
    { id: ben, name: `Ben Builder ${tag}`, email: `ben-${tag}@example.test`, handle: `@ben-${tag}` },
    { id: cleo, name: `Cleo Hidden ${tag}`, email: `cleo-${tag}@example.test`, handle: "" },
    { id: dan, name: `Dan Departed ${tag}`, email: `dan-${tag}@example.test`, handle: `@dan-${tag}` },
  ];
  return { w, owner, dash, deck, snap, others, tag, ben, visits };
}

/** The names, first names, emails, handles and ids of people found anywhere in a View Link's content. */
function leaks(content: unknown, others: { id: string; name: string; email: string; handle: string }[]): string[] {
  const text = JSON.stringify(content);
  const lower = text.toLowerCase();
  // Names as written; an email or handle in any case.
  return others.flatMap((o) => [...[o.name, o.name.split(" ")[0], o.id].filter((n) => text.includes(n)), ...[o.email, o.handle].filter((n) => n && lower.includes(n.toLowerCase()))]);
}

describe("a View Link and people's names", () => {
  it("shows none of them by default, on every kind of link, and all of them when names are on", async () => {
    const { owner, dash, deck, snap, others } = await setUp();
    const links = {
      liveDashboard: await createViewLink(owner, "dashboard", dash, { ...dayInput, frozen: false }),
      liveDeck: await createViewLink(owner, "deck", deck, { ...dayInput, frozen: false }),
      frozenDashboard: await createViewLink(owner, "dashboard", dash, { ...dayInput, frozen: true }),
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
    expect((await listViewLinks(owner, "dashboard", dash))[0].showNames).toBe(false);
    // A revoked link is not switched, and a link of another Workspace is not found.
    await revokeViewLink(owner, row!.id);
    await setViewLinkNames(owner, row!.id, true);
    expect((await listViewLinks(owner, "dashboard", dash))[0].showNames).toBe(false);
  });

  it("hides mixed-case contact details, re-keys a slug or formula that names someone, and clears a Theme's maker from an old frozen copy", async () => {
    const { w, owner, dash, tag, others, visits } = await setUp();
    const sara = others[0];
    const slug = `revenue-sara-${tag}`;
    await db().from("metrics").update({ slug }).eq("id", visits.id);
    const token = await createViewLink(owner, "dashboard", dash, { ...dayInput, frozen: false });
    // A live link: the slug that names a person becomes an opaque key and its series follow, so the page still draws.
    const live = await openViewLink(token);
    const shown = live!.data.metrics[0];
    expect(shown.slug).toBe(`metric-${visits.id}`);
    expect(live!.data.series[shown.slug]?.length).toBeGreaterThan(0);
    expect(JSON.stringify(live)).not.toContain(slug);
    // The same payload, by hand: a formula that names a Metric after a person, a Theme as frozen before this change, a mixed-case email.
    const base = live as ViewPayload;
    const old = { ...base, intro: `Write to ${sara.email.replace("sara", "SaRa")}`, data: { ...base.data, metrics: base.data.metrics.map((m) => ({ ...m, slug, formula: `{${slug}} * 2` })), series: { [slug]: base.data.series[shown.slug] }, themes: [{ id: 1, owner_id: others[1].id, name: "Look", tokens: {}, slides: {}, is_default: true, updated_at: "" }] } } as unknown as ViewPayload;
    const off = await viewForLink(old, w.id, false);
    expect(JSON.stringify(off)).not.toMatch(/sara/i);
    expect(off.data.metrics[0].formula).toBeNull();
    expect(off.data.themes[0].owner_id).toBe("");
    expect(off.data.series[`metric-${visits.id}`]).toBeDefined();
    // With names on the Theme's maker is gone too.
    expect((await viewForLink(old, w.id, true)).data.themes[0].owner_id).toBe("");
  });
});
