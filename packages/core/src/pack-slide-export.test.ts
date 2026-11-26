// How a deck's Slide Elements are written into a file (spec 0057).
import { describe, expect, it } from "vitest";
import { slideShapeOf } from "./pack-export";
import type { SlideElement } from "./slide-element";
import type { SlideShape } from "./types";

const shape = (element: SlideElement, metricSlots: number[]): SlideShape => ({
  type: "ziffr-widget", x: 64, y: 150, rotation: 0, opacity: 1, props: { w: 600, h: 300, template: "slide" }, widget: { metricSlots, title: null, settings: { element } },
});

describe("an element in a file", () => {
  it("stays behind while a Slot it needs has no Metric, as a file that holds it would be refused", () => {
    expect(slideShapeOf(shape({ kind: "figure" }, []), new Map())).toEqual([]);
    expect(slideShapeOf(shape({ kind: "gap-table" }, [0]), new Map())).toEqual([]);
    expect(slideShapeOf(shape({ kind: "gap-table" }, [0, 1]), new Map())).toHaveLength(1);
    expect(slideShapeOf(shape({ kind: "words", text: ["Headline"] }, []), new Map())).toHaveLength(1);
  });
});
