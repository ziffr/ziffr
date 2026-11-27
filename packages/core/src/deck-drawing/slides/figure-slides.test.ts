import { describe, expect, it } from "vitest";

import { STARTER_THEME } from "../../themes";
import type { CanvasData, Metric } from "../../types";
import { drawDeck, type DeckDrawingInput } from "../draw-deck";
import { flatten, type Obj } from "../objects";
import type { SlideType } from "../slide-type";
import { about } from "./about";
import { chartSlide } from "./chart-slide";
import { definitions } from "./definitions";
import { SLIDE_TYPES } from "./index";
import { NOT_THERE } from "./listed";
import { questions } from "./questions";
import { summary } from "./summary";
import { table } from "./table";
import { data, DECK, filled, metric, refused, slide, text } from "./test-slides";

const LONG = "Customer acquisition cost of the enterprise segment in German-speaking countries";
const revenue = metric(1, "Revenue", { unit: "€", target_min: 20 });
const plan = metric(2, "Plan", { unit: "€" });
const heads = metric(3, "Headcount");
const both = data([revenue, plan, heads], { 1: [10, 15], 2: [12, 18] });

const deckOf = (slides: DeckDrawingInput["slides"], from: CanvasData, more: Partial<DeckDrawingInput> = {}) =>
  drawDeck(
    {
      name: "Review",
      design: "band",
      emphasis: "strong",
      slides,
      data: from,
      theme: { ...STARTER_THEME, slides: { ...STARTER_THEME.slides, show_slide_number: true } },
      period: DECK.period,
      date: DECK.date,
      today: DECK.today,
      ...more,
    },
    SLIDE_TYPES,
  );
const cells = (objects: Obj[]) => flatten(objects).flatMap((o) => (o.type === "table" ? o.rows.flatMap((r) => r.cells.flatMap((c) => c.body.paras.flatMap((p) => p.runs))) : []));
/** Every word of each slide, those in tables too. */
const words = (drawn: ReturnType<typeof deckOf>) => drawn.slides.map((s) => [text(s.objects), ...cells(s.objects).map((run) => run.t.replaceAll("\n", " "))].join(" "));
const links = (drawn: ReturnType<typeof deckOf>) => drawn.slides.flatMap((s) => cells(s.objects).flatMap((run) => run.href ?? []));

describe.each([summary, chartSlide, table, definitions] as SlideType[])("a $id slide", (type) => {
  it("says nothing of any Metric where one it lists is not there, or it lists none", () => {
    expect(type.fill(slide(type.id, [1, 9]), both, DECK)).toBe(NOT_THERE);
    expect(type.fill(slide(type.id, []), both, DECK)).toBe(NOT_THERE);
  });
});

describe("the summary", () => {
  it("gives each figure its change and target, and charts the first", () => {
    const out = filled(summary, slide("summary", [1, 3]), both);
    expect(out.content.figures.map((f) => [f.name, f.onTarget])).toEqual([
      ["Revenue", false],
      ["Headcount", null],
    ]);
    expect(out.content.figures[1]!.period).toBe("");
    expect(out.content.chart.spec).not.toBeNull();
    expect(out.source).toBe("Ziffr; Revenue, Headcount");
  });
  it("says that there is no value", () => {
    expect(refused(summary, slide("summary", [3]), both)).toBe("No value to show yet.");
  });
  it("says that it shows four", () => {
    const many = [1, 2, 3, 4, 5].map((i) => metric(i, `${LONG} ${i}`));
    const out = filled(summary, slide("summary", [1, 2, 3, 4, 5]), data(many, { 1: [-1, -2] }));
    expect(out.content.figures).toHaveLength(4);
    expect(out.note).toContain("4 figures");
  });
});

describe("the chart slide", () => {
  it("draws two charts side by side", () => {
    expect(filled(chartSlide, slide("chart", [1, 2]), both).content.charts).toHaveLength(2);
  });
  it("draws one with a part", () => {
    expect(filled(chartSlide, slide("chart", [1, 2], { part: true }), both).content.charts).toHaveLength(1);
  });
  it("refuses what one chart cannot hold", () => {
    expect(refused(chartSlide, slide("chart", [1, 3], { part: true }), both)).toContain("another unit");
    expect(refused(chartSlide, slide("chart", [1, 2], { part: true, form: "line" }), both)).toContain("columns");
    expect(refused(chartSlide, slide("chart", [1], { reference: true }), both)).toContain("one or two Metrics");
    expect(refused(chartSlide, slide("chart", [3]), both)).toContain("No value of Headcount");
  });
});

