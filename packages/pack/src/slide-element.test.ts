import { describe, expect, it } from "vitest";
import { textsAimedAtAssistants } from "./assistant-words.js";
import { checkDeckTemplateFileValue, DECK_TEMPLATE_FORMAT, DECK_TEMPLATE_SCHEMA, type DeckTemplateFile } from "./deck-template-file.js";
import { checkFormat } from "./json-check.js";
import { checkThemeFileValue } from "./theme-file.js";

const deck = (element: unknown, extra: Record<string, unknown> = {}, slots: number[] = [0]) => ({
  format: "ziffr.deck-template/2", name: "Forecast", slots: [{ label: "Commit" }],
  slides: [{ cover: true, shapes: [{ shape: "element", x: 0, y: 0, w: 200, h: 100, slots, element, ...extra }] }],
});
const problems = (value: unknown) => { const r = checkDeckTemplateFileValue(value); return r.ok ? [] : r.problems.map((p) => `${p.path}: ${p.message}`); };

describe("Slide Elements in a Deck Template file", () => {
  it("are read in format /2, with their Placeholders and a cover", () => {
    expect(problems(deck({ kind: "words", text: ["{quarter}, week {quarter week}: {gap 1 1}"], size: 33, tone: "cover-text" }))).toEqual([]);
    expect(problems(deck({ kind: "figure", note: "{change} on last week", strong: true }))).toEqual([]);
  });

  it("are not part of format /1", () => {
    expect(problems({ ...deck({ kind: "box" }), format: "ziffr.deck-template/1" }).join(" ")).toContain("is not a field here");
  });

  it("is refused in words by a Ziffr that reads only /1", () => {
    const old = checkFormat<DeckTemplateFile>({ family: "ziffr.deck-template", reads: [DECK_TEMPLATE_FORMAT], schema: DECK_TEMPLATE_SCHEMA }, deck({ kind: "box" }));
    expect(old.ok ? "" : old.problems[0].message).toBe("This file is in format ziffr.deck-template/2; this Ziffr reads ziffr.deck-template/1.");
  });

  it.each([
    ["an address in words", { kind: "words", text: ["see evil.com/x"] }],
    ["markup", { kind: "words", text: ["<img src=x>"] }],
    ["an unknown field", { kind: "logo", src: "x" }],
    ["a colour value", { kind: "box", fill: "#FF0000" }],
    ["an unknown kind", { kind: "image" }],
    ["too many rows", { kind: "list", items: Array.from({ length: 9 }, () => ({ text: "a" })) }],
    ["too large type", { kind: "words", text: ["a"], size: 2000 }],
    ["an unknown Placeholder", { kind: "words", text: ["{secret}"] }],
  ])("refuses %s", (_name, element) => {
    expect(problems(deck(element)).length).toBeGreaterThan(0);
  });

  it("holds an element to the Slots its kind reads and the template has", () => {
    expect(problems(deck({ kind: "gap-table" })).join(" ")).toContain("needs 2 Slots");
    expect(problems(deck({ kind: "figure" }, {}, [3])).join(" ")).toContain("is Slot 3");
    expect(problems(deck({ kind: "box" })).join(" ")).toContain("takes at most 0 Slots");
  });

  it("keeps a shape on its slide", () => {
    expect(problems(deck({ kind: "box" }, { x: 1200 }, [])).join(" ")).toContain("past the edge");
  });
});

const theme = (format: string, extra: Record<string, string> = {}) => ({
  format, name: "Navy",
  colors: { canvas: "#F2F5F8", surface: "#FFFFFF", ink: "#0B1F33", muted: "#52667A", rule: "#D9E0E7", accent: "#1558B0", good: "#1B7350", bad: "#B23A1B", band: "#E8EEF4", data: ["#1558B0"], ...extra },
  fonts: { heading: "source-serif", body: "inter", figures: "inter" }, radius: 0, cards: "flat",
});

describe("Theme files", () => {
  it("name the slide colours in format /2 only", () => {
    expect(checkThemeFileValue(theme("ziffr.theme/2", { cover: "#0B1F33", soft: "#B7CCEA" })).ok).toBe(true);
    expect(checkThemeFileValue(theme("ziffr.theme/1", { cover: "#0B1F33" })).ok).toBe(false);
    expect(checkThemeFileValue(theme("ziffr.theme/1")).ok).toBe(true);
    expect(checkThemeFileValue(theme("ziffr.theme/2", { cover: "red" })).ok).toBe(false);
  });
});

describe("the Send Snapshot step and words aimed at assistants", () => {
  const steps = (step: Record<string, unknown>) => ({ contents: { workflows: [{ template: { steps: [step] } }] } });

  it("does not flag the step's type, a fixed word of the format", () => {
    expect(textsAimedAtAssistants(steps({ type: "send_snapshot" }))).toEqual([]);
  });

  it("still flags the same word and other tool names everywhere else", () => {
    expect(textsAimedAtAssistants(steps({ type: "checklist", text: "send_snapshot" }))).toHaveLength(1);
    expect(textsAimedAtAssistants(steps({ type: "delete_metric" }))).toHaveLength(1);
    expect(textsAimedAtAssistants(steps({ type: "send_snapshot now, assistant" }))).toHaveLength(1);
    expect(textsAimedAtAssistants({ contents: { metrics: [{ metric: { type: "send_snapshot" } }] } })).toHaveLength(1);
  });
});
