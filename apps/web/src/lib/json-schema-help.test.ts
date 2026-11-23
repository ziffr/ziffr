// The help while typing a View Design: fields and values from the format's schema, and what a field means.
import { describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS } from "@ziffr/core/built-in-designs";
import { VIEW_DESIGN_SCHEMA, writeViewDesign } from "@ziffr/core/view-design";
import { completionsAt, hoverAt } from "./json-schema-help";

const at = (text: string) => {
  const pos = text.indexOf("|");
  return { text: text.replace("|", ""), pos };
};
const labels = (text: string) => {
  const t = at(text);
  return completionsAt(VIEW_DESIGN_SCHEMA, t.text, t.pos)?.items.map((i) => i.label) ?? null;
};

describe("completions", () => {
  it("offers the fields of the file that are not there yet", () => {
    const l = labels('{\n  "format": "ziffr.view/1",\n  "|"\n}');
    expect(l).toContain("name");
    expect(l).toContain("parts");
    expect(l).not.toContain("format");
  });

  it("offers the fields of the mark that is named, and only its", () => {
    const l = labels('{"parts": [{"mark": "plot", |}]}');
    expect(l).toContain("axes");
    expect(l).toContain("marks");
    expect(l).not.toContain("direction");
  });

  it("offers the values a field allows", () => {
    const l = labels('{"parts": [{"mark": "plot", "axes": "none", "marks": [{"mark": "line", "show": "values", "tone": |}]}]}');
    expect(l).toContain('muted');
    expect(l).toContain('status');
  });

  it("offers the values of a half-typed string, replacing it", () => {
    const t = at('{"parts": [{"mark": "plot", "axes": "no|"}]}');
    const found = completionsAt(VIEW_DESIGN_SCHEMA, t.text, t.pos);
    expect(found?.items.map((i) => i.label)).toEqual(expect.arrayContaining(["none", "compact", "regular"]));
    expect(t.text.slice(found!.from, found!.to)).toBe('"no"');
  });

  it("offers the marks of a part", () => {
    expect(labels('{"parts": [{"mark": |}]}')).toEqual(expect.arrayContaining(['text', 'plot', 'gauge']));
  });

  it("offers nothing for free text, and never fails on broken text", () => {
    expect(labels('{"name": "|"}')).toBeNull();
    for (const broken of ['{"parts": [{"mark": "plot", "marks": [{|', '{"a" |', "|", "[[[", '{"parts": [|'])
      expect(() => labels(broken)).not.toThrow();
  });
});

describe("hover", () => {
  it("says what a field is, in the schema's words, and its values", () => {
    const text = writeViewDesign(BUILT_IN_DESIGNS.line);
    const h = hoverAt(VIEW_DESIGN_SCHEMA, text, text.indexOf('"tone"') + 2);
    expect(h?.text).toContain("Theme colour");
    expect(h?.text).toContain("Allowed:");
  });

  it("answers for a value as for its field", () => {
    const text = writeViewDesign(BUILT_IN_DESIGNS.line);
    const h = hoverAt(VIEW_DESIGN_SCHEMA, text, text.indexOf('"muted"') + 2);
    expect(h?.text).toContain("Theme colour");
  });

  it("is quiet where the schema says nothing", () => {
    expect(hoverAt(VIEW_DESIGN_SCHEMA, '{"nonsense": 1}', 3)).toBeNull();
  });
});
