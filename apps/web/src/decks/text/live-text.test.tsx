// Text boxes with live values (GLOSSARY: Placeholder, Slide; ticket #1172): what a box is filled from, what is written
// into the deck, and that no Metric is on a box nobody picked.
import { renderToString } from "react-dom/server";
import { atom, type Editor, type TLShape } from "tldraw";
import { describe, expect, it } from "vitest";
import { richRuns } from "@ziffr/core/slide-text";
import type { CanvasData } from "@ziffr/core/types";
import type { Kept } from "../kept/kept-drawing";
import { InsertValueForm, insertValue } from "./insert-value";
import { exported, filledWords, setTextFill } from "./live-text";

const rich = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const text = (id: string, words: string, metrics?: number[], parentId = "shape:slide") =>
  ({ id, typeName: "shape", type: "text", parentId, x: 0, y: 0, props: { richText: rich(words), autoSize: true, w: 60 }, meta: metrics ? { metrics } : {} }) as unknown as TLShape;
const data = (value: number, ids: number[]) =>
  ({ metrics: ids.map((id) => ({ id, slug: `m${id}`, name: `Metric ${id}`, unit: "", format: "number", decimals: 0, period: "month" })), series: Object.fromEntries(ids.map((id) => [`m${id}`, [{ period: "2026-10-01", value }]])), themes: [], numberStyle: "1,234.5", yearStart: 1 }) as unknown as CanvasData;

/** An editor holding one slide with these shapes, as far as filling and inserting ask one. */
function editorWith(shapes: TLShape[], over: Record<string, unknown> = {}) {
  const slide = { id: "shape:slide", typeName: "shape", type: "frame", parentId: "page:p", x: 0, y: 0, props: {}, meta: {} } as unknown as TLShape;
  const keeping = { ...slide, id: "shape:kept", meta: { snapshot: 7 } } as unknown as TLShape;
  const all = atom("shapes", [slide, keeping, ...shapes]);
  const written: Record<string, unknown>[] = [];
  const editor = {
    getCurrentPageShapes: () => all.get(),
    getShape: (id: string) => all.get().find((s) => s.id === id),
    getShapeAncestors: (id: string) => all.get().filter((s) => s.id === all.get().find((c) => c.id === id)?.parentId),
    getEditingShapeId: () => null,
    getSortedChildIdsForParent: () => [],
    getShapePageBounds: () => ({ x: 0, y: 0, w: 1280, h: 720, collides: () => true }),
    getViewportPageBounds: () => ({}),
    markHistoryStoppingPoint: () => {},
    selectNone: () => {},
    createShape: (s: Record<string, unknown>) => written.push(s),
    updateShape: (s: Record<string, unknown>) => written.push(s),
    ...over,
  } as unknown as Editor;
  return { editor, written };
}

const said = (words: unknown) => richRuns(words).join("");

describe("what a text box is filled from", () => {
  it("is empty until the editor is handed values, then the viewer's own", () => {
    const box = text("shape:a", "{metric}: {latest}", [1]);
    const { editor } = editorWith([box]);
    expect(said(filledWords(editor, box))).toBe(": ");
    setTextFill(editor, { data: data(12, [1]), kept: null });
    expect(said(filledWords(editor, box))).toBe("Metric 1: 12");
    // The stored shape is never changed.
    expect(said((exported(editor, box).props as { richText: unknown }).richText)).toBe("Metric 1: 12");
    expect(said((box.props as { richText: unknown }).richText)).toBe("{metric}: {latest}");
  });

  it("leaves a box without a list as it is", () => {
    const box = text("shape:a", "{latest}");
    const { editor } = editorWith([box]);
    expect(filledWords(editor, box)).toBeUndefined();
    expect(exported(editor, box)).toBe(box);
  });

  it("on a slide that keeps numbers is only what the Snapshot gives this viewer, never the live values", () => {
    const box = text("shape:a", "{latest} / {latest 2}", [1, 2], "shape:kept");
    const { editor } = editorWith([box]);
    const live = data(999, [1, 2]);
    const shown = (ids: number[]): Kept => ({ asked: [{ snapshotId: 7, parts: [], metricIds: [1, 2] }], read: [{ snapshotId: 7, state: "shown", dashboardId: 1, name: "Sales", label: "Q3", takenAt: "2026-10-05T09:00:00Z", intro: "", parts: [], corrected: [], data: data(100, ids) }] });
    setTextFill(editor, { data: live, kept: shown([1, 2]) });
    expect(said(filledWords(editor, box))).toBe("100 / 100");
    // One Metric the Snapshot does not give them: the box shows no figure at all.
    for (const kept of [shown([1]), null, { asked: [], read: [] }]) {
      setTextFill(editor, { data: live, kept });
      expect(said(filledWords(editor, box))).toBe(" / ");
    }
  });
});

describe("Insert value", () => {
  it("starts with no Metric picked", () => {
    const html = renderToString(<InsertValueForm metrics={[{ id: 7, name: "Commit" }]} onInsert={() => {}} onClose={() => {}} />);
    expect(html).toContain('<option value="" selected="">Pick a Metric</option>');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Insert/);
  });

  it("makes a new text box on the slide in view that names the Metric", () => {
    const { editor, written } = editorWith([]);
    expect(insertValue(editor, null, "latest", [7])).toBe(true);
    expect(written).toMatchObject([{ type: "text", parentId: "shape:slide", meta: { metrics: [7] }, props: { autoSize: false } }]);
    expect(said((written[0].props as { richText: unknown }).richText)).toBe("{latest}");
  });

  it("adds to the words of a picked box and gives it a width of its own", () => {
    const { editor, written } = editorWith([text("shape:a", "Up to", [1])]);
    expect(insertValue(editor, "shape:a" as TLShape["id"], "latest", [2])).toBe(true);
    // The place no word asked for is taken: Metric 1 leaves the box.
    expect(written).toMatchObject([{ id: "shape:a", meta: { metrics: [2] }, props: { autoSize: false, w: 480 } }]);
    expect(said((written[0].props as { richText: unknown }).richText)).toBe("Up to {latest}");
  });
});
