// What on a slide or free layout would load from another site (spec 0009, ticket #131).
import { describe, expect, it } from "vitest";
import { deckOutsideContent, stripOutsideContent, widgetWithoutOutside } from "./deck-content";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const doc = (store: Record<string, unknown>) => ({ schema: { schemaVersion: 2 }, store });
const asset = (id: string, type: string, src: string | null) => ({ id, typeName: "asset", type, props: { src } });
const shape = (id: string, type: string, props: Record<string, unknown> = {}) => ({ id, typeName: "shape", type, props });

describe("content from other sites", () => {
  it("lets uploaded images, uploads still running and ordinary shapes through", () => {
    const d = doc({
      "asset:a": asset("asset:a", "image", PNG), "shape:a": shape("shape:a", "image", { assetId: "asset:a", url: "" }),
      "asset:b": asset("asset:b", "image", null), "shape:t": shape("shape:t", "text", { text: "https://example.com is fine as text" }),
      "shape:w": shape("shape:w", "ziffr-widget", { metricIds: [1] }),
    });
    expect(deckOutsideContent(d)).toEqual([]);
    expect(stripOutsideContent(d)).toBe(d);
  });

  it("names images and videos from elsewhere, link previews, embeds and linked images", () => {
    const d = doc({
      "asset:x": asset("asset:x", "image", "https://tracker.example/pixel.png"), "shape:x": shape("shape:x", "image", { assetId: "asset:x" }),
      "asset:v": asset("asset:v", "video", "http://cdn.example/clip.mp4"),
      "asset:j": asset("asset:j", "image", "javascript:alert(1)"),
      "asset:k": asset("asset:k", "bookmark", "https://example.com"), "shape:k": shape("shape:k", "bookmark", { url: "https://example.com" }),
      "shape:e": shape("shape:e", "embed", { url: "https://youtube.com/watch?v=1" }),
      "asset:l": asset("asset:l", "image", PNG), "shape:l": shape("shape:l", "image", { assetId: "asset:l", url: "https://elsewhere.example" }),
      "shape:ok": shape("shape:ok", "geo"),
    });
    expect(deckOutsideContent(d).sort()).toEqual(["a link preview", "a video from another site", "an embedded page", "an image from another site", "an image that links to another site"].sort());
    const kept = Object.keys(stripOutsideContent(d).store).sort();
    // The image whose asset came from elsewhere goes with it; the uploaded one stays, its link shape does not.
    expect(kept).toEqual(["asset:l", "shape:ok"]);
  });

  it("reads free layouts placed inside a slide's widget, as a JSON string or an object", () => {
    const inner = doc({ "shape:e": shape("shape:e", "embed"), "shape:g": shape("shape:g", "geo") });
    const asString = doc({ "shape:w": shape("shape:w", "ziffr-widget", { template: "canvas", settings: JSON.stringify({ canvas: { document: inner } }) }) });
    const asObject = doc({ "shape:w": shape("shape:w", "ziffr-widget", { settings: { canvas: { document: doc({ "shape:w2": shape("shape:w2", "ziffr-widget", { settings: JSON.stringify({ canvas: { document: inner } }) }) }) } } }) });
    expect(deckOutsideContent(asString)).toEqual(["an embedded page"]);
    expect(deckOutsideContent(asObject)).toEqual(["an embedded page"]);
    const cleaned = stripOutsideContent(asString);
    expect(deckOutsideContent(cleaned)).toEqual([]);
    const kept = JSON.parse((cleaned.store["shape:w"] as { props: { settings: string } }).props.settings).canvas.document.store;
    expect(Object.keys(kept)).toEqual(["shape:g"]);
    expect(deckOutsideContent(stripOutsideContent(asObject))).toEqual([]);
    // JSON escapes do not hide a layout.
    const escaped = doc({ "shape:w": shape("shape:w", "ziffr-widget", { settings: JSON.stringify({ canvas: { document: inner } }).replace("canvas", "\\u0063anvas") }) });
    expect(deckOutsideContent(escaped)).toEqual(["an embedded page"]);
    // Nested deeper than is read: refused, and left out when shown.
    let deep: unknown = doc({ "shape:g": shape("shape:g", "geo") });
    for (let i = 0; i < 6; i++) deep = doc({ [`shape:${i}`]: shape(`shape:${i}`, "ziffr-widget", { settings: { canvas: { document: deep } } }) });
    expect(deckOutsideContent(deep)).toEqual(["layouts nested too deeply"]);
    expect(deckOutsideContent(stripOutsideContent(deep))).toEqual([]);
    // A widget whose settings cannot be read loads nothing either.
    expect(deckOutsideContent(doc({ "shape:w": shape("shape:w", "ziffr-widget", { settings: "{canvas" }) }))).toEqual([]);
  });

  it("reads documents of any shape without failing", () => {
    for (const d of [null, undefined, 1, "x", {}, { store: null }, { store: { a: null, b: 3 } }]) {
      expect(deckOutsideContent(d)).toEqual([]);
      expect(stripOutsideContent(d)).toBe(d);
    }
  });

  it("cleans a free layout's document inside a widget, and leaves other widgets as they are", () => {
    const plain = { id: 1, settings: { window: 12 } };
    expect(widgetWithoutOutside(plain)).toBe(plain);
    const layout = { id: 2, settings: { canvas: { document: doc({ "shape:e": shape("shape:e", "embed"), "shape:g": shape("shape:g", "geo") }) } } };
    expect(Object.keys((widgetWithoutOutside(layout).settings.canvas.document as { store: object }).store)).toEqual(["shape:g"]);
  });

  it("drops arrow bindings to a removed shape and keeps those to widgets (ticket #153)", () => {
    const bind = (id: string, fromId: string, toId: string, terminal: string) => ({ id, typeName: "binding", type: "arrow", fromId, toId, props: { terminal } });
    const d = doc({
      "shape:w": shape("shape:w", "ziffr-widget", { metricIds: [1] }), "shape:e": shape("shape:e", "embed", { url: "https://example.com" }),
      "shape:a": shape("shape:a", "arrow"), "binding:start": bind("binding:start", "shape:a", "shape:e", "start"), "binding:end": bind("binding:end", "shape:a", "shape:w", "end"),
    });
    expect(Object.keys(stripOutsideContent(d).store).sort()).toEqual(["binding:end", "shape:a", "shape:w"]);
  });
});
