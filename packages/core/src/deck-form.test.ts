// The forms of a deck's stored slides and what may become of a Deck Description (GLOSSARY: Deck, Deck Description;
// spec 0069), without a database: what opens nothing, what a form may change and which slides a new deck gets.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DECK_DESCRIPTION_LIMITS } from "@ziffr/pack/deck-description";
import { Forbidden, Refused } from "./actor";
import { changedDescription, clearedDescription, describedFrom, type DeckChange } from "./deck-edits";
import { describedDeck, madeRestoreProblem } from "./deck-form";
import { allDeckMetricIds, deckMetricIds } from "./visibility";

const made = vi.hoisted(() => ({ on: true }));
vi.mock("./made-decks-on", () => ({ get MADE_DECKS_ON() { return made.on; } }));
beforeEach(() => { made.on = true; });

const by = { sees: () => true, words: (text: string) => text, today: "2026-12-01" };
const chart = (d: ReturnType<typeof describedFrom>) => d.slides.find((s) => s.type === "chart")!;
const answered = (text: string) => ({ slides: [{ id: "sl_3", answers: [{ question: "Why?", text }] }] });

describe("a deck's stored slides", () => {
  it("opens the Metrics a description lists, hidden slides included", () => {
    const d = describedFrom([1, 2]);
    d.slides.filter((s) => s.metrics.length).forEach((s) => { s.hidden = true; });
    expect(deckMetricIds(d)).toEqual([1, 2]);
    expect(allDeckMetricIds(d)).toEqual([1, 2]);
  });

  it("opens nothing of a form no reader knows, nor of any description while made decks are off", () => {
    const unknown = { ...describedFrom([1]), format: "ziffr.deck/2" };
    // What the slide editor's reader would take for a Widget is not read either.
    const crafted = { format: "x", store: { "shape:a": { typeName: "shape", type: "metricWidget", props: { metricIds: [1] } } } };
    for (const d of [unknown, crafted, { format: "ziffr.deck/1", slides: [{ metrics: [1] }] }]) expect(deckMetricIds(d)).toEqual([]);
    made.on = false;
    expect(describedDeck(describedFrom([1]))).toBeNull();
    expect(deckMetricIds(describedFrom([1]))).toEqual([]);
  });

  it("leaves the slide editor's forms to their readers", () => {
    for (const d of [null, {}, { store: {} }, { importSeed: [] }]) expect(describedDeck(d)).toBeUndefined();
  });

  it("brings back a Version only for someone who sees every Metric of it and of the deck as stored", () => {
    const now = describedFrom([1]), then = describedFrom([2]);
    expect(madeRestoreProblem(now, then, new Set([1, 2]))).toBeNull();
    expect(madeRestoreProblem(now, then, new Set([1]))).toBe("hidden");
    expect(madeRestoreProblem(now, then, new Set([2]))).toBe("hidden");
    expect(madeRestoreProblem(now, { store: {} }, new Set([1]))).toBe("unreadable");
    expect(madeRestoreProblem({ store: {} }, then, new Set([2]))).toBe("unreadable");
  });
});

describe("the slides made from a list of Metrics", () => {
  it("lists every Metric in the table and the definitions, within the slides a deck takes", () => {
    const ids = Array.from({ length: 30 }, (_, i) => i + 1);
    const d = describedFrom(ids);
    expect(d.slides.length).toBeLessThanOrEqual(DECK_DESCRIPTION_LIMITS.slides);
    expect(d.slides[0].type).toBe("cover");
    expect(d.slides.at(-1)!.type).toBe("about");
    for (const type of ["table", "definitions"]) expect(d.slides.filter((s) => s.type === type).flatMap((s) => s.metrics)).toEqual(ids);
  });

  it("takes the most Metrics it says it takes, and no more", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    expect(() => describedFrom(ids(216))).not.toThrow();
    expect(() => describedFrom(ids(217))).toThrow(Refused);
    expect(() => describedFrom([])).toThrow(Refused);
  });
});

describe("a form's change to a made deck", () => {
  it("names no Metric and no slide type", () => {
    const d = describedFrom([1]);
    for (const change of [{ slides: [{ id: "sl_3", metrics: [2] }] }, { slides: [{ id: "sl_3", type: "table" }] }, { format: "x" }]) {
      expect(() => changedDescription(d, change as DeckChange, by)).toThrow(Refused);
    }
  });

  it("refuses an unseen slide and a slide the deck does not have alike", () => {
    const d = describedFrom([1]);
    const unseen = { ...by, sees: () => false };
    expect(() => changedDescription(d, { slides: [{ id: "sl_3", hidden: true }] }, unseen)).toThrow(Forbidden);
    expect(() => changedDescription(d, { slides: [{ id: "sl_99", hidden: true }] }, by)).toThrow(Forbidden);
  });

  it("dates answers itself and keeps the day of words that stand", () => {
    const first = changedDescription(describedFrom([1]), answered("Two people left."), by);
    expect(chart(first).answers[0].writtenOn).toBe("2026-12-01");
    const later = changedDescription(first, answered("Two people left."), { ...by, today: "2026-12-08" });
    expect(chart(later).answers[0].writtenOn).toBe("2026-12-01");
    expect(chart(changedDescription(later, answered("  "), by)).answers[0]).toEqual({ question: "Why?", text: "", writtenOn: null });
    expect(() => changedDescription(first, { slides: [{ id: "sl_3", answers: [{ question: "Why?", text: "a", writtenOn: "2020-01-01" } as never] }] }, by)).toThrow(Refused);
  });

  it("clears the answers on the slides the writer is sent, and leaves the questions", () => {
    const d = changedDescription(describedFrom([1]), answered("Two people left."), by);
    expect(chart(clearedDescription(d, () => false)).answers[0].text).toBe("Two people left.");
    expect(chart(clearedDescription(d, () => true)).answers[0]).toEqual({ question: "Why?", text: "", writtenOn: null });
  });
});
