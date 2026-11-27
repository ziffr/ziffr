// The browser check of the deck slides (spec 0069; GLOSSARY: Slide, Slide Type, Deck Design, Theme): every slide type in
// both designs, both emphases, every check Theme and both font sets, drawn by the screen renderer in a headless
// Chromium and measured there (quality-check.ts). ZIFFR_SLIDE_PICTURES=<folder> also saves pictures of the slides.
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type Page } from "@playwright/test";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DECK_DESIGNS, type DeckDesignId } from "@ziffr/core/deck-drawing/designs";
import { drawDeck, type DeckDrawing, type DeckDrawingInput, type SlideDrawing } from "@ziffr/core/deck-drawing/draw-deck";
import { DECK_FONT_FAMILIES, type DeckFont } from "@ziffr/core/deck-drawing/fonts";
import { createMeasure } from "@ziffr/core/deck-drawing/measure";
import { createPen, TYPE_SCALE } from "@ziffr/core/deck-drawing/objects";
import { SLIDE_TYPES } from "@ziffr/core/deck-drawing/slides/index";

import { deckFontFiles } from "../../../../../../scripts/deck-fonts.mjs";
import { misplaced, readParts, type ScreenPlaces } from "../../file/check/against-screen";
import { everySlide } from "../../file/check/deck";
import { FILE_FONTS, writeDeckFile, type DeckFileKind } from "../../file/write-pptx";
import { slideFontStack } from "../fonts";
import { SlideView } from "../slide-view";
import type { CheckPlan } from "./quality-check";
import { CONTENT_TYPES, DECK, hardDeck, SAMPLES, slideOf, THEMES } from "./samples";

const ROOT = fileURLToPath(new URL("../../../../../../", import.meta.url));
const PICTURES = process.env.ZIFFR_SLIDE_PICTURES;
const DECK_FILES = process.env.ZIFFR_DECK_FILES;
// One transparent pixel stands for the pictures a browser would draw: only their place is checked.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const TYPES = { ...SLIDE_TYPES, ...CONTENT_TYPES };
const DESIGNS = Object.keys(DECK_DESIGNS) as DeckDesignId[];

let browser: Browser;
let page: Page;

/** The family the renderer asks for first. */
const familyOf = (font: DeckFont) => slideFontStack(font).split(",")[0]!.replaceAll('"', "");

