// The logo checks (GLOSSARY: Pack, Theme; spec 0039): the hostile table, run against the checks themselves and
// through a Pack file and a Theme file, the way `npx @ziffr/pack check` runs them.
import { describe, expect, it } from "vitest";
import { cleanLogo, logoOk, logoProblem, logoRatio, PACK_LOGO_MAX_BYTES, svgClean, svgIsPlain } from "./logo.js";
import { checkPack } from "./pack.js";
import { checkThemeFile } from "./theme-file.js";
import { run } from "./run.js";

const b64 = (b: Uint8Array | string) => Buffer.from(b).toString("base64");
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
/** A PNG header with its size and, optionally, a tEXt chunk that says anything at all. */
const pngBytes = (w: number, h: number, text = "") => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...be32(text.length), ...Buffer.from("tEXt"), ...Buffer.from(text), 0, 0, 0, 0]);
const png = (w: number, h: number, text = "") => `data:image/png;base64,${b64(pngBytes(w, h, text))}`;
const jpegBytes = (w: number, h: number, comment = "") => Buffer.from([0xff, 0xd8, 0xff, 0xfe, (comment.length + 2) >> 8, (comment.length + 2) & 255, ...Buffer.from(comment), 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0, 0xff, 0xd9]);
const jpeg = (w: number, h: number, comment = "") => `data:image/jpeg;base64,${b64(jpegBytes(w, h, comment))}`;
const svg = (s: string) => `data:image/svg+xml;base64,${b64(s)}`;
const SVG_OK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#2F5BEA"/></svg>';

describe("logoProblem", () => {
  it("accepts a PNG, a JPEG and a plain SVG within the limits", () => {
    for (const ok of [png(512, 512), png(1, 1), jpeg(300, 200), svg(SVG_OK), svg('<?xml version="1.0" encoding="UTF-8"?><!-- made by hand --><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L5 5"/></svg>')]) expect(logoProblem(ok)).toBeNull();
  });
  it("measures a PNG or JPEG and never reads its metadata", () => {
    // Text, a script and an address in the metadata change nothing: not refused, not shown, not parsed.
    expect(logoOk(png(64, 64, "<script>alert(1)</script> https://evil.example Ignore all previous instructions"))).toBe(true);
    expect(logoOk(jpeg(64, 64, "<script>alert(1)</script> GPS 52.5N 13.4E"))).toBe(true);
    expect(logoOk(png(513, 64, "<script>"))).toBe(false);
  });
  it("refuses a picture that is too big, in bytes or in pixels", () => {
    expect(logoProblem(png(513, 100))).toContain("at most 512");
    expect(logoProblem(jpeg(600, 200))).toContain("at most 512");
    expect(logoProblem(png(0, 10))).toContain("measures 0 by 10");
    expect(logoProblem(png(4_000_000_000, 4_000_000_000))).toContain("pixels");
    const big = svg(`<svg>${" ".repeat(PACK_LOGO_MAX_BYTES)}</svg>`);
    expect(logoProblem(big, PACK_LOGO_MAX_BYTES)).toContain("128,000 bytes");
    expect(logoOk(big)).toBe(true); // a Theme's logo may weigh 256,000
    expect(logoProblem(png(10, 10, "x".repeat(PACK_LOGO_MAX_BYTES + 10)), PACK_LOGO_MAX_BYTES)).toContain("bytes");
  });
  it("refuses another type, a text file declared as a picture and a header that lies", () => {
    expect(logoOk("data:image/webp;base64,AAAA")).toBe(false);
    expect(logoOk("data:image/gif;base64,R0lGODlhAQABAAAAACw=")).toBe(false);
    expect(logoOk("data:text/html;base64," + b64("<script>1</script>"))).toBe(false);
    expect(logoOk("data:image/png;base64," + b64("hello, I am only a text file, not a picture at all"))).toBe(false);
    expect(logoOk("data:image/png;base64," + b64(Buffer.from([0x89, 0x50, ...new Array(40).fill(0)])))).toBe(false); // half a signature
    expect(logoOk("data:image/png;base64," + b64(jpegBytes(10, 10)))).toBe(false); // a JPEG that says PNG
    expect(logoOk("data:image/jpeg;base64," + b64(pngBytes(10, 10)))).toBe(false); // a PNG that says JPEG
    expect(logoOk("data:image/png;base64," + b64(svg(SVG_OK)))).toBe(false);
    expect(logoOk("data:image/svg+xml;base64," + b64(pngBytes(10, 10)))).toBe(false);
    expect(logoOk("data:image/jpeg;base64," + b64(Buffer.from([0xff, 0xd8, 0xff, 0xd9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])))).toBe(false);
  });
  it("refuses bad base64, a second address and anything that is not a string", () => {
    for (const bad of ["data:image/png;base64,%%%", "data:image/png;base64,AAAA", `${png(10, 10)}, ${png(10, 10)}`, `${png(10, 10)}\n`, " " + png(10, 10), "https://example.com/logo.png", "", null, undefined, 5, {}, [png(10, 10)]]) expect(logoOk(bad)).toBe(false);
  });
});