describe("the table", () => {
  const many = Array.from({ length: 12 }, (_, i) => metric(i + 1, `${LONG} ${i + 1}`));
  const ids = many.map((m) => m.id);
  it("goes on to a second slide and drops no row", () => {
    const drawn = words(deckOf([slide("table", ids)], data(many, { 1: [4, -2] })));
    expect(drawn.length).toBeGreaterThan(1);
    expect(drawn.join(" ")).toContain("of 12");
  });
  it("says that there is no value", () => {
    expect(refused(table, slide("table", [3]), both)).toBe("No value to show yet.");
  });
});

describe("the questions slide", () => {
  const asked = (answers: { question: string; text: string; writtenOn: string | null }[], metrics = [1]) => ({ ...slide("questions", metrics), answers });
  it("dates an answer once a newer period has begun", () => {
    const out = filled(
      questions,
      asked([
        { question: "Why?", text: "Prices.", writtenOn: "2026-07-14" },
        { question: "Next?", text: "More.", writtenOn: "2026-10-02" },
        { question: "And?", text: "", writtenOn: null },
      ]),
      both,
    );
    expect(out.content.asked.map((a) => a.written !== null)).toEqual([true, false, false]);
    expect(out.content.asked[2]!.answer).toBe("No answer is written yet.");
  });
  it("needs no Metric, and says that no question is typed", () => {
    expect(filled(questions, asked([{ question: "Why?", text: "So.", writtenOn: null }], []), both).source).toBe("Ziffr");
    expect(refused(questions, asked([]), both)).toContain("No question");
  });
  it("shows nothing where a Metric it lists is not there", () => {
    expect(questions.fill(asked([{ question: "Why Revenue?", text: "Secret.", writtenOn: null }], [9]), both, DECK)).toBe(NOT_THERE);
  });
  it("goes on to a second slide where the answers do not fit", () => {
    const long = { question: `${LONG}?`, text: "A line of the answer.\n".repeat(11), writtenOn: null };
    expect(deckOf([asked([long, long, long])], both).slides.length).toBeGreaterThan(1);
  });
});

describe("the definitions", () => {
  it("says how each is calculated without writing out a formula", () => {
    const list: Metric[] = [
      metric(1, "Noted", { calculation_note: "Signed orders." }),
      metric(2, "Worked out", { formula: "{m9} + 1", description: "A sum." }),
      metric(3, "Added up", { total: { targets: "own", open: true }, formula: "{m9}" }),
      metric(4, "Bare", { description: "" }),
    ];
    const out = filled(definitions, slide("definitions", [1, 2, 3, 4]), data(list));
    expect(out.content.rows.map((r) => r.calculated)).toEqual(["Signed orders.", "Calculated from a formula.", "Total of other Metrics.", "No calculation described."]);
    expect(out.content.rows[3]!.description).toBe("No description.");
    expect(JSON.stringify(out)).not.toContain("m9");
  });
  it("cuts words that no slide holds, says where the rest is, and drops no row", () => {
    const list = Array.from({ length: 12 }, (_, i) => metric(i + 1, `M ${i + 1}`, { description: "Counts every signed order of the month. ".repeat(60) }));
    const drawn = deckOf([slide("definitions", list.map((m) => m.id))], data(list));
    expect(drawn.slides.length).toBeGreaterThan(1);
    expect(words(drawn).join(" ")).toContain("The rest is in Ziffr.");
    expect(words(drawn).join(" ")).toContain("of 12");
  });
});

describe("about these slides", () => {
  const fed = metric(1, "Revenue", { sources: ["api"], owner_id: "person-1" });
  const typed = metric(2, "Plan", { sources: ["web_form"] });
  const unlisted = metric(3, "Secret plan", { sources: ["web_form"] });
  const from = data([fed, typed, unlisted], { 1: [1, 2] });
  const slides = [slide("table", [1, 2]), slide("about", [])];
  const address = "https://ziffr.example.com/";

  it("names the Metrics of the other slides, their kind of source and latest period, and links to each", () => {
    const drawn = deckOf(slides, from, { address });
    const said = words(drawn)[1]!;
    expect(said).not.toContain("Secret plan");
    expect(said).not.toContain("person-1");
    expect(about.fill(slides[1]!, from, { ...DECK, listed: [1, 2] })).toMatchObject({
      content: { rows: [{ name: "Revenue", kind: "From a connected system" }, { name: "Plan", kind: "Typed in", latest: "No value yet" }] },
    });
    expect(links(drawn)).toEqual(["https://ziffr.example.com/metrics/m1", "https://ziffr.example.com/metrics/m2"]);
  });
  it("has no link through a View Link, or for an address that is not a web address", () => {
    expect(links(deckOf(slides, from))).toEqual([]);
    expect(links(deckOf(slides, from, { address: "javascript:alert(1)" }))).toEqual([]);
    expect(links(deckOf(slides, from, { address: "https://who:secret@ziffr.example.com" }))).toEqual([]);
  });
});
