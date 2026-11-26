// What a shape of a slide is drawn from (spec 0061; GLOSSARY: Snapshot Part, Slide): the live data, or on a slide
// that keeps numbers only what the core answered, with words where there is nothing; and the lines saying whose
// numbers they are.
import { describe, expect, it } from "vitest";
import type { KeptShape } from "@ziffr/core/snapshot-parts";
import type { CanvasData } from "@ziffr/core/types";
import { asksAll, KEPT_WORDS, keptDrawing, keptLine, keptSlideLines, leftOutWords, liveMetricIds, onSlide, withParts, type Kept } from "./kept-drawing";

const data = (value: number, ids: number[]) => ({ metrics: ids.map((id) => ({ id, slug: `m${id}` })), series: Object.fromEntries(ids.map((id) => [`m${id}`, [{ period: "2026-10-01", value }]])), themes: [] }) as unknown as CanvasData;
const live = { ...data(999, [1, 2, 3]), themes: [{ id: 4 }] } as unknown as CanvasData;
const kept: Kept = {
  asked: [{ snapshotId: 7, parts: [0, 12, 13], metricIds: [1, 2] }, { snapshotId: 8, parts: [0], metricIds: [] }],
  read: [
    { snapshotId: 7, state: "shown", dashboardId: 1, name: "Sales", label: "Q3 2026", takenAt: "2026-10-05T09:00:00Z", intro: "", corrected: [], data: data(100, [1]),
      parts: [{ part: 0, widget: null }, { part: 12, widget: { id: 12, template: "line", metric_ids: [1], settings: {}, title: null } as never }] },
    { snapshotId: 8, state: "deleted" },
  ],
};
const element = (metricIds: number[], snapshotId: number | null = 7): KeptShape => ({ id: "shape:e", slideId: "shape:s", snapshotId, part: null, metricIds });
const part = (n: number, snapshotId = 7): KeptShape => ({ id: "shape:p", slideId: "shape:s", snapshotId, part: n, metricIds: [] });

describe("a shape of a slide", () => {
  it("that keeps no numbers is drawn from the live data", () => {
    expect(onSlide(undefined, kept, live, { window: 6 })).toEqual({ data: live, settings: { window: 6 }, kept: false });
  });

  it("that keeps numbers is drawn from the core's answer, without its day, in the live Themes", () => {
    const on = onSlide(element([1]), kept, live, { window: 6, asOf: "2026-09-30" });
    expect(on).toEqual({ data: { ...data(100, [1]), themes: live.themes }, settings: { window: 6 }, kept: true });
  });

  it("never falls back to the live data: whatever is missing, it says words or waits", () => {
    const cases: [KeptShape, Kept | null, string | null][] = [
      [element([2]), kept, KEPT_WORDS.numbers], // not in what the viewer got of the Snapshot
      [element([1, 2]), kept, KEPT_WORDS.numbers],
      [element([1], null), kept, KEPT_WORDS.several],
      [element([1]), null, KEPT_WORDS.numbers], // nothing was read, as on a View Link
      [element([1], 8), kept, null], // not asked yet
      [element([1], 9), { ...kept, failed: true }, KEPT_WORDS.failed],
      [element([1]), { asked: [{ snapshotId: 7, parts: [], metricIds: [1] }], read: [{ snapshotId: 7, state: "unavailable" }] }, KEPT_WORDS.numbers],
    ];
    for (const [shape, answer, words] of cases) expect(onSlide(shape, answer, live, {})).toEqual({ words });
  });

  it("that is a part shows it, the sentence for one not given, or that the Snapshot was deleted", () => {
    expect(keptDrawing(part(12), kept, live)).toMatchObject({ state: "shown", widget: { id: 12 } });
    expect(keptDrawing(part(0), kept, live)).toMatchObject({ state: "shown", widget: null });
    expect(keptDrawing(part(13), kept, live)).toEqual({ state: "notice", words: KEPT_WORDS.part });
    expect(keptDrawing(part(0, 8), kept, live)).toEqual({ state: "notice", words: KEPT_WORDS.deleted });
    expect(keptDrawing(part(14), kept, live)).toEqual({ state: "loading" });
  });
});

describe("a slide's lines", () => {
  const answer = kept.read[0] as Extract<Kept["read"][number], { state: "shown" }>;
  it("say whose numbers its Widgets keep, once each, and that one was corrected; a part says its own", () => {
    expect(keptSlideLines([element([1]), element([1]), part(12)], kept, live)).toEqual([keptLine(answer)]);
    expect(keptLine(answer)).toBe("Numbers as of 5 Oct 2026 · Sales, Q3 2026");
    expect(keptSlideLines([part(12)], kept, live)).toEqual([]);
    expect(keptSlideLines([element([2])], kept, live)).toEqual([]);
    const corrected: Kept = { ...kept, read: [{ ...answer, corrected: [1] }] };
    expect(keptSlideLines([element([1])], corrected, live)).toEqual([`${keptLine(answer)} · ${KEPT_WORDS.corrected}`]);
  });
});

describe("what is asked", () => {
  it("covers a deck only when every part and Metric was asked", () => {
    expect(asksAll(kept, [{ snapshotId: 7, parts: [12], metricIds: [2] }])).toBe(true);
    expect(asksAll(kept, [{ snapshotId: 7, parts: [14], metricIds: [] }])).toBe(false);
    expect(asksAll(kept, [{ snapshotId: 9, parts: [], metricIds: [] }])).toBe(false);
  });

  it("takes in a Snapshot being added", () => {
    expect(withParts([{ snapshotId: 7, parts: [0], metricIds: [1] }], 7, [0, 12])).toEqual([{ snapshotId: 7, parts: [0, 12], metricIds: [1] }]);
    expect(withParts([], 8, [0])).toEqual([{ snapshotId: 8, parts: [0], metricIds: [] }]);
  });

  it("of the live series leaves out what stands on slides that keep numbers", () => {
    const widgets = [{ id: "a", metricIds: [1, 2] }, { id: "b", metricIds: [3] }, { id: "c", metricIds: [2] }];
    expect(liveMetricIds(widgets, new Map([["b", true]]))).toEqual([1, 2]);
  });
});

describe("what a deck's owner is told before sharing", () => {
  it("counts what will not be seen, by Snapshot, and whom to ask", () => {
    expect(leftOutWords([{ from: "Sales, Q3 2026", count: 3 }])).toBe("Cannot see 3 Snapshot Parts (Sales, Q3 2026). Ask the dashboard's owner to share it.");
    expect(leftOutWords([{ from: "Sales, Q3 2026", count: 1 }, { from: "Operations, Q3 2026", count: 2 }])).toBe("Cannot see 1 Snapshot Part (Sales, Q3 2026) and 2 (Operations, Q3 2026). Ask each dashboard's owner to share it.");
  });
});
