// What a visitor may put on a deck (GLOSSARY: Demo Mode, Deck; spec 0051, ticket 10), without a database: outside a demo visit
// a deck is saved as it always was, and in one every record is rebuilt, every word goes through the text rules, and what comes
// from outside the demo (a picture, a link, an embedded page) is refused, before anything is written.
import { describe, expect, it } from "vitest";
import { runAsVisit } from "./demo-visit-scope";
import { DECK_TOO_LARGE, visitorDeckDocument, visitorSlideShapes } from "./demo-visitor-deck";
import { DemoTextRefused } from "./demo-visitor-words";
import { DemoSizeRefused } from "./demo-visitor-limits";
import { DEMO_TEXT_WORDS } from "./demo-words";
import { DEMO_WORKSPACE_ID } from "./team";

const demo = { workspaceId: DEMO_WORKSPACE_ID };
const real = { workspaceId: "11111111-1111-4111-8111-111111111111" };
const visit = <T>(work: () => Promise<T>) => runAsVisit({ "x-ziffr-demo-visit": "1", "x-ziffr-demo-visit-key": "a".repeat(32) }, work);

const rich = (...runs: string[]) => ({ type: "doc", content: [{ type: "paragraph", content: runs.map((text) => ({ type: "text", text })) }] });
const shape = (id: string, type: string, props: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id, typeName: "shape", type, x: 10, y: 20, rotation: 0, isLocked: false, opacity: 1, parentId: "page:page", index: "a1", meta: {}, props, ...extra });
type Deck = { schema: { schemaVersion: number; sequences: Record<string, number> }; store: Record<string, unknown> };
const deck = (...shapes: ReturnType<typeof shape>[]): Deck => ({
  schema: { schemaVersion: 2, sequences: { "com.tldraw.shape.text": 1, "com.tldraw.store": 4 } },
  store: {
    "document:document": { id: "document:document", typeName: "document", name: "", gridSize: 10, meta: {} },
    "page:page": { id: "page:page", typeName: "page", name: "Page 1", index: "a1", meta: {} },
    ...Object.fromEntries(shapes.map((s) => [s.id, s])),
  },
});
/** The size the stored deck has, so that nothing is charged (no database here): a deck that does not grow costs nothing. */
const same = (d: unknown) => d;

describe("outside a demo visit", () => {
  it("saves a deck as it always did: pictures, links and any words", async () => {
    const d = { store: { "asset:a": { id: "asset:a", typeName: "asset", type: "image", props: { src: "data:image/png;base64,AAA" } } } };
    expect(await visitorDeckDocument(demo, d, null)).toBe(d);
    expect(await visitorDeckDocument(real, d, null)).toBe(d);
    await visit(async () => expect(await visitorDeckDocument(real, d, null)).toBe(d));
    const shapes = [{ type: "image" }];
    expect(visitorSlideShapes(demo, shapes)).toBe(shapes);
  });
});

