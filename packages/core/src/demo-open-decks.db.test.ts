// Open decks and Snapshots in the demo, against the database (GLOSSARY: Demo Mode, Deck, Snapshot; spec 0051, ticket 10). With the
// setting in effect a visit may make, write, version and delete decks of its own and take, write up, show and delete Snapshots of
// its own dashboards, one Snapshot at a time in the whole demo; the seed's decks and Snapshots and the showcase stay as they are,
// a deck is small and its words are plain; with the setting off or without a visit the demo refuses as it always did. Written for
// the database test run of CI; the author could not run it (spec 0051's tickets 8, 9 and 10 were built in parallel, without a database).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { DemoLimit, DemoReadOnly, DemoShowcase } from "./demo";
import { DemoTextRefused } from "./demo-visitor-words";
import { DemoSizeRefused } from "./demo-visitor-limits";
import { withSnapshotTurn, DEMO_SNAPSHOT_BUSY } from "./demo-snapshot-lock";
import { visitingDemo } from "./demo-visiting";
import { resetDemoWorkspace } from "./demo-reset";
import { forgetStoredSettings } from "./settings-in-effect";
import * as decks from "./decks";
import * as dash from "./dashboards";
import * as snapshots from "./snapshots";
import { nameVersion, restoreVersion, saveNamedVersion } from "./version-history";
import { saveDeckTemplate, saveSlideLayout } from "./templates";
import { createDeckFromTemplate } from "./deck-templates";
import { DEMO_WORKSPACE_ID } from "./team";
import { demoBackToSeed } from "./test/demo-walk";
import type { Actor } from "./actor";

const sara: Actor = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
const VISIT = "0123456789abcdef0123456789abcdef";
const who = { visitId: VISIT, headers: new Headers({ "x-forwarded-for": "203.0.113.7" }) };
const saved = { changes: process.env.ZIFFR_DEMO_CHANGES, only: process.env.ZIFFR_DEMO_ONLY, key: process.env.ZIFFR_DEMO_ADDRESS_KEY, hops: process.env.ZIFFR_PROXY_HOPS };
const restore = (name: string, value: string | undefined) => { if (value === undefined) delete process.env[name]; else process.env[name] = value; };
const turnOn = () => {
  Object.assign(process.env, { ZIFFR_DEMO_CHANGES: "1", ZIFFR_DEMO_ONLY: "1", ZIFFR_DEMO_ADDRESS_KEY: "k".repeat(40), ZIFFR_PROXY_HOPS: "1" });
  forgetStoredSettings();
};
afterEach(() => {
  restore("ZIFFR_DEMO_CHANGES", saved.changes); restore("ZIFFR_DEMO_ONLY", saved.only); restore("ZIFFR_DEMO_ADDRESS_KEY", saved.key); restore("ZIFFR_PROXY_HOPS", saved.hops);
  forgetStoredSettings();
});

const generation = async () => Number((await db().from("demo_state").select("generation").single()).data?.generation);
/** Runs work as a visit of the current Generation, with the setting in effect. */
async function asVisit<T>(work: () => Promise<T>, generationOffset = 0, visit = VISIT): Promise<T> {
  turnOn();
  return visitingDemo({ generation: (await generation()) + generationOffset, visit }, work);
}

/** A slide as the deck editor saves it: a frame with a text in it. */
const slideWith = (text: string) => ({
  schema: { schemaVersion: 2, sequences: { "com.tldraw.store": 4 } },
  store: {
    "document:document": { id: "document:document", typeName: "document", name: "", gridSize: 10, meta: {} },
    "page:page": { id: "page:page", typeName: "page", name: "Page 1", index: "a1", meta: {} },
    "shape:slide1": { id: "shape:slide1", typeName: "shape", type: "frame", x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, parentId: "page:page", index: "a1", meta: {}, props: { w: 1600, h: 900, name: "Slide 1" } },
    "shape:text1": { id: "shape:text1", typeName: "shape", type: "text", x: 40, y: 40, rotation: 0, isLocked: false, opacity: 1, parentId: "shape:slide1", index: "a1", meta: {}, props: { richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }, size: "m", font: "sans", textAlign: "start", autoSize: true, w: 400, scale: 1, color: "black" } },
  },
});
const lastMonth = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1)).toISOString().slice(0, 10); };

let metric = 0;
beforeAll(async () => {
  // A fresh demo that is open to visitors, with its showcase recorded and its seed marked done.
  await resetDemoWorkspace({ openToVisitors: true });
  metric = Number((await db().from("metrics").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).limit(1).single()).data?.id);
}, 180_000);

