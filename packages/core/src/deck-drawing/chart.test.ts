import { describe, expect, it } from "vitest";

import { chartTitle, drawChart, type ChartSpec } from "./chart";
import { createMeasure } from "./measure";
import { createPen, flatten, type Box, type ShapeObj, type TextObj } from "./objects";

const measure = createMeasure({ head: "arial", body: "arial" });
const box: Box = { x: 100, y: 100, w: 600, h: 300 };

function draw(spec: ChartSpec) {
  const { object, scale } = drawChart(createPen(), measure, box, spec);
  const all = flatten([object]);
  const texts = all.filter((o): o is TextObj => o.type === "text");
  const rects = all.filter((o): o is ShapeObj => o.type === "shape" && o.shape === "rect");
  const said = (words: string) => texts.find((t) => t.body.paras[0]!.runs[0]!.t === words);
  return { object, scale, all, texts, rects, said };
}

const meet = (a: Box, b: Box) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

const columns: ChartSpec = {
  kind: "columns",
  categories: ["Q1", "Q2", "Q3"],
  alt: "Revenue against target",
  series: [
    { name: "Revenue", values: [10, -4, 12], color: "accent", words: ["10", "−4", "12"] },
    { name: "Target", values: [10.4, 0, 11], color: "ink", as: "marks", endLabel: "Target" },
  ],
};

describe("a column chart", () => {
  it("starts at zero, hangs negative columns under it and names the target in place of a legend", () => {
    const { rects, scale, said } = draw(columns);
    const of = (category: string) => rects.find((r) => r.alt?.startsWith(`${category}, Revenue`))!;
    const [first, negative] = [of("Q1"), of("Q2")];
    expect(first!.y + first!.h).toBeCloseTo(scale.y(0));
    expect(negative!.y).toBeCloseTo(scale.y(0));
    expect(said("−4")!.y).toBeGreaterThan(negative!.y + negative!.h);
    expect(said("Target")).toBeDefined();
  });

  it("keeps every label inside the chart, off the columns, the marks and the other labels", () => {
    const { texts, rects } = draw(columns);
    for (const label of texts) {
      expect(label.x).toBeGreaterThanOrEqual(box.x - 1);
      expect(label.x + label.w).toBeLessThanOrEqual(box.x + box.w + 1);
      for (const rect of rects) expect(meet(label, rect), label.body.paras[0]!.runs[0]!.t).toBe(false);
      for (const other of texts) if (other !== label) expect(meet(label, other)).toBe(false);
    }
  });

  it("is one group with alternative text, each column saying its value", () => {
    const { object, rects } = draw(columns);
    expect(object).toMatchObject({ type: "group", alt: "Revenue against target" });
    expect(rects.map((r) => r.alt)).toContain("Q1, Revenue: 10");
  });

  it("names every n-th category where the names would collide, the latest among them", () => {
    const names = Array.from({ length: 36 }, (_, i) => `Week ${i + 1}`);
    const { texts } = draw({ kind: "columns", categories: names, alt: "Weeks", series: [{ name: "Value", values: names.map(() => 1), color: "accent" }] });
    expect(texts.length).toBeLessThan(36);
    expect(texts.some((t) => t.body.paras[0]!.runs[0]!.t.replace("\n", " ") === "Week 36")).toBe(true);
  });

  it("names each series of a stack at its own part of the latest column", () => {
    const { rects, said } = draw({
      kind: "columns",
      stacked: true,
      categories: ["Q1", "Q2"],
      alt: "Segments",
      series: [
        { name: "Large", values: [5, 6], color: "accent", words: ["5", "6"], wordColor: "onaccent", endLabel: "Large" },
        { name: "Small", values: [2, 3], color: "neutral", words: ["2", "3"], endLabel: "Small" },
      ],
    });
    // The latest column is drawn first: large below, small on it.
    for (const [name, segment] of [["Large", rects[0]!], ["Small", rects[2]!]] as const) {
      const label = said(name)!;
      expect(label.y + label.h / 2).toBeCloseTo(segment.y + segment.h / 2, 0);
    }
    // A pale fill's colour is not used for words.
    expect(said("Small")!.body.color).toBe("ink");
  });
});

describe("a crowded chart", () => {
  it("names the first, the latest, the highest and the lowest, and keeps every value for those who cannot see it", () => {
    const names = Array.from({ length: 30 }, (_, i) => `${i + 1}`);
    const values = names.map((_, i) => (i === 7 ? 900.5 : i === 19 ? -100.5 : 500.5 + i));
    const { texts, rects } = draw({ kind: "columns", categories: names, alt: "Daily", series: [{ name: "Value", values, color: "accent", words: values.map(String) }] });
    const said = texts.map((t) => t.body.paras[0]!.runs[0]!.t).filter((t) => t.endsWith(".5"));
    expect(said.sort()).toEqual(["-100.5", "500.5", "529.5", "900.5"]);
    expect(rects.map((r) => r.alt)).toContain("2, Value: 501.5");
  });

  it("gives the highest and the lowest their place before their neighbours", () => {
    const values = [-1, -8, -9.4, -9.2, -7, -2];
    const { said } = draw({ kind: "columns", categories: values.map((_, i) => `${i}`), alt: "Net", series: [{ name: "Net", values, color: "bad", words: values.map((v) => `${v} customers net`) }] });
    expect(said("-9.4 customers net")).toBeDefined();
  });

  it("gives a long series name a second line", () => {
    const { texts } = draw({ kind: "line", categories: ["Q1", "Q2"], alt: "Names", series: [{ name: "A", values: [1, 2], color: "accent", endLabel: "Net revenue retention of large accounts" }] });
    expect(texts.some((t) => t.body.paras[0]!.runs[0]!.t.includes("\n"))).toBe(true);
  });
});

describe("a line chart", () => {
  const line: ChartSpec = {
    kind: "line",
    categories: ["Q1", "Q2", "Q3", "Q4"],
    alt: "Margin",
    series: [
      { name: "Margin", values: [62.8, 62.4, null, 61.2], color: "accent", words: ["62.8", "62.4", null, "61.2"] },
      { name: "Target", values: [63, 63, 63, 63], color: "muted", dash: true, endLabel: "Target 63.0" },
    ],
  };

  it("draws a gap where there is no value and a level target as one dashed line", () => {
    const { all, said } = draw(line);
    const lines = all.filter((o) => o.type === "line");
    expect(lines.filter((l) => l.dash)).toHaveLength(1);
    expect(lines.filter((l) => !l.dash)).toHaveLength(1);
    expect(said("61.2")).toBeDefined();
    expect(said("Target 63.0")).toBeDefined();
  });

  it("holds its categories and says nothing where there is no value at all", () => {
    const { texts, all } = draw({ ...line, series: [{ name: "Margin", values: [null, null, null, null], color: "accent" }] });
    expect(texts.map((t) => t.body.paras[0]!.runs[0]!.t)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(all.filter((o) => o.type !== "text")).toEqual([]);
  });
});

describe("a chart's title", () => {
  it("says the unit, and the check can read it", () => {
    const [mark, title] = chartTitle(createPen(), measure, { x: 0, y: 0, w: 400 }, "Revenue by quarter", "M€");
    expect(mark).toMatchObject({ type: "shape", fill: "accent" });
    expect(title).toMatchObject({ role: "chart-title", unit: "M€" });
    expect((title as TextObj).body.paras[0]!.runs[0]!.t).toBe("Revenue by quarter, M€");
  });
});
