// The Theme outside the app (ticket #542): contrast, the look, the plain-SVG check.
import { describe, expect, it } from "vitest";
import { contrastRatio, lookTheme, onFill, readableOn, svgIsPlain, themeLook } from "./theme-look";
import { STANDARD_THEMES } from "./standard-themes";
import { STARTER_THEME } from "./themes";

describe("contrast", () => {
  it("measures black on white as 21 : 1 and a colour on itself as 1 : 1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#2F5BEA", "#2F5BEA")).toBe(1);
  });
  it("keeps a colour that reads, darkens one that is too pale on light, lightens one that is too dark on dark", () => {
    expect(readableOn("#2F5BEA", "#FFFFFF")).toBe("#2F5BEA");
    const pale = readableOn("#FFD166", "#FFFFFF");
    expect(pale).not.toBe("#FFD166");
    expect(contrastRatio(pale, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    const dark = readableOn("#1B2A6B", "#101216");
    expect(contrastRatio(dark, "#101216")).toBeGreaterThanOrEqual(4.5);
    expect(readableOn("#ffd166", "#FFFFFF", 21)).toBe("#000000");
    expect(readableOn("nonsense", "#FFFFFF")).toBe("#000000");
  });
  it("picks the text colour for a fill", () => {
    expect(onFill("#000000")).toBe("#FFFFFF");
    expect(onFill("#FFFFFF")).toBe("#000000");
  });
});

describe("the look", () => {
  it("reads readable colours for every standard Theme and the starter", () => {
    for (const t of [...STANDARD_THEMES, STARTER_THEME]) {
      const look = themeLook(t, "Acme");
      expect(contrastRatio(look.accent, look.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(look.muted, look.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(look.ink, look.surface)).toBeGreaterThanOrEqual(7);
    }
  });
  it("cleans the name and the footer to one line, and falls back to neutral colours with no Theme", () => {
    const look = themeLook(undefined, "  Acme\n  Co  ");
    expect(look).toMatchObject({ name: "Acme Co", logo: null, footer: "", surface: "#FFFFFF", accent: "#2F5BEA" });
    expect(themeLook(undefined, "").name).toBe("Ziffr");
    const t = { tokens: { ...STARTER_THEME.tokens, accent: "not a colour", fontBody: "nope" as never }, slides: { ...STARTER_THEME.slides, footer: "a\nb", logo: "https://evil.example/x.png", logo_width: 9999, logo_ratio: -1 } };
    expect(themeLook(t, "A")).toMatchObject({ accent: "#2F5BEA", fontBody: "arial", footer: "a b", logo: null, logoWidth: 400, logoRatio: 3 });
  });
  it("keeps only an inline picture as the logo", () => {
    expect(themeLook({ tokens: STARTER_THEME.tokens, slides: { ...STARTER_THEME.slides, logo: "data:image/png;base64,AAAA" } }, "A").logo).toBe("data:image/png;base64,AAAA");
    expect(themeLook({ tokens: STARTER_THEME.tokens, slides: { ...STARTER_THEME.slides, logo: "data:text/html;base64,AAAA" } }, "A").logo).toBeNull();
  });
  it("also refuses an SVG logo that is not plain, whatever stored it", () => {
    const svg = (x: string) => "data:image/svg+xml;base64," + Buffer.from(x).toString("base64");
    expect(themeLook({ tokens: STARTER_THEME.tokens, slides: { ...STARTER_THEME.slides, logo: svg("<svg><script>1</script></svg>") } }, "A").logo).toBeNull();
    expect(themeLook({ tokens: STARTER_THEME.tokens, slides: { ...STARTER_THEME.slides, logo: svg("<svg><rect/></svg>") } }, "A").logo).not.toBeNull();
  });
  it("draws a look as a Theme that names no stored Theme", () => {
    const look = themeLook(STARTER_THEME, "Acme");
    expect(lookTheme(look)).toMatchObject({ id: 0, tokens: { accent: look.accent, surface: look.surface } });
  });
});

describe("svgIsPlain", () => {
  it("takes a plain drawing and refuses anything that can run or reach out", () => {
    expect(svgIsPlain('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')).toBe(true);
    for (const bad of ["<div></div>", "<svg><script>1</script></svg>", '<svg onclick="1"/>', "<svg><use href='#a'/></svg>", '<svg><image href="http://x/y.png"/></svg>', "<!DOCTYPE svg><svg/>", "<svg><style>*{}</style></svg>", '<svg xmlns:s="http://www.w3.org/2000/svg"><s:script>1</s:script></svg>', '<svg><rect fill="url(https://e.example/t)"/></svg>']) expect(svgIsPlain(bad)).toBe(false);
  });
});