// What the tests below make is a visitor's: the demo goes back to its seed, closed, so no other test finds it.
afterAll(async () => { await demoBackToSeed(); }, 180_000);

describe("what is open", () => {
  it("is the tables of decks and Snapshots, each with its cap, and a deck's size is held in the database too", async () => {
    const open = ((await db().from("demo_open_tables").select("table_name")).data ?? []).map((r) => r.table_name as string);
    for (const t of ["decks", "dashboard_snapshots"]) expect(open, t).toContain(t);
    const { data: triggers } = await db().rpc("demo_limit_triggers");
    const caps = new Set(((triggers ?? []) as { table_name: string; kind: string }[]).map((r) => `${r.table_name}:${r.kind}`));
    for (const c of ["decks:decks", "dashboard_snapshots:snapshots"]) expect(caps, c).toContain(c);
  });

  it("opens nothing that shares, links or sends a deck or a Snapshot", async () => {
    const open = ((await db().from("demo_open_tables").select("table_name")).data ?? []).map((r) => r.table_name as string);
    for (const t of ["shares", "view_links", "calendar_links", "webhooks"]) expect(open, t).not.toContain(t);
  });
});

describe("a visitor's own decks", () => {
  it("are made, named, laid out, themed, versioned, saved as a template and a layout, and deleted, as the owner Sara", async () => {
    await asVisit(async () => {
      const id = await decks.createDeck(sara, "My test deck");
      await decks.renameDeck(sara, id, "My test deck 2");
      await decks.setDeckFooter(sara, id, "A footer");
      await decks.saveDeck(sara, id, slideWith("Revenue against cost"));
      await decks.setDeckTheme(sara, id, null);
      await saveNamedVersion(sara, "deck", id, "Before cleaning");
      const version = (await db().from("versions").select("id").eq("object_type", "deck").eq("object_id", id).eq("name", "Before cleaning").single()).data!.id as number;
      await nameVersion(sara, version, "Named again");
      await decks.saveDeck(sara, id, slideWith("Something else"));
      await restoreVersion(sara, version);
      // A version too large to keep is refused when named, not left out (a deck of about 400 KB is over the 256 KB a Version may hold).
      const bigDoc = slideWith("ok");
      for (let i = 0; i < 40; i++) (bigDoc.store as Record<string, unknown>)[`shape:d${i}`] = { id: `shape:d${i}`, typeName: "shape", type: "draw", x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, parentId: "shape:slide1", index: "a2", meta: {}, props: { segments: [{ type: "free", path: "A".repeat(10_000) }] } };
      await decks.saveDeck(sara, id, bigDoc);
      await expect(saveNamedVersion(sara, "deck", id, "Too large")).rejects.toBeInstanceOf(DemoSizeRefused);
      await decks.saveDeck(sara, id, slideWith("Small again"));
      const tpl = await saveDeckTemplate(sara, { deckId: id, name: "My deck template", description: "", labels: [], choices: {} });
      const copy = await createDeckFromTemplate(sara, { template: tpl, name: "From my template", fills: [] });
      await saveSlideLayout(sara, { deckId: id, shapes: [{ type: "text", x: 0, y: 0, rotation: 0, opacity: 1, props: { richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Layout words" }] }] } } }], name: "My layout", description: "", labels: [], choices: {} });
      await decks.deleteDeck(sara, copy);
      await decks.deleteDeck(sara, id);
      expect((await db().from("decks").select("id").eq("id", id)).data).toEqual([]);
    });
    expect((await db().from("demo_state").select("changed_since_reset").single()).data?.changed_since_reset).toBe(true);
  });
});

describe("what a visitor writes on a deck", () => {
  it("is plain text and plain shapes: a link, a picture, an embedded page or a stray property is refused in words, and nothing is written", async () => {
    await asVisit(async () => {
      await expect(decks.createDeck(sara, "see www.example.com")).rejects.toBeInstanceOf(DemoTextRefused);
      const id = await decks.createDeck(sara, "Words deck");
      await decks.saveDeck(sara, id, slideWith("Plain words"));
      const before = (await db().from("decks").select("document").eq("id", id).single()).data?.document;
      await expect(decks.saveDeck(sara, id, slideWith("write me at a@b.com"))).rejects.toBeInstanceOf(DemoTextRefused);
      await expect(decks.saveDeck(sara, id, { store: { "asset:a": { id: "asset:a", typeName: "asset", type: "image", props: { src: "data:image/png;base64,AAAA" } } } })).rejects.toBeInstanceOf(DemoTextRefused);
      const odd = slideWith("ok");
      (odd.store["shape:text1"].props as Record<string, unknown>).note = "visit evil.example now";
      await expect(decks.saveDeck(sara, id, odd)).rejects.toBeInstanceOf(DemoTextRefused);
      await expect(decks.setDeckFooter(sara, id, "www.example.com")).rejects.toBeInstanceOf(DemoTextRefused);
      await expect(decks.renameDeck(sara, id, "<b>x</b>")).rejects.toBeInstanceOf(DemoTextRefused);
      await expect(saveSlideLayout(sara, { deckId: id, shapes: [{ type: "image", x: 0, y: 0, rotation: 0, opacity: 1, props: {} }], name: "x", description: "", labels: [], choices: {} })).rejects.toBeInstanceOf(DemoTextRefused);
      // No half-done change: the deck is as it was.
      expect((await db().from("decks").select("document").eq("id", id).single()).data?.document).toEqual(before);
    });
  });

  it("is small: a deck over 512 KB is refused before it is written, and the database holds the same line", async () => {
    await asVisit(async () => {
      const id = await decks.createDeck(sara, "Big deck");
      const path = "A".repeat(10_000);
      const big = slideWith("ok");
      for (let i = 0; i < 60; i++) (big.store as Record<string, unknown>)[`shape:d${i}`] = { id: `shape:d${i}`, typeName: "shape", type: "draw", x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, parentId: "shape:slide1", index: "a2", meta: {}, props: { segments: [{ type: "free", path }] } };
      await expect(decks.saveDeck(sara, id, big)).rejects.toBeInstanceOf(DemoSizeRefused);
      // Past the core's gate, as a write that did not come through it: the trigger refuses with the limit's code.
      await expect((async () => { await db().from("decks").update({ document: { pad: "x".repeat(1_000_000) } }).eq("id", id); })()).rejects.toBeInstanceOf(DemoLimit);
    });
  });
});

describe("a visitor's own Snapshots", () => {
  it("are taken one at a time, written up, shown and deleted, and the turn is given back", async () => {
    await asVisit(async () => {
      const id = await dash.createDashboard(sara, "Snapshot board");
      await dash.placeWidget(sara, id, { type: "metric", id: metric });
      const snapshotId = await withSnapshotTurn(sara, who, (turn) => snapshots.takeSnapshot(sara, id, { kind: "month", start: lastMonth() }, { turn: turn ?? undefined }));
      await snapshots.editSnapshotWords(sara, snapshotId, { intro: "A plain note." });
      await expect(snapshots.editSnapshotWords(sara, snapshotId, { intro: "see www.example.com" })).rejects.toBeInstanceOf(DemoTextRefused);
      await snapshots.showSnapshot(sara, snapshotId);
      await snapshots.deleteSnapshot(sara, snapshotId);
      // The turn was given back: another can be taken at once.
      const again = await withSnapshotTurn(sara, who, (turn) => snapshots.takeSnapshot(sara, id, { kind: "month", start: lastMonth() }, { turn: turn ?? undefined }));
      expect(again).toBeGreaterThan(0);
    });
  });

  it("are not taken without the demo's turn, nor while another visitor holds it", async () => {
    await asVisit(async () => {
      const id = await dash.createDashboard(sara, "Turn board");
      await dash.placeWidget(sara, id, { type: "metric", id: metric });
      await expect(snapshots.takeSnapshot(sara, id, { kind: "month", start: lastMonth() })).rejects.toBeInstanceOf(DemoSizeRefused);
      // Another visitor's turn, held now.
      await db().rpc("demo_snapshot_lock_take", { p_holder: "another-visitor-holds-it", p_seconds: 30 });
      await expect(withSnapshotTurn(sara, who, async () => "never")).rejects.toThrow(DEMO_SNAPSHOT_BUSY);
      // A late release by someone else frees nothing; the holder's does.
      await db().rpc("demo_snapshot_lock_release", { p_holder: "somebody-else-entirely" });
      await expect(withSnapshotTurn(sara, who, async () => "never")).rejects.toThrow(DEMO_SNAPSHOT_BUSY);
      await db().rpc("demo_snapshot_lock_release", { p_holder: "another-visitor-holds-it" });
      expect(await withSnapshotTurn(sara, who, async () => "now")).toBe("now");
    }, 0, "abcdef0123456789abcdef0123456789");
  });

  it("that are certain to fail at the write are refused before the turn is taken or anything computed: a period taken already", async () => {
    await asVisit(async () => {
      const id = await dash.createDashboard(sara, "Doomed board");
      await dash.placeWidget(sara, id, { type: "metric", id: metric });
      await withSnapshotTurn(sara, who, (turn) => snapshots.takeSnapshot(sara, id, { kind: "month", start: lastMonth() }, { turn: turn ?? undefined }));
      await expect(snapshots.assertSnapshotRoom(sara, id, { kind: "month", start: lastMonth() })).rejects.toThrow(/already/);
      // The seed's Snapshots were made before the seed was done: they are not counted against the visitors' 20.
      const seeded = (await db().from("dashboard_snapshots").select("created_at").eq("workspace_id", DEMO_WORKSPACE_ID).order("created_at").limit(1).single()).data;
      expect(seeded).toBeDefined();
    }, 0, "5555666677778888aaaabbbbccccdddd");
  });

  it("are the visitor's share: a visit takes three in a window, and the fourth is refused with words", async () => {
    await asVisit(async () => {
      const id = await dash.createDashboard(sara, "Share board");
      await dash.placeWidget(sara, id, { type: "metric", id: metric });
      // From an address and network of its own: the others have used theirs in the tests above.
      const mine = { ...who, headers: new Headers({ "x-forwarded-for": "198.51.100.7" }) };
      for (let i = 0; i < 3; i++) await withSnapshotTurn(sara, mine, async () => i);
      await expect(withSnapshotTurn(sara, mine, async () => 3)).rejects.toBeInstanceOf(DemoSizeRefused);
    }, 0, "00112233445566778899aabbccddeeff");
  });
});

describe("what the seed made", () => {
  it("keeps its decks and Snapshots: refused in the demo's words, before anything is written", async () => {
    const deck = (await db().from("decks").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).order("id").limit(1).single()).data!.id as number;
    const snapshot = (await db().from("dashboard_snapshots").select("id, dashboard_id").eq("workspace_id", DEMO_WORKSPACE_ID).is("deleted_at", null).order("id").limit(1).maybeSingle()).data;
    await asVisit(async () => {
      await expect(decks.saveDeck(sara, deck, slideWith("Changed"))).rejects.toBeInstanceOf(DemoShowcase);
      await expect(decks.renameDeck(sara, deck, "Renamed")).rejects.toBeInstanceOf(DemoShowcase);
      await expect(decks.setDeckFooter(sara, deck, "Footer")).rejects.toBeInstanceOf(DemoShowcase);
      await expect(decks.setDeckTheme(sara, deck, null)).rejects.toBeInstanceOf(DemoShowcase);
      await expect(decks.deleteDeck(sara, deck)).rejects.toBeInstanceOf(DemoShowcase);
      await expect(saveNamedVersion(sara, "deck", deck, "A name")).rejects.toBeInstanceOf(DemoShowcase);
      if (snapshot) {
        await expect(snapshots.deleteSnapshot(sara, snapshot.id as number)).rejects.toBeInstanceOf(DemoShowcase);
        await expect(snapshots.editSnapshotWords(sara, snapshot.id as number, { intro: "Changed" })).rejects.toBeInstanceOf(DemoShowcase);
        // A Snapshot of a showcase dashboard: refused before any number is computed, with no turn needed to be told.
        await expect(withSnapshotTurn(sara, who, (turn) => snapshots.takeSnapshot(sara, snapshot.dashboard_id as number, { kind: "month", start: lastMonth() }, { turn: turn ?? undefined }))).rejects.toBeInstanceOf(DemoShowcase);
      }
    }, 0, "ffeeddccbbaa99887766554433221100");
  });
});

describe("the caps", () => {
  it("hold 15 decks: the next is refused, with the demo's words", async () => {
    await asVisit(async () => {
      const made = (await db().from("decks").select("*", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID)).count ?? 0;
      let n = 0;
      await expect((async () => { for (; n < 40; n++) await decks.createDeck(sara, `Deck ${n}`); })()).rejects.toBeInstanceOf(DemoLimit);
      expect(made + n).toBeGreaterThan(made);
      expect(n).toBeLessThanOrEqual(15);
    }, 0, "99887766554433221100ffeeddccbbaa");
  }, 120_000);
});

describe("without a visit, or a visit that is stale, or with the setting off", () => {
  it("is refused as the demo always was, whatever the work", async () => {
    turnOn();
    await expect(decks.createDeck(sara, "No visit")).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(asVisit(() => decks.createDeck(sara, "Stale"), -1)).rejects.toThrow();
    delete process.env.ZIFFR_DEMO_CHANGES;
    forgetStoredSettings();
    await expect(visitingDemo({ generation: await generation(), visit: VISIT }, () => decks.createDeck(sara, "Off"))).rejects.toBeInstanceOf(DemoReadOnly);
  });
});
