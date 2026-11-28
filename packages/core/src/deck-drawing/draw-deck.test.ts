import { describe, expect, it } from "vitest";

import { STARTER_THEME } from "../themes";
import type { CanvasData } from "../types";
import { drawDeck, type DeckDrawingInput } from "./draw-deck";
import { boundsOf, createPen, flatten, keep, type Obj, type TextObj } from "./objects";
import type { SlideSource, SlideType } from "./slide-type";
import { SLIDE_TYPES } from "./slides";

/** A slide type that says its own id and draws one line. */
const saying = (id: string, section: string, more: Partial<SlideType> = {}): SlideType => ({
  id,
  section,
  fill: () => ({ headline: `The ${id} slide says what it found`, source: "Ziffr; Revenue", content: id }),
  draw: (content, { x, y, pen }) => [pen.text({ x, y, w: 300, h: 20 }, [content as string])],
  ...more,
});

const types: Record<string, SlideType> = {
  ...SLIDE_TYPES,
  ...Object.fromEntries(
    [
      saying("summary", "Summary"),
      saying("chart", "Performance"),
      saying("table", "Performance"),
      saying("bridge", "Drivers", { wide: true }),
      saying("questions", "Questions"),
      saying("definitions", "Definitions", { agenda: false }),
      saying("roadmap", "Plan"),
      saying("empty", "Drivers", { fill: () => ({ headline: "This cannot be shown", source: "Ziffr", cannot: "The values are gone." }) }),
    ].map((t) => [t.id, t]),
  ),
};

const slide = (type: string, more: Partial<SlideSource> = {}): SlideSource => ({ id: `sl_${type}`, type, metrics: [], options: {}, headline: null, ...more });

const input = (more: Partial<DeckDrawingInput> = {}): DeckDrawingInput => ({
  name: "Quarterly review",
  design: "band",
  emphasis: "strong",
  slides: [slide("cover"), slide("summary"), slide("chart"), slide("table"), slide("bridge"), slide("definitions")],
  data: { metrics: [], series: {} } as unknown as CanvasData,
  theme: STARTER_THEME,
  period: "Third quarter 2026",
  date: "9 October 2026",
  ...more,
});

const words = (objects: Obj[]) => flatten(objects).flatMap((o) => (o.type === "text" ? [o.body.paras.map((p) => p.runs.map((r) => r.t).join("")).join("\n")] : []));
const role = (objects: Obj[], name: string) => flatten(objects).find((o): o is TextObj => o.type === "text" && o.role === name);
const said = (o: TextObj | undefined) => o && words([o])[0]!.replaceAll("\n", " ").replaceAll(" ", " ");

