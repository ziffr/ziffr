// A deck's kept numbers (spec 0061; GLOSSARY: Snapshot Part, Snapshot, Deck, Share): what whoever looks at a deck is
// given of the Snapshots it draws, putting a Snapshot on a deck, and telling a deck's owner who will not see what.
// Every function takes the Actor first.
// Security: a deck's Share opens nothing here (the owner's decision, 2026-11-26). Each read asks again, per viewer,
// exactly what opening the Snapshot asks: may open the dashboard, the Snapshot is shown, and of it the Metrics they
// may see now. Ids come from a deck's document or a browser and are untrusted; one that is not shared, one of
// another Workspace and one nobody has answer alike.
import { assertCan, Forbidden, Refused, type Actor } from "./actor";
import { getGroups, visibilityOfMany, visibleDecks } from "./access";
import { createDeck, NOT_FOR_THE_EDITOR } from "./decks";
import { isDescribed } from "./deck-form";
import { deletedKept } from "./deleted-metrics";
import { db } from "./db";
import { refuseSeeded } from "./demo-seeded-rows";
import { correctedSince, recordedNow, shownForReader, snapshotAccess, type ShownSnapshot } from "./snapshots";
import { keptShapes, OPENING_PART, SNAPSHOT_PART_LIMITS, type KeptRequest, type KeptShape } from "./snapshot-parts";
import { deckMetricIds } from "./visibility";
import { shownData } from "./view-links";
import { widgetMetricIds } from "./widget-metrics";
import { getMetrics } from "./workspace-data";
import { peopleIn } from "./submissions";
import type { CanvasData, Widget } from "./types";

/** What a viewer gets of one Snapshot a deck draws. "unavailable" says nothing at all about it; "deleted" is told only
 * to who may open its dashboard. When shown: its dashboard's name, period and day taken, the parts asked for that the
 * viewer may see (the opening part has no widget), the kept data of those Metrics only, and which of them have a value
 * corrected since. */
export type KeptSnapshot =
  | { snapshotId: number; state: "unavailable" | "deleted" }
  | { snapshotId: number; state: "shown"; dashboardId: number; name: string; label: string; takenAt: string; intro: string; parts: KeptPart[]; data: CanvasData; corrected: number[] };

/** One part a viewer gets: its number and the Snapshot's widget with its words; the opening part has none. */
export type KeptPart = { part: number; widget: Widget | null };

/** A request for a Snapshot's numbers as a browser sent it, checked: its shape, its ids and how much it asks for. */
function checked(input: unknown): KeptRequest[] {
  const { snapshots, parts, metrics } = SNAPSHOT_PART_LIMITS;
  const numbers = (v: unknown, most: number, least: number) => Array.isArray(v) && v.length <= most && v.every((n) => Number.isSafeInteger(n) && (n as number) >= least);
  const one = (r: unknown) => {
    const q = (r ?? {}) as Partial<Record<keyof KeptRequest, unknown>>;
    return numbers([q.snapshotId], 1, 1) && numbers(q.parts, parts, OPENING_PART) && numbers(q.metricIds, metrics, 1);
  };
  if (!Array.isArray(input) || input.length > snapshots || !input.every(one)) throw new Forbidden(`Ask for at most ${snapshots} Snapshots, by id.`);
  return input as KeptRequest[];
}

const widgetIds = (w: Widget) => widgetMetricIds(w.metric_ids ?? [], w.settings);

/** How often one person may read kept numbers in a minute, in one process: far more than editing, presenting and
 * exporting ask, and a bound on a program that asks without end, as each read opens up to twenty Snapshots. */
export const KEPT_READS_PER_MINUTE = 240;

const MINUTE = 60_000;
const reads = new Map<string, number[]>();

/** Counts one read of kept numbers for this person, refusing one past the minute's share. */
function takeRead(actor: Actor, now = Date.now()) {
  const who = `${actor.workspaceId} ${actor.personId}`;
  const recent = (reads.get(who) ?? []).filter((t) => now - t < MINUTE);
  if (recent.length >= KEPT_READS_PER_MINUTE) throw new Refused("Snapshot numbers were asked for too often. Wait a minute and try again.");
  // Forgotten as a whole rather than grown without end.
  if (reads.size > 5000) reads.clear();
  reads.set(who, [...recent, now]);
}

/** The numbers a deck's slides keep, for one viewer (`requests` as `keptRequests` makes them from the deck). Each
 * Snapshot answers by itself, with nothing but what was asked for. */
