import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { drawDeck, type SlideDrawing } from "@ziffr/core/deck-drawing/draw-deck";
import { createPen } from "@ziffr/core/deck-drawing/objects";

import { DECK, slideOf, THEMES } from "./check/samples";
import { slideFontsHref, slideFontStack } from "./fonts";
import { SlideView } from "./slide-view";

const typed = '<img src=x onerror=alert(1)> "quoted" & more';

const render = (more: SlideDrawing["objects"] = []) => {
  const drawing = drawDeck({ ...DECK, name: typed, design: "column", emphasis: "strong", theme: THEMES["ziffr-light"]!, slides: [slideOf("cover")] });
  const slide = drawing.slides[0]!;
  return renderToStaticMarkup(<SlideView slide={{ ...slide, objects: [...slide.objects, ...more] }} look={drawing.look} />);
};

describe("a slide on screen", () => {
  it("writes typed words as text, never as markup", () => {
    const html = render();
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("says what it is to those who cannot see it: a slide, its name, its heading", () => {
    const html = render();
    expect(html).toContain('aria-roledescription="slide"');
    expect(html).toContain('role="heading"');
  });

  it("draws a picture only from a data address", () => {
    const pen = createPen();
    const box = { x: 0, y: 0, w: 10, h: 10 };
    const pictures = (src: string) => render([{ ...pen.picture(box, src, "Added"), id: "added" }]).includes('alt="Added"');
    expect(pictures("data:image/png;base64,AA==")).toBe(true);
    for (const src of ["https://example.com/a.png", "javascript:alert(1)", "data:text/html;base64,AA=="]) expect(pictures(src)).toBe(false);
  });

  it("is always as designed: its colours come from the drawing", () => {
    expect(render()).not.toMatch(/light-dark|var\(--/);
  });
});

describe("a slide's fonts", () => {
  it("ask for the font with Arial's widths before Arial, and load it", () => {
    expect(slideFontStack("arial")).toBe('"Arimo", "Arial", sans-serif');
    expect(slideFontStack("source-serif")).toBe('"Source Serif 4", serif');
    expect(slideFontStack("geist-mono")).toBe('"Geist Mono", monospace');
    expect(slideFontsHref({ head: "georgia", body: "ibm-plex-sans" })).toBe("https://fonts.googleapis.com/css2?family=Gelasio:wght@400;700&family=IBM+Plex+Sans:wght@400;700&display=swap");
  });
});
