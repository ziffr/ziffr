// The PowerPoint file of a drawn deck (spec 0069; GLOSSARY: Deck, Slide, Theme): its structure, typed words that must
// stay words, links that must be Ziffr's own, and hidden slides that must leave nothing behind.
import { drawDeck, type DeckDrawing, type DeckDrawingInput } from "@ziffr/core/deck-drawing/draw-deck";
import { flatten, type Run } from "@ziffr/core/deck-drawing/objects";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { THEMES } from "../slides/check/samples";
import { everySlide } from "./check/deck";
import { FILE_FONTS, writeDeckFile, type DeckFileKind, type DeckFileOptions } from "./write-pptx";

const ADDRESS = "https://ziffr.example.com";
const KINDS = Object.keys(FILE_FONTS) as DeckFileKind[];
// The pixels do not matter here, and Node has no canvas.
const rasterize = async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const input = (kind: DeckFileKind, more: Partial<DeckDrawingInput> = {}): DeckDrawingInput => ({ ...everySlide("band", FILE_FONTS[kind]), address: ADDRESS, ...more });

/** Writes the file and reads every part of it back as text. */
async function parts(drawing: DeckDrawing, kind: DeckFileKind, more: Partial<DeckFileOptions> = {}) {
  const zip = await JSZip.loadAsync(await writeDeckFile(drawing, { title: "Review", kind, address: ADDRESS, rasterize, ...more }));
  const read: Record<string, string> = {};
  for (const [name, file] of Object.entries(zip.files)) read[name] = await file.async("string");
  return read;
}

const named = (read: Record<string, string>, pattern: RegExp) => Object.entries(read).filter(([name]) => pattern.test(name)).map(([, xml]) => xml);
const slidesOf = (read: Record<string, string>) => named(read, /^ppt\/slides\/slide\d+\.xml$/);
const everything = (read: Record<string, string>) => Object.entries(read).map(([name, xml]) => `${name}\n${xml}`).join("\n");
const outside = (read: Record<string, string>) => [...everything(read).matchAll(/Target="([^"]*)" TargetMode="External"/g)].map((m) => m[1]!);
const runsOf = (drawing: DeckDrawing): Run[] =>
  flatten(drawing.slides.flatMap((s) => s.objects)).flatMap((o) => {
    const bodies = o.type === "text" ? [o.body] : o.type === "table" ? o.rows.flatMap((r) => r.cells.map((c) => c.body)) : [];
    return bodies.flatMap((b) => b.paras.flatMap((p) => p.runs));
  });