describe("in a demo visit", () => {
  it("keeps a deck as the editor writes it, with the words cleaned", async () => {
    const d = deck(
      shape("shape:s1", "frame", { w: 1600, h: 900, name: "Slide 1" }),
      shape("shape:t1", "text", { richText: rich("Revenue ", "against", " cost​"), size: "xl", font: "sans", textAlign: "start", autoSize: false, w: 800, scale: 1, color: "black" }, { parentId: "shape:s1" }),
      shape("shape:w1", "ziffr-widget", { w: 700, h: 400, template: "line", metricIds: [3], title: "", settings: JSON.stringify({ window: 12, showTarget: true, headline: "Up  " }) }, { parentId: "shape:s1", index: "a2V" }),
    );
    const out = (await visit(() => visitorDeckDocument(demo, d, same(d)))) as typeof d;
    const text = out.store["shape:t1"] as unknown as { props: { richText: ReturnType<typeof rich> } };
    expect(text.props.richText.content[0].content.map((c: { text: string }) => c.text)).toEqual(["Revenue ", "against", " cost"]);
    expect(JSON.parse((out.store["shape:w1"] as unknown as { props: { settings: string } }).props.settings)).toEqual({ window: 12, showTarget: true, headline: "Up" });
    expect(out.schema.sequences["com.tldraw.store"]).toBe(4);
    expect(Object.keys(out.store)).toHaveLength(5);
  });

  it("refuses a link or tags in the words of a slide, with the text rules' words, and in a frame's name", async () => {
    const link = deck(shape("shape:t1", "text", { richText: rich("see www.example.com") }));
    await expect(visit(() => visitorDeckDocument(demo, link, same(link)))).rejects.toThrow(DEMO_TEXT_WORDS.link);
    const tags = deck(shape("shape:t1", "note", { richText: rich("<b>hi</b>") }));
    await expect(visit(() => visitorDeckDocument(demo, tags, same(tags)))).rejects.toThrow(DEMO_TEXT_WORDS.markup);
    const name = deck(shape("shape:s1", "frame", { name: "https://example.com", w: 1, h: 1 }));
    await expect(visit(() => visitorDeckDocument(demo, name, same(name)))).rejects.toThrow(DemoTextRefused);
    const legacy = deck(shape("shape:t1", "geo", { text: "mail me@example.com" }));
    await expect(visit(() => visitorDeckDocument(demo, legacy, same(legacy)))).rejects.toThrow(DemoTextRefused);
  });

  it("drops a link mark and an address on a shape, and keeps no string in an attribute", async () => {
    const d = deck(shape("shape:t1", "text", {
      url: "https://example.com",
      richText: { type: "doc", content: [{ type: "paragraph", attrs: { dir: "ltr", note: "hello" }, content: [{ type: "text", text: "plain", marks: [{ type: "link", attrs: { href: "https://example.com" } }, { type: "bold" }] }] }] },
    }));
    const out = (await visit(() => visitorDeckDocument(demo, d, same(d)))) as typeof d;
    const props = (out.store["shape:t1"] as unknown as { props: { url: string; richText: { content: { attrs: object; content: { marks: object[] }[] }[] } } }).props;
    expect(props.url).toBe("");
    expect(props.richText.content[0].attrs).toEqual({});
    expect(props.richText.content[0].content[0].marks).toEqual([{ type: "bold" }]);
  });

  it("refuses what comes from outside the demo: a picture, a video, an embedded page, a link preview, an asset", async () => {
    for (const type of ["image", "video", "embed", "bookmark"]) {
      const d = deck(shape("shape:x", type, { url: "", w: 1, h: 1 }));
      await expect(visit(() => visitorDeckDocument(demo, d, same(d))), type).rejects.toThrow("Pictures and links can't be added in the demo.");
    }
    const asset = { store: { "asset:a": { id: "asset:a", typeName: "asset", type: "image", props: { src: "data:image/png;base64,AAAA" } } } };
    await expect(visit(() => visitorDeckDocument(demo, asset, same(asset)))).rejects.toThrow("Pictures and links can't be added in the demo.");
  });

  it("refuses a shape or a record of a kind a slide does not hold, and an id that is not the record's key", async () => {
    await expect(visit(() => visitorDeckDocument(demo, deck(shape("shape:x", "script", {})), null))).rejects.toThrow(DemoTextRefused);
    const odd = { store: { "instance:x": { id: "instance:x", typeName: "instance", props: {} } } };
    await expect(visit(() => visitorDeckDocument(demo, odd, null))).rejects.toThrow(DemoTextRefused);
    const wrong = { store: { "shape:a": { ...shape("shape:b", "text", { richText: rich("x") }) } } };
    await expect(visit(() => visitorDeckDocument(demo, wrong, null))).rejects.toThrow(DemoTextRefused);
    await expect(visit(() => visitorDeckDocument(demo, { notAStore: true }, null))).rejects.toThrow(DemoTextRefused);
    await expect(visit(() => visitorDeckDocument(demo, "text", null))).rejects.toThrow(DemoTextRefused);
  });

  it("lets no free text hide in a property nobody looks at, nor in a node or a key the editor does not make", async () => {
    const hidden = deck(shape("shape:t1", "text", { richText: rich("ok"), note: "visit evil.example now" }));
    await expect(visit(() => visitorDeckDocument(demo, hidden, null))).rejects.toThrow(DemoTextRefused);
    const spaced = deck(shape("shape:t1", "text", { richText: rich("ok"), font: "two words" }));
    await expect(visit(() => visitorDeckDocument(demo, spaced, null))).rejects.toThrow(DemoTextRefused);
    const node = deck(shape("shape:t1", "text", { richText: { type: "doc", content: [{ type: "image", attrs: { src: "x" } }] } }));
    await expect(visit(() => visitorDeckDocument(demo, node, null))).rejects.toThrow(DemoTextRefused);
    const key = deck(shape("shape:t1", "text", { richText: rich("ok"), "a b": 1 }));
    await expect(visit(() => visitorDeckDocument(demo, key, null))).rejects.toThrow(DemoTextRefused);
  });

  it("puts a widget's settings through the widget rules: a free layout and a link in a Finding are refused", async () => {
    const canvas = deck(shape("shape:w1", "ziffr-widget", { template: "canvas", metricIds: [], settings: JSON.stringify({ canvas: { document: { store: {} } } }) }));
    await expect(visit(() => visitorDeckDocument(demo, canvas, null))).rejects.toThrow(/free layout/);
    const finding = deck(shape("shape:w1", "ziffr-widget", { template: "finding", metricIds: [1], settings: JSON.stringify({ headline: "see www.example.com" }) }));
    await expect(visit(() => visitorDeckDocument(demo, finding, null))).rejects.toThrow(DEMO_TEXT_WORDS.link);
    const broken = deck(shape("shape:w1", "ziffr-widget", { template: "line", metricIds: [1], settings: "{not json" }));
    await expect(visit(() => visitorDeckDocument(demo, broken, null))).rejects.toThrow(DemoTextRefused);
    const big = deck(shape("shape:w1", "ziffr-widget", { template: "line", metricIds: [1], settings: JSON.stringify({ window: 12, callouts: Array.from({ length: 40 }, () => ({ text: "a".repeat(450) })) }) }));
    await expect(visit(() => visitorDeckDocument(demo, big, null))).rejects.toThrow(/too large for the demo/);
    // A word that is an array or an object skips the text rules and is drawn for everyone (final review D3): refused by its shape.
    for (const settings of [{ headline: ["see www.example.com"] }, { kicker: {} }, { callouts: [{ text: ["x"] }] }]) {
      const bypass = deck(shape("shape:w1", "ziffr-widget", { template: "line", metricIds: [1], settings: JSON.stringify(settings) }));
      await expect(visit(() => visitorDeckDocument(demo, bypass, null))).rejects.toThrow(DemoTextRefused);
    }
  });

  it("refuses a deck over 512 KB, and one with too many records, before anything is written", async () => {
    const many = { store: Object.fromEntries(Array.from({ length: 3001 }, (_, i) => [`shape:s${i}`, shape(`shape:s${i}`, "geo", {})])) };
    await expect(visit(() => visitorDeckDocument(demo, many, null))).rejects.toThrow(DECK_TOO_LARGE);
    // 60 drawings of 10 KB each: under every other bound, past the deck's.
    const path = "A".repeat(10_000);
    const drawn = deck(...Array.from({ length: 60 }, (_, i) => shape(`shape:d${i}`, "draw", { segments: [{ type: "free", path }] })));
    await expect(visit(() => visitorDeckDocument(demo, drawn, null))).rejects.toThrow(DemoSizeRefused);
  });

  it("checks the runs of a block joined, as a reader sees them: a link split across runs, marks or breaks is refused", async () => {
    const bold = (text: string) => ({ type: "text", text, marks: [{ type: "bold" }] });
    const plain = (text: string) => ({ type: "text", text });
    const refuse = async (content: object[], wrap: (p: object) => object = (p) => p) => {
      const d = deck(shape("shape:t1", "text", { richText: { type: "doc", content: [wrap({ type: "paragraph", content })] } }));
      await expect(visit(() => visitorDeckDocument(demo, d, same(d)))).rejects.toThrow(DemoTextRefused);
    };
    await refuse([plain("go to evil"), bold(".com/login")]);
    await refuse([plain("see ww"), bold("w.evil"), plain("x")]);
    await refuse([plain("[click]"), bold("(http"), plain("s://x)")]);
    await refuse([plain("a@evil"), { type: "hardBreak" }, plain("b")].slice(0, 1).concat([bold(".com")]));
    await refuse([plain("<"), bold("script>")]);
    await refuse([plain("evil\u200d"), plain(".com/x")]);
    // In a heading and in a list item.
    await refuse([plain("evil"), bold(".com/x")], (p) => ({ type: "heading", attrs: { level: 1 }, content: (p as { content: object[] }).content }));
    await refuse([plain("evil"), bold(".com/x")], (p) => ({ type: "bulletList", content: [{ type: "listItem", content: [p] }] }));
    // Words in two paragraphs are two lines, and fine.
    const ok = deck(shape("shape:t1", "text", { richText: { type: "doc", content: [{ type: "paragraph", content: [plain("Revenue")] }, { type: "paragraph", content: [plain("and "), bold("cost")] }] } }));
    await expect(visit(() => visitorDeckDocument(demo, ok, same(ok)))).resolves.toBeDefined();
  });

  it("bounds the shapes a deck draws: widgets, shapes on a slide, records, and positions, sizes, scale and turn", async () => {
    const widget = (i: number) => shape(`shape:w${i}`, "ziffr-widget", { w: 10, h: 10, template: "line", metricIds: [1], title: "", settings: "{}" }, { parentId: "shape:s1" });
    const slide = shape("shape:s1", "frame", { w: 1600, h: 900, name: "Slide 1" });
    const widgets = (n: number) => deck(slide, ...Array.from({ length: n }, (_, i) => widget(i)));
    await expect(visit(() => visitorDeckDocument(demo, widgets(60), same(widgets(60))))).resolves.toBeDefined();
    await expect(visit(() => visitorDeckDocument(demo, widgets(61), null))).rejects.toThrow(DECK_TOO_LARGE);
    const crowded = (n: number) => deck(slide, ...Array.from({ length: n }, (_, i) => shape(`shape:g${i}`, "geo", { w: 1, h: 1 }, { parentId: "shape:s1" })));
    await expect(visit(() => visitorDeckDocument(demo, crowded(300), same(crowded(300))))).resolves.toBeDefined();
    await expect(visit(() => visitorDeckDocument(demo, crowded(301), null))).rejects.toThrow(DECK_TOO_LARGE);
    // 1,501 records, on many slides so that no slide is crowded.
    const many = { store: Object.fromEntries(Array.from({ length: 1501 }, (_, i) => [`shape:m${i}`, shape(`shape:m${i}`, "geo", {}, { parentId: `shape:p${i % 50}` })])) };
    await expect(visit(() => visitorDeckDocument(demo, many, null))).rejects.toThrow(DECK_TOO_LARGE);
    for (const [key, value] of [["x", 20001], ["y", -20001], ["w", 1e9], ["h", Number.POSITIVE_INFINITY], ["scale", 0], ["scale", 21]] as const) {
      const d = deck(shape("shape:g", "geo", key === "x" || key === "y" ? {} : { [key]: value }, key === "x" || key === "y" ? { [key]: value } : {}));
      await expect(visit(() => visitorDeckDocument(demo, d, null)), `${key} ${value}`).rejects.toThrow(DemoTextRefused);
    }
    const turned = deck(shape("shape:g", "geo", {}, { rotation: 1e6 }));
    await expect(visit(() => visitorDeckDocument(demo, turned, null))).rejects.toThrow(DemoTextRefused);
    const fine = deck(shape("shape:g", "geo", { w: 20000, scale: 20 }, { x: -20000, y: 20000, rotation: 3.14 }));
    await expect(visit(() => visitorDeckDocument(demo, fine, same(fine)))).resolves.toBeDefined();
  });

  it("keeps a blank run as a space, so words on either side stay apart", async () => {
    const d = deck(shape("shape:t1", "text", { richText: rich("a", " ", "​", "b") }));
    const out = (await visit(() => visitorDeckDocument(demo, d, same(d)))) as typeof d;
    const runs = (out.store["shape:t1"] as unknown as { props: { richText: ReturnType<typeof rich> } }).props.richText.content[0].content;
    expect(runs.map((r: { text: string }) => r.text)).toEqual(["a", " ", " ", "b"]);
  });
});

describe("the shapes of a slide layout in a demo visit", () => {
  it("are rebuilt as a deck's are: words through the rules, no picture", async () => {
    const ok = await visit(async () => visitorSlideShapes(demo, [{ type: "text", x: 1, y: 2, rotation: 0, opacity: 1, props: { richText: rich("Ti​tle") } }]));
    expect((ok[0].props.richText as ReturnType<typeof rich>).content[0].content[0].text).toBe("Title");
    await expect(visit(async () => visitorSlideShapes(demo, [{ type: "text", props: { richText: rich("see www.example.com") } }]))).rejects.toThrow(DEMO_TEXT_WORDS.link);
    await expect(visit(async () => visitorSlideShapes(demo, [{ type: "image", props: {} }]))).rejects.toThrow("Pictures and links");
    await expect(visit(async () => visitorSlideShapes(demo, "nope"))).rejects.toThrow(DemoTextRefused);
    await expect(visit(async () => visitorSlideShapes(demo, Array.from({ length: 81 }, () => ({ type: "text", props: {} }))))).rejects.toThrow(DemoTextRefused);
  });
});