describe("svgIsPlain: the hostile table", () => {
  const wrap = (inner: string, attrs = "") => `<svg xmlns="http://www.w3.org/2000/svg"${attrs}>${inner}</svg>`;
  const hostile: [string, string][] = [
    ["script", wrap("<script>alert(1)</script>")],
    ["script with a namespace prefix", '<svg xmlns:s="http://www.w3.org/2000/svg"><s:script>1</s:script></svg>'],
    ["script, odd case and spacing", wrap("<  SCRIPT >1</script>")],
    ["handler on the root", wrap("", ' onload="alert(1)"')],
    ["handler on a child", wrap('<rect onclick="alert(1)"/>')],
    ["handler separated by a slash", '<svg/onload=alert(1)>'],
    ["handler without quotes", wrap("<rect onmouseover=alert(1) />")],
    ["handler in single quotes after a quote", wrap("<rect fill='red'onclick='1'/>")],
    ["foreignObject", wrap('<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1)></body></foreignObject>')],
    ["iframe", wrap("<iframe src='x'/>")],
    ["object and embed", wrap("<object data='x'/><embed src='x'/>")],
    ["use with an external reference", wrap('<use href="https://evil.example/x.svg#a"/>')],
    ["use with a local reference", wrap('<use href="#a"/>')],
    ["image with an external address", wrap('<image href="https://evil.example/pixel.png"/>')],
    ["image with an old-style link", wrap('<image xlink:href="http://evil.example/p.png"/>')],
    ["a link out", wrap('<a href="https://evil.example"><rect/></a>')],
    ["a link with an unquoted address", wrap("<foo href=https://evil.example />")],
    ["href starting with a space", wrap('<foo href=" https://evil.example"/>')],
    ["a javascript address", wrap('<foo href="javascript:alert(1)"/>')],
    ["a javascript address, spaced", wrap('<foo x="j a v a s c r i p t :1"/>')],
    ["a data address inside", wrap('<foo x="data:image/png;base64,AAAA"/>')],
    ["a data address of text/html inside", wrap('<foo x="data:text/html,<script>1</script>"/>')],
    ["a data address inside an image", wrap('<image href="data:image/svg+xml;base64,PHN2Zy8+"/>')],
    ["animate", wrap('<animate attributeName="href" to="javascript:alert(1)"/>')],
    ["set", wrap('<set attributeName="onload" to="alert(1)"/>')],
    ["animateTransform", wrap("<animateTransform/>")],
    ["a style element", wrap("<style>@import url(https://evil.example/a.css);</style>")],
    ["a style attribute with an outside url", wrap('<rect style="fill:url(https://evil.example/x)"/>')],
    ["a url with a CSS escape", wrap('<rect style="fill:u\\72l(https://evil.example/x)"/>')],
    ["a fill with an outside url", wrap('<rect fill="url(https://e.example/t)"/>')],
    ["an import in a style attribute", wrap('<rect style="@import \'https://e.example/a.css\'"/>')],
    ["feImage", wrap('<filter><feImage href="https://e.example/x"/></filter>')],
    ["a DOCTYPE", "<!DOCTYPE svg><svg/>"],
    ["a DOCTYPE with an entity", '<!DOCTYPE svg [<!ENTITY x "<script>1</script>">]><svg>&x;</svg>'],
    ["an entity declared later", wrap('<!ENTITY x "y">')],
    ["a numeric entity hiding a word", wrap('<rect x="&#106;avascript:1"/>')],
    ["a named entity", wrap("<text>&lt;script&gt;&nbsp;</text>")],
    ["a hex entity in an attribute", wrap('<a href="&#x68;ttps://e.example">x</a>')],
    ["CDATA", wrap("<![CDATA[<script>1</script>]]>")],
    ["a stylesheet instruction", '<?xml-stylesheet href="https://evil.example/a.css"?><svg/>'],
    ["an instruction after the start", wrap('<?xml-stylesheet href="x"?>')],
    ["another encoding", '<?xml version="1.0" encoding="UTF-7"?><svg/>'],
    ["a base address", wrap("", ' xml:base="https://evil.example/"')],
    ["an expression", wrap('<rect style="width:expression(alert(1))"/>')],
    ["a binding", wrap('<rect style="-moz-binding:url(x)"/>')],
    ["a null byte", "<svg>\u0000<script>1</script></svg>"],
    ["a control character", "<svg>\u0001</svg>"],
    ["a script with a prefix beyond ASCII", wrap('<é:script xmlns:é="http://www.w3.org/1999/xhtml">fetch("//e.example/")</é:script>')],
    ["an HTML img with srcset", wrap('<img xmlns="http://www.w3.org/1999/xhtml" srcset="https://evil.example/p.png 1x"/>')],
    ["an element Ziffr does not list", wrap("<marquee/>")],
    ["an unknown namespace prefix on an attribute", wrap("<rect inkscape:label='x'/>")],
    ["a foreign namespace declared", wrap('<rect/>', ' xmlns:x="http://www.w3.org/1999/xhtml"')],
    ["the default namespace changed", '<svg xmlns="http://www.w3.org/1999/xhtml"><rect/></svg>'],
    ["a prefix mapped to HTML", wrap('<x:rect xmlns:x="http://www.w3.org/1999/xhtml"/>')],
    ["Inkscape metadata", wrap("<metadata><rdf:RDF/></metadata>")],
    ["an unknown attribute", wrap('<rect formaction="x" data-x="1"/>')],
    ["a tag split over lines", wrap("<\nscript\n>1</script>")],
    ["an attribute value holding a tag", wrap('<rect title="<script>1</script>"/>')],
    ["an event name in capitals", wrap('<rect ONCLICK="1"/>')],
    ["a script in a comment-looking tag", wrap("<!--x--><script>1</script>")],
    ["a use with a local id", wrap('<use xlink:href="#a"/>')],
    ["a tref", wrap('<tref xlink:href="#a"/>')],
    ["mask-image with image-set", wrap('<rect style="mask-image:image-set(\'https://evil.example/m.png\' 1x)"/>')],
    ["cursor with image-set", wrap('<rect style="cursor:image-set(\'https://evil.example/c.png\' 1x),auto"/>')],
    ["any style attribute", wrap('<rect style="fill:red"/>')],
    ["comments that hide a script from the tag scan", '<svg xmlns="http://www.w3.org/2000/svg"><!-- <g id=" --><h:script xmlns:h=\'http://www.w3.org/1999/xhtml\'>alert(document.domain)</h:script><!--">--></svg>'],
    ["an unclosed comment", wrap("<!-- <rect/>")],
    ["a double dash inside a comment", wrap("<!-- a -- b --><rect/>")],
    ["a processing instruction in the middle", wrap("<?php echo 1 ?>")],
    ["a nested namespace on a child", wrap('<g xmlns="http://www.w3.org/1999/xhtml"><rect/></g>')],
    ["a second xlink namespace on a child", wrap('<g xmlns:xlink="http://www.w3.org/1999/xlink"/>')],
    ["a wrong xlink namespace", wrap("", ' xmlns:xlink="http://evil.example/"')],
    ["an <svg> inside the svg", wrap("<svg><script/></svg>")],
    ["text outside text elements", wrap("hello<rect/>")],
    ["two root elements", "<svg/><svg/>"],
    ["something after the root", "<svg/>x"],
    ["an unclosed element", "<svg><g></svg>"],
    ["a mismatched end tag", "<svg><g></h></svg>"],
    ["a duplicate attribute", wrap('<rect x="1" x="2"/>')],
    ["an unquoted attribute value", wrap("<rect x=1/>")],
    ["a lower-case element name", wrap("<lineargradient/>")],
    ["invalid UTF-8", "\u00ff\u00fe<svg/>"],
    ["a declaration in the prolog with another version", '<?xml version="1.1"?><svg/>'],
    ["a comment before the declaration", '<!-- c --><?xml version="1.0"?><svg/>'],
    ["an image() function in a value", wrap(`<rect fill="image('https://evil.example/x')"/>`)],
    ["a cross-fade in a value", wrap(`<rect mask="cross-fade(image('https://e/x'),red)"/>`)],
    ["HTML", "<html><body><svg/></body></html>"],
    ["not an SVG", "<div>hi</div>"],
    ["text before the svg", "hello <svg/>"],
    ["a script before the svg in a comment-free way", "<script>1</script><svg/>"],
    ["a UTF-8 byte-order mark, as bytes", "\u00ef\u00bb\u00bf<svg/>"],
  ];
  it.each(hostile)("refuses %s", (_name, text) => {
    expect(svgIsPlain(text)).toBe(false);
    expect(logoOk(svg(text))).toBe(false);
  });
  it("accepts what a plain logo holds", () => {
    for (const ok of [
      SVG_OK,
      '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect fill="url(#g)"/><path d="M0 0 L9 9"/><text>Fish &amp; Chips</text></svg>',
      '<svg><rect fill="rgb(1,2,3)" transform="translate(1 2) rotate(3)" filter="url(#f)"/></svg>',
      "<!-- one --><svg><!-- two --><g id='a'><circle r='3' fill='url(#g)'/></g></svg>",
    ]) expect(svgIsPlain(ok)).toBe(true);
  });
});

