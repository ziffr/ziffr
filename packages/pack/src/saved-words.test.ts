// Where a file may hold {calculation note} (spec 0060; GLOSSARY: Placeholder, Deck Template): in words filled each time
// they are drawn, never in a slide's text or boxes, which are filled once and saved.
import { describe, expect, it } from "vitest";
import { checkDeckTemplateFileValue } from "./deck-template-file.js";

const deck = (shape: Record<string, unknown>) => ({ format: "ziffr.deck-template/2", name: "Review", slots: [{ label: "Orders" }], slides: [{ shapes: [shape] }] });
const at = { x: 10, y: 10, w: 300 };

describe("{calculation note} in a Deck Template file", () => {
  it.each([
    ["text", { shape: "text", ...at, text: ["{calculation note}"] }],
    ["box", { shape: "box", ...at, h: 100, text: ["About {calculation note 1}"] }],
  ])("is refused in a %s shape, in words", (_kind, shape) => {
    const res = checkDeckTemplateFileValue(deck(shape));
    expect(res.ok ? "" : res.problems.map((p) => p.message).join(" ")).toMatch(/only in widgets and Slide Elements/);
  });

  it.each([
    ["a widget's words", { shape: "widget", view: "number", slots: [0], ...at, h: 200, title: "{calculation note}", settings: { headline: "{calculation note}" } }],
    ["a Slide Element", { shape: "element", ...at, h: 200, slots: [0], element: { kind: "words", text: ["{calculation note}"] } }],
  ])("is allowed in %s", (_what, shape) => {
    expect(checkDeckTemplateFileValue(deck(shape))).toMatchObject({ ok: true });
  });

  it("leaves the other Placeholders of a text shape as they were", () => {
    expect(checkDeckTemplateFileValue(deck({ shape: "text", ...at, text: ["{metric} {latest} {target 2}"] })).ok).toBe(true);
  });
});
