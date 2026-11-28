// Which shapes of a deck keep a Snapshot's numbers (spec 0061; GLOSSARY: Snapshot Part, Slide), what a part may hold,
// and what that leaves of a deck for its Share and for a View Link. Pure.
import { describe, expect, it } from "vitest";
import { holdsSnapshotPart, keptRequests, keptShapes, liveDocument, SNAPSHOT_PART_LIMITS, SNAPSHOT_PART_SHAPE, snapshotPartProblem, withoutKeptNumbers } from "./snapshot-parts";
import { allDeckMetricIds, deckMetricIds, deckMetricIdsAdded } from "./visibility";

const shape = (id: string, type: string, parentId: string, props: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => ({ id, typeName: "shape", type, parentId, meta, props });
const frame = (id: string, meta: Record<string, unknown> = {}) => shape(id, "frame", "page:page", { w: 1280, h: 720 }, meta);
const part = (id: string, parentId: string, snapshotId: number, n: number) => shape(id, SNAPSHOT_PART_SHAPE, parentId, { w: 600, h: 300, snapshotId, part: n });
const widget = (id: string, parentId: string, metricIds: number[], settings: Record<string, unknown> = {}) => shape(id, "ziffr-widget", parentId, { metricIds, settings: JSON.stringify(settings), template: "line" });
const deck = (...shapes: { id: string }[]) => ({ store: { "page:page": { id: "page:page", typeName: "page" }, ...Object.fromEntries(shapes.map((s) => [s.id, s])) } });
const ids = (document: unknown) => Object.keys((document as { store: object }).store).sort();

/** A live slide, a slide with a part and a widget beside it (in a group), and a slide marked as a Snapshot's whose
 * part was deleted. */
const mixed = deck(
  frame("live"), widget("liveWidget", "live", [1]),
  frame("kept"), part("part", "kept", 7, 12), shape("group", "group", "kept"), widget("beside", "group", [2]), widget("headline", "kept", [], { element: { kind: "words" } }),
  frame("marked", { snapshot: 8 }), widget("left", "marked", [3]),
  { id: "arrow", typeName: "binding", fromId: "liveWidget", toId: "part" } as never,
);

describe("slides that keep numbers", () => {
  it("are those with a part or a Snapshot's mark; their widgets that draw numbers keep them", () => {
    expect(keptShapes(mixed)).toEqual([
      { id: "part", slideId: "kept", snapshotId: 7, part: 12, metricIds: [] },
      { id: "beside", slideId: "kept", snapshotId: 7, part: null, metricIds: [2] },
      { id: "left", slideId: "marked", snapshotId: 8, part: null, metricIds: [3] },
    ]);
    expect(keptRequests(mixed)).toEqual([{ snapshotId: 7, parts: [12], metricIds: [2] }, { snapshotId: 8, parts: [], metricIds: [3] }]);
  });

  it("open no Metric through the deck, a free layout's and a panel's included", () => {
    expect(deckMetricIds(mixed, false)).toEqual([1]);
    expect(allDeckMetricIds(mixed, false).sort()).toEqual([1, 2, 3]);
    const nested = deck(frame("kept"), part("p", "kept", 7, 0), widget("canvas", "kept", [], { canvas: { document: deck(widget("inner", "page:page", [4])) } }), widget("story", "kept", [], { panels: [{ metricIds: [5] }] }));
    expect(deckMetricIds(nested, false)).toEqual([]);
    // A Metric drawn live elsewhere is opened as before.
    expect(deckMetricIds(deck(frame("a"), widget("w", "a", [2]), frame("b"), part("p", "b", 7, 0), widget("x", "b", [2])), false)).toEqual([2]);
  });

  it("draw no other numbers when they hold parts of two Snapshots and no mark says which", () => {
    const two = deck(frame("s"), part("a", "s", 7, 0), part("b", "s", 8, 0), widget("w", "s", [1]));
    expect(keptShapes(two).find((s) => s.id === "w")?.snapshotId).toBeNull();
    expect(deckMetricIds(two, false)).toEqual([]);
    const marked = deck(frame("s", { snapshot: 8 }), part("a", "s", 7, 0), part("b", "s", 8, 0), widget("w", "s", [1]));
    expect(keptShapes(marked).find((s) => s.id === "w")?.snapshotId).toBe(8);
  });

  it("ask the saver to see every Metric newly named, and one newly drawn live", () => {
    expect(deckMetricIdsAdded(null, mixed, false).sort()).toEqual([1, 2, 3]);
    expect(deckMetricIdsAdded(mixed, mixed, false)).toEqual([]);
    // The kept widget moved to a live slide: named before, drawn live only now.
    const moved = deck(frame("live"), widget("liveWidget", "live", [1]), widget("beside", "live", [2]));
    expect(deckMetricIdsAdded(mixed, moved, false)).toEqual([2]);
    const unreadable = deck(frame("s", { snapshot: 7 }), widget("w", "s", "x" as unknown as number[]));
    expect(deckMetricIdsAdded(unreadable, unreadable, false)).toEqual([Number.NaN]);
  });

  it("stay kept with a mark that is no id, which draws nothing", () => {
    const broken = deck(frame("s", { snapshot: "7" }), widget("w", "s", [1]));
    expect(keptShapes(broken)).toEqual([{ id: "w", slideId: "s", snapshotId: null, part: null, metricIds: [1] }]);
    expect(deckMetricIds(broken, false)).toEqual([]);
  });

  it("are read from a document that loops or is not one without failing", () => {
    const loop = deck(shape("a", "group", "b"), shape("b", "group", "a"), widget("w", "a", [1]), part("p", "a", 7, 0));
    expect(deckMetricIds(loop, false)).toEqual([1]);
    for (const junk of [null, 1, "x", [], { store: 3 }, { store: { a: null } }]) {
      expect(keptShapes(junk)).toEqual([]);
      expect(snapshotPartProblem(junk)).toBeNull();
    }
  });
});

describe("what a View Link gets of a deck", () => {
  it("has no part, nothing that keeps numbers, no mark and no arrow to what is gone", () => {
    const { document, left } = withoutKeptNumbers(mixed);
    expect(left).toBe(3);
    expect(ids(document)).toEqual(["group", "headline", "kept", "live", "liveWidget", "marked", "page:page"]);
    expect(JSON.stringify(document)).not.toContain("snapshot");
    expect(withoutKeptNumbers(deck(frame("a"), widget("w", "a", [1]))).left).toBe(0);
  });

  it("is the live document for a deck without any", () => {
    const plain = deck(frame("a"), widget("w", "a", [1]));
    expect(liveDocument(plain)).toBe(plain);
    expect(withoutKeptNumbers(plain).document).toBe(plain);
  });
});

describe("what a Snapshot Part may hold", () => {
  const one = (props: Record<string, unknown>, meta: Record<string, unknown> = {}) => deck(frame("s"), shape("p", SNAPSHOT_PART_SHAPE, "s", props, meta));
  const good = { w: 1, h: 1, snapshotId: 7, part: 0 };

  it("its size, a Snapshot's id and a part number, and nothing else", () => {
    expect(snapshotPartProblem(one(good))).toBeNull();
    expect(snapshotPartProblem(mixed)).toBeNull();
    for (const bad of [{ ...good, title: "Revenue" }, { ...good, metricIds: [1] }, { ...good, snapshotId: 0 }, { ...good, snapshotId: "7" }, { ...good, part: -1 }, { ...good, part: 1.5 }, { w: 1, h: 1, snapshotId: 7 }, { ...good, w: null }]) {
      expect(snapshotPartProblem(one(bad))).toMatch(/cannot read/);
    }
    expect(snapshotPartProblem(one(good, { name: "Revenue" }))).toMatch(/cannot read/);
    expect(snapshotPartProblem(deck(frame("s", { snapshot: -1 })))).toMatch(/cannot read/);
  });

  it("and stands on a slide, not inside a widget's free layout", () => {
    const layout = deck(part("p", "page:page", 7, 0));
    expect(holdsSnapshotPart(layout)).toBe(true);
    expect(holdsSnapshotPart(deck(widget("w", "page:page", [], { canvas: { document: layout } })))).toBe(true);
    expect(holdsSnapshotPart(deck(widget("w", "page:page", [1])))).toBe(false);
    expect(snapshotPartProblem(deck(frame("s"), widget("w", "s", [], { canvas: { document: layout } })))).toMatch(/free layout/);
  });

  it("up to so many parts and Snapshots a deck", () => {
    const many = (count: number, snapshot: (i: number) => number) => deck(frame("s"), ...Array.from({ length: count }, (_, i) => part(`p${i}`, "s", snapshot(i), i)));
    expect(snapshotPartProblem(many(SNAPSHOT_PART_LIMITS.parts, () => 7))).toBeNull();
    expect(snapshotPartProblem(many(SNAPSHOT_PART_LIMITS.parts + 1, () => 7))).toMatch(/100 Snapshot Parts/);
    expect(snapshotPartProblem(many(SNAPSHOT_PART_LIMITS.snapshots + 1, (i) => i + 1))).toMatch(/20 Snapshots/);
  });
});