describe("writeDeckFile", () => {
  it.each(KINDS)("writes the %s download with headlines, tables, groups, page numbers and the Theme", async (kind) => {
    const drawing = drawDeck(input(kind));
    const read = await parts(drawing, kind);
    const slides = slidesOf(read);
    expect(slides).toHaveLength(drawing.slides.length);
    for (const xml of slides) expect(xml).toContain('<p:ph type="title"/>');
    expect(slides.some((x) => x.includes("<a:tbl>"))).toBe(true);
    expect(slides.some((x) => x.includes("<p:grpSp>"))).toBe(true);
    expect(slides.filter((x) => x.includes('type="slidenum"'))).toHaveLength(slides.length - 1);
    expect(read["ppt/presentation.xml"]).toContain('firstSlideNum="0"');
    expect(read["ppt/theme/theme1.xml"]).toContain(`<a:srgbClr val="${drawing.look.slots.accent1.slice(1).toUpperCase()}"/>`);
    expect(read["ppt/slideMasters/slideMaster1.xml"]).toContain('<p:ph type="title"/>');
    expect(everything(read)).toContain("svgBlip");
    expect(Object.keys(read).filter((name) => name.endsWith("/"))).toEqual([]);
  });

  it("writes the Theme's fonts and its own line spacing for Google Slides, common fonts for PowerPoint", async () => {
    // A Theme with a font of its own, which not every computer has.
    const theme = THEMES.franklin!;
    const [office, google] = await Promise.all(KINDS.map(async (kind) => parts(drawDeck(input(kind, { theme })), kind)));
    expect(office!["ppt/theme/theme1.xml"]).toContain('typeface="Arial"');
    expect(everything(office!)).not.toContain("Libre Franklin");
    expect(google!["ppt/theme/theme1.xml"]).toContain('typeface="Libre Franklin');
    expect(slidesOf(google!).join("")).toContain("<a:spcPct");
    expect(slidesOf(office!).join("")).not.toContain("<a:spcPct");
  });

  it("refuses a PowerPoint download drawn with the Theme's own fonts", async () => {
    const drawing = drawDeck(input("google", { theme: THEMES.franklin! }));
    await expect(writeDeckFile(drawing, { title: "Review", kind: "office", rasterize })).rejects.toThrow("office");
  });

  it.each(KINDS)("keeps typed words as words in the %s download", async (kind) => {
    const markup = `<evil a="1" b='2'>&amp;</a:t></a:r></a:p> https://evil.example.org/x javascript:alert(1)`;
    const forbidden = "\u0000\u0001\u000b\u000c\u001f\uFFFE\uFFFF\uD800";
    const hostile = `${forbidden}${markup}`;
    const base = input(kind, { name: hostile, footer: hostile.slice(0, 60), period: hostile.slice(0, 40) });
    const drawing = drawDeck({
      ...base,
      data: { ...base.data, metrics: base.data.metrics.map((m) => ({ ...m, name: `${hostile} ${m.id}`, unit: "<b>", description: hostile })) },
      slides: base.slides.map((s) => ({ ...s, headline: s.type === "cover" ? null : hostile.slice(0, 140), answers: s.answers?.map((a) => ({ ...a, question: hostile, text: hostile })) })),
    });
    const read = await parts(drawing, kind, { title: hostile });
    const all = everything(read);
    expect(all).toContain("&lt;evil");
    expect(all).not.toContain("<evil");
    expect(all).not.toContain("<b>");
    for (const [name, xml] of Object.entries(read)) {
      if (/\.(xml|rels)$/.test(name)) expect({ name, bad: xml.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\uFFFD-\uFFFF]/)?.[0] }).toEqual({ name, bad: undefined });
    }
    for (const target of outside(read)) expect(target.startsWith(`${ADDRESS}/metrics/`)).toBe(true);
  });

  it("writes only links below Ziffr's own address", async () => {
    const drawing = drawDeck(input("office"));
    const linked = runsOf(drawing).filter((r) => r.href);
    const foreign = ["https://evil.example.org/x", "javascript:alert(1)", `${ADDRESS}.evil.example.org/metrics/a`, "https://me:secret@ziffr.example.com/metrics/a", "file:///etc/passwd", `${ADDRESS}/ziffr/../../x`];
    expect(linked.length).toBeGreaterThan(foreign.length);
    foreign.forEach((href, i) => (linked[i]!.href = href));
    const targets = outside(await parts(drawing, "office"));
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(target.startsWith(`${ADDRESS}/`)).toBe(true);
    expect(targets.join(" ")).not.toMatch(/evil|secret|passwd|javascript/);
    // An Installation below a path: what is beside that path is not its own.
    const below = outside(await parts(drawing, "office", { address: `${ADDRESS}/ziffr/` }));
    expect(below).toEqual([]);
  });

  it.each(KINDS)("writes no address into the %s download without one, as through a View Link", async (kind) => {
    // The drawing still carries links: the writer drops them on its own.
    const read = await parts(drawDeck(input(kind)), kind, { address: undefined });
    expect(outside(read)).toEqual([]);
    expect(everything(read)).not.toContain("hlinkClick");
    expect(everything(read)).not.toContain("ziffr.example.com");
    const viewed = await parts(drawDeck(input(kind, { address: undefined })), kind, { address: undefined });
    expect(everything(viewed)).not.toContain("ziffr.example.com");
  });

  it.each(KINDS)("holds nothing of a hidden slide in the %s download", async (kind) => {
    const base = input(kind);
    const secret = { ...base.data.metrics[0]!, id: 9001, slug: "secret-slug", name: "Secretmetric", description: "Secretdescription", formula: null };
    const data = { ...base.data, metrics: [...base.data.metrics, secret], series: { ...base.data.series, "secret-slug": [{ period: "2026-09-01", value: 987654321 }] } };
    const hidden = ["chart", "table", "questions", "definitions"].map((type) => ({
      id: `sl_secret_${type}`,
      type,
      metrics: [secret.id],
      options: {},
      headline: "Secretheadline",
      answers: [{ question: "Secretquestion", text: "Secretanswer", writtenOn: null }],
      hidden: true,
    }));
    const drawing = drawDeck({ ...base, data, slides: [...base.slides, ...hidden] });
    const read = await parts(drawing, kind);
    expect(everything(read).toLowerCase()).not.toMatch(/secret|987,654,321|987654321/);
    expect(slidesOf(read)).toHaveLength(drawDeck(base).slides.length);
    // The same slides shown do reach the file, so the words above would have been found.
    const shown = await parts(drawDeck({ ...base, data, slides: [...base.slides, ...hidden.map((s) => ({ ...s, hidden: false }))] }), kind);
    expect(everything(shown)).toContain("Secretheadline");
    expect(everything(shown)).toContain("Secretmetric");
  });
});