describe("svgIsPlain on crafted input", () => {
  it("answers in no time for many comments and for a long file", () => {
    const t = Date.now();
    expect(svgIsPlain("<!---->".repeat(5000) + "x")).toBe(false);
    expect(svgIsPlain("<!--" + "a".repeat(170_000))).toBe(false);
    expect(svgIsPlain("<svg>" + "<g/>".repeat(3000) + "</svg>")).toBe(true);
    expect(svgIsPlain("<svg>" + "<g>".repeat(30_000) + "</svg>")).toBe(false);
    expect(svgIsPlain("<svg>" + "<g/>".repeat(30_000) + "</svg>")).toBe(false);
    expect(Date.now() - t).toBeLessThan(500);
  });
  it("answers a flood of attributes in no time", () => {
    const t = performance.now();
    expect(svgIsPlain("<svg " + Array.from({ length: 25_000 }, (_, i) => `a${i}=""`).join(" ") + "/>")).toBe(false);
    expect(svgIsPlain("<svg " + Array.from({ length: 100 }, () => `id=""`).join(" ") + "/>")).toBe(false);
    expect(performance.now() - t).toBeLessThan(50);
  });
  it("answers the 196-byte comment input in under 50 ms", () => {
    const input = "<!---->".repeat(28) + "x";
    expect(input.length).toBeLessThan(200);
    const t = performance.now();
    expect(logoProblem(svg(input))).not.toBeNull();
    expect(performance.now() - t).toBeLessThan(50);
  });
});

