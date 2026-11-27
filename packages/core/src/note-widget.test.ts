// A Note Widget's words (GLOSSARY: Note Widget): limits, the characters taken out, paragraphs and lists, the room it
// takes on a phone, and what keeps it out of templates and the demo's open words.
import { describe, expect, it } from "vitest";
import { cleanNoteHeading, cleanNoteText, noteBlocks, noteRows, NOTE_HEADING_MAX, NOTE_LINES_MAX, NOTE_TEXT_MAX } from "./note-widget";
import { SETTING_WORDS, mapSettingsWords } from "./sealed-words";
import { toDashboardTemplate, toDeckTemplate } from "./team-templates";
import { OFFERED_TEMPLATES, TEMPLATES, templatesFor } from "./widget-templates";
import type { SlideShape, Widget } from "./types";

const text = (raw: unknown) => { const r = cleanNoteText(raw); if (!r.ok) throw new Error(r.problem); return r.text; };
const heading = (raw: unknown) => { const r = cleanNoteHeading(raw); if (!r.ok) throw new Error(r.problem); return r.text; };
// Characters nobody sees, written as numbers so none sits in this file.
const unseen = (...codes: number[]) => String.fromCharCode(...codes);

describe("a note's text", () => {
  it("keeps its lines, and takes out what shows nothing or turns the reading order around", () => {
    expect(text("One\r\nTwo\rThree" + unseen(0x2028) + "Four")).toBe("One\nTwo\nThree\nFour");
    expect(text(`a${unseen(0, 7, 27, 127, 0x202e, 0x2066, 0xfeff)}b\tc`)).toBe("ab c");
    expect(text("\n  \n  - first\n\nlast  \n\n")).toBe("  - first\n\nlast");
    expect(text("<img src=x onerror=alert(1)> [here](javascript:alert(1))")).toBe("<img src=x onerror=alert(1)> [here](javascript:alert(1))");
    expect(text(undefined)).toBe("");
    expect(text(null)).toBe("");
  });

  it("takes out every character other typed text refuses, but keeps the new line and whole characters", () => {
    // A soft hyphen, zero-width space and word joiner, the direction marks, both halves of a pair on their own, tag characters.
    const hidden = [0x00ad, 0x061c, 0x200b, 0x200e, 0x200f, 0x2060, 0xd800, 0xdc00, 0xe0000, 0xe0041, 0xe007f].map((c) => String.fromCodePoint(c));
    for (const c of hidden) {
      expect(text(`a${c}b\nc`)).toBe("ab\nc");
      expect(heading(`a${c}b`)).toBe("ab");
    }
    const emoji = String.fromCodePoint(0x1f600);
    expect(text(`Up ${emoji}\nDown`)).toBe(`Up ${emoji}\nDown`);
  });

  it("is refused when it is not words or too long", () => {
    for (const bad of [7, {}, ["a"], true]) expect(cleanNoteText(bad).ok).toBe(false);
    expect(text("x".repeat(NOTE_TEXT_MAX))).toHaveLength(NOTE_TEXT_MAX);
    expect(cleanNoteText("x".repeat(NOTE_TEXT_MAX + 1)).ok).toBe(false);
    expect(cleanNoteText(" ".repeat(NOTE_TEXT_MAX * 5)).ok).toBe(false);
    expect(cleanNoteText(Array(NOTE_LINES_MAX + 1).fill("x").join("\n")).ok).toBe(false);
  });
});

describe("a note's heading", () => {
  it("is one line within its limit", () => {
    expect(heading("  Why\n October \t dipped  ")).toBe("Why October dipped");
    expect(heading("x".repeat(NOTE_HEADING_MAX))).toHaveLength(NOTE_HEADING_MAX);
    expect(cleanNoteHeading("x".repeat(NOTE_HEADING_MAX + 1)).ok).toBe(false);
    expect(cleanNoteHeading({}).ok).toBe(false);
    expect(heading(null)).toBe("");
  });
});

describe("paragraphs and lists", () => {
  it("reads bullet and numbered lines as lists, and keeps line breaks in a paragraph", () => {
    expect(noteBlocks("Why it dipped:\nin two words\n- price\n* weather\n• staff\n\n3. call\n4) write\nthen wait")).toEqual([
      { kind: "text", lines: ["Why it dipped:", "in two words"] },
      { kind: "list", ordered: false, start: 1, items: ["price", "weather", "staff"] },
      { kind: "list", ordered: true, start: 3, items: ["call", "write"] },
      { kind: "text", lines: ["then wait"] },
    ]);
    expect(noteBlocks("")).toEqual([]);
    // Not lists: a number at the start of a sentence, a dash without a space, a negative number.
    expect(noteBlocks("2026 was good\n-3 % on last year")).toEqual([{ kind: "text", lines: ["2026 was good", "-3 % on last year"] }]);
  });
});

describe("the room a note takes on a phone", () => {
  it("grows with its words and leaves room to write", () => {
    expect(noteRows(null, "Short.", false)).toBe(3);
    expect(noteRows(null, "Short.", true)).toBe(8);
    expect(noteRows(null, "word ".repeat(100), true)).toBeGreaterThan(noteRows(null, "word ".repeat(100), false));
    expect(noteRows("A heading", "word ".repeat(100), false)).toBeGreaterThan(6);
    expect(noteRows(null, "x\n".repeat(500), false)).toBe(60);
  });
});

describe("where a note goes", () => {
  const note = { template: "note", metric_ids: [], settings: { note: "Secret reason" }, title: "Why", x: 0, y: 0, w: 4, h: 5 } as unknown as Widget;

  it("is a widget with no Metric, offered by itself and never as a way to draw one", () => {
    expect(TEMPLATES.note.slots).toEqual([]);
    expect(OFFERED_TEMPLATES.map((t) => t.id)).not.toContain("note");
    for (const hasBreakdown of [true, false]) expect(templatesFor(hasBreakdown).map((t) => t.id)).not.toContain("note");
  });

  it("has its text sealed as other widget words are", () => {
    expect(SETTING_WORDS).toContain("note");
    expect(mapSettingsWords(note.settings, (column, t) => `${column}=${t}`)).toEqual({ note: "settings.note=Secret reason" });
  });

  it("stays out of a Dashboard Template, which says so", () => {
    const t = toDashboardTemplate([note, { ...note, title: null } as Widget], []);
    expect(t.body.widgets).toEqual([]);
    expect(t.leftOut).toEqual(["Why", "A note widget"]);
    expect(JSON.stringify(t.body)).not.toContain("Secret");
  });

  it("stays out of a Deck Template, which says so", () => {
    const shape = { type: "ziffr-widget", x: 0, y: 0, rotation: 0, opacity: 1, props: { template: "note", metricIds: [], settings: JSON.stringify(note.settings), title: "Why", w: 100, h: 100 } } as SlideShape;
    const t = toDeckTemplate([[shape]], [], {});
    expect(t.body.slides[0].shapes).toEqual([]);
    expect(t.notices).toEqual(["Note widgets are left out: a template keeps no notes."]);
    expect(JSON.stringify(t.body)).not.toContain("Secret");
  });
});
