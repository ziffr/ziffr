// A Slide Element never takes a Metric nobody picked (spec 0057): the deck shows its Metrics to everyone it is shared
// with and on its View Links.
import { renderToString } from "react-dom/server";
import type { Editor } from "tldraw";
import { describe, expect, it } from "vitest";
import type { SlideElement } from "@ziffr/core/slide-element";
import { NO_ACCESS, PICK_METRIC } from "@ziffr/core/slide-figures";
import type { CanvasData } from "@ziffr/core/types";
import { ELEMENT_CHOICES, metricsAfter, pickMetric } from "./element-add";
import { addElement } from "./element-menu";
import { ElementMetrics } from "./element-panel";
import { SlideElementView } from "./element-view";

const metrics = [{ id: 7, name: "Commit" }, { id: 8, name: "Quota" }, { id: 9, name: "Secret plan" }];
const columns = (flags: { part?: boolean; reference?: boolean } = {}): SlideElement => ({ kind: "columns", ...flags });

describe("a new element", () => {
  it.each(ELEMENT_CHOICES)("$label starts with no Metric", (choice) => {
    const made: { props: { metricIds: number[] } }[] = [];
    const editor = {
      getCurrentPageShapes: () => [{ id: "shape:f", type: "frame", x: 0, y: 0 }],
      getShapePageBounds: () => ({ x: 0, y: 0, w: 1280, h: 720, collides: () => true }),
      getViewportPageBounds: () => ({}),
      getSortedChildIdsForParent: () => [],
      createShape: (shape: { props: { metricIds: number[] } }) => made.push(shape),
      select: () => {},
    } as unknown as Editor;
    addElement(editor, choice);
    expect(made.map((s) => s.props.metricIds)).toEqual([[]]);
  });
});

describe("a change of kind or switch", () => {
  it("adds no Metric when a column chart gets a filled part or a reference line", () => {
    expect(metricsAfter(columns(), columns({ part: true }), [7])).toEqual([7]);
    expect(metricsAfter(columns(), columns({ reference: true }), [7])).toEqual([7]);
    expect(metricsAfter(columns({ part: true }), columns({ part: true, reference: true }), [7, 8])).toEqual([7, 8]);
    expect(metricsAfter(columns(), columns({ part: true }), [])).toEqual([]);
  });

  it("never reads a picked Metric in another role: the reference line is picked again after a part is put before it", () => {
    expect(metricsAfter(columns({ reference: true }), columns({ part: true, reference: true }), [7, 9])).toEqual([7]);
  });

  it("takes off the Metric of what was switched off, and keeps the others in their places", () => {
    expect(metricsAfter(columns({ part: true, reference: true }), columns({ reference: true }), [7, 8, 9])).toEqual([7, 9]);
    expect(metricsAfter(columns({ part: true, reference: true }), columns({ part: true }), [7, 8, 9])).toEqual([7, 8]);
    expect(metricsAfter(columns({ part: true }), columns(), [7])).toEqual([7]);
  });

  it("adds none to another kind, and keeps no more than it reads", () => {
    expect(metricsAfter({ kind: "words", text: [""] }, { kind: "gap-table" }, [])).toEqual([]);
    expect(metricsAfter({ kind: "words", text: [""] }, { kind: "gap-table" }, [7, 8, 9])).toEqual([7, 8]);
    expect(metricsAfter({ kind: "figure" }, { kind: "figure", strong: true }, [])).toEqual([]);
  });
});

describe("picking a Metric", () => {
  it("fills the next empty Slot or changes a filled one, and nothing else", () => {
    expect(pickMetric({ kind: "gap-table" }, [], 0, 8)).toEqual([8]);
    expect(pickMetric({ kind: "gap-table" }, [8], 1, 7)).toEqual([8, 7]);
    expect(pickMetric({ kind: "gap-table" }, [8, 7], 0, 9)).toEqual([9, 7]);
    // No gap is left, no Slot past the last, and choosing nothing picks nothing.
    expect(pickMetric({ kind: "gap-table" }, [], 1, 7)).toEqual([]);
    expect(pickMetric({ kind: "gap-table" }, [8, 7], 2, 9)).toEqual([8, 7]);
    expect(pickMetric({ kind: "figure" }, [], 0, Number(""))).toEqual([]);
  });

  const settings = (element: SlideElement, ids: number[]) => renderToString(<ElementMetrics element={element} ids={ids} metrics={metrics} onChange={() => {}} />);
  const selected = (html: string) => [...html.matchAll(/<option value="([^"]*)" selected="">/g)].map((m) => m[1]);

  it("shows every empty Slot as one to pick, with no Metric chosen", () => {
    const html = settings({ kind: "gap-table" }, []);
    expect(html.match(new RegExp(PICK_METRIC, "g"))).toHaveLength(2);
    expect(selected(html)).toEqual(["", ""]);
    expect(html).not.toContain("Add a Metric");
  });

  it("adds one more only by choosing which, from those not on the element", () => {
    const html = settings({ kind: "metric-table" }, [7]);
    const add = html.slice(html.indexOf('aria-label="Add a Metric"'));
    expect(selected(add)).toEqual([""]);
    expect(add).toContain("Quota");
    expect(add).not.toContain("Commit");
  });

  it("says Pick a Metric for an unfilled Slot, and No access only for a Metric the viewer may not see", () => {
    const data = { metrics: [], series: {}, breakdowns: {}, targets: {}, numberStyle: "1,234.5", yearStart: 1 } as unknown as CanvasData;
    for (const element of [{ kind: "figure" }, columns(), { kind: "gap-table" }, { kind: "metric-table" }, { kind: "definitions" }] as SlideElement[]) {
      const empty = renderToString(<SlideElementView element={element} context={{ data, metrics: [] }} w={600} h={300} />);
      expect(empty).toContain(PICK_METRIC);
      expect(empty).not.toContain(NO_ACCESS);
    }
    expect(renderToString(<SlideElementView element={{ kind: "figure" }} context={{ data, metrics: [null] }} w={600} h={300} />)).toContain(NO_ACCESS);
  });
});