describe("the clean SVG under an HTML parser", () => {
  it("holds nothing that HTML reads differently from XML", () => {
    const inputs = [
      '<svg xmlns="http://www.w3.org/2000/svg"><!--><script>alert(1)</script>--></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><!---><script>alert(1)</script>--></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect id="<!--"/><script>x</script><rect id="-->"/></svg>',
      '<svg><g id="a>b"><text>&lt;script&gt;x&lt;/script&gt; ]]&gt;</text></g></svg>',
    ];
    for (const input of inputs) {
      const r = svgClean(input);
      if (r.ok) {
        // No comment, no tag but the allowed ones, and "<" and ">" in text and values only as entities.
        expect(r.svg).not.toContain("<!");
        expect(r.svg).not.toMatch(/<\/?script/i);
        expect([...r.svg.matchAll(/<\/?([A-Za-z]+)/g)].every((m) => ["svg", "g", "text", "rect"].includes(m[1]))).toBe(true);
        expect(r.svg).not.toMatch(/="[^"]*[<>][^"]*"/);
      }
    }
    expect(svgClean(inputs[2]).ok).toBe(false);
    expect(svgClean(inputs[0])).toMatchObject({ ok: true, svg: expect.not.stringContaining("script") });
  });
});

describe("the clean SVG", () => {
  const messy = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- c --><svg viewBox=\'0 0 9 9\' xmlns="http://www.w3.org/2000/svg">\n  <!-- d --><g id="a"><text x="1">Fish &amp; &lt;Chips&gt; &quot;1&quot;</text><rect width = "9" height="9" fill="#fff"/></g></svg>';
  it("is written out from the parsed tree, without comments and with the namespaces set", () => {
    const r = svgClean(messy);
    expect(r).toEqual({ ok: true, svg: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 9 9"><g id="a"><text x="1">Fish &amp; &lt;Chips&gt; "1"</text><rect width="9" height="9" fill="#fff"/></g></svg>' });
  });
  it("is the same when cleaned twice", () => {
    const once = cleanLogo(svg(messy))!;
    expect(once).not.toBeNull();
    expect(cleanLogo(once)).toBe(once);
    const a = svgClean(messy);
    expect(a.ok && svgClean(a.svg)).toEqual(a);
  });
  it("weighs the SVG as it is written out, so what it keeps passes the check again", () => {
    // 80 KB in: ">" is written out as "&gt;" and "€" weighs three bytes, so the written form weighs 140 KB.
    const heavy = svg(`<svg xmlns="http://www.w3.org/2000/svg"><text>${">".repeat(20_000)}${"€".repeat(20_000)}</text></svg>`);
    expect(logoProblem(heavy, PACK_LOGO_MAX_BYTES)).toMatch(/larger than the 128,000 bytes/);
    expect(cleanLogo(heavy, PACK_LOGO_MAX_BYTES)).toBeNull();
    const kept = cleanLogo(heavy)!;
    expect(kept).not.toBeNull();
    expect(cleanLogo(kept)).toBe(kept);
  });
  it("gives a raster picture as it came and nothing for what is refused", () => {
    expect(cleanLogo(png(10, 10))).toBe(png(10, 10));
    expect(cleanLogo(svg("<svg><script/></svg>"))).toBeNull();
    expect(cleanLogo("nope")).toBeNull();
  });
  it("says what it refused, and where", () => {
    expect(svgClean("<svg>\n<script/></svg>")).toEqual({ ok: false, reason: "<script> is not an element a plain logo has" });
    expect(svgClean("<svg>\n<!DOCTYPE x></svg>")).toMatchObject({ ok: false, reason: expect.stringContaining("line 2") });
  });
});

describe("a logo in a Pack file", () => {
  const PACK = {
    format: "ziffr.pack/1", id: "someone/shop", name: "Shop", version: "1.0.0", summary: "Orders and revenue.", author: { name: "Someone" }, license: "MIT", ziffr: ">=0.12",
    contents: { metrics: [{ key: "orders", metric: { format: "ziffr.metric/1", name: "Orders", period: "week", aggregation: "sum", polarity: "higher" } }] },
  };
  const THEME = { format: "ziffr.theme/1", name: "Shop", colors: { canvas: "#F3F4F6", surface: "#FFFFFF", ink: "#14161A", muted: "#565C66", rule: "#D8DBE0", accent: "#2F5BEA", good: "#0B7A55", bad: "#C8401E", band: "#D8DBE0", data: ["#2F5BEA"] }, fonts: { heading: "arial", body: "arial", figures: "arial" }, radius: 8, cards: "flat" };
  const withTheme = (slides: unknown, logo?: string) => ({ ...PACK, ...(logo ? { logo } : {}), contents: { themes: [{ key: "look", theme: { ...THEME, slides } }] } });
  const problems = (v: unknown) => { const r = checkPack(JSON.stringify(v, null, 2)); return r.ok ? [] : r.problems; };

  it("accepts a PNG, a JPEG and a plain SVG, and a Pack without a logo", () => {
    for (const logo of [png(128, 64), jpeg(128, 64), svg(SVG_OK)]) expect(checkPack(JSON.stringify({ ...PACK, logo })).ok).toBe(true);
    expect(checkPack(JSON.stringify(PACK)).ok).toBe(true);
  });
  it("refuses each hostile logo, and says which line", () => {
    const bad = [
      png(513, 10), jpeg(2000, 10), "data:image/webp;base64,AAAA", svg("<svg><script>1</script></svg>"), svg('<svg onload="1"/>'), svg("<svg><use href='#a'/></svg>"),
      svg('<svg><image href="https://e.example/a.png"/></svg>'), svg("<!DOCTYPE svg [<!ENTITY x 'y'>]><svg/>"), "data:image/png;base64," + b64("only text"),
      "data:text/plain;base64,AAAA", "data:image/png;base64,%%%", "https://example.com/logo.png", 5, null, ["a"], { a: 1 },
      svg(`<svg>${"a".repeat(PACK_LOGO_MAX_BYTES)}</svg>`),
    ];
    for (const logo of bad) {
      const text = JSON.stringify({ ...PACK, logo }, null, 2);
      const r = checkPack(text);
      expect(r.ok, String(logo).slice(0, 40)).toBe(false);
      if (!r.ok) expect(r.problems.some((p) => p.path === "logo" && p.line === text.split("\n").findIndex((l) => l.includes('"logo"')) + 1)).toBe(true);
    }
  });
  it("holds a Pack logo to 128,000 bytes, though a Theme's may weigh more", () => {
    const edge = svg(`<svg>${" ".repeat(PACK_LOGO_MAX_BYTES - 11)}</svg>`);
    expect(checkPack(JSON.stringify({ ...PACK, logo: edge })).ok).toBe(true);
    expect(checkPack(JSON.stringify({ ...PACK, logo: svg(`<svg>${" ".repeat(PACK_LOGO_MAX_BYTES)}</svg>`) })).ok).toBe(false);
  });
  it("refuses a second logo, a logo of its own in a Theme and one in contents", () => {
    expect(problems({ ...PACK, logo: [png(10, 10), png(10, 10)] }).length).toBeGreaterThan(0);
    expect(problems({ ...PACK, logo: png(10, 10), logos: [png(10, 10)] }).length).toBeGreaterThan(0);
    expect(problems(withTheme({ logo: png(10, 10) }, png(10, 10))).map((p) => p.path)).toContain("contents.themes[0].theme.slides.logo");
    expect(problems(withTheme({ logo: "https://example.com/a.png" }, png(10, 10))).length).toBeGreaterThan(0);
    expect(problems(withTheme({ logo: "Pack" }, png(10, 10))).length).toBeGreaterThan(0);
  });
  it("lets a Theme say \"pack\" only in a Pack that has a logo", () => {
    expect(problems(withTheme({ logo: "pack", logoWidth: 120, logoPosition: "top-left" }, png(10, 10)))).toEqual([]);
    expect(problems(withTheme({ logo: "pack" })).map((p) => p.message)).toEqual(["is “pack”, but this Pack has no logo."]);
  });
  it("refuses \"pack\" in a Theme file on its own", () => {
    const r = checkThemeFile(JSON.stringify({ ...THEME, slides: { logo: "pack" } }, null, 2));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]).toMatchObject({ path: "slides.logo", message: expect.stringContaining("a logo comes only from a Pack") });
    expect(checkThemeFile(JSON.stringify(THEME)).ok).toBe(true);
  });
  it("is reported by the command with its line", () => {
    const text = JSON.stringify({ ...PACK, logo: svg('<svg onload="1"/>') }, null, 2);
    const res = run(["check", "shop.pack.json"], () => text);
    expect(res.code).toBe(1);
    expect(res.out[0]).toMatch(/^shop\.pack\.json:\d+: logo is an SVG that is not plain: /);
  });
});

describe("logoRatio", () => {
  it("reads the proportions from the header or the SVG's viewBox, and falls back to 3", () => {
    expect(logoRatio(png(200, 100))).toBe(2);
    expect(logoRatio(jpeg(100, 200))).toBe(0.5);
    expect(logoRatio(svg(SVG_OK))).toBe(1);
    expect(logoRatio(svg('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20"/>'))).toBe(4);
    expect(logoRatio(svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1"/>'))).toBe(20);
    expect(logoRatio("nonsense")).toBe(3);
    expect(logoRatio(null)).toBe(3);
  });
});