export async function readKeptNumbers(actor: Actor, requests: unknown): Promise<KeptSnapshot[]> {
  const asked = checked(requests);
  // A deck without kept numbers asks nothing and is not counted.
  if (asked.length) takeRead(actor);
  const read = await Promise.all(asked.map(async (q): Promise<KeptSnapshot> => {
    const s = await shownForReader(actor, q.snapshotId);
    if (s === null || s === "deleted") return { snapshotId: q.snapshotId, state: s === null ? "unavailable" : "deleted" };
    const parts = q.parts.flatMap((part): KeptPart[] => {
      if (part === OPENING_PART) return [{ part, widget: null }];
      const widget = s.widgets.find((w) => w.id === part);
      return widget ? [{ part, widget }] : [];
    });
    // Only the Metrics the parts draw and the other shapes name, of those the viewer gets in the Snapshot.
    const wanted = new Set([...parts.flatMap((p) => (p.widget ? widgetIds(p.widget) : [])), ...q.metricIds]);
    // `s.data` is what this viewer gets of the Snapshot, Totals included: only fewer Metrics of it are taken here.
    const data = { ...shownData(s.data, wanted, null, () => true), themes: [] };
    return {
      snapshotId: q.snapshotId, state: "shown", dashboardId: s.dashboardId, name: s.name, label: s.label, takenAt: s.takenAt,
      intro: q.parts.includes(OPENING_PART) ? s.intro : "", parts, data, corrected: [],
    };
  }));
  const ids = [...new Set(read.flatMap((s) => (s.state === "shown" ? s.data.metrics.map((m) => m.id) : [])))];
  if (!ids.length) return read;
  // Read once for all: what the viewer sees recorded today, to mark what was corrected since.
  const now = await recordedNow(actor, ids);
  return read.map((s) => (s.state === "shown" ? { ...s, corrected: [...new Set(correctedSince(s.data, now).map((c) => c.metricId))] } : s));
}

/** The slides a shown Snapshot puts on a deck: its dashboard and period for a new deck's name, the opening part and
 * one part for each widget the person may see, in reading order, and how many widgets are left out. */
export type SnapshotSlides = { snapshotId: number; name: string; parts: number[]; leftOut: number };

/** What a Snapshot puts on a deck for this person (spec 0061): whoever may create and may open it, once it is shown.
 * Refused when they may see none of its widgets. */
export async function snapshotSlides(actor: Actor, snapshotId: number): Promise<SnapshotSlides> {
  assertCan(actor, "create");
  const s = await shownForReader(actor, snapshotId);
  if (s === "deleted") throw new Refused("This Snapshot was deleted.");
  if (!s) {
    // A draft is said to be one only to who may open it; to anyone else it is like any Snapshot that is not theirs.
    if (Number.isSafeInteger(snapshotId) && (await snapshotAccess(actor, snapshotId)).view) throw new Refused("Show the Snapshot to everyone with access first, then put its numbers on a deck.");
    throw new Forbidden();
  }
  if (s.kept && !s.widgets.length) throw new Refused("You may not see any part of this Snapshot, so there is nothing to put on a deck. Ask its dashboard's owner.");
  const parts = [OPENING_PART, ...s.widgets.map((w) => w.id)];
  if (parts.length > SNAPSHOT_PART_LIMITS.parts) throw new Refused(`This Snapshot has more parts than a deck holds (${SNAPSHOT_PART_LIMITS.parts}).`);
  return { snapshotId, name: deckNameOf(s), parts, leftOut: s.kept - s.widgets.length };
}

const deckNameOf = (s: ShownSnapshot) => `${s.name}, ${s.label}`.slice(0, 120);

/** What adding a Snapshot to a deck that exists places: the deck's owner and its Editors, never a Guest, within the
 * deck's limits. The editor adds the slides at the end and saves; nothing already on the deck changes. */
export async function snapshotAddition(actor: Actor, deckId: number, snapshotId: number): Promise<SnapshotSlides> {
  assertCan(actor, "create");
  if (!Number.isSafeInteger(deckId)) throw new Forbidden();
  const role = (await visibleDecks(actor.workspaceId, actor.personId)).find((d) => d.id === deckId)?.role;
  if (role !== "owner" && role !== "editor") throw new Forbidden("Only the deck's owner and its Editors add to it.");
  // In the demo a deck the seed made is kept as it is: said now, not when the editor's save is refused.
  await refuseSeeded(actor, "decks", deckId);
  const slides = await snapshotSlides(actor, snapshotId);
  const document = await storedDocument(actor, deckId);
  // A deck Ziffr makes takes no Snapshot Part (spec 0069).
  if (isDescribed(document)) throw new Refused(NOT_FOR_THE_EDITOR);
  const shapes = keptShapes(document);
  const { parts, snapshots } = SNAPSHOT_PART_LIMITS;
  if (shapes.filter((x) => x.part !== null).length + slides.parts.length > parts) throw new Refused(`A deck holds ${parts} Snapshot Parts at most, and this one has no room for these. Remove some, or make a new deck.`);
  if (new Set([...shapes.map((x) => x.snapshotId).filter((id) => id !== null), snapshotId]).size > snapshots) throw new Refused(`A deck draws ${snapshots} Snapshots at most. Remove the slides of one, or make a new deck.`);
  return slides;
}

/** A new deck for a Snapshot's numbers, named after its dashboard and period: the Snapshot is checked first, so a
 * refused one leaves no empty deck behind. Answers the deck's id; its slides are placed as by `snapshotAddition`. */