beforeAll(async () => {
  const files = await deckFontFiles();
  const faces = files.map((f) => `@font-face{font-family:"${familyOf(f.id as DeckFont)}";font-weight:${f.weight};src:url(data:font/ttf;base64,${readFileSync(f.path).toString("base64")}) format("truetype")}`);
  const check = await build({ entryPoints: [fileURLToPath(new URL("./quality-check.ts", import.meta.url))], bundle: true, write: false, format: "iife", globalName: "slideCheck" });
  // Without hinting, a Linux browser sets words at the widths their fonts give, as the others do.
  browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${faces.join("")}body{margin:0}</style><div id="root" style="width:1280px"></div>`);
  await page.addScriptTag({ content: check.outputFiles[0]!.text });
  // Every face loaded before anything is measured: a slide measured in a stand-in font would prove nothing.
  const loaded = await page.evaluate(() => Promise.all([...document.fonts].map((f) => f.load())).then((all) => all.length));
  expect(loaded).toBe(files.length);
});

afterAll(() => browser?.close());

/** Puts one drawn slide on the page, as the renderer writes it. */
async function show(slide: SlideDrawing, drawing: DeckDrawing) {
  await page.evaluate((html) => {
    document.getElementById("root")!.innerHTML = html;
    return document.fonts.ready.then(() => undefined);
  }, renderToStaticMarkup(createElement(SlideView, { slide, look: drawing.look })));
}

const planOf = (slide: SlideDrawing, drawing: DeckDrawing, input: DeckDrawingInput): CheckPlan => {
  const design = DECK_DESIGNS[drawing.look.design];
  const form = slide.form === "cover" ? null : design[slide.form];
  return {
    cover: !form,
    panel: form ? form.panel : design.cover.panel,
    places: form ? { title: form.title, tracker: form.tracker, page: input.theme.slides.show_slide_number } : undefined,
    regions: slide.regions,
    layout: slide.layout.objects.map((o) => o.id),
    scale: TYPE_SCALE,
  };
};

/** Shows a slide and gives what the check finds on it. */
async function faults(slide: SlideDrawing, drawing: DeckDrawing, input: DeckDrawingInput): Promise<string[]> {
  await show(slide, drawing);
  return page.evaluate((plan) => (window as unknown as { slideCheck: typeof import("./quality-check") }).slideCheck.checkSlide(document.querySelector<HTMLElement>("[data-canvas]")!, plan), planOf(slide, drawing, input));
}

/** The check on every slide of one deck, as "where: fault". */
async function deckFaults(where: string, input: DeckDrawingInput): Promise<string[]> {
  const drawing = drawDeck(input, TYPES);
  const found: string[] = [];
  for (const slide of drawing.slides) found.push(...(await faults(slide, drawing, input)).map((f) => `${where} ${slide.type}: ${f}`));
  return found;
}

const realistic = (design: DeckDesignId, theme: string, more: Partial<DeckDrawingInput> = {}): DeckDrawingInput => ({
  ...DECK,
  design,
  emphasis: "strong",
  theme: THEMES[theme]!,
  slides: [slideOf("cover"), ...Object.keys(CONTENT_TYPES).map((type) => slideOf(type))],
  ...more,
});

/** Where the slide on the page has each object, in the slide's own pixels. */
const places = (): Promise<ScreenPlaces> =>
  page.evaluate(() => {
    const canvas = document.querySelector("[data-canvas]")!.getBoundingClientRect();
    return Object.fromEntries(
      [...document.querySelectorAll("[data-canvas] [data-id]")].map((el) => {
        const { x, y, width, height } = el.getBoundingClientRect();
        return [el.getAttribute("data-id")!, { x: x - canvas.x, y: y - canvas.y, w: width, h: height }];
      }),
    );
  });

/** Writes a deck file into the folder the validator reads, where one is named. */
function keepFile(name: string, file: Uint8Array) {
  if (!DECK_FILES) return;
  mkdirSync(DECK_FILES, { recursive: true });
  writeFileSync(path.join(DECK_FILES, `${name}.pptx`), file);
}

/** Every name written in the shipped Packs, the longest first. */
function packNames(): string[] {
  const names: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (key === "name" && typeof value === "string") names.push(value);
        else walk(value);
      }
    }
  };
  const folder = path.join(ROOT, "packs");
  for (const file of readdirSync(folder).filter((f) => f.endsWith(".pack.json"))) walk(JSON.parse(readFileSync(path.join(folder, file), "utf8")));
  return [...new Set(names)].sort((a, b) => b.length - a.length);
}

describe("the deck slides in a browser", () => {
  it("have a sample of every slide type", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(Object.keys(SLIDE_TYPES).sort());
  });

  // Each sample as a deck of its own, with the data it reads.
  const sampleDecks = () => Object.entries(SAMPLES).flatMap(([type, list]) => list.map((s) => ({ slides: [...(s.before ?? []), slideOf(type, s.slide)], data: { ...DECK.data, ...s.data } })));

  it.each(DESIGNS)("pass the check in every Theme and font set, %s design", async (design) => {
    // The whole deck, then the samples.
    const samples = sampleDecks();
    const found: string[] = [];
    for (const theme of Object.keys(THEMES)) {
      for (const emphasis of ["strong", "quiet"] as const) {
        for (const fonts of ["theme", "office"] as const) {
          for (const [i, deck] of [{}, ...samples].entries()) {
            found.push(...(await deckFaults(`${design}/${theme}/${emphasis}/${fonts}/${i}`, realistic(design, theme, { emphasis, fonts, ...deck }))));
          }
        }
      }
    }
    expect(found.slice(0, 60)).toEqual([]);
  });

  // Each sample again, its Metrics named with the longest names of the shipped Packs. Not yet the gap table, whose
  // column headings take a second line under such names (#1366).
  it.each(DESIGNS)("pass the check with every sample under the longest names of the shipped Packs, %s design", async (design) => {
    const names = packNames();
    const found: string[] = [];
    for (const [i, deck] of sampleDecks().entries()) {
      if (deck.slides.some((s) => s.type === "gap-table")) continue;
      const metrics = (deck.data.metrics ?? []).map((m, j) => ({ ...m, name: names[j % names.length]! }));
      found.push(...(await deckFaults(`${design}/${i}`, realistic(design, "ziffr-light", { ...deck, data: { ...deck.data, metrics } }))));
    }
    expect(found.slice(0, 60)).toEqual([]);
  });

  it.each(DESIGNS)("pass the check with the longest names, an unbreakable word and no values, %s design", async (design) => {
    const hard = hardDeck(packNames());
    const found: string[] = [];
    for (const theme of Object.keys(THEMES)) {
      for (const fonts of ["theme", "office"] as const) {
        const input = realistic(design, theme, { ...hard, theme: { ...THEMES[theme]!, slides: { ...THEMES[theme]!.slides, footer: hard.footer } }, footer: hard.footer, fonts });
        found.push(...(await deckFaults(`${design}/${theme}/${fonts}`, input)));
      }
    }
    // A name made to be hard may break a line badly; nothing may be clipped, overlap or leave its place.
    expect(found.filter((f) => !f.includes("headline balance")).slice(0, 60)).toEqual([]);
  });

  it("catches planted faults", async () => {
    const input = realistic("band", "ziffr-light");
    const drawing = drawDeck(input, TYPES);
    const slide = drawing.slides[2]!;
    expect(await faults(slide, drawing, input)).toEqual([]);
    const pen = createPen();
    const planted = async (...objects: SlideDrawing["objects"]) => (await faults({ ...slide, objects: [...slide.objects, ...objects.map((o, i) => ({ ...o, id: `planted ${i}` }))] }, drawing, input)).join("\n");
    const body = slide.regions[0]!;
    const at = { x: body.x + 40, y: body.y + 100, w: 300, h: 20 };

    expect(await planted(pen.text(at, ["Planted words"]), pen.text({ ...at, x: at.x + 20 }, ["Other words on them"]))).toContain("words overlap");
    expect(await planted(pen.text({ x: 20, y: 400, w: 200, h: 20 }, ["Beside the page"]))).toContain("outside its region");
    expect(await planted(pen.text({ ...at, h: 20 }, ["Words that need far more room than the one line this box was given for them to stand in"]))).toContain("clipped");
    expect(await planted(pen.text(at, ["An odd size"], { size: 15 }))).toContain("type scale");
    expect(await planted(pen.text(at, ["Too pale to read"], { color: "neutral2" }))).toContain("contrast");
    expect(await planted(pen.line([at.x, at.y + 8], [at.x + 200, at.y + 8]), pen.text(at, ["Struck through"]))).toContain("line through words");

    const long = slide.objects.map((o) => (o.type === "text" && o.role === "title" ? { ...o, body: { ...o.body, paras: [{ runs: [{ t: "One line of the headline\nand a second line of it\nand a third one" }] }] } } : o));
    expect((await faults({ ...slide, objects: long }, drawing, input)).join("\n")).toContain("title: 3 lines");
    expect((await faults({ ...slide, objects: slide.objects.filter((o) => o.role !== "source") }, drawing, input)).join("\n")).toContain("source: missing");
  });

  it("measures words as the browser sets them", async () => {
    const sentences = ["Revenue reached 12.4 M€, 3 % above its target", "AVATAR Wave: Yo-yo fjord Ljubljana 0123456789", "ÄÖÜäöüß éàçñ Ωλ Привет −1.5 ✓ × → “quoted” …"];
    for (const font of Object.keys(DECK_FONT_FAMILIES) as DeckFont[]) {
      const measure = createMeasure({ head: font, body: font });
      for (const bold of [false, true]) {
        const inBrowser = await page.evaluate(
          ([family, weight, list]) => {
            const context = document.createElement("canvas").getContext("2d")!;
            context.font = `${weight} 100px "${family}"`;
            context.fontKerning = "none";
            context.textRendering = "geometricPrecision";
            return list.map((sentence) => [...sentence].reduce((sum, c) => sum + context.measureText(c).width, 0));
          },
          [familyOf(font), bold ? 700 : 400, sentences] as const,
        );
        sentences.forEach((sentence, i) => {
          const fromTable = measure.width(sentence, { size: 100, bold });
          // A character the font lacks is measured generously (an em), never too narrow.
          const lacking = [...sentence].some((c) => measure.width(c, { size: 100, bold }) === 100);
          if (lacking) expect(fromTable, `${font} ${bold}: ${sentence}`).toBeGreaterThanOrEqual(inBrowser[i]! * 0.98);
          else expect(Math.abs(fromTable - inBrowser[i]!) / fromTable, `${font} ${bold}: ${sentence}`).toBeLessThan(0.002);
        });
      }
    }
  });

  it("scales to the width it is given and breaks the same lines", async () => {
    const input = realistic("column", "paris");
    const drawing = drawDeck(input, TYPES);
    const slide = drawing.slides[1]!;
    const rows = () => page.evaluate(() => [...document.querySelectorAll("[data-kind='text']")].map((el) => { const range = document.createRange(); range.selectNodeContents(el); return range.getClientRects().length; }));
    await show(slide, drawing);
    const wide = await rows();
    for (const width of [1920, 390, 320]) {
      await page.evaluate((w) => { document.getElementById("root")!.style.width = `${w}px`; }, width);
      const box = (await page.locator("[data-canvas]").boundingBox())!;
      expect(Math.round(box.width)).toBe(width);
      expect(Math.round(box.height)).toBe(Math.round((width * 9) / 16));
      expect(await rows()).toEqual(wide);
    }
    await page.evaluate(() => { document.getElementById("root")!.style.width = "1280px"; });
  });

  // Screen against file: the same drawing as a PowerPoint file has every object where the browser has it. The files are
  // kept for Microsoft's validator when ZIFFR_DECK_FILES names a folder.
  it.each(DESIGNS)("have the PowerPoint file's objects where the screen has them, %s design", async (design) => {
    for (const kind of Object.keys(FILE_FONTS) as DeckFileKind[]) {
      const input = { ...everySlide(design, FILE_FONTS[kind], "franklin"), address: "https://ziffr.example.com" };
      const drawing = drawDeck(input);
      const file = await writeDeckFile(drawing, { title: input.name, kind, address: input.address, rasterize: async () => PIXEL });
      keepFile(`${design}-${kind}`, file);
      const parts = await readParts(file);
      const found: string[] = [];
      for (const [i, slide] of drawing.slides.entries()) {
        await show(slide, drawing);
        const screen = await places();
        found.push(...misplaced(parts, i, slide, screen).map((m) => `${kind} ${i + 1} ${slide.type}: ${m}`));
        // The check sees a miss of 3 px.
        if (i === 1) {
          const moved = Object.fromEntries(Object.entries(screen).map(([id, at]) => [id, { ...at, x: at.x + 3 }]));
          expect(misplaced(parts, i, slide, moved).length).toBeGreaterThan(0);
        }
      }
      expect(found.slice(0, 40)).toEqual([]);
    }
  });

  // Words that try to be markup, with characters XML forbids: the validator opens this file too.
  it.runIf(DECK_FILES)("keeps a file of hostile words", async () => {
    const words = `\u0000\u000b￾\uD800<a:t b="1" c='2'>&amp;</a:t>`;
    const base = everySlide("band", FILE_FONTS.office);
    const input = { ...base, name: words, data: { ...base.data, metrics: base.data.metrics.map((m) => ({ ...m, name: `${words} ${m.id}`, description: words })) } };
    keepFile("hostile", await writeDeckFile(drawDeck(input), { title: words, kind: "office", rasterize: async () => PIXEL }));
  });

  it.runIf(PICTURES)("saves pictures", async () => {
    mkdirSync(PICTURES!, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    for (const design of DESIGNS) {
      for (const theme of ["ziffr-light", "paris", "tokyo", "oslo", "franklin", "print", "faint"]) {
        const input = realistic(design, theme);
        const drawing = drawDeck(input, TYPES);
        for (const [i, slide] of drawing.slides.entries()) {
          await show(slide, drawing);
          await page.locator("[data-canvas]").screenshot({ path: path.join(PICTURES!, `${design}_${theme}_${String(i + 1).padStart(2, "0")}_${slide.type}.png`) });
        }
      }
      for (const theme of ["ziffr-light", "tokyo"]) {
        for (const [n, deck] of sampleDecks().entries()) {
          const input = realistic(design, theme, deck);
          const drawing = drawDeck(input, TYPES);
          for (const [i, slide] of drawing.slides.entries()) {
            await show(slide, drawing);
            await page.locator("[data-canvas]").screenshot({ path: path.join(PICTURES!, `${design}_sample_${theme}_${String(n).padStart(2, "0")}_${i + 1}_${slide.type}.png`) });
          }
        }
      }
      const hard = hardDeck(packNames());
      const input = realistic(design, "ziffr-light", { ...hard });
      const drawing = drawDeck(input, TYPES);
      for (const [i, slide] of drawing.slides.entries()) {
        await show(slide, drawing);
        await page.locator("[data-canvas]").screenshot({ path: path.join(PICTURES!, `${design}_hard_${String(i + 1).padStart(2, "0")}_${slide.type}.png`) });
      }
    }
  });
});