describe("drawing a deck", () => {
  it("draws every slide in order, and leaves out the hidden ones", () => {
    const drawn = drawDeck(input({ slides: [slide("cover"), slide("summary", { hidden: true }), slide("chart")] }), types);
    expect(drawn.slides.map((s) => s.type)).toEqual(["cover", "chart"]);
  });

  it("numbers the content slides, not the cover, counted from what is drawn", () => {
    const drawn = drawDeck(input({ slides: [slide("cover"), slide("summary", { hidden: true }), slide("chart"), slide("table")] }), types);
    expect(drawn.slides.map((s) => said(role(s.objects, "page")))).toEqual([undefined, "1", "2"]);
  });

  it("shows no page number where the Theme shows none", () => {
    const drawn = drawDeck(input({ theme: { ...STARTER_THEME, slides: { ...STARTER_THEME.slides, show_slide_number: false } } }), types);
    expect(drawn.slides.some((s) => role(s.objects, "page"))).toBe(false);
  });

  it("makes the cover's agenda from the first headline of each section, four at most, without the definitions", () => {
    const slides = [slide("cover"), slide("definitions"), slide("summary"), slide("chart"), slide("table"), slide("bridge"), slide("questions"), slide("roadmap")];
    const cover = words(drawDeck(input({ slides }), types).slides[0]!.objects).join(" | ").replaceAll("\n", " ");
    for (const type of ["summary", "chart", "bridge", "questions"]) expect(cover).toContain(`The ${type} slide`);
    for (const type of ["table", "definitions", "roadmap"]) expect(cover).not.toContain(`The ${type} slide`);
  });

  it("puts the person's own headline in place of Ziffr's, on the slide and the agenda", () => {
    const drawn = drawDeck(input({ slides: [slide("cover"), slide("chart", { headline: "We are late on the commit and say so" })] }), types);
    expect(said(role(drawn.slides[1]!.objects, "title"))).toBe("We are late on the commit and say so");
    expect(words(drawn.slides[0]!.objects).join(" ").replaceAll("\n", " ")).toContain("We are late on the commit");
    expect(drawn.slides[1]!.headline).toBe("We are late on the commit and say so");
  });

  it("names the deck on the cover, or the cover's own headline", () => {
    expect(drawDeck(input(), types).slides[0]!.headline).toBe("Quarterly review");
    expect(drawDeck(input({ slides: [slide("cover", { headline: "The year ahead" })] }), types).slides[0]!.headline).toBe("The year ahead");
  });

  it("shows the sections in the tracker, the current one set apart", () => {
    const tracker = role(drawDeck(input(), types).slides[2]!.objects, "tracker")!;
    const runs = tracker.body.paras[0]!.runs.filter((r) => r.t.trim());
    expect(runs.map((r) => r.t)).toEqual(["Summary", "Performance", "Drivers", "Definitions"]);
    expect(runs.filter((r) => r.bold).map((r) => r.t)).toEqual(["Performance"]);
  });

  it("keeps a slide whose data cannot carry it, with the sentence that says why", () => {
    const drawn = drawDeck(input({ slides: [slide("empty")] }), types);
    expect(words(drawn.slides[0]!.objects)).toContain("The values are gone.");
  });

  it("keeps a slide of a kind it does not know, and says so", () => {
    for (const type of ["assessment", "constructor"]) {
      const drawn = drawDeck(input({ slides: [slide(type)] }), types);
      expect(words(drawn.slides[0]!.objects)).toContain("Ziffr cannot draw this kind of slide.");
    }
  });

  it("gives content the whole width in the band design unless a so-what stands beside it", () => {
    const withAside = saying("summary", "Summary", { fill: () => ({ headline: "With a figure", source: "Ziffr", content: "x", aside: { figure: { value: "12", words: "Twelve" } } }) });
    const drawn = drawDeck(input({ slides: [slide("summary"), slide("chart")] }), { ...types, summary: withAside });
    expect(drawn.slides.map((s) => s.form)).toEqual(["full", "wide"]);
    expect(drawDeck(input({ design: "column", slides: [slide("chart"), slide("bridge")] }), types).slides.map((s) => s.form)).toEqual(["full", "wide"]);
  });

  it("draws a logo only from a picture carried as data, never an address to fetch", () => {
    const logo = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>').toString("base64");
    const pictures = (src: string) => flatten(drawDeck(input({ theme: { ...STARTER_THEME, slides: { ...STARTER_THEME.slides, logo: src } } }), types).slides[1]!.layout.objects).filter((o) => o.type === "picture");
    expect(pictures(logo)).toHaveLength(1);
    expect(pictures("https://example.com/logo.png")).toEqual([]);
  });

  it("takes the deck's footer words before the Theme's", () => {
    const theme = { ...STARTER_THEME, slides: { ...STARTER_THEME.slides, footer: "Theme words" } };
    expect(said(role(drawDeck(input({ theme }), types).slides[1]!.objects, "footer"))).toBe("Theme words");
    expect(said(role(drawDeck(input({ theme, footer: "Deck words" }), types).slides[1]!.objects, "footer"))).toBe("Deck words");
  });

  it("draws the same deck the same way every time, with names unique on a slide", () => {
    const first = drawDeck(input({ design: "column" }), types);
    expect(drawDeck(input({ design: "column" }), types)).toEqual(first);
    for (const s of first.slides) {
      const ids = flatten([...s.layout.objects, ...s.objects]).map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("is drawn in the fonts any computer has when asked", () => {
    const theme = { ...STARTER_THEME, tokens: { ...STARTER_THEME.tokens, fontHeading: "playfair" as const, fontBody: "inter" as const } };
    expect(drawDeck(input({ theme }), types).look.fonts).toEqual({ head: "playfair", body: "inter" });
    expect(drawDeck(input({ theme, fonts: "office" }), types).look.fonts).toEqual({ head: "georgia", body: "arial" });
  });
});

describe("the drawing's objects", () => {
  it("join two shapes with a connector and group them, with the rectangle each covers", () => {
    const pen = createPen();
    const a = pen.rect({ x: 0, y: 0, w: 10, h: 10 }, "accent");
    const b = pen.shape("diamond", { x: 40, y: 20, w: 10, h: 10 });
    const connector = pen.connector(a, b);
    expect(connector).toMatchObject({ from: a.id, to: b.id, x1: 10, y1: 5, x2: 40, y2: 25 });
    const table = pen.table(0, 40, [20, 30], [{ h: 12, cells: [] }, { h: 14, cells: [] }]);
    const group = pen.group("Tree", "A tree", [a, b, connector, table, pen.picture({ x: 1, y: 1, w: 2, h: 2 }, "data:image/png;base64,AA==", "Logo")]);
    expect(boundsOf(group)).toEqual({ x: 0, y: 0, w: 50, h: 66 });
    expect(boundsOf(connector)).toEqual({ x: 10, y: 5, w: 30, h: 20 });
    expect(flatten([group])).toHaveLength(5);
    expect(boundsOf(pen.group("Empty", "Nothing", []))).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it("holds a number and its unit together, and takes typed words as words", () => {
    expect(keep("12.4 M€ and 3 % in 2 hours")).toBe("12.4 M€ and 3 % in 2 hours");
    expect(createPen().text({ x: 0, y: 0, w: 1, h: 1 }, ["**<b>typed</b>**"]).body.paras[0]!.runs).toEqual([{ t: "**<b>typed</b>**" }]);
  });
});