export async function newDeckFromSnapshot(actor: Actor, snapshotId: number): Promise<number> {
  const slides = await snapshotSlides(actor, snapshotId);
  // Named after the Snapshot's dashboard, whose name was checked when it was written (or is the seed's).
  return createDeck(actor, slides.name, { derived: true });
}

/** A deck's slides as stored, of the actor's Workspace. */
async function storedDocument(actor: Actor, deckId: number): Promise<unknown> {
  const { data } = await db().from("decks").select("document").eq("id", deckId).eq("workspace_id", actor.workspaceId).maybeSingle();
  return data?.document;
}

/** What one person or Group will not see of a deck's kept numbers, from one Snapshot ("Sales, Q3 2026"). */
export type ShareGap = { from: string; count: number };
/** Per person id, or "g" and a Group's id: what they will not see; and how many parts the owner may not see
 * either, which are never named. */
export type DeckShareGaps = { who: Record<string, ShareGap[]>; unnamed: number };

/** A kept shape the deck's owner may see: its dashboard and the Metrics a reader needs for it. */
type Named = { snapshotId: number; dashboardId: number; from: string; metricIds: number[] };

/** A kept shape as the owner gets it, or null when it shows them nothing: it is then not named to them. */
function namedFor(shape: KeptShape, s: ShownSnapshot): Named | null {
  const widget = shape.part ? s.widgets.find((w) => w.id === shape.part) : undefined;
  const metricIds = shape.part === null ? shape.metricIds : shape.part === OPENING_PART ? [] : widget ? widgetIds(widget) : null;
  if (!metricIds || !metricIds.every((id) => s.data.metrics.some((m) => m.id === id))) return null;
  return { snapshotId: s.id, dashboardId: s.dashboardId, from: `${s.name}, ${s.label}`, metricIds };
}

/** Who will not see which of a deck's Snapshot Parts and kept numbers, for its owner to read before sharing it
 * (spec 0061, #1208): every person and Group of the Workspace, counted as if the deck were shared with them (its live
 * Widgets then open their Metrics, the kept numbers nothing). Only the owner, and only of what they may see. */
export async function deckShareGaps(actor: Actor, deckId: number): Promise<DeckShareGaps> {
  assertCan(actor, "share");
  if (!Number.isSafeInteger(deckId)) throw new Forbidden();
  const { data: deck } = await db().from("decks").select("owner_id, document").eq("id", deckId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!deck || deck.owner_id !== actor.personId) throw new Forbidden();
  const shapes = keptShapes(deck.document);
  const none: DeckShareGaps = { who: {}, unnamed: 0 };
  if (!shapes.length) return none;
  const ids = [...new Set(shapes.flatMap((s) => (s.snapshotId === null ? [] : [s.snapshotId])))].slice(0, SNAPSHOT_PART_LIMITS.snapshots);
  const mine = new Map(await Promise.all(ids.map(async (id) => [id, await shownForReader(actor, id)] as const)));
  const named = shapes.flatMap((shape) => {
    const s = shape.snapshotId === null ? null : mine.get(shape.snapshotId);
    return (s && s !== "deleted" && namedFor(shape, s)) || [];
  });
  const unnamed = shapes.length - named.length;
  if (!named.length) return { ...none, unnamed };
  const ws = actor.workspaceId;
  const [people, groups, metrics] = await Promise.all([peopleIn(ws), getGroups(ws), getMetrics(ws)]);
  const seesAs = await visibilityOfMany(ws, metrics);
  // A Metric deleted since is still shown, on kept slides only, to who saw it when it was deleted (spec 0065).
  const existing = new Set(metrics.map((m) => m.id));
  const goneNamed = named.some((n) => n.metricIds.some((m) => !existing.has(m)));
  const keeps = new Map(goneNamed ? await Promise.all(people.map(async (p) => [p.id, await deletedKept(ws, p.id, existing)] as const)) : []);
  const opened = new Set(deckMetricIds(deck.document));
  const missing = new Map(people.filter((p) => p.id !== actor.personId).map((p) => {
    const sees = seesAs(p.id);
    return [p.id, named.filter((n) => !sees.dashboards.has(n.dashboardId) || !n.metricIds.every((m) => sees.metrics.has(m) || opened.has(m) || keeps.get(p.id)?.has(m)))] as const;
  }));
  const gaps = (lost: Iterable<Named>): ShareGap[] => {
    const per = new Map<number, ShareGap>();
    for (const n of lost) per.set(n.snapshotId, { from: n.from, count: (per.get(n.snapshotId)?.count ?? 0) + 1 });
    return [...per.values()];
  };
  const who: Record<string, ShareGap[]> = {};
  for (const [person, lost] of missing) if (lost.length) who[person] = gaps(lost);
  // A Group is listed when any member cannot.
  for (const g of groups) {
    const lost = new Set(g.members.flatMap((m) => missing.get(m) ?? []));
    if (lost.size) who[`g${g.id}`] = gaps(lost);
  }
  return { who, unnamed };
}
